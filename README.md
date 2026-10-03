# WebTV

M3U listeleri ve tekil yayın bağlantıları için mobil uyumlu web oynatıcı. Kanal arşivi `index.html`, izleme ekranı `watch.html` üzerinden açılır. Derleme ve sunucu tarafı uygulama gerektirmez.

## Çalıştırma

Proje klasöründe:

```sh
python3 -m http.server 8080
```

Ardından `http://localhost:8080` adresini açın. Dosyaları `file://` ile açmayın; JavaScript modülleri ve tarayıcı depolaması HTTP/HTTPS üzerinden çalışır. Python kuruluysa `npm start` aynı sunucuyu başlatır.

## Kullanım

1. **Liste ekle** düğmesinden bir M3U dosyası yükleyin veya M3U liste bağlantısını girin. Tek bir HLS/MP4 bağlantısı için **Tek yayın** sekmesini kullanın.
2. Mevcut kanallara ekleyebilir veya listenizi değiştirebilirsiniz. Dosyalar en fazla 8 MB, arşiv en fazla 10.000 kanaldır. Aynı yayın adresi tekrar eklenirse birleştirilir. Desteklenmeyen adreslerin sayısı bildirilir.
3. Kanalları ad veya kategoriyle arayın. Kalp düğmesi favorilere ekler. **İzle** bağlantısı izleme sayfasını açar.
4. Oynatıcı kontrollerinden ses, oynatma/duraklatma ve tam ekranı yönetin. Destekleyen tarayıcılarda pencere içinde izleme vardır.
5. Kanal arşivi, favoriler ve son izlenen kanal bu tarayıcının IndexedDB alanında saklanır. Site verilerini temizlemek bunları siler. Başka cihaz veya tarayıcıya kendiliğinden aktarılmaz.

**Örnek yayını dene**, HLS.js projesinin kullandığı Mux test videosunu ekler; gerçek bir TV kanalı veya canlı yayın değildir.

## Yayın desteği ve sınırlar

- HLS, Safari'de yerel video desteğiyle, diğer uyumlu tarayıcılarda HLS.js 1.6.13 ile oynatılır. MP4 ve WebM doğrudan video öğesiyle açılır. Uzantısız adresler varsayılan olarak HLS kabul edilir; tek yayın eklerken biçim elle seçilebilir.
- WebTV yayın dönüştürmez, proxy kullanmaz ve RTSP/UDP, DRM, özel HTTP başlıkları veya Xtream Codes girişini desteklemez. Listedeki özel VLC/Kodi başlık yönergeleri uygulanmaz.
- HLS manifestleri ve parçaları, kaynak sunucuda uygun CORS başlıklarıyla sunulmalıdır. M3U bağlantısından içe aktarma da CORS izni gerektirir. Dosyadan içe aktarma liste CORS sorununu çözebilir; yayın sunucusunun CORS sorununu çözmez.
- HTTPS sayfalarda HTTP yayın ve liste adresleri engellenir; kaynağın HTTPS adresini kullanın. Video codec desteği tarayıcıya bağlıdır.
- Yerel M3U dosyasında tam yayın adresleri kullanın. Bağlantıdan alınan M3U içindeki göreli adresler, yönlendirme sonrasındaki liste adresine göre çözülür.
- Otomatik oynatma tarayıcı tarafından engellenirse video üzerindeki oynat düğmesine basın.
- Kanal adresleri ve içlerindeki erişim anahtarları bu tarayıcıda saklanır ve oynatma sırasında ilgili yayın sunucusuna gönderilir. Liste içerikleri GitHub'a veya uygulamaya ait başka bir sunucuya yüklenmez. Kanal logoları varsa ilgili logo sunucusundan alınır.
- HLS.js 1.6.13 ve Türkçe karakterleri içeren font dosyaları uygulamayla birlikte gelir; arayüz ve oynatıcı için harici CDN gerekmez. Yayınlar, uzaktaki listeler ve kanal logoları için internet bağlantısı gerekir. Tarayıcı yerel HLS desteği sunuyorsa HLS.js yüklenmez.

Teknik referans: [HLS.js dokümantasyonu](https://github.com/video-dev/hls.js/blob/master/docs/API.md).

## Statik yayınlama

Dosyaları herhangi bir statik HTTPS barındırmaya yükleyin. GitHub Pages için repo ayarlarında **Settings → Pages → Deploy from a branch → main / (root)** seçilebilir. Yayın adresi, Pages etkinleştirildikten sonra `https://ilyasilmek.github.io/webtv/` olur. Bu depo Pages'i kendiliğinden etkinleştirmez.

## Test

Node.js 20 veya üstüyle, ek paket kurmadan:

```sh
npm test
```

Testler M3U ayrıştırma, güvenli URL süzme, Türkçe arama, tekrar birleştirme, yayın biçimi ve uzak liste hata/boyut kontrollerini kapsar.

## Dosyalar

- `index.html`: arşiv, içe aktarma penceresi, favoriler.
- `watch.html`: izleme ekranı ve kanal değiştirme.
- `assets/core.js`: liste ayrıştırma, adres doğrulama, filtreler.
- `assets/store.js`: kalıcı IndexedDB deposu ve sekmeler arası bildirim.
- `assets/library.js`, `assets/watch.js`: ekran davranışları.
- `assets/player.js`: HLS ve yerel video oynatma yaşam döngüsü.
- `assets/style.css`, `assets/mark.svg`: tasarım kimliği.
- `assets/fonts.css`, `assets/fonts/`: Barlow Condensed / Source Sans 3 fontları ve SIL OFL lisansları.
- `assets/vendor/`: HLS.js 1.6.13 ve Apache 2.0 lisansı.

Tasarım: televizyon yayın cetveli referansı; kömür, kırık beyaz ve kehribar palet; Barlow Condensed başlıklar ve Source Sans 3 metinler; liste temelli düzen. Klavye odakları, etiketler, azaltılmış hareket desteği ve yerel video kontrolleri kullanılır.
