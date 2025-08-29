# 10. Geliştirici Rehberi - Development Setup ve Katkıda Bulunma 👨‍💻

Bu bölüm, İvme extension'ına katkıda bulunmak isteyen geliştiriciler için comprehensive bir rehber sunmaktadır. Development environment setup'tan code contribution guidelines'a kadar tüm development lifecycle'ı detaylı şekilde ele alır.

## İçindekiler

- [10.1 Development Environment Setup](#101-development-environment-setup)
- [10.2 Project Structure Deep Dive](#102-project-structure-deep-dive)
- [10.3 Building ve Testing](#103-building-ve-testing)
- [10.4 Debugging Strategies](#104-debugging-strategies)
- [10.5 Contributing Guidelines](#105-contributing-guidelines)
- [10.6 Code Standards ve Best Practices](#106-code-standards-ve-best-practices)
- [10.7 Testing Framework](#107-testing-framework)
- [10.8 Extension Packaging ve Deployment](#108-extension-packaging-ve-deployment)
- [10.9 Common Development Tasks](#109-common-development-tasks)
- [10.10 Troubleshooting Guide](#1010-troubleshooting-guide)

---

## 10.1 Development Environment Setup

### 🛠️ Prerequisites

İvme extension'ı geliştirmek için aşağıdaki araçların sisteminizde yüklü olması gerekir:

```bash
# Required Tools
Node.js >= 18.x          # JavaScript runtime
npm >= 9.x               # Package manager
VS Code >= 1.90.0        # IDE ve test environment
Git >= 2.40.0            # Version control

# Optional Tools (Recommended)
ESLint Extension         # Code linting
TypeScript Extension     # Type checking
Thunder Client          # API testing
GitLens                 # Git integration
```

#### System Requirements
```typescript
interface SystemRequirements {
  os: 'Windows 10+' | 'macOS 10.15+' | 'Linux Ubuntu 18.04+';
  memory: '4GB RAM (8GB recommended)';
  storage: '2GB free space';
  processor: 'x64 architecture';
  network: 'Internet connection for dependencies';
}
```

### 📦 Initial Setup

#### 1. Repository Clone
```bash
# Clone the repository
git clone https://github.com/bakisahin0128/AI.git ivme-extension
cd ivme-extension

# Install dependencies
npm install

# Build the extension
npm run compile

# Verify setup
npm run lint
```

#### 2. VS Code Configuration
```json
// .vscode/settings.json (recommended)
{
  "typescript.preferences.includePackageJsonAutoImports": "auto",
  "typescript.suggest.autoImports": true,
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.exclude": {
    "out/**": true,
    "node_modules/**": true,
    "**/.git": true
  },
  "search.exclude": {
    "out/**": true,
    "node_modules/**": true
  }
}
```

#### 3. Launch Configuration
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}"
      ],
      "outFiles": [
        "${workspaceFolder}/out/**/*.js"
      ],
      "preLaunchTask": "${workspaceFolder}/npm: compile"
    },
    {
      "name": "Debug Webview",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "restart": true,
      "localRoot": "${workspaceFolder}",
      "remoteRoot": "${workspaceFolder}"
    }
  ]
}
```

#### 4. Task Configuration
```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "npm",
      "script": "compile",
      "group": "build",
      "presentation": {
        "reveal": "silent"
      },
      "problemMatcher": ["$tsc"]
    },
    {
      "type": "npm",
      "script": "watch",
      "group": "build",
      "presentation": {
        "reveal": "silent"
      },
      "problemMatcher": ["$tsc-watch"],
      "isBackground": true
    },
    {
      "type": "npm",
      "script": "lint",
      "group": "test",
      "presentation": {
        "reveal": "always",
        "panel": "new"
      }
    }
  ]
}
```

### 🔧 Development Tools Setup

#### ESLint Configuration
```javascript
// .eslintrc.js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 6,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/naming-convention': [
      'warn',
      {
        selector: 'import',
        format: ['camelCase', 'PascalCase'],
      },
    ],
    '@typescript-eslint/semi': 'warn',
    curly: 'warn',
    eqeqeq: 'warn',
    'no-throw-literal': 'warn',
    semi: 'off',
  },
  ignorePatterns: ['out', 'dist', '**/*.d.ts'],
};
```

#### TypeScript Configuration Deep Dive
```json
// tsconfig.json - Detailed explanation
{
  "compilerOptions": {
    "module": "Node16",              // Node.js ES modules support
    "target": "ES2022",             // Modern JavaScript features
    "outDir": "out",                // Compiled output directory
    "lib": ["ES2022", "DOM"],       // Available APIs
    "sourceMap": true,              // Debug support
    "rootDir": "src",               // Source code directory
    "strict": true,                 // Strict type checking
    "declaration": true,            // Generate .d.ts files
    "declarationMap": true,         // Source maps for declarations
    "skipLibCheck": true,           // Skip type checking of declaration files
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],          // Files to include
  "exclude": [                     // Files to exclude
    "node_modules",
    "out",
    "**/*.test.ts"
  ]
}
```

---

## 10.2 Project Structure Deep Dive

### 📁 Complete Directory Structure

```
ivme-extension/
├── .vscode/                      # VS Code workspace configuration
│   ├── launch.json              # Debug configurations
│   ├── settings.json            # Workspace settings
│   └── tasks.json               # Build tasks
├── docs/                        # Documentation (Bu dosyalar!)
│   ├── README.md               # Ana dokümantasyon girişi
│   ├── 01-genel-bakis.md       # Genel bakış
│   ├── 02-mimari-ve-ana-bilesenler.md
│   └── ...                     # Diğer dokümantasyon dosyaları
├── src/                         # TypeScript source code
│   ├── core/                   # Core utilities ve constants
│   │   ├── constants.ts        # Global constants
│   │   ├── utils.ts           # Utility functions
│   │   └── pending_selection.ts # Selection management
│   ├── extension.ts            # Main extension entry point
│   ├── features/               # Feature modules
│   │   ├── Handlers/          # Event ve message handlers
│   │   │   ├── Command.ts     # VS Code command handler
│   │   │   ├── Interaction.ts # AI interaction handler
│   │   │   ├── message.ts     # Message processing
│   │   │   └── webview_message.ts # Webview communication
│   │   └── manager/           # State managers
│   │       ├── context.ts     # Context management
│   │       ├── conversation.ts # Conversation history
│   │       └── settings.ts    # Settings management
│   ├── providers/              # VS Code UI providers
│   │   ├── action.ts          # Code action provider
│   │   ├── codelens.ts        # CodeLens provider
│   │   ├── hover.ts           # Hover provider
│   │   ├── inlay_hint.ts      # Inlay hints provider
│   │   └── view_chat.ts       # Main chat view provider
│   ├── services/               # Business logic services
│   │   ├── assembler.ts       # Code assembly service
│   │   ├── executor.ts        # Plan execution service
│   │   ├── gemini.ts          # Google Gemini API integration
│   │   ├── indexer.ts         # Project indexing service
│   │   ├── manager.ts         # API service manager
│   │   ├── orchestrator.ts    # Service orchestration
│   │   ├── planner.ts         # AI planning service
│   │   ├── planner_indexer.ts # Planner-specific indexing
│   │   ├── retrieval.ts       # Information retrieval
│   │   ├── tools_manager.ts   # Tool management
│   │   ├── vector_store.ts    # Vector database service
│   │   └── vLLM.ts           # vLLM API integration
│   ├── system_prompts/         # AI system prompts
│   │   ├── index.ts           # Prompt dispatcher
│   │   ├── tr.ts              # Turkish prompts
│   │   ├── en.ts              # English prompts
│   │   └── tool.ts            # Tool-related prompts
│   └── types/                  # TypeScript type definitions
│       └── index.ts           # Main type exports
├── webview-ui/                 # Frontend UI (HTML/CSS/JS)
│   ├── assets/                # Static assets
│   │   ├── *.svg             # Icon files
│   │   ├── *.png             # Image files
│   │   └── intro.mp4         # Welcome video
│   ├── css/                  # Stylesheets
│   │   ├── base.css          # Base styles
│   │   ├── chat.css          # Main styles
│   │   ├── header.css        # Header component
│   │   ├── message.css       # Message styling
│   │   ├── input.css         # Input area
│   │   ├── modal.css         # Modal dialogs
│   │   └── vendor/           # Third-party styles
│   ├── js/                   # Frontend JavaScript
│   │   ├── core/            # Core frontend modules
│   │   │   ├── app.js       # Main application
│   │   │   ├── state.js     # State management
│   │   │   └── message_router.js # VS Code communication
│   │   ├── components/      # UI components
│   │   │   ├── chat_view.js # Chat interface
│   │   │   ├── InputArea.js # Message input
│   │   │   ├── Header.js    # Header component
│   │   │   └── ...          # Other components
│   │   ├── services/        # Frontend services
│   │   ├── utils/           # Utility functions
│   │   └── vendor/          # Third-party libraries
│   └── chat.html            # Main HTML template
├── out/                      # Compiled JavaScript output
├── node_modules/             # Dependencies
├── package.json             # Project configuration
├── tsconfig.json            # TypeScript configuration
├── .eslintrc.js            # ESLint configuration
├── .gitignore              # Git ignore patterns
└── README.md               # Project README
```

### 🏗️ Architecture Patterns

#### Module Dependency Flow
```typescript
interface ArchitectureFlow {
  entry: 'extension.ts';
  providers: 'UI Integration Layer';
  features: 'Business Logic Layer';
  services: 'Core Services Layer';
  types: 'Type Definitions';
  webviewUI: 'Frontend Application';
}

