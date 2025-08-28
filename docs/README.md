# İvme VS Code Extension - Dokümantasyon

<div align="center">
  <h1>🚀 İvme</h1>
  <p><strong>VS Code için Gelişmiş AI Destekli Kod Geliştirme Asistanı</strong></p>
  <p>
    <img src="https://img.shields.io/badge/VS%20Code-1.90.0+-blue.svg" alt="VS Code Version">
    <img src="https://img.shields.io/badge/TypeScript-5.4.5-blue.svg" alt="TypeScript">
    <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
    <img src="https://img.shields.io/badge/Version-2.2.7-orange.svg" alt="Version">
  </p>
</div>

---

## 📚 Dokümantasyon İçeriği

### 🎯 Ana Bölümler

| Bölüm | Başlık | Açıklama |
|-------|--------|----------|
| **01** | [Genel Bakış](./01-genel-bakis.md) | Proje tanımı, özellikler ve teknik altyapı |
| **02** | [Mimari ve Ana Bileşenler](./02-mimari-ve-ana-bilesenler.md) | Sistem mimarisi, dosya yapısı ve bileşen ilişkileri |
| **03** | [Kurulum ve Konfigürasyon](./03-kurulum-ve-konfigrasyon.md) | Sistem gereksinimleri, kurulum ve yapılandırma |
| **04** | [Ana Özellikler](./04-ana-ozellikler.md) | Chat/Agent modları, Planner, İndeksleme |
| **05** | [Servisler (Services)](./05-servisler.md) | Backend servisleri ve API entegrasyonları |
| **06** | [Providers](./06-providers.md) | VS Code provider implementasyonları |
| **07** | [Features](./07-features.md) | Özellik yöneticileri ve handler'lar |
| **08** | [Webview UI](./08-webview-ui.md) | Frontend arayüz ve bileşenler |
| **09** | [Sistem Promptları](./09-sistem-promptlari.md) | AI prompt sistemi ve çoklu dil desteği |
| **10** | [Geliştirici Rehberi](./10-gelistirici-rehberi.md) | Development setup ve katkıda bulunma |
| **11** | [Troubleshooting](./11-troubleshooting.md) | Sorun giderme ve performans optimizasyonu |
| **12** | [API Referansı](./12-api-referansi.md) | Detaylı API dokümantasyonu |

### 🚀 Hızlı Başlangıç

1. **Kurulum**: [Kurulum Rehberi](./03-kurulum-ve-konfigrasyon.md#31-gereksinimler)
2. **İlk Yapılandırma**: [Konfigürasyon](./03-kurulum-ve-konfigrasyon.md#33-ilk-yapilandirma)
3. **Temel Kullanım**: [Ana Özellikler](./04-ana-ozellikler.md#41-chat-ve-agent-modlari)
4. **Gelişmiş Özellikler**: [Planner Sistemi](./04-ana-ozellikler.md#42-planner-system)

### 🔧 Geliştirici Kaynakları

- **[Development Setup](./10-gelistirici-rehberi.md#101-development-setup)** - Geliştirme ortamı kurulumu
- **[Mimari Rehberi](./02-mimari-ve-ana-bilesenler.md)** - Sistem mimarisi ve tasarım prensipleri
- **[API Referansı](./12-api-referansi.md)** - Detaylı API dokümantasyonu
- **[Katkıda Bulunma](./10-gelistirici-rehberi.md#105-katki-sureci)** - Contribution guidelines

### 📖 Kullanıcı Rehberleri

- **[Yeni Başlayanlar için](./04-ana-ozellikler.md#41-chat-ve-agent-modlari)** - Temel kullanım
- **[İleri Düzey Kullanım](./04-ana-ozellikler.md#42-planner-system)** - Advanced features
- **[Sorun Giderme](./11-troubleshooting.md)** - Yaygın sorunlar ve çözümler
- **[En İyi Uygulamalar](./04-ana-ozellikler.md#44-best-practices)** - Önerilen kullanım şekilleri

---

## 🌟 Öne Çıkan Özellikler

### 🤖 **Çoklu AI Desteği**
- **vLLM**: Yerel LLM sunucuları ile hızlı ve güvenli çalışma
- **Google Gemini**: Bulut tabanlı güçlü AI modelleri
- **Otomatik Fallback**: Servisler arası sorunsuz geçiş

### 💡 **Akıllı Kod Analizi**
- **AST-based Parsing**: Babel ile derin kod anlayışı
- **Vector Embeddings**: Semantic kod arama
- **Multi-language Support**: JS/TS, Python, C/C++, JSON, CSS

### 🎯 **Agent Sistemi**
- **Context-Aware**: Aktif dosya ve seçim takibi
- **Plan & Execute**: Otomatik görev planlama ve uygulama
- **Tool Integration**: Dinamik araç sistemi

### 🔧 **Developer Experience**
- **VS Code Native**: Code Actions, Hover, CodeLens
- **Modern UI**: Responsive webview arayüzü
- **Multilingual**: Türkçe ve İngilizce destek

---

## 📊 Sistem Gereksinimleri

| Bileşen | Minimum | Önerilen |
|---------|---------|----------|
| **VS Code** | 1.90.0 | Latest |
| **Node.js** | 18.x | 20.x+ |
| **RAM** | 4GB | 8GB+ |
| **Storage** | 1GB | 2GB+ |

### AI Servisleri
- **vLLM**: Yerel sunucu (önerilen)
- **Gemini**: Google AI Studio API key

---

## 🚀 Hızlı Kurulum

```bash
# Extension kurulumu
code --install-extension baykar-ivme-2.2.7.vsix

# vLLM sunucusu (opsiyonel)
pip install vllm
python -m vllm.entrypoints.openai.api_server --model Qwen/Qwen1.5-7B-Chat
```

Detaylı kurulum talimatları için: [Kurulum Rehberi](./03-kurulum-ve-konfigrasyon.md)

---

## 🤝 Topluluk ve Destek

### 📞 İletişim
- **GitHub Issues**: Hata raporları ve özellik istekleri
- **Discussions**: Genel sorular ve tartışmalar
- **Documentation**: Bu dokümantasyon sitesi

### 🔄 Güncellemeler
- **Release Notes**: Her sürüm için detaylı değişiklik notları
- **Migration Guides**: Sürüm geçiş rehberleri
- **Backward Compatibility**: Eski sürüm uyumluluğu

---

## 📄 Lisans

Bu proje MIT Lisansı altında lisanslanmıştır. Detaylar için [LICENSE](../LICENSE) dosyasına bakın.

---

## 🙏 Katkıda Bulunanlar

Bu projeyi geliştiren herkese teşekkürler! Katkıda bulunmak için [Geliştirici Rehberi](./10-gelistirici-rehberi.md)'ni inceleyin.

---

<div align="center">
  <p><strong>İvme ile kodlama deneyiminizi bir üst seviyeye taşıyın! 🚀</strong></p>
  <p><em>v2.2.7 | Son güncelleme: 2024</em></p>
</div>
