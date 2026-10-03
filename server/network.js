import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export function isPublicIP(address) {
  if (isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number);
    return !(a===0 || a===10 || a===127 || a>=224 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&(b===168||b===0)) || (a===100&&b>=64&&b<=127) || (a===198&&(b===18||b===19)));
  }
  if (isIP(address) === 6) {
    const lower=address.toLowerCase();
    if (lower.startsWith('::ffff:')) {
      const mapped=lower.slice(7);
      if (isIP(mapped)===4) return isPublicIP(mapped);
      const parts=mapped.split(':');
      if(parts.length===2) { const hi=parseInt(parts[0],16),lo=parseInt(parts[1],16); return isPublicIP(`${hi>>8}.${hi&255}.${lo>>8}.${lo&255}`); }
    }
    const first=parseInt(lower.split(':')[0],16);
    return first>=0x2000 && first<=0x3fff && !lower.startsWith('2001:db8:');
  }
  return false;
}
export async function validateTarget(value) {
  let url;
  try { url=new URL(value); } catch { throw new Error('Geçerli bir yayın veya liste bağlantısı girin.'); }
  if(!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('HTTP veya HTTPS bağlantısı kullanın.');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  let addresses;
  try { addresses=isIP(host)?[{address:host,family:isIP(host)}]:await lookup(host,{all:true,verbatim:true}); }
  catch { throw new Error('Kaynak sunucunun adresi çözülemedi.'); }
  if(!addresses.length || addresses.some(entry=>!isPublicIP(entry.address))) throw new Error('Yerel ağ ve özel sunucu adresleri bu bağlantıda kullanılamaz.');
  return {url,address:addresses[0]};
}

export async function remoteRequest(target,{range,signal,redirects=0}={}) {
  if(redirects>5) throw new Error('Kaynak çok fazla yönlendirme yapıyor.');
  const {url,address}=await validateTarget(target);
  const transport=url.protocol==='https:'?https:http;
  const response=await new Promise((resolve,reject)=> {
    const request=transport.request(url,{method:'GET',signal,family:address.family,autoSelectFamily:false,
      lookup:(_host,_options,callback)=>callback(null,address.address,address.family),
      headers:{'User-Agent':'VLC/3.0.21 LibVLC/3.0.21','Accept':'*/*','Accept-Encoding':'identity',...(range?{Range:range}:{})}},resolve);
    request.setTimeout(30000,()=>request.destroy(new Error('Kaynak sunucu zamanında yanıt vermedi.')));
    request.on('error',()=>reject(new Error('Kaynak sunucuya bağlanılamadı.')));
    request.end();
  });
  if([301,302,303,307,308].includes(response.statusCode)&&response.headers.location) {
    response.destroy(); return remoteRequest(new URL(response.headers.location,url).href,{range,signal,redirects:redirects+1});
  }
  return {body:response,status:response.statusCode,headers:response.headers,url:url.href};
}

export async function readLimited(body,maxBytes,encoding='utf8') {
  const chunks=[];let size=0;
  for await(const chunk of body) {
    size+=chunk.length;
    if(size>maxBytes) { body.destroy(); throw new Error('Liste izin verilen boyutu aşıyor.'); }
    chunks.push(chunk);
  }
  const data=Buffer.concat(chunks);return encoding?data.toString(encoding):data;
}