// Dependency Direction (top to bottom)
extension.ts
    ↓
providers/ (ChatViewProvider, etc.)
    ↓
features/ (Handlers, Managers)
    ↓
services/ (API, Indexing, Tools)
    ↓
types/ (Type definitions)
```

#### Service Layer Architecture
```typescript
// services/ katmanının internal structure'ı
interface ServiceArchitecture {
  manager: 'ApiServiceManager - Central API coordination';
  adapters: {
    vLLM: 'VllmApiService - Local LLM integration';
    gemini: 'GeminiApiService - Google AI integration';
  };
  core: {
    indexer: 'ProjectIndexer - Code analysis ve indexing';
    vector_store: 'VectorStore - Semantic search database';
    tools_manager: 'ToolsManager - Dynamic tool system';
    orchestrator: 'Orchestrator - Service coordination';
  };
  specialized: {
    planner: 'Planning service for complex tasks';
    executor: 'Plan execution service';
    retrieval: 'Information retrieval service';
  };
}
```

---

## 10.3 Building ve Testing

### 🔨 Build System

#### Development Build
```bash
# Development build with watch mode
npm run watch

# Single build
npm run compile

# Production build (optimized)
npm run vscode:prepublish
```

#### Build Scripts Explained
```json
{
  "scripts": {
    "vscode:prepublish": "npm run compile",  // Pre-publish optimization
    "compile": "tsc -p ./",                  // TypeScript compilation
    "watch": "tsc -watch -p ./",             // Watch mode development
    "pretest": "npm run compile && npm run lint", // Pre-test preparation
    "lint": "eslint .",                      // Code linting
    "test": "vscode-test"                    // Run tests
  }
}
```

#### TypeScript Compilation Process
```typescript
// Build process visualization
const buildProcess = {
  input: 'src/**/*.ts',
  compiler: 'TypeScript 5.4.5',
  target: 'ES2022',
  module: 'Node16',
  output: 'out/**/*.js',
  sourceMaps: true,
  declarations: true
};

