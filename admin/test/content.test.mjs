import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createServer } from 'node:http';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

async function fixture(t, seedContent = false) {
  const { createStudio } = await import('../src/studio.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'vk-content-'));
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  let studio;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    studio?.close(); await rm(dir, { recursive: true, force: true });
  });
  studio = await createStudio({ baseURL, ownerEmail: 'owner@example.test', secret: randomBytes(48).toString('base64url'), databasePath: join(dir, '.data/auth.sqlite'), production: false, seedContent });
  server.on('request', studio.app);
  await studio.provisionOwner('Content-test-password-123!');
  const login = await fetch(baseURL + '/api/auth/sign-in/email', { method: 'POST', headers: { origin: baseURL, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.test', password: 'Content-test-password-123!' }) });
  const cookie = login.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  assert.equal(login.status, 200);
  const req = (path, { method = 'GET', body, anonymous = false, origin = baseURL } = {}) => fetch(baseURL + path, {
    method, headers: { ...(anonymous ? {} : { cookie }), origin, ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });
  const upload = async (bytes, filename = 'poster.png') => {
    const form = new FormData(); form.append('file', new Blob([bytes]), filename);
    return req('/api/studio/media', { method: 'POST', body: form });
  };
  const save = (version, draft) => req('/api/studio/content', { method: 'PUT', body: { version, draft } });
  return { ...studio, req, upload, save, baseURL, dir: join(dir, '.data') };
}

const text = ru => ({ ru, en: '', es: '' });
const artwork = media => ({ id: 'work-new', title: text('Новая работа'), description: text('Описание'), year: '2026', seriesId: null, mediaId: media.id, maxWidthCm: 60, maxHeightCm: 30, sizes: [{ id: 'size-large', widthCm: 60, heightCm: 30, price: null }], archived: false });
const image = () => sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#b7bb92' } }).withMetadata({ density: 300 }).png().toBuffer();

test('existing catalogue is imported with all works, series, exhibition years and no sold state', async t => {
  const s = await fixture(t, true);
  const response = await s.req('/api/studio/content'); assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.draft.works.length, 10); assert.equal(data.draft.series.length, 2); assert.equal(data.draft.exhibitions.length, 3);
  assert.equal(data.draft.heroWorkId, 'snail');
  assert.equal(data.media.length, 10); assert.ok(data.media.every(m => !m.originalAvailable));
  const published = await (await s.req('/api/catalogue', { anonymous: true, origin: 'https://vitalykrauss.art' })).json();
  assert.equal(published.works.length, 10); assert.equal(published.exhibitions[0].startDate, '2026');
  assert.ok(!JSON.stringify(published).includes('original')); assert.ok(!JSON.stringify(published).includes('sold'));
});

test('anonymous content writes and uploads are denied before processing bodies', async t => {
  const s = await fixture(t);
  assert.equal((await s.req('/api/studio/content', { anonymous: true })).status, 401);
  assert.equal((await s.req('/api/studio/content', { method: 'PUT', body: {}, anonymous: true })).status, 401);
  assert.equal((await s.req('/api/studio/media', { method: 'POST', anonymous: true })).status, 401);
});

test('uploads preserve private originals, create lower-resolution metadata-free previews and reject SVG/non-images', async t => {
  const s = await fixture(t); const bytes = await image();
  const response = await s.upload(bytes); assert.equal(response.status, 201);
  const media = await response.json(); assert.equal(media.width, 2400); assert.equal(media.height, 1200); assert.equal(media.originalAvailable, true);
  const preview = await s.req(media.previewUrl); assert.equal(preview.status, 200);
  const metadata = await sharp(Buffer.from(await preview.arrayBuffer())).metadata(); assert.ok(metadata.width <= 1400); assert.equal(metadata.width / metadata.height, 2); assert.equal(metadata.exif, undefined);
  const original = await s.req(`/api/studio/media/${media.id}/original`); assert.equal(original.status, 200); assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
  assert.equal((await s.req(`/api/studio/media/${media.id}/original`, { anonymous: true })).status, 401);
  assert.equal((await s.req(`/media/${media.id}/web.webp`, { anonymous: true })).status, 404);
  assert.equal((await s.upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'pretend.png')).status, 400);
  assert.equal((await s.upload(Buffer.from('not an image'), 'poster.jpg')).status, 400);
});

test('drafts stay private until publish; conflicts do not overwrite; archive revokes public media', async t => {
  const s = await fixture(t); const media = await (await s.upload(await image())).json();
  let state = await (await s.req('/api/studio/content')).json();
  state.draft.works.push(artwork(media)); state.draft.heroWorkId = 'work-new';
  const saved = await s.save(state.version, state.draft); assert.equal(saved.status, 200); state = await saved.json();
  assert.equal((await s.req('/api/catalogue', { anonymous: true })).status, 404);
  assert.equal((await s.save(state.version - 1, state.draft)).status, 409);
  let publishedResponse = await s.req('/api/studio/publish', { method: 'POST', body: { version: state.version } }); assert.equal(publishedResponse.status, 200);
  state = await publishedResponse.json();
  let published = await (await s.req('/api/catalogue', { anonymous: true, origin: 'https://vitalykrauss.art' })).json();
  assert.equal(published.works.length, 1); assert.equal(published.works[0].sizes[0].price, null);
  assert.ok(published.works[0].image.startsWith(s.baseURL + '/media/'));
  const publicImage = await s.req(`/media/${media.id}/web.webp`, { anonymous: true });
  assert.equal(publicImage.status, 200);
  assert.match(publicImage.headers.get('cache-control'), /no-store/);
  state.draft.works[0].archived = true; state.draft.heroWorkId = null;
  state = await (await s.save(state.version, state.draft)).json();
  assert.equal((await (await s.req('/api/catalogue', { anonymous: true })).json()).works.length, 1);
  await s.req('/api/studio/publish', { method: 'POST', body: { version: state.version } });
  published = await (await s.req('/api/catalogue', { anonymous: true })).json(); assert.equal(published.works.length, 0);
  assert.equal((await s.req(`/media/${media.id}/web.webp`, { anonymous: true })).status, 404);
});

test('required names, dates, references, finite prices, max sizes and image proportions are enforced', async t => {
  const s = await fixture(t); const media = await (await s.upload(await image())).json();
  const state = await (await s.req('/api/studio/content')).json(); state.draft.works.push(artwork(media));
  for (const mutate of [
    d => { d.works[0].sizes[0].heightCm = 40; },
    d => { d.works[0].sizes[0].widthCm = 80; d.works[0].sizes[0].heightCm = 40; },
    d => { d.works[0].sizes[0].price = -1; },
    d => { d.works[0].seriesId = 'nonexistent'; },
    d => { d.heroWorkId = 'nonexistent'; },
    d => { d.works[0].archived = true; d.heroWorkId = 'work-new'; },
  ]) {
    const draft = structuredClone(state.draft); mutate(draft);
    assert.equal((await s.save(state.version, draft)).status, 400);
  }
  state.draft.works[0].maxHeightCm = 999;
  const good = await s.save(state.version, state.draft); assert.equal(good.status, 200);
  assert.equal((await good.json()).draft.works[0].maxHeightCm, 30);
});

test('exhibitions link existing works in multiple venues and archive independently', async t => {
  const s = await fixture(t); const media = await (await s.upload(await image())).json();
  let state = await (await s.req('/api/studio/content')).json(); state.draft.works.push(artwork(media));
  state.draft.exhibitions = ['London', 'Berlin'].map((city, i) => ({ id: `event-${i}`, title: text('Выставка'), description: text('Текст'), startDate: '2026-10-28', endDate: '', venue: text('Галерея'), city: text(city), workIds: ['work-new'], archived: false }));
  state = await (await s.save(state.version, state.draft)).json();
  state = await (await s.req('/api/studio/publish', { method: 'POST', body: { version: state.version } })).json();
  assert.equal((await (await s.req('/api/catalogue', { anonymous: true })).json()).exhibitions.length, 2);
  state.draft.exhibitions[0].archived = true; state = await (await s.save(state.version, state.draft)).json();
  await s.req('/api/studio/publish', { method: 'POST', body: { version: state.version } });
  const published = await (await s.req('/api/catalogue', { anonymous: true })).json(); assert.equal(published.exhibitions.length, 1); assert.equal(published.works.length, 1);
});

test('private print export shrinks for size without enlarging and requires owner', async t => {
  const s = await fixture(t); const media = await (await s.upload(await image())).json(); let state = await (await s.req('/api/studio/content')).json();
  const work = artwork(media); work.sizes.push({ id: 'small', widthCm: 10, heightCm: 5, price: 20 }); state.draft.works.push(work);
  await s.save(state.version, state.draft);
  const path = '/api/studio/works/work-new/print/small'; assert.equal((await s.req(path, { anonymous: true })).status, 401);
  const response = await s.req(path); assert.equal(response.status, 200);
  const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata(); assert.ok(metadata.width < 2400); assert.ok(Math.abs(metadata.width / metadata.height - 2) < .01);
});

test('disconnecting an upload does not release its processing lock until image cleanup completes', async t => {
  const s = await fixture(t);
  const ingest = s.catalogue.media.ingest;
  let started, release, finished;
  const entered = new Promise(resolve => { started = resolve; });
  const hold = new Promise(resolve => { release = resolve; });
  const complete = new Promise(resolve => { finished = resolve; });
  s.catalogue.media.ingest = async (...args) => { started(); await hold; try { return await ingest(...args); } finally { finished(); } };
  const controller = new AbortController();
  const form = new FormData(); form.append('file', new Blob([await image()]), 'disconnect.png');
  // Authenticate a second request using the existing fixture's session-cookie response.
  const login = await s.req('/api/auth/sign-in/email', { method: 'POST', body: { email: 'owner@example.test', password: 'Content-test-password-123!' } });
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const first = fetch(s.baseURL + '/api/studio/media', { method: 'POST', headers: { cookie, origin: s.baseURL }, body: form, signal: controller.signal }).catch(() => null);
  await entered; controller.abort(); await first;
  await new Promise(resolve => setImmediate(resolve));
  let second;
  try {
    const bytes = await image();
    second = s.upload(bytes);
    const response = await Promise.race([second, new Promise(resolve => setTimeout(() => resolve(null), 1500))]);
    assert.equal(response?.status, 429);
  } finally {
    release(); await complete; await second?.catch(() => {});
    for (let i = 0; i < 100 && (await readdir(join(s.dir, 'media/incoming'))).length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  }
});

test('maximum size is first and included in the same size-count limit', async t => {
  const s = await fixture(t); const media = await (await s.upload(await image())).json();
  const state = await (await s.req('/api/studio/content')).json(); const work = artwork(media);
  work.sizes = [{ id: 'small', widthCm: 20, heightCm: 10, price: 12.50 }]; state.draft.works.push(work);
  const saved = await (await s.save(state.version, state.draft)).json();
  assert.equal(saved.draft.works[0].sizes[0].widthCm, 60); assert.equal(saved.draft.works[0].sizes[0].price, null);
  const draft = structuredClone(saved.draft); draft.works[0].sizes = Array.from({ length: 50 }, (_, i) => ({ id: 'size-' + i, widthCm: i + 1, heightCm: (i + 1) / 2, price: null }));
  assert.equal((await s.save(saved.version, draft)).status, 400);
});

test('publish atomically saves current edits without a preliminary draft save', async t => {
  const s = await fixture(t); const media = await (await s.upload(await image())).json();
  const initial = await (await s.req('/api/studio/content')).json();
  initial.draft.works.push(artwork(media));
  const response = await s.req('/api/studio/publish', {method:'POST',body:{version:initial.version,draft:initial.draft}});
  assert.equal(response.status,200); const saved=await response.json();
  assert.equal(saved.draft.works.length,1);
  assert.equal((await (await s.req('/api/catalogue',{anonymous:true})).json()).works.length,1);
  const stale = await s.req('/api/studio/publish',{method:'POST',body:{version:initial.version,draft:{...initial.draft,works:[]}}});
  assert.equal(stale.status,409);
  assert.equal((await (await s.req('/api/catalogue',{anonymous:true})).json()).works.length,1);
});

test('unfinished draft saves and reloads, while invalid publication preserves the last public snapshot', async t => {
  const s = await fixture(t); const media = await (await s.upload(await image())).json();
  let state = await (await s.req('/api/studio/content')).json(); state.draft.works.push(artwork(media));
  state=await (await s.req('/api/studio/publish',{method:'POST',body:{version:state.version,draft:state.draft}})).json();
  state.draft.works[0].title=text('');
  state.draft.exhibitions.push({id:'unfinished',title:text(''),description:text(''),startDate:'',endDate:'',venue:text(''),city:text(''),workIds:[],archived:false});
  const response=await s.save(state.version,state.draft); assert.equal(response.status,200); state=await response.json();
  assert.equal(state.draft.works[0].title.ru,'');
  assert.equal((await (await s.req('/api/studio/content')).json()).draft.exhibitions.length,1);
  assert.equal((await s.req('/api/studio/publish',{method:'POST',body:{version:state.version,draft:state.draft}})).status,400);
  assert.equal((await (await s.req('/api/catalogue',{anonymous:true})).json()).works[0].title.ru,'Новая работа');
});

test('permanent deletion requires an archived item, clears all links and removes unshared media', async t => {
  const s=await fixture(t);const m=await (await s.upload(await image())).json();let state=await (await s.req('/api/studio/content')).json();
  state.draft.works.push(artwork(m));state.draft.heroWorkId='work-new';
  state.draft.series.push({id:'series-delete',title:text('Серия'),description:text(''),collaborator:'',archived:false});state.draft.works[0].seriesId='series-delete';
  state.draft.exhibitions.push({id:'event-delete',title:text('Выставка'),description:text(''),startDate:'2026',endDate:'',venue:text(''),city:text(''),workIds:['work-new'],archived:false});
  state=await (await s.req('/api/studio/publish',{method:'POST',body:{version:state.version,draft:state.draft}})).json();
  const remove=(kind,id,anonymous=false)=>s.req('/api/studio/delete',{method:'POST',anonymous,body:{version:state.version,draft:state.draft,kind,id}});
  assert.equal((await remove('works','work-new',true)).status,401);
  assert.equal((await s.req('/api/studio/delete',{method:'POST',origin:'https://evil.example',body:{version:state.version,draft:state.draft,kind:'works',id:'work-new'}})).status,403);
  assert.equal((await remove('__proto__','work-new')).status,400);
  assert.equal((await remove('works','work-new')).status,400);
  const replacement=await (await s.upload(await image(),'replacement.png')).json();state.draft.works[0].mediaId=replacement.id;
  state.draft.works[0].archived=true;state.draft.heroWorkId=null;
  const response=await remove('works','work-new');assert.equal(response.status,200);state=await response.json();
  assert.equal(state.draft.works.length,0);assert.deepEqual(state.draft.exhibitions[0].workIds,[]);assert.equal(state.media.length,0);
  const published=await (await s.req('/api/catalogue',{anonymous:true})).json();assert.equal(published.works.length,0);assert.equal(published.heroWorkId,null);assert.deepEqual(published.exhibitions[0].workIds,[]);
  for(const folder of ['originals','web','thumb'])assert.deepEqual(await readdir(join(s.dir,'media',folder)),[]);
  state.draft.exhibitions[0].archived=true;state=await (await remove('exhibitions','event-delete')).json();assert.equal(state.draft.exhibitions.length,0);
  assert.equal((await (await s.req('/api/catalogue',{anonymous:true})).json()).exhibitions.length,0);
});

test('deleting an archived series keeps works and shared images; stale deletion never overwrites changes', async t=>{
 const s=await fixture(t);const m=await (await s.upload(await image())).json();let state=await (await s.req('/api/studio/content')).json();
 state.draft.series.push({id:'series-delete',title:text('Серия'),description:text(''),collaborator:'',archived:true});
 const work=artwork(m);work.seriesId='series-delete';work.archived=true;state.draft.works.push(work,{...artwork(m),id:'shared-work'});
 state=await (await s.req('/api/studio/publish',{method:'POST',body:{version:state.version,draft:state.draft}})).json();
 const previousVersion=state.version;
 state.draft.works[1].title=text('Несвязанные правки черновика');
 state=await (await s.req('/api/studio/delete',{method:'POST',body:{version:state.version,draft:state.draft,kind:'series',id:'series-delete'}})).json();
 assert.equal(state.draft.works[1].title.ru,'Несвязанные правки черновика');assert.equal(s.catalogue.published().works[0].title.ru,'Новая работа');
 assert.equal(state.draft.series.length,0);assert.equal(state.draft.works.length,2);assert.equal(state.draft.works[0].seriesId,null);
 assert.equal((await s.req('/api/studio/delete',{method:'POST',body:{version:previousVersion,draft:state.draft,kind:'works',id:work.id}})).status,409);
 state=await (await s.req('/api/studio/delete',{method:'POST',body:{version:state.version,draft:state.draft,kind:'works',id:work.id}})).json();
 assert.equal(state.draft.works.length,1);assert.equal(state.media.length,1);assert.equal((await s.req(m.previewUrl)).status,200);
});

test('exhibition photos and optional safe links persist, publish privately processed images, and respect archive/deletion',async t=>{
 const s=await fixture(t);const photo=await (await s.upload(await image(),'event-photo.png')).json();let state=await (await s.req('/api/studio/content')).json();
 state.draft.exhibitions.push({id:'photos-event',title:{en:'Exhibition',ru:'',es:''},description:text('Описание'),startDate:'2026-02-10',endDate:'',venue:text(''),city:text(''),workIds:[],mediaIds:[photo.id],url:'https://example.com/exhibition',archived:false});
 state=await (await s.save(state.version,state.draft)).json();assert.equal(state.draft.exhibitions[0].url,'https://example.com/exhibition');
 assert.equal((await s.req(`/media/${photo.id}/web.webp`,{anonymous:true})).status,404);
 state=await (await s.req('/api/studio/publish',{method:'POST',body:{version:state.version,draft:state.draft}})).json();
 let exhibition=(await (await s.req('/api/catalogue',{anonymous:true})).json()).exhibitions[0];
 assert.equal(exhibition.media.length,1);assert.equal(exhibition.url,'https://example.com/exhibition');assert.equal(exhibition.mediaIds,undefined);assert.equal((await s.req(`/media/${photo.id}/web.webp`,{anonymous:true})).status,200);
 state.draft.works.push({...artwork(photo),archived:true});
 state=await (await s.req('/api/studio/delete',{method:'POST',body:{version:state.version,draft:state.draft,kind:'works',id:'work-new'}})).json();assert.equal(state.media.length,1);assert.equal((await s.req(`/media/${photo.id}/web.webp`,{anonymous:true})).status,200);
 const invalid=structuredClone(state.draft);invalid.exhibitions[0].url='javascript:alert(1)';assert.equal((await s.save(state.version,invalid)).status,400);
 invalid.exhibitions[0].url='https://example.com';invalid.exhibitions[0].mediaIds=['missing'];assert.equal((await s.save(state.version,invalid)).status,400);
 state.draft.exhibitions[0].archived=true;state=await (await s.req('/api/studio/publish',{method:'POST',body:{version:state.version,draft:state.draft}})).json();
 assert.equal((await s.req(`/media/${photo.id}/web.webp`,{anonymous:true})).status,404);
 state=await (await s.req('/api/studio/delete',{method:'POST',body:{version:state.version,draft:state.draft,kind:'exhibitions',id:'photos-event'}})).json();assert.equal(state.media.length,0);
});

test('exhibition archive action persists only target visibility and keeps other edits private',async t=>{
 const s=await fixture(t,true);let state=await (await s.req('/api/studio/content')).json();const id=state.draft.exhibitions[0].id;
 const original=s.catalogue.published().works[0].title.ru;state.draft.works[0].title.ru='Private edit';
 const response=await s.req('/api/studio/exhibition-archive',{method:'POST',body:{version:state.version,draft:state.draft,id,archived:true}});assert.equal(response.status,200);state=await response.json();
 assert.equal(state.draft.exhibitions[0].archived,true);assert.equal(s.catalogue.published().exhibitions.length,2);assert.equal(s.catalogue.published().works[0].title.ru,original);assert.equal(state.draft.works[0].title.ru,'Private edit');
 assert.equal((await s.req('/api/studio/exhibition-archive',{method:'POST',body:{version:state.version-1,draft:state.draft,id,archived:false}})).status,409);
 const restored=await s.req('/api/studio/exhibition-archive',{method:'POST',body:{version:state.version,draft:state.draft,id,archived:false}});assert.equal(restored.status,200);assert.equal(s.catalogue.published().exhibitions.length,3);
 assert.equal((await s.req(`/exhibitions/${id}/edit`)).status,200);
});

test('series archive has separate edit routes and does not publish unrelated draft edits',async t=>{
 const s=await fixture(t,true);let state=await (await s.req('/api/studio/content')).json();const id=state.draft.series[0].id;const workTitle=s.catalogue.published().works[0].title.ru;state.draft.works[0].title.ru='Private series edit';
 const response=await s.req('/api/studio/entry-archive',{method:'POST',body:{version:state.version,draft:state.draft,kind:'series',id,archived:true}});assert.equal(response.status,200);state=await response.json();assert.equal(s.catalogue.published().series.length,1);assert.equal(s.catalogue.published().works[0].title.ru,workTitle);assert.equal(state.draft.works[0].title.ru,'Private series edit');assert.equal((await s.req(`/series/${id}/edit`)).status,200);
});

test('uploaded originals expose DPI and calculated centimetres with a 300 DPI fallback',async t=>{
 const s=await fixture(t);const pixels={create:{width:2400,height:1200,channels:3,background:'#659080'}};
 const explicit=await(await s.upload(await sharp(pixels).withMetadata({density:240}).png().toBuffer(),'Blue_green-01.png')).json();
 assert.equal(explicit.dpi,240);assert.equal(explicit.dpiSource,'metadata');assert.ok(Math.abs(explicit.printWidthCm-25.4)<.01);assert.ok(Math.abs(explicit.printHeightCm-12.7)<.01);
 const fallback=await(await s.upload(await sharp(pixels).png().toBuffer(),'Без_расширения-01.png')).json();assert.equal(fallback.dpi,300);assert.equal(fallback.dpiSource,'default');assert.ok(Math.abs(fallback.printWidthCm-20.32)<.01);assert.equal(fallback.filename,'Без_расширения-01.png');
 const preview=await sharp(Buffer.from(await(await s.req(explicit.previewUrl)).arrayBuffer())).metadata();assert.equal(preview.density,undefined);
});

test('DPI migration reads existing originals without changing existing media records',async t=>{
 const {DatabaseSync}=await import('node:sqlite');const {mkdir,writeFile}=await import('node:fs/promises');const {createMediaStore}=await import('../src/media.mjs');
 const dir=await mkdtemp(join(tmpdir(),'vk-legacy-dpi-'));const db=new DatabaseSync(':memory:');t.after(async()=>{db.close();await rm(dir,{recursive:true,force:true});});
 db.exec('CREATE TABLE studio_media (id TEXT PRIMARY KEY,filename TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,web_width INTEGER NOT NULL,web_height INTEGER NOT NULL,format TEXT NOT NULL,original_available INTEGER NOT NULL,created_at TEXT NOT NULL)');
 await mkdir(join(dir,'media','originals'),{recursive:true});await writeFile(join(dir,'media','originals','legacy.png'),await sharp({create:{width:2400,height:1200,channels:3,background:'#999999'}}).withMetadata({density:180}).png().toBuffer());
 db.prepare('INSERT INTO studio_media VALUES (?,?,?,?,?,?,?,?,?)').run('legacy','Original.png',2400,1200,1400,700,'png',1,'2026-01-01T00:00:00.000Z');
 const media=await createMediaStore(db,dir);assert.equal(media.record('legacy').dpi,180);assert.equal(media.record('legacy').filename,'Original.png');assert.equal(media.describe(media.record('legacy')).width,2400);assert.equal(media.list().length,1);
});

test('print export uses selected work DPI for smaller print variants',async t=>{
 const s=await fixture(t);const media=await(await s.upload(await image())).json();let state=await(await s.req('/api/studio/content')).json();const work=artwork(media);work.printDpi=150;work.sizes.push({id:'small-dpi',widthCm:10,heightCm:5,price:20});state.draft.works.push(work);const saved=await s.save(state.version,state.draft);assert.equal(saved.status,200);
 const response=await s.req('/api/studio/works/work-new/print/small-dpi');assert.equal(response.status,200);const info=await sharp(Buffer.from(await response.arrayBuffer())).metadata();assert.equal(info.width,Math.round(10/2.54*150));assert.equal(info.density,150);
});

test('series ordering and About draft publish preserve separate visibility', async t => {
 const s=await fixture(t,true);let data=s.catalogue.state();
 const group=data.draft.series[0];const ids=data.draft.works.filter(w=>w.seriesId===group.id).map(w=>w.id).reverse();group.workIds=ids;
 data.draft.about={name:{en:'Artist',ru:'Автор',es:''},role:{en:'Digital artist',ru:'',es:''},intro:{en:'New intro',ru:'',es:''},description:{en:'Biography',ru:'',es:''},email:'artist@example.test',avatarMediaId:null};
 let saved=await (await s.save(data.version,data.draft)).json();assert.deepEqual(saved.draft.series[0].workIds,ids);assert.notEqual(s.catalogue.published().about.name.en,'Artist');
 const response=await s.req('/api/studio/publish',{method:'POST',body:{version:saved.version,draft:saved.draft}});assert.equal(response.status,200);
 assert.deepEqual(s.catalogue.published().series[0].workIds,ids);assert.equal(s.catalogue.published().about.email,'artist@example.test');
});

test('public requests validate published variants, are idempotent and stay owner-only', async t => {
 const s=await fixture(t,true);const catalogue=s.catalogue.published(),work=catalogue.works.find(w=>w.sizes.some(v=>v.price));const variant=work.sizes.find(v=>v.price);
 const body={clientRequestId:'11111111-1111-4111-8111-111111111111',email:'buyer@example.test',name:'Buyer',note:'Please contact me',items:[{workId:work.id,variantId:variant.id,qty:2}],units:'in',lang:'en'};
 const submit=()=>s.req('/api/requests',{method:'POST',anonymous:true,body,origin:'https://vitalykrauss.art'});
 const first=await submit();assert.equal(first.status,201);assert.equal((await submit()).status,200);
 assert.equal((await s.req('/api/studio/requests',{anonymous:true})).status,401);
 const inbox=await (await s.req('/api/studio/requests')).json();assert.equal(inbox.unread,1);assert.equal(inbox.requests.length,1);const entry=inbox.requests[0];assert.equal(entry.email,body.email);assert.equal(entry.items[0].price,variant.price);assert.equal(entry.items[0].qty,2);assert.equal(entry.items[0].widthCm,variant.widthCm);assert.ok(entry.items[0].title.en);assert.ok(!JSON.stringify(entry).includes('original'));
 assert.equal((await s.req(`/api/studio/requests/${entry.id}`,{method:'PATCH',body:{read:true,status:'handled'}})).status,200);assert.equal((await (await s.req('/api/studio/requests')).json()).unread,0);
 body.clientRequestId='22222222-2222-4222-8222-222222222222';body.items[0].variantId='missing';assert.equal((await submit()).status,409);
 assert.equal((await s.req('/api/requests',{method:'POST',anonymous:true,body,origin:'https://evil.test'})).status,403);
 assert.equal((await s.req('/api/requests',{method:'POST',anonymous:true,body,origin:''})).status,403);
});

test('request rate limits, CORS, invalid data and price changes do not create inbox records', async t => {
 const s=await fixture(t,true);const catalogue=s.catalogue.published(),work=catalogue.works.find(w=>w.sizes.some(v=>v.price)),variant=work.sizes.find(v=>v.price);
 const body={email:'buyer@example.test',name:'<img src=x>',items:[{workId:work.id,variantId:variant.id,qty:1}],clientRequestId:'33333333-3333-4333-8333-333333333333'};
 const send=()=>s.req('/api/requests',{method:'POST',anonymous:true,body,origin:'https://vitalykrauss.art'});
 assert.equal((await s.req('/api/requests',{method:'OPTIONS',anonymous:true,origin:'https://vitalykrauss.art'})).headers.get('Access-Control-Allow-Origin'),'https://vitalykrauss.art');
 body.email='invalid';assert.equal((await send()).status,400);body.email='buyer@example.test';body.items[0].qty=0;assert.equal((await send()).status,400);body.items[0].qty=1;
 body.items[0].quotedPrice=variant.price+1;assert.equal((await send()).status,409);delete body.items[0].quotedPrice;
 for(let i=0;i<5;i++){body.clientRequestId=`44444444-4444-4444-8444-${String(i).padStart(12,'0')}`;assert.equal((await send()).status,201);}
 body.clientRequestId='55555555-5555-4555-8555-555555555555';const limited=await send();assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('Retry-After'))>0);
 const inbox=await (await s.req('/api/studio/requests')).json();assert.equal(inbox.requests.length,5);
 assert.equal((await s.req('/api/studio/requests/'+inbox.requests[0].id,{method:'PATCH',anonymous:true,body:{read:true}})).status,401);
 assert.equal((await s.req('/api/studio/requests/'+inbox.requests[0].id,{method:'PATCH',body:{status:'invented'}})).status,400);
});

