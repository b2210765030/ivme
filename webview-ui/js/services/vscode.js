/* ==========================================================================
   VS CODE İLETİŞİM MODÜLÜ
   WebView ile eklenti arasındaki `postMessage` iletişimini yönetir.
   ========================================================================== */

import { vscode } from '../utils/dom.js';

/**
 * VS Code eklentisine belirli bir türde mesaj ve veri gönderir.
 * @param {string} type Mesajın türü (örn: 'askAI', 'saveSettings').
 * @param {any} [payload] Gönderilecek veri.
 */
export function postMessage(type, payload) {
    vscode.postMessage({ type, payload });
}

/**
 * VS Code eklentisinden gelen mesajları dinler ve bir işleyici fonksiyonu çalıştırır.
 * @param {(message: {type: string, payload: any, value?: any, fileName?: string}) => void} handler Gelen mesajı işleyecek fonksiyon.
 */
export function onMessage(handler) {
    window.addEventListener('message', event => {
        handler(event.data);
    });
}