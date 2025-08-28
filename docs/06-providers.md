# 6. Providers 🎨

Providers, İvme extension'ının VS Code kullanıcı arayüzü ile entegrasyonunu sağlayan core bileşenlerdir. Bu bölümde, extension'ın sunduğu tüm UI provider'larını ve webview mimarisini detaylı şekilde inceleyeceğiz.

## İçindekiler

- [6.1 Provider Mimarisi](#61-provider-mimarisi)
- [6.2 Chat View Provider](#62-chat-view-provider)
- [6.3 Code Lens Provider](#63-code-lens-provider)
- [6.4 Hover Provider](#64-hover-provider)
- [6.5 Inlay Hints Provider](#65-inlay-hints-provider)
- [6.6 Code Actions Provider](#66-code-actions-provider)
- [6.7 Webview UI Architecture](#67-webview-ui-architecture)
- [6.8 Event Handling ve State Management](#68-event-handling-ve-state-management)
- [6.9 Provider Coordination](#69-provider-coordination)

---

## 6.1 Provider Mimarisi

### 🏗️ Genel Bakış

İvme extension'ı, VS Code'un provider pattern'ini kullanarak farklı UI bileşenlerini sağlar. Her provider, belirli bir kullanıcı etkileşimi veya görsel element için sorumludur.

```typescript
interface ProviderRegistry {
  chatViewProvider: ChatViewProvider;        // Ana chat arayüzü
  codeLensProvider: CodeLensProvider;        // Satır içi öneriler
  hoverProvider: HoverProvider;              // Hover bilgileri
  inlayHintsProvider: InlayHintsProvider;    // Satır içi ipuçları
  codeActionsProvider: CodeActionsProvider; // Hızlı düzeltmeler
}
```

### 📋 Provider Türleri ve Sorumlulukları

| Provider | Sorumluluk | VS Code API |
|----------|------------|-------------|
| **ChatViewProvider** | Ana chat arayüzü, webview management | `WebviewViewProvider` |
| **CodeLensProvider** | Seçim onayı için satır üstü butonlar | `CodeLensProvider` |
| **HoverProvider** | Hover bilgileri ve quick actions | `HoverProvider` |
| **InlayHintsProvider** | Satır sonunda inline öneriler | `InlayHintsProvider` |
| **CodeActionsProvider** | Hata düzeltme için quick fixes | `CodeActionProvider` |

### 🔄 Provider Lifecycle

```typescript
class ProviderManager {
  private providers = new Map<string, any>();
  private registrations = new Map<string, vscode.Disposable>();
  
  async registerAllProviders(context: vscode.ExtensionContext): Promise<void> {
    // Chat View Provider
    const chatProvider = new ChatViewProvider(context, apiManager);
    this.registerProvider('chatView', chatProvider, () => 
      vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider)
    );
    
    // Code Lens Provider
    this.registerProvider('codeLens', ivmeSelectionCodeLensProvider, () =>
      vscode.languages.registerCodeLensProvider('*', ivmeSelectionCodeLensProvider)
    );
    
    // Hover Provider
    this.registerProvider('hover', new BaykarAiHoverProvider(), () =>
      vscode.languages.registerHoverProvider('*', new BaykarAiHoverProvider())
    );
    
    // Inlay Hints Provider
    this.registerProvider('inlayHints', ivmeSelectionInlayHintsProvider, () =>
      vscode.languages.registerInlayHintsProvider('*', ivmeSelectionInlayHintsProvider)
    );
    
    // Code Actions Provider
    this.registerProvider('codeActions', new BaykarAiActionProvider(), () =>
      vscode.languages.registerCodeActionsProvider('*', new BaykarAiActionProvider())
    );
  }
  
  private registerProvider(
    name: string, 
    provider: any, 
    registerFn: () => vscode.Disposable
  ): void {
    this.providers.set(name, provider);
    const registration = registerFn();
    this.registrations.set(name, registration);
    
    console.log(`[ProviderManager] Registered provider: ${name}`);
  }
}
```

---

## 6.2 Chat View Provider

### 🎯 Genel Bakış

ChatViewProvider, İvme extension'ının kalbi olan ana chat arayüzünü yönetir. Bu provider, webview tabanlı modern bir UI sağlar ve Agent/Chat modları arasında dinamik geçiş imkanı sunar.

```typescript
export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = `${EXTENSION_ID}.chatView`;
    private _view?: vscode.WebviewView;
    public isAgentModeActive: boolean = false;
    
    // Debounce için zamanlayıcı
    private selectionDebounce: NodeJS.Timeout | undefined = undefined;
    
    // Bekleyen agent seçimi
    private pendingAgentSelection: {
        start: vscode.Position;
        end: vscode.Position;
        content: string;
        fileName: string;
    } | null = null;
}
```

### 🔧 Core Functionality

#### Webview Initialization
```typescript
public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
): void {
    this._view = webviewView;
    
    webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [
            this._context.extensionUri,
            vscode.Uri.joinPath(this._context.extensionUri, 'webview-ui')
        ]
    };
    
    // HTML content'i yükle
    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
    
    // Message handler'ları setup et
    this.setupMessageHandlers(webviewView);
    
    // Initial state'i yükle
    this.loadInitialState();
}

private getHtmlForWebview(webview: vscode.Webview): string {
    const stylesResetUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this._context.extensionUri, 'webview-ui', 'css', 'reset.css')
    );
    const stylesMainUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this._context.extensionUri, 'webview-ui', 'css', 'chat.css')
    );
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this._context.extensionUri, 'webview-ui', 'js', 'main.js')
    );
    
    const nonce = getNonce();
    
    return `<!DOCTYPE html>
    <html lang="tr">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${stylesResetUri}" rel="stylesheet">
        <link href="${stylesMainUri}" rel="stylesheet">
        <title>İvme Chat</title>
    </head>
    <body>
        <div id="app"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
}
```

#### Agent Mode Management
```typescript
public setAgentMode(isActive: boolean): void {
    this.isAgentModeActive = isActive;
    
    // Settings'e kaydet
    this.settingsManager.setAgentModeState(isActive);
    
    // UI'ı güncelle
    this.updateAgentModeUI(isActive);
    
    // Provider'ları refresh et
    ivmeSelectionCodeLensProvider.refresh();
    ivmeSelectionInlayHintsProvider.refresh();
    
    // Agent modu kapatılırsa pending selection'ı temizle
    if (!isActive) {
        this.clearPendingSelection();
    }
    
    console.log(`[ChatViewProvider] Agent mode ${isActive ? 'activated' : 'deactivated'}`);
}

private updateAgentModeUI(isActive: boolean): void {
    if (this._view) {
        this._view.webview.postMessage({
            type: 'agentModeChanged',
            isActive: isActive
        });
    }
}
```

#### Selection Handling with Debouncing
```typescript
private debouncedHandleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
    // Önceki zamanlayıcıyı iptal et
    if (this.selectionDebounce) {
        clearTimeout(this.selectionDebounce);
    }
    
    // 300ms sonra çalışacak yeni zamanlayıcı
    this.selectionDebounce = setTimeout(() => {
        this.handleSelectionChange(event);
    }, 300);
}

private handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
    if (!event.textEditor || !this.isAgentModeActive) {
        this.clearPendingSelection();
        return;
    }
    
    const selection = event.selections[0];
    if (selection && !selection.isEmpty) {
        const selectedText = event.textEditor.document.getText(selection);
        const fileName = path.basename(event.textEditor.document.fileName);
        
        // Pending selection'ı güncelle
        this.pendingAgentSelection = {
            start: selection.start,
            end: selection.end,
            content: selectedText,
            fileName
        };
        
        // Global pending selection'ı set et
        setPendingSelection(
            event.textEditor.document.uri, 
            selection, 
            fileName, 
            selectedText
        );
        
        // Provider'ları refresh et
        ivmeSelectionCodeLensProvider.refresh();
        
    } else {
        this.clearPendingSelection();
    }
}
```

#### Context Integration
```typescript
public async applyPendingSelection(): Promise<void> {
    // Webview'i aç ve odakla
    if (!this._view) {
        await vscode.commands.executeCommand(`${EXTENSION_ID}.chatView.focus`);
    }
    
    const editor = vscode.window.activeTextEditor;
    let selection = this.pendingAgentSelection;
    
    // Fallback: aktif editörden seçimi al
    if (!selection && editor && !editor.selection.isEmpty) {
        const content = editor.document.getText(editor.selection);
        const fileName = path.basename(editor.document.fileName);
        selection = {
            start: editor.selection.start,
            end: editor.selection.end,
            content,
            fileName
        };
    }
    
    if (!selection) return;
    
    if (this.isAgentModeActive) {
        // Agent modu: context'e ekle
        await this.contextManager.addSelectionContext(
            selection.fileName,
            selection.content,
            selection.start,
            selection.end
        );
        
        // UI'ı güncelle
        this.updateContextDisplay();
        
    } else {
        // Chat modu: dosya olarak yükle
        await this.contextManager.addFileContext(selection.fileName, selection.content);
    }
    
    // Pending selection'ı temizle
    this.clearPendingSelection();
    
    // Success mesajı
    vscode.window.showInformationMessage(
        `${selection.fileName} ${this.isAgentModeActive ? 'context' : 'file'}'e eklendi`
    );
}
```

---

## 6.3 Code Lens Provider

### 🔍 Genel Bakış

CodeLensProvider, kullanıcının kod seçiminin üstünde "İvme'ye aktar" butonu göstererek agent mode'da hızlı etkileşim sağlar.

```typescript
export class IvmeSelectionCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
    
    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}
```

### 🎨 Implementation Details

#### Code Lens Provision
```typescript
provideCodeLenses(document: vscode.TextDocument): vscode.ProviderResult<vscode.CodeLens[]> {
    // Sadece Agent modu aktifken göster
    const config = vscode.workspace.getConfiguration(EXTENSION_ID);
    const isAgentActive = config.get<boolean>(SETTINGS_KEYS.agentModeActive, false);
    
    if (!isAgentActive) return [];
    
    // Pending selection kontrolü
    const pending = getPendingSelection(document.uri);
    if (!pending) return [];
    
    // CodeLens oluştur
    const startLine = pending.range.start.line;
    const range = new vscode.Range(startLine, 0, startLine, 0);
    
    const command: vscode.Command = {
        title: "$(play) İvme'ye aktar",
        command: COMMAND_IDS.confirmAgentSelection,
        tooltip: "Seçimi agent bağlamına ekle"
    };
    
    return [new vscode.CodeLens(range, command)];
}
```

#### Dynamic Refresh System
```typescript
class CodeLensManager {
    private refreshQueued = false;
    
    public queueRefresh(): void {
        if (this.refreshQueued) return;
        
        this.refreshQueued = true;
        
        // Batch refresh için kısa timeout
        setTimeout(() => {
            ivmeSelectionCodeLensProvider.refresh();
            this.refreshQueued = false;
        }, 50);
    }
    
    public handleSelectionChange(uri: vscode.Uri): void {
        this.queueRefresh();
    }
    
    public handleAgentModeChange(): void {
        this.queueRefresh();
    }
}
```

### 🎯 User Experience Optimization

#### Smart Positioning
```typescript
class CodeLensPositioning {
    static calculateOptimalPosition(
        selection: vscode.Range,
        document: vscode.TextDocument
    ): vscode.Range {
        const startLine = selection.start.line;
        
        // Multiline selection için en üst satırı kullan
        const targetLine = Math.max(0, startLine - 1);
        
        // Boş satır varsa onu kullan, yoksa seçimin başını kullan
        const lineText = document.lineAt(targetLine).text;
        const position = lineText.trim().length === 0 ? targetLine : startLine;
        
        return new vscode.Range(position, 0, position, 0);
    }
    
    static shouldShowCodeLens(
        selection: vscode.Range,
        document: vscode.TextDocument
    ): boolean {
        // Minimum selection length
        if (selection.isEmpty) return false;
        
        const selectedText = document.getText(selection);
        if (selectedText.length < 5) return false;
        
        // Ignore whitespace-only selections
        if (selectedText.trim().length === 0) return false;
        
        return true;
    }
}
```

---

## 6.4 Hover Provider

### 💡 Genel Bakış

HoverProvider, kullanıcı kod üzerine geldiğinde hem agent selection önerileri hem de hata düzeltme önerileri gösterir.

```typescript
export class BaykarAiHoverProvider implements vscode.HoverProvider {
    public provideHover(
        document: vscode.TextDocument, 
        position: vscode.Position
    ): vscode.ProviderResult<vscode.Hover> {
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;
        
        // Agent selection hover
        this.addAgentSelectionHover(markdown, document, position);
        
        // Diagnostic hover
        this.addDiagnosticHover(markdown, document, position);
        
        return markdown.value ? new vscode.Hover(markdown) : null;
    }
}
```

### 🔧 Implementation Details

#### Agent Selection Hover
```typescript
private addAgentSelectionHover(
    markdown: vscode.MarkdownString,
    document: vscode.TextDocument,
    position: vscode.Position
): void {
    const config = vscode.workspace.getConfiguration(EXTENSION_ID);
    const isAgentActive = config.get<boolean>(SETTINGS_KEYS.agentModeActive, false);
    
    if (!isAgentActive) return;
    
    const pending = getPendingSelection(document.uri);
    if (!pending || !pending.range.contains(position)) return;
    
    // Hover content oluştur
    const applyUri = vscode.Uri.parse(`command:${COMMAND_IDS.confirmAgentSelection}`);
    
    markdown.appendMarkdown(`**İvme Seçim**\n\n`);
    markdown.appendMarkdown(`_${pending.fileName} (${pending.range.start.line + 1}-${pending.range.end.line + 1})_\n\n`);
    markdown.appendMarkdown(`[$(play) İvme'ye aktar](${applyUri})\n\n`);
    
    // Seçim preview
    const previewText = pending.content.length > 100 
        ? pending.content.substring(0, 100) + '...'
        : pending.content;
    
    markdown.appendMarkdown('```' + this.detectLanguage(document) + '\n');
    markdown.appendMarkdown(previewText);
    markdown.appendMarkdown('\n```\n\n');
}

private detectLanguage(document: vscode.TextDocument): string {
    const languageMap: Record<string, string> = {
        'typescript': 'typescript',
        'javascript': 'javascript',
        'python': 'python',
        'java': 'java',
        'csharp': 'csharp',
        'cpp': 'cpp',
        'c': 'c'
    };
    
    return languageMap[document.languageId] || 'text';
}
```

#### Diagnostic Hover
```typescript
private addDiagnosticHover(
    markdown: vscode.MarkdownString,
    document: vscode.TextDocument,
    position: vscode.Position
): void {
    const diagnostic = vscode.languages.getDiagnostics(document.uri)
        .find(d => d.range.contains(position));
    
    if (!diagnostic) return;
    
    markdown.appendMarkdown(`**${EXTENSION_NAME} Fix**\n\n`);
    markdown.appendMarkdown(`*Problem: ${diagnostic.message}*\n\n`);
    
    // Fix command
    const args: ApplyFixArgs = {
        uri: document.uri.toString(),
        diagnostic: {
            message: diagnostic.message,
            range: [
                diagnostic.range.start.line,
                diagnostic.range.start.character,
                diagnostic.range.end.line,
                diagnostic.range.end.character
            ]
        }
    };
    
    const commandUri = vscode.Uri.parse(
        `command:${COMMAND_IDS.applyFix}?${encodeURIComponent(JSON.stringify(args))}`
    );
    
    markdown.appendMarkdown(`[✈️ ${EXTENSION_NAME} ile Düzelt](${commandUri})`);
}
```

#### Contextual Information
```typescript
class HoverContextualizer {
    static enhanceHoverWithContext(
        markdown: vscode.MarkdownString,
        document: vscode.TextDocument,
        position: vscode.Position
    ): void {
        // Kod context'i analiz et
        const context = this.analyzeCodeContext(document, position);
        
        if (context.isFunction) {
            markdown.appendMarkdown(`\n📝 *Function: ${context.functionName}*\n`);
        }
        
        if (context.isClass) {
            markdown.appendMarkdown(`\n🏗️ *Class: ${context.className}*\n`);
        }
        
        if (context.hasComplexity) {
            markdown.appendMarkdown(`\n🔍 *Complexity: ${context.complexity}*\n`);
        }
    }
    
    private static analyzeCodeContext(
        document: vscode.TextDocument,
        position: vscode.Position
    ): CodeContext {
        // AST analizi veya regex ile context belirleme
        const line = document.lineAt(position.line).text;
        
        const functionMatch = line.match(/function\s+(\w+)/);
        const classMatch = line.match(/class\s+(\w+)/);
        
        return {
            isFunction: !!functionMatch,
            functionName: functionMatch?.[1],
            isClass: !!classMatch,
            className: classMatch?.[1],
            hasComplexity: line.length > 100,
            complexity: this.calculateComplexity(line)
        };
    }
}
```

---

## 6.5 Inlay Hints Provider

### 🏷️ Genel Bakış

InlayHintsProvider, seçim yaptıktan sonra satır sonunda küçük bir "İvme'ye aktar" butonu gösterir.

```typescript
export class IvmeSelectionInlayHintsProvider implements vscode.InlayHintsProvider {
    private _onDidChangeInlayHints = new vscode.EventEmitter<void>();
    public readonly onDidChangeInlayHints = this._onDidChangeInlayHints.event;
    
    public refresh(): void {
        this._onDidChangeInlayHints.fire();
    }
}
```

### 🎨 Implementation

#### Hints Provision
```typescript
provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
    token: vscode.CancellationToken
): vscode.ProviderResult<vscode.InlayHint[]> {
    // Agent modu kontrolü
    const config = vscode.workspace.getConfiguration(EXTENSION_ID);
    const isAgentActive = config.get<boolean>(SETTINGS_KEYS.agentModeActive, false);
    
    if (!isAgentActive) return [];
    
    const pending = getPendingSelection(document.uri);
    if (!pending) return [];
    
    // Sadece seçim aralığında göster
    if (!range.intersection(pending.range)) return [];
    
    // Hint oluştur
    const hint = this.createInlayHint(pending);
    return [hint];
}

private createInlayHint(pending: PendingSelection): vscode.InlayHint {
    const position = pending.range.end;
    
    const parts: vscode.InlayHintLabelPart[] = [
        { value: '[ ' },
        {
            value: "İvme'ye aktar",
            tooltip: "Seçimi agent bağlamına ekle",
            command: {
                title: "İvme'ye aktar",
                command: COMMAND_IDS.confirmAgentSelection
            }
        },
        { value: ' ]' }
    ];
    
    const hint = new vscode.InlayHint(position, parts, vscode.InlayHintKind.Parameter);
    hint.paddingLeft = true;
    
    return hint;
}
```

#### Smart Positioning
```typescript
class InlayHintPositioning {
    static getOptimalPosition(
        selection: vscode.Range,
        document: vscode.TextDocument
    ): vscode.Position {
        const endLine = selection.end.line;
        const lineText = document.lineAt(endLine).text;
        
        // Satır sonunu kullan, ancak trailing whitespace'i atla
        const trimmedLength = lineText.trimEnd().length;
        
        return new vscode.Position(endLine, Math.max(trimmedLength, selection.end.character));
    }
    
    static shouldShowHint(
        selection: vscode.Range,
        document: vscode.TextDocument
    ): boolean {
        // Çok küçük seçimleri gösterme
        if (selection.isEmpty) return false;
        
        const selectedText = document.getText(selection);
        if (selectedText.length < 3) return false;
        
        // Single word selections için gösterme
        if (!selectedText.includes(' ') && selectedText.length < 10) return false;
        
        return true;
    }
}
```

---

## 6.6 Code Actions Provider

### ⚡ Genel Bakış

CodeActionsProvider, hata diagnostics'i için quick fix önerileri sağlar ve lightbulb menüsünde görünür.

```typescript
export class BaykarAiActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.RefactorRewrite
    ];
}
```

### 🔧 Implementation

#### Code Actions Provision
```typescript
provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
    const actions: vscode.CodeAction[] = [];
    
    // Diagnostic bazlı fix action
    const diagnostic = context.diagnostics.find(d => d.range.contains(range));
    if (diagnostic) {
        actions.push(this.createFixAction(document, diagnostic));
    }
    
    return actions;
}

private createFixAction(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
): vscode.CodeAction {
    const action = new vscode.CodeAction(
        `✈️ ${EXTENSION_NAME} ile Düzelt`,
        vscode.CodeActionKind.QuickFix
    );
    
    const args: ApplyFixArgs = {
        uri: document.uri.toString(),
        diagnostic: {
            message: diagnostic.message,
            range: [
                diagnostic.range.start.line,
                diagnostic.range.start.character,
                diagnostic.range.end.line,
                diagnostic.range.end.character
            ]
        }
    };
    
    action.command = {
        command: COMMAND_IDS.applyFix,
        title: `${EXTENSION_NAME} Düzeltmesini Uygula`,
        arguments: [args]
    };
    
    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    
    return action;
}
```

#### Enhanced Action Context
```typescript
class ActionContextAnalyzer {
    static analyzeContext(
        document: vscode.TextDocument,
        range: vscode.Range,
        diagnostic: vscode.Diagnostic
    ): ActionContext {
        const context: ActionContext = {
            errorType: this.categorizeError(diagnostic.message),
            codeComplexity: this.analyzeComplexity(document, range),
            suggestedFixes: this.generateSuggestions(diagnostic),
            confidence: this.calculateConfidence(diagnostic)
        };
        
        return context;
    }
    
    private static categorizeError(message: string): ErrorType {
        if (message.includes('syntax')) return 'SYNTAX_ERROR';
        if (message.includes('type')) return 'TYPE_ERROR';
        if (message.includes('import')) return 'IMPORT_ERROR';
        if (message.includes('undefined')) return 'UNDEFINED_ERROR';
        
        return 'GENERAL_ERROR';
    }
    
    private static generateSuggestions(diagnostic: vscode.Diagnostic): string[] {
        const suggestions: string[] = [];
        const message = diagnostic.message.toLowerCase();
        
        if (message.includes('cannot find name')) {
            suggestions.push('Add import statement');
            suggestions.push('Check variable declaration');
        }
        
        if (message.includes('type')) {
            suggestions.push('Fix type annotation');
            suggestions.push('Add type assertion');
        }
        
        return suggestions;
    }
}
```

---

## 6.7 Webview UI Architecture

### 🎨 Genel Bakış

Webview UI, modern web teknolojileri kullanarak native VS Code deneyimi sağlayan sophisticated bir arayüzdür.

```typescript
interface WebviewArchitecture {
  html: string;           // Base HTML template
  css: string[];          // Stylesheet resources
  javascript: string[];   // Script resources  
  assets: string[];       // Static assets (images, videos)
  components: Component[]; // UI component tree
}
```

### 🏗️ HTML Structure

#### Base Template
```html
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src {{cspSource}}; script-src 'nonce-{{nonce}}'; img-src {{cspSource}} https:; media-src {{cspSource}};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <link rel="stylesheet" href="{{highlight_css_uri}}">
    <link href="{{chat_css_uri}}" rel="stylesheet">
    
    <title>İvme Chat</title>
</head>
<body data-ai-icon-uri="{{ai_icon_uri}}" data-user-icon-uri="{{user_icon_uri}}">
    <!-- Background video -->
    <video autoplay muted loop id="background-video" src="{{welcome_video_uri}}"></video>
    
    <!-- Main content wrapper -->
    <div class="main-content-wrapper">
        <!-- Header section -->
        <header class="chat-header">
            <button id="logo-button" class="header-logo-title">
                <img src="{{logo_uri}}" alt="Logo" class="header-logo"/>
                <span>İvme <span class="app-version">v{{version}}</span></span>
            </button>
            
            <div class="header-actions">
                <!-- Language toggle -->
                <div class="language-toggle">
                    <input type="checkbox" id="language-toggle" />
                    <label for="language-toggle" class="toggle-bubble">
                        <span class="lang-option tr">TR</span>
                        <span class="lang-option en">EN</span>
                    </label>
                </div>
                
                <!-- Action buttons -->
                <button id="history-button" class="icon-button" title="Konuşma Geçmişi">
                    <img src="{{history_icon_uri}}" alt="Konuşma Geçmişi"/>
                </button>
                <button id="new-chat-button" class="icon-button" title="Yeni Konuşma">
                    <img src="{{new_chat_icon_uri}}" alt="Yeni Konuşma"/>
                </button>
                <button id="settings-button" class="icon-button" title="Ayarlar">
                    <img src="{{settings_icon_uri}}" alt="Ayarlar"/>
                </button>
            </div>
        </header>
        
        <!-- Mode toggle -->
        <div class="mode-toggle-container">
            <div class="mode-toggle">
                <input type="checkbox" id="agent-mode-toggle" />
                <label for="agent-mode-toggle" class="toggle-label">
                    <span class="mode-text chat">💬 Chat</span>
                    <span class="mode-text agent">🤖 Agent</span>
                </label>
            </div>
        </div>
        
        <!-- Chat container -->
        <div id="chat-container" class="chat-container">
            <div id="chat-messages" class="chat-messages"></div>
            
            <!-- Context display -->
            <div id="context-container" class="context-container hidden">
                <div class="context-header">
                    <h3>📄 Yüklenen Dosyalar</h3>
                    <button id="clear-context-button" class="clear-context-btn">🗑️ Temizle</button>
                </div>
                <div id="context-list" class="context-list"></div>
            </div>
        </div>
        
        <!-- Input area -->
        <div class="input-container">
            <div class="input-row">
                <div class="file-upload-container">
                    <input type="file" id="file-upload" multiple accept=".txt,.js,.ts,.tsx,.jsx,.py,.java,.cpp,.c,.h,.css,.html,.json,.md,.yml,.yaml,.xml,.php,.rb,.go,.rs,.swift,.kt,.scala,.sh,.sql">
                    <label for="file-upload" id="file-upload-label" class="file-upload-btn" title="Dosya yükle">
                        <img src="{{attach_icon_uri}}" alt="Dosya ekle" class="attach-icon">
                    </label>
                </div>
                
                <div class="input-with-send">
                    <textarea id="user-input" placeholder="Mesajınızı yazın..." rows="1"></textarea>
                    <button id="send-button" class="send-button" title="Gönder">
                        <img src="{{send_icon_uri}}" alt="Gönder" class="send-icon">
                    </button>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Modals -->
    <div id="history-modal" class="modal hidden">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Konuşma Geçmişi</h2>
                <button id="close-history-modal" class="close-button">×</button>
            </div>
            <div id="history-list" class="history-list"></div>
        </div>
    </div>
    
    <!-- Script imports -->
    <script src="{{marked_js_uri}}" nonce="{{nonce}}"></script>
    <script src="{{highlight_js_uri}}" nonce="{{nonce}}"></script>
    <script src="{{main_js_uri}}" nonce="{{nonce}}"></script>
</body>
</html>
```

### 🎨 CSS Architecture

#### Component-Based Styling
```css
/* Base styles */
:root {
  --primary-color: #007acc;
  --secondary-color: #1e1e1e;
  --accent-color: #ff6b35;
  --success-color: #4caf50;
  --warning-color: #ff9800;
  --error-color: #f44336;
  
  --bg-primary: var(--vscode-editor-background);
  --bg-secondary: var(--vscode-sidebar-background);
  --text-primary: var(--vscode-editor-foreground);
  --text-secondary: var(--vscode-descriptionForeground);
  
  --border-radius: 8px;
  --shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  --transition: all 0.3s ease;
}

/* Layout components */
.main-content-wrapper {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--vscode-panel-border);
}

