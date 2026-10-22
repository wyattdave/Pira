// Local static server for UI development against the in-memory mock.
// Usage: npm run dev  →  http://127.0.0.1:5178/dist/index.html?mock
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PORT = Number(process.env.PORT) || 5178;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };

createServer(async (oRequest, oResponse) => {
  const sPath = decodeURIComponent(new URL(oRequest.url, 'http://localhost').pathname);
  const sFile = normalize(join(ROOT, sPath === '/' ? '/dist/index.html' : sPath));
  if (!sFile.startsWith(ROOT)) {
    oResponse.writeHead(403).end();
    return;
  }
  try {
    const oBody = await readFile(sFile);
    oResponse.writeHead(200, { 'Content-Type': TYPES[extname(sFile)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(oBody);
  } catch (oError) {
    oResponse.writeHead(404).end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Pira dev server: http://127.0.0.1:${PORT}/dist/index.html?mock`));
