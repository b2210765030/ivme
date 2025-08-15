/* ==========================================================================
   DOSYA: src/features/MessageHandler.ts (DEĞİŞİKLİK UYGULAMA EKLENDİ)
   ========================================================================== */

import * as vscode from 'vscode';
import { ApiServiceManager } from '../../services/manager';
import { ConversationManager } from '../manager/conversation';
import { InteractionHandler } from '../Handlers/Interaction';
import { ContextManager } from '../manager/context';

export class MessageHandler {
    public interactionHandler: InteractionHandler;

    constructor(
        private conversationManager: ConversationManager,
        private apiManager: ApiServiceManager,
        private contextManager: ContextManager,
        private webview: vscode.Webview
    ) {
        this.interactionHandler = new InteractionHandler(this.conversationManager, this.apiManager, this.webview, this.contextManager);
    }

    public async handleAskAi(userMessage: string) {
        // Gelen tüm mesajları merkezi olarak InteractionHandler'a yönlendir.
        await this.interactionHandler.handle(userMessage);
    }

    /**
     * YENİ: Arayüzden gelen "Değişikliği Uygula" isteğini işler.
     * ContextManager'dan alınan son seçim bilgisine göre ilgili kod bloğunu günceller.
     * @param newCode Yapay zeka tarafından üretilen ve uygulanacak olan yeni kod.
     */
    public async handleApplyCodeChange(newCode: string): Promise<void> {
        // Değişikliğin uygulanacağı bağlamı (dosya ve seçim aralığı) kontrol et.
        // Öncelik: Agent modundaki anlık seçim.
        // Geriye dönük uyumluluk: Eğer agent seçimi yoksa, manuel "İvme'ye Gönder" seçimini kullan.
        const selectionToApply = this.contextManager.agentSelectionContext?.selection 
                                 || this.contextManager.activeSelection;

        const uriToApply = this.contextManager.agentFileContext?.uri 
                           || this.contextManager.activeEditorUri;

        if (!selectionToApply || !uriToApply) {
            vscode.window.showErrorMessage('Değişikliği uygulamak için geçerli bir kod seçimi bulunamadı. Lütfen önce Agent Modu\'nda bir kod seçin veya "İvme\'ye Gönder" özelliğini kullanın.');
            return;
        }

        try {
            // VS Code çalışma alanında bir düzenleme nesnesi oluştur.
            const edit = new vscode.WorkspaceEdit();
            
            // Yeni kodu, saklanan seçim aralığına uygula.
            edit.replace(uriToApply, selectionToApply, newCode);
            
            // Hazırlanan değişikliği çalışma alanına uygula.
            const success = await vscode.workspace.applyEdit(edit);

            if (success) {
                vscode.window.showInformationMessage('Kod başarıyla güncellendi!');
            } else {
                vscode.window.showErrorMessage('Kod güncellenirken bir hata oluştu.');
            }
        } catch (error) {
            console.error('Değişiklik uygulanırken hata:', error);
            vscode.window.showErrorMessage('Kod güncellenirken beklenmedik bir hata oluştu.');
        }
    }
}