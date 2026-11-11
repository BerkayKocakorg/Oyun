# Kartopu Taburu

Mobil tarayıcıda çalışan, tek elle oynanan 3D bir "şerit seç – orduyu büyüt – hattı savun" oyunu.
Penguen taburunu buz yolunda yönlendir, kapılardan geçerek büyüt, kor sürülerini kartopuyla söndür
ve bölüm sonunda Volkan Devi'ne karşı hattı tut.

## Nasıl oynanır

- **Sürükle:** Parmağını (veya fareyi) sağa sola sürükleyerek taburu yönlendir. Klavyede ok tuşları / A-D.
- **Kapılar:** Yeşil `+N` penguen ekler, sarı `×N` taburu katlar, kırmızı `−N` azaltır.
  Mor kapıyı vurdukça değeri büyür.
- **Buz blokları:** Üstündeki sayı kadar isabetle kırılır. Kırmadan çarparsan penguen kaybedersin.
- **Şerit seçimi:** Bir şeritte güvenli kapılar, diğerinde kor sürüsü ve büyük ödül vardır.
- **Lav havuzları:** Üstünden geçen penguenler erir, etrafından dolaş.
- **Son savunma:** Tabur çizgide durur. Altın sandıkları vurarak takviye al, Volkan Devi sana ulaşmadan söndür.
- **Yükseltmeler:** Kazandığın altınla başlangıç taburunu, kartopu gücünü, atış hızını ve ganimeti artır.
  İlerleme cihazda saklanır.

## Çalıştırma

Derleme adımı yok; depo statik dosyalardan oluşur.

```bash
python3 -m http.server 8000
# sonra tarayıcıda http://localhost:8000
```

GitHub Pages ile yayınlamak için depo ayarlarından **Pages → Deploy from a branch** seçip kök dizini (`/`) göstermek yeterli.
Telefonda sayfayı açıp "Ana ekrana ekle" dersen tam ekran uygulama gibi açılır.

## Dosyalar

| Dosya | İçerik |
| --- | --- |
| `index.html` | Sayfa, arayüz ve stiller |
| `js/game.js` | Oyunun tamamı: bölüm üretimi, simülasyon, çizim, ses, kayıt |
| `vendor/three.min.js` | three.js r160 (MIT, lisansı `vendor/THREE-LICENSE`) |
| `manifest.webmanifest`, `icon.svg` | Ana ekrana ekleme için |

Bölümler bölüm numarasından üretilir (sonsuz bölüm). Dil, tarayıcı diline göre Türkçe ya da İngilizce seçilir.
Sesler Web Audio ile üretilir; harici ses ya da görsel dosyası yoktur.
