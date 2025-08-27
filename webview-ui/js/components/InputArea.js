/* ==========================================================================
   INPUT AREA BİLEŞENİ (GÜNCELLENMİŞ)
   ========================================================================== */

import * as DOM from '../utils/dom.js';
import * as VsCode from '../services/vscode.js';
import { getState, setAiResponding } from '../core/state.js';
import { addUserMessage, stopStreaming, addAiResponsePlaceholder, setShimmerActive, setPlannerStreaming, replaceStreamingPlaceholderHeader } from './chat_view.js';
// Tokenizer kaldırıldı; kullanım modeli vLLM usage ile güncelleniyor

function handleSendMessage() {
    if (getState().isUiBlocked) return;
    const text = DOM.input.value;
    if (text.trim() === '') return;

    addUserMessage(text);
    addAiResponsePlaceholder();
    try {
        const { isAgentModeActive, isIndexingEnabled, isAgentActMode } = getState();
        if (isAgentModeActive && isIndexingEnabled) {
            setPlannerStreaming(true);
            setShimmerActive(true);
            const headerText = isAgentActMode ? (DOM.getText('thinking') || 'İvme düşünüyor...') : (DOM.getText('planning') || 'İvme planlıyor...');
            replaceStreamingPlaceholderHeader(headerText);
        }
    } catch (e) {}
    DOM.input.value = '';
    
    autoResize();
    recalculateTotalAndUpdateUI();

    VsCode.postMessage('askAI', text);
    setAiResponding(true);
}

function handleButtonClick() {
    if (getState().isAiResponding) {
        stopStreaming();
    } else {
        handleSendMessage();
    }
}

export function init() {
    DOM.sendButton.addEventListener('click', handleButtonClick);

    DOM.input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleButtonClick();
        }
    });

    DOM.input.addEventListener('input', () => {
        autoResize();
        recalculateTotalAndUpdateUI();
    });

    DOM.attachFileButton.addEventListener('click', () => {
        if (getState().isUiBlocked) return;
        VsCode.postMessage('requestFileUpload');
    });
    
    // İlk yüklemede tooltip'i ayarla
    setTimeout(() => {
        recalculateTotalAndUpdateUI();
        try { autoResize(); } catch (e) {}
    }, 100);

    // Viewport değişimlerinde konumları yeniden hesapla
    try {
        window.addEventListener('resize', () => { try { autoResize(); } catch (e) {} });
        window.addEventListener('orientationchange', () => { try { autoResize(); } catch (e) {} });
    } catch (e) {}
}

export function autoResize() {
    DOM.input.style.height = 'auto';
    DOM.input.style.height = `${DOM.input.scrollHeight}px`;
    // update CSS variable on container so chat content can reserve space
    try {
        const wrapper = document.querySelector('.main-content-wrapper');
        if (wrapper) {
            const rect = DOM.input.getBoundingClientRect();
            // distance from bottom of viewport to top of input wrapper
            const inputWrapper = document.querySelector('.input-wrapper');
            const inputBottom = inputWrapper ? (window.innerHeight - inputWrapper.getBoundingClientRect().top) : (rect.height + 40);
            // If input is fixed, inputWrapper.getBoundingClientRect().top gives distance
            // from viewport top, so inputBottom is the height from top to bottom of input area.
            // We want the safe bottom space (height of area from bottom of viewport up to top of input)
            const safeBottom = Math.ceil(window.innerHeight - (inputWrapper ? inputWrapper.getBoundingClientRect().top : (rect.top)) + 20);
            // Reserve space for chat container
            document.documentElement.style.setProperty('--input-safe-bottom', `${safeBottom}px`);
            // Planner panel should hug the top edge of input wrapper:
            // Compute distance from viewport bottom to input-wrapper top, then add a small gap
            const GAP = 17; // px gap between planner panel and input wrapper
            const plannerBottom = Math.max(0, Math.ceil(window.innerHeight - (inputWrapper ? inputWrapper.getBoundingClientRect().top : (rect.top)) + GAP));
            document.documentElement.style.setProperty('--planner-panel-bottom', `${plannerBottom}px`);
            // Also reserve space in chat for the visible planner panel height so messages aren't covered
            let panelExtra = 0;
            try {
                const panel = document.getElementById('planner-panel');
                if (panel && !panel.classList.contains('hidden')) {
                    const pRect = panel.getBoundingClientRect();
                    const visible = Math.max(0, Math.min(pRect.height, window.innerHeight));
                    // add a little spacing
                    panelExtra = Math.ceil(visible + 8);
                }
            } catch (e2) { panelExtra = 0; }
            const chatReserved = Math.max(safeBottom + panelExtra, safeBottom);
            document.documentElement.style.setProperty('--chat-bottom-reserved', `${chatReserved}px`);
        }
    } catch (e) {}
}

