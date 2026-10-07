import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,relative,sep,extname} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const port=Number(process.env.PORT||8080);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
const server=createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    const local=relative(root,file);
    // Only public kiosk files are served, never database source, tests or configuration secrets.
    if(local!=='index.html'&&!local.startsWith('assets'+sep)){res.writeHead(404);res.end('Not found');return;}
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':(types[extname(file)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log('Kiosk ready at http://127.0.0.1:'+port));
