/* ==========================================================================
   MESAJ YÖNLENDİRİCİ (MESSAGE ROUTER) (AGENT SEÇİM ÖZELLİĞİ EKLENDİ)
   ========================================================================== */

import { onMessage, postMessage } from '../services/vscode.js';
import * as ChatView from '../components/chat_view.js';
import * as FileTags from '../components/file_tags.js';
import * as HistoryPanel from '../components/history_panel.js';
import * as InputArea from '../components/InputArea.js';
import * as SettingsModal from '../components/settings_modal.js';
import { setContextSize, resetChatState, setAgentMode, setAgentSelectionStatus, clearAgentSelectionStatus, setIndexingActive, updateIndexerProgress, setIndexingEnabledState, setWorkspaceName, getState, setTokenLimit, updateUITexts, setHasIndex, setAgentBarExpanded, setAgentActMode, incrementConversationSize, updatePlanActToggleVisibility } from './state.js';
import * as DOM from '../utils/dom.js';

// Diff gösterimini aktarım panelinin yanında ekle
function showDiffComparison(originalCode, newCode) {
    const transferIndicator = document.querySelector('.code-transfer-indicator');
    if (!transferIndicator) return; // Aktarım paneli yoksa diff gösterme
    
    // Önceki diff'i kaldır
    const existingDiff = transferIndicator.querySelector('.code-diff-container');
    if (existingDiff) {
        existingDiff.remove();
    }
    
    // Satır satır diff hesapla
    const diff = Diff.diffLines(originalCode, newCode);
    
    // Diff container oluştur
    const diffContainer = document.createElement('div');
    diffContainer.className = 'code-diff-container';
    diffContainer.innerHTML = `
        <div class="diff-header">
            <div class="diff-title">
                <span class="diff-icon">🔄</span>
                <span>Kod Karşılaştırması</span>
                <button class="diff-close" title="Karşılaştırmayı kapat">✕</button>
            </div>
        </div>
        <div class="diff-content">
            <div class="diff-side original">
                <div class="diff-side-header">Orijinal Kod</div>
                <div class="diff-code-area">
                    <div class="diff-line-numbers"></div>
                    <div class="diff-code-lines"></div>
                </div>
            </div>
            <div class="diff-side modified">
                <div class="diff-side-header">Önerilen Değişiklik</div>
                <div class="diff-code-area">
                    <div class="diff-line-numbers"></div>
                    <div class="diff-code-lines"></div>
                </div>
            </div>
        </div>
        <div class="diff-actions">
            <button class="diff-action-button reject-button" title="Değişikliği reddet">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                Reddet
            </button>
            <button class="diff-action-button apply-button" title="Değişikliği dosyaya uygula">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <polyline points="20,6 9,17 4,12"></polyline>
                </svg>
                Uygula
            </button>
        </div>
    `;
    
    // Diff'i transfer indicator'ın altına ekle
    transferIndicator.appendChild(diffContainer);
    
    // Satır satır diff render et
    const originalLineNumbers = diffContainer.querySelector('.diff-side.original .diff-line-numbers');
    const originalCodeLines = diffContainer.querySelector('.diff-side.original .diff-code-lines');
    const modifiedLineNumbers = diffContainer.querySelector('.diff-side.modified .diff-line-numbers');
    const modifiedCodeLines = diffContainer.querySelector('.diff-side.modified .diff-code-lines');
    
    let originalHtml = '';
    let modifiedHtml = '';
    let originalLineNumHtml = '';
    let modifiedLineNumHtml = '';
    
    let originalLineNum = 1;
    let modifiedLineNum = 1;
    
    diff.forEach(part => {
        const lines = part.value.split('\n');
        // Son satır boşsa çıkar (split'ten kaynaklanan)
        if (lines[lines.length - 1] === '') {
            lines.pop();
        }
        
        lines.forEach((line) => {
            if (part.removed) {
                // Kaldırılan satır - sadece orijinalde göster
                originalHtml += `<div class="diff-line diff-removed">${escapeHtml(line)}</div>`;
                originalLineNumHtml += `<div class="diff-line-num diff-removed">${originalLineNum}</div>`;
                originalLineNum++;
                
                // Boş satır ekle modified tarafına
                modifiedHtml += `<div class="diff-line diff-empty"></div>`;
                modifiedLineNumHtml += `<div class="diff-line-num diff-empty"></div>`;
            } else if (part.added) {
                // Eklenen satır - sadece modified'da göster
                modifiedHtml += `<div class="diff-line diff-added">${escapeHtml(line)}</div>`;
                modifiedLineNumHtml += `<div class="diff-line-num diff-added">${modifiedLineNum}</div>`;
                modifiedLineNum++;
                
                // Boş satır ekle original tarafına
                originalHtml += `<div class="diff-line diff-empty"></div>`;
                originalLineNumHtml += `<div class="diff-line-num diff-empty"></div>`;
            } else {
                // Değişmeyen satır - her iki tarafta da göster
                originalHtml += `<div class="diff-line diff-unchanged">${escapeHtml(line)}</div>`;
                originalLineNumHtml += `<div class="diff-line-num">${originalLineNum}</div>`;
                originalLineNum++;
                
                modifiedHtml += `<div class="diff-line diff-unchanged">${escapeHtml(line)}</div>`;
                modifiedLineNumHtml += `<div class="diff-line-num">${modifiedLineNum}</div>`;
                modifiedLineNum++;
            }
        });
    });
    
    originalCodeLines.innerHTML = originalHtml;
    modifiedCodeLines.innerHTML = modifiedHtml;
    originalLineNumbers.innerHTML = originalLineNumHtml;
    modifiedLineNumbers.innerHTML = modifiedLineNumHtml;
    
    // Syntax highlighting uygulanabilir ama diff renkleri öncelikli
    
    // Close button event
    const closeButton = diffContainer.querySelector('.diff-close');
    const closeDiff = () => {
        diffContainer.classList.add('fade-out');
        setTimeout(() => {
            if (diffContainer.parentNode) {
                diffContainer.remove();
                // Layout güncelle
                try { InputArea.autoResize(); } catch (e) {}
            }
        }, 300);
    };
    closeButton.addEventListener('click', closeDiff);
    
    // Action buttons
    const rejectButton = diffContainer.querySelector('.reject-button');
    const applyButton = diffContainer.querySelector('.apply-button');
    
    // Reddet butonu - diff'i kapat
    rejectButton.addEventListener('click', () => {
        closeDiff();
    });
    
    // Uygula butonu - kodu dosyaya uygula
    applyButton.addEventListener('click', () => {
        // Backend'e kod uygulama mesajı gönder
        try {
            if (typeof postMessage === 'function') {
                postMessage('applyCodeChange', { newCode: newCode });
            } else if (typeof vscode !== 'undefined' && vscode.postMessage) {
                vscode.postMessage({
                    type: 'applyCodeChange',
                    payload: { newCode: newCode }
                });
            } else {
                console.error('No postMessage function available');
            }
        } catch (e) {
            console.error('Apply code change error:', e);
        }
        
        // Visual feedback
        applyButton.disabled = true;
        applyButton.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polyline points="20,6 9,17 4,12"></polyline>
            </svg>
            Uygulandı
        `;
        applyButton.classList.add('applied');
        
        // 2 saniye sonra orijinal kodu güncelle ve diff'i kapat
        setTimeout(() => {
            // Orijinal kod alanını güncelle
            const transferCodePreview = transferIndicator.querySelector('.transfer-code-preview code');
            if (transferCodePreview) {
                transferCodePreview.textContent = newCode;
                // Syntax highlighting yeniden uygula
                try {
                    if (typeof hljs !== 'undefined') {
                        hljs.highlightElement(transferCodePreview);
                    }
                } catch (e) {}
            }
            
            // Diff panelini kapat
            closeDiff();
        }, 2000);
    });
    
    // Layout güncelle - diff eklendi
    setTimeout(() => {
        try { InputArea.autoResize(); } catch (e) {}
    }, 100);
}

// Kod aktarımı gösterge fonksiyonu
function showCodeTransferIndicator(message) {
    // Önceki aktarım göstergesini kaldır
    const existing = document.querySelector('.code-transfer-indicator');
    if (existing) {
        existing.remove();
    }

    // Input wrapper'ı bul
    const inputWrapper = document.querySelector('.input-wrapper');
    if (!inputWrapper) return;

    // Aktarılan kod içeriğini message'dan al (backend'den contextSet ile gelen bilgi)
    const transferredCode = typeof message === 'string' ? message : 
                          message?.code || message?.content ||
                          'Kod başarıyla aktarıldı'; // fallback text

    // Kod aktarımı gösterge elementi oluştur
    const indicator = document.createElement('div');
    indicator.className = 'code-transfer-indicator';
    indicator.innerHTML = `
        <div class="transfer-content">
            <div class="transfer-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>
            <div class="transfer-text">
                <span class="transfer-label">Kod aktarıldı</span>
                <span class="transfer-description">Aktarılan kodu görmek için yukarı oka tıklayın</span>
            </div>
            <div class="transfer-controls">
                <button class="transfer-toggle" title="Aktarılan kodu göster/gizle">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="m18 15-6-6-6 6"/>
                    </svg>
                </button>
                <button class="transfer-close" title="Kapat">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
        <div class="transfer-code-preview">
            <pre><code>${escapeHtml(transferredCode)}</code></pre>
        </div>
    `;

    // Input wrapper'ın içine, en üste ekle
    inputWrapper.insertBefore(indicator, inputWrapper.firstChild);

    // Layout'u güncelle - input wrapper büyüdü
    try { InputArea.autoResize(); } catch (e) {}

    // Event handlers
    const toggleButton = indicator.querySelector('.transfer-toggle');
    const closeButton = indicator.querySelector('.transfer-close');
    const codePreview = indicator.querySelector('.transfer-code-preview');

    // Toggle kod görünümü
    toggleButton.addEventListener('click', () => {
        const isExpanded = indicator.classList.contains('expanded');
        if (isExpanded) {
            indicator.classList.remove('expanded');
            toggleButton.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="m18 15-6-6-6 6"/>
                </svg>
            `;
        } else {
            indicator.classList.add('expanded');
            toggleButton.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="m6 9 6 6 6-6"/>
                </svg>
            `;
        }
        
        // Layout'u güncelle - kod önizleme alanı expand/collapse edildi
        // CSS transition event'ini dinle, yoksa timeout ile fallback
        const handleTransitionEnd = () => {
            try { InputArea.autoResize(); } catch (e) {}
            codePreview.removeEventListener('transitionend', handleTransitionEnd);
        };
        
        codePreview.addEventListener('transitionend', handleTransitionEnd, { once: true });
        
        // Fallback - transition event çalışmazsa 350ms sonra çalışsın
        setTimeout(() => {
            try { InputArea.autoResize(); } catch (e) {}
        }, 350);
    });

    // Kapat butonu
    closeButton.addEventListener('click', () => {
        indicator.classList.add('fade-out');
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.remove();
                // Layout'u güncelle - gösterge kaldırıldı
                try { InputArea.autoResize(); } catch (e) {}
            }
        }, 300);
    });
}

// HTML escape utility function
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function initMessageListener() {
    let currentStreamingStep = null;
    let plannerStreamActive = false;
    let planTimerStart = null;
    // ACT modunda plan açıklaması akışını UI'da maskelemek için bayrak
    let suppressPlannerExplanation = false;
    onMessage(message => {
        const data = message.payload ?? message.value;
        
        switch (message.type) {
            case 'requestExecuteConfirmation':
                try {
                    const instr = (data && (data.instruction || (data.payload && data.payload.instruction))) || '';
                    if (typeof ChatView.showConfirmationPanel === 'function') {
                        ChatView.showConfirmationPanel(instr);
                    }
                } catch (e) {}
                break;
            case 'indexingProgress':
                setIndexingActive(true);
                updateIndexerProgress(Math.round(data.percent || 0), data.message || '');
                if (data.message) {
                    InputArea.setPlaceholder(data.message);
                }
                try { ChatView.refreshPlannerPanelVisibility(); } catch(e) {}
                break;
            case 'indexingDone':
                // Önce hasIndex'i güncelle, sonra UI enable et
                if (typeof data?.hasIndex !== 'undefined') {
                    setHasIndex(!!data.hasIndex);
                } else {
                    setHasIndex(true);
                }
                updateIndexerProgress(100, '');
                setIndexingActive(false, { preserveBar: true });
                setIndexingEnabledState(true); // İndeksleme tamamlandığında active et
                // Placeholder mesajını güncelle (sadece "ivmeye soru sorun..." göster)
                InputArea.setPlaceholder();
                try { ChatView.refreshPlannerPanelVisibility(); } catch(e) {}
                break;
            case 'indexingToggled':
                // Eğer backend hasIndex bilgisi veriyorsa önce onu uygula
                if (typeof data?.hasIndex !== 'undefined') {
                    setHasIndex(!!data.hasIndex);
                    setIndexingEnabledState(data.enabled);
                } else {
                    // hasIndex bilgisi yoksa mevcut UI'yı bozmayalım; sadece aktiflik durumunu koru
                    if (data.enabled === false) {
                        setIndexingEnabledState(false);
                    }
                }
                setIndexingActive(false, { preserveBar: true });
                // Placeholder mesajını güncelle (sadece "ivmeye soru sorun..." göster)
                InputArea.setPlaceholder();
                try { ChatView.refreshPlannerPanelVisibility(); } catch(e) {}
                // Plan/Act toggle görünürlüğünü anında güncelle
                try { updatePlanActToggleVisibility(); } catch(e) {}
                // disable durumunda planner steps balonunu da kaldır
                try {
                    if (data?.enabled === false) {
                        document.querySelectorAll('.planner-steps-message').forEach(el => el.remove());
                    }
                } catch(e) {}
                break;
            case 'indexingStatus':
                // İndeksleme durumu bilgisi geldi
                if (typeof data?.hasIndex !== 'undefined') {
                    setHasIndex(!!data.hasIndex);
                }
                setIndexingEnabledState(data.isEnabled);
                // Panel görünürlüğünü güncelle
                try { ChatView.refreshPlannerPanelVisibility(); } catch(e) {}
                // Plan/Act toggle görünürlüğünü anında güncelle
                try { updatePlanActToggleVisibility(); } catch(e) {}
                break;
            case 'workspaceInfo':
                // Workspace bilgisi geldi
                setWorkspaceName(data.workspaceName);
                if (typeof data?.hasIndex !== 'undefined') {
                    setHasIndex(!!data.hasIndex);
                }
                break;
            case 'updateTokenLimit': {
                const limit = Number(data?.tokenLimit || 0);
                if (limit > 0) {
                    setTokenLimit(limit);
                    // Settings modal input'unu da güncel göster
                    try {
                        const input = document.getElementById('token-limit');
                        if (input) {
                            input.value = String(limit);
                            input.setAttribute('readonly', 'true');
                        }
                    } catch (e) {}
                    InputArea.recalculateTotalAndUpdateUI();
                }
                break; }
            case 'modelTokenUsage': {
                // Backend: { prompt_tokens, completion_tokens, total_tokens }
                const u = data || {};
                const completion = Number(u.completion_tokens || 0) || 0;
                if (completion > 0) {
                    try { incrementConversationSize(completion); } catch (e) {}
                    try { InputArea.recalculateTotalAndUpdateUI(); } catch (e) {}
                }
                break; }
            // --- Standart Mesajlar ---
            case 'addResponse':
                ChatView.showAiResponse(data);
                break;
            
            // --- Akış (Stream) Mesajları ---
            case 'addResponsePlaceholder': {
                ChatView.addAiResponsePlaceholder();
                // ACT modunda plan açıklamasını maskele; başlık yazma
                try {
                    const { isAgentActMode } = getState();
                    if (isAgentActMode) {
                        // Plan açıklaması akışını uygulama adımına kadar maskele
                        suppressPlannerExplanation = true;
                    }
                } catch (e) {}
                // Planner süresi için başlangıcı da yedekle (plannerResult yoksa kullanılmaz)
                planTimerStart = ChatView.getPlanTimerStartMs?.() || (performance?.now ? performance.now() : Date.now());
                break;
            }
            case 'addResponseChunk': {
                // ACT modunda plan açıklaması chunks'larını gizle
                if (suppressPlannerExplanation) break;
                ChatView.appendResponseChunk(data);
                break;
            }
            case 'streamEnd': {
                // Plan açıklaması gizleniyorsa finalize etmeyelim; adım/sumary akışı devam edebilir
                if (suppressPlannerExplanation) { suppressPlannerExplanation = false; break; }
                ChatView.finalizeStreamedResponse();
                
                // Diff karşılaştırması için kod bloğu tespit et
                setTimeout(() => {
                    try {
                        const transferIndicator = document.querySelector('.code-transfer-indicator');
                        if (transferIndicator) {
                            // Orijinal kodu al
                            const originalCode = transferIndicator.querySelector('.transfer-code-preview code')?.textContent;
                            
                            // En son AI mesajından kod bloğunu al
                            const lastAiMessage = document.querySelector('#ai-streaming-placeholder, .assistant-message:last-child');
                            const lastCodeBlock = lastAiMessage?.querySelector('pre code:last-of-type');
                            
                            if (originalCode && lastCodeBlock && lastCodeBlock.textContent) {
                                const newCode = lastCodeBlock.textContent;
                                
                                // Kodlar farklıysa diff göster
                                if (originalCode.trim() !== newCode.trim()) {
                                    showDiffComparison(originalCode, newCode);
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('Diff comparison error:', e);
                    }
                }, 500); // Stream finalize olduktan sonra bekle
                
                break;
            }

            // --- Step Execution Placeholder Messages ---
            case 'stepExecStart': {
                const label = String(data?.label || '');
                ChatView.showStepExecutionPlaceholder(label);
                break;
            }
            case 'stepExecEnd': {
                const label = String(data?.label || '');
                const elapsedMs = Number(data?.elapsedMs || 0);
                const error = data?.error;
                ChatView.finishStepExecutionPlaceholder(label, elapsedMs, error);
                // Panelde ilgili adımı tamamlandı olarak işaretle
                try {
                    const idx = Number(data?.index);
                    if (!Number.isNaN(idx)) {
                        ChatView.markPlannerStepCompleted(idx);
                    }
                } catch (e) {}
                break;
            }

            // --- Summary streaming into same placeholder ---
            case 'summaryStart': {
                ChatView.startInlineSummary();
                break;
            }
            case 'summaryChunk': {
                ChatView.appendInlineSummary(String(data || ''));
                break;
            }
            case 'summaryEnd': {
                ChatView.finishInlineSummary();
                break;
            }

            // --- Planner streaming UI parça mesajı ---
            case 'plannerUiChunk': {
                const { isAgentModeActive, isIndexingEnabled, isAgentActMode } = getState();
                if (!(isAgentModeActive && isIndexingEnabled)) {
                    // Index modu kapalıysa planlama bildirimi göstermeyelim
                    break;
                }
                // ACT modunda: planlama akışı başlık/placeholder'ını güncellemeyelim (adım satırlarını ezmesin)
                if (isAgentActMode) {
                    break;
                }
                // PLAN AKIŞI: Index aktifken shimmer ve başlık
                try {
                    plannerStreamActive = true;
                    currentStreamingStep = data?.stepNo ?? null;
                    if (!document.getElementById('ai-streaming-placeholder')) {
                        ChatView.addAiResponsePlaceholder();
                    }
                    ChatView.setPlannerStreaming(true);
                    ChatView.setShimmerActive(true);
                    // Act modunda plan başlığı yerine "düşünüyor" göster
                    const { isAgentActMode } = getState();
                    const headerText = isAgentActMode ? (DOM.getText('thinking') || 'İvme düşünüyor...') : (DOM.getText('planning') || 'İvme planlıyor...');
                    ChatView.replaceStreamingPlaceholderHeader(headerText);
                } catch (e) {
                    console.warn('plannerUiChunk render error', e);
                }
                break;
            }

            // --- Planner Sonucu ---
            case 'plannerResult': {
                const { isAgentModeActive, isIndexingEnabled, isAgentActMode } = getState();
                if (!(isAgentModeActive && isIndexingEnabled)) {
                    // Chat modunda planner sonucu yok sayılır (planner zaten çağrılmaz)
                    break;
                }
                const plan = data?.plan ?? data?.payload?.plan ?? data;
                // ACT modunda: paneli gizle, açıklamayı maskele, otomatik uygula
                if (isAgentActMode) {
                    try { ChatView.setPlannerPanelCompleted(false); } catch (e) {}
                    try { ChatView.showPlannerPanelWithPlan(plan); ChatView.hidePlannerPanel(); } catch (e) { try { ChatView.hidePlannerPanel(); } catch (e2) {} }
                    suppressPlannerExplanation = true;
                    try { setTimeout(() => { try { postMessage('executePlannerAll'); } catch (e) {} }, 0); } catch (e) {}
                    break;
                }
                // Yeni plan geldiğinde panel tamamlandı işaretini kaldır
                try { ChatView.setPlannerPanelCompleted(false); } catch (e) {}
                try {
                    const names = Array.isArray(plan?.steps) ? (data?.toolNames || data?.payload?.toolNames || []) : (data?.payload?.toolNames || []);
                    if (Array.isArray(names) && names.length > 0 && ChatView.setAvailableTools) {
                        ChatView.setAvailableTools(names);
                    }
                    // Tool isimleri set edildikten hemen sonra planı oluştur ki eşleşme kontrolü yapılsın
                    ChatView.showPlannerPanelWithPlan(plan);
                } catch (e) { ChatView.showPlannerPanelWithPlan(plan); }
                if (!plan || !Array.isArray(plan.steps)) {
                    ChatView.showAiResponse(DOM.getText('noPlanSteps'));
                    break;
                }
                // Eğer streaming aktifleştirildiyse: plan tamamlandığında aynı mesajda "İvme planladı (Xs)" yaz ve altında açıklama için boşluk bırak
                if (plannerStreamActive) {
                    plannerStreamActive = false;
                    currentStreamingStep = null;
                    const plannedBase = DOM.getText('planned') || 'İvme planladı';
                    const msNow = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                    // Öncelik chat_view başlangıç zamanında, yoksa local değişken
                    const started = ChatView.getPlanTimerStartMs?.() || planTimerStart;
                    const elapsedSec = started ? Math.max(0, (msNow - started) / 1000) : 0;
                    const plannedText = `${plannedBase} (${elapsedSec.toFixed(2)}s)`;
                    ChatView.setPlannerStreaming(false);
                    // "İvme planladı" anından sonra shimmer'ı kapat
                    ChatView.setShimmerActive(false);
                    ChatView.replaceStreamingPlaceholderWithPlanned(plannedText);
                    // Paneli adım JSON'ları ile doldur
                    try {
                        ChatView.showPlannerPanelWithPlan(plan);
                    } catch(e) { console.warn('showPlannerPanelWithPlan error', e); }
                    break;
                }
                // Streaming yoksa da sade: sadece "İvme planladı (Xs)" yaz ve paneli güncelle
                if (!document.getElementById('ai-streaming-placeholder')) {
                    ChatView.addAiResponsePlaceholder();
                }
                const plannedBase = DOM.getText('planned') || 'İvme planladı';
                const msNow = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                const started = ChatView.getPlanTimerStartMs?.() || planTimerStart;
                const elapsedSec = started ? Math.max(0, (msNow - started) / 1000) : 0;
                const plannedText = `${plannedBase} (${elapsedSec.toFixed(2)}s)`;
                ChatView.setPlannerStreaming(false);
                ChatView.setShimmerActive(false);
                ChatView.replaceStreamingPlaceholderWithPlanned(plannedText);
                try {
                    ChatView.showPlannerPanelWithPlan(plan);
                } catch(e) { console.warn('showPlannerPanelWithPlan error', e); }
                break;
            }
            case 'plannerCompleted': {
                try { ChatView.setPlannerPanelCompleted(true); } catch (e) {}
                // Plan->Act geçişinde tamamlanınca paneli 3sn sonra kapat
                try {
                    const { isAgentActMode } = getState();
                    if (isAgentActMode) {
                        setTimeout(() => { try { ChatView.hidePlannerPanel(); } catch (e) {} }, 3000);
                    }
                } catch (e) {}
                break;
            }

            // Yeni adım eklendi - panel güncelle
            case 'plannerStepInserted': {
                const plan = data?.plan;
                const insertedIndex = data?.insertedIndex;
                if (plan && Array.isArray(plan.steps)) {
                    try {
                        // Completed step tracking'i güncelle
                        if (typeof insertedIndex === 'number') {
                            ChatView.updateCompletedStepsAfterInsertion(insertedIndex);
                        }
                        ChatView.showPlannerPanelWithPlan(plan);
                    } catch(e) { console.warn('plannerStepInserted update error', e); }
                }
                break;
            }
            // Planner adımı silindi - paneli güncelle
            case 'plannerStepDeleted': {
                const plan = data?.plan;
                const deletedIndex = data?.deletedIndex;
                if (plan && Array.isArray(plan.steps)) {
                    try {
                        if (typeof deletedIndex === 'number') {
                            ChatView.updateCompletedStepsAfterDeletion(deletedIndex);
                        }
                        ChatView.showPlannerPanelWithPlan(plan);
                    } catch(e) { console.warn('plannerStepDeleted update error', e); }
                }
                break;
            }

            // --- Agent durumu mesajı ---
            case 'updateAgentStatus':
                setAgentMode(data.isActive, data.activeFileName);
                try { ChatView.refreshPlannerPanelVisibility(); } catch(e) {}
                break;
            case 'restoreAgentMode':
                // Accept payload nested or flat for compatibility
                try {
                    const p = message.payload || message.value || data || {};
                    const isActive = typeof p.isActive === 'boolean' ? p.isActive : !!p.payload?.isActive;
                    const isBarExpanded = (Object.prototype.hasOwnProperty.call(p, 'isBarExpanded') ? p.isBarExpanded : p.payload?.isBarExpanded);
                    const isActMode = (Object.prototype.hasOwnProperty.call(p, 'isActMode') ? p.isActMode : p.payload?.isActMode);
                    // Apply bar expansion first so setAgentMode can reflect it in DOM
                    if (typeof isBarExpanded === 'boolean') setAgentBarExpanded(!!isBarExpanded);
                    setAgentMode(!!isActive, '');
                    if (typeof isActMode === 'boolean') setAgentActMode(!!isActMode);
                    // Ensure toggle visibility is synced after applying modes
                    try { updatePlanActToggleVisibility(); } catch (e) {}
                } catch {}
                try { ChatView.refreshPlannerPanelVisibility(); } catch(e) {}
                break;
            case 'languageChanged':
                // Dil değişikliği sırasında UI metinlerini güncelle
                updateUITexts();
                break;
            case 'agentSelectionSet':
                setAgentSelectionStatus(data.fileName, data.startLine, data.endLine, data.content);
                break;
            case 'agentSelectionCleared':
                clearAgentSelectionStatus();
                break;

            // --- Bağlam (Context) Mesajları ---
            case 'updateContextSize': {
                // Backend'den gelen konuşma ve dosya token sayılarını state'e uygula
                try {
                    const conv = Number(data?.conversationSize || 0) || 0;
                    const files = Number(data?.filesSize || 0) || 0;
                    setContextSize(conv, files);
                } catch (e) {}
                try { InputArea.recalculateTotalAndUpdateUI(); } catch (e) {}
                break; }
            
            case 'fileContextSet': 
                FileTags.display(message.fileNames); 
                break;

            case 'clearContext':
            case 'clearFileContext':
                FileTags.clear(); 
                break;
            
            // YENİ/GÜNCELLENDİ: Kod aktarımı için UI component'i göster
            case 'contextSet': 
                showCodeTransferIndicator(data);
                break;

            // --- Diğer Mesajlar ---
            case 'loadConfig':
                SettingsModal.loadConfig(data);
                break;

            case 'loadHistory':
                HistoryPanel.populate(data);
                break;

            case 'clearChat':
                ChatView.clear();
                resetChatState();
                InputArea.recalculateTotalAndUpdateUI();
                InputArea.autoResize();
                break;

            case 'loadConversation':
                // Yeni sayfa/konuşma yüklenirken eski planner adımları görünmesin
                try { ChatView.hidePlannerPanel(); } catch(e) {}
                ChatView.load(data);
                break;

            case 'settingsSaveResult':
                SettingsModal.handleSaveResult(data);
                break;

            // Custom Tools Messages
            case 'customToolCreated':
                SettingsModal.handleCustomToolCreated(data);
                break;

            case 'customToolDeleted':
                SettingsModal.handleCustomToolDeleted(data);
                break;

            case 'customToolsList':
                SettingsModal.handleCustomToolsList(data);
                break;

            case 'toolsInitialized':
                SettingsModal.handleToolsInitialized(data);
                break;
        }
    });
}