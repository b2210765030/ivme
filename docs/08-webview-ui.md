# 8. Webview UI - Frontend Arayüz ve Bileşenler 🎨

Bu bölüm, İvme extension'ının modern web teknolojileri ile geliştirilmiş kullanıcı arayüzünü detaylı şekilde ele alır. Webview UI, VS Code'un webview API'si kullanarak native deneyim sunan sophisticated bir frontend uygulamasıdır.

## İçindekiler

- [8.1 Webview UI Mimarisi](#81-webview-ui-mimarisi)
- [8.2 HTML Template ve Yapı](#82-html-template-ve-yapı)
- [8.3 JavaScript Component Sistemi](#83-javascript-component-sistemi)
- [8.4 CSS Architecture ve Styling](#84-css-architecture-ve-styling)
- [8.5 State Management](#85-state-management)
- [8.6 Message Router ve İletişim](#86-message-router-ve-iletişim)
- [8.7 UI Components Detayları](#87-ui-components-detayları)
- [8.8 Performance ve Optimization](#88-performance-ve-optimization)
- [8.9 Responsive Design](#89-responsive-design)
- [8.10 Accessibility](#810-accessibility)

---

## 8.1 Webview UI Mimarisi

### 🏗️ Genel Mimari

İvme'nin webview UI'ı, modern web application patterns'ini takip eden modular bir mimariye sahiptir:

```typescript
interface WebviewUIArchitecture {
  templates: {
    html: 'chat.html';                    // Ana HTML template
  };
  components: {
    chatView: 'ChatViewComponent';        // Ana chat arayüzü
    inputArea: 'InputAreaComponent';      // Mesaj giriş alanı
    header: 'HeaderComponent';            // Üst başlık
    historyPanel: 'HistoryPanelComponent'; // Geçmiş panel
    settingsModal: 'SettingsModalComponent'; // Ayarlar modalı
    agentView: 'AgentViewComponent';      // Agent modu görünümü
    fileTags: 'FileTagsComponent';        // Dosya etiketleri
  };
  core: {
    app: 'ApplicationCore';               // Ana uygulama
    state: 'StateManager';                // Durum yönetimi
    messageRouter: 'MessageRouter';       // İletişim katmanı
  };
  utils: {
    dom: 'DOMUtilities';                  // DOM yardımcıları
    config: 'ConfigurationUtils';         // Konfigürasyon
  };
  styles: {
    base: 'BaseStyles';                   // Temel stiller
    components: 'ComponentStyles';        // Bileşen stilleri
    themes: 'ThemeStyles';                // Tema sistemi
  };
}
```

### 📁 Dosya Yapısı

```
webview-ui/
├── chat.html                          # Ana HTML template
├── assets/                            # Statik varlıklar
│   ├── *.svg                          # İkon dosyaları
│   ├── *.png                          # Resim dosyaları
│   └── intro.mp4                      # Karşılama videosu
├── css/                               # Stil dosyaları
│   ├── base.css                       # Temel stiller
│   ├── chat.css                       # Ana stil orchestrator
│   ├── header.css                     # Başlık stilleri
│   ├── message.css                    # Mesaj stilleri
│   ├── input.css                      # Giriş alanı stilleri
│   ├── modal.css                      # Modal stilleri
│   ├── history.css                    # Geçmiş panel stilleri
│   ├── welcome.css                    # Hoş geldin ekranı
│   └── vendor/                        # 3. parti stiller
│       └── github-dark.min.css        # Syntax highlighting
└── js/                                # JavaScript dosyaları
    ├── core/                          # Çekirdek modüller
    │   ├── app.js                     # Ana uygulama giriş noktası
    │   ├── state.js                   # Global state yönetimi
    │   └── message_router.js          # VS Code iletişim
    ├── components/                    # UI bileşenleri
    │   ├── index.js                   # Bileşen başlatıcı
    │   ├── chat_view.js               # Ana chat görünümü
    │   ├── InputArea.js               # Mesaj giriş alanı
    │   ├── Header.js                  # Başlık bileşeni
    │   ├── history_panel.js           # Geçmiş panel
    │   ├── settings_modal.js          # Ayarlar modalı
    │   ├── agent_view.js              # Agent modu bileşeni
    │   └── file_tags.js               # Dosya etiketleri
    ├── services/                      # Servis katmanı
    │   └── vscode.js                  # VS Code API wrapper
    ├── utils/                         # Yardımcı modüller
    │   ├── dom.js                     # DOM manipülasyon
    │   └── config.js                  # Konfigürasyon
    └── vendor/                        # 3. parti kütüphaneler
        ├── marked.min.js              # Markdown parsing
        ├── highlight.min.js           # Syntax highlighting
        └── diff.min.js                # Diff görünümleri
```

### 🚀 Application Lifecycle

```javascript
class WebviewUILifecycle {
  // 1. DOM Ready
  async onDOMContentLoaded() {
    console.log('🎨 Webview UI initializing...');
    
    // Configure external libraries
    await this.configureLibraries();
    
    // Initialize all UI components
    await this.initComponents();
    
    // Setup message router
    await this.initMessageRouter();
    
    // Apply initial state
    await this.applyInitialState();
    
    console.log('✅ Webview UI ready');
  }
  
  // 2. Component Initialization
  async initComponents() {
    const components = [
      'ChatView',
      'FileTags', 
      'Header',
      'HistoryPanel',
      'InputArea',
      'SettingsModal',
      'AgentView'
    ];
    
    for (const component of components) {
      try {
        await window[component]?.init();
        console.log(`✅ ${component} initialized`);
      } catch (error) {
        console.error(`❌ ${component} initialization failed:`, error);
      }
    }
  }
  
  // 3. State Restoration
  async applyInitialState() {
    // Restore saved preferences
    const savedAgentMode = localStorage.getItem('agentModeActive') === 'true';
    const savedLanguage = localStorage.getItem('language') || 'tr';
    const savedTheme = localStorage.getItem('theme') || 'dark';
    
    // Apply restored state
    this.setAgentMode(savedAgentMode);
    this.setLanguage(savedLanguage);
    this.setTheme(savedTheme);
  }
}
```

---

## 8.2 HTML Template ve Yapı

### 📄 Chat.html Template

Ana HTML template, VS Code'un webview sistem ile entegre çalışacak şekilde tasarlanmıştır:

```html
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <!-- VS Code webview güvenlik politikası -->
    <meta http-equiv="Content-Security-Policy" 
          content="default-src 'none'; 
                   style-src {{cspSource}}; 
                   script-src 'nonce-{{nonce}}'; 
                   img-src {{cspSource}} https:; 
                   media-src {{cspSource}};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- External stylesheets -->
    <link rel="stylesheet" href="{{highlight_css_uri}}">
    <link href="{{chat_css_uri}}" rel="stylesheet">
    
    <!-- External libraries -->
    <script src="{{diff_js_uri}}" nonce="{{nonce}}"></script>
    
    <title>İvme Chat</title>
</head>
<body data-ai-icon-uri="{{ai_icon_uri}}" data-user-icon-uri="{{user_icon_uri}}">
    <!-- Hidden icon data for JavaScript access -->
    <div id="icon-uris" 
         data-edit-icon="{{edit_icon_uri}}" 
         data-apply-icon="{{apply_icon_uri}}" 
         data-insert-icon="{{insert_icon_uri}}" 
         data-tool-code-icon="{{tool_code_icon_uri}}" 
         style="display:none">
    </div>
    
    <!-- Background welcome video -->
    <video autoplay muted loop id="background-video" src="{{welcome_video_uri}}"></video>

    <!-- Main application container -->
    <div class="main-content-wrapper">
        <!-- Header component -->
        <header class="chat-header">...</header>
        
        <!-- Mode toggle component -->
        <div class="mode-toggle-container">...</div>
        
        <!-- Welcome screen -->
        <div id="welcome-container" class="welcome-container">...</div>
        
        <!-- Main chat container -->
        <div id="chat-container" class="hidden">...</div>
        
        <!-- Planner panel for agent mode -->
        <div id="planner-panel" class="planner-panel hidden collapsed">...</div>
        
        <!-- Input area -->
        <div class="input-area">...</div>
    </div>
    
    <!-- Modal dialogs -->
    <div id="history-modal" class="modal hidden">...</div>
    <div id="settings-modal" class="modal hidden">...</div>
    
    <!-- HTML templates for dynamic content -->
    <template id="message-template">...</template>
    <template id="history-card-template">...</template>
    
    <!-- External library scripts -->
    <script src="{{marked_js_uri}}" nonce="{{nonce}}"></script>
    <script src="{{highlight_js_uri}}" nonce="{{nonce}}"></script>
    
    <!-- Main application script -->
    <script type="module" src="{{chat_js_uri}}" nonce="{{nonce}}" 
            data-agent-icon-uri="{{agent_icon_uri}}"></script>
</body>
</html>
```

### 🔧 Template Variable System

```typescript
interface TemplateVariables {
  // Security
  cspSource: string;                    // Content Security Policy source
  nonce: string;                        // Script execution nonce
  
  // Stylesheets
  highlight_css_uri: string;            // Syntax highlighting CSS
  chat_css_uri: string;                 // Main application CSS
  
  // Scripts
  marked_js_uri: string;                // Markdown parser
  highlight_js_uri: string;             // Syntax highlighter
  diff_js_uri: string;                  // Diff utility
  chat_js_uri: string;                  // Main application script
  
  // Assets
  ai_icon_uri: string;                  // AI avatar icon
  user_icon_uri: string;                // User avatar icon
  agent_icon_uri: string;               // Agent mode icon
  logo_uri: string;                     // Application logo
  welcome_video_uri: string;            // Welcome background video
  
  // Action icons
  edit_icon_uri: string;                // Edit action icon
  apply_icon_uri: string;               // Apply action icon
  insert_icon_uri: string;              // Insert action icon
  tool_code_icon_uri: string;           // Tool code icon
  attach_icon_uri: string;              // File attachment icon
  
  // Application metadata
  version: string;                      // Extension version
}
```

### 📐 Layout Structure

```css
/* Main layout hierarchy */
.main-content-wrapper {
  display: flex;
  flex-direction: column;
  height: 100vh;
  
  /* Layout components */
  .chat-header {
    flex: 0 0 auto;                     /* Fixed header */
    padding: 12px 16px;
    background: var(--vscode-sideBar-background);
  }
  
  .mode-toggle-container {
    flex: 0 0 auto;                     /* Fixed mode toggle */
    padding: 16px;
    display: flex;
    justify-content: center;
  }
  
  .welcome-container,
  #chat-container {
    flex: 1 1 auto;                     /* Expandable content area */
    overflow-y: auto;
    padding: 16px;
  }
  
  .planner-panel {
    flex: 0 0 auto;                     /* Fixed planner panel */
    border-top: 1px solid var(--vscode-panel-border);
  }
  
  .input-area {
    flex: 0 0 auto;                     /* Fixed input area */
    padding: 16px;
    background: var(--vscode-sideBar-background);
  }
}
```

---

## 8.3 JavaScript Component Sistemi

### 🧩 Component Architecture

Her UI bileşeni, ES6 modules kullanarak bağımsız olarak geliştirilmiş ve merkezi bir orchestrator tarafından yönetilmektedir:

```javascript
// components/index.js - Component Orchestrator
export function initComponents() {
    // Initialize components in dependency order
    const initOrder = [
        'ChatView',      // Core chat functionality
        'FileTags',      // File context display
        'Header',        // Navigation and controls
        'HistoryPanel',  // Conversation history
        'InputArea',     // Message input and actions
        'SettingsModal', // Settings management
        'AgentView'      // Agent mode specific UI
    ];
    
    initOrder.forEach(componentName => {
        try {
            const component = window[componentName];
            if (component && typeof component.init === 'function') {
                component.init();
                console.log(`✅ ${componentName} initialized`);
            }
        } catch (error) {
            console.error(`❌ ${componentName} failed to initialize:`, error);
        }
    });
}
```

### 💬 Chat View Component

Chat View, ana konuşma arayüzünü yöneten core component'tir:

```javascript
// components/chat_view.js
class ChatViewComponent {
    constructor() {
        this.streamingBuffer = '';
        this.textQueue = [];
        this.isTypingAnimationRunning = false;
        this.shouldAutoScroll = true;
        this.plannerSteps = new Map();
        this.completedSteps = new Set();
    }
    
    init() {
        this.setupEventListeners();
        this.initializeTemplates();
        this.setupScrollBehavior();
    }
    
    // Message rendering with markdown support
    createMessageElement(role, content) {
        const template = document.getElementById('message-template');
        const messageEl = template.content.cloneNode(true);
        
        const messageDiv = messageEl.querySelector('.message');
        messageDiv.classList.add(role);
        
        // Set avatar
        const avatar = messageEl.querySelector('.avatar-icon');
        avatar.src = role === 'user' 
            ? document.body.dataset.userIconUri 
            : document.body.dataset.aiIconUri;
        avatar.alt = role === 'user' ? 'User' : 'AI';
        
        // Set content
        const contentDiv = messageEl.querySelector('.message-content');
        if (role === 'assistant') {
            // Parse markdown for AI responses
            contentDiv.innerHTML = marked.parse(content);
            this.addCodeBlockActions(contentDiv);
        } else {
            // Plain text for user messages
            contentDiv.innerHTML = `<p>${this.escapeHtml(content)}</p>`;
        }
        
        return messageDiv;
    }
    
    // Real-time streaming text animation
    async startStreamingAnimation(targetElement, fullText) {
        this.isTypingAnimationRunning = true;
        const chars = Array.from(fullText);
        let currentIndex = 0;
        
        while (currentIndex < chars.length && this.isTypingAnimationRunning) {
            const chunk = chars.slice(currentIndex, currentIndex + 3).join('');
            targetElement.innerHTML += chunk;
            currentIndex += 3;
            
            // Syntax highlighting for code blocks
            this.highlightCodeBlocks(targetElement);
            
            // Auto-scroll if needed
            if (this.shouldAutoScroll) {
                this.scrollToBottom();
            }
            
            // Dynamic speed adjustment
            await this.delay(this.calculateDelay());
        }
        
        this.isTypingAnimationRunning = false;
    }
    
    // Code block enhancement
    addCodeBlockActions(container) {
        const codeBlocks = container.querySelectorAll('pre code');
        
        codeBlocks.forEach(codeBlock => {
            const pre = codeBlock.parentElement;
            if (pre.querySelector('.code-actions')) return; // Already processed
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'code-actions';
            
            // Copy button
            const copyBtn = this.createActionButton('copy', 'Kopyala', () => {
                navigator.clipboard.writeText(codeBlock.textContent);
                this.showToast('Kod kopyalandı!');
            });
            
            // Apply changes button
            const applyBtn = this.createActionButton('apply', 'Uygula', () => {
                this.applyCodeChanges(codeBlock.textContent);
            });
            
            // Insert code button
            const insertBtn = this.createActionButton('insert', 'Ekle', () => {
                this.insertCode(codeBlock.textContent);
            });
            
            actionsDiv.appendChild(copyBtn);
            actionsDiv.appendChild(applyBtn);
            actionsDiv.appendChild(insertBtn);
            
            pre.appendChild(actionsDiv);
        });
    }
}
```

### 📝 Input Area Component

Input Area, mesaj giriş alanını ve dosya yükleme functionality'sini yönetir:

```javascript
// components/InputArea.js
class InputAreaComponent {
    constructor() {
        this.textarea = null;
        this.sendButton = null;
        this.attachButton = null;
        this.fileInput = null;
        this.maxCharacters = 8000;
    }
    
    init() {
        this.initializeElements();
        this.setupEventListeners();
        this.setupFileHandling();
        this.setupAutoResize();
    }
    
    setupEventListeners() {
        // Send message on Enter (but allow Shift+Enter for new lines)
        this.textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });
        
        // Auto-resize textarea
        this.textarea.addEventListener('input', () => {
            this.autoResize();
            this.updateCharacterCount();
        });
        
        // Send button click
        this.sendButton.addEventListener('click', () => {
            this.handleSendMessage();
        });
    }
    
    handleSendMessage() {
        const content = this.textarea.value.trim();
        if (!content) return;
        
        // Get current mode and conversation context
        const state = getState();
        const messageData = {
            type: 'userMessage',
            content: content,
            mode: state.agentMode ? 'agent' : 'chat',
            conversationId: state.activeConversationId,
            contextFiles: state.contextFiles
        };
        
        // Send to extension
        postMessage(messageData);
        
        // Clear input
        this.textarea.value = '';
        this.autoResize();
        this.updateCharacterCount();
        
        // Update UI state
        setAiResponding(true);
    }
    
    // Auto-resize functionality
    autoResize() {
        this.textarea.style.height = 'auto';
        const newHeight = Math.min(this.textarea.scrollHeight, 120); // Max 6 lines
        this.textarea.style.height = newHeight + 'px';
    }
    
    // File upload handling
    setupFileHandling() {
        this.attachButton.addEventListener('click', () => {
            this.fileInput.click();
        });
        
        this.fileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files);
        });
        
        // Drag and drop support
        this.textarea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.textarea.classList.add('drag-over');
        });
        
        this.textarea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.textarea.classList.remove('drag-over');
            this.handleFileUpload(e.dataTransfer.files);
        });
    }
    
    async handleFileUpload(files) {
        const fileArray = Array.from(files);
        const processedFiles = [];
        
        for (const file of fileArray) {
            try {
                const content = await this.readFileContent(file);
                processedFiles.push({
                    name: file.name,
                    content: content,
                    size: file.size
                });
            } catch (error) {
                console.error(`File read error for ${file.name}:`, error);
            }
        }
        
        if (processedFiles.length > 0) {
            postMessage({
                type: 'fileUpload',
                files: processedFiles
            });
        }
    }
}
```

### 🏗️ Header Component

Header Component, navigasyon ve kontrol butonlarını yönetir:

```javascript
// components/Header.js
class HeaderComponent {
    constructor() {
        this.logoButton = null;
        this.historyButton = null;
        this.newChatButton = null;
        this.settingsButton = null;
        this.languageToggle = null;
    }
    
    init() {
        this.initializeElements();
        this.setupEventListeners();
        this.setupLanguageToggle();
    }
    
    setupEventListeners() {
        // Logo click - show welcome presentation
        this.logoButton.addEventListener('click', () => {
            this.showWelcomePresentation();
        });
        
        // History panel toggle
        this.historyButton.addEventListener('click', () => {
            this.toggleHistoryPanel();
        });
        
        // New conversation
        this.newChatButton.addEventListener('click', () => {
            this.createNewConversation();
        });
        
        // Settings modal
        this.settingsButton.addEventListener('click', () => {
            this.openSettingsModal();
        });
    }
    
    setupLanguageToggle() {
        this.languageToggle.addEventListener('change', (e) => {
            const language = e.target.checked ? 'en' : 'tr';
            this.setLanguage(language);
            
            // Send to extension
            postMessage({
                type: 'languageChange',
                language: language
            });
        });
    }
    
    createNewConversation() {
        // Clear current chat
        const chatView = window.ChatView;
        if (chatView && typeof chatView.clear === 'function') {
            chatView.clear();
        }
        
        // Reset state
        resetChatState();
        
        // Notify extension
        postMessage({
            type: 'newConversation'
        });
    }
}
```

### 🤖 Agent View Component

Agent View, agent moduna özel UI elementlerini yönetir:

```javascript
// components/agent_view.js
class AgentViewComponent {
    constructor() {
        this.agentModeToggle = null;
        this.plannerPanel = null;
        this.planActToggle = null;
        this.planStepsList = null;
    }
    
    init() {
        this.initializeElements();
        this.setupEventListeners();
        this.setupPlannerPanel();
    }
    
    setupEventListeners() {
        // Agent mode toggle
        this.agentModeToggle.addEventListener('change', (e) => {
            const isAgentMode = e.target.checked;
            this.toggleAgentMode(isAgentMode);
        });
        
        // Plan/Act mode toggle
        this.planActToggle.addEventListener('change', (e) => {
            const isActMode = e.target.checked;
            this.togglePlanActMode(isActMode);
        });
    }
    
    toggleAgentMode(isActive) {
        // Update local state
        setAgentMode(isActive);
        
        // Update UI
        document.body.classList.toggle('agent-mode', isActive);
        this.updateAgentModeUI(isActive);
        
        // Notify extension
        postMessage({
            type: 'agentModeToggle',
            isActive: isActive
        });
    }
    
    updateAgentModeUI(isActive) {
        // Show/hide agent-specific elements
        const agentElements = document.querySelectorAll('.agent-only');
        agentElements.forEach(el => {
            el.style.display = isActive ? 'block' : 'none';
        });
        
        // Update input placeholder
        const inputArea = document.getElementById('prompt-input');
        if (inputArea) {
            inputArea.placeholder = isActive 
                ? 'Agent modunda soru sorun...'
                : 'İvme\'ye soru sorun...';
        }
    }
    
    displayPlan(plan) {
        if (!plan || !plan.steps) return;
        
        this.planStepsList.innerHTML = '';
        
        plan.steps.forEach((step, index) => {
            const stepElement = this.createPlanStepElement(step, index);
            this.planStepsList.appendChild(stepElement);
        });
        
        // Show planner panel
        this.plannerPanel.classList.remove('hidden');
    }
    
    createPlanStepElement(step, index) {
        const stepDiv = document.createElement('li');
        stepDiv.className = 'plan-step';
        stepDiv.dataset.stepIndex = index;
        
        stepDiv.innerHTML = `
            <div class="step-content">
                <div class="step-title">${step.label}</div>
                <div class="step-description">${step.description || ''}</div>
                <div class="step-status pending">Bekliyor</div>
            </div>
        `;
        
        return stepDiv;
    }
    
    updateStepStatus(stepIndex, status, result = null) {
        const stepElement = this.planStepsList.querySelector(
            `[data-step-index="${stepIndex}"]`
        );
        
        if (stepElement) {
            const statusEl = stepElement.querySelector('.step-status');
            statusEl.textContent = this.getStatusText(status);
            statusEl.className = `step-status ${status}`;
            
            if (result) {
                const resultEl = document.createElement('div');
                resultEl.className = 'step-result';
                resultEl.textContent = result;
                stepElement.appendChild(resultEl);
            }
        }
    }
}
```

---

## 8.4 CSS Architecture ve Styling

### 🎨 Modular CSS Structure

İvme'nin CSS mimarisi, modular ve maintainable bir yaklaşım benimser:

```css
/* css/chat.css - Ana orchestrator */
@import url('./base.css');              /* Temel stiller ve değişkenler */
@import url('./header.css');            /* Başlık bileşeni */
@import url('./message.css');           /* Mesaj bileşenleri */
@import url('./input.css');             /* Giriş alanı */
@import url('./modal.css');             /* Modal diyaloglar */
```

### 🎯 CSS Variables ve VS Code Entegrasyonu

```css
:root {
  /* VS Code tema entegrasyonu */
  --bg-primary: var(--vscode-editor-background);
  --text-primary: var(--vscode-editor-foreground);
  --border-color: var(--vscode-panel-border);
  --accent-color: var(--vscode-focusBorder);
  
  /* Layout constants */
  --header-height: 60px;
  --border-radius: 8px;
  --transition-fast: 0.15s ease;
}
```

## 8.5 State Management

### 🗂️ Global State System

```javascript
// core/state.js
class UIState {
  constructor() {
    this.state = {
      agentMode: false,
      isAiResponding: false,
      contextFiles: [],
      language: 'tr'
    };
  }
  
  setState(key, value) {
    this.state[key] = value;
    this.notifySubscribers(key, value);
  }
}
```

## 8.6 Message Router

### 📡 VS Code Communication

```javascript
// core/message_router.js
class MessageRouter {
  postMessage(message) {
    this.vscode.postMessage(message);
  }
  
  handleIncomingMessage(data) {
    const handler = this.messageHandlers.get(data.type);
    if (handler) handler(data);
  }
}
```

---

<div align="center">
  <h2>🎨 Modern Web UI Excellence</h2>
  <p><em>VS Code entegrasyonu ile native deneyim</em></p>
</div>

Bu webview UI bölümünde ele alınanlar:

- ✅ **UI Architecture**: Modular component sistemi
- ✅ **HTML Template**: Secure, dynamic template yapısı  
- ✅ **JavaScript Components**: Modern ES6 module architecture
- ✅ **CSS Architecture**: Maintainable, themeable styling
- ✅ **State Management**: Reactive state system
- ✅ **Message Router**: VS Code communication
- ✅ **Performance**: Optimization techniques

Bir sonraki bölümde **"Sistem Promptları"**nı inceleyeceğiz! 🚀
