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
    const toggle = document.getElementById('agent-mode-toggle');

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
        // Eğer CSS değişkeni ile SVG ataması yapılmamışsa, inline SVG öğesini kullan.
        // Kullanıcı özel SVG yolunu atamak isterse extension tarafı veya başka JS
        // `modeButton.style.setProperty('--mode-arrow-svg', 'url("data:image/svg+xml;utf8,<svg ...>")')`
        // şeklinde atayabilir.
        try {
            // Eğer mode-button içinde .mode-arrow yoksa ekleyelim (fallback inline SVG)
            if (!modeButton.querySelector('.mode-arrow')) {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', '14');
                svg.setAttribute('height', '14');
                svg.setAttribute('viewBox', '0 0 24 24');
                svg.classList.add('mode-arrow');
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', 'M6 9l6 6 6-6');
                path.setAttribute('stroke', 'currentColor');
                path.setAttribute('stroke-width', '2');
                path.setAttribute('stroke-linecap', 'round');
                path.setAttribute('stroke-linejoin', 'round');
                path.setAttribute('fill', 'none');
                svg.appendChild(path);
                modeButton.appendChild(svg);
            }
        } catch (e) {}
        // Buton artık tek bir baloncuk: tıklayınca menü açılır. Kısa tıklama ile anında mod değiştirme yok.
        modeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!menu) return;
            const isHidden = menu.classList.toggle('hidden');
            menu.setAttribute('aria-hidden', isHidden ? 'true' : 'false');
            modeButton.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
        });

        // Menü dışına tıklayınca kapat
        document.addEventListener('click', (e) => {
            if (!menu) return;
            if (!menu.contains(e.target) && !modeButton.contains(e.target)) {
                if (!menu.classList.contains('hidden')) {
                    menu.classList.add('hidden');
                    menu.setAttribute('aria-hidden', 'true');
                    modeButton.setAttribute('aria-expanded', 'false');
                }
            }
        });

        // Menü seçimleri
        if (menu) {
            menu.querySelectorAll('.mode-menu-item').forEach(item => {
                item.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const mode = item.getAttribute('data-mode');
                    const isAgent = mode === 'agent';
                    // update UI label
                    const label = modeButton.querySelector('.mode-label');
                    if (label) label.textContent = isAgent ? 'Agent' : 'Chat';
                    // notify VS Code
                    VsCode.postMessage('agentModeToggled', { isActive: isAgent, language: undefined });
                    // close menu
                    menu.classList.add('hidden');
                    menu.setAttribute('aria-hidden', 'true');
                    modeButton.setAttribute('aria-expanded', 'false');
                });
            });
        }
    }
}