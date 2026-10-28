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
