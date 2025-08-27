/* ==========================================================================
   CHAT VIEW BİLEŞENİ ("DEĞİŞİKLİKLERİ UYGULA" BUTONU EKLENDİ)
   ========================================================================== */

import * as DOM from '../utils/dom.js';
import { getState, setAiResponding, incrementConversationSize, setContextSize, resetChatState, lockConversation } from '../core/state.js';
import { postMessage } from '../services/vscode.js';
import { recalculateTotalAndUpdateUI, setPlaceholder, focus as focusInput } from './InputArea.js';
import { autoResize as autoResizeInput } from './InputArea.js';

// --- Değişkenler ---
let streamingBuffer = '';
let textQueue = [];
let isTypingAnimationRunning = false;
let streamHasEnded = false;
let isStreamingCancelled = false; 
let charBuffer = '';
let lastRenderTime = 0;
let targetCharsPerSecond = 80; // Dinamik ölçüm için başlangıç
let rateWindow = [];
let finalReplaceText = null;
let planTimerStartMs = null;
let lastPlannerStepsCache = [];
let lastPlannerPlan = null;
let activeInlineEditorEl = null;
let activeInlineEditorIndex = -1;
let completedPlannerSteps = new Set();
let summaryTargetEl = null;
let summaryContainerEl = null;
let summaryMessageEl = null;

let shouldAutoScroll = true;

// Available tools cache for planner step tool selectors
let availableToolNames = [];
export function setAvailableTools(names) {
    try { availableToolNames = Array.isArray(names) ? names.slice() : []; } catch { availableToolNames = []; }
}
function getAvailableToolNames() { return Array.isArray(availableToolNames) ? availableToolNames : []; }

DOM.chatContainer.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = DOM.chatContainer;
    shouldAutoScroll = scrollTop + clientHeight >= scrollHeight - 10;
});

// --- Private Fonksiyonlar ---

function createMessageElement(role, content) {
    if (DOM.welcomeContainer.classList.contains('hidden') === false) {
        DOM.welcomeContainer.classList.add('hidden');
        DOM.chatContainer.classList.remove('hidden');
        if (DOM.welcomeVideo) {
            DOM.welcomeVideo.classList.add('video-hidden');
            setTimeout(() => DOM.welcomeVideo.pause(), 500);
        }
    }
    const messageTemplate = document.getElementById('message-template');
    const messageClone = messageTemplate.content.cloneNode(true);
    const messageElement = messageClone.querySelector('.message');
    messageElement.classList.add(`${role}-message`, 'fade-in');
    
    const avatarIcon = messageClone.querySelector('.avatar-icon');
    avatarIcon.src = role === 'user' ? DOM.USER_ICON_URI : DOM.AI_ICON_URI;
    const contentElement = messageClone.querySelector('.message-content');
    contentElement.innerHTML = content;
    DOM.chatContainer.appendChild(messageClone);
    if (shouldAutoScroll) {
        DOM.chatContainer.scrollTop = DOM.chatContainer.scrollHeight;
    }
    return messageElement;
}

/**
 * GÜNCELLENDİ: Kod bloklarına "Değişikliği Uygula" butonu eklendi.
 */
function addCodeBlockActions(element) {
    element.querySelectorAll('pre:not(.actions-added)').forEach(preElement => {
        const container = document.createElement('div');
        container.className = 'code-block-container';
        
        const parent = preElement.parentNode;
        if (parent) parent.replaceChild(container, preElement);
        container.appendChild(preElement);

        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'code-block-actions';
        
        const codeElement = preElement.querySelector('code');
        if (!codeElement) return; // Code bloğu yoksa devam etme

        // --- Kopyala Butonu ---
        const copyButton = document.createElement('button');
        copyButton.className = 'code-action-button';
        copyButton.innerHTML = DOM.COPY_ICON_SVG; // Sadece ikon
        copyButton.title = DOM.getText('copy'); // Tooltip metni
        copyButton.addEventListener('click', () => {
            const codeToCopy = codeElement.textContent;
            navigator.clipboard.writeText(codeToCopy).then(() => {
                copyButton.innerHTML = DOM.COPY_ICON_SVG; // Sadece ikon
                copyButton.title = DOM.getText('copied'); // Tooltip metni
                setTimeout(() => { 
                    copyButton.innerHTML = DOM.COPY_ICON_SVG; 
                    copyButton.title = DOM.getText('copy');
                }, 2000);
            });
        });

        // --- YENİ: Değişikliği Uygula Butonu ---
        const applyButton = document.createElement('button');
        applyButton.className = 'code-action-button apply-button';
        applyButton.innerHTML = DOM.APPLY_ICON_SVG; // Sadece ikon
        applyButton.title = DOM.getText('apply'); // Tooltip metni

        // Başlangıçta butonun görünürlüğünü ayarla
        updateApplyButtonVisibility(applyButton); 
        
        applyButton.addEventListener('click', () => {
            const codeToApply = codeElement.textContent;
            // Eklenti tarafına yeni kodu uygula mesajı gönder
            postMessage('applyCodeChange', { newCode: codeToApply });
            
            applyButton.innerHTML = DOM.APPLY_ICON_SVG; // Sadece ikon
            applyButton.title = DOM.getText('applied'); // Tooltip metni
            applyButton.disabled = true;
            setTimeout(() => { 
                applyButton.innerHTML = DOM.APPLY_ICON_SVG; 
                applyButton.title = DOM.getText('apply');
                applyButton.disabled = false;
            }, 2500);
        });

        actionsContainer.appendChild(applyButton); // Önce Uygula butonu
        actionsContainer.appendChild(copyButton);   // Sonra Kopyala butonu
        container.appendChild(actionsContainer);

        preElement.classList.add('actions-added');
    });
}

export function stopStreaming() {
    postMessage('stopGeneration');
    isStreamingCancelled = true;
    textQueue = [];
    runFinalizationLogic();
}

function updateRate(sampleLen) {
    const now = performance.now();
    rateWindow.push({ time: now, len: sampleLen });
    while (rateWindow.length > 0 && now - rateWindow[0].time > 2000) rateWindow.shift();
    const totalLen = rateWindow.reduce((a, b) => a + b.len, 0);
    const elapsed = rateWindow.length ? now - rateWindow[0].time : 0;
    if (elapsed > 0) {
        const cps = (totalLen * 1000) / elapsed;
        targetCharsPerSecond = Math.max(40, Math.min(300, cps));
    }
}

