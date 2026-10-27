import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { adminRoot, loadConfig } from '../src/config.mjs';
import { createStudio } from '../src/studio.mjs';

// Read passwords without echoing them or placing them in command arguments/history.
async function askPassword(prompt) {
  if (!process.stdin.isTTY) throw new Error('Run setup in an interactive terminal to enter a private password.');
  const output = new Writable({ write(chunk, encoding, callback) { callback(); } });
  const reader = createInterface({ input: process.stdin, output, terminal: true });
  process.stdout.write(prompt);
  try { return await reader.question(''); }
  finally { reader.close(); process.stdout.write('\n'); }
}

try {
  const envPath = join(adminRoot, '.env');
  let saved;
  const runtimeConfigured = ['BETTER_AUTH_URL', 'BETTER_AUTH_SECRET', 'OWNER_EMAIL'].every(key => process.env[key]?.trim());
  try { saved = runtimeConfigured ? {} : parseEnv(await readFile(envPath, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    saved = {
      BETTER_AUTH_URL: 'http://localhost:4174',
      BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
      OWNER_EMAIL: 'kraussvitaliy@gmail.com',
      AUTH_DATABASE_PATH: '.data/auth.sqlite', HOST: '127.0.0.1', PORT: '4174', NODE_ENV: 'development',
    };
    await writeFile(envPath, Object.entries(saved).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
    console.log('Created private local configuration in admin/.env.');
  }
  if (!runtimeConfigured && !saved.BETTER_AUTH_SECRET?.trim()) {
    saved.BETTER_AUTH_SECRET = randomBytes(48).toString('base64url');
    const contents = await readFile(envPath, 'utf8');
    const updated = /^BETTER_AUTH_SECRET=.*$/m.test(contents)
      ? contents.replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${saved.BETTER_AUTH_SECRET}`)
      : contents + `\nBETTER_AUTH_SECRET=${saved.BETTER_AUTH_SECRET}\n`;
    await writeFile(envPath, updated, { mode: 0o600 });
    console.log('Generated a private authentication secret.');
  }
  const config = loadConfig({ ...saved, ...process.env });
  const password = await askPassword('Пароль владельца (14–128 символов, ввод скрыт): ');
  const confirmation = await askPassword('Повторите пароль: ');
  if (password !== confirmation) throw new Error('Пароли не совпадают.');
  const studio = await createStudio(config);
  try {
    await studio.provisionOwner(password, { reset: process.argv.includes('--reset') });
    if (process.argv.includes('--reset')) console.log('Предыдущие сеансы и ключи доступа отозваны.');
    console.log('Доступ владельца настроен. Запустите npm run build и npm start.');
  } finally { studio.close(); }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
