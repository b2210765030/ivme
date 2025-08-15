/* ==========================================================================
   FILE TAGS BİLEŞENİ
   Analiz için eklenen dosya etiketlerini gösterir ve yönetir.
   ========================================================================== */

import * as DOM from '../utils/dom.js';
import * as VsCode from '../services/vscode.js';
import { getState, resetFilesSize } from '../core/state.js';
import { recalculateTotalAndUpdateUI } from './InputArea.js';

// --- Public Fonksiyonlar ---

export function init() {
    // Bu bileşen için başlangıçta çalışacak bir kod varsa buraya eklenebilir.
}

export function display(fileNames) {
    DOM.fileContextArea.innerHTML = '';
    fileNames.forEach(fileName => {
        const tagElement = document.createElement('div');
        tagElement.className = 'file-tag';
        const nameSpan = document.createElement('span');
        nameSpan.textContent = fileName;
        tagElement.appendChild(nameSpan);

        const removeButton = document.createElement('button');
        removeButton.className = 'remove-file-button';
        removeButton.title = 'Dosyayı Kaldır';
        removeButton.dataset.fileName = fileName;
        removeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"></path></svg>`;
        
        removeButton.addEventListener('click', (event) => {
            if (getState().isUiBlocked) return;
            const fileToRemove = event.currentTarget.dataset.fileName;
            VsCode.postMessage('removeFileContext', { fileName: fileToRemove });
        });
        
        tagElement.appendChild(removeButton);
        DOM.fileContextArea.appendChild(tagElement);
    });
    VsCode.postMessage('requestContextSize');
    recalculateTotalAndUpdateUI();
}

export function clear() {
    DOM.fileContextArea.innerHTML = '';
    resetFilesSize();
    recalculateTotalAndUpdateUI();
}