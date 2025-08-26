/* ==========================================================================
   GLOBAL DURUM (STATE) YÖNETİM MODÜLÜ (GÜNCELLENMİŞ)
   ========================================================================== */

import * as DOM from '../utils/dom.js';
import { updateInputAndButtonState, setPlaceholder, recalculateTotalAndUpdateUI } from '../components/InputArea.js';

// --- Arayüz Durumları ---
let isAiResponding = false;
let currentAnimationEffect = 'streaming';
let isBackgroundVideoEnabled = localStorage.getItem('backgroundVideoEnabled') !== 'false';
let isAgentModeActive = localStorage.getItem('agentModeActive') === 'true'; // Agent modu durumu - localStorage'dan yükle
let currentAgentFileName = '';
let isAgentSelectionActive = false; // YENİ: Agent modunda seçili alan olup olmadığını gösterir.
let lastAgentSelectionData = null; // { fileName, startLine, endLine, content }
let isAgentBarExpanded = localStorage.getItem('agentBarExpanded') === 'true'; // Agent bağlam barının açık/kapalı durumu - localStorage'dan yükle
let isAgentActMode = localStorage.getItem('agentActMode') === 'true'; // Plan(false)/Act(true) modu - localStorage

let currentLanguage = localStorage.getItem('language') || 'tr';

