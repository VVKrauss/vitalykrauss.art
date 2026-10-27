import { build } from 'esbuild';
import { adminRoot } from '../src/config.mjs';
import { join } from 'node:path';

await build({
  entryPoints: [join(adminRoot, 'src/client.mjs')],
  outfile: join(adminRoot, 'dist/auth-client.js'),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  minify: true, sourcemap: false, legalComments: 'none',
});
console.log('Studio auth client built.');
