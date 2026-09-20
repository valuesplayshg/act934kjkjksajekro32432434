import http from 'node:http';
import net from 'node:net';

const HOST='127.0.0.1';
const PORT=8090;
const FRONTEND={host:'127.0.0.1',port:5173};
const BACKEND={host:'127.0.0.1',port:8087};

function targetFor(url=''){
  return url.startsWith('/api/')?BACKEND:FRONTEND;
}

const server=http.createServer((req,res)=>{
  const target=targetFor(req.url||'');
  const headers={...req.headers,host:`${target.host}:${target.port}`,'x-forwarded-proto':'https'};
  const upstream=http.request({
    hostname:target.host,
    port:target.port,
    path:req.url,
    method:req.method,
    headers
  },upstreamRes=>{
    res.writeHead(upstreamRes.statusCode||502,upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on('error',error=>{
    console.error('proxy request failed',req.method,req.url,error.message);
    if(!res.headersSent)res.writeHead(502,{'content-type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({message:'Preview proxy unavailable'}));
  });
  req.pipe(upstream);
});

server.on('upgrade',(req,clientSocket,head)=>{
  const target=targetFor(req.url||'');
  const upstream=net.connect(target.port,target.host,()=>{
    const lines=[`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    const raw=req.rawHeaders;
    for(let i=0;i<raw.length;i+=2){
      const name=raw[i];
      if(name.toLowerCase()==='host') lines.push(`Host: ${target.host}:${target.port}`);
      else lines.push(`${name}: ${raw[i+1]}`);
    }
    lines.push('X-Forwarded-Proto: https','','');
    upstream.write(lines.join('\r\n'));
    if(head.length)upstream.write(head);
    clientSocket.pipe(upstream).pipe(clientSocket);
  });
  upstream.on('error',()=>clientSocket.destroy());
});

server.listen(PORT,HOST,()=>console.log(`LT-CMS live proxy listening on http://${HOST}:${PORT}`));