// İndeksleme UI durumu
let isIndexing = false;
let indexingProgress = 0; // 0..100
let indexingMessage = '';
let isIndexingEnabled = localStorage.getItem('indexingEnabled') === 'true'; // İndeksleme açık/kapalı durumu - localStorage'dan yükle
let hasIndex = localStorage.getItem('hasIndex') === 'true'; // Workspace'te index vektörlerinin varlığı (localStorage fallback)
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
    , hasIndex
    , isAgentActMode
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
            // Seçim varsa: dosya + (Lstart - Lend), yoksa sadece dosya adı
            let displayText = activeFileName || currentAgentFileName;
            if (isAgentSelectionActive && lastAgentSelectionData) {
                const f = lastAgentSelectionData.fileName || displayText || '';
                const s = Number(lastAgentSelectionData.startLine || 0);
                const e = Number(lastAgentSelectionData.endLine || 0);
                if (f && s > 0 && e > 0) {
                    displayText = `${f} (L${s} - L${e})`;
                }
            }
            if (displayText) {
                agentStatusText.textContent = displayText;
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
            // X: sadece seçim varsa göster, yoksa gizle
            if (agentRemoveBtn) agentRemoveBtn.classList.toggle('hidden', !isAgentSelectionActive);
        }
        // Agent modu açıldığında indeksleme durumunu kontrol et
        checkAndUpdateIndexingState();

        // UI: Agent moda geçildiğinde input-wrapper üzerindeki index görselini
        // mevcut state'e göre geri yükle (ör. retrieval açık/kapalı, hasIndex, indexingProgress)
        try {
            const inputWrapper = document.querySelector('.input-wrapper');
            if (inputWrapper) {
                // Clear any previous transient classes
                inputWrapper.classList.remove('indexing-active', 'indexing-complete', 'indexing-ready');

                if (isIndexing) {
                    // ongoing indexing
                    inputWrapper.classList.add('indexing-active');
                    inputWrapper.style.setProperty('--indexing-progress', `${indexingProgress}%`);
                } else if (isIndexingEnabled) {
                    // retrieval enabled: show complete if hasIndex, else show ready
                    if (hasIndex) {
                        inputWrapper.classList.add('indexing-complete');
                        inputWrapper.style.setProperty('--indexing-progress', '100%');
                    } else {
                        inputWrapper.classList.add('indexing-ready');
                        inputWrapper.style.setProperty('--indexing-progress', '10%');
                    }
                } else {
                    // retrieval not enabled: ensure cleared
                    inputWrapper.style.setProperty('--indexing-progress', '0%');
                }
            }
        } catch (e) {}
        // Planner panel görsellerini de input-wrapper ile senkronize et
        try { updatePlannerPanelVisual(); } catch(e) {}
        try { window?.requestAnimationFrame?.(() => {
            const { refreshPlannerPanelVisibility } = require('../components/chat_view.js');
            refreshPlannerPanelVisibility();
        }); } catch(e) {}
        // Plan/Act toggle görünürlüğünü güncelle
        try { updatePlanActToggleVisibility(); } catch(e) {}
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
        // Eğer agent modundan chat moduna geçiliyorsa, input arka planındaki index visual'ını gizle
        try {
            const inputWrapper = document.querySelector('.input-wrapper');
            if (inputWrapper) {
                inputWrapper.classList.remove('indexing-active', 'indexing-complete', 'indexing-ready');
                inputWrapper.style.setProperty('--indexing-progress', '0%');
            }
            // Ayrıca message-level kalıntıları temizle
            document.querySelectorAll('.message').forEach(m => {
                try { m.style.removeProperty('--indexing-progress'); m.classList.remove('indexing-active','indexing-complete','indexing-ready'); } catch(e){}
            });
        } catch(e) {}
        // Planner paneli de temizle
        try { updatePlannerPanelVisual(); } catch(e) {}
        try { window?.requestAnimationFrame?.(() => {
            const { refreshPlannerPanelVisibility } = require('../components/chat_view.js');
            refreshPlannerPanelVisibility();
        }); } catch(e) {}
        // Plan/Act toggle'ı gizle
        try { updatePlanActToggleVisibility(); } catch(e) {}
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
    try { updatePlannerPanelVisual(); } catch(e) {}
    try { window?.requestAnimationFrame?.(() => {
        const { refreshPlannerPanelVisibility } = require('../components/chat_view.js');
        refreshPlannerPanelVisibility();
    }); } catch(e) {}
    // Plan/Act toggle görünürlüğünü anında senkronize et
    try { updatePlanActToggleVisibility(); } catch(e) {}
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

    // Eğer retrieval açılıyorsa ve vektörler zaten varsa, gerçek indeksleme yapmadan
    // UI tarafında hızlı bir dolum göster (hızlı animasyon) ve tamamlandı durumunu ayarla.
    const inputWrapper = document.querySelector('.input-wrapper');
    if (enabled) {
        if (hasIndex) {
            // hızlı dolum
            indexingProgress = 100;
            indexingMessage = '';
            updateIndexerProgressUI();
            // Ensure input wrapper shows complete and any message-level progress is cleared
            // Only apply visual changes to the input wrapper when Agent mode is active.
            if (inputWrapper) {
                if (isAgentModeActive) {
                    inputWrapper.classList.remove('indexing-active', 'indexing-ready');
                    inputWrapper.classList.add('indexing-complete');
                    inputWrapper.style.setProperty('--indexing-progress', '100%');
                } else {
                    // If not in Agent mode, ensure no residual indexing visuals remain
                    inputWrapper.classList.remove('indexing-active', 'indexing-complete', 'indexing-ready');
                    inputWrapper.style.setProperty('--indexing-progress', '0%');
                }
            }
            // Clear any leftover per-message progress styles (from old behavior)
            document.querySelectorAll('.message').forEach(m => {
                try {
                    m.style.removeProperty('--indexing-progress');
                    m.style.removeProperty('background');
                    m.classList.remove('indexing-active', 'indexing-complete', 'indexing-ready');
                } catch (e) {}
            });
            // ensure indexing flag is false so UI isn't blocked
            isIndexing = false;
            if (cancelBtn) cancelBtn.classList.add('hidden');
            if (startBtn) startBtn.classList.remove('hidden');
        } else {
            // vektör yoksa retrieval açık ama index yok: kullanıcının retrieval'ü aktif ettiği durumda
            // hafif bir hazır/ready göstergesi gösterelim (shimmer yerine subtle renk)
            if (inputWrapper) {
                if (isAgentModeActive) {
                    inputWrapper.classList.remove('indexing-complete');
                    inputWrapper.classList.add('indexing-ready');
                    // hafif doldurma (örnek: 10%)
                    inputWrapper.style.setProperty('--indexing-progress', '10%');
                } else {
                    // Not agent mode -> clear any indexing visual
                    inputWrapper.classList.remove('indexing-active', 'indexing-complete', 'indexing-ready');
                    inputWrapper.style.setProperty('--indexing-progress', '0%');
                }
            }
        }
    } else {
        // retrieval kapandıysa tamamlanmış işaretini kaldır
        if (inputWrapper) {
            // Always clear visual when retrieval disabled regardless of mode
            inputWrapper.classList.remove('indexing-complete');
            inputWrapper.classList.remove('indexing-ready');
            inputWrapper.style.setProperty('--indexing-progress', '0%');
        }
        // Also clear message-level residuals when retrieval disabled
        document.querySelectorAll('.message').forEach(m => {
            try { m.style.removeProperty('--indexing-progress'); m.style.removeProperty('background'); m.classList.remove('indexing-active','indexing-complete','indexing-ready'); } catch(e){}
        });
        // Planner UI'ı kesin kapat: paneli gizle ve varsa steps balonunu kaldır
        try {
            const panel = document.getElementById('planner-panel');
            if (panel) panel.classList.add('hidden');
            document.querySelectorAll('.planner-steps-message').forEach((el) => {
                try { el.parentNode && el.parentNode.removeChild(el); } catch(e){}
            });
        } catch(e) {}
        // ensure flags
        isIndexing = false;
        if (cancelBtn) cancelBtn.classList.add('hidden');
        if (startBtn && isAgentModeActive) startBtn.classList.remove('hidden');
        // Paneli kesin gizle (mod kapandı)
        try {
            const panel = document.getElementById('planner-panel');
            if (panel) panel.classList.add('hidden');
        } catch(e) {}
    }
    try { updatePlannerPanelVisual(); } catch(e) {}
    try { window?.requestAnimationFrame?.(() => {
        const { refreshPlannerPanelVisibility } = require('../components/chat_view.js');
        refreshPlannerPanelVisibility();
    }); } catch(e) {}
    // Plan/Act toggle görünürlüğünü güncelle
    try { updatePlanActToggleVisibility(); } catch(e) {}
}

