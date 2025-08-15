/* ==========================================================================
   MESAJ YÖNLENDİRİCİ (MESSAGE ROUTER) (AGENT SEÇİM ÖZELLİĞİ EKLENDİ)
   ========================================================================== */

import { onMessage } from '../services/vscode.js';
import * as ChatView from '../components/chat_view.js';
import * as FileTags from '../components/file_tags.js';
import * as HistoryPanel from '../components/history_panel.js';
import * as InputArea from '../components/InputArea.js';
import * as SettingsModal from '../components/settings_modal.js';
import { setContextSize, resetChatState, setAgentMode, setAgentSelectionStatus, clearAgentSelectionStatus, setIndexingActive, updateIndexerProgress, setIndexingEnabledState, setWorkspaceName, getState, setTokenLimit, updateUITexts } from './state.js';
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
                updateIndexerProgress(100, '');
                setRingProgress(100);
                setIndexingActive(false, { preserveBar: true });
                setIndexingEnabledState(true); // İndeksleme tamamlandığında aktif et
                // Placeholder mesajını güncelle (sadece "ivmeye soru sorun..." göster)
                InputArea.setPlaceholder();
                break;
            case 'indexingToggled':
                // İndeksleme açık/kapalı durumu değişti
                setIndexingEnabledState(data.enabled);
                if (data.enabled) {
                    setIndexingActive(false, { preserveBar: true });
                } else {
                    setIndexingActive(false);
                }
                // Placeholder mesajını güncelle (sadece "ivmeye soru sorun..." göster)
                InputArea.setPlaceholder();
                break;
            case 'indexingStatus':
                // İndeksleme durumu bilgisi geldi
                setIndexingEnabledState(data.isEnabled);
                break;
            case 'workspaceInfo':
                // Workspace bilgisi geldi
                setWorkspaceName(data.workspaceName);
                break;
            case 'updateTokenLimit':
                // Token limiti güncellendi
                setTokenLimit(data.tokenLimit);
                InputArea.recalculateTotalAndUpdateUI();
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
            case 'restoreAgentMode':
                setAgentMode(data.isActive, '');
                if (data.isBarExpanded !== undefined) {
                    setAgentBarExpanded(data.isBarExpanded);
                }
                break;
            case 'languageChanged':
                // Dil değişikliği sırasında UI metinlerini güncelle
                updateUITexts();
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