/* ========================================================================== 
   AGENT VIEW BİLEŞENİ
   - Seçimi kaldır butonu olayını yönetir
   ========================================================================== */

import * as VsCode from '../services/vscode.js';
import { setAgentBarExpanded, setAgentActMode, getState, updatePlanActToggleVisibility } from '../core/state.js';

export function init() {
    const collapsedBtn = document.getElementById('agent-status-collapsed');
    const agentStatusBar = document.getElementById('agent-status-bar');
    const agentStatusHide = document.getElementById('agent-status-hide');
    const modeButton = document.getElementById('agent-mode-button');
    const menu = document.getElementById('agent-mode-menu');
    const toggle = document.getElementById('agent-mode-toggle');
    const planActToggle = document.getElementById('plan-act-toggle');
    const planActSwitch = document.getElementById('plan-act-switch');

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
                    // Menüden seçim yapıldığında Plan/Act görünürlüğünü de güncelle
                    try { updatePlanActToggleVisibility(); } catch {}
                });
            });
        }
    }

    // Agent mod değişince Plan/Act toggle etkinlik durumu güncellensin
    try {
        const observer = new MutationObserver(() => {
            try {
                const { isAgentModeActive, isAgentActMode } = getState();
                if (planActToggle && planActSwitch) {
                    planActToggle.classList.toggle('disabled', !isAgentModeActive);
                    planActSwitch.disabled = !isAgentModeActive;
                    planActToggle.classList.toggle('checked', !!isAgentActMode);
                    planActToggle.setAttribute('aria-checked', isAgentActMode ? 'true' : 'false');
                    planActSwitch.checked = !!isAgentActMode;
                }
                updatePlanActToggleVisibility();
            } catch {}
        });
        const agentBtn = document.getElementById('agent-mode-button');
        if (agentBtn) observer.observe(agentBtn, { attributes: true, attributeFilter: ['class'] });
    } catch {}

    // Toggle click/change -> state'e yaz ve persist et
    if (planActSwitch) {
        planActSwitch.addEventListener('change', () => {
            const prevAct = !!getState().isAgentActMode;
            const nextAct = !!planActSwitch.checked;
            setAgentActMode(nextAct);
            // Plan -> Act geçişinde: mevcut plandaki kalan adımları otomatik uygula
            if (!prevAct && nextAct) {
                try { VsCode.postMessage('executePlannerAll'); } catch {}
            }
        });
    }

    // İlk yüklemede görünürlüğü ayarla
    try { updatePlanActToggleVisibility(); } catch {}
}