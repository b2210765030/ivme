/* ==========================================================================
   DOSYA: src/providers/ChatViewProvider.ts (SEÇİM OLAYINA DEBOUNCE EKLENDİ)
   ========================================================================== */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { EXTENSION_ID } from '../core/constants';
import { getNonce } from '../core/utils';
import { ApiServiceManager } from '../services/manager';
import { ConversationManager } from '../features/manager/conversation';
import { MessageHandler } from '../features/Handlers/message';
import { ContextManager } from '../features/manager/context';
import { SettingsManager } from '../features/manager/settings';
import { WebviewMessageHandler } from '../features/Handlers/webview_message';
import { setPendingSelection, clearPendingSelection } from '../core/pending_selection';
import { ivmeSelectionCodeLensProvider } from './codelens';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = `${EXTENSION_ID}.chatView`;
    private _view?: vscode.WebviewView;
    public isAgentModeActive: boolean = false;

    // YENİ: Debounce için bir zamanlayıcı değişkeni
    private selectionDebounce: NodeJS.Timeout | undefined = undefined;

    // YENİ: Kullanıcı onayı bekleyen seçim
    private pendingAgentSelection: {
        start: vscode.Position;
        end: vscode.Position;
        content: string;
        fileName: string;
    } | null = null;

    private conversationManager: ConversationManager;
    private contextManager: ContextManager;
    private settingsManager: SettingsManager;
    
    private messageHandler?: MessageHandler; 
    private webviewMessageHandler?: WebviewMessageHandler;

    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly apiManager: ApiServiceManager
    ) {
        this.conversationManager = new ConversationManager(_context);
        this.contextManager = new ContextManager();
        this.settingsManager = new SettingsManager();

        // Extension açılışında kaydedilmiş mod durumunu yükle
        this.loadSavedAgentMode();
        
        // Workspace indexing durumunu kontrol et
        this.checkWorkspaceIndexingStatus();

        this._context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                this.handleEditorChange(editor);
            }),
            vscode.window.onDidChangeTextEditorSelection(event => {
                // Her seçimde doğrudan çalıştırmak yerine debouncer'ı çağır.
                this.debouncedHandleSelectionChange(event);
            }),
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                // Workspace değiştiğinde indexing durumunu kontrol et
                this.checkWorkspaceIndexingStatus();
            })
        );
    }

    private loadSavedAgentMode() {
        const savedAgentMode = this.settingsManager.getAgentModeState();
        this.isAgentModeActive = savedAgentMode;
    }

    private loadSavedAgentBarState() {
        const savedAgentBarExpanded = this.settingsManager.getAgentBarExpandedState();
        return savedAgentBarExpanded;
    }
    
    public setAgentMode(isActive: boolean): void {
        this.isAgentModeActive = isActive;
        
        // Mod durumunu kalıcı olarak kaydet
        this.settingsManager.saveAgentModeState(isActive);
        
        if (!isActive && this._view) {
            // Chat moduna geçildiğinde agent bağlamlarını temizle
            this.contextManager.clearAgentContexts(this._view.webview);
            // Agent bağlam barını gizle
            this._view.webview.postMessage({
                type: 'updateAgentStatus',
                payload: { isActive: false }
            });
        }
        this.handleEditorChange(vscode.window.activeTextEditor);
    }
    
    public handleEditorChange(editor: vscode.TextEditor | undefined) {
        if (!this._view) return;

        if (this.isAgentModeActive && editor) {
            const document = editor.document;
            const fileName = path.basename(document.fileName);
            const fileContent = document.getText();
            
            // Dosya bağlamını her zaman yükle, suppressed durumuna göre UI'da göster/gizle
            this.contextManager.setAgentFileContext(document.uri, fileContent, this._view.webview);

            this._view.webview.postMessage({
                type: 'updateAgentStatus',
                payload: this.contextManager.agentFileSuppressed
                    ? { isActive: true, activeFileName: '' }
                    : { isActive: true, activeFileName: fileName }
            });

        } else if (this.isAgentModeActive && !editor) {
            this.contextManager.clearAgentContexts(this._view.webview);
            this._view.webview.postMessage({
                type: 'updateAgentStatus',
                payload: {
                    isActive: true,
                    activeFileName: 'Aktif dosya yok'
                }
            });
        }
    }

    /**
     * YENİ: Debounce (Sakinleştirme) mekanizması.
     * Seçim olayı sürekli tetiklendiğinde işlemi erteleyip sadece sonuncuyu çalıştırır.
     */
    private debouncedHandleSelectionChange(event: vscode.TextEditorSelectionChangeEvent) {
        // Önceki zamanlayıcıyı temizle
        if (this.selectionDebounce) {
            clearTimeout(this.selectionDebounce);
        }
        // Yeni bir zamanlayıcı başlat
        this.selectionDebounce = setTimeout(() => {
            this.handleSelectionChange(event);
        }, 300); // Kullanıcı seçimi bıraktıktan 300ms sonra çalışacak
    }

    private handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent) {
        if (!this._view || !this.isAgentModeActive || !event.textEditor) {
            return;
        }
        
        const selection = event.selections[0];
        if (selection && !selection.isEmpty) {
            const selectedText = event.textEditor.document.getText(selection);
            const fileName = path.basename(event.textEditor.document.fileName);
            this.pendingAgentSelection = {
                start: selection.start,
                end: selection.end,
                content: selectedText,
                fileName
            };
            setPendingSelection(event.textEditor.document.uri, selection, fileName, selectedText);
            ivmeSelectionCodeLensProvider.refresh();
            // Artık öneri mesajı webview'e gönderilmiyor; hover ve CodeLens ile kullanıcı onayı alınacak
        } else {
            this.pendingAgentSelection = null;
            clearPendingSelection(event.textEditor.document.uri);
            ivmeSelectionCodeLensProvider.refresh();
            // Webview'e öneri temizleme mesajı gönderilmiyor
        }
    }

    // YENİ: Önerilen seçimi onaylayıp bağlama uygular
    public applyPendingSelection() {
        if (!this._view || !this.isAgentModeActive || !this.pendingAgentSelection) return;
        const { start, end, content, fileName } = this.pendingAgentSelection;
        const selection = new vscode.Selection(start, end);
        this.contextManager.setAgentSelectionContext(selection, content, this._view.webview);
        this._view.webview.postMessage({
            type: 'agentSelectionSet',
            payload: {
                fileName,
                startLine: start.line + 1,
                endLine: end.line + 1
            }
        });
        this.pendingAgentSelection = null;
        ivmeSelectionCodeLensProvider.refresh();
    }

    // YENİ: Önerilen seçimi iptal eder (uygulanmış seçimi etkilemez)
    public cancelPendingSelection() {
        this.pendingAgentSelection = null;
        ivmeSelectionCodeLensProvider.refresh();
    }

    // ... dosyanın geri kalanı aynı ...
    public requestContextSizeUpdate() {
        if (this.webviewMessageHandler) {
            this.webviewMessageHandler.sendContextSize();
        }
    }
    
    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._context.extensionUri, 'webview-ui')
            ]
        };
        
        this.messageHandler = new MessageHandler(this.conversationManager, this.apiManager, this.contextManager, webviewView.webview);
        this.webviewMessageHandler = new WebviewMessageHandler(
            this,
            this.messageHandler,
            this.conversationManager,
            this.contextManager,
            this.settingsManager,
            webviewView.webview
        );

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            await this.webviewMessageHandler?.handleMessage(data);
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.webviewMessageHandler?.handleMessage({ type: 'requestContextSize' });
                this.webviewMessageHandler?.sendIndexingStatus();
            }
        });

        // Webview açıldığında kaydedilmiş mod durumunu gönder
        this.sendSavedAgentModeToWebview();
        
        // Workspace bilgisini gönder
        this.sendWorkspaceInfoToWebview();
    }

    private sendSavedAgentModeToWebview() {
        if (this._view) {
            const savedAgentBarExpanded = this.loadSavedAgentBarState();
            
            // Agent bar durumunu context manager'a bildir
            this.contextManager.agentFileSuppressed = !savedAgentBarExpanded;
            
            this._view.webview.postMessage({
                type: 'restoreAgentMode',
                payload: { 
                    isActive: this.isAgentModeActive,
                    isBarExpanded: savedAgentBarExpanded
                }
            });
            
            // Agent modu aktifse ve aktif editör varsa dosya bağlamını yükle
            if (this.isAgentModeActive) {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    this.handleEditorChange(activeEditor);
                }
            }
        }
    }

    private sendWorkspaceInfoToWebview() {
        if (this._view) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                this._view.webview.postMessage({
                    type: 'workspaceInfo',
                    payload: { 
                        workspaceName: workspaceFolder.name
                    }
                });
            }
        }
    }

    private async checkWorkspaceIndexingStatus() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            // Workspace yoksa indexing'i kapat
            await this.settingsManager.saveIndexingEnabled(false);
            return;
        }

        // Workspace'de indexing dosyası var mı kontrol et
        const ivmeDir = vscode.Uri.joinPath(workspaceFolder.uri, '.ivme');
        const vectorStorePath = vscode.Uri.joinPath(ivmeDir, 'vector_store.json');

        try {
            await vscode.workspace.fs.stat(vectorStorePath);
            // Dosya varsa, önceki indexing durumunu koru
            console.log(`[ChatViewProvider] Indexing dosyası bulundu: ${vectorStorePath.fsPath}`);
        } catch (e) {
            // Dosya yoksa indexing'i kapat
            console.log(`[ChatViewProvider] Indexing dosyası bulunamadı, indexing kapatılıyor: ${vectorStorePath.fsPath}`);
            await this.settingsManager.saveIndexingEnabled(false);
        }

        // Webview'a güncel durumu gönder
        if (this._view) {
            this.webviewMessageHandler?.sendIndexingStatus();
        }
    }
    
    public setActiveContext(uri: vscode.Uri, selection: vscode.Selection, text: string) {
        if (this._view) {
            this.contextManager.setEditorContext(uri, selection, text, this._view.webview);
        }
    }
    
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const toUri = (filePath: string) => {
            const uri = vscode.Uri.joinPath(this._context.extensionUri, 'webview-ui', filePath);
            const webviewUri = webview.asWebviewUri(uri);
            // Cache busting için timestamp ekle
            return webviewUri.toString() + '?v=' + Date.now();
        };
        const htmlPath = path.join(this._context.extensionUri.fsPath, 'webview-ui', 'chat.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        const nonce = getNonce();

        return htmlContent
            .replace(/{{cspSource}}/g, webview.cspSource)
            .replace(/{{nonce}}/g, nonce)
            .replace(/{{chat_css_uri}}/g, toUri('css/chat.css').toString())
            .replace(/{{highlight_css_uri}}/g, toUri('css/vendor/github-dark.min.css').toString())
            .replace(/{{chat_js_uri}}/g, toUri('js/core/app.js').toString())
            .replace(/{{diff_js_uri}}/g, toUri('js/vendor/diff.min.js').toString())
            .replace(/{{marked_js_uri}}/g, toUri('js/vendor/marked.min.js').toString())
            .replace(/{{highlight_js_uri}}/g, toUri('js/vendor/highlight.min.js').toString())
            .replace(/{{ai_icon_uri}}/g, toUri('assets/baykar-icon.svg').toString())
            .replace(/{{user_icon_uri}}/g, toUri('assets/BaykarLogo.svg').toString())
            .replace(/{{logo_uri}}/g, toUri('assets/BaykarLogo.svg').toString())
            .replace(/{{send_icon_uri}}/g, toUri('assets/send.svg').toString())
            .replace(/{{attach_icon_uri}}/g, toUri('assets/attach.svg').toString())
            .replace(/{{index_icon_uri}}/g, toUri('assets/index.svg').toString())
            .replace(/{{settings_icon_uri}}/g, toUri('assets/settings-icon.svg').toString())
            .replace(/{{feedback_icon_uri}}/g, toUri('assets/feedback-icon.svg').toString())
            .replace(/{{history_icon_uri}}/g, toUri('assets/history-icon.svg').toString())
            .replace(/{{new_chat_icon_uri}}/g, toUri('assets/new-chat-icon.svg').toString())
            .replace(/{{welcome_video_uri}}/g, toUri('assets/intro.mp4').toString())
            .replace(/{{agent_icon_uri}}/g, toUri('assets/agent.svg').toString())
            // Yeni: Planner adım aksiyon ikonları
            .replace(/{{edit_icon_uri}}/g, toUri('assets/duzenle.svg').toString())
            .replace(/{{apply_icon_uri}}/g, toUri('assets/uygula.svg').toString());
    }
}