// Workspace'te index vektörlerinin olup olmadığını ayarla
export function setHasIndex(value) {
    hasIndex = !!value;
    // persist for quick UI decisions before backend confirms
    try { localStorage.setItem('hasIndex', hasIndex.toString()); } catch(e){}
    const startBtn = DOM.indexerStartButton;
    if (startBtn) {
        if (!hasIndex) {
            startBtn.classList.add('no-index');
            startBtn.setAttribute('aria-disabled', 'true');
        } else {
            startBtn.classList.remove('no-index');
            startBtn.removeAttribute('aria-disabled');
        }
    }
    // Eğer retrieval açıksa ve şimdi vektör oluştuysa input'ı tamamlanmış yap
    const inputWrapper = document.querySelector('.input-wrapper');
    if (inputWrapper && isIndexingEnabled && hasIndex) {
        inputWrapper.classList.remove('indexing-ready');
        inputWrapper.classList.add('indexing-complete');
        inputWrapper.style.setProperty('--indexing-progress', '100%');
    }
    try { updatePlannerPanelVisual(); } catch(e) {}
    try { window?.requestAnimationFrame?.(() => {
        const { refreshPlannerPanelVisibility } = require('../components/chat_view.js');
        refreshPlannerPanelVisibility();
    }); } catch(e) {}
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
    
    // YENİ: Input wrapper'daki progress'i güncelle
    const inputWrapper = document.querySelector('.input-wrapper');
    const progressValue = `${indexingProgress}%`;
    
    if (inputWrapper) {
        // Yumuşak geçiş için CSS transition kullan
        inputWrapper.style.setProperty('--indexing-progress', progressValue);

        // Sadece Agent modu aktifse input üzerindeki indexing görsellerini uygula.
        // Diğer modlarda hiçbir pulse/index görseli bırakılmasın.
        if (isAgentModeActive) {
            if (indexingProgress > 0 && indexingProgress < 100) {
                // Aktif indeksleme: dalga açık, complete kapalı
                if (!inputWrapper.classList.contains('indexing-active')) {
                    inputWrapper.classList.add('indexing-active');
                }
                inputWrapper.classList.remove('indexing-complete');
            } else if (indexingProgress >= 100) {
                // Tamamlandı: dalga kapalı, hafif renkli temel dolum açık
                inputWrapper.classList.remove('indexing-active');
                if (!inputWrapper.classList.contains('indexing-complete')) {
                    inputWrapper.classList.add('indexing-complete');
                }
            } else {
                // 0 veya negatif: her ikisini kapat ve genişliği sıfırla
                inputWrapper.classList.remove('indexing-active');
                inputWrapper.classList.remove('indexing-complete');
                inputWrapper.style.setProperty('--indexing-progress', '0%');
            }
        } else {
            // Agent modu değilse tüm indexing sınıflarını ve görsellerini temizle
            inputWrapper.classList.remove('indexing-active', 'indexing-complete', 'indexing-ready');
            inputWrapper.style.setProperty('--indexing-progress', '0%');
        }
    }
    try { updatePlannerPanelVisual(); } catch(e) {}
}