function processTypingQueue() {
    if (isTypingAnimationRunning) return;
    isTypingAnimationRunning = true;
    lastRenderTime = 0;

    const placeholder = document.getElementById('ai-streaming-placeholder');
    if (!placeholder) {
        isTypingAnimationRunning = false;
        return;
    }
    const contentElement = placeholder.querySelector('.message-content');

    if (contentElement.textContent === DOM.getText('thinking')) {
        contentElement.innerHTML = '';
    }

    function step(timestamp) {
        if (isStreamingCancelled) { isTypingAnimationRunning = false; return; }
        if (!placeholder.parentNode) { isTypingAnimationRunning = false; return; }
        if (lastRenderTime === 0) lastRenderTime = timestamp;
        const elapsed = timestamp - lastRenderTime;
        let allow = Math.max(1, Math.floor(targetCharsPerSecond * (elapsed / 1000)));
        if (allow > charBuffer.length) allow = charBuffer.length;

        if (allow > 0) {
            const toAdd = charBuffer.slice(0, allow);
            charBuffer = charBuffer.slice(allow);
            streamingBuffer += toAdd;
            // Planner streaming modunda markdown parse etme; düz metin göster
            if (placeholder.classList.contains('planner-streaming')) {
                contentElement.textContent = streamingBuffer;
            } else {
                contentElement.innerHTML = marked.parse(streamingBuffer);
            }
            if (shouldAutoScroll) DOM.chatContainer.scrollTop = DOM.chatContainer.scrollHeight;
            lastRenderTime = timestamp;
        }

        if (charBuffer.length > 0 || !streamHasEnded) {
            requestAnimationFrame(step);
        } else {
            isTypingAnimationRunning = false;
            if (streamHasEnded) runFinalizationLogic();
        }
    }

    requestAnimationFrame(step);
}

function runFinalizationLogic() {
    const placeholder = document.getElementById('ai-streaming-placeholder');
    if (!placeholder) return;

    placeholder.querySelector('.avatar-wrapper')?.classList.remove('loading');
    const contentElement = placeholder.querySelector('.message-content');
    // Final metin ayarlanmışsa, içerik onu göstersin
    if (finalReplaceText && typeof finalReplaceText === 'string') {
        contentElement.textContent = finalReplaceText;
        finalReplaceText = null;
    }
    // Eğer içerikte numaralandırılmış adımlar varsa, bunları ayıkla ve
    // placeholder'ın hemen üzerine yeni bir baloncuk olarak ekle
    try {
        const rawText = (contentElement.textContent || '').trim();
        if (rawText) {
            // Regex: 1. ..., 1) ... biçimindeki adımları yakala (multiline, dotAll)
            const stepRegex = /(^|\n)\s*(\d+)\s*(?:\.|\))\s*(.+?)(?=(?:\n\s*\d+\s*(?:\.|\))\s*)|$)/gms;
            const steps = [];
            let m;
            while ((m = stepRegex.exec(rawText)) !== null) {
                const stepText = (m[3] || '').trim();
                if (stepText.length > 0) steps.push({ n: Number(m[2]), text: stepText });
            }

            if (steps.length > 0) {
                // Küçük bir yardımcı: HTML escape
                const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const olItems = steps
                    .sort((a, b) => a.n - b.n)
                    .map(s => `<li>${escapeHtml(s.text)}</li>`)
                    .join('');

                const stepsHtml = `<div class="planner-steps"><ol>${olItems}</ol></div>`;

                // Template klonla ve placeholder'ın üzerine yerleştir
                const messageTemplate = document.getElementById('message-template');
                if (messageTemplate && placeholder.parentNode) {
                    const clone = messageTemplate.content.cloneNode(true);
                    const stepsElem = clone.querySelector('.message');
                    if (stepsElem) {
                        stepsElem.classList.add('assistant-message', 'planner-steps-message', 'fade-in');
                        const avatarIcon = clone.querySelector('.avatar-icon');
                        if (avatarIcon) avatarIcon.src = DOM.AI_ICON_URI;
                        const contentEl = clone.querySelector('.message-content');
                        if (contentEl) contentEl.innerHTML = stepsHtml;
                        // Insert before the placeholder so it appears above
                        placeholder.parentNode.insertBefore(clone, placeholder);
                        try {
                            // Ayrıca uzun paneli doldur (sadece Agent+Index modunda görünür yap)
                            const stepTexts = steps.sort((a,b)=>a.n-b.n).map(s=>s.text);
                            showPlannerPanel(stepTexts);
                        } catch(e) { console.warn('showPlannerPanel error', e); }
                    }
                }
            }
        }
    } catch (e) {
        // parsing hatası varsa yoksay
        console.warn('Planner steps parsing error', e);
    }

    contentElement.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });
    addCodeBlockActions(contentElement);
    
    placeholder.id = '';
    
    setAiResponding(false);
    recalculateTotalAndUpdateUI();
    focusInput();
    postMessage('requestContextSize');
}

// Planner panel ve kısa baloncukları sıfırla
function resetPlannerUI() {
    try {
        lastPlannerStepsCache = [];
        lastPlannerPlan = null;
        const panel = document.getElementById('planner-panel');
        const content = document.getElementById('planner-panel-content');
        const list = document.getElementById('planner-steps-list');
        if (panel) {
            panel.classList.add('hidden');
            panel.classList.add('collapsed');
            panel.classList.remove('expanded');
        }
        if (content) content.classList.add('hidden');
        if (list) list.innerHTML = '';
        document.querySelectorAll('.planner-steps-message').forEach(el => {
            try { el.remove(); } catch(e){}
        });
    } catch (e) { console.warn('resetPlannerUI error', e); }
}

// --- Public Fonksiyonlar ---

export function init() {}

export function addUserMessage(text) {
    try {
        const existing = document.getElementById('ai-streaming-placeholder');
        if (existing) {
            existing.classList.remove('shimmer-active');
            existing.classList.remove('planner-streaming');
            try { existing.querySelector('.avatar-wrapper')?.classList.remove('loading'); } catch (e) {}
            existing.id = '';
        }
    } catch (e) {}
    try { summaryTargetEl = null; } catch (e) {}
    try { summaryContainerEl = null; } catch (e) {}
    const p = document.createElement('p');
    p.textContent = text;
    createMessageElement('user', p.outerHTML);
    
    // Token sayımı model usage ile güncellenecek
    
    lockConversation();
    recalculateTotalAndUpdateUI();
    setAiResponding(true);
}

export function addSystemMessage(text) {
    const p = document.createElement('p');
    p.innerHTML = `<i>${text}</i>`;
    createMessageElement('assistant', p.outerHTML);
}

export function addAiResponsePlaceholder() {
    if (document.getElementById('ai-streaming-placeholder')) return;

    streamingBuffer = '';
    textQueue = [];
    charBuffer = '';
    rateWindow = [];
    targetCharsPerSecond = 80;
    isTypingAnimationRunning = false;
    streamHasEnded = false;
    isStreamingCancelled = false;

    const messageElement = createMessageElement('assistant', '');
    messageElement.id = 'ai-streaming-placeholder';
    const avatarWrapper = messageElement.querySelector('.avatar-wrapper');
    avatarWrapper.classList.add('loading');
    // Shimmer efektini yalnızca Agent modu ve indexing izinliyse aktif et
    try {
        const { isAgentModeActive, isIndexingEnabled } = getState();
        if (isAgentModeActive && isIndexingEnabled) {
            messageElement.classList.add('shimmer-active');
        }
    } catch (e) {
        // fallback: ekleme yapma
    }
    // Plan süresi ölçümü için başlangıç zamanı kaydet
    try { planTimerStartMs = performance.now(); } catch { planTimerStartMs = Date.now(); }
}

// YENİ: Akış finalize olurken placeholder içeriğini özel bir metinle değiştirmek için
export function setFinalReplaceText(text) {
    finalReplaceText = typeof text === 'string' ? text : '';
}

