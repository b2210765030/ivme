/* ==========================================================================
   INPUT AREA BİLEŞENİ (GÜNCELLENMİŞ)
   ========================================================================== */

import * as DOM from '../utils/dom.js';
import * as VsCode from '../services/vscode.js';
import { getState, setAiResponding } from '../core/state.js';
import { addUserMessage, stopStreaming, addAiResponsePlaceholder } from './chat_view.js';

function handleSendMessage() {
    if (getState().isUiBlocked) return;
    const text = DOM.input.value;
    if (text.trim() === '') return;

    addUserMessage(text);
    addAiResponsePlaceholder();
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
}

export function autoResize() {
    DOM.input.style.height = 'auto';
    DOM.input.style.height = `${DOM.input.scrollHeight}px`;
}

export function recalculateTotalAndUpdateUI() {
    const { conversationSize, filesSize, CONTEXT_LIMIT } = getState();
    const promptSize = DOM.input.value.length;
    let totalSize = conversationSize + filesSize + promptSize;

    if (totalSize > CONTEXT_LIMIT) {
        const overage = totalSize - CONTEXT_LIMIT;
        DOM.input.value = DOM.input.value.slice(0, DOM.input.value.length - overage);
        totalSize = conversationSize + filesSize + DOM.input.value.length;
    }

    const isLimitExceeded = totalSize >= CONTEXT_LIMIT;
    
    DOM.characterCounter.textContent = `${totalSize} / ${CONTEXT_LIMIT}`;
    DOM.characterCounter.classList.toggle('limit-exceeded', isLimitExceeded);
    
    updateInputAndButtonState(isLimitExceeded);
}

export function updateInputAndButtonState(limitExceeded = false) {
    const { isAiResponding, isIndexing } = getState();

    DOM.input.disabled = isAiResponding || isIndexing;

    const canSend = !isAiResponding && !isIndexing && DOM.input.value.trim().length > 0 && !limitExceeded;
    
    const sendIcon = DOM.sendButton.querySelector('.send-icon');
    const stopIcon = DOM.sendButton.querySelector('.stop-icon');

    if (isAiResponding) {
        DOM.sendButton.disabled = false;
        DOM.sendButton.title = 'Durdur';
        sendIcon.classList.add('hidden');
        stopIcon.classList.remove('hidden');
    } else {
        DOM.sendButton.disabled = !canSend;
        DOM.sendButton.title = 'Gönder';
        sendIcon.classList.remove('hidden');
        stopIcon.classList.add('hidden');
    }

    DOM.sendButton.style.opacity = DOM.sendButton.disabled ? '0.5' : '1';
    DOM.sendButton.style.cursor = DOM.sendButton.disabled ? 'not-allowed' : 'pointer';

    const canAttach = !isAiResponding && !isIndexing;
    DOM.attachFileButton.disabled = !canAttach;
    DOM.attachFileButton.style.opacity = canAttach ? '1' : '0.5';
    DOM.attachFileButton.style.cursor = canAttach ? 'pointer' : 'not-allowed';

    setPlaceholder();
}

export function setPlaceholder(text = null) {
    const { isAiResponding, currentLanguage, indexingMessage } = getState();
    const isEn = currentLanguage === 'en';

    if (text !== null) {
        DOM.input.placeholder = text;
        return;
    }

    // Öncelik: indeksleme mesajı (devam ederken veya tamamlandıktan sonra)
    if (indexingMessage && indexingMessage.trim().length > 0) {
        DOM.input.placeholder = indexingMessage;
        return;
    }

    if (isAiResponding) {
        DOM.input.placeholder = isEn
            ? 'İvme is responding, please wait...'
            : 'İvme yanıtlıyor, lütfen bekleyin...';
    } else {
        DOM.input.placeholder = isEn
            ? 'Ask a question or attach a file...'
            : 'Bir soru sorun veya dosya ekleyin...';
    }
}

export function focus() {
    DOM.input.focus();
}