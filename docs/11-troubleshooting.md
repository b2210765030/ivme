# 11. Troubleshooting - Sorun Giderme ve Performans Optimizasyonu 🔧

Bu bölüm, İvme extension'ı kullanırken karşılaşabileceğiniz common problems ve bunların systematic solutions'larını detaylı şekilde ele alır. Her problem için step-by-step çözüm adımları, prevention strategies ve performance optimization tips sunulur.

## İçindekiler

- [11.1 Genel Sorun Giderme Yaklaşımı](#111-genel-sorun-giderme-yaklaşımı)
- [11.2 Installation ve Activation Sorunları](#112-installation-ve-activation-sorunları)
- [11.3 API Service Connectivity Issues](#113-api-service-connectivity-issues)
- [11.4 Configuration ve Settings Problemleri](#114-configuration-ve-settings-problemleri)
- [11.5 Performance Issues ve Optimization](#115-performance-issues-ve-optimization)
- [11.6 Webview ve UI Sorunları](#116-webview-ve-ui-sorunları)
- [11.7 Extension Crashes ve Error Recovery](#117-extension-crashes-ve-error-recovery)
- [11.8 Memory Management ve Resource Leaks](#118-memory-management-ve-resource-leaks)
- [11.9 Network ve Connectivity Problems](#119-network-ve-connectivity-problems)
- [11.10 Advanced Diagnostic Tools](#1110-advanced-diagnostic-tools)

---

## 11.1 Genel Sorun Giderme Yaklaşımı

### 🎯 Systematic Debugging Approach

#### Problem Identification Framework
```typescript
interface TroubleshootingFramework {
  step1: 'Identify symptoms and exact error messages';
  step2: 'Reproduce the issue consistently';
  step3: 'Check logs and gather diagnostic information';
  step4: 'Isolate the problem domain (UI, API, configuration)';
  step5: 'Apply targeted solutions';
  step6: 'Verify fix and prevent recurrence';
}
```

#### Information Gathering Checklist
```typescript
interface DiagnosticInfo {
  environment: {
    vscodeVersion: string;           // Help > About VS Code
    extensionVersion: string;        // Extensions view
    operatingSystem: string;         // Windows/macOS/Linux version
    nodeVersion: string;             // node --version
  };
  configuration: {
    activeApiService: 'vLLM' | 'Gemini';
    indexingEnabled: boolean;
    agentModeActive: boolean;
    customSettings: object;
  };
  symptoms: {
    errorMessages: string[];
    reproducibleSteps: string[];
    affectedFeatures: string[];
    timing: 'startup' | 'runtime' | 'specific-action';
  };
}
```

### 📊 Log Location ve Inspection

#### VS Code Extension Logs
```bash
# Windows
%APPDATA%\Code\logs\{timestamp}\exthost\

# macOS  
~/Library/Application Support/Code/logs/{timestamp}/exthost/

# Linux
~/.config/Code/logs/{timestamp}/exthost/
```

#### İvme Extension Specific Logs
```typescript
// Enable debug logging via settings
{
  "baykar-ai-fixer.debug.enabled": true,
  "baykar-ai-fixer.debug.logLevel": "verbose"
}

// Or via environment variable
process.env.IVME_DEBUG = "true";
```

#### Log Analysis Commands
```bash
# Search for extension-related errors
grep -i "ivme\|baykar" ~/.config/Code/logs/*/exthost/*.log

# Filter by error level
grep -i "error\|exception\|fail" ~/.config/Code/logs/*/exthost/*.log

# Real-time log monitoring
tail -f ~/.config/Code/logs/*/exthost/*.log | grep -i ivme
```

---

## 11.2 Installation ve Activation Sorunları

### ❌ Extension Activation Failures

#### **Problem**: Extension fails to activate on VS Code startup

**Symptoms**:
```
Extension 'ivme.ivme-ivme' failed to activate.
Error: Cannot find module...
```

**Solution**:
```bash
# 1. Check Node.js version compatibility
node --version  # Should be >= 18.x

# 2. Reinstall extension
code --uninstall-extension ivme.ivme-ivme
code --install-extension ivme.ivme-ivme

# 3. Clear extension cache
rm -rf ~/.vscode/extensions/ivme.ivme-ivme-*
# Reinstall from marketplace

# 4. Reset VS Code settings (if needed)
mv ~/.config/Code/User/settings.json ~/.config/Code/User/settings.json.backup
```

#### **Problem**: Extension shows as "Not Compatible"

**Symptoms**:
```
This extension is not compatible with your VS Code version
```

**Solution**:
```json
// Check minimum VS Code version requirement
{
  "engines": {
    "vscode": "^1.90.0"  // Extension requires VS Code 1.90.0+
  }
}
```

```bash
# Update VS Code to latest version
# Windows: Help > Check for Updates
# macOS: Code > Check for Updates  
# Linux: Update via package manager

# Verify VS Code version
code --version
```

### ❌ Dependencies ve Module Loading Issues

#### **Problem**: "Cannot find module" errors during activation

**Solution**:
```typescript
// Common missing dependencies
interface MissingDependencies {
  "@google/generative-ai": "Update to version ^0.11.3";
  "axios": "HTTP client for API calls";
  "@babel/parser": "Code parsing for indexing";
  "cohere-ai": "Optional: for enhanced retrieval";
}
```

**Fix Commands**:
```bash
# Navigate to extension directory
cd ~/.vscode/extensions/ivme.ivme-ivme-*/

# Reinstall dependencies
npm install --production

# If permission issues on macOS/Linux
sudo npm install --production --unsafe-perm
```

### ❌ Permission ve Security Issues

#### **Problem**: Extension blocked by corporate security policies

**Symptoms**:
```
Extension execution prevented by security policy
Network requests blocked
```

**Solution**:
```typescript
interface SecurityWorkarounds {
  corporateProxy: {
    solution: 'Configure VS Code proxy settings';
    settings: {
      'http.proxy': 'http://proxy.company.com:8080';
      'http.proxyStrictSSL': false;
    };
  };
  firewall: {
    solution: 'Whitelist extension domains';
    domains: [
      '*.baykar.tech',
      'generativelanguage.googleapis.com',
      'api.cohere.ai'
    ];
  };
  execution: {
    solution: 'Enable trusted workspace';
    command: 'workbench.action.manageTrustedDomains';
  };
}
```

---

## 11.3 API Service Connectivity Issues

### 🔌 vLLM Connection Problems

#### **Problem**: "Connection refused" error with vLLM

**Symptoms**:
```
Error: connect ECONNREFUSED 127.0.0.1:8000
vLLM service is not responding
```

**Diagnostic Steps**:
```bash
# 1. Check if vLLM server is running
curl -X GET "http://ivme.baykar.tech/coder/v1/models"

# 2. Test local vLLM instance
curl -X GET "http://localhost:8000/v1/models"

# 3. Check network connectivity
ping ivme.baykar.tech
telnet ivme.baykar.tech 80
```

**Solutions**:
```typescript
interface VllmTroubleshooting {
  serverDown: {
    check: 'curl http://ivme.baykar.tech/coder/v1/models';
    action: 'Contact system administrator or use Gemini';
  };
  networkIssues: {
    check: 'ping ivme.baykar.tech';
    action: 'Check firewall, proxy settings';
  };
  configurationError: {
    check: 'Verify baseUrl in settings';
    action: 'Update baykar-ai-fixer.vllm.baseUrl';
  };
  timeout: {
    check: 'Large responses taking too long';
    action: 'Increase timeout in settings';
  };
}
```

**Configuration Fix**:
```json
{
  "baykar-ai-fixer.vllm.baseUrl": "http://ivme.baykar.tech/coder/v1",
  "baykar-ai-fixer.vllm.modelName": "o3-Qwen3-Coder-30B-A3B-Instruct",
  "baykar-ai-fixer.api.requestTimeoutMs": 45000
}
```

### 🔌 Google Gemini API Issues

#### **Problem**: "API key invalid" error with Gemini

**Symptoms**:
```
Error: API key not valid. Please pass a valid API key.
Gemini service authentication failed
```

**Solution**:
```typescript
class GeminiTroubleshooting {
    static validateApiKey(apiKey: string): boolean {
        // API key format: AIza...
        const pattern = /^AIza[0-9A-Za-z\-_]{35}$/;
        return pattern.test(apiKey);
    }
    
    static async testConnection(apiKey: string): Promise<void> {
        const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        
        try {
            const response = await fetch(testUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            console.log('✅ Gemini API connection successful');
        } catch (error) {
            console.error('❌ Gemini API connection failed:', error.message);
        }
    }
}
```

**Step-by-step Fix**:
```bash
# 1. Get new API key from Google AI Studio
# Visit: https://makersuite.google.com/app/apikey

# 2. Update VS Code settings
# Command Palette > "Preferences: Open Settings (JSON)"
{
  "baykar-ai-fixer.gemini.apiKey": "YOUR_NEW_API_KEY_HERE"
}

# 3. Restart VS Code to reload settings

# 4. Test connection via command
# Command Palette > "İvme: Aktif Sunucu Durumunu Kontrol Et"
```

### 🔌 Rate Limiting ve Quota Issues

#### **Problem**: "Too many requests" or quota exceeded

**Symptoms**:
```
Error: 429 Too Many Requests
Rate limit exceeded, please try again later
Quota exceeded for this API key
```

**Solutions**:
```typescript
interface RateLimitingSolutions {
  reduceFrequency: {
    setting: 'baykar-ai-fixer.api.requestDelay';
    value: 2000; // 2 second delay between requests
    description: 'Add delay between consecutive API calls';
  };
  
  batchRequests: {
    setting: 'baykar-ai-fixer.indexing.batchSize';
    value: 5; // Process 5 files at a time
    description: 'Reduce concurrent processing load';
  };
  
  quotaManagement: {
    monitor: 'Track daily API usage';
    rotate: 'Use multiple API keys if needed';
    fallback: 'Switch to alternative service';
  };
}
```

---

## 11.4 Configuration ve Settings Problemleri

### ⚙️ Settings Corruption ve Reset

#### **Problem**: Extension behaves unexpectedly due to corrupted settings

**Symptoms**:
```
Settings not persisting
Extension reverting to defaults
Inconsistent behavior across restarts
```

**Diagnostic Commands**:
```bash
# Check current settings
code --list-extensions --show-versions
grep -A 10 -B 10 "baykar-ai-fixer" ~/.config/Code/User/settings.json

# Backup current settings
cp ~/.config/Code/User/settings.json ~/.config/Code/User/settings.json.backup
```

**Settings Reset Procedure**:
```typescript
interface SettingsReset {
  step1: 'Backup current settings.json';
  step2: 'Remove all baykar-ai-fixer entries';
  step3: 'Restart VS Code';
  step4: 'Reconfigure extension step by step';
  step5: 'Test each setting individually';
}
```

**Clean Settings Template**:
```json
{
  "baykar-ai-fixer.api.activeService": "vLLM",
  "baykar-ai-fixer.vllm.baseUrl": "http://ivme.baykar.tech/coder/v1",
  "baykar-ai-fixer.vllm.modelName": "o3-Qwen3-Coder-30B-A3B-Instruct",
  "baykar-ai-fixer.indexing.enabled": true,
  "baykar-ai-fixer.indexing.includeGlobs": [
    "**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.py"
  ],
  "baykar-ai-fixer.indexing.excludeGlobs": [
    "**/node_modules/**", "**/dist/**", "**/out/**"
  ],
  "baykar-ai-fixer.chat.conversationHistoryLimit": 2,
  "baykar-ai-fixer.chat.tokenLimit": 12000,
  "baykar-ai-fixer.chat.temperature": 0.7
}
```

### ⚙️ Workspace-specific Configuration Issues

#### **Problem**: Settings not applying correctly in specific workspaces

**Solution Structure**:
```
workspace/
├── .vscode/
│   ├── settings.json          # Workspace-specific settings
│   └── ivme.json              # Extension-specific config
└── .ivme/                     # Extension data directory
    ├── vector-store.db        # Local vector database
    ├── conversation-history.json
    └── workspace-index.json
```

**Workspace Settings Override**:
```json
// .vscode/settings.json (workspace-specific)
{
  "baykar-ai-fixer.indexing.sourceName": "my-project-v2",
  "baykar-ai-fixer.indexing.includeGlobs": [
    "src/**/*.ts",
    "lib/**/*.js",
    "config/**/*.json"
  ],
  "baykar-ai-fixer.indexing.excludeGlobs": [
    "src/**/*.test.ts",
    "lib/**/*.spec.js",
    "node_modules/**"
  ]
}
```

---

## 11.5 Performance Issues ve Optimization

### 🚀 Indexing Performance Problems

#### **Problem**: Project indexing is too slow or consuming excessive resources

**Symptoms**:
```
Indexing takes > 10 minutes for medium projects
High CPU usage during indexing
VS Code becomes unresponsive
```

**Performance Analysis**:
```typescript
interface IndexingPerformanceAnalysis {
  metrics: {
    filesProcessed: number;
    processingTimeMs: number;
    memoryUsageMB: number;
    cpuUsagePercent: number;
  };
  
  bottlenecks: {
    tooManyFiles: 'Reduce includeGlobs scope';
    largeFiles: 'Skip files > 1MB';
    complexParsing: 'Simplify AST analysis';
    networkLatency: 'Use local vector store';
  };
}
```

**Optimization Settings**:
```json
{
  "baykar-ai-fixer.indexing.enabled": true,
  "baykar-ai-fixer.indexing.batchSize": 10,
  "baykar-ai-fixer.indexing.concurrency": 3,
  "baykar-ai-fixer.indexing.maxFileSizeBytes": 1048576,
  "baykar-ai-fixer.indexing.skipBinaryFiles": true,
  "baykar-ai-fixer.indexing.summaryTimeoutMs": 15000,
  "baykar-ai-fixer.indexing.embeddingTimeoutMs": 30000,
  "baykar-ai-fixer.indexing.includeGlobs": [
    "src/**/*.{ts,tsx,js,jsx}",
    "!src/**/*.test.*",
    "!src/**/*.spec.*"
  ]
}
```

**Manual Performance Tuning**:
```typescript
class PerformanceTuning {
    static optimizeForProject(projectSize: 'small' | 'medium' | 'large'): Config {
        const configs = {
            small: {  // < 100 files
                batchSize: 20,
                concurrency: 5,
                summaryTimeout: 10000
            },
            medium: { // 100-1000 files  
                batchSize: 10,
                concurrency: 3,
                summaryTimeout: 15000
            },
            large: {  // > 1000 files
                batchSize: 5,
                concurrency: 2,
                summaryTimeout: 25000
            }
        };
        
        return configs[projectSize];
    }
    
    static async profileIndexing(): Promise<PerformanceReport> {
        const startTime = Date.now();
        const startMemory = process.memoryUsage();
        
        // Run indexing...
        
        const endTime = Date.now();
        const endMemory = process.memoryUsage();
        
        return {
            duration: endTime - startTime,
            memoryDelta: endMemory.heapUsed - startMemory.heapUsed,
            filesProcessed: this.filesCount,
            avgTimePerFile: (endTime - startTime) / this.filesCount
        };
    }
}
```

### 🚀 Chat Response Performance

#### **Problem**: Slow response times in chat interface

**Symptoms**:
```
> 30 seconds for simple responses
UI becomes unresponsive during generation
Streaming responses are choppy
```

**Performance Optimization**:
```typescript
interface ChatPerformanceOptimization {
  responseTime: {
    target: '< 5 seconds for simple queries';
    factors: [
      'Model response time',
      'Context preparation',
      'Vector retrieval speed',
      'Network latency'
    ];
  };
  
  solutions: {
    reduceContext: 'Limit conversation history';
    optimizeRetrieval: 'Improve vector search';
    streamingResponse: 'Enable real-time streaming';
    caching: 'Cache frequent responses';
  };
}
```

**Chat Optimization Settings**:
```json
{
  "baykar-ai-fixer.chat.conversationHistoryLimit": 1,
  "baykar-ai-fixer.chat.tokenLimit": 8000,
  "baykar-ai-fixer.retrieval.maxResults": 5,
  "baykar-ai-fixer.retrieval.similarityThreshold": 0.7,
  "baykar-ai-fixer.api.enableStreaming": true,
  "baykar-ai-fixer.api.requestTimeoutMs": 30000
}
```

### 🚀 Memory Usage Optimization

#### **Problem**: Extension consuming excessive memory

**Monitoring Commands**:
```bash
# Monitor VS Code memory usage
ps aux | grep -E "(code|electron)" | sort -k4 -nr

# Extension-specific memory monitoring via VS Code
# Help > Toggle Developer Tools > Console
process.memoryUsage()
```

**Memory Optimization Strategies**:
```typescript
class MemoryOptimization {
    static configureForLowMemory(): Config {
        return {
            // Reduce conversation history
            conversationHistoryLimit: 1,
            
            // Limit vector store size
            maxVectorStoreSize: 1000,
            
            // Reduce concurrent processing
            indexingConcurrency: 1,
            
            // Clear caches more frequently
            cacheCleanupInterval: 300000, // 5 minutes
            
            // Disable non-essential features
            agentModeActive: false,
            indexingEnabled: false
        };
    }
    
    static async cleanupMemory(): Promise<void> {
        // Clear conversation history
        await this.conversationManager.clearOldConversations();
        
        // Cleanup vector store
        await this.vectorStore.compact();
        
        // Force garbage collection (if available)
        if (global.gc) {
            global.gc();
        }
    }
}
```

---

## 11.6 Webview ve UI Sorunları

### 🖥️ Webview Loading Issues

#### **Problem**: Chat interface fails to load or displays blank screen

**Symptoms**:
```
Blank white/black screen in chat panel
"Cannot load resource" errors
Webview content not updating
```

**Diagnostic Steps**:
```typescript
class WebviewDiagnostics {
    static checkWebviewContent(): void {
        // Open VS Code Developer Tools
        // Help > Toggle Developer Tools
        
        // Check for errors in Console tab
        console.log('Checking webview frame...');
        
        // Look for CSP violations
        // Network tab - failed resource loads
        // Security tab - content security policy
    }
    
    static validateContentSecurityPolicy(): void {
        const expectedCSP = `
            default-src 'none';
            script-src 'unsafe-inline' 'unsafe-eval' ${vscode.webviewUri};
            style-src 'unsafe-inline' ${vscode.webviewUri};
            font-src ${vscode.webviewUri};
            img-src ${vscode.webviewUri} data: https:;
            connect-src https:;
        `;
        
        console.log('Expected CSP:', expectedCSP);
    }
}
```

**Solutions**:
```bash
# 1. Reset webview cache
rm -rf ~/.config/Code/CachedData/*/webviewService
rm -rf ~/.config/Code/User/workspaceStorage/*/webview-cache

# 2. Disable other extensions temporarily
code --disable-extensions

# 3. Reset VS Code workspace state
rm -rf .vscode/workspace.json
```

### 🖥️ CSS ve Styling Problems

#### **Problem**: UI elements not displaying correctly

**Common CSS Issues**:
```css
/* Problem: Elements not visible */
.message-content {
    /* Missing: */
    display: block;
    visibility: visible;
    
    /* Check: */
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
}

/* Problem: Layout broken */
.chat-container {
    /* Ensure: */
    width: 100%;
    height: 100vh;
    overflow-y: auto;
}

/* Problem: Dark/light theme not applied */
:root {
    /* Use VS Code CSS variables: */
    --text-color: var(--vscode-foreground);
    --bg-color: var(--vscode-editor-background);
    --border-color: var(--vscode-panel-border);
}
```

**Theme Compatibility Fix**:
```typescript
class ThemeCompatibility {
    static detectTheme(): 'light' | 'dark' | 'high-contrast' {
        const body = document.body;
        const computedStyle = getComputedStyle(body);
        const bgColor = computedStyle.backgroundColor;
        
        // Parse RGB values to determine theme
        const rgb = bgColor.match(/\d+/g);
        if (rgb) {
            const brightness = (Number(rgb[0]) + Number(rgb[1]) + Number(rgb[2])) / 3;
            return brightness > 128 ? 'light' : 'dark';
        }
        
        return 'dark'; // Default fallback
    }
    
    static applyThemeClasses(): void {
        const theme = this.detectTheme();
        document.body.className = `theme-${theme}`;
    }
}
```

### 🖥️ Message Rendering Issues

#### **Problem**: Messages not displaying properly or showing formatting errors

**Debugging Message Rendering**:
```typescript
class MessageRenderingDebug {
    static validateMessageStructure(message: ChatMessage): boolean {
        const required = ['id', 'role', 'content', 'timestamp'];
        return required.every(field => field in message);
    }
    
    static sanitizeMessageContent(content: string): string {
        // Remove potentially harmful content
        return content
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=\s*['"]/gi, '');
    }
    
    static checkMarkdownRendering(content: string): void {
        try {
            // Test markdown parsing
            const parsed = marked.parse(content);
            console.log('✅ Markdown parsing successful');
        } catch (error) {
            console.error('❌ Markdown parsing failed:', error);
        }
    }
}
```

---

## 11.7 Extension Crashes ve Error Recovery

### 💥 Extension Host Crashes

#### **Problem**: Extension host process crashes repeatedly

**Symptoms**:
```
Extension host terminated unexpectedly
All extensions stopped working
VS Code shows "Extension host terminated" notification
```

**Crash Analysis**:
```bash
# Check extension host logs
grep -i "crash\|terminated\|exception" ~/.config/Code/logs/*/exthost*.log

# Monitor memory usage before crash
# Task Manager (Windows) / Activity Monitor (macOS) / htop (Linux)

# Check for stack overflow
grep -i "stack overflow\|maximum call stack" ~/.config/Code/logs/*/exthost*.log
```

**Recovery Procedures**:
```typescript
interface CrashRecovery {
  immediate: {
    restart: 'Command: "Developer: Restart Extension Host"';
    disable: 'Temporarily disable problematic extensions';
    safeMode: 'Start VS Code with --disable-extensions';
  };
  
  investigation: {
    logs: 'Analyze extension host logs';
    memory: 'Check for memory leaks';
    infinite: 'Look for infinite loops or recursion';
  };
  
  prevention: {
    limits: 'Set memory and timeout limits';
    monitoring: 'Implement health checks';
    graceful: 'Handle errors gracefully';
  };
}
```

**Extension Error Handling**:
```typescript
class ExtensionErrorRecovery {
    private static isRecovering = false;
    
    static async handleCriticalError(error: Error): Promise<void> {
        if (this.isRecovering) return;
        this.isRecovering = true;
        
        try {
            // Log the error
            logger.error('Critical extension error', error);
            
            // Cleanup resources
            await this.cleanupResources();
            
            // Reset to safe state
            await this.resetToSafeState();
            
            // Notify user
            vscode.window.showErrorMessage(
                'İvme extension encountered an error and has been reset. Please try again.',
                'Open Logs', 'Report Issue'
            );
            
        } catch (recoveryError) {
            logger.error('Error during recovery', recoveryError);
        } finally {
            this.isRecovering = false;
        }
    }
    
    static async cleanupResources(): Promise<void> {
        // Cancel pending operations
        this.cancelPendingOperations();
        
        // Clear memory caches
        this.clearMemoryCaches();
        
        // Close active connections
        await this.closeConnections();
    }
    
    static async resetToSafeState(): Promise<void> {
        // Reset to minimal configuration
        await vscode.workspace.getConfiguration('baykar-ai-fixer')
            .update('indexing.enabled', false, true);
            
        // Clear conversation history
        await this.conversationManager.clearAll();
        
        // Reset UI state
        await this.resetUI();
    }
}
```

### 💥 Unhandled Promise Rejections

#### **Problem**: Async operations failing silently

**Detection and Handling**:
```typescript
class PromiseErrorHandling {
    static setupGlobalHandlers(): void {
        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Promise Rejection', {
                reason: reason,
                promise: promise,
                stack: reason instanceof Error ? reason.stack : undefined
            });
            
            // Attempt graceful recovery
            this.handleUnhandledRejection(reason);
        });
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception', error);
            
            // Emergency cleanup
            this.emergencyCleanup();
        });
    }
    
    static handleUnhandledRejection(reason: any): void {
        if (reason instanceof NetworkError) {
            // Network issues - switch to offline mode
            this.switchToOfflineMode();
        } else if (reason instanceof AuthenticationError) {
            // Auth issues - prompt user for credentials
            this.promptForReauthentication();
        } else {
            // Unknown error - reset to safe state
            ExtensionErrorRecovery.resetToSafeState();
        }
    }
}
```

---

---

<div align="center">
  <h2>🔧 Comprehensive Troubleshooting</h2>
  <p><em>Complete problem-solving framework for İvme extension</em></p>
</div>

Bu troubleshooting rehberi bölümünde ele alınanlar:

- ✅ **Systematic Debugging**: Structured problem identification
- ✅ **Installation Issues**: Complete activation troubleshooting
- ✅ **API Connectivity**: vLLM ve Gemini connection problems  
- ✅ **Configuration**: Settings corruption ve reset procedures
- ✅ **Performance**: Memory, speed, ve resource optimization
- ✅ **UI Problems**: Webview, styling, ve rendering issues
- ✅ **Error Recovery**: Crash handling ve graceful recovery

Bu comprehensive guide, İvme extension kullanıcılarının karşılaşabileceği tüm technical issues için systematic solutions ve prevention strategies sunmaktadır.

Bir sonraki bölümde **"API Referansı"**nı detaylı şekilde inceleyeceğiz! 🚀
