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
import { run_planner, PlannerPlan } from '../../services/planner';
export class InteractionHandler {
    private currentRequestController: AbortController | null = null;
    private lastPlannerPlan: PlannerPlan | null = null;

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
        console.log('[Planner] User instruction:', instruction);
        // Koşullu: Sadece Agent Modu aktif VE indeksleme (index butonu) açıkken planner akışı çalışsın
        try {
            this.currentRequestController = new AbortController();
            const cancellationSignal = this.currentRequestController.signal;

            const config = vscode.workspace.getConfiguration(EXTENSION_ID);
            const isAgentActive = config.get<boolean>(SETTINGS_KEYS.agentModeActive, false);
            const isIndexEnabled = config.get<boolean>(SETTINGS_KEYS.indexingEnabled, false);

            // Fallback: bazen UI state ile ayarlar arasındaki senkronizasyon gecikebilir.
            // Eğer agentMode aktif olarak kaydedilmemişse ama contextManager üzerinde
            // agent dosya/selection bağlamı varsa planner yolunu yine çalıştır.
            const agentContextPresent = !!(this.contextManager.agentFileContext || this.contextManager.agentSelectionContext);
            const shouldUsePlanner = (isAgentActive || agentContextPresent) && isIndexEnabled;

            console.log('[Interaction] Planner decision:', { isAgentActive, agentContextPresent, isIndexEnabled, shouldUsePlanner });

            if (shouldUsePlanner) {
                // Streaming: ui_text parçalarını anında UI'a ilet
                const plan = await run_planner(
                    this.conversationManager.getExtensionContext(),
                    this.apiManager,
                    instruction,
                    (stepNo, uiText, isFinal) => {
                        // Tipografik/daktilo efekti için parça olarak gönderme yerine UI tarafında efekt verilecek
                        this.webview.postMessage({ type: 'plannerUiChunk', payload: { stepNo, uiText, isFinal } });
                    },
                    cancellationSignal as any
                );
                // Plan tamamlandığında nihai sonucu da gönder
                this.webview.postMessage({ type: 'plannerResult', payload: { plan } });
                // Planı hafızada tut
                this.lastPlannerPlan = plan;
                this.currentRequestController = null;

                // Plan finalize edildikten sonra, aynı placeholder altında açıklamayı stream et
                setTimeout(() => {
                    this.streamPlanExplanationInline(plan).catch(err => console.error('[Interaction] Plan explanation error:', err));
                }, 50);
            } else {
                // Standart sohbet akışına geri dön
                await this.streamStandardChat();
                return;
            }
        } catch (e) {
            console.error('[Interaction] Planner çalıştırılırken hata oluştu:', e);
            // Hata durumunda kullanıcıya bilgi ver
            const errorMessage = e instanceof Error ? e.message : 'Planner çalıştırılırken hata oluştu.';
            this.webview.postMessage({ type: 'addResponse', payload: `**Hata:** ${errorMessage}` });
            this.webview.postMessage({ type: 'streamEnd' });
        }
    }

    /**
     * Plan çıktılarını çok kısa, sade Türkçe cümlelerle adım adım açıklar ve webview'e stream eder.
     */
    private async streamPlanExplanationInline(plan: PlannerPlan) {
        // Yeni bir akış başlatılacağı için önce varsa önceki isteği iptal et
        if (this.currentRequestController) {
            try { this.currentRequestController.abort(); } catch {}
        }
        this.currentRequestController = new AbortController();
        const cancellationSignal = this.currentRequestController.signal;
        // Yeni placeholder açma — aynı mesajda devam edeceğiz, sadece markdown açıklama gelecek

        // Promptu hazırla
        const planJson = JSON.stringify(plan, null, 2);
        const stepCount = Array.isArray((plan as any)?.steps) ? (plan as any).steps.length : 0;
        const stepsTemplate = Array.from({ length: stepCount }, (_, i) => `${i + 1}) <kısa cümle>`).join('\n');

        const systemInstruction = [
            'Türkçe ve ÇOK KISA cümlelerle yaz.',
            'Sadece belirtilen formatta yaz; ekstra açıklama, başlık, markdown, kod bloğu, boş satır veya ek satır ekleme.',
            `Plan ${stepCount} adım içeriyor; adım satırı sayısı tam olarak ${stepCount} olmalı.`,
            'Her adım için yalnızca TEK cümle yaz; açıklama, gerekçe, örnek, not ekleme.',
            "Her satırda mevcutsa step.ui_text'i kullan; yoksa step.action'ı çok kısa tek cümleye indir.",
            "'thought', 'notes' gibi alanları YOK SAY.",
            "Son satır 'Özet:' ile başlayan çok kısa bir cümle olmalı.",
            'Başka hiçbir şey yazma.'
        ].join(' ');

        const userRequest = [
            "Aşağıda plan JSON'u var. Aşağıdaki KESİN formatta çıktı üret:",
            'Giriş cümlesi',
            stepsTemplate,
            'Özet: <çok kısa cümle>',
            '',
            'Plan(JSON):',
            '```json',
            planJson,
            '```'
        ].join('\n');

        // Use centralized prompt builder (language selection is handled via src/system_prompts.setPromptLanguage elsewhere)
        const prompts = require('../../system_prompts').createPlanExplanationPrompts(planJson);

        const messages = [
            { role: 'system' as const, content: prompts.system },
            { role: 'user' as const, content: prompts.user }
        ];

        try {
            await this.apiManager.generateChatContent(
                messages,
                (chunk) => {
                    if ((cancellationSignal as any)?.aborted) return;
                    this.webview.postMessage({ type: 'addResponseChunk', payload: chunk });
                },
                cancellationSignal as any
            );
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                console.log('[Interaction] Plan explanation aborted by user.');
            } else {
                console.error('[Interaction] Plan explanation stream error:', error);
                const errorMessage = error instanceof Error ? error.message : 'Açıklama oluşturulurken bir hata oluştu.';
                this.webview.postMessage({ type: 'addResponse', payload: `**Hata:** ${errorMessage}` });
            }
        } finally {
            this.webview.postMessage({ type: 'streamEnd' });
            this.currentRequestController = null;
        }
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
            
            // GEÇİCİ: Retrieval'ı tamamen bypass ediyoruz; sadece contextual content kullanıyoruz.
            limitedHistory[lastUserMessageIndex] = { role: 'user', content: contextualContent };
        }

        return systemPrompt ? [systemPrompt, ...limitedHistory] : limitedHistory;
    }
}