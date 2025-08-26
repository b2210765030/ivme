/* ==========================================================================
   YENİ DOSYA: src/features/Handlers/CommandHandler.ts (GÜNCELLENMİŞ)
   
   SORUMLULUK: VS Code komut paletinden veya arayüzden tetiklenen
   tüm komutların ana mantığını yönetir. `extension.ts` dosyasını
   temiz tutar.
   ========================================================================== */

import * as vscode from 'vscode';
import { ApiServiceManager } from '../../services/manager';
import { ChatViewProvider } from '../../providers/view_chat';
import { createFixErrorPrompt } from '../../system_prompts';
import { COMMAND_IDS, UI_MESSAGES, EXTENSION_NAME, EXTENSION_ID, API_SERVICES } from '../../core/constants';
import { cleanLLMCodeBlock } from '../../core/utils';
import { ApplyFixArgs} from '../../types/index';
import { ProjectIndexer } from '../../services/indexer';
import { PlannerIndexer } from '../../services/planner_indexer';
import { loadVectorStoreChunks, topKByEmbedding } from '../../services/vector_store';
import { getToolsManager } from '../../services/tools_manager';
import * as path from 'path';

export class CommandHandler {
    constructor(
        private apiManager: ApiServiceManager,
        private chatProvider: ChatViewProvider // Direkt provider referansı alıyoruz
    ) {}

