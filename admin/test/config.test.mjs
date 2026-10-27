import test from 'node:test';
import assert from 'node:assert/strict';

const valid = {
  BETTER_AUTH_URL: 'http://localhost:4174',
  BETTER_AUTH_SECRET: 'Test-only-secret-with-at-least-32-characters-982',
  OWNER_EMAIL: 'owner@example.test',
};

test('configuration requires an explicit secret, owner and canonical origin', async () => {
  const { loadConfig } = await import('../src/config.mjs');
  for (const key of Object.keys(valid)) assert.throws(() => loadConfig({ ...valid, [key]: '' }), new RegExp(key));
  assert.throws(() => loadConfig({ ...valid, BETTER_AUTH_SECRET: 'short' }), /secret/i);
  assert.throws(() => loadConfig({ ...valid, OWNER_EMAIL: 'not-email' }), /OWNER_EMAIL/);
  const config = loadConfig(valid);
  assert.equal(config.ownerEmail, 'owner@example.test');
  assert.equal(config.baseURL, 'http://localhost:4174');
  assert.deepEqual(config.trustedProxyIps, []);
  assert.throws(() => loadConfig({ ...valid, TRUST_PROXY_IPS: '*' }), /TRUST_PROXY_IPS/);
  assert.deepEqual(loadConfig({ ...valid, TRUST_PROXY_IPS: '127.0.0.1, ::1' }).trustedProxyIps, ['127.0.0.1', '::1']);
});

test('production refuses plaintext origins, placeholders and public database paths', async () => {
  const { loadConfig } = await import('../src/config.mjs');
  assert.throws(() => loadConfig({ ...valid, NODE_ENV: 'production' }), /https/i);
  assert.throws(() => loadConfig({ ...valid, BETTER_AUTH_URL: 'http://example.com' }), /https|loopback/i);
  assert.throws(() => loadConfig({ ...valid, BETTER_AUTH_URL: 'http://localhost:4174/other' }), /origin/i);
  assert.throws(() => loadConfig({ ...valid, BETTER_AUTH_SECRET: 'replace-this-with-a-random-secret-of-32-chars' }), /secret/i);
  assert.throws(() => loadConfig({ ...valid, AUTH_DATABASE_PATH: 'public/auth.sqlite' }), /private/i);
  assert.equal(loadConfig({ ...valid, NODE_ENV: 'production', BETTER_AUTH_URL: 'https://studio.example.test' }).production, true);
});
