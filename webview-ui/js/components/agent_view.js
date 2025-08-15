/* ========================================================================== 
   AGENT VIEW BİLEŞENİ
   - Seçimi kaldır butonu olayını yönetir
   ========================================================================== */

import * as VsCode from '../services/vscode.js';
import { setAgentBarExpanded } from '../core/state.js';

export function init() {
    const collapsedBtn = document.getElementById('agent-status-collapsed');
    const agentStatusBar = document.getElementById('agent-status-bar');
    const agentStatusHide = document.getElementById('agent-status-hide');
    const modeButton = document.getElementById('agent-mode-button');
    const menu = document.getElementById('agent-mode-menu');

    // 1) Başlangıçta sadece ikon butonu görünür kalır (collapsed)
    if (collapsedBtn && agentStatusBar) {
        collapsedBtn.addEventListener('click', () => {
            // Bağlamı göster
            agentStatusBar.classList.remove('hidden');
            collapsedBtn.classList.add('hidden');
            setAgentBarExpanded(true);
            VsCode.postMessage('toggleAgentFileSuppressed', { suppressed: false });
            VsCode.postMessage('agentBarExpandedChanged', { isExpanded: true });
            // Dosya adı metni server tarafından update ediliyor; burada ek işlem yok
        });
    }

    // 2) X'e tıklanınca tekrar sadece ikon butonu kalsın
    if (agentStatusHide && collapsedBtn && agentStatusBar) {
        agentStatusHide.addEventListener('click', (e) => {
            e.stopPropagation();
            agentStatusBar.classList.add('hidden');
            collapsedBtn.classList.remove('hidden');
            setAgentBarExpanded(false);
            VsCode.postMessage('toggleAgentFileSuppressed', { suppressed: true });
            VsCode.postMessage('agentBarExpandedChanged', { isExpanded: false });
        });
    }
        if (modeButton) {
        // Butona tıklayınca direkt mod değiştir
        modeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Mevcut modu kontrol et ve tersini yap
            const currentText = modeButton.textContent;
            const isCurrentlyAgent = currentText === 'Agent';
            const newIsAgent = !isCurrentlyAgent;
            
            // Buton metnini güncelle
            modeButton.textContent = newIsAgent ? 'Agent' : 'Chat';
            
            // VS Code'a mod değişikliğini bildir
            VsCode.postMessage('agentModeToggled', { isActive: newIsAgent, language: undefined });
            
            // UI'ı güncelle
            if (collapsedBtn && agentStatusBar) {
                if (newIsAgent) {
                    collapsedBtn.classList.remove('hidden');
                    agentStatusBar.classList.add('hidden');
                } else {
                    collapsedBtn.classList.add('hidden');
                    agentStatusBar.classList.add('hidden');
                }
            }
        });
    }
}