.mode-toggle-container {
  display: flex;
  justify-content: center;
  padding: 16px;
  background: var(--bg-secondary);
}

/* Interactive components */
.mode-toggle {
  position: relative;
  width: 200px;
  height: 40px;
  background: var(--vscode-button-background);
  border-radius: 20px;
  transition: var(--transition);
}

.mode-toggle input[type="checkbox"] {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-label {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  transition: var(--transition);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.toggle-label::before {
  content: '';
  position: absolute;
  height: 32px;
  width: 90px;
  left: 4px;
  bottom: 4px;
  background-color: var(--primary-color);
  transition: var(--transition);
  border-radius: 16px;
}

input:checked + .toggle-label::before {
  transform: translateX(96px);
}

/* Chat messages */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  scroll-behavior: smooth;
}

.message {
  margin-bottom: 16px;
  display: flex;
  align-items: flex-start;
  animation: fadeInUp 0.3s ease;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message.user {
  flex-direction: row-reverse;
}

.message-content {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: var(--border-radius);
  position: relative;
}

.message.user .message-content {
  background: var(--primary-color);
  color: white;
  margin-right: 12px;
}

.message.assistant .message-content {
  background: var(--bg-secondary);
  color: var(--text-primary);
  margin-left: 12px;
  border: 1px solid var(--vscode-panel-border);
}

/* Input area */
.input-container {
  padding: 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--vscode-panel-border);
}

.input-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.input-with-send {
  flex: 1;
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

#user-input {
  flex: 1;
  min-height: 40px;
  max-height: 120px;
  padding: 12px 16px;
  border: 1px solid var(--vscode-input-border);
  border-radius: var(--border-radius);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-family: var(--vscode-font-family);
  font-size: 14px;
  resize: none;
  transition: var(--transition);
}

#user-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
}
```

### 📱 Responsive Design

#### Mobile-First Approach
```css
/* Mobile styles */
@media (max-width: 768px) {
  .chat-header {
    padding: 8px 12px;
  }
  
  .header-logo-title span {
    font-size: 16px;
  }
  
  .header-actions {
    gap: 8px;
  }
  
  .icon-button {
    width: 36px;
    height: 36px;
  }
  
  .mode-toggle {
    width: 160px;
    height: 36px;
  }
  
  .toggle-label::before {
    width: 70px;
    height: 28px;
  }
  
  input:checked + .toggle-label::before {
    transform: translateX(76px);
  }
  
  .message-content {
    max-width: 90%;
    padding: 10px 14px;
  }
  
  .input-row {
    flex-direction: column;
    gap: 8px;
  }
  
  .file-upload-container {
    align-self: flex-start;
  }
}

