/* ==========================================================================
   DOSYA: src/features/Handlers/Interaction.ts (GÜNCELLENMİŞ)
   
   SORUMLULUK: Kullanıcı etkileşimlerini yönetir.
   YENİ GÜNCELLEME: Talimat oluşturma mantığı `promptBuilder`'a taşındı.
   ========================================================================== */

import * as vscode from 'vscode';
import axios from 'axios';
import { ApiServiceManager } from '../../services/manager';
import { ConversationManager } from '../manager/conversation';
import { ContextManager } from '../manager/context';
import { ChatMessage } from '../../types/index';
import { EXTENSION_ID, SETTINGS_KEYS } from '../../core/constants';
import { createContextualPrompt } from '../../system_prompts';
import { build_context_for_query } from '../../services/orchestrator';
export class InteractionHandler {
    private currentRequestController: AbortController | null = null;

    constructor(
        private conversationManager: ConversationManager,
        private apiManager: ApiServiceManager,
        private webview: vscode.Webview,
        private contextManager: ContextManager
    ) {}

    public cancelStream() {
        if (this.currentRequestController) {
            this.currentRequestController.abort();
            this.currentRequestController = null;
            console.log('Stream cancelled by user.');
        }
    }

    public async handle(instruction: string) {
        if (this.currentRequestController) {
            this.cancelStream();
        }
        
        this.conversationManager.addMessage('user', instruction);
        await this.streamStandardChat();
    }

    private async streamStandardChat() {
        this.currentRequestController = new AbortController();
        const cancellationSignal = this.currentRequestController.signal;
        
        const messagesForApi = await this.prepareMessagesForApiWithRetrieval();

        console.log('Prompt to LLM:', JSON.stringify(messagesForApi, null, 2));

        
        let fullResponse = '';
        try {
            await this.apiManager.generateChatContent(messagesForApi, (chunk) => {
                fullResponse += chunk;
                this.webview.postMessage({ type: 'addResponseChunk', payload: chunk });
            }, cancellationSignal);

            if (!cancellationSignal.aborted) {
                this.conversationManager.addMessage('assistant', fullResponse);
            }
            
        } catch (error: any) {
            if (axios.isCancel(error) || error.name === 'AbortError') {
                console.log('Stream successfully aborted by the user.');
            } else {
                this.conversationManager.removeLastMessage();
                console.error("Chat API Stream Hatası:", error);
                const errorMessage = error instanceof Error ? error.message : "Bilinmeyen bir hata oluştu.";
                this.webview.postMessage({ type: 'addResponse', payload: `**Hata:** ${errorMessage}` });
            }
        } finally {
            this.webview.postMessage({ type: 'streamEnd' });
            this.currentRequestController = null;
        }
    }
    
    /**
     * GÜNCELLENDİ: API'ye gönderilecek mesajları hazırlarken `promptBuilder` kullanır.
     * Bu, bu dosyayı daha temiz ve yönetilebilir hale getirir.
     */
    private async prepareMessagesForApiWithRetrieval(): Promise<ChatMessage[]> {
        const activeConversation = this.conversationManager.getActive();
        if (!activeConversation) return [];
        
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        const historyLimit = config.get<number>(SETTINGS_KEYS.conversationHistoryLimit, 2);
        
        const systemPrompt = activeConversation.messages.find(m => m.role === 'system');
        const conversationHistory = activeConversation.messages.filter(m => m.role !== 'system');
        const limitedHistory = conversationHistory.slice(-(historyLimit * 2 + 1));

        const lastUserMessageIndex = limitedHistory.map(m => m.role).lastIndexOf('user');
        if (lastUserMessageIndex !== -1) {
            const lastUserMessage = limitedHistory[lastUserMessageIndex];
            
            // YENİ: Talimat oluşturma işlemi `promptBuilder`'a devredildi.
            const contextualContent = createContextualPrompt(lastUserMessage, this.contextManager);
            
            // Faz 2: retrieval ile bağlam oluştur ve mesaja ekle
            try {
                const contextText = await build_context_for_query(this.conversationManager.getExtensionContext(), this.apiManager, lastUserMessage.content);
                const merged = `${contextualContent}\n\n<retrieved_context>\n${contextText}\n</retrieved_context>`;
                limitedHistory[lastUserMessageIndex] = { role: 'user', content: merged };
            } catch (e) {
                console.warn('[Interaction] Retrieval başarısız, bağlam eklenmeden devam ediliyor:', e);
                limitedHistory[lastUserMessageIndex] = { role: 'user', content: contextualContent };
            }
        }

        return systemPrompt ? [systemPrompt, ...limitedHistory] : limitedHistory;
    }
}