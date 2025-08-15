/* ==========================================================================
   MESAJ YÖNLENDİRİCİ (MESSAGE ROUTER) (AGENT SEÇİM ÖZELLİĞİ EKLENDİ)
   ========================================================================== */

import { onMessage } from '../services/vscode.js';
import * as ChatView from '../components/chat_view.js';
import * as FileTags from '../components/file_tags.js';
import * as HistoryPanel from '../components/history_panel.js';
import * as InputArea from '../components/InputArea.js';
import * as SettingsModal from '../components/settings_modal.js';
import { setContextSize, resetChatState, setAgentMode, setAgentSelectionStatus, clearAgentSelectionStatus, setIndexingActive, updateIndexerProgress, setIndexingEnabledState, setWorkspaceName, getState, setTokenLimit, updateUITexts, setHasIndex } from './state.js';
import * as DOM from '../utils/dom.js';

export function initMessageListener() {
    onMessage(message => {
        const data = message.payload ?? message.value;
        
        switch (message.type) {
            case 'indexingProgress':
                setIndexingActive(true);
                updateIndexerProgress(Math.round(data.percent || 0), data.message || '');
                if (data.message) {
                    InputArea.setPlaceholder(data.message);
                }
                break;
            case 'indexingDone':
                // Önce hasIndex'i güncelle, sonra UI enable et
                if (typeof data?.hasIndex !== 'undefined') {
                    setHasIndex(!!data.hasIndex);
                } else {
                    setHasIndex(true);
                }
                updateIndexerProgress(100, '');
                setIndexingActive(false, { preserveBar: true });
                setIndexingEnabledState(true); // İndeksleme tamamlandığında active et
                // Placeholder mesajını güncelle (sadece "ivmeye soru sorun..." göster)
                InputArea.setPlaceholder();
                break;
            case 'indexingToggled':
                // Eğer backend hasIndex bilgisi veriyorsa önce onu uygula
                if (typeof data?.hasIndex !== 'undefined') {
                    setHasIndex(!!data.hasIndex);
                    setIndexingEnabledState(data.enabled);
                } else {
                    // hasIndex bilgisi yoksa mevcut UI'yı bozmayalım; sadece aktiflik durumunu koru
                    if (data.enabled === false) {
                        setIndexingEnabledState(false);
                    }
                }
                setIndexingActive(false, { preserveBar: true });
                // Placeholder mesajını güncelle (sadece "ivmeye soru sorun..." göster)
                InputArea.setPlaceholder();
                break;
            case 'indexingStatus':
                // İndeksleme durumu bilgisi geldi
                if (typeof data?.hasIndex !== 'undefined') {
                    setHasIndex(!!data.hasIndex);
                }
                setIndexingEnabledState(data.isEnabled);
                break;
            case 'workspaceInfo':
                // Workspace bilgisi geldi
                setWorkspaceName(data.workspaceName);
                if (typeof data?.hasIndex !== 'undefined') {
                    setHasIndex(!!data.hasIndex);
                }
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