test('About avatar stays private until publication and cannot be deleted with an archived work', async t => {
 const s=await fixture(t);const uploaded=await (await s.upload(await image())).json();let data=s.catalogue.state();data.draft.about.avatarMediaId=uploaded.id;data.draft.works=[{...artwork(uploaded),archived:true}];
 const saved=await (await s.save(data.version,data.draft)).json();assert.equal((await s.req(`/media/${uploaded.id}/web.webp`,{anonymous:true})).status,404);
 const published=await (await s.req('/api/studio/publish',{method:'POST',body:{version:saved.version,draft:saved.draft}})).json();assert.equal((await s.req(`/media/${uploaded.id}/web.webp`,{anonymous:true})).status,200);
 const result=await s.req('/api/studio/delete',{method:'POST',body:{version:published.version,draft:published.draft,kind:'works',id:'work-new'}});assert.equal(result.status,200);assert.ok(s.catalogue.media.record(uploaded.id));assert.equal((await s.req(`/media/${uploaded.id}/web.webp`,{anonymous:true})).status,200);
});

test('request errors expose stable localization codes without requiring a server locale',async t=>{
 const s=await fixture(t,true);const published=s.catalogue.published(),work=published.works.find(w=>w.sizes.some(v=>v.price)),variant=work.sizes.find(v=>v.price);
 const body={clientRequestId:'66666666-6666-4666-8666-666666666666',email:'invalid',items:[{workId:work.id,variantId:variant.id,qty:1}]};
 const send=()=>s.req('/api/requests',{method:'POST',body,anonymous:true,origin:'https://vitalykrauss.art'});
 assert.equal((await (await send()).json()).code,'email');body.email='buyer@example.test';body.items[0].quotedPrice=variant.price+1;assert.equal((await (await send()).json()).code,'priceChanged');
 const forbidden=await s.req('/api/requests',{method:'POST',body,anonymous:true,origin:'https://evil.test'});assert.equal((await forbidden.json()).code,'forbidden');
});

