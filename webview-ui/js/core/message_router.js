/* ==========================================================================
   MESAJ YÖNLENDİRİCİ (MESSAGE ROUTER) (AGENT SEÇİM ÖZELLİĞİ EKLENDİ)
   ========================================================================== */

import { onMessage } from '../services/vscode.js';
import * as ChatView from '../components/chat_view.js';
import * as FileTags from '../components/file_tags.js';
import * as HistoryPanel from '../components/history_panel.js';
import * as InputArea from '../components/InputArea.js';
import * as SettingsModal from '../components/settings_modal.js';
import { setContextSize, resetChatState, setAgentMode, setAgentSelectionStatus, clearAgentSelectionStatus, setIndexingActive, updateIndexerProgress, setIndexingEnabledState, getState } from './state.js';
import * as DOM from '../utils/dom.js';

function setRingProgress(percent) {
    const p = Math.max(0, Math.min(100, percent || 0));
    const cssValue = `${p}`; // 0..100
    if (DOM.indexerStartButton) {
        DOM.indexerStartButton.style.setProperty('--ring-progress', cssValue);
    }
    if (DOM.indexerCancelButton) {
        DOM.indexerCancelButton.style.setProperty('--ring-progress', cssValue);
    }
}

export function initMessageListener() {
    onMessage(message => {
        const data = message.payload ?? message.value;
        
        switch (message.type) {
            case 'indexingProgress':
                setIndexingActive(true);
                updateIndexerProgress(Math.round(data.percent || 0), data.message || '');
                setRingProgress(data.percent || 0);
                if (data.message) {
                    InputArea.setPlaceholder(data.message);
                }
                break;
            case 'indexingDone':
                const finalMsg = 'Bağlam indekslendi. Artık bu bağlam hakkında soru sorabilirsiniz.';
                updateIndexerProgress(100, finalMsg);
                setRingProgress(100);
                setIndexingActive(false, { preserveBar: true });
                setIndexingEnabledState(true); // İndeksleme tamamlandığında aktif et
                InputArea.setPlaceholder(finalMsg);
                break;
            case 'indexingToggled':
                // İndeksleme açık/kapalı durumu değişti
                setIndexingEnabledState(data.enabled);
                if (data.enabled) {
                    setIndexingActive(false, { preserveBar: true });
                    InputArea.setPlaceholder('İndeksleme aktif. Bağlam hakkında soru sorabilirsiniz.');
                } else {
                    setIndexingActive(false);
                    InputArea.setPlaceholder('İndeksleme kapalı. Sorgular için bağlam kullanılmayacak.');
                }
                break;
            case 'indexingStatus':
                // İndeksleme durumu bilgisi geldi
                setIndexingEnabledState(data.isEnabled);
                break;
            // --- Standart Mesajlar ---
            case 'addResponse':
                ChatView.showAiResponse(data);
                break;
            
            // --- Akış (Stream) Mesajları ---
            case 'addResponsePlaceholder':
                ChatView.addAiResponsePlaceholder();
                break;
            case 'addResponseChunk':
                ChatView.appendResponseChunk(data);
                break;
            case 'streamEnd':
                ChatView.finalizeStreamedResponse();
                break;

            // --- Agent durumu mesajı ---
            case 'updateAgentStatus':
                setAgentMode(data.isActive, data.activeFileName);
                break;
            case 'agentSelectionSet':
                setAgentSelectionStatus(data.fileName, data.startLine, data.endLine);
                break;
            case 'agentSelectionCleared':
                clearAgentSelectionStatus();
                break;

            // --- Bağlam (Context) Mesajları ---
            case 'updateContextSize':
                setContextSize(data.conversationSize, data.filesSize);
                InputArea.recalculateTotalAndUpdateUI();
                break;
            
            case 'fileContextSet': 
                FileTags.display(message.fileNames); 
                break;

            case 'clearContext':
            case 'clearFileContext':
                FileTags.clear(); 
                break;
            
            // YENİ/GÜNCELLENDİ: Hem manuel seçim hem de agent seçimi için placeholder'ı ayarlar.
            case 'contextSet': 
                 // Artık placeholder güncellemiyoruz
                 break;

            // --- Diğer Mesajlar ---
            case 'loadConfig':
                SettingsModal.loadConfig(data);
                break;

            case 'loadHistory':
                HistoryPanel.populate(data);
                break;

            case 'clearChat':
                ChatView.clear();
                resetChatState();
                InputArea.recalculateTotalAndUpdateUI();
                InputArea.autoResize();
                break;

            case 'loadConversation':
                ChatView.load(data);
                break;

            case 'settingsSaveResult':
                SettingsModal.handleSaveResult(data);
                break;
        }
    });
}