// YENİ: Planner streaming başlığı değiştirme
export function replaceStreamingPlaceholderHeader(text) {
    const placeholder = document.getElementById('ai-streaming-placeholder');
    if (!placeholder) {
        addAiResponsePlaceholder();
    }
    const el = document.getElementById('ai-streaming-placeholder');
    if (!el) return;
    const contentElement = el.querySelector('.message-content');
    // Yeni adım başlarken önce mevcut streaming durumunu sıfırla ve başlığı buffer'a yaz (düz metin)
    streamingBuffer = text || '';
    charBuffer = '';
    rateWindow = [];
    targetCharsPerSecond = 80;
    // Devam eden animasyon varsa aynı döngü çalışmaya devam etsin; sadece zamanlamayı sıfırla
    lastRenderTime = 0;
    contentElement.textContent = streamingBuffer; // düz metin ("ivme düşünüyor" ile aynı tip)
}

// YENİ: Planner streaming state işareti (UI davranışı için kullanılabilir)
export function setPlannerStreaming(active) {
    const el = document.getElementById('ai-streaming-placeholder');
    if (!el) return;
    if (active) {
        el.classList.add('planner-streaming');
    } else {
        el.classList.remove('planner-streaming');
    }
}

// YENİ: Placeholder shimmer efektini aç/kapat
export function setShimmerActive(active) {
    const el = document.getElementById('ai-streaming-placeholder');
    if (!el) return;
    if (active) {
        el.classList.add('shimmer-active');
    } else {
        el.classList.remove('shimmer-active');
    }
}

// YENİ: Plan tamamlandığında placeholder metnini soft gri renkte (pulse olmadan) sabitle
export function replaceStreamingPlaceholderWithPlanned(text) {
    const el = document.getElementById('ai-streaming-placeholder');
    if (!el) return;
    const contentElement = el.querySelector('.message-content');
    // Pulse kapalı ve sabit yumuşak gri renk
    el.classList.remove('shimmer-active');
    contentElement.style.animation = 'none';
    // Streaming state'i planned metinle senkronize et (yalnızca planned satır gri olsun)
    const safe = String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    streamingBuffer = `<span class="planned-soft">${safe}</span>\n\n`;
    charBuffer = '';
    // Metni doğrudan yaz (HTML içerir)
    contentElement.innerHTML = streamingBuffer;
}

// Yeni: Planner panel göster/gizle ve adımları doldurma
export function showPlannerPanel(steps) {
    try {
        const panel = document.getElementById('planner-panel');
        const content = document.getElementById('planner-panel-content');
        const list = document.getElementById('planner-steps-list');
        if (!panel || !content || !list) return;
        const { isAgentModeActive, isIndexingEnabled } = getState();
        // Sadece Agent modu ve index açıkken paneli göster
        if (!(isAgentModeActive && isIndexingEnabled)) {
            // görünürlüğü kapat ama adımları cache'le
            lastPlannerStepsCache = Array.isArray(steps) ? steps.slice() : [];
            panel.classList.add('hidden');
            return;
        }
        // Cache'i güncelle
        lastPlannerStepsCache = Array.isArray(steps) ? steps.slice() : [];

        // Temizle
        list.innerHTML = '';

        for (let i = 0; i < steps.length; i++) {
            const s = steps[i];
            const li = document.createElement('li');
            const text = typeof s === 'string' ? s : (s?.text || '');
            const span = document.createElement('span');
            span.textContent = text;
            li.appendChild(span);
            list.appendChild(li);
        }

        panel.classList.remove('hidden');
        // İlk oluşturulduğunda kapalı (collapsed) başlasın
        content.classList.add('hidden');
        panel.classList.add('collapsed');
        panel.classList.remove('expanded');
        panel.classList.remove('completed');

        try { autoResizeInput(); } catch (e) {}

        // Toggle buton handler (bir kez ekle)
        const toggle = document.getElementById('planner-panel-toggle');
        if (toggle && !toggle.dataset.bound) {
            toggle.addEventListener('click', () => {
                const isHidden = content.classList.toggle('hidden');
                if (isHidden) {
                    panel.classList.add('collapsed');
                    panel.classList.remove('expanded');
                } else {
                    panel.classList.remove('collapsed');
                    panel.classList.add('expanded');
                }
                try { autoResizeInput(); } catch (e) {}
            });
            toggle.dataset.bound = '1';
            // Add single run-all checkbox button to the left of the toggle (only once)
            try {
                if (!document.getElementById('planner-run-all-toggle')) {
                    const runAllBtn = document.createElement('button');
                    runAllBtn.id = 'planner-run-all-toggle';
                    runAllBtn.className = 'icon-button planner-run-all';
                    runAllBtn.title = 'Tüm adımları uygula';
                    runAllBtn.innerText = '✔';
                    // small left margin so it's just left of the toggle label
                    runAllBtn.style.marginLeft = '4px';
                    runAllBtn.addEventListener('click', () => { try { postMessage('executePlannerAll'); } catch (e) {} });
                    // Insert the run-all button into the planner bar immediately before the toggle
                    try {
                        const titleEl = toggle.parentNode.querySelector('.planner-panel-title');
                        if (titleEl) {
                            titleEl.appendChild(runAllBtn); // place inside title so it stays right next to text
                        } else {
                            const bar = toggle.closest('.planner-panel-bar') || toggle.parentNode;
                            bar.insertBefore(runAllBtn, toggle); // fallback: left of toggle
                        }
                    } catch (e) {
                        try { toggle.parentNode.insertBefore(runAllBtn, toggle); } catch(e){}
                    }
                }
            } catch (e) { /* ignore */ }
        }
    } catch (e) { console.warn('showPlannerPanel error', e); }
}

