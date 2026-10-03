export const MAX_BYTES = 8 * 1024 * 1024;
export const MAX_CHANNELS = 10000;

export function safeURL(value, base) {
  try {
    const url = base ? new URL(value, base) : new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function channelId(url) {
  // Two hashes keep IDs stable without copying private stream URLs into page links.
  let a = 2166136261, b = 5381;
  for (const char of url) { a = Math.imul(a ^ char.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ char.charCodeAt(0); }
  return `ch-${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}

export function makeChannel({ name, url, group = 'Diğer', logo = '', type = 'auto' }, base) {
  const stream = safeURL(url, base);
  if (!stream) throw new Error('Geçerli bir HTTP veya HTTPS yayın bağlantısı girin.');
  return { id: channelId(stream), url: stream, name: (name || 'İsimsiz kanal').trim().slice(0, 200), group: (group || 'Diğer').trim().slice(0, 100), logo: safeURL(logo, base), type: ['auto', 'hls', 'file'].includes(type) ? type : 'auto' };
}

export function parseM3U(text, base) {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('Liste en fazla 8 MB olabilir.');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim());
  if (!lines.some(line => line.startsWith('#EXTM3U') || line.startsWith('#EXTINF:'))) throw new Error('Bu dosya bir M3U kanal listesi değil.');
  if (lines.some(line => line.startsWith('#EXT-X-'))) throw new Error('Bu bir HLS yayın bağlantısı. Tek yayın sekmesinden ekleyin.');
  const channels = [], seen = new Set();
  let info = null, skipped = 0, duplicates = 0;
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      let quoted = false, split = -1;
      for (let i = 8; i < line.length; i++) {
        if (line[i] === '"') quoted = !quoted;
        if (line[i] === ',' && !quoted) { split = i; break; }
      }
      const attributes = {};
      for (const match of line.slice(0, split < 0 ? undefined : split).matchAll(/([\w-]+)="([^"]*)"/g)) attributes[match[1].toLowerCase()] = match[2];
      info = { name: (split < 0 ? attributes['tvg-name'] : line.slice(split + 1)) || 'İsimsiz kanal', group: attributes['group-title'] || 'Diğer', logo: attributes['tvg-logo'] || '' };
    } else if (line.startsWith('#EXTGRP:') && info) { info.group = line.slice(8).trim() || 'Diğer'; }
    else if (!line.startsWith('#')) {
      try {
        const channel = makeChannel({ ...(info || { name: `Kanal ${channels.length + 1}` }), url: line }, base);
        if (seen.has(channel.url)) duplicates++;
        else { seen.add(channel.url); channels.push(channel); }
      } catch { skipped++; }
      info = null;
      if (channels.length > MAX_CHANNELS) throw new Error('Bir listede en fazla 10.000 kanal olabilir.');
    }
  }
  if (!channels.length) throw new Error('Listede kullanılabilir bir HTTP veya HTTPS yayını bulunamadı.');
  return { channels, skipped, duplicates };
}

const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
export function filterChannels(channels, { query = '', group = '', favoritesOnly = false, favorites = [] } = {}) {
  const term = query.trim().toLocaleLowerCase('tr');
  const saved = new Set(favorites);
  return channels.filter(channel => (!group || channel.group === group) && (!favoritesOnly || saved.has(channel.id)) && (!term || `${channel.name} ${channel.group}`.toLocaleLowerCase('tr').includes(term)));
}
export function groupsFor(channels) { return [...new Set(channels.map(channel => channel.group))].sort(collator.compare); }
export function streamType(channel) {
  if (channel.type !== 'auto') return channel.type;
  return /\.(mp4|webm|ogg|m4v)$/i.test(new URL(channel.url).pathname) ? 'file' : 'hls';
}
export function mergeChannels(current, incoming) {
  const map = new Map(current.map(channel => [channel.url, channel]));
  for (const channel of incoming) map.set(channel.url, channel);
  if (map.size > MAX_CHANNELS) throw new Error('Kanal arşivinde en fazla 10.000 kanal olabilir.');
  return [...map.values()];
}

export async function fetchPlaylist(url, fetcher = fetch) {
  const href = safeURL(url);
  if (!href) throw new Error('Geçerli bir HTTP veya HTTPS liste bağlantısı girin.');
  if (globalThis.location?.protocol === 'https:' && href.startsWith('http:')) throw new Error('Bu sayfada liste bağlantısı HTTPS olmalı. Alternatif olarak M3U dosyasını yükleyin.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetcher(href, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(`Liste sunucusu ${response.status} hatası döndürdü.`);
    if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Liste en fazla 8 MB olabilir.');
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Liste en fazla 8 MB olabilir.'); }
      chunks.push(value);
    }
    return { text: await new Blob(chunks).text(), base: response.url || href };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Liste sunucusu zamanında yanıt vermedi. Tekrar deneyin.');
    if (error instanceof TypeError) throw new Error('Listeye erişilemedi. Bağlantıyı ve sunucunun CORS iznini kontrol edin; M3U dosyasını da yükleyebilirsiniz.');
    throw error;
  } finally { clearTimeout(timeout); }
}
