import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
createServer(async (req,res) => {
  try {
    const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const relative = path === '/' ? 'index.html' : path.slice(1);
    if (!['index.html','script.js','backend.js','config.js','styles.css'].includes(relative) && !/^assets\/[a-zA-Z0-9_\-/]+\.(svg|png|jpg|webp)$/.test(relative)) { res.writeHead(404).end(); return; }
    const file = resolve(root,relative);
    if (!file.startsWith(root + '/'.replace('/',process.platform==='win32'?'\\':'/'))) {res.writeHead(403).end();return;}
    const data = await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
  } catch {res.writeHead(404).end();}
}).listen(4173,'127.0.0.1',()=>console.log('Kiosk: http://127.0.0.1:4173'));
