import { streamType } from './core.js';

let hlsLibrary;
function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (!hlsLibrary) hlsLibrary = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('./vendor/hls-1.6.13.min.js', import.meta.url).href;
    script.crossOrigin = 'anonymous'; script.referrerPolicy = 'no-referrer';
    const timer = setTimeout(() => { script.remove(); hlsLibrary = null; reject(new Error('Oynatıcı bileşeni yüklenemedi. İnternet bağlantısını kontrol edip yeniden deneyin.')); }, 15000);
    script.onload = () => { clearTimeout(timer); if (window.Hls) resolve(window.Hls); else { hlsLibrary = null; reject(new Error('Oynatıcı bileşeni başlatılamadı.')); } };
    script.onerror = () => { clearTimeout(timer); script.remove(); hlsLibrary = null; reject(new Error('Oynatıcı bileşeni yüklenemedi. İnternet bağlantısını kontrol edip yeniden deneyin.')); };
    document.head.append(script);
  });
  return hlsLibrary;
}

export class Player {
  constructor(video, status) {
    this.video = video; this.status = status; this.generation = 0; this.hls = null; this.abort = null; this.timer = null;
  }
  stop() {
    this.generation++; clearTimeout(this.timer); this.abort?.abort(); this.hls?.destroy(); this.hls = null;
    this.video.pause(); this.video.removeAttribute('src'); this.video.load();
  }
  async open(channel) {
    this.stop();
    const generation = this.generation;
    const active = () => generation === this.generation;
    this.abort = new AbortController();
    const on = (event, action) => this.video.addEventListener(event, () => { if (active()) action(); }, { signal: this.abort.signal });
    const status = (kind, text = '') => { if (active()) this.status(kind, text); };
    const fail = text => {
      if (!active()) return;
      this.stop(); this.status('error', text);
    };
    const play = () => {
      if (!active()) return;
      this.video.play().catch(error => {
        if (!active() || error.name === 'AbortError') return;
        if (error.name === 'NotAllowedError') { clearTimeout(this.timer); status('ready', 'Yayını başlatmak için oynat düğmesine basın.'); }
        else fail('Yayın oynatılamadı. Kaynağın erişilebilirliğini ve video biçimini kontrol edin.');
      });
    };
    status('loading', 'Yayın açılıyor…');
    if (location.protocol === 'https:' && channel.url.startsWith('http:')) { fail('Bu sayfa HTTPS kullanıyor. Yayının HTTPS bağlantısını ekleyin.'); return; }
    this.timer = setTimeout(() => fail('Yayın zamanında yanıt vermedi. Kaynağı kontrol edip yeniden deneyin.'), 30000);
    on('playing', () => { clearTimeout(this.timer); status('playing', 'Yayın açık'); });
    on('waiting', () => status('buffering', 'Yayın yükleniyor…'));
    on('pause', () => { if (!this.video.ended) status('paused', 'Duraklatıldı'); });
    on('ended', () => status('ended', 'Yayın sona erdi'));
    on('error', () => fail('Yayın açılamadı. Kaynak çevrimdışı olabilir veya tarayıcı bu biçimi desteklemiyor.'));
    try {
      if (streamType(channel) === 'file' || this.video.canPlayType('application/vnd.apple.mpegurl')) {
        this.video.src = channel.url;
        on('loadedmetadata', play);
        this.video.load();
      } else {
        const Hls = await loadHls();
        if (!active()) return;
        if (!Hls.isSupported()) { fail('Bu tarayıcı HLS yayınlarını desteklemiyor. Güncel bir tarayıcı kullanın.'); return; }
        const hls = new Hls({ enableWorker: true, maxBufferLength: 30 }); this.hls = hls;
        let recovery = 0;
        hls.on(Hls.Events.MANIFEST_PARSED, () => { if (active()) play(); });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!active() || !data.fatal) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recovery++ < 1) hls.recoverMediaError();
          else fail(data.type === Hls.ErrorTypes.NETWORK_ERROR ? 'Yayına erişilemedi. Yayın bağlantısını, ağınızı ve kaynak sunucunun CORS iznini kontrol edin.' : 'Bu yayın tarayıcıda çözülemedi. Kaynağın video biçimini kontrol edin.');
        });
        hls.loadSource(channel.url); hls.attachMedia(this.video);
      }
    } catch (error) { if (active()) fail(error.message); }
  }
}