/* Tablet styles */
@media (min-width: 769px) and (max-width: 1024px) {
  .message-content {
    max-width: 85%;
  }
}

/* Desktop styles */
@media (min-width: 1025px) {
  .chat-container {
    max-width: none;
  }
  
  .message-content {
    max-width: 75%;
  }
}
```

---

### 🔄 JavaScript Architecture

#### Core Application Logic
```javascript
class AppState {
    constructor() {
        this.currentMode = 'chat';
        this.conversations = new Map();
        this.contextFiles = [];
        this.isProcessing = false;
        this.language = 'tr';
    }
}

class MessageHandler {
    constructor(appState, vscode) {
        this.appState = appState;
        this.vscode = vscode;
        this.setupMessageListener();
    }
    
    setupMessageListener() {
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'agentModeChanged':
                    this.handleAgentModeChange(message.isActive);
                    break;
                case 'conversationLoaded':
                    this.handleConversationLoaded(message.conversation);
                    break;
            }
        });
    }
}
```

---

## 6.8 Event Handling ve State Management

### 🔄 Event System Architecture

İvme extension'ı, sophisticated bir event-driven architecture kullanarak provider'lar arasında seamless communication sağlar.

```typescript
class ExtensionEventBus {
    private listeners = new Map<string, EventListener[]>();
    
