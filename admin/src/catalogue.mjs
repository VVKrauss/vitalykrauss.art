import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { adminRoot } from './config.mjs';
import { ContentError, normalizeCatalogue, publicCatalogue } from './catalogue-model.mjs';
import { createMediaStore } from './media.mjs';

const empty = () => ({ heroWorkId: null, works: [], series: [], exhibitions: [] });

export async function createCatalogue(db, dataDirectory, config) {
  const media = await createMediaStore(db, dataDirectory);
  db.exec(`CREATE TABLE IF NOT EXISTS studio_catalogue (
    id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL,
    draft_json TEXT NOT NULL, published_json TEXT, published_at TEXT
  )`);
  const row = () => db.prepare('SELECT * FROM studio_catalogue WHERE id = 1').get();
  if (!row()) {
    let draft = empty(); let publishedAt = null;
    if (config.seedContent !== false) {
      const seed = JSON.parse(await readFile(join(adminRoot, 'seed/catalogue.json'), 'utf8'));
      for (const item of seed.media) {
        if (!media.record(item.id)) await media.ingest(join(adminRoot, 'seed/images', item.filename), item);
      }
      draft = normalizeCatalogue(seed.draft, media.list()); publishedAt = new Date().toISOString();
    }
    db.prepare('INSERT INTO studio_catalogue VALUES (1, 1, ?, ?, ?)').run(JSON.stringify(draft), publishedAt ? JSON.stringify(draft) : null, publishedAt);
  }
  function state() {
    const record = row();
    return { version: record.version, draft: JSON.parse(record.draft_json), publishedAt: record.published_at, media: media.list().map(media.describe) };
  }
  function save(version, draft) {
    if (!Number.isSafeInteger(version) || version < 1) throw new ContentError('Некорректная версия каталога.');
    const normalized = normalizeCatalogue(draft, media.list(), { draft: true });
    const result = db.prepare('UPDATE studio_catalogue SET draft_json = ?, version = version + 1 WHERE id = 1 AND version = ?').run(JSON.stringify(normalized), version);
    if (!result.changes) throw new ContentError('Каталог уже изменён в другой вкладке. Перезагрузите данные перед сохранением.', 409);
    return state();
  }
  function publish(version, submittedDraft) {
    if (!Number.isSafeInteger(version) || version < 1) throw new ContentError('Некорректная версия каталога.');
    const record = row();
    if (record.version !== version) throw new ContentError('Каталог изменён в другой вкладке. Ваши правки не перезаписаны; откройте актуальную версию каталога.', 409);
    const draft = normalizeCatalogue(submittedDraft ?? JSON.parse(record.draft_json), media.list());
    db.prepare('UPDATE studio_catalogue SET draft_json = ?, published_json = ?, published_at = ?, version = version + 1 WHERE id = 1 AND version = ?').run(JSON.stringify(draft), JSON.stringify(draft), new Date().toISOString(), version);
    return state();
  }
  function deleteArchived(version, submittedDraft, kind, id) {
    if (!['works','series','exhibitions'].includes(kind) || typeof id !== 'string') throw new ContentError('Некорректная запись для удаления.');
    if (!Number.isSafeInteger(version) || version < 1) throw new ContentError('Некорректная версия каталога.');
    const record = row();
    if (record.version !== version) throw new ContentError('Каталог изменён в другой вкладке. Удаление не выполнено.',409);
    const draft = normalizeCatalogue(submittedDraft ?? JSON.parse(record.draft_json),media.list(),{draft:true});
    const item = draft[kind].find(entry=>entry.id===id);
    if (!item) throw new ContentError('Запись не найдена.',404);
    if (item.archived !== true) throw new ContentError('Окончательно удалить можно только запись из архива.');
    const published = record.published_json ? JSON.parse(record.published_json) : null;
    const candidates = kind === 'works' ? new Set([item.mediaId,published?.works.find(w=>w.id===id)?.mediaId].filter(Boolean)) : new Set();
    const remove = document => {
      if(!document)return;
      document[kind]=document[kind].filter(entry=>entry.id!==id);
      if(kind==='works') {
        if(document.heroWorkId===id)document.heroWorkId=null;
        document.exhibitions.forEach(exhibition=>{exhibition.workIds=exhibition.workIds.filter(workId=>workId!==id);});
      }
      if(kind==='series')document.works.forEach(work=>{if(work.seriesId===id)work.seriesId=null;});
    };
    remove(draft);remove(published);
    const unused=[...candidates].filter(mediaId=>![draft,published].some(document=>document?.works.some(work=>work.mediaId===mediaId))).map(media.record).filter(Boolean);
    db.exec('BEGIN IMMEDIATE');
    try {
      const result=db.prepare('UPDATE studio_catalogue SET draft_json = ?, published_json = ?, published_at = ?, version = version + 1 WHERE id = 1 AND version = ?')
        .run(JSON.stringify(draft),published ? JSON.stringify(published) : null,published ? new Date().toISOString() : null,version);
      if(!result.changes)throw new ContentError('Каталог изменён. Удаление не выполнено.',409);
      unused.forEach(image=>media.forget(image.id));
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    let cleanupWarning=false;
    for(const image of unused){try{media.eraseFiles(image);}catch{cleanupWarning=true;console.error('Deleted artwork file cleanup failed; private media is no longer accessible.');}}
    return {...state(),...(cleanupWarning ? {cleanupWarning:'Запись удалена. Часть файлов требует очистки на сервере; доступ к ним закрыт.'} : {})};
  }
  function published() {
    const record = row();
    if (!record.published_json) throw new ContentError('Каталог ещё не опубликован.', 404);
    return publicCatalogue(JSON.parse(record.published_json), media.list(), config.baseURL, record.published_at);
  }
  function publicMedia(id) {
    const record = row();
    if (!record.published_json || !JSON.parse(record.published_json).works.some(item => !item.archived && item.mediaId === id)) throw new ContentError('Изображение не опубликовано.', 404);
  }
  function print(workId, sizeId) {
    const work = state().draft.works.find(item => item.id === workId);
    const size = work?.sizes.find(item => item.id === sizeId);
    if (!work || !size) throw new ContentError('Работа или размер не найдены.', 404);
    return media.print(work.mediaId, size);
  }
  return { state, save, publish, deleteArchived, published, publicMedia, media, print };
}