// Yeni: Plan objesi ile (adım JSON'ları dahil) paneli doldur
export function showPlannerPanelWithPlan(plan) {
    try {
        const panel = document.getElementById('planner-panel');
        const content = document.getElementById('planner-panel-content');
        const list = document.getElementById('planner-steps-list');
        if (!panel || !content || !list) return;
        const { isAgentModeActive, isIndexingEnabled } = getState();
        if (!(isAgentModeActive && isIndexingEnabled)) {
            lastPlannerPlan = plan || null;
            // yine de ui_text'leri cache'le
            try {
                const texts = Array.isArray(plan?.steps) ? plan.steps.map(s => (typeof s?.ui_text === 'string' && s.ui_text.trim()) ? s.ui_text.trim() : (typeof s?.action === 'string' ? s.action : '')) : [];
                lastPlannerStepsCache = texts;
            } catch {}
            panel.classList.add('hidden');
            return;
        }

        // Cache'leri güncelle
        // Yeni plan referansı geldiyse tamamlananlar setini sıfırla
        if (lastPlannerPlan !== plan) {
            completedPlannerSteps = new Set();
        }
        lastPlannerPlan = plan || null;
        const steps = Array.isArray(plan?.steps) ? plan.steps : [];
        lastPlannerStepsCache = steps.map(s => (typeof s?.ui_text === 'string' && s.ui_text.trim()) ? s.ui_text.trim() : (typeof s?.action === 'string' ? s.action : ''));

        // Temizle ve listeyi yeniden oluştur
        list.innerHTML = '';

        steps.forEach((step, idx) => {
            // İlk adımdan önce de insert butonu ekle (ancak ilk adım completed değilse)
            if (idx === 0) {
                const insertLi = document.createElement('li');
                insertLi.className = 'planner-insert-item';
                
                const insertAboveBtn = document.createElement('button');
                insertAboveBtn.className = 'step-insert-button';
                insertAboveBtn.type = 'button';
                insertAboveBtn.title = DOM.getText('insertAbove') || 'Üste Ekle';
                insertAboveBtn.innerHTML = `<img src="${DOM.INSERT_ICON_URI}" alt="insert" class="insert-icon"/>`;
                
                // İlk adımdan önceki buton hiçbir zaman kilitlenmez
                insertAboveBtn.addEventListener('click', () => {
                    try { openNewStepEditor(0, 'above'); } catch {}
                });
                insertLi.appendChild(insertAboveBtn);
                list.appendChild(insertLi);
            } else if (idx > 0) {
                // Sonraki adımlar için arada insert butonu
                const insertLi = document.createElement('li');
                insertLi.className = 'planner-insert-item';
                
                const insertAboveBtn = document.createElement('button');
                insertAboveBtn.className = 'step-insert-button';
                insertAboveBtn.type = 'button';
                insertAboveBtn.title = DOM.getText('insertAbove') || 'Üste Ekle';
                insertAboveBtn.innerHTML = `<img src="${DOM.INSERT_ICON_URI}" alt="insert" class="insert-icon"/>`;
                
                // Sadece önceki adım completed ise bu butonu devre dışı bırak (üstteki buton kilitlenir)
                const prevCompleted = completedPlannerSteps && completedPlannerSteps.has(idx - 1);
                if (prevCompleted) {
                    insertAboveBtn.disabled = true;
                    insertAboveBtn.classList.add('disabled');
                } else {
                    insertAboveBtn.addEventListener('click', () => {
                        try { openNewStepEditor(idx, 'above'); } catch {}
                    });
                }
                insertLi.appendChild(insertAboveBtn);
                list.appendChild(insertLi);
            }

            const li = document.createElement('li');
            li.className = 'planner-step-item';

            const text = (typeof step?.ui_text === 'string' && step.ui_text.trim()) ? step.ui_text.trim() : (typeof step?.action === 'string' ? step.action : '');
            const stepNumber = typeof step?.step === 'number' ? step.step : (idx + 1);
            const span = document.createElement('span');
            span.textContent = `${stepNumber}. ${text}`;
            span.className = 'planner-step-text';
            li.appendChild(span);

            // Tool selector (butonların solunda)
            try {
                const toolWrap = document.createElement('div');
                toolWrap.className = 'planner-tool-wrap';
                toolWrap.style.display = 'inline-flex';
                toolWrap.style.alignItems = 'center';
                toolWrap.style.gap = '6px';
                toolWrap.style.marginRight = '8px';
                const label = document.createElement('span');
                label.textContent = 'Araç:';
                label.className = 'planner-tool-label';
                const select = document.createElement('select');
                select.className = 'planner-tool-select';
                // Options
                const optAuto = document.createElement('option');
                optAuto.value = 'auto';
                optAuto.textContent = '(auto)';
                select.appendChild(optAuto);
                try {
                    const names = (getAvailableToolNames?.() || []);
                    names.forEach(name => {
                        const opt = document.createElement('option');
                        opt.value = name;
                        opt.textContent = name;
                        select.appendChild(opt);
                    });
                } catch (e) { /* ignore */ }
                // Current value: prefer step.tool, then first tool_calls[].tool, else auto
                let initialTool = '';
                if (typeof step?.tool === 'string' && step.tool.trim().length > 0) {
                    initialTool = step.tool.trim();
                } else if (Array.isArray(step?.tool_calls) && step.tool_calls.length > 0 && typeof step.tool_calls[0]?.tool === 'string' && step.tool_calls[0].tool.trim().length > 0) {
                    initialTool = step.tool_calls[0].tool.trim();
                }
                try {
                    const namesNow = (getAvailableToolNames?.() || []);
                    const exactMatch = initialTool && namesNow.includes(initialTool);
                    select.value = exactMatch ? initialTool : 'auto';
                } catch {
                    select.value = initialTool || 'auto';
                }
                // Change handler -> update step
                select.addEventListener('change', () => {
                    try {
                        if (lastPlannerPlan && Array.isArray(lastPlannerPlan.steps) && lastPlannerPlan.steps[idx]) {
                            const old = lastPlannerPlan.steps[idx];
                            const updated = { ...old, tool: String(select.value || '') || undefined };
                            lastPlannerPlan.steps[idx] = updated;
                            postMessage('updatePlannerStep', { index: idx, step: updated });
                        }
                    } catch (e) { /* ignore */ }
                });
                toolWrap.appendChild(label);
                toolWrap.appendChild(select);
                li.appendChild(toolWrap);
            } catch (e) { /* ignore */ }

            const actions = document.createElement('div');
            actions.className = 'planner-step-actions';

            // Düzenle (JSON'u göster) butonu
            const editBtn = document.createElement('button');
            editBtn.className = 'step-action-button';
            editBtn.type = 'button';
            editBtn.title = DOM.getText('edit') || 'Düzenle';
            editBtn.innerHTML = `<img src="${DOM.EDIT_ICON_URI}" alt="edit" class="icon-img"/>`;
            editBtn.addEventListener('click', (ev) => openStepInlineEditor(idx, ev.currentTarget));
            actions.appendChild(editBtn);

            // Uygula butonu (şimdilik sadece gönderim)
            const applyBtn = document.createElement('button');
            applyBtn.className = 'step-action-button primary';
            applyBtn.type = 'button';
            applyBtn.title = DOM.getText('apply') || 'Uygula';
            applyBtn.innerHTML = `<img src="${DOM.APPLY_ICON_URI}" alt="apply" class="icon-img"/>`;
            applyBtn.addEventListener('click', () => {
                try { postMessage('executePlannerStep', { index: idx }); } catch {}
            });
            actions.appendChild(applyBtn);

            // Sil (delete) butonu
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'step-action-button delete';
            deleteBtn.type = 'button';
            deleteBtn.title = DOM.getText('delete') || 'Sil';
            // Kullanıcının istediği gibi basit bir "X" görünümü
            deleteBtn.textContent = '✕';
            deleteBtn.addEventListener('click', () => {
                try { postMessage('deletePlannerStep', { index: idx }); } catch {}
            });
            actions.appendChild(deleteBtn);

            li.appendChild(actions);
            // Eğer daha önce tamamlandıysa işaretle ve butonları kilitle
            if (completedPlannerSteps && completedPlannerSteps.has(idx)) {
                li.classList.add('completed');
                try { editBtn.disabled = true; } catch {}
                try { applyBtn.disabled = true; } catch {}
                try { deleteBtn.disabled = true; } catch {}
            }
            list.appendChild(li);
        });

        // Son adımdan sonra da insert butonu ekle (son adım completed değilse)
        if (steps.length > 0) {
            const insertLi = document.createElement('li');
            insertLi.className = 'planner-insert-item';
            
            const insertBelowBtn = document.createElement('button');
            insertBelowBtn.className = 'step-insert-button';
            insertBelowBtn.type = 'button';
            insertBelowBtn.title = DOM.getText('insertBelow') || 'Alta Ekle';
            insertBelowBtn.innerHTML = `<img src="${DOM.INSERT_ICON_URI}" alt="insert" class="insert-icon"/>`;
            
            // Son adımdan sonraki buton hiçbir zaman kilitlenmez (alttaki buton aktif kalır)
            insertBelowBtn.addEventListener('click', () => {
                try { openNewStepEditor(steps.length, 'below'); } catch {}
            });
            insertLi.appendChild(insertBelowBtn);
            list.appendChild(insertLi);
        }

        panel.classList.remove('hidden');
        content.classList.add('hidden');
        panel.classList.add('collapsed');
        panel.classList.remove('expanded');
        panel.classList.remove('completed');
        try { autoResizeInput(); } catch (e) {}

        // Toggle buton handler (bir kez ekle)
        const toggle = document.getElementById('planner-panel-toggle');
        if (toggle && !toggle.dataset.bound) {
            toggle.addEventListener('click', () => {
                const isHidden = content.classList.toggle('hidden');
                if (isHidden) {
                    panel.classList.add('collapsed');
                    panel.classList.remove('expanded');
                } else {
                    panel.classList.remove('collapsed');
                    panel.classList.add('expanded');
                }
                try { autoResizeInput(); } catch (e) {}
            });
            toggle.dataset.bound = '1';
            // Run-all düğmesini ekle (varsa atla)
            try {
                if (!document.getElementById('planner-run-all-toggle')) {
                    const runAllBtn = document.createElement('button');
                    runAllBtn.id = 'planner-run-all-toggle';
                    runAllBtn.className = 'icon-button planner-run-all';
                    runAllBtn.title = 'Tüm adımları uygula';
                    runAllBtn.innerText = '✔';
                    runAllBtn.style.marginLeft = '4px';
                    runAllBtn.addEventListener('click', () => { try { postMessage('executePlannerAll'); } catch (e) {} });
                    try {
                        const titleEl = toggle.parentNode.querySelector('.planner-panel-title');
                        if (titleEl) {
                            titleEl.appendChild(runAllBtn);
                        } else {
                            const bar = toggle.closest('.planner-panel-bar') || toggle.parentNode;
                            bar.insertBefore(runAllBtn, toggle);
                        }
                    } catch (e) {
                        try { toggle.parentNode.insertBefore(runAllBtn, toggle); } catch(e){}
                    }
                }
            } catch (e) { /* ignore */ }
        }
    } catch (e) { console.warn('showPlannerPanelWithPlan error', e); }
}