// Planner panel görsellerini input-wrapper ile aynı kurallara göre uygular
export function updatePlannerPanelVisual() {
    const panel = document.getElementById('planner-panel');
    if (!panel) return;
    try {
        panel.classList.remove('indexing-active', 'indexing-complete', 'indexing-ready');
        if (isAgentModeActive) {
            if (isIndexing) {
                panel.classList.add('indexing-active');
                panel.style.setProperty('--indexing-progress', `${indexingProgress}%`);
            } else if (isIndexingEnabled) {
                if (hasIndex) {
                    panel.classList.add('indexing-complete');
                    panel.style.setProperty('--indexing-progress', '100%');
                } else {
                    panel.classList.add('indexing-ready');
                    panel.style.setProperty('--indexing-progress', '10%');
                }
            } else {
                panel.style.setProperty('--indexing-progress', '0%');
            }
        } else {
            panel.style.setProperty('--indexing-progress', '0%');
        }
    } catch (e) {}
}

// Plan/Act modu ayarı ve UI güncellemesi
export function setAgentActMode(enabled) {
    isAgentActMode = !!enabled;
    try { localStorage.setItem('agentActMode', isAgentActMode.toString()); } catch(e) {}
    try {
        const planActToggle = document.getElementById('plan-act-toggle');
        const planActSwitch = document.getElementById('plan-act-switch');
        if (planActToggle) {
            planActToggle.classList.toggle('checked', isAgentActMode);
            planActToggle.setAttribute('aria-checked', isAgentActMode ? 'true' : 'false');
        }
        if (planActSwitch) {
            planActSwitch.checked = isAgentActMode;
        }
    } catch(e) {}
}

// Plan/Act toggle görünürlüğünü Agent modu ve Indexing etkinliğine göre günceller
export function updatePlanActToggleVisibility() {
    try {
        const el = document.getElementById('plan-act-toggle');
        if (!el) return;
        // Index açık (enabled) ya da aktif indeksleme sürerken görünür olsun
        const shouldShow = isAgentModeActive && (isIndexingEnabled || isIndexing);
        if (shouldShow) {
            el.classList.remove('hidden');
            el.classList.toggle('disabled', false);
            const planActSwitch = document.getElementById('plan-act-switch');
            if (planActSwitch) planActSwitch.disabled = false;
        } else {
            el.classList.add('hidden');
        }
    } catch (e) {}
}

// YENİ: Agent seçim durumunu göster/gizle
export function setAgentSelectionStatus(fileName, startLine, endLine, content) {
    const agentStatusBar = document.getElementById('agent-status-bar');
    const agentStatusText = document.getElementById('agent-status-text');
    const agentRemoveBtn = document.getElementById('agent-selection-remove');
    if (!agentStatusBar || !agentStatusText) return;
    currentAgentFileName = fileName || currentAgentFileName;
    agentStatusText.textContent = `${currentAgentFileName} (L${startLine} - L${endLine})`;
    try {
        const selToggle = document.getElementById('agent-selection-toggle');
        if (selToggle) {
            // Seçim VAR: yukarı ok görünür
            selToggle.classList.remove('hidden');
            selToggle.textContent = '▴';
            selToggle.title = 'Seçimi göster';
            selToggle.setAttribute('aria-label', 'Seçimi göster');
        }
    } catch (e) {}
    // Bar sadece kullanıcı açtıysa gösterilsin
    if (isAgentBarExpanded) {
        agentStatusBar.classList.remove('hidden');
    }
    isAgentSelectionActive = true; // Seçim aktif hale geldi
    // Seçim varken X butonu görünür
    if (agentRemoveBtn) agentRemoveBtn.classList.remove('hidden');
    // Son seçimi sakla (popover için)
    lastAgentSelectionData = { fileName: currentAgentFileName, startLine, endLine, content: String(content || '') };
}

