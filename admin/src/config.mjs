import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';

export const adminRoot = fileURLToPath(new URL('../', import.meta.url));

export function loadConfig(env = process.env) {
  for (const key of ['BETTER_AUTH_URL', 'BETTER_AUTH_SECRET', 'OWNER_EMAIL']) {
    if (!env[key]?.trim()) throw new Error(`${key} is required. Run npm run setup first.`);
  }
  const secret = env.BETTER_AUTH_SECRET;
  if (secret.length < 32 || /replace|change.?me|example|placeholder/i.test(secret)) {
    throw new Error('BETTER_AUTH_SECRET must be a randomly generated secret of at least 32 characters.');
  }
  const url = new URL(env.BETTER_AUTH_URL);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('BETTER_AUTH_URL must be an origin without a path or credentials.');
  }
  const production = env.NODE_ENV === 'production';
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && (production || !loopback || url.protocol !== 'http:')) {
    throw new Error('HTTPS is required outside local loopback development.');
  }
  const ownerEmail = env.OWNER_EMAIL.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw new Error('OWNER_EMAIL must be a valid email.');
  const databasePath = resolve(adminRoot, env.AUTH_DATABASE_PATH || '.data/auth.sqlite');
  const publicDirectory = resolve(adminRoot, 'public');
  const fromPublic = relative(publicDirectory, databasePath);
  if (!fromPublic.startsWith('..') && !isAbsolute(fromPublic)) {
    throw new Error('AUTH_DATABASE_PATH must be outside the public directory; keep it private.');
  }
  const port = Number(env.PORT || 4174);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const trustedProxyIps = (env.TRUST_PROXY_IPS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (trustedProxyIps.some(value => !isIP(value))) throw new Error('TRUST_PROXY_IPS must contain only explicit IP addresses.');
  return { baseURL: url.origin, secret, ownerEmail, databasePath, production, port, host: env.HOST || '127.0.0.1', trustedProxyIps };
}
