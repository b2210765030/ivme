# 12. API Referansı - Detaylı API Dokümantasyonu 📚

Bu bölüm, İvme extension'ının tüm public ve internal API'larını comprehensive şekilde documnte eder. Developers, contributors ve advanced users için complete reference guide sağlar.

## İçindekiler

- [12.1 Extension API Overview](#121-extension-api-overview)
- [12.2 Configuration API](#122-configuration-api)
- [12.3 Command API](#123-command-api)
- [12.4 Service Layer API](#124-service-layer-api)
- [12.5 Webview Communication API](#125-webview-communication-api)
- [12.6 Type Definitions](#126-type-definitions)
- [12.7 Provider Interfaces](#127-provider-interfaces)
- [12.8 Event System API](#128-event-system-api)
- [12.9 Utility APIs](#129-utility-apis)
- [12.10 Code Examples](#1210-code-examples)

---

## 12.1 Extension API Overview

### 🏗️ Core Architecture

```typescript
interface ExtensionArchitecture {
  entry: 'src/extension.ts';
  providers: 'VS Code UI integration layer';
  features: 'Business logic and handlers';
  services: 'Core business services';
  types: 'TypeScript type definitions';
  webview: 'Frontend application layer';
}
```

### 📋 Extension Manifest

```json
{
  "name": "ivme-ivme",
  "displayName": "İvme",
  "description": "LLM kullanarak kod hatalarını otomatik düzelten bir VS Code eklentisi.",
  "version": "2.2.6",
  "publisher": "ivme",
  "engines": {
    "vscode": "^1.90.0"
  },
  "categories": ["Other"],
  "activationEvents": ["*", "onView:baykar-ai-fixer.chatView"]
}
```

### 🎯 Extension Activation

```typescript
// src/extension.ts
export function activate(context: vscode.ExtensionContext): void {
  // Service initialization
  const apiManager = new ApiServiceManager();
  const chatProvider = new ChatViewProvider(context, apiManager);
  
  // Provider registration
  vscode.window.registerWebviewViewProvider(
    ChatViewProvider.viewType, 
    chatProvider
  );
  
  // Command registration
  registerCommands(context, chatProvider, apiManager);
  
  // Project indexing setup
  setupProjectIndexing(context, apiManager);
}

export function deactivate(): void {
  // Cleanup resources
}
```

---

## 12.2 Configuration API

### ⚙️ Settings Schema

```typescript
interface ExtensionConfiguration {
  // API Service Configuration
  'baykar-ai-fixer.api.activeService': 'vLLM' | 'Gemini';
  
  // vLLM Configuration
  'baykar-ai-fixer.vllm.baseUrl': string;
  'baykar-ai-fixer.vllm.modelName': string;
  'baykar-ai-fixer.vllm.embeddingModelName': string;
  
  // Gemini Configuration
  'baykar-ai-fixer.gemini.apiKey': string;
  
  // Indexing Configuration
  'baykar-ai-fixer.indexing.enabled': boolean;
  'baykar-ai-fixer.indexing.sourceName': string;
  'baykar-ai-fixer.indexing.includeGlobs': string[];
  'baykar-ai-fixer.indexing.excludeGlobs': string[];
  'baykar-ai-fixer.indexing.vectorStorePath': string;
  'baykar-ai-fixer.indexing.summaryTimeoutMs': number;
  'baykar-ai-fixer.indexing.embeddingTimeoutMs': number;
  
  // Chat Configuration
  'baykar-ai-fixer.chat.conversationHistoryLimit': number;
  'baykar-ai-fixer.chat.tokenLimit': number;
  'baykar-ai-fixer.chat.temperature': number;
  
  // Retrieval Configuration
  'baykar-ai-fixer.retrieval.cohereApiKey': string;
  
  // UI State
  'baykar-ai-fixer.ui.agentModeActive': boolean;
  'baykar-ai-fixer.ui.agentBarExpanded': boolean;
}
```

### 📝 Settings Access API

```typescript
import { EXTENSION_ID, SETTINGS_KEYS } from '../core/constants';

class ConfigurationAPI {
  static getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(EXTENSION_ID);
  }
  
  static get<T>(key: string, defaultValue?: T): T {
    return this.getConfiguration().get<T>(key, defaultValue);
  }
  
  static async update(
    key: string, 
    value: any, 
    configurationTarget?: vscode.ConfigurationTarget
  ): Promise<void> {
    await this.getConfiguration().update(key, value, configurationTarget);
  }
  
  // Specific getters
  static getActiveApiService(): 'vLLM' | 'Gemini' {
    return this.get(SETTINGS_KEYS.activeApiService, 'vLLM');
  }
  
  static getVllmBaseUrl(): string {
    return this.get(SETTINGS_KEYS.vllmBaseUrl, 'http://ivme.baykar.tech/coder/v1');
  }
  
  static getGeminiApiKey(): string {
    return this.get(SETTINGS_KEYS.geminiApiKey, '');
  }
  
  static getIndexingEnabled(): boolean {
    return this.get(SETTINGS_KEYS.indexingEnabled, true);
  }
  
  static getTemperature(): number {
    return this.get(SETTINGS_KEYS.temperature, 0.7);
  }
}
```

### 🔐 Secrets API

```typescript
class SecretsAPI {
  constructor(private context: vscode.ExtensionContext) {}
  
  async storeSecret(key: string, value: string): Promise<void> {
    await this.context.secrets.store(key, value);
  }
  
  async getSecret(key: string): Promise<string | undefined> {
    return await this.context.secrets.get(key);
  }
  
  async deleteSecret(key: string): Promise<void> {
    await this.context.secrets.delete(key);
  }
  
  // Pre-defined secret keys
  static readonly SECRET_KEYS = {
    GEMINI_API_KEY: 'gemini-api-key',
    COHERE_API_KEY: 'cohere-api-key',
    CUSTOM_API_KEYS: 'custom-api-keys'
  };
}
```

---

## 12.3 Command API

### 🎮 Command Definitions

```typescript
export const COMMAND_IDS = {
  // Core commands
  applyFix: 'baykar-ai-fixer.applyFix',
  showChat: 'baykar-ai.showChat',
  sendToChat: 'baykar-ai.sendToChat',
  checkVllmStatus: 'baykar-ai-fixer.checkVllmStatus',
  
  // Agent commands
  confirmAgentSelection: 'baykar-ai-fixer.confirmAgentSelection',
  
  // Presentation commands
  showPresentation: 'baykar.showPresentation',
  
  // Indexing commands
  indexProject: 'baykar-ai.indexProject',
  viewVectorStore: 'baykar-ai-fixer.viewVectorStore'
};
```

### 📋 Command Registration

```typescript
function registerCommands(
  context: vscode.ExtensionContext,
  chatProvider: ChatViewProvider,
  apiManager: ApiServiceManager
): void {
  
  // Apply fix command
  const applyFixCommand = vscode.commands.registerCommand(
    COMMAND_IDS.applyFix,
    async (args: ApplyFixArgs) => {
      try {
        await applyFixToDocument(args);
        vscode.window.showInformationMessage('Düzeltme başarıyla uygulandı!');
      } catch (error) {
        vscode.window.showErrorMessage(`Düzeltme uygulanamadı: ${error.message}`);
      }
    }
  );
  
  // Show chat command
  const showChatCommand = vscode.commands.registerCommand(
    COMMAND_IDS.showChat,
    () => {
      vscode.commands.executeCommand('workbench.view.extension.baykar-ai-chat-container');
    }
  );
  
  // Send to chat command
  const sendToChatCommand = vscode.commands.registerCommand(
    COMMAND_IDS.sendToChat,
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      
      const selection = editor.selection;
      const text = editor.document.getText(selection);
      
      if (text) {
        await chatProvider.sendSelectionToChat(text, editor.document.fileName);
      }
    }
  );
  
  // Register all commands
  context.subscriptions.push(
    applyFixCommand,
    showChatCommand,
    sendToChatCommand
  );
}
```

### 🎯 Command Usage Examples

```typescript
// Programmatically execute commands
class CommandAPI {
  static async applyFix(args: ApplyFixArgs): Promise<void> {
    await vscode.commands.executeCommand(COMMAND_IDS.applyFix, args);
  }
  
  static async showChat(): Promise<void> {
    await vscode.commands.executeCommand(COMMAND_IDS.showChat);
  }
  
  static async sendToChat(): Promise<void> {
    await vscode.commands.executeCommand(COMMAND_IDS.sendToChat);
  }
  
  static async checkServerStatus(): Promise<void> {
    await vscode.commands.executeCommand(COMMAND_IDS.checkVllmStatus);
  }
}
```

---

## 12.4 Service Layer API

### 🔌 API Service Interface

```typescript
export interface IApiService {
  // Connection management
  checkConnection(): Promise<boolean>;
  
  // Content generation
  generateContent(prompt: string): Promise<string>;
  
  // Chat completion with streaming support
  generateChatContent(
    messages: ChatMessage[],
    onChunk?: (chunk: string) => void,
    cancellationSignal?: AbortSignal,
    tools?: any[],
    tool_choice?: any
  ): Promise<string | void | any>;
  
  // Optional features
  embedText?(text: string): Promise<number[]>;
  getModelContextLimit?(): Promise<number>;
  countTokens?(text: string): Promise<number>;
}
```

### 🎛️ API Service Manager

```typescript
export class ApiServiceManager implements IApiService {
  private vllmService: VllmApiService;
  private geminiService: GeminiApiService;
  private _activeServiceName: ApiServiceName;
  
  constructor() {
    this.vllmService = new VllmApiService();
    this.geminiService = new GeminiApiService();
    this._activeServiceName = this.getActiveServiceNameFromSettings();
  }
  
  // Service selection
  getActiveServiceName(): ApiServiceName;
  getActiveService(): IApiService;
  getGeminiService(): GeminiApiService;
  
  // Delegated methods
  async checkConnection(): Promise<boolean>;
  async generateContent(prompt: string): Promise<string>;
  async generateChatContent(
    messages: ChatMessage[],
    onChunk?: (chunk: string) => void,
    cancellationSignal?: AbortSignal,
    tools?: any[],
    tool_choice?: any
  ): Promise<string | void | any>;
  
  // Advanced features
  async embedTextIfAvailable(text: string): Promise<number[] | null>;
  async getContextLimitIfAvailable(): Promise<number | null>;
  async countTokensIfAvailable(text: string): Promise<number | null>;
  getLastUsageIfAvailable(): TokenUsage | null;
}
```

### 🗂️ Indexing Service API

```typescript
interface IndexingAPI {
  // Project indexing
  indexProject(workspacePath: string): Promise<void>;
  indexFile(filePath: string): Promise<CodeChunkMetadata[]>;
  
  // Vector operations
  generateEmbedding(text: string): Promise<number[]>;
  searchSimilar(query: string, limit?: number): Promise<SearchResult[]>;
  
  // Metadata operations
  getProjectSummary(): Promise<ProjectSummary>;
  getFileAnalysis(filePath: string): Promise<FileAnalysis>;
}

interface ProjectSummary {
  totalFiles: number;
  totalChunks: number;
  languages: string[];
  lastIndexed: number;
  indexingDuration: number;
}

interface SearchResult {
  chunk: CodeChunkMetadata;
  similarity: number;
  relevanceScore: number;
}
```

### 🛠️ Tools Manager API

```typescript
interface ToolsManagerAPI {
  // Tool registration
  registerTool(tool: ToolDefinition): void;
  unregisterTool(toolName: string): void;
  
  // Tool execution
  executeTool(
    toolName: string, 
    args: any, 
    context: ExecutionContext
  ): Promise<ToolResult>;
  
  // Tool discovery
  getAvailableTools(): ToolDefinition[];
  getToolByName(name: string): ToolDefinition | null;
  
  // Custom tool creation
  createCustomTool(request: ToolCreationRequest): Promise<ToolDefinition>;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: ParameterSchema;
  handler: ToolHandler;
  category: 'file' | 'search' | 'code' | 'analysis' | 'custom';
}

interface ToolResult {
  success: boolean;
  result?: any;
  error?: string;
  metadata?: Record<string, any>;
}
```

---

## 12.5 Webview Communication API

### 📨 Message Types

```typescript
// Extension to Webview messages
type ExtensionToWebviewMessage = 
  | { type: 'messageStart'; messageId: string }
  | { type: 'messageChunk'; messageId: string; chunk: string }
  | { type: 'messageComplete'; messageId: string; fullContent: string }
  | { type: 'messageError'; messageId: string; error: string }
  | { type: 'configUpdate'; config: Partial<ExtensionConfiguration> }
  | { type: 'conversationHistory'; conversations: Conversation[] }
  | { type: 'plannerUpdate'; plan: PlannerState }
  | { type: 'toolsList'; tools: ToolDefinition[] };

// Webview to Extension messages  
type WebviewToExtensionMessage =
  | { type: 'userMessage'; content: string; attachments?: FileAttachment[] }
  | { type: 'configChange'; key: string; value: any }
  | { type: 'requestHistory' }
  | { type: 'clearConversation' }
  | { type: 'switchLanguage'; language: 'tr' | 'en' }
  | { type: 'executePlannerStep'; payload: { index: number } }
  | { type: 'updatePlannerStep'; payload: { index: number; step: PlanStep } }
  | { type: 'createCustomTool'; payload: ToolCreationRequest };
```

### 🔄 Message Routing

```typescript
class WebviewMessageRouter {
  constructor(
    private webview: vscode.Webview,
    private messageHandler: WebviewMessageHandler
  ) {
    this.setupMessageHandling();
  }
  
  private setupMessageHandling(): void {
    this.webview.onDidReceiveMessage(async (message) => {
      try {
        await this.routeMessage(message);
      } catch (error) {
        this.sendErrorMessage(error.message);
      }
    });
  }
  
  private async routeMessage(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case 'userMessage':
        await this.messageHandler.handleUserMessage(message);
        break;
      case 'configChange':
        await this.messageHandler.handleConfigChange(message);
        break;
      case 'executePlannerStep':
        await this.messageHandler.handlePlannerStepExecution(message);
        break;
      // ... other cases
    }
  }
  
  // Send messages to webview
  sendMessage(message: ExtensionToWebviewMessage): void {
    this.webview.postMessage(message);
  }
  
  sendErrorMessage(error: string): void {
    this.sendMessage({ type: 'messageError', messageId: '', error });
  }
}
```

### 📡 Streaming Communication

```typescript
class StreamingCommunication {
  private activeStreams = new Map<string, AbortController>();
  
  async startMessageStream(
    messageId: string,
    messages: ChatMessage[],
    webview: vscode.Webview
  ): Promise<void> {
    const controller = new AbortController();
    this.activeStreams.set(messageId, controller);
    
    // Send stream start
    webview.postMessage({
      type: 'messageStart',
      messageId
    });
    
    try {
      let fullContent = '';
      
      await this.apiManager.generateChatContent(
        messages,
        (chunk: string) => {
          fullContent += chunk;
          webview.postMessage({
            type: 'messageChunk',
            messageId,
            chunk
          });
        },
        controller.signal
      );
      
      // Send completion
      webview.postMessage({
        type: 'messageComplete',
        messageId,
        fullContent
      });
      
    } catch (error) {
      webview.postMessage({
        type: 'messageError',
        messageId,
        error: error.message
      });
    } finally {
      this.activeStreams.delete(messageId);
    }
  }
  
  cancelStream(messageId: string): void {
    const controller = this.activeStreams.get(messageId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(messageId);
    }
  }
}
```

---

## 12.6 Type Definitions

### 🏷️ Core Types

```typescript
// API Service Types
export type ApiServiceName = 'vLLM' | 'Gemini';

// Chat Types
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Conversation {
  id: string;
  timestamp: number;
  title: string;
  messages: ChatMessage[];
}

// Code Analysis Types
export type CodeContentType = 
  | 'function' 
  | 'class' 
  | 'method' 
  | 'interface' 
  | 'import' 
  | 'variable' 
  | 'markdown_comment' 
  | 'json_property' 
  | 'css_rule' 
  | 'other';

export interface CodeChunkMetadata {
  id: string;
  source: string;
  filePath: string;
  language: string;
  contentType: CodeContentType;
  name: string;
  startLine: number;
  endLine: number;
  dependencies: string[];
  content: string;
  summary?: string;
  embedding?: number[];
}
```

### 🔧 API Response Types

```typescript
// vLLM Response Types
export interface VllmCompletionResponse {
  choices: Array<{
    text: string;
  }>;
}

export interface VllmChatCompletionResponse {
  choices: Array<VllmChatCompletionStreamChoice | VllmChatCompletionStandardChoice>;
}

export interface VllmChatCompletionStreamChoice {
  delta: {
    content?: string;
  };
  index: number;
  finish_reason: string | null;
}

export interface VllmChatCompletionStandardChoice {
  message: {
    content: string;
  };
  index: number;
  finish_reason: string | null;
}

// Gemini Response Types
export interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}
```

### 🎯 Command Argument Types

```typescript
export interface ApplyFixArgs {
  uri: string;
  diagnostic: {
    message: string;
    range: [number, number, number, number];
  };
}

export interface SendToChatArgs {
  text: string;
  fileName: string;
  language?: string;
}
```

### 🗃️ Context Types

```typescript
export interface FileContext {
  fileName: string;
  content: string;
  language: string;
  selection?: vscode.Range;
}

export interface AgentContext {
  fileContext?: FileContext;
  selectionContext?: FileContext;
  uploadedFiles: FileContext[];
  activeContextText?: string;
  suppressFileContext: boolean;
}
```

---

## 12.7 Provider Interfaces

### 🖥️ Chat View Provider

```typescript
export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'baykar-ai-fixer.chatView';
  
  // Properties
  public isAgentModeActive: boolean;
  private _view?: vscode.WebviewView;
  
  // Core methods
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void;
  
  // Agent mode management
  toggleAgentMode(): Promise<void>;
  handleSelectionChange(editor: vscode.TextEditor): Promise<void>;
  sendSelectionToChat(text: string, fileName: string): Promise<void>;
  
  // UI management
  private getHtmlForWebview(webview: vscode.Webview): string;
  private setupWebviewContent(webview: vscode.Webview): void;
  private handleWebviewMessage(message: any): Promise<void>;
}
```

### 🔍 CodeLens Provider

```typescript
export class IvmeSelectionCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  
  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]>;
  
  resolveCodeLens(
    codeLens: vscode.CodeLens,
    token: vscode.CancellationToken
  ): vscode.CodeLens | Thenable<vscode.CodeLens>;
  
  refresh(): void;
}
```

### 💡 Hover Provider

```typescript
export class BaykarAiHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover>;
  
  private analyzeContext(
    document: vscode.TextDocument,
    position: vscode.Position
  ): ContextAnalysis;
  
  private generateHoverContent(analysis: ContextAnalysis): vscode.MarkdownString;
}
```

### 🏷️ Inlay Hints Provider

```typescript
export class IvmeSelectionInlayHintsProvider implements vscode.InlayHintsProvider {
  provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.InlayHint[]>;
  
  resolveInlayHint(
    hint: vscode.InlayHint,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.InlayHint>;
}
```

---

## 12.8 Event System API

### 📡 Event Emitters

```typescript
class ExtensionEventSystem {
  // Chat events
  onMessageSent = new vscode.EventEmitter<ChatMessage>();
  onMessageReceived = new vscode.EventEmitter<ChatMessage>();
  onConversationStarted = new vscode.EventEmitter<string>();
  onConversationEnded = new vscode.EventEmitter<string>();
  
  // Agent mode events
  onAgentModeToggled = new vscode.EventEmitter<boolean>();
  onSelectionChanged = new vscode.EventEmitter<FileContext>();
  
  // API events
  onApiServiceChanged = new vscode.EventEmitter<ApiServiceName>();
  onApiError = new vscode.EventEmitter<Error>();
  
  // Indexing events
  onIndexingStarted = new vscode.EventEmitter<string>();
  onIndexingProgress = new vscode.EventEmitter<IndexingProgress>();
  onIndexingCompleted = new vscode.EventEmitter<IndexingSummary>();
  
  // Configuration events
  onConfigurationChanged = new vscode.EventEmitter<ConfigurationChange>();
}
```

### 🎭 Event Handlers

```typescript
interface EventHandlers {
  // Chat event handlers
  handleMessageSent(message: ChatMessage): Promise<void>;
  handleMessageReceived(message: ChatMessage): Promise<void>;
  
  // Selection event handlers
  handleSelectionChange(context: FileContext): Promise<void>;
  handleAgentModeChange(isActive: boolean): Promise<void>;
  
  // API event handlers
  handleApiServiceChange(service: ApiServiceName): Promise<void>;
  handleApiError(error: Error): Promise<void>;
  
  // Configuration event handlers
  handleConfigurationChange(change: ConfigurationChange): Promise<void>;
}
```

---

## 12.9 Utility APIs

### 🛠️ Core Utilities

```typescript
// src/core/utils.ts
export function getNonce(): string;
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): T;
export function sanitizeHtml(html: string): string;
export function formatFileSize(bytes: number): string;
export function generateUniqueId(): string;

// Path utilities
export function getRelativePath(filePath: string, workspacePath: string): string;
export function getFileExtension(filePath: string): string;
export function isCodeFile(filePath: string): boolean;

// Text utilities
export function truncateText(text: string, maxLength: number): string;
export function extractCodeBlocks(markdown: string): CodeBlock[];
export function highlightSyntax(code: string, language: string): string;
```

### 📊 Performance Utilities

```typescript
class PerformanceAPI {
  static startTimer(label: string): void;
  static endTimer(label: string): number;
  static measureMemory(): MemoryUsage;
  static profileFunction<T>(fn: () => T, label: string): T;
  static throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): T;
}

interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}
```

### 🔐 Security Utilities

```typescript
class SecurityAPI {
  static sanitizeInput(input: string): string;
  static validateApiKey(key: string): boolean;
  static encryptSensitiveData(data: string): string;
  static decryptSensitiveData(encryptedData: string): string;
  static hashContent(content: string): string;
}
```

---

## 12.10 Code Examples

### 💻 Basic Extension Usage

```typescript
// Creating a custom service
class CustomApiService implements IApiService {
  async checkConnection(): Promise<boolean> {
    try {
      // Your connection logic
      return true;
    } catch {
      return false;
    }
  }
  
  async generateContent(prompt: string): Promise<string> {
    // Your generation logic
    return 'Generated content';
  }
  
  async generateChatContent(
    messages: ChatMessage[],
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    // Your chat logic with streaming
    let fullResponse = '';
    
    // Simulate streaming
    const chunks = ['Hello', ' ', 'World', '!'];
    for (const chunk of chunks) {
      if (onChunk) onChunk(chunk);
      fullResponse += chunk;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return fullResponse;
  }
}
```

### 🎯 Command Implementation

```typescript
// Custom command implementation
function registerCustomCommand(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand(
    'ivme.customCommand',
    async (args: any) => {
      try {
        // Access configuration
        const config = vscode.workspace.getConfiguration('baykar-ai-fixer');
        const apiService = config.get('api.activeService');
        
        // Show progress
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Processing...',
          cancellable: true
        }, async (progress, token) => {
          
          // Your logic here
          progress.report({ increment: 50, message: 'Half way...' });
          
          // Check for cancellation
          if (token.isCancellationRequested) {
            return;
          }
          
          progress.report({ increment: 100, message: 'Complete!' });
        });
        
      } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
      }
    }
  );
  
  context.subscriptions.push(command);
}
```

### 🔄 Webview Communication

```typescript
// Frontend to Extension communication
class WebviewAPI {
  private vscode: any;
  
  constructor() {
    this.vscode = acquireVsCodeApi();
  }
  
  // Send message to extension
  sendMessage(type: string, payload: any): void {
    this.vscode.postMessage({ type, payload });
  }
  
  // Listen for messages from extension
  onMessage(callback: (message: any) => void): void {
    window.addEventListener('message', event => {
      callback(event.data);
    });
  }
  
  // Specific methods
  sendUserMessage(content: string, attachments?: FileAttachment[]): void {
    this.sendMessage('userMessage', { content, attachments });
  }
  
  updateConfiguration(key: string, value: any): void {
    this.sendMessage('configChange', { key, value });
  }
  
  requestConversationHistory(): void {
    this.sendMessage('requestHistory', {});
  }
}

// Usage in webview
const api = new WebviewAPI();

api.onMessage(message => {
  switch (message.type) {
    case 'messageChunk':
      appendToChat(message.chunk);
      break;
    case 'configUpdate':
      updateUIConfig(message.config);
      break;
  }
});

// Send user input
document.getElementById('sendButton').onclick = () => {
  const input = document.getElementById('messageInput').value;
  api.sendUserMessage(input);
};
```

### 🗂️ Indexing Integration

```typescript
// Custom indexing workflow
class CustomIndexingWorkflow {
  constructor(
    private indexer: ProjectIndexer,
    private vectorStore: VectorStore
  ) {}
  
  async indexCustomContent(content: CustomContent[]): Promise<void> {
    for (const item of content) {
      // Convert to standard format
      const chunk: CodeChunkMetadata = {
        id: generateUniqueId(),
        source: 'custom',
        filePath: item.path,
        language: item.language,
        contentType: 'other',
        name: item.name,
        startLine: 1,
        endLine: item.content.split('\n').length,
        dependencies: [],
        content: item.content
      };
      
      // Generate summary
      chunk.summary = await this.generateSummary(chunk.content);
      
      // Generate embedding
      chunk.embedding = await this.generateEmbedding(chunk.content);
      
      // Store in vector database
      await this.vectorStore.addChunk(chunk);
    }
  }
  
  private async generateSummary(content: string): Promise<string> {
    // Use API service to generate summary
    const apiManager = new ApiServiceManager();
    const prompt = `Summarize this code:\n\n${content}`;
    return await apiManager.generateContent(prompt);
  }
  
  private async generateEmbedding(content: string): Promise<number[]> {
    const apiManager = new ApiServiceManager();
    const embedding = await apiManager.embedTextIfAvailable(content);
    return embedding || [];
  }
}
```

### 🎨 UI Customization

```typescript
// Custom webview provider
class CustomWebviewProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    
    webviewView.webview.html = this.getHtmlContent(webviewView.webview);
    
    // Handle messages
    webviewView.webview.onDidReceiveMessage(message => {
      this.handleMessage(message);
    });
  }
  
  private getHtmlContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview', 'script.js')
    );
    
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview', 'style.css')
    );
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <link href="${styleUri}" rel="stylesheet">
      </head>
      <body>
        <div id="app">
          <!-- Your custom UI -->
        </div>
        <script src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }
}
```

---

<div align="center">
  <h2>📚 Complete API Reference</h2>
  <p><em>Comprehensive documentation for İvme extension APIs</em></p>
</div>

Bu API referansı bölümünde ele alınanlar:

- ✅ **Extension API**: Complete activation ve lifecycle management
- ✅ **Configuration API**: Settings schema ve access patterns
- ✅ **Command API**: VS Code command system integration
- ✅ **Service Layer**: Core business logic interfaces
- ✅ **Webview Communication**: Bidirectional messaging system
- ✅ **Type Definitions**: Complete TypeScript interfaces
- ✅ **Provider Interfaces**: VS Code UI provider implementations
- ✅ **Event System**: Comprehensive event handling
- ✅ **Utility APIs**: Helper functions ve performance tools
- ✅ **Code Examples**: Practical implementation samples

Bu comprehensive API reference, İvme extension'ının tüm technical aspects'larını detaylı şekilde documnte eder ve developers için complete integration guide sağlar.

**🎉 12/12 bölüm tamamlandı! Comprehensive dokümantasyon projesi başarıyla tamamlandı!** 🚀