    /**
     * Aktif API servisinin (vLLM veya Gemini) bağlantı durumunu kontrol eder.
     */
    public async checkConnection() {
        const activeService = this.apiManager.getActiveServiceName();
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `${activeService} durumu kontrol ediliyor...`,
            cancellable: false
        }, async () => {
            const isConnected = await this.apiManager.checkConnection();
            if (isConnected) {
                vscode.window.showInformationMessage(`${activeService} ile bağlantı başarılı!`);
            } else {
                const errorMsg = activeService === API_SERVICES.gemini
                    ? UI_MESSAGES.geminiConnectionError
                    : UI_MESSAGES.vllmConnectionError;
                vscode.window.showErrorMessage(errorMsg);
            }
        });
    }

    /**
     * Hata düzeltme (Quick Fix) komutunun mantığını çalıştırır.
     * BU FONKSİYON OLDUĞU GİBİ KALIYOR.
     */
    public async applyFix(args: ApplyFixArgs) {
        const uri = vscode.Uri.parse(args.uri);
        const document = await vscode.workspace.openTextDocument(uri);
        const prompt = createFixErrorPrompt(args.diagnostic.message, args.diagnostic.range[0] + 1, document.getText());

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: UI_MESSAGES.thinking, cancellable: true }, async () => {
            try {
                const correctedCode = await this.apiManager.generateContent(prompt);
                const cleanedCode = cleanLLMCodeBlock(correctedCode);
                
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
                edit.replace(document.uri, fullRange, cleanedCode);
                await vscode.workspace.applyEdit(edit);
                
                vscode.window.showInformationMessage(UI_MESSAGES.codeFixed);
            } catch (error: any) {
                const errorMsg = this.apiManager.getActiveServiceName() === API_SERVICES.gemini ? UI_MESSAGES.geminiConnectionError : UI_MESSAGES.vllmConnectionError;
                vscode.window.showErrorMessage(`${errorMsg} Lütfen sohbet panelindeki ayarları kontrol edin.`);
            }
        });
    }

    /**
     * KALDIRILDI: Seçili kodu kullanıcıdan alınan talimata göre değiştiren
     * `modifyWithInput` metodu kaldırılmıştır.
     */
        
    /**
     * Aktif editörde seçili olan kodu sohbet paneline bağlam (context) olarak gönderir.
     */
    public async sendToChat() {
        const editor = vscode.window.activeTextEditor;
        if (editor && !editor.selection.isEmpty) {
            this.chatProvider.setActiveContext(editor.document.uri, editor.selection, editor.document.getText(editor.selection));
            vscode.commands.executeCommand(`${EXTENSION_ID}.chatView.focus`);
        } else {
            vscode.window.showInformationMessage('Lütfen önce bir kod bloğu seçin.');
        }
    }

    /**
     * Sohbet panelini görünür hale getirir ve odaklanır.
     */
    public showChat() {
        vscode.commands.executeCommand(`${EXTENSION_ID}.chatView.focus`);
    }

    /**
     * Baykar Kod Geliştirme Paketi sunumunu gösterir.
     */
    public showPresentation() {
        vscode.commands.executeCommand('baykar-dev-pack.showPresentation');
    }

    /**
     * Workspace-specific proje indeksleme akışını başlatır.
     */
    public async indexProject() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('Aktif workspace bulunamadı. Lütfen bir klasör açın.');
            return;
        }

        const providerContext = (this.chatProvider as any)._context as vscode.ExtensionContext;
        const indexer = new ProjectIndexer(this.apiManager, providerContext);
        const plannerIndexer = new PlannerIndexer(this.apiManager, providerContext);
        
        await vscode.window.withProgress({ 
            location: vscode.ProgressLocation.Notification, 
            title: `Proje indeksleniyor: ${workspaceFolder.name}`, 
            cancellable: false 
        }, async (progress) => {
            try {
                // Başlangıç mesajı
                this.chatProvider['_view']?.webview.postMessage({ type: 'indexingProgress', payload: { message: 'Dosyalar taranıyor...', percent: 1 } });
                const result = await indexer.indexWorkspace({
                    report: ({ message, percent }: { message?: string; percent?: number }) => {
                        const clamped = typeof percent === 'number' ? Math.min(95, Math.max(1, Math.round(percent))) : undefined;
                        this.chatProvider['_view']?.webview.postMessage({ type: 'indexingProgress', payload: { message, percent: clamped } });
                    }
                } as { report: (arg: { message?: string; percent?: number }) => void });

                // Planner mimari indeksleme ve .indexignore dosyasını oluşturma
                this.chatProvider['_view']?.webview.postMessage({ type: 'indexingProgress', payload: { message: 'Planner: Mimari index başlatılıyor...', percent: 95 } });
                await plannerIndexer.buildPlannerIndex({
                    report: ({ message, percent }: { message?: string; percent?: number }) => {
                        const p = typeof percent === 'number' ? Math.max(95, Math.min(100, Math.round(percent))) : undefined;
                        this.chatProvider['_view']?.webview.postMessage({ type: 'indexingProgress', payload: { message, percent: p } });
                    }
                });

                // İndeksleme başarılı olduktan sonra araçları da başlat
                this.chatProvider['_view']?.webview.postMessage({ type: 'indexingProgress', payload: { message: 'Araçlar başlatılıyor...', percent: 98 } });
                await this.initializeToolsAfterIndexing();
                
                this.chatProvider['_view']?.webview.postMessage({ type: 'indexingDone' });
                // Indexing completed
                vscode.window.showInformationMessage(`İndeksleme tamamlandı. ${result.chunks.length} parça bulundu ve mimari harita oluşturuldu. Araçlar başlatıldı. (${workspaceFolder.name})`);
            } catch (e: any) {
                this.chatProvider['_view']?.webview.postMessage({ type: 'indexingDone' });
                vscode.window.showErrorMessage(`İndeksleme başarısız: ${e?.message || e}`);
            }
        });
    }

    /**
     * İndeksleme sonrası araçları başlatır (.ivme/tools.json oluşturur)
     */
    private async initializeToolsAfterIndexing(): Promise<void> {
        try {
            const providerContext = (this.chatProvider as any)._context as vscode.ExtensionContext;
            const toolsManager = getToolsManager();
            
            // Extension context'i ayarla
            if (typeof toolsManager.setExtensionContext === 'function') {
                toolsManager.setExtensionContext(providerContext);
            }
            
            // Built-in araçları başlat (tools.json oluştur)
            const result = await toolsManager.initializeBuiltinTools();
            
            if (result.success) {
                // Tools initialized successfully
            } else {
                console.error('[CommandHandler] Araç başlatma hatası:', result.error);
                vscode.window.showWarningMessage(`Araçlar başlatılamadı: ${result.error}`);
            }
        } catch (error) {
            console.error('[CommandHandler] initializeToolsAfterIndexing error:', error);
            vscode.window.showWarningMessage(`Araç başlatma hatası: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
        }
    }

    /**
     * İndekste serbest metin araması yapar (Gemini embedding ile cosine similarity).
     */
    public async searchIndex() {
        const query = await vscode.window.showInputBox({ prompt: 'İndekste ara (sorgu metni girin):' });
        if (!query) return;
        const providerContext = (this.chatProvider as any)._context as vscode.ExtensionContext;
        try {
            const chunks = await loadVectorStoreChunks(providerContext);
            if (chunks.length === 0) {
                vscode.window.showWarningMessage('Vektör mağazasında kayıt bulunamadı. Önce indeksleyin.');
                return;
            }
            const embedding = await this.apiManager.embedTextIfAvailable(query);
            const emb = Array.isArray(embedding) ? embedding : [];
            const results = topKByEmbedding(chunks, emb, 10);
            const items = results.map((r: { score: number; chunk: any }) => ({
                label: `${path.basename(r.chunk.filePath)}:${r.chunk.startLine}-${r.chunk.endLine}  (score: ${r.score.toFixed(3)})`,
                description: `${r.chunk.contentType} • ${r.chunk.name}`,
                detail: r.chunk.summary || r.chunk.content.slice(0, 200),
                c: r.chunk
            }));
            const picked = await vscode.window.showQuickPick(items as Array<vscode.QuickPickItem & { c: any }>, { placeHolder: 'Eşleşen kod parçacıkları' });
            if (picked && (picked as any).c) {
                const chosen = (picked as any).c as { filePath: string; startLine: number; endLine: number };
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(chosen.filePath));
                const editor = await vscode.window.showTextDocument(doc);
                const start = new vscode.Position(Math.max(0, chosen.startLine - 1), 0);
                const end = new vscode.Position(Math.max(0, chosen.endLine - 1), 0);
                editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);
                editor.selection = new vscode.Selection(start, start);
            }
        } catch (e: any) {
            console.error('[Search] Hata:', e);
            vscode.window.showErrorMessage(`Arama başarısız: ${e?.message || e}`);
        }
    }
}

