/* ==========================================================================
   HISTORY PANEL BİLEŞENİ (ŞABLON KULLANIMLI)
   ========================================================================== */
   
import * as DOM from '../utils/dom.js';
import * as VsCode from '../services/vscode.js';
import { getState } from '../core/state.js';

// --- Public Fonksiyonlar ---

export function init() {
    DOM.historyButton.addEventListener('click', () => {
        if (getState().isUiBlocked) return;
        const isHidden = DOM.historyPanel.classList.toggle('hidden');
        if (!isHidden) {
            VsCode.postMessage('requestHistory');
        }
    });
}

export function populate(history) {
    DOM.historyListContainer.innerHTML = '';
    if (!history || history.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'history-empty-message';
        emptyMessage.textContent = DOM.getText('historyEmpty');
        DOM.historyListContainer.appendChild(emptyMessage);
        return;
    }
    
    const cardTemplate = document.getElementById('history-card-template');

    history.forEach(conv => {
        const cardClone = cardTemplate.content.cloneNode(true);
        const card = cardClone.querySelector('.history-card');
        card.title = conv.title;
        card.dataset.id = conv.id;

        cardClone.querySelector('.history-title').textContent = conv.title;

        const deleteButton = cardClone.querySelector('.delete-chat-button');
        deleteButton.addEventListener('click', (event) => {
            event.stopPropagation();
            VsCode.postMessage('deleteChat', { conversationId: conv.id });
        });
        
        card.addEventListener('click', () => {
            VsCode.postMessage('switchChat', { conversationId: conv.id });
            DOM.historyPanel.classList.add('hidden');
        });

        DOM.historyListContainer.appendChild(cardClone);
    });
}