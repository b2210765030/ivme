/* ==========================================================================
   GLOBAL DURUM (STATE) YÖNETİM MODÜLÜ (GÜNCELLENMİŞ)
   ========================================================================== */

import * as DOM from '../utils/dom.js';
import { updateInputAndButtonState, setPlaceholder } from '../components/InputArea.js';

// --- Arayüz Durumları ---
let isAiResponding = false;
let currentAnimationEffect = 'streaming';
let isBackgroundVideoEnabled = localStorage.getItem('backgroundVideoEnabled') !== 'false';
let isAgentModeActive = localStorage.getItem('agentModeActive') === 'true'; // Agent modu durumu - localStorage'dan yükle
let currentAgentFileName = '';
let isAgentSelectionActive = false; // YENİ: Agent modunda seçili alan olup olmadığını gösterir.
let isAgentBarExpanded = localStorage.getItem('agentBarExpanded') === 'true'; // Agent bağlam barının açık/kapalı durumu - localStorage'dan yükle

let currentLanguage = localStorage.getItem('language') || 'tr';

// İndeksleme UI durumu
let isIndexing = false;
let indexingProgress = 0; // 0..100
let indexingMessage = '';
let isIndexingEnabled = localStorage.getItem('indexingEnabled') === 'true'; // İndeksleme açık/kapalı durumu - localStorage'dan yükle
let currentWorkspaceName = ''; // YENİ: Aktif workspace adı

// Konuşma başladıktan sonra dil ve agent modunun kilitlenmesi için bayrak
let isConversationLocked = false;


// --- Token Sayacı ve Limit Durumu ---
let TOKEN_LIMIT = 12000; // 12 bin token limiti (varsayılan)
let conversationTokens = 0;
let filesTokens = 0;

// --- State Getters (Durumları Okuma) ---
export const getState = () => ({
    isAiResponding,
    isUiBlocked: isAiResponding || isIndexing,
    currentAnimationEffect,
    isBackgroundVideoEnabled,
    isAgentModeActive,
    currentLanguage,
    isConversationLocked,
    TOKEN_LIMIT,
    conversationTokens,
    filesTokens,
    isAgentSelectionActive, // YENİ: Agent seçim durumunu ekle
    isIndexing,
    indexingProgress,
    indexingMessage,
    isIndexingEnabled // YENİ: İndeksleme açık/kapalı durumu
});

// --- State Setters (Durumları Güncelleme) ---

export function setAiResponding(value) {
    isAiResponding = value;
    setPlaceholder();
    updateInputAndButtonState();
}

// YENİ: Agent bağlam barı görünürlük bayrağı
export function setAgentBarExpanded(value) {
    isAgentBarExpanded = !!value;
    // Bar durumunu localStorage'a kaydet
    localStorage.setItem('agentBarExpanded', isAgentBarExpanded.toString());
}

// GÜNCELLENDİ: Agent modunu dosya adına göre güncelleyen fonksiyon
export function setAgentMode(isActive, activeFileName = '') {
    isAgentModeActive = isActive;
    // Mod durumunu localStorage'a kaydet
    localStorage.setItem('agentModeActive', isActive.toString());
    const agentModeButton = document.getElementById('agent-mode-button');
    const agentStatusBar = document.getElementById('agent-status-bar');
    const agentCollapsedBtn = document.getElementById('agent-status-collapsed');
    const agentStatusText = document.getElementById('agent-status-text');
    const agentRemoveBtn = document.getElementById('agent-selection-remove');

    // Yeni: Agent mod indeksleme butonlarının görünürlüğü
    const startBtn = DOM.indexerStartButton;
    const cancelBtn = DOM.indexerCancelButton;
    // İndeksleme devam ederken buton görünürlüğünü değiştirmeyelim
    if (!isIndexing && startBtn && cancelBtn) {
        if (isActive) {
            startBtn.classList.remove('hidden');
            cancelBtn.classList.add('hidden');
        } else {
            startBtn.classList.add('hidden');
            cancelBtn.classList.add('hidden');
        }
    }

    if (isActive) {
        agentModeButton.classList.add('active');
        if (typeof agentModeButton?.textContent === 'string') {
            agentModeButton.textContent = 'Agent';
        }
        if (activeFileName) currentAgentFileName = activeFileName;
        if (agentStatusBar && agentStatusText) {
            const text = activeFileName || currentAgentFileName;
            if (text) {
                agentStatusText.textContent = text;
            } else {
                // Dosya adı yoksa varsayılan metin göster
                agentStatusText.textContent = 'Agent Modu';
            }
            
            // Bar açık ise barı göster, değilse sadece ikon göster
            if (agentCollapsedBtn) {
                if (isAgentBarExpanded) {
                    agentCollapsedBtn.classList.add('hidden');
                    agentStatusBar.classList.remove('hidden');
                } else {
                    agentCollapsedBtn.classList.remove('hidden');
                    agentStatusBar.classList.add('hidden');
                }
            }
            // Seçim yokken kaldırma butonunu gizle
            if (agentRemoveBtn) agentRemoveBtn.classList.add('hidden');
        }
        // Agent modu açıldığında indeksleme durumunu kontrol et
        checkAndUpdateIndexingState();
    } else {
        agentModeButton.classList.remove('active');
        if (typeof agentModeButton?.textContent === 'string') {
            agentModeButton.textContent = 'Chat';
        }
        // Agent kapatıldığında seçim göstergesini gizle
        clearAgentSelectionStatus();
        if (agentStatusBar) agentStatusBar.classList.add('hidden');
        if (agentCollapsedBtn) agentCollapsedBtn.classList.add('hidden');
        currentAgentFileName = '';
        // isAgentBarExpanded'ı sıfırlamayalım, sadece UI'ı gizleyelim
        // Index butonunu da sıfırlamayalım, sadece UI'ı gizleyelim
    }
}