export function clearAgentSelectionStatus() {
    const agentStatusBar = document.getElementById('agent-status-bar');
    const agentStatusText = document.getElementById('agent-status-text');
    const agentRemoveBtn = document.getElementById('agent-selection-remove');
    if (!agentStatusBar || !agentStatusText) return;
    isAgentSelectionActive = false; // Seçim pasif hale geldi
    // Herhangi bir popover varsa kaldır
    try { const pop = document.getElementById('agent-selection-popover'); if (pop && pop.parentNode) pop.parentNode.removeChild(pop); } catch(e){}
    // Eski preview kalıntılarını da temizle (geçiş desteği)
    try { const prev = document.getElementById('agent-selection-preview'); if (prev && prev.parentNode) prev.parentNode.removeChild(prev); } catch(e){}
    if (isAgentModeActive && currentAgentFileName) {
        // Sadece satır aralığını kaldır, dosya adı kalsın
        agentStatusText.textContent = currentAgentFileName;
        try { const selToggle = document.getElementById('agent-selection-toggle'); if (selToggle) selToggle.classList.add('hidden'); } catch(e){}
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

// Küçük seçim popover penceresini aç/kapat
export function toggleAgentSelectionPopover() {
    try {
        const existing = document.getElementById('agent-selection-popover');
        if (existing) { existing.parentNode.removeChild(existing); return false; }
        if (!lastAgentSelectionData || !lastAgentSelectionData.content) return false;
        const anchor = document.getElementById('agent-selection-toggle') || document.getElementById('agent-status-bar');
        const rect = anchor ? anchor.getBoundingClientRect() : { left: 20, top: 40, bottom: 46, width: 0 };
        const pop = document.createElement('div');
        pop.id = 'agent-selection-popover';
        pop.className = 'agent-selection-popover';
        const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const title = `${lastAgentSelectionData.fileName} (L${lastAgentSelectionData.startLine} - L${lastAgentSelectionData.endLine})`;
        pop.innerHTML = `
            <div class="asp-popover-header"><span class="asp-popover-title">${escapeText(title)}</span>
                <button class="asp-popover-close" title="Kapat" aria-label="Kapat">×</button>
            </div>
            <pre><code>${escapeText(lastAgentSelectionData.content)}</code></pre>`;
        // Append hidden to measure
        pop.style.visibility = 'hidden';
        pop.style.top = '0px';
        pop.style.left = '0px';
        document.body.appendChild(pop);
        // Measure
        const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
        const vh = window.innerHeight || document.documentElement.clientHeight || 768;
        const pW = Math.max(1, pop.offsetWidth || 360);
        const pH = Math.max(1, pop.offsetHeight || 120);
        // Preferred: above the anchor (yukarı)
        let top = Math.round((rect.top || 0) - pH - 6);
        let left = Math.round((rect.left || 0) + ((rect.width || 0) / 2) - (pW / 2));
        // Clamp horizontally
        left = Math.max(8, Math.min(left, vw - pW - 8));
        // If not enough space above, fallback to below
        if (top < 8) {
            top = Math.round((rect.bottom || 0) + 6);
            // Ensure on screen vertically
            if (top + pH > vh - 8) {
                top = Math.max(8, vh - pH - 8);
            }
        }
        // Apply final position
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
        pop.style.visibility = 'visible';
        try { pop.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b)); } catch (e) {}
        const closeBtn = pop.querySelector('.asp-popover-close');
        closeBtn?.addEventListener('click', () => { try { pop.parentNode && pop.parentNode.removeChild(pop); } catch(e){} });
        return true;
    } catch (e) { return false; }
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
    
    // Token tooltip'ini güncelle
    updateTokenTooltip();
}

// Token tooltip'ini güncelle
function updateTokenTooltip() {
    // InputArea'daki recalculateTotalAndUpdateUI fonksiyonunu çağır
    // Bu fonksiyon doğru token hesaplaması yapar ve tooltip'i günceller
    recalculateTotalAndUpdateUI();
}

// HTML metinlerini güncelle
function updateHTMLTexts() {
    // Buton title'larını güncelle
    const logoButton = document.getElementById('logo-button');
    if (logoButton) {
        logoButton.title = DOM.getText('showPresentation');
    }

    const historyButton = document.getElementById('history-button');
    if (historyButton) {
        historyButton.title = DOM.getText('history');
    }

    const newChatButton = document.getElementById('new-chat-button');
    if (newChatButton) {
        newChatButton.title = DOM.getText('newChat');
    }

    const feedbackButton = document.getElementById('feedback-button');
    if (feedbackButton) {
        feedbackButton.title = DOM.getText('feedback');
    }

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

    // Plan/Act toggle metinlerini güncelle
    try {
        const planLabel = document.querySelector('#plan-act-toggle .plan');
        const actLabel = document.querySelector('#plan-act-toggle .act');
        if (planLabel) planLabel.textContent = DOM.getText('plan');
        if (actLabel) actLabel.textContent = DOM.getText('act');
    } catch(e) {}
    
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