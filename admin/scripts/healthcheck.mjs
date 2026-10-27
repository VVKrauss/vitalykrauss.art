import { get } from 'node:http';

const request = get({
  hostname: '127.0.0.1', port: Number(process.env.PORT || 4174), path: '/',
  headers: { host: new URL(process.env.BETTER_AUTH_URL).host },
}, response => { response.resume(); process.exitCode = response.statusCode === 200 ? 0 : 1; });
request.setTimeout(3000, () => request.destroy());
request.on('error', () => { process.exitCode = 1; });