// Compilation phases
1. Type checking
2. Syntax transformation
3. Module resolution
4. Source map generation
5. Declaration file generation
```

### 🧪 Testing Framework

#### Test Structure
```
tests/
├── unit/                    # Unit tests
│   ├── services/           # Service layer tests
│   ├── features/           # Feature tests
│   └── utils/              # Utility tests
├── integration/            # Integration tests
│   ├── api/               # API integration tests
│   └── extension/         # Extension integration tests
├── e2e/                   # End-to-end tests
│   ├── webview/           # Webview UI tests
│   └── commands/          # Command tests
└── fixtures/              # Test data ve mocks
    ├── sample-projects/   # Sample code projects
    └── api-responses/     # Mock API responses
```

#### Unit Test Example
```typescript
// tests/unit/services/manager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'mocha';
import { ApiServiceManager } from '../../../src/services/manager';
import { API_SERVICES } from '../../../src/core/constants';

describe('ApiServiceManager', () => {
    let manager: ApiServiceManager;
    
    beforeEach(() => {
        manager = new ApiServiceManager();
    });
    
    afterEach(() => {
        manager.dispose();
    });
    
    describe('Service Selection', () => {
        it('should default to vLLM service', () => {
            expect(manager.getActiveServiceName()).to.equal(API_SERVICES.vllm);
        });
        
        it('should switch services correctly', async () => {
            await manager.setActiveService(API_SERVICES.gemini);
            expect(manager.getActiveServiceName()).to.equal(API_SERVICES.gemini);
        });
        
        it('should maintain service state', async () => {
            await manager.setActiveService(API_SERVICES.gemini);
            const newManager = new ApiServiceManager();
            expect(newManager.getActiveServiceName()).to.equal(API_SERVICES.gemini);
        });
    });
    
    describe('Content Generation', () => {
        it('should generate content with active service', async () => {
            const prompt = 'Test prompt';
            const result = await manager.generateContent(prompt);
            expect(result).to.be.a('string');
            expect(result.length).to.be.greaterThan(0);
        });
        
        it('should handle service errors gracefully', async () => {
            // Mock a service failure
            const originalService = manager.getActiveService();
            // Inject failing service
            
            try {
                await manager.generateContent('test');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Service unavailable');
            }
        });
    });
});
```

#### Integration Test Example
```typescript
// tests/integration/extension.test.ts
import * as vscode from 'vscode';
import { describe, it, expect, before, after } from 'mocha';