function openStepInlineEditor(index, anchorEl) {
    try {
        // Kapat/temizle (tek editor)
        closeStepInlineEditor();
        const step = Array.isArray(lastPlannerPlan?.steps) ? lastPlannerPlan.steps[index] : null;
        const currentUiText = typeof step?.ui_text === 'string' ? step.ui_text : '';
        const currentAction = typeof step?.action === 'string' ? step.action : '';
        const currentThought = typeof step?.thought === 'string' ? step.thought : '';

        const rect = anchorEl?.getBoundingClientRect?.();
        const container = document.createElement('div');
        container.className = 'step-inline-editor';
        container.innerHTML = `
            <div class="field-row">
                <label class="field-label">ui_text</label>
                <input id="sie-ui-text" class="field-input" type="text" value="${escapeHtmlAttr(currentUiText)}" placeholder="Panelde görünecek kısa açıklama..." />
            </div>
            <div class="field-row">
                <label class="field-label">action</label>
                <input id="sie-action" class="field-input" type="text" value="${escapeHtmlAttr(currentAction)}" />
            </div>
            <div class="field-row">
                <label class="field-label">thought</label>
                <input id="sie-thought" class="field-input" type="text" value="${escapeHtmlAttr(currentThought)}" />
            </div>
            <div class="editor-actions">
                <button id="sie-save" class="primary-button">${DOM.getText('save') || 'Kaydet'}</button>
                <button id="sie-cancel" class="secondary-button">${DOM.getText('cancel') || 'İptal'}</button>
            </div>
        `;
        document.body.appendChild(container);

        // Konumla (butonun altına, ekrana sığacak şekilde)
        const desiredWidth = 520; // daha geniş
        const SIDE_MARGIN = 25; // input-wrapper ve planner panel ile aynı boşluk
        const viewportW = window.innerWidth || document.documentElement.clientWidth;
        const finalWidth = Math.max(360, Math.min(desiredWidth, viewportW - SIDE_MARGIN * 2));
        let left = Math.round((viewportW - finalWidth) / 2);
        const top = Math.min((rect?.bottom ?? 20) + 6, (window.innerHeight - 10));
        container.style.position = 'fixed';
        container.style.left = `${Math.round(left)}px`;
        container.style.top = `${Math.round(top)}px`;
        container.style.width = `${finalWidth}px`;

        // Eventler
        const saveBtn = container.querySelector('#sie-save');
        const cancelBtn = container.querySelector('#sie-cancel');
        saveBtn?.addEventListener('click', () => {
            try {
                const uiTextInput = container.querySelector('#sie-ui-text');
                const actionInput = container.querySelector('#sie-action');
                const thoughtInput = container.querySelector('#sie-thought');
                const newUiText = String(uiTextInput && uiTextInput.value || '').trim();
                const newAction = String(actionInput && actionInput.value || '').trim();
                const newThought = String(thoughtInput && thoughtInput.value || '').trim();
                if (lastPlannerPlan && Array.isArray(lastPlannerPlan.steps) && lastPlannerPlan.steps[index]) {
                    const old = lastPlannerPlan.steps[index];
                    const updated = { ...old, ui_text: newUiText, action: newAction, thought: newThought };
                    lastPlannerPlan.steps[index] = updated;
                    // Panel metnini güncelle (ui_text yoksa action kullanılır)
                    try {
                        const list = document.getElementById('planner-steps-list');
                        const li = list?.children?.[index];
                        const span = li?.querySelector?.('.planner-step-text');
                        const newText = (typeof updated?.ui_text === 'string' && updated.ui_text.trim()) ? updated.ui_text.trim() : (typeof updated?.action === 'string' ? updated.action : '');
                        const stepNumber = typeof updated?.step === 'number' ? updated.step : (index + 1);
                        if (span) span.textContent = `${stepNumber}. ${newText}`;
                    } catch {}
                    try {
                        lastPlannerStepsCache = Array.isArray(lastPlannerPlan.steps) ? lastPlannerPlan.steps.map(s => (typeof s?.ui_text === 'string' && s.ui_text.trim()) ? s.ui_text.trim() : (typeof s?.action === 'string' ? s.action : '')) : [];
                    } catch {}
                    try { postMessage('updatePlannerStep', { index, step: updated }); } catch {}
                }
            } catch {}
            closeStepInlineEditor();
        });
        cancelBtn?.addEventListener('click', () => closeStepInlineEditor());
        setTimeout(() => {
            document.addEventListener('keydown', inlineEscClose, { once: true });
            document.addEventListener('mousedown', outsideInlineClick, true);
            window.addEventListener('scroll', closeStepInlineEditor, { once: true });
            window.addEventListener('resize', closeStepInlineEditor, { once: true });
        }, 0);

        activeInlineEditorEl = container;
        activeInlineEditorIndex = index;
    } catch (e) { console.warn('openStepInlineEditor error', e); }
}

