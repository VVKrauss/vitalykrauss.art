import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, copyFile, unlink, chmod } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { unlinkSync } from 'node:fs';
import { ContentError } from './catalogue-model.mjs';

sharp.cache(false);
sharp.concurrency(1);
const imageOptions = { limitInputPixels: 100_000_000, animated: false, failOn: 'error' };
const formats = new Set(['jpeg', 'png', 'webp', 'tiff', 'avif', 'heif']);

export async function createMediaStore(db, dataDirectory) {
  const root = join(dataDirectory, 'media');
  for (const name of ['originals', 'web', 'thumb', 'incoming']) await mkdir(join(root, name), { recursive: true, mode: 0o700 });
  db.exec(`CREATE TABLE IF NOT EXISTS studio_media (
    id TEXT PRIMARY KEY, filename TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
    web_width INTEGER NOT NULL, web_height INTEGER NOT NULL, format TEXT NOT NULL,
    original_available INTEGER NOT NULL, created_at TEXT NOT NULL
  )`);
  function record(id) { return db.prepare('SELECT * FROM studio_media WHERE id = ?').get(id); }
  function list() { return db.prepare('SELECT * FROM studio_media ORDER BY created_at, id').all(); }
  function describe(row) {
    return { id: row.id, filename: row.filename, width: row.width, height: row.height, originalAvailable: Boolean(row.original_available),
      previewUrl: `/api/studio/media/${row.id}/web.webp`, thumbnailUrl: `/api/studio/media/${row.id}/thumb.webp` };
  }
  function path(id, variant) {
    const row = record(id);
    if (!row) throw new ContentError('Изображение не найдено.', 404);
    if (variant === 'original') {
      if (!row.original_available) throw new ContentError('Для этой работы пока загружена только копия для сайта. Загрузите оригинал.', 404);
      return join(root, 'originals', `${row.id}.${row.format}`);
    }
    if (!['web', 'thumb'].includes(variant)) throw new ContentError('Файл не найден.', 404);
    return join(root, variant, `${row.id}.webp`);
  }
  async function ingest(source, { id = randomUUID(), filename = 'poster', originalAvailable = true } = {}) {
    const written = [];
    try {
      const metadata = await sharp(source, imageOptions).metadata();
      if (!formats.has(metadata.format) || (metadata.pages ?? 1) > 1 || !metadata.width || !metadata.height) {
        throw new ContentError('Загрузите статичное изображение JPEG, PNG, WebP, AVIF или TIFF.');
      }
      const rotated = [5, 6, 7, 8].includes(metadata.orientation);
      const width = rotated ? metadata.height : metadata.width; const height = rotated ? metadata.width : metadata.height;
      const originalPath = join(root, 'originals', `${id}.${metadata.format}`);
      await copyFile(source, originalPath); written.push(originalPath); await chmod(originalPath, 0o600);
      const webPath = join(root, 'web', `${id}.webp`); written.push(webPath);
      const result = await sharp(source, imageOptions).autoOrient().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72, effort: 4 }).toFile(webPath);
      const thumbPath = join(root, 'thumb', `${id}.webp`); written.push(thumbPath);
      await sharp(source, imageOptions).autoOrient().resize({ width: 280, height: 280, fit: 'inside', withoutEnlargement: true }).webp({ quality: 70 }).toFile(thumbPath);
      db.prepare('INSERT INTO studio_media VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, basename(filename).replace(/[\x00-\x1f]/g, '').slice(0, 240), width, height, result.width, result.height, metadata.format, originalAvailable ? 1 : 0, new Date().toISOString());
      return describe(record(id));
    } catch (error) {
      await Promise.all(written.map(file => unlink(file).catch(() => {})));
      if (error instanceof ContentError) throw error;
      throw new ContentError('Не удалось прочитать изображение. Допустимы статичные JPEG, PNG, WebP, AVIF, TIFF до 100 Мп.');
    }
  }
  function print(id, size) {
    const row = record(id); const original = path(id, 'original');
    const target = Math.max(1, Math.min(row.width, Math.round(size.widthCm / 2.54 * 300)));
    const density = Math.max(1, Math.round(target / (size.widthCm / 2.54)));
    return sharp(original, imageOptions).autoOrient().resize({ width: target, withoutEnlargement: true }).flatten({ background: '#ffffff' }).withMetadata({ density }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' });
  }
  function forget(id) { db.prepare('DELETE FROM studio_media WHERE id = ?').run(id); }
  function eraseFiles(row) {
    for (const file of [join(root,'originals',`${row.id}.${row.format}`),join(root,'web',`${row.id}.webp`),join(root,'thumb',`${row.id}.webp`)]) {
      try { unlinkSync(file); } catch(error) { if(error.code !== 'ENOENT') throw error; }
    }
  }
  return { list, record, describe, ingest, path, print, forget, eraseFiles, incomingDirectory: join(root, 'incoming') };
}
