import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { unlink, statfs } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { ContentError } from './catalogue-model.mjs';

export function mountPublicContent(app, catalogue) {
  app.get('/api/catalogue', (req, res) => {
    res.set({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }).json(catalogue.published());
  });
  app.get('/media/:id/:variant', (req, res) => {
    catalogue.publicMedia(req.params.id);
    const variant = { 'web.webp': 'web', 'thumb.webp': 'thumb' }[req.params.variant];
    res.set('Cache-Control', 'no-store').sendFile(catalogue.media.path(req.params.id, variant), { dotfiles: 'allow' });
  });
}

export function mountPrivateContent(app, catalogue) {
  app.use('/api/studio', express.json({ limit: '2mb' }));
  app.get('/api/studio/content', (req, res) => res.json(catalogue.state()));
  app.put('/api/studio/content', (req, res) => res.json(catalogue.save(req.body?.version, req.body?.draft)));
  app.post('/api/studio/publish', (req, res) => res.json(catalogue.publish(req.body?.version, req.body?.draft)));
  app.post('/api/studio/delete', (req,res) => res.json(catalogue.deleteArchived(req.body?.version,req.body?.draft,req.body?.kind,req.body?.id)));
  app.post('/api/studio/exhibition-archive',(req,res)=>res.json(catalogue.archiveExhibition(req.body?.version,req.body?.draft,req.body?.id,req.body?.archived)));
  const upload = multer({ storage: multer.diskStorage({ destination: catalogue.media.incomingDirectory, filename: (req, file, cb) => cb(null, randomUUID()) }), limits: { files: 1, fileSize: 100 * 1024 * 1024, fields: 0 } });
  let processing = false;
  app.post('/api/studio/media', async (req, res, next) => {
    if (processing) return next(new ContentError('Сейчас обрабатывается другое изображение. Повторите загрузку через несколько секунд.', 429));
    processing = true;
    const release = () => { processing = false; };
    try {
      const disk = await statfs(catalogue.media.incomingDirectory);
      if (disk.bavail * disk.bsize < 1024 * 1024 * 1024) {
        release(); return next(new ContentError('Недостаточно свободного места на сервере для безопасной загрузки.', 507));
      }
    } catch (error) { release(); return next(error); }
    upload.single('file')(req, res, async error => {
      if (error) { release(); return next(new ContentError(error.code === 'LIMIT_FILE_SIZE' ? 'Максимальный размер файла — 100 МБ.' : 'Загрузите один файл изображения.')); }
      if (!req.file) { release(); return next(new ContentError('Выберите файл изображения.')); }
      try { res.status(201).json(await catalogue.media.ingest(req.file.path, { filename: req.file.originalname })); }
      catch (error) { next(error); }
      finally { await unlink(req.file.path).catch(() => {}); release(); }
    });
  });
  app.get('/api/studio/media/:id/:variant', (req, res) => {
    const variant = { 'web.webp': 'web', 'thumb.webp': 'thumb', original: 'original' }[req.params.variant];
    const file = catalogue.media.path(req.params.id, variant);
    if (variant === 'original') return res.download(file, catalogue.media.record(req.params.id).filename, { dotfiles: 'allow' });
    res.sendFile(file, { dotfiles: 'allow' });
  });
  app.get('/api/studio/works/:workId/print/:sizeId', async (req, res, next) => {
    if (processing) return next(new ContentError('Сейчас обрабатывается другое изображение. Повторите через несколько секунд.', 429));
    processing = true;
    try {
      const image = catalogue.print(req.params.workId, req.params.sizeId);
      res.type('image/jpeg').attachment(`${req.params.workId}-${req.params.sizeId}.jpg`);
      await pipeline(image, res);
    } catch (error) { next(error); }
    finally { processing = false; }
  });
}
