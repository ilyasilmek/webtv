import {fetchPlaylist,MAX_BYTES} from './core.js';
let available;
export function relayAvailable() {
  if(!available)available=(async()=> {
    try {const response=await fetch(new URL('../api/config',import.meta.url),{signal:AbortSignal.timeout(2000),cache:'no-store'});return response.ok&&(await response.json()).relay===true;}
    catch{return false;}
  })();
  return available;
}
async function request(path,data,signal) {
  const response=await fetch(new URL(`../api/${path}`,import.meta.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),credentials:'same-origin',signal});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'Bağlantı kurulamadı.');
  return result;
}
export async function loadPlaylist(url) {
  if(!await relayAvailable()) {
    if(location.protocol==='https:'&&/^http:/i.test(url))throw new Error('Bu HTTP listesi için uygulamanın yayın bağlantısı sunucusuyla çalışması gerekiyor.');
    return fetchPlaylist(url);
  }
  try {const result=await request('playlist',{url},AbortSignal.timeout(60000));if(new TextEncoder().encode(result.text).byteLength>MAX_BYTES)throw new Error('Liste en fazla 64 MB olabilir.');return result;}
  catch(error){if(['TimeoutError','AbortError'].includes(error.name))throw new Error('Liste sunucusu zamanında yanıt vermedi.');throw error;}
}
export async function playbackURL(channel,type,signal) {
  if(await relayAvailable())return new URL((await request('stream',{url:channel.url,type},signal)).url,location.href).href;
  return channel.url;
}

const images=new Map();let imageQueue=[],imageTimer;
async function flushImages() {
  const batch=imageQueue.splice(0,100);
  try {const result=await request('images',{urls:batch.map(item=>item.url)},AbortSignal.timeout(20000));batch.forEach((item,index)=>item.resolve(result.urls[index]));}
  catch {batch.forEach(item=>{images.delete(item.url);item.resolve('');});}
  if(imageQueue.length)imageTimer=setTimeout(flushImages,0);
}
export async function imageURL(url) {
  if(!await relayAvailable())return url;
  const cached=images.get(url);if(cached&&cached.expires>Date.now())return cached.promise;
  const promise=new Promise(resolve=>{imageQueue.push({url,resolve});clearTimeout(imageTimer);imageTimer=setTimeout(flushImages,0);});
  images.set(url,{promise,expires:Date.now()+90000});
  if(images.size>2000)images.delete(images.keys().next().value);
  return promise;
}
