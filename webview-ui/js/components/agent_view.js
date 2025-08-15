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
        });
    }
        if (modeButton && menu) {
        // Butona tıklayınca menüyü toggle et
        modeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            // Konteyner relative olduğundan basitçe butonun altına koy
            menu.style.left = `${modeButton.offsetLeft}px`;
            menu.style.top = `${modeButton.offsetTop + modeButton.offsetHeight + 4}px`;
            menu.classList.toggle('hidden');
        });

        // Menü içi seçim
        menu.querySelectorAll('.agent-mode-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const mode = item.getAttribute('data-mode');
                const isAgent = mode === 'agent';
                modeButton.textContent = isAgent ? 'Agent' : 'Chat';
                VsCode.postMessage('agentModeToggled', { isActive: isAgent, language: undefined });
                    menu.classList.add('hidden');
                    // Mod açılırsa ikon butonu göster, bar gizli kalsın (kullanıcı tıklayana kadar)
                    if (collapsedBtn && agentStatusBar) {
                        if (isAgent) {
                            collapsedBtn.classList.remove('hidden');
                            agentStatusBar.classList.add('hidden');
                        } else {
                            collapsedBtn.classList.add('hidden');
                            agentStatusBar.classList.add('hidden');
                        }
                    }
            });
        });

        // Dışarı tıklayınca kapat
        document.addEventListener('click', () => menu.classList.add('hidden'));
    }
}