export function recalculateTotalAndUpdateUI() {
    const { conversationTokens, filesTokens, TOKEN_LIMIT } = getState();
    const promptText = DOM.input.value;
    
    // Mevcut konuşma ve dosya token sayılarını hesapla
    const conversationAndFilesTokens = conversationTokens + filesTokens;
    
    // Prompt için token sayısını hesapla
    const promptTokenUsage = { tokenCount: 0, isLimitExceeded: false, remainingTokens: TOKEN_LIMIT };
    
    // Toplam token sayısı
    let totalTokens = conversationAndFilesTokens + promptTokenUsage.tokenCount;
    
    // Limit aşılırsa metni kısalt
    if (totalTokens > TOKEN_LIMIT) {
        const overage = totalTokens - TOKEN_LIMIT;
        // Metni karakter bazında kısalt (yaklaşık hesaplama)
        const charsToRemove = Math.ceil(overage * 4); // 1 token ≈ 4 karakter
        DOM.input.value = DOM.input.value.slice(0, Math.max(0, DOM.input.value.length - charsToRemove));
        
        // Yeniden hesapla
        totalTokens = conversationAndFilesTokens + 0;
    }

    const isLimitExceeded = totalTokens >= TOKEN_LIMIT;
    
    // Yüzde hesapla
    const percentage = Math.min(100, Math.round((totalTokens / TOKEN_LIMIT) * 100));
    
    // Progress ring'i güncelle
    const circumference = 2 * Math.PI * 16; // r=16
    const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
    
    if (DOM.tokenProgressFill) {
        DOM.tokenProgressFill.style.strokeDasharray = strokeDasharray;
    }
    
    if (DOM.tokenPercentageText) {
        DOM.tokenPercentageText.textContent = `${percentage}%`;
    }
    
    // Limit aşıldığında renk değiştir
    if (DOM.tokenProgressRing) {
        DOM.tokenProgressRing.classList.remove('warning', 'limit-exceeded');
        if (isLimitExceeded) {
            DOM.tokenProgressRing.classList.add('limit-exceeded');
        } else if (percentage >= 80) {
            DOM.tokenProgressRing.classList.add('warning');
        }
    }
    DOM.characterCounter.classList.toggle('limit-exceeded', isLimitExceeded);
    
    // Tooltip ile detaylı bilgi göster
    const tooltipText = `${DOM.getText('tokenUsage')}\n${totalTokens} / ${TOKEN_LIMIT} ${DOM.getText('tokens')} (${percentage}%)\n\n${DOM.getText('tokenDetail')}\n${DOM.getText('conversation')} ${conversationTokens} ${DOM.getText('tokens')}\n${DOM.getText('files')} ${filesTokens} ${DOM.getText('tokens')}\n${DOM.getText('prompt')} ${promptTokenUsage.tokenCount} ${DOM.getText('tokens')}\n${DOM.getText('remaining')} ${Math.max(0, TOKEN_LIMIT - totalTokens)} ${DOM.getText('tokens')}`;
    if (DOM.tokenProgressRing) {
        DOM.tokenProgressRing.setAttribute('data-tooltip', tooltipText);
    }
    
    updateInputAndButtonState(isLimitExceeded);
}

export function updateInputAndButtonState(limitExceeded = false) {
    const { isAiResponding, isIndexing } = getState();
    const isUiBlocked = isAiResponding || isIndexing;

    DOM.input.disabled = isUiBlocked;

    // Header buttons and toggles (if present)
    try {
        const languageToggle = document.getElementById('language-toggle');
        if (languageToggle) languageToggle.disabled = isUiBlocked;
        if (DOM.newChatButton) DOM.newChatButton.disabled = isUiBlocked;
        if (DOM.historyButton) DOM.historyButton.disabled = isUiBlocked;
        if (DOM.settingsButton) DOM.settingsButton.disabled = isUiBlocked;
        if (DOM.feedbackButton) DOM.feedbackButton.disabled = isUiBlocked;
    } catch (e) {}

    const canSend = !isUiBlocked && DOM.input.value.trim().length > 0 && !limitExceeded;
    
    const sendIcon = DOM.sendButton.querySelector('.send-icon');
    const stopIcon = DOM.sendButton.querySelector('.stop-icon');

    if (isAiResponding) {
        DOM.sendButton.disabled = false;
        DOM.sendButton.title = DOM.getText('stop');
        sendIcon.classList.add('hidden');
        stopIcon.classList.remove('hidden');
    } else {
        DOM.sendButton.disabled = !canSend;
        DOM.sendButton.title = DOM.getText('send');
        sendIcon.classList.remove('hidden');
        stopIcon.classList.add('hidden');
    }

    DOM.sendButton.style.opacity = DOM.sendButton.disabled ? '0.5' : '1';
    DOM.sendButton.style.cursor = DOM.sendButton.disabled ? 'not-allowed' : 'pointer';

    const canAttach = !isUiBlocked;
    DOM.attachFileButton.disabled = !canAttach;
    DOM.attachFileButton.style.opacity = canAttach ? '1' : '0.5';
    DOM.attachFileButton.style.cursor = canAttach ? 'pointer' : 'not-allowed';

    setPlaceholder();
}

export function setPlaceholder(text = null) {
    const { isAiResponding } = getState();

    if (text !== null) {
        DOM.input.placeholder = text;
        return;
    }

    if (isAiResponding) {
        DOM.input.placeholder = DOM.getText('responding');
    } else {
        DOM.input.placeholder = DOM.getText('placeholder');
    }
}

export function focus() {
    DOM.input.focus();
}