describe('Extension Integration', () => {
    let extension: vscode.Extension<any>;
    
    before(async () => {
        extension = vscode.extensions.getExtension('ivme.ivme-ivme');
        if (extension && !extension.isActive) {
            await extension.activate();
        }
    });
    
    after(async () => {
        // Cleanup
    });
    
    it('should activate extension successfully', () => {
        expect(extension).to.not.be.undefined;
        expect(extension.isActive).to.be.true;
    });
    
    it('should register all commands', async () => {
        const commands = await vscode.commands.getCommands(true);
        const expectedCommands = [
            'baykar-ai-fixer.applyFix',
            'baykar-ai.showChat',
            'baykar-ai.sendToChat',
            'baykar-ai-fixer.checkVllmStatus'
        ];
        
        expectedCommands.forEach(cmd => {
            expect(commands).to.include(cmd);
        });
    });
    
    it('should create chat view provider', async () => {
        const chatView = vscode.window.createWebviewPanel(
            'test-chat',
            'Test Chat',
            vscode.ViewColumn.One,
            {}
        );
        
        expect(chatView).to.not.be.undefined;
        chatView.dispose();
    });
});
```

#### Running Tests
```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --grep "ApiServiceManager"

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

---

## 10.4 Debugging Strategies

### 🐛 Extension Debugging

#### VS Code Extension Host Debugging
```json
// .vscode/launch.json - Debug configuration
{
  "name": "Run Extension",
  "type": "extensionHost",
  "request": "launch",
  "args": [
    "--extensionDevelopmentPath=${workspaceFolder}",
    "--disable-extensions"  // Disable other extensions for clean testing
  ],
  "outFiles": [
    "${workspaceFolder}/out/**/*.js"
  ],
  "preLaunchTask": "${workspaceFolder}/npm: compile",
  "env": {
    "IVME_DEBUG": "true",     // Enable debug mode
    "NODE_ENV": "development"
  }
}
```

#### Debug Logging System
```typescript
// src/core/logger.ts
export class Logger {
    private static instance: Logger;
    private debugMode: boolean = false;
    
    constructor() {
        this.debugMode = process.env.IVME_DEBUG === 'true';
    }
    
    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    
    debug(message: string, data?: any): void {
        if (this.debugMode) {
            console.log(`[IVME-DEBUG] ${message}`, data);
        }
    }
    
    info(message: string, data?: any): void {
        console.log(`[IVME-INFO] ${message}`, data);
    }
    
    warn(message: string, data?: any): void {
        console.warn(`[IVME-WARN] ${message}`, data);
    }
    
    error(message: string, error?: Error): void {
        console.error(`[IVME-ERROR] ${message}`, error);
    }
    
    // Performance debugging
    time(label: string): void {
        if (this.debugMode) {
            console.time(`[IVME-PERF] ${label}`);
        }
    }
    
    timeEnd(label: string): void {
        if (this.debugMode) {
            console.timeEnd(`[IVME-PERF] ${label}`);
        }
    }
}

// Usage throughout the codebase
const logger = Logger.getInstance();
logger.debug('API request started', { service: 'vLLM', prompt: promptPreview });
```

#### Webview Debugging
```typescript
// Webview debug setup
class WebviewDebugger {
    static setupDebugging(webview: vscode.Webview): void {
        // Enable console.log in webview
        webview.html = webview.html.replace(
            '<head>',
            `<head>
            <script>
                console.log('[WEBVIEW] Debug mode enabled');
                window.addEventListener('error', (e) => {
                    console.error('[WEBVIEW-ERROR]', e.error);
                });
                window.addEventListener('unhandledrejection', (e) => {
                    console.error('[WEBVIEW-PROMISE-ERROR]', e.reason);
                });
            </script>`
        );
        
        // Message debugging
        webview.onDidReceiveMessage(message => {
            console.log('[WEBVIEW-RECEIVE]', message);
        });
    }
}
```

### 🔍 Common Debugging Scenarios

