import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const ownerEmail = 'owner@example.test';
const password = 'Test-only-owner-password-927!';

async function fixture(t, options = {}) {
  const { createStudio } = await import('../src/studio.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'vk-auth-'));
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const origin = options.production ? baseURL.replace('http:', 'https:') : baseURL;
  let studio;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    studio?.close();
    await rm(dir, { recursive: true, force: true });
  });
  studio = await createStudio({
    baseURL: origin, ownerEmail, secret: randomBytes(48).toString('base64url'),
    databasePath: join(dir, 'auth.sqlite'), production: false,
    ...options,
  });
  server.on('request', studio.app);
  const request = (path, { cookie, origin: requestOrigin = origin, body, method = body ? 'POST' : 'GET' } = {}) => fetch(baseURL + path, {
    method,
    headers: { ...(cookie && { cookie }), ...(requestOrigin && { origin: requestOrigin }), ...(body && { 'content-type': 'application/json' }) },
    ...(body && { body: JSON.stringify(body) }), redirect: 'manual',
  });
  const login = async () => {
    const response = await request('/api/auth/sign-in/email', { body: { email: ownerEmail, password } });
    assert.equal(response.status, 200);
    const cookie = response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    assert.ok(cookie.includes('session_token='));
    assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(response.headers.get('set-cookie'), /SameSite=Lax/i);
    return cookie;
  };
  return { ...studio, request, login, baseURL, dir };
}

test('private endpoints reject anonymous requests and forged owner headers', async t => {
  const s = await fixture(t);
  assert.equal((await s.request('/api/studio/session')).status, 401);
  assert.equal((await s.request('/api/studio/anything')).status, 401);
  const response = await fetch(s.baseURL + '/api/studio/session', { headers: { 'x-owner-email': ownerEmail } });
  assert.equal(response.status, 401);
});

test('signup stays closed, including requests with the owner email', async t => {
  const s = await fixture(t);
  for (const email of ['visitor@example.test', ownerEmail]) {
    const response = await s.request('/api/auth/sign-up/email', { body: { name: 'Visitor', email, password } });
    assert.ok([403, 404].includes(response.status));
  }
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM user').get().n, 0);
});

test('offline owner provisioning, login, private session and logout use real persisted sessions', async t => {
  const s = await fixture(t);
  await s.provisionOwner(password);
  await assert.rejects(() => s.provisionOwner(password), /already exists/i);
  const cookie = await s.login();
  const response = await s.request('/api/studio/session', { cookie });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.email, ownerEmail);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const logout = await s.request('/api/auth/sign-out', { cookie, body: {} });
  assert.equal(logout.status, 200);
  assert.equal((await s.request('/api/studio/session', { cookie })).status, 401);
});

test('existing non-owner users cannot create sessions', async t => {
  const s = await fixture(t);
  const { hashPassword } = await import('better-auth/crypto');
  const context = await s.auth.$context;
  const user = await context.internalAdapter.createUser({ email: 'intruder@example.test', name: 'Intruder', emailVerified: true });
  await context.internalAdapter.createAccount({ userId: user.id, accountId: user.id, providerId: 'credential', password: await hashPassword(password) });
  const response = await s.request('/api/auth/sign-in/email', { body: { email: user.email, password } });
  assert.notEqual(response.status, 200);
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM session').get().n, 0);
});

test('cross-origin login, signout and passkey registration are rejected', async t => {
  const s = await fixture(t);
  await s.provisionOwner(password);
  const cookie = await s.login();
  for (const path of ['/api/auth/sign-in/email', '/api/auth/sign-out', '/api/auth/passkey/generate-register-options']) {
    const response = await s.request(path, { cookie, origin: 'https://evil.example', body: { email: ownerEmail, password } });
    assert.equal(response.status, 403, path);
  }
  assert.equal((await s.request('/api/studio/session', { cookie })).status, 200);
});

test('passkey enrollment requires an owner session, while authentication challenge remains public', async t => {
  const s = await fixture(t);
  assert.equal((await s.request('/api/auth/passkey/generate-register-options')).status, 401);
  assert.equal((await s.request('/api/auth/passkey/generate-authenticate-options')).status, 200);
  await s.provisionOwner(password);
  const cookie = await s.login();
  assert.equal((await s.request('/api/auth/passkey/generate-register-options', { cookie })).status, 200);
});