// İndeksleme UI state
export function setIndexingActive(active, options) {
    isIndexing = active;
    const startBtn = DOM.indexerStartButton;
    const cancelBtn = DOM.indexerCancelButton;
    const progress = DOM.indexerProgress;
    if (active) {
        // Başlat butonunu gizle, iptal butonunu göster (varsa)
        if (startBtn) startBtn.classList.add('hidden');
        if (cancelBtn) cancelBtn.classList.remove('hidden');
        if (progress) progress.classList.remove('hidden');
    } else {
        // Agent modu aktifse başlat butonu görünür olsun
        if (startBtn && isAgentModeActive) startBtn.classList.remove('hidden');
        if (cancelBtn) cancelBtn.classList.add('hidden');
        // Barı korumak istenmezse gizle ve sıfırla; preserveBar true ise görünür ve değerler korunur
        const preserve = options && options.preserveBar === true;
        if (!preserve) {
            if (progress) progress.classList.add('hidden');
            indexingProgress = 0;
            indexingMessage = '';
            updateIndexerProgressUI();
        }
    }
    setPlaceholder();
    updateInputAndButtonState();
}

export function updateIndexerProgress(value, message = '') {
    indexingProgress = Math.max(0, Math.min(100, value));
    indexingMessage = message || indexingMessage;
    updateIndexerProgressUI();
}

// YENİ: İndeksleme açık/kapalı durumunu ayarlar
export function setIndexingEnabledState(enabled) {
    isIndexingEnabled = enabled;
    // İndeksleme durumunu localStorage'a kaydet
    localStorage.setItem('indexingEnabled', isIndexingEnabled.toString());
    const startBtn = DOM.indexerStartButton;
    if (startBtn) {
        if (enabled) {
            startBtn.classList.add('indexing-enabled');
            startBtn.title = 'İndeksleme aktif - Kapatmak için tıklayın';
        } else {
            startBtn.classList.remove('indexing-enabled');
            startBtn.title = 'İndeksleme kapalı - Açmak için tıklayın';
        }
    }
}

// YENİ: VS Code ayarlarından indeksleme durumunu kontrol eder
export async function checkAndUpdateIndexingState() {
    try {
        // VS Code API'sini kullanarak ayarları kontrol et
        const vscode = acquireVsCodeApi();
        vscode.postMessage({ type: 'requestIndexingStatus' });
    } catch (e) {
        console.warn('Indexing status check failed:', e);
    }
}

function updateIndexerProgressUI() {
    const fill = DOM.indexerProgressBarFill;
    const text = DOM.indexerProgressText;
    if (fill) fill.style.width = `${indexingProgress}%`;
    if (text) text.textContent = indexingMessage ? `${indexingMessage}` : '';
}

// YENİ: Agent seçim durumunu göster/gizle
export function setAgentSelectionStatus(fileName, startLine, endLine) {
    const agentStatusBar = document.getElementById('agent-status-bar');
    const agentStatusText = document.getElementById('agent-status-text');
    const agentRemoveBtn = document.getElementById('agent-selection-remove');
    if (!agentStatusBar || !agentStatusText) return;
    currentAgentFileName = fileName || currentAgentFileName;
    agentStatusText.textContent = `${currentAgentFileName} (${startLine}-${endLine})`;
    // Bar sadece kullanıcı açtıysa gösterilsin
    if (isAgentBarExpanded) {
        agentStatusBar.classList.remove('hidden');
    }
    isAgentSelectionActive = true; // Seçim aktif hale geldi
    // Seçim varken kaldırma butonunu göster
    if (agentRemoveBtn) agentRemoveBtn.classList.remove('hidden');
}

