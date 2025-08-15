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
import { run_planner } from '../../services/planner';
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
        // Eğer indexing etkinse, önce Planner'ı çalıştır ve retrieval akışını Bypass et
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        const indexingEnabled = config.get<boolean>(SETTINGS_KEYS.indexingEnabled, false);
        if (indexingEnabled) {
            try {
                const plan = await run_planner(this.conversationManager.getExtensionContext(), this.apiManager, instruction);
                // Planı UI'da göster
                this.webview.postMessage({ type: 'plannerResult', payload: { plan } });
                return; // Şimdilik chat LLM akışını başlatma
            } catch (e) {
                console.warn('[Interaction] Planner çalıştırılırken hata oluştu, sohbet akışına dönülüyor:', e);
            }
        }

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
            
            // YENİ: Sadece Agent modunda index retrieval yap
            // Chat modunda sadece contextual content kullan
            const isAgentModeActive = config.get<boolean>(SETTINGS_KEYS.agentModeActive, false);
            
            if (isAgentModeActive) {
                // Agent modunda: eğer indexing etkinse önce Planner çalışsın (retrieval öncesi)
                const config = vscode.workspace.getConfiguration(EXTENSION_ID);
                const indexingEnabled = config.get<boolean>(SETTINGS_KEYS.indexingEnabled, false);

                if (indexingEnabled) {
                    try {
                        // Planner'ı çalıştır (doğrudan LLM'e gider)
                        const plan = await run_planner(this.conversationManager.getExtensionContext(), this.apiManager, lastUserMessage.content);
                        // UI'ya planı göster
                        this.webview.postMessage({ type: 'plannerResult', payload: { plan } });

                        // Planner çıktısını kullanıcı mesajına ekle (LLM'e gönderilecek sohbet bağlamına)
                        const merged = `${contextualContent}\n\n<planner_result>\n${JSON.stringify(plan, null, 2)}\n</planner_result>`;
                        limitedHistory[lastUserMessageIndex] = { role: 'user', content: merged };
                    } catch (e) {
                        console.warn('[Interaction] Planner çalıştırılırken hata oluştu, normal akışa dönülüyor:', e);
                        // Fallback: retrieval ile bağlam oluştur
                        try {
                            const contextText = await build_context_for_query(this.conversationManager.getExtensionContext(), this.apiManager, lastUserMessage.content);
                            const merged = `${contextualContent}\n\n<retrieved_context>\n${contextText}\n</retrieved_context>`;
                            limitedHistory[lastUserMessageIndex] = { role: 'user', content: merged };
                        } catch (e2) {
                            console.warn('[Interaction] Retrieval başarısız, bağlam eklenmeden devam ediliyor:', e2);
                            limitedHistory[lastUserMessageIndex] = { role: 'user', content: contextualContent };
                        }
                    }
                } else {
                    // Index kapalıysa eski davranış (retrieval)
                    try {
                        const contextText = await build_context_for_query(this.conversationManager.getExtensionContext(), this.apiManager, lastUserMessage.content);
                        const merged = `${contextualContent}\n\n<retrieved_context>\n${contextText}\n</retrieved_context>`;
                        limitedHistory[lastUserMessageIndex] = { role: 'user', content: merged };
                    } catch (e) {
                        console.warn('[Interaction] Retrieval başarısız, bağlam eklenmeden devam ediliyor:', e);
                        limitedHistory[lastUserMessageIndex] = { role: 'user', content: contextualContent };
                    }
                }
            } else {
                // Chat modunda: sadece contextual content kullan, retrieval yapma
                limitedHistory[lastUserMessageIndex] = { role: 'user', content: contextualContent };
            }
        }

        return systemPrompt ? [systemPrompt, ...limitedHistory] : limitedHistory;
    }
}