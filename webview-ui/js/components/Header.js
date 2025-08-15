/* ==========================================================================
   HEADER BİLEŞENİ (GÜNCELLENDİ)
   Üst bar ve ikon butonlarının olaylarını yönetir.
   ========================================================================== */

import * as DOM from '../utils/dom.js';
import * as VsCode from '../services/vscode.js';
import { getState, setAgentMode, setLanguage, setIndexingActive } from '../core/state.js';

// --- Public Fonksiyonlar ---

export function init() {
    DOM.logoButton?.addEventListener('click', () => {
        VsCode.postMessage('showPresentation');
    });

    // Agent modu, buton tıklandığında menü üzerinden seçiliyor (agent_view.js).

    const languageToggle = document.getElementById('language-toggle');
    if (languageToggle) {
        languageToggle.checked = getState().currentLanguage === 'en';
        setLanguage(getState().currentLanguage);

        VsCode.postMessage('languageChanged', { language: getState().currentLanguage });
        languageToggle.addEventListener('change', () => {
            const lang = languageToggle.checked ? 'en' : 'tr';
            setLanguage(lang);
            VsCode.postMessage('languageChanged', { language: lang });
        });
    }

    DOM.newChatButton?.addEventListener('click', () => {
        if (getState().isUiBlocked) return;
        VsCode.postMessage('newChat');
    });
    
    DOM.feedbackButton?.addEventListener('click', () => {
        VsCode.postMessage('showFeedbackMessage');
    });

    // Yeni: İndeksleme butonları
    if (DOM.indexerStartButton) {
        DOM.indexerStartButton.classList.add('icon-button');
        DOM.indexerStartButton.addEventListener('click', () => {
            if (getState().isUiBlocked) return;
            setIndexingActive(true);
            VsCode.postMessage('toggleIndexing');
        });
    }
    if (DOM.indexerCancelButton) {
        DOM.indexerCancelButton.classList.add('icon-button');
        DOM.indexerCancelButton.innerHTML = '<svg class="stop-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z"/></svg>';
        DOM.indexerCancelButton.title = 'Durdur';
        DOM.indexerCancelButton.addEventListener('click', () => {
            // Şimdilik iptal: sadece UI'ı aç/kapa; backend iptal akışı eklenince message gönderilecek
            setIndexingActive(false, { preserveBar: true });
            VsCode.postMessage('indexProjectCancel');
        });
    }
}