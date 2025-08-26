/* ==========================================================================
   ANA UYGULAMA GİRİŞ NOKTASI (app.js) - YENİ YAPI
   Tüm modülleri başlatır ve uygulamayı çalıştırır.
   ========================================================================== */

import { configureLibraries } from '../utils/config.js';
import { initMessageListener } from './message_router.js';
import { initComponents } from '../components/index.js';
// YENİ: Gerekli state fonksiyonu import edildi
import { applyVideoState, setAgentMode, setAgentBarExpanded, setIndexingEnabledState, setAgentActMode } from './state.js';
import { recalculateTotalAndUpdateUI } from '../components/InputArea.js';

document.addEventListener('DOMContentLoaded', () => {
    // Startup log removed in production build

    // 1. Harici kütüphaneleri yapılandır
    configureLibraries();
    
    // 2. Tüm arayüz bileşenlerini başlat
    initComponents();
    
    // 3. Eklentiden gelecek mesajları dinlemeye başla
    initMessageListener();

    // 4. YENİ: Başlangıç arayüz durumlarını uygula
    applyVideoState();

    // 5. YENİ: Kaydedilmiş mod durumunu yükle ve UI'ı güncelle
    const savedAgentMode = localStorage.getItem('agentModeActive') === 'true';
    const savedAgentBarExpanded = localStorage.getItem('agentBarExpanded') === 'true';
    const savedIndexingEnabled = localStorage.getItem('indexingEnabled') === 'true';
    const savedAgentActMode = localStorage.getItem('agentActMode') === 'true';
    
    setAgentMode(savedAgentMode, '');
    // Plan/Act modunu yükle
    setAgentActMode(savedAgentActMode);
    
    // Agent modu aktifse ve bar durumu kaydedilmişse, bar durumunu da yükle
    if (savedAgentMode && savedAgentBarExpanded !== null) {
        setAgentBarExpanded(savedAgentBarExpanded);
    }

    // İndeksleme durumunu yükle
    if (savedIndexingEnabled !== null) {
        setIndexingEnabledState(savedIndexingEnabled);
    }

    // 6. YENİ: Başlangıçta tooltip'i ayarla
    setTimeout(() => {
        recalculateTotalAndUpdateUI();
    }, 200);

    // UI ready
});