/* ==========================================================================
   DOSYA: src/features/Handlers/WebviewMessageHandler.ts (DEĞİŞİKLİK UYGULAMA EKLENDİ)
   ========================================================================== */

import * as vscode from 'vscode';
import * as path from 'path';
import { MessageHandler } from '../Handlers/message';
import { ConversationManager } from '../manager/conversation';
import { ContextManager } from '../manager/context';
import { SettingsManager } from '../manager/settings';
import { InteractionHandler } from '../Handlers/Interaction';
import { ChatViewProvider } from '../../providers/view_chat';
import { setPromptLanguage, createInitialSystemPrompt } from '../../system_prompts';



export class WebviewMessageHandler {
    private interactionHandler: InteractionHandler;

    constructor(
        private chatProvider: ChatViewProvider,
        private messageHandler: MessageHandler,
        private conversationManager: ConversationManager,
        private contextManager: ContextManager,
        private settingsManager: SettingsManager,
        private webview: vscode.Webview
    ) {
        this.interactionHandler = this.messageHandler.interactionHandler;
    }


    public async handleMessage(data: any) {
        switch (data.type) {
            // --- Planner: Adım JSON'u webview'den güncellendi ---
            case 'updatePlannerStep': {
                try {
                    const idx = Number(data?.payload?.index ?? -1);
                    const step = data?.payload?.step;
                    if (idx >= 0 && step) {
                        await this.interactionHandler.updatePlannerStep(idx, step);
                    }
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Adım güncellenemedi: ${e?.message || e}`);
                }
                break;
            }
            // --- Planner: Tek adımı uygula ---
            case 'executePlannerStep': {
                const stepIndex = Number(data?.payload?.index ?? -1);
                try {
                    await this.interactionHandler.executePlannerStep(stepIndex);
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Adım uygulanamadı: ${e?.message || e}`);
                }
                break;
            }
            // --- Planner: Yeni adım ekle ---
            case 'insertPlannerStep': {
                try {
                    const index = Number(data?.payload?.index ?? -1);
                    const direction = String(data?.payload?.direction || 'below');
                    const step = data?.payload?.step;
                    if (index >= 0 && step) {
                        await this.interactionHandler.insertPlannerStep(index, direction, step);
                    }
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Adım eklenemedi: ${e?.message || e}`);
                }
                break;
            }
            // --- Planner: Adım sil ---
            case 'deletePlannerStep': {
                try {
                    const stepIndex = Number(data?.payload?.index ?? -1);
                    if (stepIndex >= 0) {
                        await this.interactionHandler.deletePlannerStep(stepIndex);
                    }
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Adım silinemedi: ${e?.message || e}`);
                }
                break;
            }
            case 'toggleAgentFileSuppressed':
                this.contextManager.setAgentFileSuppressed(!!data.payload?.suppressed, this.webview);
                // UI'ı güncelle: Eğer suppress ise agent barı gizlensin bilgisi gönder
                // UI güncellemesi agent barın açık/kapalı durumuna göre yapılacak; burada sadece aktif editörden tazeleme yapalım
                this.chatProvider.handleEditorChange(vscode.window.activeTextEditor);
                break;
            case 'askAI':
                await this.messageHandler.handleAskAi(data.payload);
                this.sendContextSize();
                break;
            // Planner: tüm adımları uygula
            case 'executePlannerAll':
                await this.interactionHandler.executePlannerAll();
                break;
            
            // --- YENİ: Değişikliği Uygula Mesajı ---
            case 'applyCodeChange':
                if (data.payload && data.payload.newCode) {
                    await this.messageHandler.handleApplyCodeChange(data.payload.newCode);
                }
                break;
            // ------------------------------------

            case 'requestContextSize':
                this.sendContextSize();
                break;

            case 'newChat':
                this.handleNewChat();
                break;

            case 'requestHistory':
                this.sendHistory();
                break;

            case 'switchChat':
                this.switchChat(data.payload.conversationId);
                break;

            case 'deleteChat':
                this.deleteChat(data.payload.conversationId);
                break;
            
            case 'requestFileUpload': 
                await this.contextManager.addFilesToContext(this.webview); 
                break;
            
            case 'removeFileContext': 
                this.contextManager.removeFileContext(data.payload.fileName, this.webview);
                break;
            
            case 'clearFileContext':
                this.contextManager.clearAll(this.webview);
                break;
            
            case 'requestConfig': 
                this.settingsManager.sendConfigToWebview(this.webview); 
                break;
            
            case 'saveSettings': 
                await this.settingsManager.saveSettings(data.payload, this.webview); 
                break;

            // Proje indeksleme tetikleyicisi
            case 'indexProject':
                await vscode.commands.executeCommand('baykar-ai.indexProject');
                break;
            case 'indexProjectCancel':
                // Şimdilik yalnızca kullanıcıya bilgi veriyoruz. İleride gerçek iptal mekanizması eklenecek.
                vscode.window.showInformationMessage('İndeksleme iptal talebi alındı.');
                this.webview.postMessage({ type: 'indexingDone' });
                break;
            case 'toggleIndexing':
                await this.toggleIndexing();
                break;
            case 'requestIndexingStatus':
                await this.sendIndexingStatus();
                break;
            
            case 'showPresentation':
                vscode.commands.executeCommand('baykar.showPresentation');
                break;

            case 'showFeedbackMessage':
                vscode.window.showInformationMessage("Rocket Chat üzerinden Asil Can Yılmaz ile İletişime Geçin");
                break;

            case 'stopGeneration':
                this.interactionHandler.cancelStream();
                break;

            case 'clearAgentSelection':
                this.contextManager.clearAgentSelectionContext(this.webview);
                this.webview.postMessage({ type: 'agentSelectionCleared' });
                break;

