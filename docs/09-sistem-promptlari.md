# 9. Sistem Promptları - AI Prompt Sistemi ve Çoklu Dil Desteği 🌐

Bu bölüm, İvme extension'ının sophisticated AI prompt architecture'ını ve comprehensive multilingual support sistemini detaylı şekilde ele alır. Sistem promptları, AI modellerinin optimal performans göstermesi için kritik rol oynar ve kullanıcı deneyimini doğrudan etkiler.

## İçindekiler

- [9.1 System Prompt Architecture](#91-system-prompt-architecture)
- [9.2 Multilingual Support System](#92-multilingual-support-system)
- [9.3 Prompt Categories ve Types](#93-prompt-categories-ve-types)
- [9.4 Language Switching Mechanism](#94-language-switching-mechanism)
- [9.5 Contextual Prompt Building](#95-contextual-prompt-building)
- [9.6 Tool Descriptions System](#96-tool-descriptions-system)
- [9.7 Planner-Specific Prompts](#97-planner-specific-prompts)
- [9.8 Custom Tool Creation Prompts](#98-custom-tool-creation-prompts)
- [9.9 Prompt Optimization Strategies](#99-prompt-optimization-strategies)
- [9.10 Best Practices ve Guidelines](#910-best-practices-ve-guidelines)

---

## 9.1 System Prompt Architecture

### 🏗️ Architectural Overview

İvme'nin sistem prompt mimarisi, modular ve maintainable bir yaklaşım benimser:

```typescript
interface SystemPromptArchitecture {
  core: {
    index: 'CentralDispatcher';           // Merkezi yönlendirici
    types: 'TypeDefinitions';             // Tip tanımları
  };
  languages: {
    tr: 'TurkishPrompts';                 // Türkçe prompt'lar
    en: 'EnglishPrompts';                 // İngilizce prompt'lar
  };
  categories: {
    initial: 'SystemInitialization';      // Sistem başlatma
    contextual: 'ContextAwarePrompts';    // Bağlam-bilinçli
    error: 'ErrorFixingPrompts';          // Hata düzeltme
    planner: 'PlannerSystemPrompts';      // Planlama sistemi
    tools: 'ToolDescriptions';            // Araç açıklamaları
    custom: 'CustomToolCreation';         // Özel araç oluşturma
  };
}
```

### 📁 File Structure

```
src/system_prompts/
├── index.ts                           # Merkezi dispatcher ve type definitions
├── tr.ts                              # Türkçe prompt implementations
├── en.ts                              # İngilizce prompt implementations
└── tool.ts                            # Tool descriptions ve custom tool prompts
```

### 🎯 Core Dispatcher Implementation

```typescript
// src/system_prompts/index.ts
import * as tr from './tr';
import * as en from './en';
import { ContextManager } from '../features/manager/context';
import { ChatMessage } from '../types';

export type PromptLanguage = 'tr' | 'en';

// Global language state
let currentLanguage: PromptLanguage = 'tr';

// Language setter
export function setPromptLanguage(lang: PromptLanguage): void {
    currentLanguage = lang;
    console.log(`🌐 Prompt language switched to: ${lang}`);
}

// Dynamic module resolver
function getModule() {
    return currentLanguage === 'en' ? en : tr;
}

// Exported prompt functions with dynamic language resolution
export const createInitialSystemPrompt = () => 
    getModule().createInitialSystemPrompt();

export const createFixErrorPrompt = (
    errorMessage: string,
    lineNumber: number,
    fullCode: string
) => getModule().createFixErrorPrompt(errorMessage, lineNumber, fullCode);

export const createContextualPrompt = (
    lastUserMessage: ChatMessage,
    contextManager: ContextManager
) => getModule().createContextualPrompt(lastUserMessage, contextManager);

export const createPlanExplanationPrompts = (planJson: string) => 
    getModule().createPlanExplanationPrompts(planJson);

// Planner tool-calling MUST be in English regardless of UI language
export const createPlannerToolCallingSystemPrompt = () => 
    en.createPlannerToolCallingSystemPrompt();

// Act-mode summary prompts follow UI language
export const createActSummaryPrompts = (actionsText: string) => 
    getModule().createActSummaryPrompts(actionsText);
```

### 🔄 Runtime Language Switching

```typescript
class PromptLanguageManager {
    private static instance: PromptLanguageManager;
    private currentLanguage: PromptLanguage = 'tr';
    private subscribers: Set<(lang: PromptLanguage) => void> = new Set();
    
    static getInstance(): PromptLanguageManager {
        if (!this.instance) {
            this.instance = new PromptLanguageManager();
        }
        return this.instance;
    }
    
    setLanguage(language: PromptLanguage): void {
        if (this.currentLanguage === language) return;
        
        const oldLanguage = this.currentLanguage;
        this.currentLanguage = language;
        
        // Update global state
        setPromptLanguage(language);
        
        // Notify subscribers
        this.notifySubscribers(language);
        
        console.log(`🔄 Language changed: ${oldLanguage} → ${language}`);
    }
    
    subscribe(callback: (lang: PromptLanguage) => void): () => void {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }
    
    private notifySubscribers(language: PromptLanguage): void {
        this.subscribers.forEach(callback => {
            try {
                callback(language);
            } catch (error) {
                console.error('Language change notification error:', error);
            }
        });
    }
    
    getCurrentLanguage(): PromptLanguage {
        return this.currentLanguage;
    }
}
```

---

## 9.2 Multilingual Support System

### 🌍 Language Support Implementation

İvme, comprehensive bilingual support sağlar (Türkçe/İngilizce):

```typescript
interface MultilingualSupport {
  languages: ['tr', 'en'];
  coverage: {
    ui: 'Complete';                       // UI metinleri
    prompts: 'Complete';                  // AI prompt'ları
    tools: 'Complete';                    // Araç açıklamaları
    errors: 'Complete';                   // Hata mesajları
    documentation: 'Complete';            // Dokümantasyon
  };
  switching: {
    runtime: 'Dynamic';                   // Çalışma zamanında
    persistence: 'LocalStorage';          // Kalıcı kayıt
    scope: 'Global';                      // Global scope
  };
}
```

### 🇹🇷 Turkish Prompt Implementation

```typescript
// src/system_prompts/tr.ts
export function createInitialSystemPrompt(): string {
    return `Uzman bir yazılım geliştirme asistanısın. Sadece istenen görevi yerine getir. Ekstra açıklama, selamlama veya yorum yapma. Cevaplarını Markdown formatında, kod bloklarını dil belirterek ver.`;
}

export function createFixErrorPrompt(
    errorMessage: string, 
    lineNumber: number, 
    fullCode: string
): string {
    return `Aşağıdaki kodda bulunan hatayı düzelt. Sadece düzeltilmiş kodu döndür.

HATA: "${errorMessage}" (Satır: ${lineNumber})

KOD:
---
${fullCode}
---`;
}

export function createContextualPrompt(
    lastUserMessage: ChatMessage, 
    contextManager: ContextManager
): string {
    const { agentFileContext, agentSelectionContext, uploadedFileContexts, activeContextText } = contextManager;
    const userInstruction = lastUserMessage.content;

    // Priority 1: Agent mode with file and selection context
    if (agentFileContext && agentSelectionContext) {
        const startLine = agentSelectionContext.selection.start.line + 1;
        const endLine = agentSelectionContext.selection.end.line + 1;
        
        return `Aşağıdaki dosya ve içindeki seçili alana göre verilen talimatı harfiyen uygula. Yalnızca istenen çıktıyı ver, ek açıklama yapma.

--- DOSYA (${agentFileContext.fileName}) ---
${agentFileContext.content}
---

--- SEÇİLİ ALAN (Satır ${startLine}-${endLine}) ---
\`\`\`
${agentSelectionContext.content}
\`\`\`
---

TALİMAT: ${userInstruction}`;
    }

    // Priority 2: Agent mode with file context only
    if (agentFileContext) {
        return `Verilen dosya içeriğine dayanarak aşağıdaki talimatı yerine getir. Sadece istenen çıktıyı ver.

--- DOSYA İÇERİĞİ (${agentFileContext.fileName}) ---
${agentFileContext.content}
---

TALİMAT: ${userInstruction}`;
    }

    // Priority 3: Uploaded files context
    if (uploadedFileContexts.length > 0) {
        const fileContents = uploadedFileContexts
            .map(file => `--- DOSYA: "${file.fileName}" ---\n${file.content}\n---`)
            .join('\n\n');
            
        return `Verilen dosya içeriklerine dayanarak aşağıdaki talimatı yerine getir. Sadece istenen çıktıyı ver.

${fileContents}

TALİMAT: ${userInstruction}`;
    }

    // Priority 4: Selected code context
    if (activeContextText) {
        return `Verilen kod parçasına dayanarak aşağıdaki talimatı yerine getir. Sadece istenen çıktıyı ver.

\`\`\`
${activeContextText}
\`\`\`

TALİMAT: ${userInstruction}`;
    }

    // Fallback: No context
    return userInstruction;
}
```

### 🇺🇸 English Prompt Implementation

```typescript
// src/system_prompts/en.ts
export function createInitialSystemPrompt(): string {
    return `You are a concise software assistant. Do only what is asked. Answer in Markdown with code fences.`;
}

export function createFixErrorPrompt(
    errorMessage: string, 
    lineNumber: number, 
    fullCode: string
): string {
    return `Fix the error in the code below. Return only the corrected code.

ERROR: "${errorMessage}" (Line: ${lineNumber})

CODE:
---
${fullCode}
---`;
}

export function createContextualPrompt(
    lastUserMessage: ChatMessage, 
    contextManager: ContextManager
): string {
    const { agentFileContext, agentSelectionContext, uploadedFileContexts, activeContextText } = contextManager;
    const userInstruction = lastUserMessage.content;

    if (agentFileContext && agentSelectionContext) {
        const startLine = agentSelectionContext.selection.start.line + 1;
        const endLine = agentSelectionContext.selection.end.line + 1;
        
        return `Apply the instruction to the selected code within the file below. Output ONLY what is asked.

--- FILE (${agentFileContext.fileName}) ---
${agentFileContext.content}
---

--- SELECTION (Lines ${startLine}-${endLine}) ---
\`\`\`
${agentSelectionContext.content}
\`\`\`
---

INSTRUCTION: ${userInstruction}`;
    }

    if (agentFileContext) {
        return `Apply the instruction based on the file content below. Output ONLY what is asked.

--- FILE CONTENT (${agentFileContext.fileName}) ---
${agentFileContext.content}
---

INSTRUCTION: ${userInstruction}`;
    }

    if (uploadedFileContexts.length > 0) {
        const fileContents = uploadedFileContexts
            .map(file => `--- FILE: "${file.fileName}" ---\n${file.content}\n---`)
            .join('\n\n');
            
        return `Apply the instruction based on the file contents below. Output ONLY what is asked.

${fileContents}

INSTRUCTION: ${userInstruction}`;
    }

    if (activeContextText) {
        return `Apply the instruction based on this snippet. Output ONLY what is asked.

\`\`\`
${activeContextText}
\`\`\`

INSTRUCTION: ${userInstruction}`;
    }

    return userInstruction;
}
```

---

## 9.3 Prompt Categories ve Types

### 📋 Prompt Classification

```typescript
enum PromptCategory {
    INITIAL = 'initial',                  // Sistem başlatma
    CONTEXTUAL = 'contextual',            // Bağlam-bilinçli
    ERROR_FIXING = 'error_fixing',        // Hata düzeltme
    PLANNER_SYSTEM = 'planner_system',    // Planner sistem
    PLAN_EXPLANATION = 'plan_explanation', // Plan açıklama
    ACT_SUMMARY = 'act_summary',          // Eylem özeti
    TOOL_CALLING = 'tool_calling',        // Araç çağırma
    CUSTOM_TOOL = 'custom_tool'           // Özel araç oluşturma
}

interface PromptTemplate {
    category: PromptCategory;
    language: PromptLanguage;
    template: string;
    variables: string[];
    context_required: boolean;
    model_requirements?: {
        min_context_length?: number;
        supports_tool_calling?: boolean;
        supports_streaming?: boolean;
    };
}
```

### 🎯 Initial System Prompts

**Amaç**: AI modelini temel davranış patterns'i ile configure etmek

```typescript
// Türkçe versiyon - Daha conversational
const TR_INITIAL_PROMPT = `Uzman bir yazılım geliştirme asistanısın. Sadece istenen görevi yerine getir. Ekstra açıklama, selamlama veya yorum yapma. Cevaplarını Markdown formatında, kod bloklarını dil belirterek ver.`;

// İngilizce versiyon - Daha concise
const EN_INITIAL_PROMPT = `You are a concise software assistant. Do only what is asked. Answer in Markdown with code fences.`;

// Karakteristikler
const PROMPT_CHARACTERISTICS = {
    tone: 'Professional, Direct',
    verbosity: 'Minimal',
    format: 'Markdown with code fences',
    behavior: 'Task-focused, No greetings',
    language_adaptation: 'Culture-aware phrasing'
};
```

### 🔧 Error Fixing Prompts

**Amaç**: Code error'larını efficient şekilde düzeltmek

```typescript
class ErrorFixingPromptBuilder {
    static build(
        errorMessage: string,
        lineNumber: number,
        fullCode: string,
        language: PromptLanguage
    ): string {
        const templates = {
            tr: `Aşağıdaki kodda bulunan hatayı düzelt. Sadece düzeltilmiş kodu döndür.

HATA: "${errorMessage}" (Satır: ${lineNumber})

KOD:
---
${fullCode}
---`,
            en: `Fix the error in the code below. Return only the corrected code.

ERROR: "${errorMessage}" (Line: ${lineNumber})

CODE:
---
${fullCode}
---`
        };
        
        return templates[language];
    }
    
    // Advanced error context analysis
    static analyzeErrorContext(error: string): ErrorContext {
        const patterns = {
            syntax: /syntax\s*error|unexpected\s*token|invalid\s*syntax/i,
            type: /type\s*error|cannot\s*find|property.*does\s*not\s*exist/i,
            import: /cannot\s*resolve|module\s*not\s*found|import.*error/i,
            runtime: /runtime\s*error|null\s*pointer|undefined/i
        };
        
        for (const [category, pattern] of Object.entries(patterns)) {
            if (pattern.test(error)) {
                return { category, confidence: 0.8 };
            }
        }
        
        return { category: 'unknown', confidence: 0.5 };
    }
}
```

### 🧠 Contextual Prompts

**Amaç**: User input'unu available context ile intelligently birleştirmek

```typescript
class ContextualPromptBuilder {
    static buildContextualPrompt(
        userMessage: ChatMessage,
        contextManager: ContextManager,
        language: PromptLanguage
    ): string {
        const context = this.analyzeContext(contextManager);
        const builder = new PromptBuilder(language);
        
        // Context priority hierarchy
        if (context.hasAgentSelection) {
            return builder.buildAgentSelectionPrompt(userMessage, context);
        }
        
        if (context.hasAgentFile) {
            return builder.buildAgentFilePrompt(userMessage, context);
        }
        
        if (context.hasUploadedFiles) {
            return builder.buildUploadedFilesPrompt(userMessage, context);
        }
        
        if (context.hasActiveSelection) {
            return builder.buildActiveSelectionPrompt(userMessage, context);
        }
        
        return builder.buildPlainPrompt(userMessage);
    }
    
    private static analyzeContext(contextManager: ContextManager): ContextAnalysis {
        return {
            hasAgentSelection: !!(contextManager.agentFileContext && contextManager.agentSelectionContext),
            hasAgentFile: !!contextManager.agentFileContext,
            hasUploadedFiles: contextManager.uploadedFileContexts.length > 0,
            hasActiveSelection: !!contextManager.activeContextText,
            totalContextSize: this.calculateContextSize(contextManager),
            complexity: this.assessComplexity(contextManager)
        };
    }
    
    private static calculateContextSize(contextManager: ContextManager): number {
        let size = 0;
        
        if (contextManager.agentFileContext) {
            size += contextManager.agentFileContext.content.length;
        }
        
        if (contextManager.agentSelectionContext) {
            size += contextManager.agentSelectionContext.content.length;
        }
        
        contextManager.uploadedFileContexts.forEach(file => {
            size += file.content.length;
        });
        
        if (contextManager.activeContextText) {
            size += contextManager.activeContextText.length;
        }
        
        return size;
    }
}
```

---

## 9.4 Language Switching Mechanism

### 🔄 Dynamic Language Resolution

```typescript
class LanguageSwitchingSystem {
    private static languagePreferences: Map<string, PromptLanguage> = new Map();
    private static fallbackLanguage: PromptLanguage = 'tr';
    
    // Global language switching
    static setGlobalLanguage(language: PromptLanguage): void {
        setPromptLanguage(language);
        
        // Persist to storage
        try {
            localStorage.setItem('ivme_prompt_language', language);
        } catch (error) {
            console.warn('Failed to persist language preference:', error);
        }
        
        // Update all active prompts
        this.updateActivePrompts(language);
    }
    
    // Context-aware language switching
    static setContextualLanguage(
        context: string,
        language: PromptLanguage
    ): void {
        this.languagePreferences.set(context, language);
    }
    
    // Intelligent language detection
    static detectOptimalLanguage(input: string): PromptLanguage {
        const turkishPatterns = /[ğıĞIıİöÖşŞçÇüÜ]|çok|için|ile|bir|bu|şu|ve|ama|ancak|sadece/;
        const englishPatterns = /\b(the|and|but|for|with|this|that|only|just|very)\b/i;
        
        const turkishScore = (input.match(turkishPatterns) || []).length;
        const englishScore = (input.match(englishPatterns) || []).length;
        
        if (turkishScore > englishScore) return 'tr';
        if (englishScore > turkishScore) return 'en';
        
        // Fallback to current language
        return getCurrentLanguage();
    }
    
    // Load saved language preference
    static loadSavedLanguage(): PromptLanguage {
        try {
            const saved = localStorage.getItem('ivme_prompt_language');
            return (saved as PromptLanguage) || this.fallbackLanguage;
        } catch (error) {
            console.warn('Failed to load language preference:', error);
            return this.fallbackLanguage;
        }
    }
    
    private static updateActivePrompts(language: PromptLanguage): void {
        // Update conversation system prompt
        const conversationManager = getGlobalConversationManager();
        if (conversationManager) {
            const newSystemPrompt = createInitialSystemPrompt();
            conversationManager.updateSystemPrompt(newSystemPrompt);
        }
        
        // Notify UI components
        this.notifyLanguageChange(language);
    }
    
    private static notifyLanguageChange(language: PromptLanguage): void {
        // Send to webview
        const webviewProvider = getGlobalWebviewProvider();
        if (webviewProvider) {
            webviewProvider.postMessage({
                type: 'languageChanged',
                language: language
            });
        }
        
        // Update UI text
        this.updateUILanguage(language);
    }
}
```

### 🎯 Smart Language Selection

```typescript
class SmartLanguageSelector {
    // Context-based language selection
    static selectLanguageForContext(
        userInput: string,
        fileContext?: string,
        conversationHistory?: ChatMessage[]
    ): PromptLanguage {
        const scores = {
            tr: 0,
            en: 0
        };
        
        // Analyze user input
        scores.tr += this.analyzeTextForTurkish(userInput);
        scores.en += this.analyzeTextForEnglish(userInput);
        
        // Analyze file context if available
        if (fileContext) {
            scores.tr += this.analyzeTextForTurkish(fileContext) * 0.3;
            scores.en += this.analyzeTextForEnglish(fileContext) * 0.3;
        }
        
        // Analyze conversation history
        if (conversationHistory) {
            const historyText = conversationHistory
                .slice(-5) // Last 5 messages
                .map(msg => msg.content)
                .join(' ');
                
            scores.tr += this.analyzeTextForTurkish(historyText) * 0.2;
            scores.en += this.analyzeTextForEnglish(historyText) * 0.2;
        }
        
        // Decision with confidence threshold
        const confidence = Math.abs(scores.tr - scores.en);
        if (confidence < 0.3) {
            // Low confidence, use user preference or current language
            return getCurrentLanguage();
        }
        
        return scores.tr > scores.en ? 'tr' : 'en';
    }
    
    private static analyzeTextForTurkish(text: string): number {
        const patterns = [
            /[ğıĞIıİöÖşŞçÇüÜ]/g,                    // Turkish characters
            /\b(için|ile|bir|bu|şu|çok|sadece|ancak|ama|ve|veya|değil|olan|olarak|olur|oldu|eder|etmek|yapmak|yapılan|göre|sonra|önce|sırasında|iken|daha|en|kadar|gibi)\b/gi
        ];
        
        let score = 0;
        patterns.forEach(pattern => {
            const matches = text.match(pattern);
            score += matches ? matches.length : 0;
        });
        
        return score / text.length; // Normalize by text length
    }
    
    private static analyzeTextForEnglish(text: string): number {
        const patterns = [
            /\b(the|and|but|for|with|this|that|only|just|very|more|most|some|any|all|each|every|another|other|such|no|nor|not|only|own|same|so|than|too|very|can|will|would|should|could|may|might|must|shall|do|does|did|have|has|had|be|is|am|are|was|were|been|being|get|got|make|made|take|took|come|came|go|went|see|saw|know|knew|think|thought|look|looked|use|used|find|found|give|gave|tell|told|become|became|leave|left|feel|felt|try|tried|ask|asked|need|needed|seem|seemed|turn|turned|put|put|mean|meant|keep|kept|let|let|begin|began|help|helped|show|showed|hear|heard|play|played|run|ran|move|moved|live|lived|believe|believed|bring|brought|happen|happened|write|wrote|provide|provided|sit|sat|stand|stood|lose|lost|pay|paid|meet|met|include|included|continue|continued|set|set|learn|learned|change|changed|lead|led|understand|understood|watch|watched|follow|followed|stop|stopped|create|created|speak|spoke|read|read|allow|allowed|add|added|spend|spent|grow|grew|open|opened|walk|walked|win|won|offer|offered|remember|remembered|love|loved|consider|considered|appear|appeared|buy|bought|wait|waited|serve|served|die|died|send|sent|expect|expected|build|built|stay|stayed|fall|fell|cut|cut|reach|reached|kill|killed|remain|remained|suggest|suggested|raise|raised|pass|passed|sell|sold|require|required|report|reported|decide|decided|pull|pulled)\b/gi
        ];
        
        let score = 0;
        patterns.forEach(pattern => {
            const matches = text.match(pattern);
            score += matches ? matches.length : 0;
        });
        
        return score / text.length; // Normalize by text length
    }
}
```

---

## 9.5 Contextual Prompt Building

### 🧩 Context Analysis Engine

```typescript
class ContextAnalysisEngine {
    static analyzeContextComplexity(contextManager: ContextManager): ContextComplexity {
        const analysis: ContextComplexity = {
            level: 'simple',
            factors: [],
            recommendations: [],
            estimatedTokens: 0,
            maxOptimalSize: 8000
        };
        
        // File context analysis
        if (contextManager.agentFileContext) {
            const fileSize = contextManager.agentFileContext.content.length;
            analysis.estimatedTokens += Math.ceil(fileSize / 4);
            
            if (fileSize > 10000) {
                analysis.level = 'complex';
                analysis.factors.push('Large file context');
                analysis.recommendations.push('Consider focusing on specific functions/classes');
            }
        }
        
        // Selection context analysis
        if (contextManager.agentSelectionContext) {
            const selectionSize = contextManager.agentSelectionContext.content.length;
            analysis.estimatedTokens += Math.ceil(selectionSize / 4);
            
            if (selectionSize > 2000) {
                analysis.factors.push('Large code selection');
                analysis.recommendations.push('Break down into smaller chunks');
            }
        }
        
        // Multiple file analysis
        if (contextManager.uploadedFileContexts.length > 1) {
            analysis.level = 'moderate';
            analysis.factors.push(`Multiple files (${contextManager.uploadedFileContexts.length})`);
            
            const totalSize = contextManager.uploadedFileContexts
                .reduce((sum, file) => sum + file.content.length, 0);
            analysis.estimatedTokens += Math.ceil(totalSize / 4);
            
            if (contextManager.uploadedFileContexts.length > 5) {
                analysis.level = 'complex';
                analysis.recommendations.push('Consider processing files in batches');
            }
        }
        
        // Final complexity assessment
        if (analysis.estimatedTokens > analysis.maxOptimalSize) {
            analysis.level = 'complex';
            analysis.recommendations.push('Context size exceeds optimal limits');
        }
        
        return analysis;
    }
    
    static optimizeContextForModel(
        context: string,
        maxTokens: number = 8000
    ): OptimizedContext {
        const estimatedTokens = Math.ceil(context.length / 4);
        
        if (estimatedTokens <= maxTokens) {
            return {
                content: context,
                truncated: false,
                originalSize: estimatedTokens,
                finalSize: estimatedTokens
            };
        }
        
        // Smart truncation strategies
        const lines = context.split('\n');
        const targetLines = Math.floor(lines.length * (maxTokens / estimatedTokens));
        
        // Keep important parts: imports, function signatures, class definitions
        const importantLines = lines.filter(line => 
            /^(import|export|class|function|interface|type|const|let|var)\s/.test(line.trim())
        );
        
        const remainingQuota = targetLines - importantLines.length;
        const otherLines = lines.filter(line => 
            !/^(import|export|class|function|interface|type|const|let|var)\s/.test(line.trim())
        );
        
        const selectedOtherLines = otherLines.slice(0, remainingQuota);
        const optimizedContent = [...importantLines, ...selectedOtherLines].join('\n');
        
        return {
            content: optimizedContent,
            truncated: true,
            originalSize: estimatedTokens,
            finalSize: Math.ceil(optimizedContent.length / 4),
            strategy: 'smart_truncation'
        };
    }
}
```

### 🎯 Advanced Context Building

```typescript
class AdvancedContextBuilder {
    static buildIntelligentContext(
        userMessage: ChatMessage,
        contextManager: ContextManager,
        language: PromptLanguage
    ): IntelligentPrompt {
        const complexity = ContextAnalysisEngine.analyzeContextComplexity(contextManager);
        const builder = new PromptBuilder(language);
        
        // Strategy selection based on complexity
        switch (complexity.level) {
            case 'simple':
                return builder.buildSimplePrompt(userMessage, contextManager);
                
            case 'moderate':
                return builder.buildModeratePrompt(userMessage, contextManager);
                
            case 'complex':
                return builder.buildComplexPrompt(userMessage, contextManager, complexity);
        }
    }
    
    static buildSimplePrompt(
        userMessage: ChatMessage,
        contextManager: ContextManager,
        language: PromptLanguage
    ): string {
        const templates = {
            tr: {
                withSelection: `Seçili kod parçasına odaklanarak talimatı uygula:\n\n{selection}\n\nTALİMAT: {instruction}`,
                withFile: `Dosya içeriğine göre talimatı uygula:\n\n{file}\n\nTALİMAT: {instruction}`,
                plain: `{instruction}`
            },
            en: {
                withSelection: `Focus on the selected code and apply the instruction:\n\n{selection}\n\nINSTRUCTION: {instruction}`,
                withFile: `Apply instruction based on file content:\n\n{file}\n\nINSTRUCTION: {instruction}`,
                plain: `{instruction}`
            }
        };
        
        const template = templates[language];
        
        if (contextManager.agentSelectionContext) {
            return template.withSelection
                .replace('{selection}', '```\n' + contextManager.agentSelectionContext.content + '\n```')
                .replace('{instruction}', userMessage.content);
        }
        
        if (contextManager.agentFileContext) {
            const optimizedFile = ContextAnalysisEngine.optimizeContextForModel(
                contextManager.agentFileContext.content
            );
            return template.withFile
                .replace('{file}', optimizedFile.content)
                .replace('{instruction}', userMessage.content);
        }
        
        return template.plain.replace('{instruction}', userMessage.content);
    }
    
    static buildComplexPrompt(
        userMessage: ChatMessage,
        contextManager: ContextManager,
        complexity: ContextComplexity,
        language: PromptLanguage
    ): string {
        const chunks = this.splitContextIntoChunks(contextManager, 2000);
        const strategy = this.selectProcessingStrategy(complexity);
        
        switch (strategy) {
            case 'sequential':
                return this.buildSequentialPrompt(userMessage, chunks, language);
                
            case 'hierarchical':
                return this.buildHierarchicalPrompt(userMessage, chunks, language);
                
            case 'focused':
                return this.buildFocusedPrompt(userMessage, chunks, language);
                
            default:
                return this.buildFallbackPrompt(userMessage, contextManager, language);
        }
    }
}
```

---

## 9.6 Tool Descriptions System

### 🛠️ Multilingual Tool Documentation

İvme'nin tool description sistemi hem İngilizce hem de Türkçe comprehensive documentation sağlar:

```typescript
// Dynamic tool loading
export async function getToolsDescriptions(language: 'en' | 'tr' = 'tr'): Promise<string> {
    try {
        const { getToolsManager } = await import('../services/tools_manager.js');
        const toolsManager = getToolsManager();
        
        const allTools = toolsManager.getAllTools();
        const toolDescriptions = allTools.map(tool => 
            `- ${tool.name} -> ${tool.description}`
        ).join('\n');

        return toolDescriptions;
    } catch (error) {
        // Fallback to static descriptions
        return language === 'en' ? toolsEnDescriptions : toolsTrDescriptions;
    }
}
```

## 9.7 Planner-Specific Prompts

### 🎯 Tool-Calling System Prompt

```typescript
export function createPlannerToolCallingSystemPrompt(): string {
    let toolList = getToolsDescriptionsSync('en'); // Always English for tool calling
    
    return [
        'You are a Principal Software Architect.',
        'Use tool-calling to either produce the INITIAL PLAN (create_plan) or propose ONLY DELTA CHANGES (propose_plan_changes) to an existing plan.',
        'MANDATORY BEHAVIOR:',
        "- If there is a 'Previous Plan (for revision)' section, you MUST call 'propose_plan_changes'.",
        '- Do NOT generate code; only step descriptions/tools/args.',
        '--- Available Tools (EN) ---\n' + toolList
    ].join(' ');
}
```

## 9.8 Custom Tool Creation

### 🔧 Tool Creator System Prompt

```typescript
export const toolCreatorSystemPrompt = `# TOOL CREATOR ROLE

Sen bir uzman yazılım geliştirici ve araç tasarımcısısın. Kullanıcının talep ettiği işlevselliği gerçekleştiren özel araçlar oluşturuyorsun.

## TOOL SCHEMA FORMAT
\`\`\`json
{
  "name": "tool_name",
  "description": "Aracın kısa açıklaması",
  "parameters": {
    "type": "object",
    "properties": {
      "param1": {
        "type": "string",
        "description": "Parametre açıklaması"
      }
    },
    "required": ["param1"]
  }
}
\`\`\`

## GÜVENLİK KURALLARI
1. Sadece workspace içindeki dosyalara erişim
2. Sadece güvenli komutlar
3. Tüm girdi parametrelerini doğrula`;
```

---

<div align="center">
  <h2>🌐 Sophisticated Prompt Engineering</h2>
  <p><em>Multilingual AI communication excellence</em></p>
</div>

Bu sistem promptları bölümünde ele alınanlar:

- ✅ **System Prompt Architecture**: Modular, maintainable yapı
- ✅ **Multilingual Support**: Comprehensive TR/EN desteği  
- ✅ **Prompt Categories**: Initial, contextual, error fixing prompts
- ✅ **Language Switching**: Dynamic runtime language resolution
- ✅ **Contextual Building**: Intelligent context analysis
- ✅ **Tool Descriptions**: Static ve dynamic tool documentation
- ✅ **Planner Prompts**: Specialized planning prompts
- ✅ **Custom Tools**: Tool creation prompt sistemi

Sistem promptları, İvme extension'ının AI capabilities'inin foundation'ını oluşturur ve optimal model performance sağlar.

Bir sonraki bölümde **"Geliştirici Rehberi"**ni inceleyeceğiz! 🚀
