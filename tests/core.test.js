import test from 'node:test';
import assert from 'node:assert/strict';
import { parseM3U, makeChannel, mergeChannels, filterChannels, safeURL, streamType, fetchPlaylist, MAX_BYTES } from '../assets/core.js';

test('M3U names with commas, quoted group attributes, BOM and relative streams', () => {
  const result = parseM3U('\uFEFF#EXTM3U\r\n#EXTINF:-1 tvg-logo="logos/one.png" group-title="Haber, Türkiye",Haber, canlı\r\nstreams/one.m3u8\r\n#EXTINF:-1,İkinci\r\n#EXTGRP:Spor\r\nhttps://example.com/two.m3u8', 'https://example.com/list/channels.m3u');
  assert.equal(result.channels[0].name, 'Haber, canlı');
  assert.equal(result.channels[0].group, 'Haber, Türkiye');
  assert.equal(result.channels[0].url, 'https://example.com/list/streams/one.m3u8');
  assert.equal(result.channels[0].logo, 'https://example.com/list/logos/one.png');
  assert.equal(result.channels[1].group, 'Spor');
});
test('unsafe schemes excluded; duplicate URLs collapsed; display text stays text', () => {
  const result = parseM3U('#EXTM3U\n#EXTINF:-1,<script>test</script>\nhttps://example.com/one\n#EXTINF:-1,Duplicate\nhttps://example.com/one\n#EXTINF:-1,Unsafe\njavascript:alert(1)');
  assert.equal(result.channels.length, 1); assert.equal(result.skipped, 1); assert.equal(result.duplicates, 1);
  assert.equal(result.channels[0].name, '<script>test</script>');
  assert.equal(safeURL('data:text/html,test'), ''); assert.equal(safeURL('https://user:pass@example.com/'), '');
});
test('reject empty, HTML and HLS media playlists without losing existing data', () => {
  for (const source of ['', '<html>Error</html>', '#EXTM3U\n#EXT-X-TARGETDURATION:10\npart.ts', '#EXTM3U\nrtsp://example.com']) assert.throws(() => parseM3U(source));
});
test('stable IDs, merge, Turkish search, favorites and stream type with query strings', () => {
  const a = makeChannel({ name: 'İzmir', group: 'Haber', url: 'https://example.com/a.m3u8?token=1' });
  const b = makeChannel({ name: 'Kırklareli', group: 'Yerel', url: 'https://example.com/b.mp4?token=1' });
  assert.equal(a.id, makeChannel({ name: 'Renamed', url: a.url }).id);
  assert.equal(mergeChannels([a], [a, b]).length, 2);
  assert.equal(filterChannels([a,b], { query: 'izmir' })[0].id, a.id);
  assert.equal(filterChannels([a,b], { query: 'kırk' })[0].id, b.id);
  assert.deepEqual(filterChannels([a,b], { favoritesOnly: true, favorites: [b.id], group: 'Yerel' }), [b]);
  assert.equal(streamType(a), 'hls'); assert.equal(streamType(b), 'file');
});
test('remote list is bounded and uses final redirect URL for relative paths', async () => {
  const mock = async () => { const response = new Response('#EXTM3U\n#EXTINF:-1,Channel\nstream.m3u8'); Object.defineProperty(response, 'url', { value: 'https://cdn.example/list/main.m3u' }); return response; };
  const fetched = await fetchPlaylist('https://example.com/list', mock);
  assert.equal(parseM3U(fetched.text, fetched.base).channels[0].url, 'https://cdn.example/list/stream.m3u8');
  await assert.rejects(fetchPlaylist('https://example.com/', async () => new Response('', { headers: { 'content-length': String(MAX_BYTES + 1) } })), /64 MB/);
  await assert.rejects(fetchPlaylist('https://example.com/', async () => new Response('', { status: 403 })), /403/);
  await assert.rejects(fetchPlaylist('https://example.com/', async () => { throw new TypeError('Failed to fetch'); }), /CORS/);
});

test('m3u_plus TS list keeps channel metadata and separates HLS, live TS, movies and series',()=> {
  const list='#EXTM3U\n#EXTINF:-1 tvg-id="channel.tr" tvg-name="TR TV" tvg-logo="http://provider.example/logo.png" group-title="TR | ULUSAL",TR TV HD\nhttp://provider.example/live/demo/example/100.ts\n#EXTINF:-1 group-title="FİLMLER",Film\nhttp://provider.example/movie/demo/example/200.mp4\n#EXTINF:-1 group-title="DİZİLER",Dizi 1\nhttp://provider.example/series/demo/example/300.mkv\n#EXTINF:-1,No extension\nhttp://provider.example/stream?id=400\n#EXTINF:-1,HLS\nhttp://provider.example/live/demo/example/500.m3u8';
  const channels=parseM3U(list,'http://provider.example/get.php?type=m3u_plus&output=ts').channels;
  assert.equal(channels[0].name,'TR TV HD');assert.equal(channels[0].group,'TR | ULUSAL');assert.equal(channels[0].logo,'http://provider.example/logo.png');
  assert.equal(channels[1].logo,'');assert.equal(safeURL('','http://provider.example/get.php?password=example'),'');
  assert.deepEqual(channels.map(streamType),['ts','file','file','ts','hls']);
});
