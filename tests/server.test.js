import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createWebTVServer,rewriteManifest} from '../server.js';
import {isPublicIP,validateTarget} from '../server/network.js';
const response=(text,{status=200,type='text/plain',url='http://provider.example/get.php'}={})=>({body:Readable.from([Buffer.from(text)]),status,headers:{'content-type':type},url});
async function launch(t,remote) {
  const server=createWebTVServer({remote});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(path,data,cookie='')=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
  return {base,post};
}
test('relay imports HTTP M3U, retains upstream base and reports account errors',async t=> {
  const {post}=await launch(t,async url=>url.includes('denied')?response('denied',{status:403}):response('#EXTM3U\n#EXTINF:-1,TV\nhttp://provider.example/live/demo/example/10.ts'));
  const res=await post('/api/playlist',{url:'http://provider.example/get.php?type=m3u_plus&output=ts'});
  assert.equal(res.status,200);const data=await res.json();assert.match(data.text,/#EXTM3U/);assert.equal(data.base,'http://provider.example/get.php');
  const denied=await post('/api/playlist',{url:'http://provider.example/denied'});assert.equal(denied.status,502);assert.match((await denied.json()).error,/403/);
});
test('relay URLs are opaque, cookie-bound, and stream TS without CORS headers',async t=> {
  const {base,post}=await launch(t,async url=>response('TS fixture',{type:'video/mp2t',url}));
  const res=await post('/api/stream',{url:'http://provider.example/live/demo/example/10.ts',type:'ts'});
  const cookie=res.headers.get('set-cookie').split(';')[0];const data=await res.json();
  assert.match(data.url,/^\/api\/relay\/[a-f0-9]{48}$/);assert.ok(!data.url.includes('provider'));
  assert.equal((await fetch(base+data.url)).status,410);
  const stream=await fetch(base+data.url,{headers:{Cookie:cookie}});assert.equal(stream.status,200);assert.equal(await stream.text(),'TS fixture');
});
test('HLS manifest rewrites variant, segment, key and initialization routes',async t=> {
  const manifest='#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-STREAM-INF:BANDWIDTH=100000\nvariant.m3u8\nseg.ts';
  const {base,post}=await launch(t,async url=>response(url.endsWith('main.m3u8')?manifest:'resource',{type:url.endsWith('main.m3u8')?'application/vnd.apple.mpegurl':'application/octet-stream',url}));
  const res=await post('/api/stream',{url:'http://provider.example/media/main.m3u8',type:'hls'});
  const cookie=res.headers.get('set-cookie').split(';')[0];const route=(await res.json()).url;
  const text=await (await fetch(base+route,{headers:{Cookie:cookie}})).text();
  assert.equal(text.includes('provider.example'),false);assert.equal((text.match(/\/api\/relay\//g)||[]).length,4);
  const segment=text.split('\n').pop();assert.equal(await(await fetch(base+segment,{headers:{Cookie:cookie}})).text(),'resource');
});
test('cross-origin POST and private upstream addresses are rejected',async t=> {
  let opened=false;const {base}=await launch(t,async()=>{opened=true;return response('x');});
  const res=await fetch(base+'/api/playlist',{method:'POST',headers:{Origin:'https://foreign.example','Content-Type':'application/json'},body:JSON.stringify({url:'http://provider.example'})});
  assert.equal(res.status,403);assert.equal(opened,false);
  for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.0.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','::ffff:7f00:1','fc00::1','fe80::1'])assert.equal(isPublicIP(ip),false,ip);
  assert.equal(isPublicIP('8.8.8.8'),true);assert.equal(isPublicIP('2606:4700:4700::1111'),true);
  await assert.rejects(validateTarget('http://127.0.0.1:8080/'),/Yerel ağ/);
  await assert.rejects(validateTarget('file:///etc/passwd'),/HTTP/);
});
test('server only exposes UI assets, never code or environment files',async t=> {
  const {base}=await launch(t,async()=>response('unused'));
  for(const path of ['/server.js','/.env','/package.json','/assets/../server.js'])assert.equal((await fetch(base+path)).status,404);
  assert.equal((await fetch(base+'/')).status,200);
});
test('same-origin browser requests work when no-referrer omits Origin',async t=> {
  const {base}=await launch(t,async()=>response('#EXTM3U'));
  const res=await fetch(base+'/api/playlist',{method:'POST',headers:{'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify({url:'http://provider.example/list'})});
  assert.equal(res.status,200);
  const foreign=await fetch(base+'/api/playlist',{method:'POST',headers:{'Sec-Fetch-Site':'cross-site','Content-Type':'application/json'},body:JSON.stringify({url:'http://provider.example/list'})});
  assert.equal(foreign.status,403);
});
