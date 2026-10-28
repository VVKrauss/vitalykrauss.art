import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getMigrations } from 'better-auth/db/migration';
import { hashPassword } from 'better-auth/crypto';
import { betterAuth } from 'better-auth';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { adminRoot } from './config.mjs';
import { createAuthOptions } from './auth.mjs';
import { createCatalogue } from './catalogue.mjs';
import { mountPrivateContent, mountPublicContent } from './content-routes.mjs';
import { ContentError } from './catalogue-model.mjs';

const publicAuth = new Set([
  'POST /sign-in/email', 'POST /sign-out', 'GET /get-session',
  'GET /passkey/generate-authenticate-options', 'POST /passkey/verify-authentication',
]);
const privateAuth = new Set([
  'GET /passkey/generate-register-options', 'POST /passkey/verify-registration',
  'GET /passkey/list-user-passkeys', 'POST /passkey/delete-passkey', 'POST /passkey/update-passkey',
  'POST /change-password',
]);

export async function createStudio(config) {
  await mkdir(dirname(config.databasePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(config.databasePath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const options = createAuthOptions(config, db);
  try {
    const migrations = await getMigrations(options);
    await migrations.runMigrations();
  } catch (error) {
    db.close();
    throw error;
  }
  const auth = betterAuth(options);
  const catalogue = await createCatalogue(db, dirname(config.databasePath), config);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustedProxyIps?.length ? config.trustedProxyIps : false);
  app.use((req, res, next) => {
    req.headers['x-studio-client-ip'] = req.ip;
    res.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (config.production) res.set('Strict-Transport-Security', 'max-age=31536000');
    if (req.headers.host !== new URL(config.baseURL).host) return res.status(421).json({ error: 'Invalid host' });
    if (req.path.startsWith('/api/') && !(req.path === '/api/catalogue' && ['GET', 'HEAD'].includes(req.method))) {
      const origin = req.headers.origin;
      if ((origin && origin !== config.baseURL) || (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin !== config.baseURL)) {
        return res.status(403).json({ error: 'Forbidden origin' });
      }
    }
    next();
  });

  async function requireOwner(req, res, next) {
    try {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (!session) return res.status(401).json({ error: 'Authentication required' });
      if (session.user.email.toLowerCase() !== config.ownerEmail || !session.user.emailVerified) {
        return res.status(403).json({ error: 'Access denied' });
      }
      res.locals.owner = { id: session.user.id, name: session.user.name, email: session.user.email };
      next();
    } catch (error) { next(error); }
  }

  app.all('/api/auth/{*path}', (req, res, next) => {
    const key = `${req.method} ${req.path.slice('/api/auth'.length)}`;
    if (privateAuth.has(key)) return requireOwner(req, res, next);
    if (!publicAuth.has(key)) return res.status(404).json({ error: 'Not found' });
    next();
  }, toNodeHandler(auth));
  app.use('/api/studio', requireOwner);
  app.get('/api/studio/session', (req, res) => res.json({ user: res.locals.owner }));
  mountPrivateContent(app, catalogue);
  mountPublicContent(app, catalogue);

  // Explicit files only: never expose admin/, the repository, secrets or data as a static root.
  app.get('/', (req, res) => res.sendFile(join(adminRoot, 'public/index.html')));
  app.get(['/exhibitions','/exhibitions/:id/edit'],(req,res)=>res.sendFile(join(adminRoot,'public/index.html')));
  for (const file of ['app.js', 'styles.css', 'content.js', 'content.css', 'toast.js', 'logo.png']) {
    app.get(`/assets/${file}`, (req, res) => res.sendFile(join(adminRoot, 'public', file)));
  }
  app.get('/assets/auth-client.js', (req, res) => res.sendFile(join(adminRoot, 'dist/auth-client.js')));
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ContentError) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Слишком много данных в каталоге.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректные данные каталога.' });
    res.status(500).json({ error: 'Service unavailable' });
  });

  async function provisionOwner(password, { reset = false } = {}) {
    if (typeof password !== 'string' || password.length < 14 || password.length > 128) {
      throw new Error('Use a password between 14 and 128 characters.');
    }
    const existing = db.prepare('SELECT id FROM user WHERE email = ? COLLATE NOCASE').get(config.ownerEmail);
    if (existing && !reset) throw new Error('Owner already exists. Use --reset to recover access.');
    const hash = await hashPassword(password);
    const now = Date.now();
    db.exec('BEGIN IMMEDIATE');
    try {
      const userId = existing?.id || randomUUID();
      if (!existing) {
        db.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)')
          .run(userId, 'Vitaly Krauss', config.ownerEmail, now, now);
      }
      const account = db.prepare('SELECT id FROM account WHERE userId = ? AND providerId = ?').get(userId, 'credential');
      if (account) db.prepare('UPDATE account SET password = ?, updatedAt = ? WHERE id = ?').run(hash, now, account.id);
      else db.prepare('INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), userId, 'credential', userId, hash, now, now);
      db.prepare('DELETE FROM session WHERE userId = ?').run(userId);
      if (reset) db.prepare('DELETE FROM passkey WHERE userId = ?').run(userId);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  return { app, auth, db, catalogue, provisionOwner, close: () => db.close() };
}
