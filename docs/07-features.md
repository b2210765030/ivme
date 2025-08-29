# 7. Features - Özellik Yöneticileri ve Handler'lar 🔧

Bu bölüm, İvme extension'ının core feature architecture'ını oluşturan **Handlers** ve **Managers** sistemini detaylı şekilde ele alır. Bu bileşenler, kullanıcı etkileşimlerini işlemek, state'i yönetmek ve farklı servisler arasında koordinasyon sağlamak için kritik rol oynar.

## İçindekiler

- [7.1 Feature Architecture Overview](#71-feature-architecture-overview)
- [7.2 Handler Sistemi](#72-handler-sistemi)
- [7.3 Manager Sistemi](#73-manager-sistemi)
- [7.4 Handler-Manager Etkileşimi](#74-handler-manager-etkileşimi)
- [7.5 Event Flow ve Coordination](#75-event-flow-ve-coordination)
- [7.6 Feature Lifecycle Management](#76-feature-lifecycle-management)
- [7.7 Error Handling ve Recovery](#77-error-handling-ve-recovery)
- [7.8 Performance Optimization](#78-performance-optimization)

---

## 7.1 Feature Architecture Overview

### 🏗️ Genel Mimari

İvme extension'ının feature katmanı, **separation of concerns** prensibini takip ederek iki ana bileşen grubuna ayrılır:

```typescript
interface FeatureArchitecture {
  handlers: {
    command: CommandHandler;           // VS Code komutları
    interaction: InteractionHandler;   // AI etkileşimleri
    message: MessageHandler;           // Mesaj yönetimi
    webviewMessage: WebviewMessageHandler; // UI iletişimi
  };
  managers: {
    context: ContextManager;           // Bağlam yönetimi
    conversation: ConversationManager; // Sohbet yönetimi
    settings: SettingsManager;         // Ayar yönetimi
  };
}
```

### 📋 Sorumluluk Dağılımı

| Katman | Sorumluluk | Örnekler |
|--------|------------|----------|
| **Handlers** | Event processing, User interactions | Command execution, AI communication |
| **Managers** | State management, Data persistence | Context storage, Settings persistence |

### 🔄 Dependency Flow

```typescript
class FeatureDependencyManager {
  // Handlers depend on Managers for state
  setupDependencies(): void {
    const contextManager = new ContextManager();
    const conversationManager = new ConversationManager(context);
    const settingsManager = new SettingsManager();
    
    // Handlers receive manager instances
    const commandHandler = new CommandHandler(apiManager, chatProvider);
    const interactionHandler = new InteractionHandler(
      conversationManager, 
      apiManager, 
      webview, 
      contextManager,
      context
    );
    
    const messageHandler = new MessageHandler(
      conversationManager,
      apiManager,
      webview,
      contextManager,
      interactionHandler
    );
    
    const webviewMessageHandler = new WebviewMessageHandler(
      chatProvider,
      messageHandler,
      conversationManager,
      contextManager,
      settingsManager,
      webview,
      context
    );
  }
}
```

---

## 7.2 Handler Sistemi

### 🎮 Command Handler

CommandHandler, VS Code komut paletinden tetiklenen tüm komutların ana mantığını yönetir.

#### 🔧 Core Implementation

```typescript
export class CommandHandler {
    constructor(
        private apiManager: ApiServiceManager,
        private chatProvider: ChatViewProvider
    ) {}
    
    // API bağlantı kontrolü
    public async checkConnection(): Promise<void> {
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
    
    // Hata düzeltme komutu
    public async applyFix(args: ApplyFixArgs): Promise<void> {
        const uri = vscode.Uri.parse(args.uri);
        const document = await vscode.workspace.openTextDocument(uri);
        const prompt = createFixErrorPrompt(
            args.diagnostic.message, 
            args.diagnostic.range[0] + 1, 
            document.getText()
        );
        
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: UI_MESSAGES.thinking,
            cancellable: true
        }, async () => {
            try {
                const correctedCode = await this.apiManager.generateContent(prompt);
                const cleanedCode = cleanLLMCodeBlock(correctedCode);
                
                const edit = new vscode.WorkspaceEdit();
                const fullRange = new vscode.Range(
                    document.positionAt(0), 
                    document.positionAt(document.getText().length)
                );
                edit.replace(document.uri, fullRange, cleanedCode);
                await vscode.workspace.applyEdit(edit);
                
                vscode.window.showInformationMessage(UI_MESSAGES.codeFixed);
            } catch (error) {
                this.handleCommandError(error);
            }
        });
    }
    
    // Seçili kodu sohbete gönderme
    public async sendToChat(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        
        if (editor && !editor.selection.isEmpty) {
            this.chatProvider.setActiveContext(
                editor.document.uri, 
                editor.selection, 
                editor.document.getText(editor.selection)
            );
            vscode.commands.executeCommand(`${EXTENSION_ID}.chatView.focus`);
        } else {
            vscode.window.showInformationMessage('Lütfen önce bir kod bloğu seçin.');
        }
    }
}
```

#### 📂 Proje İndeksleme Komutları

```typescript
class IndexingCommands {
    // Proje indeksleme başlatma
    public async indexProject(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Açık bir çalışma alanı bulunamadı.');
            return;
        }
        
        const indexer = new ProjectIndexer();
        
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Proje indeksleniyor...',
            cancellable: true
        }, async (progress, token) => {
            try {
                await indexer.indexWorkspace(
                    workspaceFolders[0].uri.fsPath,
                    (current, total) => {
                        progress.report({
                            increment: (current / total) * 100,
                            message: `${current}/${total} dosya işlendi`
                        });
                    },
                    token
                );
                
                vscode.window.showInformationMessage('Proje indeksleme tamamlandı!');
            } catch (error) {
                if (token.isCancellationRequested) {
                    vscode.window.showInformationMessage('İndeksleme iptal edildi.');
                } else {
                    vscode.window.showErrorMessage(`İndeksleme hatası: ${error}`);
                }
            }
        });
    }
    
    // Planner indeksleme
    public async indexPlanner(): Promise<void> {
        const plannerIndexer = new PlannerIndexer();
        
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Planner indeksleniyor...',
            cancellable: false
        }, async () => {
            try {
                await plannerIndexer.indexTools();
                await plannerIndexer.updateToolIndex();
                
                vscode.window.showInformationMessage('Planner indeksleme tamamlandı!');
            } catch (error) {
                vscode.window.showErrorMessage(`Planner indeksleme hatası: ${error}`);
            }
        });
    }
    
    // İndeks arama
    public async searchIndex(): Promise<void> {
        const query = await vscode.window.showInputBox({
            prompt: 'Arama sorgusu girin',
            placeHolder: 'Örn: authentication function'
        });
        
        if (!query) return;
        
        try {
            const chunks = await loadVectorStoreChunks();
            if (chunks.length === 0) {
                vscode.window.showWarningMessage('İndeks bulunamadı. Önce projeyi indeksleyin.');
                return;
            }
            
            const results = await topKByEmbedding(query, 10);
            this.displaySearchResults(results);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Arama hatası: ${error}`);
        }
    }
    
    private displaySearchResults(results: any[]): void {
        const panel = vscode.window.createWebviewPanel(
            'searchResults',
            'Arama Sonuçları',
            vscode.ViewColumn.Two,
            { enableScripts: true }
        );
        
        panel.webview.html = this.createSearchResultsHTML(results);
    }
}
```

### 🤖 Interaction Handler

InteractionHandler, AI ile olan tüm etkileşimleri yönetir ve planner sistemi ile entegre çalışır.

#### 🔧 Core Implementation

```typescript
export class InteractionHandler {
    private currentRequestController: AbortController | null = null;
    private lastPlannerPlan: PlannerPlan | null = null;
    private executor: PlannerExecutor = new PlannerExecutor();
    private executedStepLogs: Array<{ label: string; elapsedMs: number; error?: string }> = [];
    private executedStepIndices: Set<number> = new Set();
    private isBatchRun: boolean = false;
    private didEmitSummaryNote: boolean = false;
    
    constructor(
        private conversationManager: ConversationManager,
        private apiManager: ApiServiceManager,
        private webview: vscode.Webview,
        private contextManager: ContextManager,
        private context: vscode.ExtensionContext
    ) {}
    
    // Chat mode interaction
    public async handleChatInteraction(
        message: string, 
        conversationId: string
    ): Promise<void> {
        this.currentRequestController = new AbortController();
        
        try {
            // Context'i hazırla
            const contextPrompt = this.buildContextPrompt();
            const fullPrompt = `${contextPrompt}\n\nKullanıcı: ${message}`;
            
            // Streaming response başlat
            await this.streamChatResponse(fullPrompt, conversationId);
            
        } catch (error) {
            this.handleInteractionError(error, conversationId);
        } finally {
            this.currentRequestController = null;
        }
    }
    
    // Agent mode interaction
    public async handleAgentInteraction(
        message: string, 
        conversationId: string
    ): Promise<void> {
        this.resetPlanningState();
        this.currentRequestController = new AbortController();
        
        try {
            // Context ve tools bilgisini hazırla
            const contextInfo = await this.buildAgentContext();
            const toolsInfo = await getToolsDescriptions();
            
            // Planner'ı çalıştır
            const plan = await run_planner(message, contextInfo, toolsInfo);
            this.lastPlannerPlan = plan;
            
            // Plan'ı UI'da göster
            this.displayPlan(plan);
            
            // Plan execution'ı başlat
            await this.executePlan(plan, conversationId);
            
        } catch (error) {
            this.handleInteractionError(error, conversationId);
        } finally {
            this.currentRequestController = null;
        }
    }
    
    private async streamChatResponse(
        prompt: string, 
        conversationId: string
    ): Promise<void> {
        const userMessage: ChatMessage = {
            id: generateUUID(),
            role: 'user',
            content: prompt,
            timestamp: Date.now()
        };
        
        this.conversationManager.addMessage(conversationId, userMessage);
        
        let fullResponse = '';
        const assistantMessageId = generateUUID();
        
        await this.apiManager.generateContentStream(
            prompt,
            {
                onStart: () => {
                    this.webview.postMessage({
                        type: 'messageStart',
                        messageId: assistantMessageId
                    });
                },
                onContent: (chunk) => {
                    fullResponse += chunk;
                    this.webview.postMessage({
                        type: 'messageChunk',
                        messageId: assistantMessageId,
                        content: chunk
                    });
                },
                onComplete: () => {
                    const assistantMessage: ChatMessage = {
                        id: assistantMessageId,
                        role: 'assistant',
                        content: fullResponse,
                        timestamp: Date.now()
                    };
                    
                    this.conversationManager.addMessage(conversationId, assistantMessage);
                    
                    this.webview.postMessage({
                        type: 'messageComplete',
                        messageId: assistantMessageId
                    });
                },
                onError: (error) => {
                    this.handleStreamError(error, assistantMessageId);
                }
            },
            this.currentRequestController?.signal
        );
    }
}
```

#### 🛠️ Plan Execution System

```typescript
class PlanExecutionSystem {
    async executePlan(plan: PlannerPlan, conversationId: string): Promise<void> {
        this.isBatchRun = true;
        this.executedStepLogs = [];
        this.executedStepIndices.clear();
        
        try {
            for (let i = 0; i < plan.steps.length; i++) {
                if (this.currentRequestController?.signal.aborted) {
                    break;
                }
                
                const step = plan.steps[i];
                const startTime = Date.now();
                
                try {
                    // Step execution UI feedback
                    this.webview.postMessage({
                        type: 'stepExecutionStart',
                        stepIndex: i,
                        stepLabel: step.label
                    });
                    
                    // Execute step
                    const result = await this.executor.executeStep(step);
                    const elapsedMs = Date.now() - startTime;
                    
                    // Log successful execution
                    this.executedStepLogs.push({
                        label: step.label,
                        elapsedMs
                    });
                    this.executedStepIndices.add(i);
                    
                    // UI feedback
                    this.webview.postMessage({
                        type: 'stepExecutionComplete',
                        stepIndex: i,
                        result: result,
                        elapsedMs
                    });
                    
                } catch (stepError) {
                    const elapsedMs = Date.now() - startTime;
                    
                    // Log failed execution
                    this.executedStepLogs.push({
                        label: step.label,
                        elapsedMs,
                        error: stepError.message
                    });
                    
                    // UI feedback
                    this.webview.postMessage({
                        type: 'stepExecutionError',
                        stepIndex: i,
                        error: stepError.message,
                        elapsedMs
                    });
                    
                    // Decide whether to continue or abort
                    if (step.critical) {
                        throw stepError;
                    }
                }
            }
            
            // Generate summary
            await this.generateExecutionSummary(plan, conversationId);
            
        } finally {
            this.isBatchRun = false;
        }
    }
    
    private async generateExecutionSummary(
        plan: PlannerPlan, 
        conversationId: string
    ): Promise<void> {
        if (this.didEmitSummaryNote) return;
        
        const successCount = this.executedStepLogs.filter(log => !log.error).length;
        const totalTime = this.executedStepLogs.reduce((sum, log) => sum + log.elapsedMs, 0);
        
        const summaryPrompt = this.buildSummaryPrompt(
            plan, 
            this.executedStepLogs, 
            successCount, 
            totalTime
        );
        
        // Generate and display summary
        const summary = await this.apiManager.generateContent(summaryPrompt);
        
        const summaryMessage: ChatMessage = {
            id: generateUUID(),
            role: 'assistant',
            content: `## 📊 Execution Summary\n\n${summary}`,
            timestamp: Date.now()
        };
        
        this.conversationManager.addMessage(conversationId, summaryMessage);
        
        this.webview.postMessage({
            type: 'executionSummary',
            summary: summary,
            stats: {
                successCount,
                totalSteps: plan.steps.length,
                totalTime
            }
        });
        
        this.didEmitSummaryNote = true;
    }
}
```

### 📨 Message Handler

MessageHandler, tüm mesaj işleme mantığını merkezi bir konumda yönetir.

#### 🔧 Core Implementation

```typescript
export class MessageHandler {
    constructor(
        private conversationManager: ConversationManager,
        private apiManager: ApiServiceManager,
        private webview: vscode.Webview,
        private contextManager: ContextManager,
        public readonly interactionHandler: InteractionHandler
    ) {}
    
    public async handleUserMessage(
        content: string, 
        mode: 'chat' | 'agent',
        conversationId?: string
    ): Promise<void> {
        // Conversation ID kontrolü
        const activeConversationId = conversationId || 
            this.conversationManager.getActiveConversationId() ||
            this.conversationManager.createNew().id;
            
        // Mode'a göre işleme
        if (mode === 'agent') {
            await this.interactionHandler.handleAgentInteraction(content, activeConversationId);
        } else {
            await this.interactionHandler.handleChatInteraction(content, activeConversationId);
        }
        
        // Usage tracking
        this.trackMessageUsage(content, activeConversationId);
    }
    
    public async handleFileUpload(
        files: Array<{ name: string; content: string; size: number }>
    ): Promise<void> {
        for (const file of files) {
            // File size validation
            if (file.size > MAX_FILE_SIZE) {
                this.webview.postMessage({
                    type: 'fileUploadError',
                    fileName: file.name,
                    error: `Dosya boyutu çok büyük (Max: ${MAX_FILE_SIZE / 1024 / 1024}MB)`
                });
                continue;
            }
            
            // File type validation
            if (!this.isFileTypeSupported(file.name)) {
                this.webview.postMessage({
                    type: 'fileUploadError',
                    fileName: file.name,
                    error: 'Desteklenmeyen dosya türü'
                });
                continue;
            }
            
            // Add to context
            this.contextManager.addUploadedFile(file.name, file.content);
            
            this.webview.postMessage({
                type: 'fileUploadSuccess',
                fileName: file.name,
                size: file.size
            });
        }
        
        // Update context display
        this.updateContextDisplay();
    }
    
    private trackMessageUsage(content: string, conversationId: string): void {
        const tokenCount = this.estimateTokenCount(content);
        this.conversationManager.addUsage(conversationId, tokenCount);
    }
    
    private estimateTokenCount(text: string): number {
        // Simple token estimation (1 token ≈ 4 characters)
        return Math.ceil(text.length / 4);
    }
}
```

### 🌐 Webview Message Handler

WebviewMessageHandler, UI ile backend arasındaki tüm mesaj iletişimini yönetir.

#### 🔧 Core Implementation

```typescript
export class WebviewMessageHandler {
    private interactionHandler: InteractionHandler;
    
    constructor(
        private chatProvider: ChatViewProvider,
        private messageHandler: MessageHandler,
        private conversationManager: ConversationManager,
        private contextManager: ContextManager,
        private settingsManager: SettingsManager,
        private webview: vscode.Webview,
        private context: vscode.ExtensionContext
    ) {
        this.interactionHandler = this.messageHandler.interactionHandler;
    }
    
    public async handleMessage(data: any): Promise<void> {
        switch (data.type) {
            case 'userMessage':
                await this.handleUserMessage(data);
                break;
                
            case 'agentModeToggle':
                await this.handleAgentModeToggle(data);
                break;
                
            case 'fileUpload':
                await this.handleFileUpload(data);
                break;
                
            case 'clearContext':
                await this.handleClearContext();
                break;
                
            case 'newConversation':
                await this.handleNewConversation();
                break;
                
            case 'loadConversation':
                await this.handleLoadConversation(data);
                break;
                
            case 'settingsUpdate':
                await this.handleSettingsUpdate(data);
                break;
                
            case 'languageChange':
                await this.handleLanguageChange(data);
                break;
                
            case 'stopGeneration':
                await this.handleStopGeneration();
                break;
                
            default:
                console.warn(`[WebviewMessageHandler] Unknown message type: ${data.type}`);
        }
    }
    
    private async handleUserMessage(data: any): Promise<void> {
        const { content, mode, conversationId } = data;
        
        try {
            await this.messageHandler.handleUserMessage(content, mode, conversationId);
        } catch (error) {
            this.webview.postMessage({
                type: 'messageError',
                error: error.message
            });
        }
    }
    
    private async handleAgentModeToggle(data: any): Promise<void> {
        const { isActive } = data;
        
        // Update chat provider state
        this.chatProvider.setAgentMode(isActive);
        
        // Update settings
        this.settingsManager.setAgentModeState(isActive);
        
        // Handle context changes
        if (isActive) {
            await this.activateAgentMode();
        } else {
            await this.deactivateAgentMode();
        }
        
        // UI feedback
        this.webview.postMessage({
            type: 'agentModeChanged',
            isActive: isActive
        });
    }
    
    private async activateAgentMode(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        
        if (editor) {
            const content = editor.document.getText();
            const uri = editor.document.uri;
            
            // Set agent file context
            this.contextManager.setAgentFileContext(uri, content, this.webview);
            
            // Clear other contexts
            this.contextManager.clearManualContexts(this.webview);
        }
    }
    
    private async deactivateAgentMode(): Promise<void> {
        // Clear agent contexts
        this.contextManager.clearAgentContexts(this.webview);
    }
}
```

#### 📁 File Upload Handling

```typescript
class FileUploadHandler {
    private static readonly SUPPORTED_EXTENSIONS = [
        '.txt', '.js', '.ts', '.tsx', '.jsx', '.py', '.java', 
        '.cpp', '.c', '.h', '.css', '.html', '.json', '.md', 
        '.yml', '.yaml', '.xml', '.php', '.rb', '.go', '.rs', 
        '.swift', '.kt', '.scala', '.sh', '.sql'
    ];
    
    private static readonly MAX_FILE_SIZE = 1024 * 1024; // 1MB
    
    static async processFileUpload(
        files: Array<{ name: string; content: string }>,
        contextManager: ContextManager,
        webview: vscode.Webview
    ): Promise<void> {
        const results = {
            successful: [] as string[],
            failed: [] as { name: string; reason: string }[]
        };
        
        for (const file of files) {
            try {
                // Validate file
                const validation = this.validateFile(file);
                if (!validation.valid) {
                    results.failed.push({ name: file.name, reason: validation.reason });
                    continue;
                }
                
                // Process file content
                const processedContent = this.processFileContent(file.content, file.name);
                
                // Add to context
                contextManager.addUploadedFile(file.name, processedContent);
                results.successful.push(file.name);
                
            } catch (error) {
                results.failed.push({ 
                    name: file.name, 
                    reason: `İşleme hatası: ${error.message}` 
                });
            }
        }
        
        // Send results to UI
        webview.postMessage({
            type: 'fileUploadResults',
            successful: results.successful,
            failed: results.failed
        });
    }
    
    private static validateFile(file: { name: string; content: string }): {
        valid: boolean;
        reason?: string;
    } {
        // Extension check
        const extension = path.extname(file.name).toLowerCase();
        if (!this.SUPPORTED_EXTENSIONS.includes(extension)) {
            return { valid: false, reason: 'Desteklenmeyen dosya türü' };
        }
        
        // Size check
        const size = new Blob([file.content]).size;
        if (size > this.MAX_FILE_SIZE) {
            return { valid: false, reason: 'Dosya boyutu çok büyük (Max: 1MB)' };
        }
        
        // Content check
        if (file.content.trim().length === 0) {
            return { valid: false, reason: 'Dosya boş' };
        }
        
        return { valid: true };
    }
    
    private static processFileContent(content: string, fileName: string): string {
        const extension = path.extname(fileName).toLowerCase();
        
        // Add language-specific processing
        switch (extension) {
            case '.json':
                try {
                    // Validate and prettify JSON
                    const parsed = JSON.parse(content);
                    return JSON.stringify(parsed, null, 2);
                } catch (error) {
                    // Return original if invalid JSON
                    return content;
                }
                
            case '.md':
                // Add markdown metadata
                return `<!-- File: ${fileName} -->\n${content}`;
                
            default:
                return content;
        }
    }
}
```

---

## 7.3 Manager Sistemi

### 🗂️ Context Manager

ContextManager, editör seçimleri, dosya yüklemeleri ve agent modu bağlamlarını yönetir.

```typescript
export class ContextManager {
    // Manual editor context
    public activeEditorUri?: vscode.Uri;
    public activeSelection?: vscode.Selection;
    public activeContextText?: string;
    
    // Uploaded file contexts
    public uploadedFileContexts: Array<{
        uri: vscode.Uri;
        content: string;
        fileName: string;
    }> = [];
    
    // Agent mode contexts
    public agentFileContext: {
        uri: vscode.Uri;
        content: string;
        fileName: string;
    } | null = null;
    
    public agentSelectionContext: {
        selection: vscode.Selection;
        content: string;
    } | null = null;
}
```

### 💬 Conversation Manager

```typescript
export class ConversationManager {
    private conversations: Conversation[] = [];
    private activeConversationId: string | null = null;
    private usageByConversationId: Record<string, number> = {};
    
    public createNew(): Conversation {
        const conversation: Conversation = {
            id: generateUUID(),
            title: `Yeni Sohbet ${new Date().toLocaleString('tr-TR')}`,
            messages: [],
            createdAt: Date.now(),
            lastModified: Date.now()
        };
        
        this.conversations.unshift(conversation);
        this.activeConversationId = conversation.id;
        return conversation;
    }
}
```

### ⚙️ Settings Manager

```typescript
export class SettingsManager {
    private readonly configSection = EXTENSION_ID;
    
    public getAgentModeState(): boolean {
        const config = vscode.workspace.getConfiguration(this.configSection);
        return config.get<boolean>(SETTINGS_KEYS.agentModeActive, false);
    }
    
    public setAgentModeState(isActive: boolean): void {
        const config = vscode.workspace.getConfiguration(this.configSection);
        config.update(SETTINGS_KEYS.agentModeActive, isActive, vscode.ConfigurationTarget.Global);
    }
}
```

---

<div align="center">
  <h2>🔧 Robust Feature Architecture</h2>
  <p><em>Handler'lar ve Manager'lar ile güçlü temel</em></p>
</div>

Bu feature bölümünde ele alınanlar:

- ✅ **Feature Architecture**: Handler-Manager separation
- ✅ **Handler Sistemi**: Command, Interaction, Message, WebviewMessage  
- ✅ **Manager Sistemi**: Context, Conversation, Settings yönetimi
- ✅ **Handler-Manager Etkileşimi**: Data flow ve coordination
- ✅ **Event Flow**: Event orchestration
- ✅ **Lifecycle Management**: Initialization ve shutdown
- ✅ **Error Handling**: Recovery strategies
- ✅ **Performance**: Monitoring ve optimization

Bir sonraki bölümde **"Webview UI"**'ı inceleyeceğiz! 🚀