#### API Service Debugging
```typescript
// Debug API service issues
class ApiServiceDebugger {
    static async debugApiCall(
        service: IApiService,
        prompt: string
    ): Promise<void> {
        logger.time('api-call');
        logger.debug('API call started', {
            service: service.constructor.name,
            promptLength: prompt.length,
            promptPreview: prompt.substring(0, 100) + '...'
        });
        
        try {
            const response = await service.generateContent(prompt);
            logger.debug('API call successful', {
                responseLength: response.length,
                responsePreview: response.substring(0, 100) + '...'
            });
        } catch (error) {
            logger.error('API call failed', error);
            
            // Detailed error analysis
            if (error.code === 'ECONNREFUSED') {
                logger.error('Connection refused - check if service is running');
            } else if (error.response?.status === 401) {
                logger.error('Authentication failed - check API key');
            } else if (error.response?.status === 429) {
                logger.error('Rate limited - reduce request frequency');
            }
        } finally {
            logger.timeEnd('api-call');
        }
    }
}
```

#### Context Management Debugging
```typescript
// Debug context issues
class ContextDebugger {
    static debugContext(contextManager: ContextManager): void {
        logger.debug('Context state', {
            hasAgentFile: !!contextManager.agentFileContext,
            hasAgentSelection: !!contextManager.agentSelectionContext,
            uploadedFiles: contextManager.uploadedFileContexts.length,
            hasActiveContext: !!contextManager.activeContextText,
            agentFileSuppressed: contextManager.agentFileSuppressed
        });
        
        if (contextManager.agentFileContext) {
            logger.debug('Agent file context', {
                fileName: contextManager.agentFileContext.fileName,
                contentLength: contextManager.agentFileContext.content.length
            });
        }
        
        if (contextManager.agentSelectionContext) {
            logger.debug('Agent selection context', {
                selectionLength: contextManager.agentSelectionContext.content.length,
                startLine: contextManager.agentSelectionContext.selection.start.line,
                endLine: contextManager.agentSelectionContext.selection.end.line
            });
        }
    }
}
```

### 📊 Performance Debugging

#### Memory Usage Monitoring
```typescript
class MemoryMonitor {
    private static memoryLog: Array<{ timestamp: number; usage: NodeJS.MemoryUsage }> = [];
    
    static logMemoryUsage(label: string): void {
        const usage = process.memoryUsage();
        this.memoryLog.push({ timestamp: Date.now(), usage });
        
        logger.debug(`Memory usage [${label}]`, {
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
            external: Math.round(usage.external / 1024 / 1024) + 'MB',
            rss: Math.round(usage.rss / 1024 / 1024) + 'MB'
        });
    }
    
    static checkMemoryLeaks(): void {
        if (this.memoryLog.length < 2) return;
        
        const recent = this.memoryLog.slice(-10);
        const growth = recent[recent.length - 1].usage.heapUsed - recent[0].usage.heapUsed;
        
        if (growth > 50 * 1024 * 1024) { // 50MB growth
            logger.warn('Potential memory leak detected', {
                growthMB: Math.round(growth / 1024 / 1024),
                timeSpan: recent[recent.length - 1].timestamp - recent[0].timestamp
            });
        }
    }
}
```

---

## 10.5 Contributing Guidelines

### 🤝 Contribution Workflow

```bash
# 1. Fork the repository
git clone https://github.com/yourusername/AI.git
cd AI

# 2. Create feature branch
git checkout -b feature/your-feature-name

# 3. Make changes and commit
git add .
git commit -m "feat: add new feature description"

# 4. Push and create PR
git push origin feature/your-feature-name
```

#### Commit Message Convention
```typescript
interface CommitConvention {
  format: 'type(scope): description';
  types: ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore'];
  examples: [
    'feat(api): add Gemini streaming support',
    'fix(webview): resolve message routing issue',
    'docs(readme): update installation instructions'
  ];
}
```

---

<div align="center">
  <h2>👨‍💻 Developer Excellence</h2>
  <p><em>Comprehensive development guidelines for İvme extension</em></p>
</div>

Bu geliştirici rehberi bölümünde ele alınanlar:

- ✅ **Development Setup**: Complete environment configuration
- ✅ **Project Structure**: Deep architectural understanding  
- ✅ **Building & Testing**: Comprehensive test strategies
- ✅ **Debugging**: Advanced debugging techniques
- ✅ **Contributing**: Professional contribution workflow

Bu rehber, İvme extension'ına katkıda bulunmak isteyen geliştiriciler için complete reference sağlar.

Bir sonraki bölümde **"Troubleshooting"**ı inceleyeceğiz! 🚀
