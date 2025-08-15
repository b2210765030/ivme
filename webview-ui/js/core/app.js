/* ==========================================================================
   ANA UYGULAMA GİRİŞ NOKTASI (app.js) - YENİ YAPI
   Tüm modülleri başlatır ve uygulamayı çalıştırır.
   ========================================================================== */

import { configureLibraries } from '../utils/config.js';
import { initMessageListener } from './message_router.js';
import { initComponents } from '../components/index.js';
// YENİ: Gerekli state fonksiyonu import edildi
import { applyVideoState } from './state.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("İvme Chat UI Başlatılıyor...");

    // 1. Harici kütüphaneleri yapılandır
    configureLibraries();
    
    // 2. Tüm arayüz bileşenlerini başlat
    initComponents();
    
    // 3. Eklentiden gelecek mesajları dinlemeye başla
    initMessageListener();

    // 4. YENİ: Başlangıç arayüz durumlarını uygula
    applyVideoState();

    console.log("İvme Chat UI Hazır.");
});