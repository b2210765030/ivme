/* ==========================================================================
   CHAT VIEW BİLEŞENİ ("DEĞİŞİKLİKLERİ UYGULA" BUTONU EKLENDİ)
   ========================================================================== */

import * as DOM from '../utils/dom.js';
import { getState, setAiResponding, incrementConversationSize, setContextSize, resetChatState, lockConversation } from '../core/state.js';
import { postMessage } from '../services/vscode.js';
import { recalculateTotalAndUpdateUI, setPlaceholder, focus as focusInput } from './InputArea.js';
import { countTokensGPT } from '../utils/tokenizer.js';

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

let shouldAutoScroll = true;

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
            contentElement.innerHTML = marked.parse(streamingBuffer);
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

// --- Public Fonksiyonlar ---

export function init() {}

export function addUserMessage(text) {
    const p = document.createElement('p');
    p.textContent = text;
    createMessageElement('user', p.outerHTML);
    
    // Token sayısını hesapla ve ekle
    const tokenCount = countTokensGPT(text);
    incrementConversationSize(tokenCount);
    
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

    const messageElement = createMessageElement('assistant', DOM.getText('thinking'));
    messageElement.id = 'ai-streaming-placeholder';
    const avatarWrapper = messageElement.querySelector('.avatar-wrapper');
    avatarWrapper.classList.add('loading');
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
    const conversationMessages = messages.filter(m => m.role !== 'system');
    if (conversationMessages.length > 0) {
        DOM.welcomeContainer.classList.add('hidden');
        DOM.chatContainer.classList.remove('hidden');
        let newConversationTokens = 0;
        conversationMessages.forEach(msg => {
            const content = (msg.role === 'assistant') ? marked.parse(msg.content) : `<p>${msg.content}</p>`;
            const elem = createMessageElement(msg.role, content);
            addCodeBlockActions(elem);
            // Token sayısını hesapla
            newConversationTokens += countTokensGPT(msg.content);
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
    const { isAgentModeActive, isAgentSelectionActive } = getState();
    if (isAgentModeActive && isAgentSelectionActive) {
        button.style.display = ''; // Göster
    } else {
        button.style.display = 'none'; // Gizle
    }
}