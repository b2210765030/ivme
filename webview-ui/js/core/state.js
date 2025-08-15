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


// --- Karakter Sayacı ve Limit Durumu ---
const CONTEXT_LIMIT = 10000;
let conversationSize = 0;
let filesSize = 0;

// --- State Getters (Durumları Okuma) ---
export const getState = () => ({
    isAiResponding,
    isUiBlocked: isAiResponding || isIndexing,
    currentAnimationEffect,
    isBackgroundVideoEnabled,
    isAgentModeActive,
    currentLanguage,
    isConversationLocked,
    CONTEXT_LIMIT,
    conversationSize,
    filesSize,
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

export function setContextSize(newConversationSize, newFilesSize) {
    conversationSize = newConversationSize;
    filesSize = newFilesSize;
}

export function incrementConversationSize(size) {
    conversationSize += size;
}

export function resetConversationSize() {
    conversationSize = 0;
}

export function resetFilesSize() {
    filesSize = 0;
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
    conversationSize = 0;
    filesSize = 0;
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
    const subtitle = document.getElementById('welcome-subtitle');
    const input = document.getElementById('prompt-input');
    if (subtitle) {
        subtitle.textContent = (lang === 'en')
            ? 'Accelerate your code development and analysis with AI.'
            : 'Kod geliştirme ve analiz süreçlerinizi yapay zeka ile hızlandırın.';
    }
    if (input) {
        input.setAttribute('placeholder', 'ivmeye soru sorun...');
    }
    setPlaceholder();
}

// YENİ: Workspace adını ayarlama fonksiyonu (şimdilik sadece state'de tutuyoruz)
export function setWorkspaceName(workspaceName) {
    currentWorkspaceName = workspaceName;
}