test('exhibition country saves and publishes translations with legacy records supported',async t=>{
 const s=await fixture(t,true);let state=s.catalogue.state();assert.equal(state.draft.exhibitions[0].country.en,'');state.draft.exhibitions[0].country={en:'Germany',ru:'Германия',es:'Alemania'};
 const saved=await (await s.save(state.version,state.draft)).json();assert.equal(saved.draft.exhibitions[0].country.ru,'Германия');s.catalogue.publish(saved.version,saved.draft);assert.equal(s.catalogue.published().exhibitions[0].country.es,'Alemania');
 const published=s.catalogue.published(),work=published.works.find(w=>w.sizes.some(size=>size.price)),size=work.sizes.find(size=>size.price);
 state=s.catalogue.state();state.draft.exhibitions[0].workIds=[work.id];s.catalogue.publish(state.version,state.draft);
 const response=await s.req('/api/requests',{method:'POST',anonymous:true,origin:'https://vitalykrauss.art',body:{clientRequestId:'77777777-7777-4777-8777-777777777777',email:'buyer@example.test',items:[{workId:work.id,variantId:size.id,qty:1}]}});assert.equal(response.status,201);
 const inbox=await (await s.req('/api/studio/requests')).json();assert.equal(inbox.requests[0].items[0].exhibitions[0].country.en,'Germany');

});
