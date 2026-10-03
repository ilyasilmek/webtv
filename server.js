import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname,resolve,extname,sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { remoteRequest,readLimited } from './server/network.js';
import { MAX_BYTES,safeURL } from './assets/core.js';

const root=dirname(fileURLToPath(import.meta.url));
const ttl=60*60*1000;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'};
export function rewriteManifest(text,base,register) {
  return text.split(/\r?\n/).map(line=> {
    if(line.startsWith('#')) return line.replace(/URI="([^"]+)"/g,(_match,uri)=>`URI="${register(new URL(uri,base).href)}"`);
    return line.trim()?register(new URL(line.trim(),base).href):line;
  }).join('\n');
}
function json(res,status,data) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data)); }
export function createWebTVServer({remote=remoteRequest}={}) {
  const sessions=new Map();
  let active=0;
  const server=createServer(async(req,res)=> {
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','SAMEORIGIN');
    const controller=new AbortController();
    res.on('close',()=>controller.abort());
    let path;
    try {path=new URL(req.url,'http://localhost').pathname;} catch {return json(res,400,{error:'Geçersiz istek.'});}
    try {
      if(path==='/api/config'&&req.method==='GET') return json(res,200,{relay:true,mpegts:true});
      if(path.startsWith('/api/')) {
        for(const [key,value] of sessions) if(value.expires<Date.now()&&value.active===0) sessions.delete(key);
        const cookie=req.headers.cookie?.match(/(?:^|;\s*)webtv_session=([a-f0-9]{48})(?:;|$)/)?.[1];
        let session=sessions.get(cookie),id=cookie;
        if(req.method==='POST') {
          const origin=req.headers.origin;
          const expected=process.env.APP_ORIGIN;
          // Browsers may omit Origin for same-origin requests under no-referrer.
          // Fetch Metadata is browser-controlled and preserves the same-origin check.
          const withoutOrigin=(!origin||origin==='null')&&req.headers['sec-fetch-site']==='same-origin'&&(!expected||new URL(expected).host===req.headers.host);
          const withOrigin=origin&&origin!=='null'&&(expected?origin===expected:new URL(origin).host===req.headers.host);
          if((!withoutOrigin&&!withOrigin) || !req.headers['content-type']?.startsWith('application/json')) return json(res,403,{error:'Bu işlem uygulama sayfasından yapılmalı.'});
          if(!session) {
            if(sessions.size>=128) return json(res,503,{error:'Sunucu meşgul. Biraz sonra tekrar deneyin.'});
            const secure=origin?.startsWith('https:')||Boolean(req.socket.encrypted)||(expected&&new URL(expected).protocol==='https:')||req.headers['x-forwarded-proto']==='https';
            id=randomBytes(24).toString('hex');session={expires:Date.now()+ttl,targets:new Map(),active:0,requests:[],secure};sessions.set(id,session);
          }
          session.expires=Date.now()+ttl;
          res.setHeader('Set-Cookie',`webtv_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${session.secure?'; Secure':''}`);
          session.requests=session.requests.filter(time=>time>Date.now()-60000);
          if(session.requests.length>=30) return json(res,429,{error:'Çok fazla bağlantı isteği yapıldı. Bir dakika sonra tekrar deneyin.'});
          session.requests.push(Date.now());
          const body=JSON.parse(await readLimited(req,65536));
          if(path==='/api/images') {
            if(!Array.isArray(body.urls)||body.urls.length>100)return json(res,400,{error:'Görsel listesi çok büyük.'});
            const urls=body.urls.map(value=>safeURL(value));
            if(urls.some(value=>!value))return json(res,400,{error:'Görsel bağlantısı geçersiz.'});
            for(const [key,value] of session.targets)if(value.expires<Date.now())session.targets.delete(key);
            if(session.targets.size+urls.length>2048)return json(res,429,{error:'Görsel oturumu doldu.'});
            const routes=urls.map(url=>{const token=randomBytes(24).toString('hex');session.targets.set(token,{url,type:'image',child:true,expires:Date.now()+120000});return `/api/relay/${token}`;});
            return json(res,200,{urls:routes});
          }
          const target=safeURL(body.url);
          if(!target) return json(res,400,{error:'HTTP veya HTTPS bağlantısı girin.'});
          if(path==='/api/playlist') {
            const upstream=await remote(target,{signal:controller.signal});
            if(upstream.status<200||upstream.status>=300) {upstream.body.destroy();return json(res,502,{error:`Liste sunucusu ${upstream.status} yanıtı verdi. Hesap erişimini ve kaynak bağlantısını kontrol edin.`});}
            const text=await readLimited(upstream.body,MAX_BYTES);
            return json(res,200,{text,base:upstream.url});
          }
          if(path==='/api/stream') {
            if(!['hls','ts','file'].includes(body.type)) return json(res,400,{error:'Yayın biçimi tanınmadı.'});
            // Targets are validated and DNS-pinned when the relay actually opens them.
            const token=randomBytes(24).toString('hex');
            for(const [key,value] of session.targets) if(value.expires<Date.now()) session.targets.delete(key);
            if(session.targets.size>=2048) return json(res,429,{error:'Çok fazla yayın açıldı. Sayfayı yeniden açın.'});
            session.targets.set(token,{url:target,type:body.type,expires:Date.now()+ttl});
            return json(res,200,{url:`/api/relay/${token}`});
          }
          return json(res,404,{error:'İşlem bulunamadı.'});
        }
        if(req.method==='GET'&&/^\/api\/relay\/[a-f0-9]{48}$/.test(path)) {
          const entry=session?.targets.get(path.split('/').pop());
          if(!entry) return json(res,410,{error:'Yayın oturumu sona erdi. Yayını yeniden açın.'});
          if(session.active>=12||active>=96) return json(res,429,{error:'Çok fazla eşzamanlı bağlantı var.'});
          session.expires=Date.now()+ttl;entry.expires=Date.now()+(entry.child?120000:ttl);
          res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
          res.setHeader('Set-Cookie',`webtv_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${session.secure?'; Secure':''}`);
          ++session.active;++active;
          try {
            const upstream=await remote(entry.url,{range:req.headers.range,signal:controller.signal});
            if(upstream.status<200||upstream.status>=300) {upstream.body.destroy();return json(res,502,{error:`Yayın sunucusu ${upstream.status} yanıtı verdi.`});}
            const type=upstream.headers['content-type']||'';
            if(entry.type==='image') {
              if(!/^image\//i.test(type)){upstream.body.destroy();return json(res,502,{error:'Kaynak görsel döndürmedi.'});}
              const data=await readLimited(upstream.body,2*1024*1024,null);
              res.writeHead(200,{'Content-Type':type,'Cache-Control':'private, max-age=60'});res.end(data);return;
            }
            const isManifest=entry.type==='hls'||/mpegurl/i.test(type)||/\.m3u8$/i.test(new URL(upstream.url).pathname);
            if(isManifest) {
              const original=await readLimited(upstream.body,2*1024*1024);
              if(!original.trimStart().startsWith('#EXTM3U')) return json(res,502,{error:'Kaynak HLS listesi döndürmedi.'});
              const register=url=> {
                const clean=safeURL(url);if(!clean) throw new Error('Listede desteklenmeyen bağlantı var.');
                for(const [token,item] of session.targets) if(item.url===clean) {item.expires=Date.now()+(item.child?120000:ttl);return `/api/relay/${token}`;}
                for(const [token,item] of session.targets) if(item.expires<Date.now())session.targets.delete(token);
                if(session.targets.size>=2048) throw new Error('Yayın listesi çok fazla parça içeriyor.');
                const token=randomBytes(24).toString('hex');session.targets.set(token,{url:clean,type:'auto',child:true,expires:Date.now()+120000});return `/api/relay/${token}`;
              };
              res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store'});
              res.end(rewriteManifest(original,upstream.url,register));
            } else {
              const headers={'Content-Type':type||'application/octet-stream','Cache-Control':'no-store'};
              for(const key of ['content-length','content-range','accept-ranges'])if(upstream.headers[key])headers[key]=upstream.headers[key];
              res.writeHead(upstream.status,headers);await pipeline(upstream.body,res,{signal:controller.signal});
            }
          } finally {--session.active;--active;}
          return;
        }
        return json(res,404,{error:'İşlem bulunamadı.'});
      }
      if(!['GET','HEAD'].includes(req.method)) return json(res,405,{error:'Yöntem desteklenmiyor.'});
      let decoded;try{decoded=decodeURIComponent(path);}catch{return json(res,400,{error:'Geçersiz adres.'});}
      const filename=resolve(root,'.'+(decoded==='/'?'/index.html':decoded));
      const allowed=filename===resolve(root,'index.html')||filename===resolve(root,'watch.html')||filename.startsWith(resolve(root,'assets')+sep);
      if(!allowed || !mime[extname(filename)] || filename.endsWith('.map'))return json(res,404,{error:'Dosya bulunamadı.'});
      const info=await stat(filename);if(!info.isFile())return json(res,404,{error:'Dosya bulunamadı.'});
      res.writeHead(200,{'Content-Type':mime[extname(filename)],'Content-Length':info.size,'Cache-Control':'no-cache'});
      if(req.method==='HEAD')res.end();else await pipeline(createReadStream(filename),res);
    } catch(error) {
      if(res.destroyed||controller.signal.aborted)return;
      if(res.headersSent)res.destroy();
      else json(res,502,{error:error instanceof SyntaxError?'İstek okunamadı.':/^(Yerel ağ|HTTP veya|Geçerli|Kaynak|Liste izin|Listede destek|Yayın listesi)/.test(error.message)?error.message:'Kaynağa erişilemedi. Bağlantıyı ve hesabın erişim durumunu kontrol edin.'});
    }
  });
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT)||8080;
  createWebTVServer().listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`WebTV hazır: port ${port}`));
}
