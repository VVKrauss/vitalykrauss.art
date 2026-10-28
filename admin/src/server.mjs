import { loadConfig } from './config.mjs';
import { createStudio } from './studio.mjs';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { adminRoot } from './config.mjs';

try {
  const config = loadConfig();
  await access(join(adminRoot, 'dist/auth-client.js')).catch(() => { throw new Error('Run npm run build before starting the studio.'); });
  const studio = await createStudio(config);
  const server = studio.app.listen(config.port, config.host, () => console.log(`Studio listening at ${config.baseURL}`));
  server.requestTimeout = 180_000;
  server.headersTimeout = 10_000;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(() => { studio.close(); process.exit(0); }));
  }
  server.on('error', () => { console.error('Unable to listen on the configured address.'); studio.close(); process.exitCode = 1; });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
