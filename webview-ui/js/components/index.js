/* ==========================================================================
   BİLEŞEN BAŞLATICISI (Component Initializer) - GÜNCELLENDİ
   ========================================================================== */

import * as ChatView from './chat_view.js';
import * as FileTags from './file_tags.js';
import * as Header from './header.js';
import * as HistoryPanel from './history_panel.js';
import * as InputArea from './InputArea.js';
import * as SettingsModal from './settings_modal.js';
import * as AgentView from './agent_view.js'; // YENİ: AgentView import edildi

export function initComponents() {
    ChatView.init();
    FileTags.init();
    Header.init();
    HistoryPanel.init();
    InputArea.init();
    SettingsModal.init();
    AgentView.init(); // YENİ: AgentView başlatıldı
}