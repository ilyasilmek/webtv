# WebTV 1.1

M3U / `m3u_plus` kanal listeleri için web oynatıcı. HTTP IPTV kaynaklarını, MPEG-TS (`.ts`), HLS (`.m3u8`) ve tarayıcının desteklediği video dosyalarını açar. Tasarım ve iki ekran korunur: `index.html` kanal arşivi, `watch.html` izleme ekranı.

## Başlatma

Node.js 22 veya üstüyle, ek paket kurmadan:

```sh
npm start
```

`http://localhost:8080` adresini açın. `PORT` ve `HOST` ortam değişkenleriyle dinleme adresi ayarlanabilir.

Docker ile:

```sh
docker build -t webtv .
docker run --rm -p 8080:8080 webtv
```

Canlı kullanım için Node.js veya Docker destekleyen bir sunucuda çalıştırın; HTTPS'i barındırma sağlayıcısı ya da ters proxy üzerinden sağlayın. Proxy orijinal Host başlığını korumalıdır. İstenirse `APP_ORIGIN=https://tv.example.com` ile izin verilen uygulama adresi sabitlenir.

**HTTP ve CORS kısıtlı kaynaklar için GitHub Pages tek başına yeterli değildir.** Pages yalnızca statik dosyaları sunar; bu sürümdeki Node.js bağlantı sunucusunu çalıştırmaz. Sunucu olmadan HTTPS ve CORS uyumlu kaynaklarda doğrudan oynatma devam eder. Kaynak HTTP kullanıyorsa tam Node.js sürümünü açın.

## Liste ekleme

1. **Liste ekle → Liste bağlantısı** sekmesine kendi `get.php?username=…&password=…&type=m3u_plus&output=ts` bağlantınızı yapıştırın. Liste bağlantıları uygulama sunucusu üzerinden kaynak sunucudan alınır.
2. İsterseniz M3U dosyası yükleyin. Listede `tvg-name`, `tvg-logo` ve `group-title` bulunabilir; görünen kanal adı ve kategoriler korunur.
3. Mevcut arşive ekleme veya listeyi değiştirme seçeneğini kullanın. En fazla 64 MB / 100.000 yayın desteklenir. Tekrar eden yayın adresleri birleştirilir.
4. **İzle** düğmesiyle kanalı açın. Arama, kategoriler, favoriler, son izlenen kanal, tam ekran ve destekleyen tarayıcılarda pencere içinde izleme vardır.

Gösterim her seferinde 100 satırla sınırlıdır; **Daha fazla kanal göster** ile artırılır. Büyük arşivler için kanal verisi ile favori/son izlenen bilgisi ayrı depolama kayıtlarına yazılır. Önceki sürümün arşivi ilk kaydetmede korunarak taşınır.

## Oynatma

- `.ts`, `.m2ts`, uzantısız `/live/…` ve tipik uzantısız IPTV kanal adresleri MPEG-TS olarak açılır. `output=ts` listelerindeki diğer uzantısız yayınlar da TS kabul edilir.
- `.m3u8` HLS olarak açılır. HLS varyantları, segmentler, şifreleme anahtarı ve başlangıç parçası bağlantıları aynı uygulama sunucusundan geçirilir.
- `/movie/…`, `/series/…` ve MP4/WebM gibi dosyalar video dosyası olarak açılır. MKV/AVI adreslerinin içe alınması, tüm codec'lerinin tarayıcıda desteklendiği anlamına gelmez.
- **Tek yayın** sekmesinden TS, HLS veya dosya biçimi elle seçilebilir.
- MPEG-TS için mpegts.js 1.8.0, HLS için HLS.js 1.6.13 uygulama dosyalarına dahildir. Yerel HLS desteği varsa tarayıcının oynatıcısı kullanılır. Türkçe karakterleri içeren Barlow Condensed ve Source Sans 3 fontları da paket içindedir.
- Sunucu akışı iletir; **codec dönüştürmez**. H.264/AAC gibi tarayıcının desteklediği video/ses biçimleri gerekir. Kaynağın hesap, ülke, IP, eşzamanlı bağlantı ve DRM kısıtları uygulama tarafından kaldırılmaz.
- RTSP/UDP, DRM, Xtream Codes katalog API'si veya VLC/Kodi özel başlık yönergeleri desteklenmez. Burada desteklenen Xtream kullanım biçimi `get.php` üzerinden alınan M3U listesidir.

Kaynak erişim reddi, zaman aşımı veya desteklenmeyen codec olduğunda hata gösterilir. Hesap bağlantıları ve hata yanıtları için tam kaynak URL'si günlük dosyasına yazılmaz.

## Veriler ve bağlantı sunucusu

Kanal arşivi, yayın adresleri, favoriler ve son izlenen kanal bu tarayıcının IndexedDB alanında saklanır. Site verilerini temizlemek bunları siler. Başka cihazlara otomatik aktarılmaz. Listeler ve şifreler depoya gömülmez.

Liste/yayın/görsel adresleri, kaynaklara bağlanmak için uygulama sunucusuna iletilir. Sunucu bunları diske veya kalıcı veritabanına kaydetmez. Oturum rotaları bellek içinde tutulur; oynatma açıkken yenilenir. Sunucu yeniden başlatılırsa yayını tekrar açın.

Bağlantı rotaları rastgele, oturuma bağlı kimlik kullanır; tarayıcıdaki oynatma URL'sine kullanıcı adı veya şifre yazılmaz. POST işlemleri aynı uygulama adresinden kabul edilir. Her kaynak isteğinde DNS çözümü doğrulanır ve bağlantıya sabitlenir; yerel ağ, loopback ve özel IP adresleri reddedilir. Yönlendirmeler de tekrar doğrulanır. İstekler ve eşzamanlı akışlar sınırlandırılır. HLS ve logo rotaları kaynak URL'sini görünür bağlantılara kopyalamaz.

**Örnek yayını dene**, Mux test videosunu ekler; canlı TV kanalı değildir.

## Test ve dosyalar

```sh
npm test
```

Testler M3U ayrıştırma, TS/HLS/dosya ayrımı, Türkçe arama, HTTP liste aktarımı, HLS manifest yönlendirmesi, oturum izolasyonu, erişim hataları ve özel ağ adreslerinin reddini kapsar.

- `server.js`, `server/network.js`: Node.js sunucusu ve doğrulanan kaynak bağlantıları.
- `assets/connection.js`: liste, oynatma ve kanal logosu bağlantıları.
- `assets/core.js`: ayrıştırma ve filtreler.
- `assets/store.js`: IndexedDB arşivi ve sekmeler arası bildirim.
- `assets/library.js`, `assets/watch.js`, `assets/player.js`: arşiv, izleme ekranı ve oynatıcı yaşam döngüsü.
- `assets/style.css`, `assets/mark.svg`, `assets/fonts*`: onaylanan yayın cetveli kimliği.
- `assets/vendor/`: HLS.js / mpegts.js ve Apache 2.0 lisansları; font lisansları `assets/fonts/` içinde.

Teknik referanslar: [HLS.js](https://github.com/video-dev/hls.js), [mpegts.js](https://github.com/xqq/mpegts.js).