function openNewStepEditor(insertIndex, direction) {
    try {
        // Kapat/temizle (tek editor)
        closeStepInlineEditor();
        
        const container = document.createElement('div');
        container.className = 'step-inline-editor';
        container.innerHTML = `
            <div class="field-row">
                <label class="field-label">ui_text</label>
                <input id="sie-ui-text" class="field-input" type="text" value="" placeholder="Panelde görünecek kısa açıklama..." />
            </div>
            <div class="field-row">
                <label class="field-label">action</label>
                <input id="sie-action" class="field-input" type="text" value="" placeholder="Yeni adımın action alanı..." />
            </div>
            <div class="field-row">
                <label class="field-label">thought</label>
                <input id="sie-thought" class="field-input" type="text" value="" placeholder="Yeni adımın thought alanı..." />
            </div>
            <div class="editor-actions">
                <button id="sie-save" class="primary-button">${DOM.getText('save') || 'Kaydet'}</button>
                <button id="sie-cancel" class="secondary-button">${DOM.getText('cancel') || 'İptal'}</button>
            </div>
        `;
        document.body.appendChild(container);

        // Konumla (ekranın ortasına)
        const desiredWidth = 520;
        const SIDE_MARGIN = 25;
        const viewportW = window.innerWidth || document.documentElement.clientWidth;
        const finalWidth = Math.max(360, Math.min(desiredWidth, viewportW - SIDE_MARGIN * 2));
        let left = Math.round((viewportW - finalWidth) / 2);
        const top = Math.round((window.innerHeight - 200) / 2);

        container.style.left = `${left}px`;
        container.style.top = `${top}px`;
        container.style.width = `${finalWidth}px`;

        // Eventler
        const saveBtn = container.querySelector('#sie-save');
        const cancelBtn = container.querySelector('#sie-cancel');
        saveBtn?.addEventListener('click', () => {
            try {
                const uiTextInput = container.querySelector('#sie-ui-text');
                const actionInput = container.querySelector('#sie-action');
                const thoughtInput = container.querySelector('#sie-thought');
                const newUiText = String(uiTextInput && uiTextInput.value || '').trim();
                const newAction = String(actionInput && actionInput.value || '').trim();
                const newThought = String(thoughtInput && thoughtInput.value || '').trim();
                
                if (newUiText || newAction || newThought) {
                    const newStep = {
                        step: insertIndex + 1, // Temporary, will be renumbered by backend
                        action: newAction,
                        thought: newThought,
                        ui_text: newUiText || newAction // UI text öncelikli, yoksa action kullan
                    };
                    
                    // Backend'e gönder
                    try { postMessage('insertPlannerStep', { index: insertIndex, direction, step: newStep }); } catch {}
                }
                closeStepInlineEditor();
            } catch (e) { console.warn('New step save error', e); }
        });
        cancelBtn?.addEventListener('click', closeStepInlineEditor);

        // İlk input'a focus
        setTimeout(() => {
            try { container.querySelector('#sie-ui-text')?.focus?.(); } catch {}
            // Escape ile kapanma
            const escHandler = (e) => { if (e.key === 'Escape') closeStepInlineEditor(); };
            window.addEventListener('keydown', escHandler, { once: true });
            // Resize ile kapanma
            window.addEventListener('resize', closeStepInlineEditor, { once: true });
        }, 0);

        activeInlineEditorEl = container;
        activeInlineEditorIndex = insertIndex;
    } catch (e) { console.warn('openNewStepEditor error', e); }
}

function escapeHtmlAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function inlineEscClose(ev) {
    if (ev.key === 'Escape') closeStepInlineEditor();
}

function outsideInlineClick(ev) {
    try {
        if (activeInlineEditorEl && !activeInlineEditorEl.contains(ev.target)) {
            closeStepInlineEditor();
        }
    } catch {}
}

function closeStepInlineEditor() {
    try {
        if (activeInlineEditorEl && activeInlineEditorEl.parentNode) {
            activeInlineEditorEl.parentNode.removeChild(activeInlineEditorEl);
        }
        activeInlineEditorEl = null;
        activeInlineEditorIndex = -1;
    } catch {}
}

// Gizle fonksiyonu
export function hidePlannerPanel() {
    const panel = document.getElementById('planner-panel');
    if (panel) panel.classList.add('hidden');
}

// Agent ve Index state değişimlerinde paneli yönetmek için yardımcı
export function refreshPlannerPanelVisibility() {
    const panel = document.getElementById('planner-panel');
    const content = document.getElementById('planner-panel-content');
    const list = document.getElementById('planner-steps-list');
    if (!panel || !content || !list) return;
    const { isAgentModeActive, isIndexingEnabled } = getState();
    if (isAgentModeActive && isIndexingEnabled) {
        // Eğer son plan objesi varsa onunla (butonlarla) yeniden oluştur, yoksa sadece metinleri göster
        if (lastPlannerPlan && Array.isArray(lastPlannerPlan.steps) && lastPlannerPlan.steps.length > 0) {
            showPlannerPanelWithPlan(lastPlannerPlan);
        } else if (Array.isArray(lastPlannerStepsCache) && lastPlannerStepsCache.length > 0) {
            list.innerHTML = '';
            for (const s of lastPlannerStepsCache) {
                const li = document.createElement('li');
                li.textContent = typeof s === 'string' ? s : (s?.text || '');
                list.appendChild(li);
            }
            panel.classList.remove('hidden');
            content.classList.add('hidden');
            panel.classList.add('collapsed');
            panel.classList.remove('expanded');
            panel.classList.remove('completed');
        }
        try { autoResizeInput(); } catch (e) {}
    } else {
        panel.classList.add('hidden');
    }
}

// Panel tamamlandı (ince çizgi) durumunu ayarlayan yardımcı
export function setPlannerPanelCompleted(done) {
    try {
        const panel = document.getElementById('planner-panel');
        if (!panel) return;
        if (done) {
            panel.classList.add('completed');
        } else {
            panel.classList.remove('completed');
        }
    } catch (e) {}
}

// YENİ: Plan zamanlayıcısını dışarıya verir
export function getPlanTimerStartMs() {
    return planTimerStartMs;
}

// --- Step execution placeholder helpers ---
let inlineSummaryBuffer = '';
let inlineSummaryRenderTimer = null;
const INLINE_SUMMARY_RENDER_DEBOUNCE_MS = 120; // render stream at most ~8-9 times/sec
// Inline typing stream state (for summary) - gradual typing into raw markdown container
let inlineCharBuffer = '';
let inlineIsTyping = false;
let inlineLastRenderTime = 0;
let inlineTargetCharsPerSecond = 200;
let inlineStreamHasEnded = false;
let inlineStreamingBuffer = '';
let inlineGenerationId = 0;
export function showStepExecutionPlaceholder(label) {
    if (!document.getElementById('ai-streaming-placeholder')) {
        addAiResponsePlaceholder();
    }
    setPlannerStreaming(true);
    setShimmerActive(true);
    const el = document.getElementById('ai-streaming-placeholder');
    try { summaryTargetEl = el; } catch (e) {}
    const contentElement = el?.querySelector('.message-content');
    if (contentElement) {
        // Her adım için ayrı blok satır kullan (display: block)
        const line = document.createElement('div');
        line.className = 'step-line running-line';
        line.textContent = String(label || '');
        contentElement.appendChild(line);
    }
}