export function clearAgentSelectionStatus() {
    const agentStatusBar = document.getElementById('agent-status-bar');
    const agentStatusText = document.getElementById('agent-status-text');
    const agentRemoveBtn = document.getElementById('agent-selection-remove');
    if (!agentStatusBar || !agentStatusText) return;
    isAgentSelectionActive = false; // Seçim pasif hale geldi
    if (isAgentModeActive && currentAgentFileName) {
        // Sadece satır aralığını kaldır, dosya adı kalsın
        agentStatusText.textContent = currentAgentFileName;
        if (isAgentBarExpanded) {
            agentStatusBar.classList.remove('hidden');
        } else {
            agentStatusBar.classList.add('hidden');
        }
        // Seçim yok, kaldırma butonunu gizle
        if (agentRemoveBtn) agentRemoveBtn.classList.add('hidden');
    } else {
        agentStatusBar.classList.add('hidden');
    }
}

// Öneri çubuğu kaldırıldı

export function toggleAnimationEffect() {
    currentAnimationEffect = 'streaming';
    localStorage.setItem('animationEffect', currentAnimationEffect);
}

export function setBackgroundVideoEnabled(enabled) {
    isBackgroundVideoEnabled = enabled;
    localStorage.setItem('backgroundVideoEnabled', enabled);
    applyVideoState();
}

export function applyVideoState() {
    if (DOM.welcomeVideo) {
        if (isBackgroundVideoEnabled) {
            DOM.welcomeVideo.style.display = 'block';
        } else {
            DOM.welcomeVideo.style.display = 'none';
            DOM.welcomeVideo.pause();
        }
    }
}

export function setContextSize(newConversationTokens, newFilesTokens) {
    conversationTokens = newConversationTokens;
    filesTokens = newFilesTokens;
}

export function incrementConversationSize(tokens) {
    conversationTokens += tokens;
}

export function resetConversationSize() {
    conversationTokens = 0;
}

export function resetFilesSize() {
    filesTokens = 0;
}


// Konuşma başladıktan sonra dil ve agent modu seçeneklerini kilitle
export function lockConversation() {
    // Sohbet sırasında TR-EN ve Agent butonlarını kilitlemeyelim
    isConversationLocked = false;
}

// Yeni bir sohbete geçildiğinde kilitleri kaldır
export function unlockConversation() {
    isConversationLocked = false;
}



export function resetChatState() {
    conversationTokens = 0;
    filesTokens = 0;
    isAiResponding = false;
    DOM.fileContextArea.innerHTML = '';
    updateInputAndButtonState();
    setPlaceholder();
    // Agent modunu ve indeksleme durumunu koruyalım, sadece seçimi temizleyelim
    // setAgentMode(false); // Bu satırı kaldırıyoruz
    isAgentSelectionActive = false; // Sohbet sıfırlandığında seçimi de sıfırla
    unlockConversation(); 
}

export function setLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('language', lang);

    if (DOM.languageWarning) {
        if (lang === 'tr') {
            DOM.languageWarning.classList.remove('invisible');
        } else {
            DOM.languageWarning.classList.add('invisible');
        }
    }

    // UI metinlerini güncelle
    updateUITexts();
}

// Dil değişikliği sırasında tüm UI metinlerini güncelle
export function updateUITexts() {
    const subtitle = document.getElementById('welcome-subtitle');
    const input = document.getElementById('prompt-input');
    if (subtitle) {
        subtitle.textContent = DOM.getText('welcomeSubtitle');
    }
    if (input) {
        input.setAttribute('placeholder', DOM.getText('placeholder'));
    }
    setPlaceholder();
    
    // Buton metinlerini güncelle
    if (DOM.sendButton) {
        const { isAiResponding } = getState();
        DOM.sendButton.title = isAiResponding ? DOM.getText('stop') : DOM.getText('send');
    }
    
    // HTML metinlerini güncelle
    updateHTMLTexts();
}

