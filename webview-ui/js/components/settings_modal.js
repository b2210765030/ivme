/* ==========================================================================
   SETTINGS MODAL BİLEŞENİ (GÜNCELLENMİŞ)
   ========================================================================== */
   
import * as DOM from '../utils/dom.js';
import * as VsCode from '../services/vscode.js';
// YENİ: Gerekli state fonksiyonları import edildi
import { getState, setBackgroundVideoEnabled } from '../core/state.js';

function closeModal() {
    DOM.settingsModal.classList.add('hidden');
    // Hata mesajını temizle
    const errorContainer = document.getElementById('vllm-connection-error');
    if (errorContainer) {
        errorContainer.classList.add('hidden');
        errorContainer.textContent = '';
    }
}

function handleServiceChange() {
    DOM.vllmSettings.classList.toggle('hidden', DOM.serviceSelect.value === 'Gemini');
    DOM.geminiSettings.classList.toggle('hidden', DOM.serviceSelect.value !== 'Gemini');
}

// --- Public Fonksiyonlar ---

export function init() {
    DOM.settingsButton.addEventListener('click', () => {
        VsCode.postMessage('requestConfig');
        DOM.settingsModal.classList.remove('hidden');
    });

    DOM.cancelSettingsButton.addEventListener('click', closeModal);
    DOM.settingsModal.addEventListener('click', (event) => {
        if (event.target === DOM.settingsModal) closeModal();
    });

    DOM.navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const currentActiveButton = document.querySelector('.nav-button.active');
            if (currentActiveButton === button) return;
            
            document.querySelector('.settings-pane.active')?.classList.remove('active');
            currentActiveButton?.classList.remove('active');

            button.classList.add('active');
            document.getElementById(button.dataset.target).classList.add('active');
        });
    });

    DOM.serviceSelect.addEventListener('change', handleServiceChange);

    // YENİ: Video Oynatma Butonu Mantığı
    const videoToggle = document.getElementById('video-toggle-switch');
    if (videoToggle) {
        // Butonun başlangıç durumunu state'den al
        videoToggle.checked = getState().isBackgroundVideoEnabled;

        // Değiştiğinde state'i güncelle
        videoToggle.addEventListener('change', (event) => {
            setBackgroundVideoEnabled(event.currentTarget.checked);
        });
    }

    // YENİ: Diffusion Effect Butonu (Şimdilik sadece state değiştirir, mantığı ChatView.js'de)
    const effectToggle = document.getElementById('effect-toggle-switch');
    if (effectToggle) {
        effectToggle.disabled = true;
        effectToggle.checked = false;
    }

    DOM.settingsForm.addEventListener('submit', (event) => {
        event.preventDefault();
        
        const errorContainer = document.getElementById('vllm-connection-error');
        if (errorContainer) {
            errorContainer.classList.add('hidden');
            errorContainer.textContent = '';
        }

        const saveButton = DOM.settingsForm.querySelector('button[type="submit"]');
        saveButton.disabled = true;
        saveButton.textContent = 'Test Ediliyor...';

        const settingsPayload = {
            activeApiService: DOM.serviceSelect.value,
            vllmBaseUrl: DOM.vllmUrlInput.value,
            vllmModelName: DOM.vllmModelInput.value,
            geminiApiKey: DOM.geminiKeyInput.value,
            conversationHistoryLimit: DOM.historyLimitInput.value
        };
        VsCode.postMessage('saveSettings', settingsPayload);
    });
}

export function handleSaveResult(payload) {
    const saveButton = DOM.settingsForm.querySelector('button[type="submit"]');
    saveButton.disabled = false;
    saveButton.textContent = 'Kaydet';

    if (payload.success) {
        closeModal();
    } else {
        const errorContainer = document.getElementById('vllm-connection-error');
        if (errorContainer && DOM.serviceSelect.value === 'vLLM') {
            errorContainer.textContent = payload.message || 'Bilinmeyen bir hata oluştu.';
            errorContainer.classList.remove('hidden');
        } else {
            // vLLM seçili değilse genel bir VS Code hatası göster
            // Bu normalde SettingsManager'dan gelen bir hata olur
            vscode.window.showErrorMessage(payload.message);
        }
    }
}

export function loadConfig(config) {
    DOM.vllmUrlInput.value = config.vllmBaseUrl;
    DOM.vllmModelInput.value = config.vllmModelName;
    DOM.geminiKeyInput.value = config.geminiApiKey;
    DOM.historyLimitInput.value = config.conversationHistoryLimit;
    DOM.serviceSelect.value = config.activeApiService;
    handleServiceChange();
}