export function finishStepExecutionPlaceholder(label, elapsedMs, error) {
    const el = document.getElementById('ai-streaming-placeholder');
    if (!el) return;
    setPlannerStreaming(false);
    setShimmerActive(false);
    const contentElement = el.querySelector('.message-content');
    if (!contentElement) return;
    const seconds = Math.max(0, Number(elapsedMs || 0) / 1000).toFixed(2);
    const finalText = `${label} (${seconds}s)` + (error ? ` — Hata: ${error}` : '');
    const running = contentElement.querySelector('.running-line');
    const soft = document.createElement('div');
    soft.className = 'step-line planned-soft';
    soft.textContent = finalText;
    if (running && running.parentNode === contentElement) {
        contentElement.replaceChild(soft, running);
    } else {
        contentElement.appendChild(soft);
    }
}

// Panelde bir adımı tamamlanmış olarak işaretle ve butonlarını devre dışı bırak
export function markPlannerStepCompleted(index) {
    try {
        completedPlannerSteps.add(index);
        const list = document.getElementById('planner-steps-list');
        // Insert butonları da var olduğu için gerçek step li'yi bul
        const allItems = list?.children || [];
        let stepItemIndex = 0;
        for (let i = 0; i < allItems.length; i++) {
            const item = allItems[i];
            if (item.classList.contains('planner-step-item')) {
                if (stepItemIndex === index) {
                    item.classList.add('completed');
                    const buttons = item.querySelectorAll('button');
                    buttons.forEach(b => { try { b.disabled = true; } catch {} });
                    break;
                }
                stepItemIndex++;
            }
        }
        
        // İlgili insert butonlarını da kilitle
        disableInsertButtonsForCompletedStep(index);
        
        // Eğer tüm adımlar tamamlandıysa paneli completed yap (ince çizgi)
        const stepsTotal = Array.isArray(lastPlannerPlan?.steps) ? lastPlannerPlan.steps.length : 0;
        if (stepsTotal > 0 && completedPlannerSteps.size >= stepsTotal) {
            try { setPlannerPanelCompleted(true); } catch (e) {}
        }
    } catch (e) {}
}

// Completed adım için insert butonlarını kilitle
function disableInsertButtonsForCompletedStep(completedIndex) {
    try {
        const list = document.getElementById('planner-steps-list');
        const allItems = list?.children || [];
        
        for (let i = 0; i < allItems.length; i++) {
            const item = allItems[i];
            if (item.classList.contains('planner-insert-item')) {
                const button = item.querySelector('.step-insert-button');
                if (button && !button.classList.contains('disabled')) {
                    // Bu insert butonunun hangi adımlarla ilgili olduğunu belirle
                    const insertIndex = getInsertButtonIndex(i, allItems);
                    
                    // Eğer bu insert butonu completed step ile ilgiliyse kilitle
                    if (insertIndex.beforeStep === completedIndex || 
                        insertIndex.afterStep === completedIndex) {
                        button.disabled = true;
                        button.classList.add('disabled');
                        // Click handler'ı kaldır
                        button.replaceWith(button.cloneNode(true));
                    }
                }
            }
        }
    } catch (e) { console.warn('disableInsertButtonsForCompletedStep error', e); }
}

// Insert butonunun hangi adımlar arasında olduğunu belirle
function getInsertButtonIndex(itemIndex, allItems) {
    let stepsBefore = 0;
    
    for (let i = 0; i < itemIndex; i++) {
        if (allItems[i].classList.contains('planner-step-item')) {
            stepsBefore++;
        }
    }
    
    return {
        beforeStep: stepsBefore - 1, // Önceki adım index (-1 ise başta)
        afterStep: stepsBefore       // Sonraki adım index
    };
}

// Adım insertion'dan sonra completed step tracking'i güncelle
export function updateCompletedStepsAfterInsertion(insertedIndex) {
    try {
        const newCompletedSteps = new Set();
        
        for (const oldIndex of completedPlannerSteps) {
            if (oldIndex >= insertedIndex) {
                // Bu adım kaydırıldı, yeni pozisyonunu kaydet
                newCompletedSteps.add(oldIndex + 1);
            } else {
                // Bu adım etkilenmedi
                newCompletedSteps.add(oldIndex);
            }
        }
        
        completedPlannerSteps = newCompletedSteps;
    } catch (e) { console.warn('updateCompletedStepsAfterInsertion error', e); }
}

// Adım deletion'dan sonra completed step tracking'i güncelle
export function updateCompletedStepsAfterDeletion(deletedIndex) {
    try {
        const newCompletedSteps = new Set();
        
        for (const oldIndex of completedPlannerSteps) {
            if (oldIndex === deletedIndex) {
                // Silinen adım, settten çıkar
                continue;
            } else if (oldIndex > deletedIndex) {
                // Bu adım kaydırıldı, yeni pozisyonunu kaydet
                newCompletedSteps.add(oldIndex - 1);
            } else {
                // Bu adım etkilenmedi
                newCompletedSteps.add(oldIndex);
            }
        }
        
        completedPlannerSteps = newCompletedSteps;
    } catch (e) { console.warn('updateCompletedStepsAfterDeletion error', e); }
}

// --- Inline summary (same placeholder, no pulse) ---
export function startInlineSummary() {
    // Yeni özet akışı başlıyor: tüm inline state'i sıfırla ve önceki döngüyü iptal et
    inlineGenerationId++;
    inlineIsTyping = false;
    inlineLastRenderTime = 0;
    inlineSummaryBuffer = '';
    inlineCharBuffer = '';
    inlineStreamingBuffer = '';
    inlineStreamHasEnded = false;

    // Özet için HER ZAMAN yeni bir mesaj balonu oluştur
    const messageEl = createMessageElement('assistant', '');
    const target = messageEl?.querySelector('.message-content');
    if (!target) return;
    const hr = document.createElement('div');
    hr.className = 'step-line';
    hr.textContent = '';
    target.appendChild(hr);
    const container = document.createElement('div');
    try { container.id = 'inline-summary-' + String(Date.now()) + '-' + String(Math.random()).slice(2); } catch (e) {}
    target.appendChild(container);
    try { summaryContainerEl = container; } catch (e) {}
    try { summaryMessageEl = messageEl; } catch (e) {}
    // ACT modunda özet başladığında plan panelini 3 saniye içinde kapat
    try {
        const { isAgentActMode } = require('../core/state.js').getState();
        if (isAgentActMode) {
            setTimeout(() => { try { hidePlannerPanel(); } catch (e) {} }, 3000);
        }
    } catch (e) {}
}

export function appendInlineSummary(chunk) {
    const container = (summaryContainerEl && summaryContainerEl.isConnected) ? summaryContainerEl : null;
    if (!container) return;
    // For smoother typing effect, feed into inlineCharBuffer and use typing queue
    inlineSummaryBuffer += String(chunk || '');
    inlineCharBuffer += String(chunk || '');
    inlineStreamHasEnded = false;
    if (!inlineIsTyping) processInlineTypingQueue();
}

