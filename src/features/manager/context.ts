/* ==========================================================================
   DOSYA: src/features/ContextManager.ts (AGENT SEÇİM ÖZELLİĞİ EKLENDİ)
   
   SORUMLULUK: Editörden seçilen kod, yüklenen dosya ve agent modu gibi
   geçici bağlamları yönetir.
   ========================================================================== */

import * as vscode from 'vscode';
import * as path from 'path';
import { EXTENSION_ID } from '../../core/constants';


export class ContextManager {
    // Editörden manuel seçilen kod bağlamı ("İvme'ye Gönder")
    public activeEditorUri?: vscode.Uri;
    public activeSelection?: vscode.Selection;
    public activeContextText?: string;
    
    // Manuel yüklenen dosyaların bağlamı
    public uploadedFileContexts: Array<{
        uri: vscode.Uri;
        content: string;
        fileName: string;
    }> = [];

    // --- YENİ: Agent Modu için ayrılmış bağlamlar ---
    
    // Agent modunda aktif olan dosyanın tamamının bağlamı
    public agentFileContext: {
        uri: vscode.Uri;
        content: string;
        fileName: string; // YENİ: Dosya adını da saklayalım
    } | null = null;

    // YENİ: Agent modunda aktif olan dosya içindeki anlık seçimin bağlamı
    public agentSelectionContext: {
        selection: vscode.Selection;
        content: string;
    } | null = null;

    // YENİ: Agent dosya bağlamını geçici olarak gizlemek/suppresse etmek için bayrak
    public agentFileSuppressed: boolean = false;


    /**
     * "İvme'ye Gönder" komutuyla seçilen bir kod parçasını bağlam olarak ayarlar.
     * Bu işlem, diğer tüm geçici bağlamları (agent dahil) temizler.
     */
    public setEditorContext(uri: vscode.Uri, selection: vscode.Selection, text: string, webview: vscode.Webview) {
        this.clearAll(webview, false); 
        this.activeEditorUri = uri;
        this.activeSelection = selection;
        this.activeContextText = text;
        webview.postMessage({
            type: 'contextSet',
            payload: {
                message: `Talimatınız seçili koda uygulanacaktır...`,
                code: text // Aktarılan kod içeriğini gönder
            }
        });
    }
    
    /**
     * YENİ/GÜNCELLENDİ: Agent modu için aktif dosya içeriğini ana bağlam olarak ayarlar.
     * Bu işlem, diğer manuel bağlamları temizler.
     */
    public setAgentFileContext(uri: vscode.Uri, content: string, webview: vscode.Webview) {
        // Suppressed ise hiçbir şey yapma
        if (this.agentFileSuppressed) {
            return;
        }

        // Agent modu aktif olduğunda, diğer geçici bağlamları temizle.
        this.activeEditorUri = undefined;
        this.activeSelection = undefined;
        this.activeContextText = undefined;
        this.uploadedFileContexts = [];

        this.agentFileContext = { uri, content, fileName: path.basename(uri.fsPath) };

        // Arayüzdeki dosya etiketlerini ve karakter sayacını güncelle.
        webview.postMessage({ type: 'clearContext' });
        this.notifyContextSizeChange(webview);
    }
    
    /**
     * YENİ: Agent modundayken yapılan bir metin seçimini "odaklanılmış bağlam" olarak ayarlar.
     */
    public setAgentSelectionContext(selection: vscode.Selection, content: string, webview: vscode.Webview) {
        this.agentSelectionContext = { selection, content };
        // Placeholder artık değiştirilmez; yalnızca bağlam güncellenir
    }

    /**
     * YENİ: Sadece agent modu seçim bağlamını temizler.
     */
    public clearAgentSelectionContext(webview: vscode.Webview) {
        if (this.agentSelectionContext) {
            this.agentSelectionContext = null;
            // Placeholder değiştirilmez
        }
    }
    
    /**
     * YENİ: Hem agent dosyası hem de agent seçim bağlamını temizler.
     */
    public clearAgentContexts(webview: vscode.Webview) {
        if (this.agentFileContext || this.agentSelectionContext) {
            this.agentFileContext = null;
            this.agentSelectionContext = null;
            this.notifyContextSizeChange(webview);
        }
    }

    /**
     * YENİ: Agent dosya bağlamını gizle/göster. Gizlendiğinde mevcut agent bağlamları temizlenir.
     */
    public setAgentFileSuppressed(suppressed: boolean, webview: vscode.Webview) {
        this.agentFileSuppressed = suppressed;
        if (suppressed) {
            this.clearAgentContexts(webview);
        }
    }


    /**
     * Kullanıcının seçtiği dosyaları mevcut bağlama ekler.
     */
    public async addFilesToContext(webview: vscode.Webview) {
        const fileUriArray = await vscode.window.showOpenDialog({ 
            canSelectMany: true, 
            openLabel: 'Dosyaları Ekle',
            title: 'Analiz için dosya seçin (Toplam 5 adet)'
        });

        if (!fileUriArray || fileUriArray.length === 0) {
            return;
        }

        if (this.uploadedFileContexts.length + fileUriArray.length > 5) {
            vscode.window.showErrorMessage('En fazla 5 dosya ekleyebilirsiniz.');
            return;
        }

        for (const uri of fileUriArray) {
            if (this.uploadedFileContexts.some(f => f.uri.fsPath === uri.fsPath)) {
                vscode.window.showWarningMessage(`'${path.basename(uri.fsPath)}' dosyası zaten ekli.`);
                continue;
            }

            const fileBytes = await vscode.workspace.fs.readFile(uri);
            const content = Buffer.from(fileBytes).toString('utf8');
            const fileName = path.basename(uri.fsPath);
            this.uploadedFileContexts.push({ uri, content, fileName });
        }
        
        const fileNames = this.uploadedFileContexts.map(f => f.fileName);
        webview.postMessage({ type: 'fileContextSet', fileNames: fileNames });
        this.notifyContextSizeChange(webview);
    }
    
    public removeFileContext(fileNameToRemove: string, webview: vscode.Webview) {
        this.uploadedFileContexts = this.uploadedFileContexts.filter(f => f.fileName !== fileNameToRemove);
        const fileNames = this.uploadedFileContexts.map(f => f.fileName);
        
        if (fileNames.length > 0) {
            webview.postMessage({ type: 'fileContextSet', fileNames: fileNames });
        } else {
            webview.postMessage({ type: 'clearFileContext' });
        }
        this.notifyContextSizeChange(webview);
    }

    public getAgentFileSize(): number { return 0; }

    public getUploadedFilesSize(): number { return 0; }

    /**
     * Tüm geçici bağlamları temizler.
     */
    public clearAll(webview: vscode.Webview, notifyWebview: boolean = true) {
        this.activeEditorUri = undefined;
        this.activeSelection = undefined;
        this.activeContextText = undefined;
        this.uploadedFileContexts = [];
        this.agentFileContext = null;
        this.agentSelectionContext = null; // Agent seçimini de temizle
        if (notifyWebview) {
            webview.postMessage({ type: 'clearContext' });
            this.notifyContextSizeChange(webview);
        }
    }

    private notifyContextSizeChange(webview: vscode.Webview) {
        vscode.commands.executeCommand(`${EXTENSION_ID}.requestContextSize`);
    }
}