            case 'confirmAgentSelection':
                this.chatProvider.applyPendingSelection();
                break;

            case 'cancelProposedSelection':
                this.chatProvider.cancelPendingSelection();
                break;

            case 'agentModeToggled':
                this.chatProvider.setAgentMode(data.payload.isActive);
                if (data.payload.language) {
                    setPromptLanguage(data.payload.language);
                    const prompt = createInitialSystemPrompt();
                    this.conversationManager.updateSystemPrompt(prompt);
                }
                if (!data.payload.isActive) {
                    this.contextManager.clearAgentContexts(this.webview);
                    this.webview.postMessage({
                        type: 'updateAgentStatus',
                        payload: { isActive: false }
                    });
                }
                break;

            case 'agentBarExpandedChanged':
                this.settingsManager.saveAgentBarExpandedState(data.payload.isExpanded);
                break;

            case 'languageChanged':
                setPromptLanguage(data.payload.language);
                const prompt = createInitialSystemPrompt();
                this.conversationManager.updateSystemPrompt(prompt);
                // Webview'e dil değişikliği mesajı gönder
                this.webview.postMessage({ type: 'languageChanged', payload: { language: data.payload.language } });
                break;
        }
    }

    public sendContextSize() {
        const conversationTokens = this.conversationManager.getActiveConversationSize();
        const filesTokens = this.contextManager.getUploadedFilesSize() + this.contextManager.getAgentFileSize();
        // Sadece planner akışı kullanılacaksa hafıza özetini toplam sayaca dahil et
        let memoryTokens = 0;
        try {
            const isAgentActive = this.settingsManager.getAgentModeState();
            const isIndexingEnabled = this.settingsManager.getIndexingEnabled();
            const agentContextPresent = !!(this.contextManager.agentFileContext || this.contextManager.agentSelectionContext);
            const shouldUsePlanner = (isAgentActive || agentContextPresent) && isIndexingEnabled;
            if (shouldUsePlanner) {
                const mem = this.conversationManager.getPlannerSummaryMemory?.();
                if (typeof mem === 'string' && mem.trim().length > 0) {
                    // Runtime import to avoid TS cycle; use extension tokenizer for parity
                    const { countTokensGPT } = require('../../core/tokenizer');
                    memoryTokens = countTokensGPT(mem);
                }
            }
        } catch {}
        this.webview.postMessage({
            type: 'updateContextSize',
            payload: { conversationSize: conversationTokens + memoryTokens, filesSize: filesTokens }
        });
    }

    public async sendIndexingStatus() {
        const { ProjectIndexer } = await import('../../services/indexer.js');
        const indexer = new ProjectIndexer(this.messageHandler['apiManager'], this.conversationManager.getExtensionContext());
        
        // Workspace'de indexing dosyası var mı kontrol et
        const isIndexed = await indexer.isWorkspaceIndexed();
        const isEnabled = await indexer.getIndexingEnabled();
        
        // Eğer indexing dosyası yoksa ama enabled true ise, false yap
        if (!isIndexed && isEnabled) {
            await indexer.setIndexingEnabled(false);
            this.webview.postMessage({
                type: 'indexingStatus',
                payload: {
                    isEnabled: false
                }
            });
        } else {
            this.webview.postMessage({
                type: 'indexingStatus',
                payload: {
                    isEnabled
                }
            });
        }
    }

    private handleNewChat() {
        this.contextManager.clearAll(this.webview, false);
        this.conversationManager.createNew();
        this.webview.postMessage({ type: 'clearChat' });
        
        this.chatProvider.handleEditorChange(vscode.window.activeTextEditor);
        this.sendContextSize();
        // Yeni sohbet oluşturulduğunda indeksleme durumunu koruyalım
        this.sendIndexingStatus();
    }

    private sendHistory() {
        const historySummary = this.conversationManager.getHistorySummary();
        this.webview.postMessage({ type: 'loadHistory', payload: historySummary });
    }

    private switchChat(conversationId: string) {
        this.contextManager.clearAll(this.webview, false);
        const conversation = this.conversationManager.switchConversation(conversationId);
        if (conversation) {
            this.webview.postMessage({ type: 'loadConversation', payload: conversation.messages });
        }
        this.sendContextSize();
        // Sohbet değiştirildiğinde indeksleme durumunu koruyalım
        this.sendIndexingStatus();
    }
    
    private deleteChat(conversationId: string) {
        const nextConversation = this.conversationManager.deleteConversation(conversationId);
        
        if (nextConversation) {
            this.webview.postMessage({ type: 'loadConversation', payload: nextConversation.messages });
        } else {
            this.handleNewChat();
        }
       
        this.sendHistory();
        this.sendContextSize();
        // Sohbet silindiğinde indeksleme durumunu koruyalım
        this.sendIndexingStatus();
    }

    private async toggleIndexing() {
        const { ProjectIndexer } = await import('../../services/indexer.js');
        const indexer = new ProjectIndexer(this.messageHandler['apiManager'], this.conversationManager.getExtensionContext());
        
        const isEnabled = await indexer.getIndexingEnabled();
        const isIndexed = await indexer.isWorkspaceIndexed();
        
        if (isEnabled) {
            // İndeksleme açıksa kapat
            await indexer.setIndexingEnabled(false);
            this.webview.postMessage({ type: 'indexingToggled', payload: { enabled: false } });
        } else {
            // İndeksleme kapalıysa
            if (isIndexed) {
                // Zaten indekslenmişse sadece aç
                await indexer.setIndexingEnabled(true);
                this.webview.postMessage({ type: 'indexingToggled', payload: { enabled: true } });
            } else {
                // İndekslenmemişse indeksleme işlemini başlat
                await vscode.commands.executeCommand('baykar-ai.indexProject');
            }
        }
    }
}