function processInlineTypingQueue() {
    if (inlineIsTyping) return;
    inlineIsTyping = true;
    inlineLastRenderTime = 0;

    const container = (summaryContainerEl && summaryContainerEl.isConnected) ? summaryContainerEl : null;
    if (!container) { inlineIsTyping = false; return; }
    const myGenId = inlineGenerationId;

    function step(ts) {
        try {
            if (myGenId !== inlineGenerationId) { inlineIsTyping = false; return; }
            if (inlineLastRenderTime === 0) inlineLastRenderTime = ts;
            const elapsed = ts - inlineLastRenderTime;
            let allow = Math.max(1, Math.floor(inlineTargetCharsPerSecond * (elapsed / 1000)));
            if (allow > inlineCharBuffer.length) allow = inlineCharBuffer.length;
            if (allow > 0) {
                const toAdd = inlineCharBuffer.slice(0, allow);
                inlineCharBuffer = inlineCharBuffer.slice(allow);
                // append to streaming buffer
                inlineStreamingBuffer += toAdd;
                // render markdown incrementally
                try {
                    container.innerHTML = marked.parse(inlineStreamingBuffer);
                    container.querySelectorAll('pre code').forEach(block => { try { hljs.highlightElement(block); } catch(e){} });
                } catch (e) {
                    // fallback: append plain text
                    container.textContent = (container.textContent || '') + toAdd;
                }
                inlineLastRenderTime = ts;
            }
            if (myGenId !== inlineGenerationId) { inlineIsTyping = false; return; }
            if (inlineCharBuffer.length > 0 || !inlineStreamHasEnded) {
                requestAnimationFrame(step);
            } else {
                inlineIsTyping = false;
            }
        } catch (e) { inlineIsTyping = false; }
    }

    requestAnimationFrame(step);
}

export function finishInlineSummary() {
    inlineStreamHasEnded = true;
    // ensure any remaining buffered chars are processed by typing queue
    if (!inlineIsTyping) {
        try {
            const container = (summaryContainerEl && summaryContainerEl.isConnected) ? summaryContainerEl : null;
            if (container) {
                container.innerHTML = marked.parse(inlineSummaryBuffer || container.textContent || '');
                container.querySelectorAll('pre code').forEach(block => { try { hljs.highlightElement(block); } catch(e){} });
                try { addCodeBlockActions(summaryMessageEl || container); } catch (e) {}
            }
        } catch (e) {}
    }
    // Finalize the placeholder to enable new messages
    try {
        const ph = document.getElementById('ai-streaming-placeholder');
        if (ph) {
            ph.classList.remove('shimmer-active');
            const avatar = ph.querySelector('.avatar-wrapper');
            if (avatar) avatar.classList.remove('loading');
        }
    } catch (e) {}
    runFinalizationLogic();
    try { summaryTargetEl = null; } catch (e) {}
    try { summaryContainerEl = null; } catch (e) {}
    try { summaryMessageEl = null; } catch (e) {}
}

export function appendResponseChunk(chunk) {
    if (isStreamingCancelled) return;
    charBuffer += chunk;
    updateRate(chunk.length);
    processTypingQueue();
}

export function finalizeStreamedResponse() {
    if (isStreamingCancelled) return;
    streamHasEnded = true;
    if (!isTypingAnimationRunning && charBuffer.length === 0) {
        runFinalizationLogic();
    }
    updateApplyButtonVisibility(document.getElementById('ai-streaming-placeholder')?.querySelector('.apply-button')); // Buton görünürlüğünü güncelle
}

export function showAiResponse(responseText) {
    setAiResponding(true);
    const content = marked.parse(responseText);
    const messageElement = createMessageElement('assistant', content);
    messageElement.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });
    addCodeBlockActions(messageElement);
    updateApplyButtonVisibility(messageElement.querySelector('.apply-button')); // Buton görünürlüğünü güncelle
    setAiResponding(false);
    recalculateTotalAndUpdateUI();
    focusInput();
    postMessage('requestContextSize');
}

export function clear(playVideo = true) {
    DOM.chatContainer.innerHTML = '';
    DOM.chatContainer.classList.add('hidden');
    DOM.welcomeContainer.classList.remove('hidden');
    shouldAutoScroll = true;
    // Planner UI'ı da sıfırla
    resetPlannerUI();

    // Remove any placeholder and inline summary state so new chat starts clean
    try {
        const ph = document.getElementById('ai-streaming-placeholder');
        if (ph && ph.parentNode) ph.parentNode.removeChild(ph);
    } catch (e) {}
    try { inlineSummaryBuffer = ''; } catch(e){}
    try { inlineCharBuffer = ''; } catch(e){}
    try { inlineStreamingBuffer = ''; } catch(e){}
    try { inlineIsTyping = false; } catch(e){}
    try { inlineStreamHasEnded = false; } catch(e){}
    try { const ins = document.getElementById('inline-summary'); if (ins && ins.parentNode) ins.parentNode.removeChild(ins); } catch(e){}

    if (DOM.welcomeVideo) {
        if (playVideo) {
            DOM.welcomeVideo.currentTime = 0;
            DOM.welcomeVideo.play();
            DOM.welcomeVideo.classList.remove('video-hidden');
        } else {
            DOM.welcomeVideo.pause();
            DOM.welcomeVideo.classList.add('video-hidden');
        }
    }
    resetChatState();
    setPlaceholder();
    recalculateTotalAndUpdateUI();
}

export function load(messages) {
    clear(false);
    // Planner UI temiz kalsın
    resetPlannerUI();
    const conversationMessages = messages.filter(m => m.role !== 'system');
    if (conversationMessages.length > 0) {
        DOM.welcomeContainer.classList.add('hidden');
        DOM.chatContainer.classList.remove('hidden');
        let newConversationTokens = 0;
        conversationMessages.forEach(msg => {
            const raw = String(msg.content || '');
            // Basit: adım notlarını özel bir görünümle vurgula (persisted step notes)
            const isStepNote = /^Adım (başlıyor|tamamlandı|hatası)/.test(raw);
            const content = (msg.role === 'assistant')
                ? marked.parse(raw)
                : `<p>${raw}</p>`;
            const elem = createMessageElement(msg.role, content);
            if (isStepNote) {
                try { elem.classList.add('planner-steps-message'); } catch (e) {}
            }
            addCodeBlockActions(elem);
            // Token sayımı model usage ile güncellenecek
        });
        setContextSize(newConversationTokens, getState().filesTokens);
        lockConversation();

        DOM.chatContainer.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
    } else {
        setContextSize(0, getState().filesTokens);
    }
    recalculateTotalAndUpdateUI();
    focusInput();
}

// YENİ: Değişikliği Uygula butonunun görünürlüğünü güncelleyen fonksiyon
function updateApplyButtonVisibility(button) {
    if (!button) return; // Kod bloğu olmayan mesajlarda buton yoktur
    const { isAgentModeActive, isAgentSelectionActive } = getState();
    button.style.display = (isAgentModeActive && isAgentSelectionActive) ? '' : 'none';
}