    subscribe<T = any>(eventType: string, listener: EventListener<T>): EventSubscription {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, []);
        }
        
        this.listeners.get(eventType)!.push(listener);
        return { unsubscribe: () => this.unsubscribe(eventType, listener) };
    }
    
    async emit<T = any>(eventType: string, data: T): Promise<void> {
        const listeners = this.listeners.get(eventType) || [];
        await Promise.allSettled(listeners.map(listener => listener(data)));
    }
}
```

---

## 6.9 Provider Coordination

### 🤝 Inter-Provider Communication

Provider'lar arasında efficient coordination sağlanır:

```typescript
class ProviderCoordinator {
    private providers = new Map<string, any>();
    private eventBus: ExtensionEventBus;
    
    coordinateSelectionResponse(selectionData: any): void {
        // Batch provider updates
        const codeLensProvider = this.providers.get('codeLens');
        const inlayHintsProvider = this.providers.get('inlayHints');
        
        codeLensProvider?.refresh();
        inlayHintsProvider?.refresh();
    }
}
```

---

<div align="center">
  <h2>🎨 Seamless UI Integration</h2>
  <p><em>Provider'lar ile VS Code'un native deneyimi</em></p>
</div>

Bu provider bölümünde ele alınanlar:

- ✅ **Provider Mimarisi**: VS Code API entegrasyonu
- ✅ **ChatViewProvider**: Modern webview chat arayüzü  
- ✅ **CodeLensProvider**: Satır içi action butonları
- ✅ **HoverProvider**: Context-aware hover bilgileri
- ✅ **InlayHintsProvider**: Inline öneriler
- ✅ **CodeActionsProvider**: Quick fix önerileri
- ✅ **Webview UI**: Modern web teknolojileri
- ✅ **Event Handling**: Event-driven coordination
- ✅ **Provider Coordination**: Performance-optimized communication

Bir sonraki bölümde **"API ve Entegrasyonlar"**ı inceleyeceğiz! 🚀