// HTML metinlerini güncelle
function updateHTMLTexts() {
    // Buton title'larını güncelle
    const attachFileButton = document.getElementById('attach-file-button');
    if (attachFileButton) {
        attachFileButton.title = DOM.getText('attachFile');
    }
    
    const agentModeButton = document.getElementById('agent-mode-button');
    if (agentModeButton) {
        agentModeButton.title = DOM.getText('modChange');
    }
    
    const indexerStartButton = document.getElementById('indexer-start-button');
    if (indexerStartButton) {
        indexerStartButton.title = DOM.getText('indexProject');
        indexerStartButton.setAttribute('aria-label', DOM.getText('indexProject'));
    }
    
    const indexerCancelButton = document.getElementById('indexer-cancel-button');
    if (indexerCancelButton) {
        indexerCancelButton.title = DOM.getText('stop');
        indexerCancelButton.setAttribute('aria-label', DOM.getText('stop'));
    }
    
    const agentStatusCollapsed = document.getElementById('agent-status-collapsed');
    if (agentStatusCollapsed) {
        agentStatusCollapsed.title = DOM.getText('showAgentContext');
    }
    
    const agentStatusBar = document.getElementById('agent-status-bar');
    if (agentStatusBar) {
        agentStatusBar.title = DOM.getText('activeContext');
    }
    
    const agentStatusHide = document.getElementById('agent-status-hide');
    if (agentStatusHide) {
        agentStatusHide.title = DOM.getText('hideContext');
    }
    
    // Settings modal metinlerini güncelle
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
        const modalHeader = settingsModal.querySelector('.modal-header h2');
        if (modalHeader) {
            modalHeader.textContent = DOM.getText('settings');
        }
        
        // Nav butonları
        const navButtons = settingsModal.querySelectorAll('.nav-button');
        navButtons.forEach(button => {
            const target = button.getAttribute('data-target');
            if (target === 'pane-services') {
                button.textContent = DOM.getText('services');
            } else if (target === 'pane-interface') {
                button.textContent = DOM.getText('interface');
            } else if (target === 'pane-general') {
                button.textContent = DOM.getText('general');
            }
        });
        
        // Form etiketleri
        const serviceSelectLabel = settingsModal.querySelector('label[for="service-select"]');
        if (serviceSelectLabel) {
            serviceSelectLabel.textContent = DOM.getText('activeService');
        }
        
        const vllmUrlLabel = settingsModal.querySelector('label[for="vllm-url"]');
        if (vllmUrlLabel) {
            vllmUrlLabel.textContent = DOM.getText('vllmServerAddress');
        }
        
        const vllmModelLabel = settingsModal.querySelector('label[for="vllm-model"]');
        if (vllmModelLabel) {
            vllmModelLabel.textContent = DOM.getText('vllmModelName');
        }
        
        const geminiKeyLabel = settingsModal.querySelector('label[for="gemini-key"]');
        if (geminiKeyLabel) {
            geminiKeyLabel.textContent = DOM.getText('geminiApiKey');
        }
        
        const geminiKeyInput = settingsModal.querySelector('#gemini-key');
        if (geminiKeyInput) {
            geminiKeyInput.placeholder = DOM.getText('enterApiKey');
        }
        
        const videoToggleLabel = settingsModal.querySelector('label[for="video-toggle-switch"]');
        if (videoToggleLabel) {
            videoToggleLabel.textContent = DOM.getText('backgroundVideo');
        }
        
        const videoToggleDesc = settingsModal.querySelector('#pane-interface .form-group-description');
        if (videoToggleDesc) {
            videoToggleDesc.textContent = DOM.getText('backgroundVideoDesc');
        }
        
        const historyLimitLabel = settingsModal.querySelector('label[for="history-limit"]');
        if (historyLimitLabel) {
            historyLimitLabel.textContent = DOM.getText('conversationHistoryLimit');
        }
        
        const historyLimitDesc = settingsModal.querySelector('#pane-general .form-group-description');
        if (historyLimitDesc) {
            historyLimitDesc.textContent = DOM.getText('conversationHistoryDesc');
        }
        
        const tokenLimitLabel = settingsModal.querySelector('label[for="token-limit"]');
        if (tokenLimitLabel) {
            tokenLimitLabel.textContent = DOM.getText('tokenLimit');
        }
        
        const tokenLimitDesc = settingsModal.querySelector('#pane-general .form-group-description:last-child');
        if (tokenLimitDesc) {
            tokenLimitDesc.textContent = DOM.getText('tokenLimitDesc');
        }
        
        const cancelButton = settingsModal.querySelector('#cancel-settings-button');
        if (cancelButton) {
            cancelButton.textContent = DOM.getText('cancel');
        }
        
        const saveButton = settingsModal.querySelector('button[type="submit"]');
        if (saveButton) {
            saveButton.textContent = DOM.getText('save');
        }
    }
}

// YENİ: Workspace adını ayarlama fonksiyonu (şimdilik sadece state'de tutuyoruz)
export function setWorkspaceName(workspaceName) {
    currentWorkspaceName = workspaceName;
}

// Token limitini ayarlardan al
export function setTokenLimit(limit) {
    TOKEN_LIMIT = limit || 12000;
}