test('repository files and database are never served and security headers are present', async t => {
  const s = await fixture(t);
  for (const path of ['/.env', '/.data/auth.sqlite', '/src/auth.mjs', '/package.json', '/README.md', '/assets/../src/auth.mjs']) {
    const response = await s.request(path);
    assert.equal(response.status, 404, path);
  }
  const page = await s.request('/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(page.headers.get('x-powered-by'), null);
  assert.ok(!(await page.text()).includes(ownerEmail));
});

test('account recovery replaces the password and removes all old sessions and passkeys', async t => {
  const s = await fixture(t);
  await s.provisionOwner(password);
  const cookie = await s.login();
  const owner = s.db.prepare('SELECT id FROM user WHERE email = ?').get(ownerEmail);
  s.db.prepare('INSERT INTO passkey (id, publicKey, userId, credentialID, counter, deviceType, backedUp) VALUES (?, ?, ?, ?, 0, ?, 0)')
    .run('test-old-key', 'test-public-key', owner.id, 'test-credential', 'singleDevice');
  await s.provisionOwner('Replacement-test-password-183!', { reset: true });
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM passkey').get().n, 0);
  assert.equal((await s.request('/api/studio/session', { cookie })).status, 401);
  assert.equal((await s.request('/api/auth/sign-in/email', { body: { email: ownerEmail, password } })).status, 401);
  assert.equal((await s.request('/api/auth/sign-in/email', { body: { email: ownerEmail, password: 'Replacement-test-password-183!' } })).status, 200);
});

test('repeated login attempts are rate limited', async t => {
  const s = await fixture(t);
  let response;
  for (let i = 0; i < 7; i++) {
    response = await s.request('/api/auth/sign-in/email', { body: { email: ownerEmail, password: 'wrong-password' } });
  }
  assert.equal(response.status, 429);
});

test('production uses Secure cookies and HSTS', async t => {
  const s = await fixture(t, { production: true });
  await s.provisionOwner(password);
  const response = await s.request('/api/auth/sign-in/email', { body: { email: ownerEmail, password } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /; Secure/i);
  assert.match(response.headers.get('set-cookie'), /__Secure-/);
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
});

test('mutations without Origin and forged Host fail closed', async t => {
  const s = await fixture(t);
  const response = await s.request('/api/auth/sign-in/email', { origin: null, body: { email: ownerEmail, password } });
  assert.equal(response.status, 403);
  const forgedStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(s.baseURL + '/', { headers: { host: 'evil.example' } }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('error', reject);
    request.end();
  });
  assert.equal(forgedStatus, 421);
});

test('expired sessions and owners whose allowlist changed cannot use protected API', async t => {
  const s = await fixture(t);
  await s.provisionOwner(password);
  const cookie = await s.login();
  s.db.prepare('UPDATE user SET email = ?').run('former-owner@example.test');
  assert.equal((await s.request('/api/studio/session', { cookie })).status, 403);
  s.db.prepare('UPDATE user SET email = ?').run(ownerEmail);
  s.db.prepare('UPDATE session SET expiresAt = ?').run(Date.now() - 1000);
  assert.equal((await s.request('/api/studio/session', { cookie })).status, 401);
});

test('untrusted forwarded IP and internal headers cannot bypass login rate limiting', async t => {
  const s = await fixture(t);
  let response;
  for (let i = 0; i < 7; i++) {
    response = await fetch(s.baseURL + '/api/auth/sign-in/email', {
      method: 'POST', headers: { origin: s.baseURL, 'content-type': 'application/json',
        'x-forwarded-for': `192.0.2.${i}`, 'x-studio-client-ip': `192.0.2.${i}` },
      body: JSON.stringify({ email: ownerEmail, password: 'wrong-password' }),
    });
  }
  assert.equal(response.status, 429);
});

test('explicitly trusted proxy clients have independent rate-limit buckets', async t => {
  const s = await fixture(t, { trustedProxyIps: ['127.0.0.1'] });
  const attempt = ip => fetch(s.baseURL + '/api/auth/sign-in/email', {
    method: 'POST', headers: { origin: s.baseURL, 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email: ownerEmail, password: 'wrong-password' }),
  });
  let response;
  for (let i = 0; i < 7; i++) response = await attempt('192.0.2.1');
  assert.equal(response.status, 429);
  assert.notEqual((await attempt('192.0.2.2')).status, 429);
});
