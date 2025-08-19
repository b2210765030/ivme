/* ==========================================================================
   TOOLS MANAGER - Project-based tool storage in .ivme/tools.json
   ========================================================================== */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ToolSchema {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, any>;
        required?: string[];
    };
}

export interface BuiltinTool {
    name: string;
    description: string;
    schema: ToolSchema;
    type: 'builtin';
}

export interface CustomTool {
    name: string;
    description: string;
    schema: ToolSchema;
    code: string;
    type: 'custom';
    created_at: string;
    updated_at: string;
}

export interface ToolsData {
    builtin_tools: BuiltinTool[];
    custom_tools: CustomTool[];
}

export interface ToolCreationRequest {
    name: string;
    description: string;
    functionality: string;
}

export class ToolsManager {
    private toolsFilePath: vscode.Uri | null = null;
    private toolsData: ToolsData = { builtin_tools: [], custom_tools: [] };
    private extensionContext: vscode.ExtensionContext | null = null;

    constructor() {
        this.initializeAsync();
    }

    private async initializeAsync(): Promise<void> {
        try {
            await this.ensureIvmeDirectory();
            await this.loadTools();
        } catch (error) {
            console.error('Failed to initialize tools manager:', error);
        }
    }

    private async ensureIvmeDirectory(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        if (workspaceFolder) {
            const ivmeDir = vscode.Uri.joinPath(workspaceFolder.uri, '.ivme');
            this.toolsFilePath = vscode.Uri.joinPath(ivmeDir, 'tools.json');
            try {
                await vscode.workspace.fs.createDirectory(ivmeDir);
            } catch (error) {
                // ignore
            }
            return;
        }

        // Fallback to extension global storage if workspace not available
        if (this.extensionContext) {
            try {
                const storageDir = vscode.Uri.joinPath(this.extensionContext.globalStorageUri, 'ivme');
                await vscode.workspace.fs.createDirectory(storageDir);
                this.toolsFilePath = vscode.Uri.joinPath(storageDir, 'tools.json');
            } catch (error) {
                console.error('Failed to ensure global tools directory:', error);
            }
            return;
        }

        // No workspace and no extension context — toolsFilePath remains null
    }

    private async ensureToolsFile(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            console.warn('No workspace folder found');
            return;
        }
        // Prefer workspace .ivme when available
        await this.ensureIvmeDirectory();
        if (!this.toolsFilePath) return;

        try {
            // Check if tools.json exists, if not create with built-in tools
            try {
                await vscode.workspace.fs.stat(this.toolsFilePath);
            } catch {
                await this.createInitialToolsFile();
            }
        } catch (error) {
            console.error('Failed to ensure tools file:', error);
        }
    }

    // Allow external code to provide extension context (used if no workspace open)
    public setExtensionContext(context: vscode.ExtensionContext) {
        this.extensionContext = context;
        // Re-run ensure to set toolsFilePath if needed
        this.ensureIvmeDirectory().catch(() => {});
    }

    private async createInitialToolsFile(): Promise<void> {
        if (!this.toolsFilePath) return;

        const initialData: ToolsData = {
            builtin_tools: [
                {
                    name: 'check_index',
                    description: 'Planner index içinde belirtilen dosya(ların) varlığını kontrol eder',
                    schema: {
                        name: 'check_index',
                        description: 'Planner index içinde belirtilen dosya(ların) varlığını kontrol eder',
                        parameters: {
                            type: 'object',
                            properties: {
                                file: { type: 'string', description: 'Kontrol edilecek dosya yolu' },
                                files: { type: 'array', items: { type: 'string' }, description: 'Kontrol edilecek dosya listesi' }
                            }
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'search',
                    description: 'Plan aşamasında anahtar kelimelerle arama niyeti',
                    schema: {
                        name: 'search',
                        description: 'Plan aşamasında anahtar kelimelerle arama niyeti',
                        parameters: {
                            type: 'object',
                            properties: {
                                keywords: { type: 'array', items: { type: 'string' }, description: 'Arama anahtar kelimeleri' },
                                query: { type: 'string', description: 'Arama sorgusu' },
                                top_k: { type: 'number', description: 'Döndürülecek sonuç sayısı' }
                            }
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'locate_code',
                    description: 'Bir fonksiyon/parça adını veya regex\'i kullanarak bulunduğu dosyada tam satır aralığını tespit et',
                    schema: {
                        name: 'locate_code',
                        description: 'Bir fonksiyon/parça adını veya regex\'i kullanarak bulunduğu dosyada tam satır aralığını tespit et',
                        parameters: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', description: 'Aranacak fonksiyon/değişken adı' },
                                pattern: { type: 'string', description: 'Regex deseni' },
                                path: { type: 'string', description: 'Aranacak dosya yolu' },
                                save_as: { type: 'string', description: 'Sonucu kaydetmek için anahtar' }
                            }
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'retrieve_chunks',
                    description: 'Vektör indeksinden ilgili kod/doküman parçalarını getirir',
                    schema: {
                        name: 'retrieve_chunks',
                        description: 'Vektör indeksinden ilgili kod/doküman parçalarını getirir',
                        parameters: {
                            type: 'object',
                            properties: {
                                query: { type: 'string', description: 'Arama sorgusu' },
                                top_k: { type: 'number', description: 'Döndürülecek sonuç sayısı' }
                            },
                            required: ['query']
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'create_file',
                    description: 'Yeni dosya oluştur',
                    schema: {
                        name: 'create_file',
                        description: 'Yeni dosya oluştur',
                        parameters: {
                            type: 'object',
                            properties: {
                                path: { type: 'string', description: 'Oluşturulacak dosya yolu' },
                                content_spec: { type: 'string', description: 'Dosya içeriği açıklaması' }
                            },
                            required: ['path']
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'edit_file',
                    description: 'Mevcut dosyayı düzenle',
                    schema: {
                        name: 'edit_file',
                        description: 'Mevcut dosyayı düzenle',
                        parameters: {
                            type: 'object',
                            properties: {
                                path: { type: 'string', description: 'Düzenlenecek dosya yolu' },
                                find_spec: { type: 'string', description: 'Bulunacak metin açıklaması' },
                                change_spec: { type: 'string', description: 'Yapılacak değişiklik açıklaması' },
                                use_saved_range: { type: 'string', description: 'Kaydedilmiş aralık anahtarı' }
                            }
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'append_file',
                    description: 'Dosya başına/sonuna ekle',
                    schema: {
                        name: 'append_file',
                        description: 'Dosya başına/sonuna ekle',
                        parameters: {
                            type: 'object',
                            properties: {
                                path: { type: 'string', description: 'Dosya yolu' },
                                content_spec: { type: 'string', description: 'Eklenecek içerik açıklaması' },
                                position: { type: 'string', enum: ['end', 'beginning'], description: 'Ekleme pozisyonu' }
                            },
                            required: ['path']
                        }
                    },
                    type: 'builtin'
                }
            ],
            custom_tools: []
        };

        const content = Buffer.from(JSON.stringify(initialData, null, 2), 'utf8');
        await vscode.workspace.fs.writeFile(this.toolsFilePath, content);
        console.log(`[ToolsManager] Created initial tools file: ${this.toolsFilePath.fsPath}`);
    }

    private async loadTools(): Promise<void> {
        if (!this.toolsFilePath) return;

        try {
            const bytes = await vscode.workspace.fs.readFile(this.toolsFilePath);
            const content = Buffer.from(bytes).toString('utf8');
            this.toolsData = JSON.parse(content);
            console.log(`[ToolsManager] Loaded ${this.toolsData.builtin_tools.length} built-in tools and ${this.toolsData.custom_tools.length} custom tools`);
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'FileNotFound') {
                console.log('[ToolsManager] tools.json not found, starting with empty tools data');
            } else {
                console.error('Failed to load tools:', error);
            }
            this.toolsData = { builtin_tools: [], custom_tools: [] };
        }
    }

    private async saveTools(): Promise<void> {
        if (!this.toolsFilePath) return;

        try {
            const content = Buffer.from(JSON.stringify(this.toolsData, null, 2), 'utf8');
            await vscode.workspace.fs.writeFile(this.toolsFilePath, content);
            console.log(`[ToolsManager] Saved tools to ${this.toolsFilePath.fsPath}`);
        } catch (error) {
            console.error('Failed to save tools:', error);
            throw error;
        }
    }

    // Public methods
    public getAllTools(): (BuiltinTool | CustomTool)[] {
        return [...this.toolsData.builtin_tools, ...this.toolsData.custom_tools];
    }

    public async initializeBuiltinTools(): Promise<{ success: boolean; message?: string; error?: string }> {
        try {
            // Check if tools.json already exists and has builtin tools
            if (this.toolsData.builtin_tools.length > 0) {
                return { 
                    success: true, 
                    message: `Araçlar zaten mevcut: ${this.toolsData.builtin_tools.length} built-in, ${this.toolsData.custom_tools.length} custom` 
                };
            }

            // Force create initial tools file with built-in tools
            await this.createInitialToolsFile();
            
            // Reload tools data
            await this.loadTools();

            return { 
                success: true, 
                message: `Built-in araçlar başarıyla oluşturuldu: ${this.toolsData.builtin_tools.length} araç` 
            };

        } catch (error) {
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Araç başlatma hatası' 
            };
        }
    }

    public getBuiltinTools(): BuiltinTool[] {
        return this.toolsData.builtin_tools;
    }

    public getCustomTools(): CustomTool[] {
        return this.toolsData.custom_tools;
    }

    public getToolByName(name: string): BuiltinTool | CustomTool | undefined {
        return this.getAllTools().find(tool => tool.name === name);
    }

    public getToolNames(): string[] {
        return this.getAllTools().map(tool => tool.name);
    }

    public hasCustomTool(name: string): boolean {
        return this.toolsData.custom_tools.some(tool => tool.name === name);
    }

    public async createCustomTool(request: ToolCreationRequest): Promise<{ success: boolean; tool?: CustomTool; error?: string }> {
        try {
            // Check if tool already exists
            if (this.getToolByName(request.name)) {
                return { success: false, error: 'Bu isimde bir araç zaten mevcut' };
            }

            // Generate tool schema and code using AI (Phase 1 & 2)
            const schemaResult = await this.generateToolSchema(request);
            if (!schemaResult.success) {
                return { success: false, error: schemaResult.error };
            }

            const codeResult = await this.generateToolImplementation(request, schemaResult.schema!);
            if (!codeResult.success) {
                return { success: false, error: codeResult.error };
            }

            const now = new Date().toISOString();
            const customTool: CustomTool = {
                name: request.name,
                description: request.description,
                schema: schemaResult.schema!,
                code: codeResult.code || '',
                type: 'custom',
                created_at: now,
                updated_at: now
            };

            // Add to tools data and save
            this.toolsData.custom_tools.push(customTool);
            await this.saveTools();

            console.log(`[ToolsManager] Custom tool created: ${request.name}`);
            return { success: true, tool: customTool };

        } catch (error) {
            console.error('Error creating custom tool:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Bilinmeyen hata' };
        }
    }

    public async deleteCustomTool(toolName: string): Promise<{ success: boolean; error?: string }> {
        try {
            const toolIndex = this.toolsData.custom_tools.findIndex(tool => tool.name === toolName);
            if (toolIndex === -1) {
                return { success: false, error: 'Araç bulunamadı' };
            }

            // Remove from tools data and save
            this.toolsData.custom_tools.splice(toolIndex, 1);
            await this.saveTools();

            console.log(`[ToolsManager] Custom tool deleted: ${toolName}`);
            return { success: true };

        } catch (error) {
            console.error('Error deleting custom tool:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Bilinmeyen hata' };
        }
    }

    // AI generation methods (same as before but simplified)
    private async generateToolSchema(request: ToolCreationRequest): Promise<{ success: boolean; schema?: ToolSchema; error?: string }> {
        try {
            const geminiModule = await import('./gemini.js');
            const vllmModule = await import('./vLLM.js');
            
            const config = vscode.workspace.getConfiguration('ivme');
            const activeService = config.get<string>('activeApiService') || 'Gemini';

            let aiService: any;
            if (activeService === 'Gemini') {
                aiService = new geminiModule.GeminiApiService();
            } else {
                aiService = new vllmModule.VllmApiService();
            }

            const schemaPrompt = `
# TOOL SCHEMA GENERATOR

Sen bir uzman yazılım mimarısısın. Kullanıcının tanımladığı araç için planner LLM'in kullanabileceği tool schema oluştur.

## GÖREV
Sadece tool schema oluştur, kod yazma.

## INPUT
Araç Adı: ${request.name}
Açıklama: ${request.description}
İşlevsellik: ${request.functionality}

## OUTPUT FORMAT
Sadece JSON schema döndür, başka hiçbir şey yazma:

\`\`\`json
{
  "name": "tool_name",
  "description": "Kısa ve net açıklama",
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
            `.trim();

            let response = '';
            await aiService.generateChatContent([
                { role: 'user', content: schemaPrompt }
            ], (chunk: string) => { response += chunk; });

            if (!response) {
                return { success: false, error: 'AI servisi yanıt veremedi' };
            }

            const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
            if (!jsonMatch) {
                return { success: false, error: 'Tool schema bulunamadı' };
            }

            const schema = JSON.parse(jsonMatch[1]);
            return { success: true, schema };

        } catch (error) {
            console.error('Error generating tool schema:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Schema oluşturma hatası' };
        }
    }

    private async generateToolImplementation(request: ToolCreationRequest, schema: ToolSchema): Promise<{ success: boolean; code?: string; error?: string }> {
        try {
            const geminiModule = await import('./gemini.js');
            const vllmModule = await import('./vLLM.js');
            
            const config = vscode.workspace.getConfiguration('ivme');
            const activeService = config.get<string>('activeApiService') || 'Gemini';

            let aiService: any;
            if (activeService === 'Gemini') {
                aiService = new geminiModule.GeminiApiService();
            } else {
                aiService = new vllmModule.VllmApiService();
            }

            const codePrompt = `
# TOOL IMPLEMENTATION GENERATOR

Sen bir VSCode Extension TypeScript uzmanısın. Verilen tool schema ve gereksinimler için tam işlevsel kod yaz.

## TOOL SCHEMA
\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

## USER REQUIREMENTS
Araç Adı: ${request.name}
Açıklama: ${request.description}
İstenen İşlevsellik: ${request.functionality}

## AVAILABLE MODULES
- vscode: VSCode API (workspace, window, commands, etc.)
- fs/promises: File system operations
- path: Path utilities
- child_process: Execute system commands

## KURALLAR
1. TypeScript kodu yaz, sadece function body
2. Async/await kullan
3. Try-catch ile comprehensive hata yönetimi
4. VSCode extension context'inde çalışacak şekilde
5. Args object'inden parametreleri extract et
6. Her zaman string döndür (başarı/hata mesajı)
7. vscode modülü zaten import edilmiş, kullanabilirsin
8. File operations için vscode.workspace.fs kullan
9. User feedback için descriptive mesajlar döndür

## EXAMPLE PATTERNS
\`\`\`typescript
// File operations
const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, 'path/to/file');
await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));

// Show messages
vscode.window.showInformationMessage('Success!');

// Execute commands
await vscode.commands.executeCommand('command.name');
\`\`\`

## OUTPUT FORMAT
Sadece TypeScript function kodu döndür:

\`\`\`typescript
export async function ${request.name}(args: any): Promise<string> {
    try {
        // Extract parameters from args
        const { param1, param2 } = args;
        
        // Validate required parameters
        if (!param1) {
            return 'Error: param1 is required';
        }
        
        // Implementation here
        // Use vscode API, file operations, etc.
        
        return "İşlem başarıyla tamamlandı";
    } catch (error) {
        console.error('${request.name} error:', error);
        return \`Hata: \${error instanceof Error ? error.message : 'Bilinmeyen hata'}\`;
    }
}
\`\`\`
            `.trim();

            let response = '';
            await aiService.generateChatContent([
                { role: 'user', content: codePrompt }
            ], (chunk: string) => { response += chunk; });

            if (!response) {
                return { success: false, error: 'AI servisi yanıt veremedi' };
            }

            const codeMatch = response.match(/```typescript\s*([\s\S]*?)\s*```/);
            if (!codeMatch) {
                return { success: false, error: 'Implementation code bulunamadı' };
            }

            const code = codeMatch[1];
            return { success: true, code };

        } catch (error) {
            console.error('Error generating tool implementation:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Code oluşturma hatası' };
        }
    }

    // Execute custom tool by dynamically loading and running its TypeScript code
    public async executeCustomTool(toolName: string, args: any): Promise<string> {
        try {
            const tool = this.toolsData.custom_tools.find(t => t.name === toolName);
            if (!tool) {
                return `Error: Custom tool '${toolName}' not found`;
            }

            // Create temporary execution file
            const result = await this.executeToolCode(tool, args);
            return result;

        } catch (error) {
            console.error(`Error executing custom tool ${toolName}:`, error);
            return `Error executing custom tool: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    }

    private async executeToolCode(tool: CustomTool, args: any): Promise<string> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return 'Error: No workspace folder found';
        }

        const tempDir = vscode.Uri.joinPath(workspaceFolder.uri, '.ivme', 'temp');
        const tempFile = vscode.Uri.joinPath(tempDir, `${tool.name}_temp.js`);

        try {
            // Ensure temp directory exists
            await vscode.workspace.fs.createDirectory(tempDir);

            // Convert TypeScript to JavaScript (basic conversion)
            const jsCode = this.convertToExecutableJS(tool.code, tool.name);

            // Write executable JavaScript file
            const content = Buffer.from(jsCode, 'utf8');
            await vscode.workspace.fs.writeFile(tempFile, content);

            // Execute the function
            const result = await this.runJavaScriptFunction(tempFile.fsPath, tool.name, args);
            
            // Clean up temp file
            try {
                await vscode.workspace.fs.delete(tempFile);
            } catch (cleanupError) {
                console.warn('Failed to cleanup temp file:', cleanupError);
            }

            return result;

        } catch (error) {
            // Clean up on error
            try {
                await vscode.workspace.fs.delete(tempFile);
            } catch {}
            
            console.error(`Error executing tool code for ${tool.name}:`, error);
            return `Error: ${error instanceof Error ? error.message : 'Unknown execution error'}`;
        }
    }

    private convertToExecutableJS(tsCode: string, functionName: string): string {
        // Basic TypeScript to JavaScript conversion
        let jsCode = tsCode
            .replace(/export\s+async\s+function/g, 'async function')
            .replace(/:\s*Promise<string>/g, '')
            .replace(/:\s*string/g, '')
            .replace(/:\s*any/g, '')
            .replace(/:\s*number/g, '')
            .replace(/:\s*boolean/g, '');

        // Add module exports and required imports
        const executableCode = `
const vscode = require('vscode');
const fs = require('fs/promises');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

${jsCode}

// Export the function for execution
module.exports = { ${functionName} };
        `.trim();

        return executableCode;
    }

    private async runJavaScriptFunction(filePath: string, functionName: string, args: any): Promise<string> {
        try {
            // Dynamic import the JavaScript module
            delete require.cache[filePath]; // Clear cache to ensure fresh load
            const toolModule = require(filePath);
            
            if (!toolModule[functionName] || typeof toolModule[functionName] !== 'function') {
                return `Error: Function '${functionName}' not found in tool module`;
            }

            // Execute the function
            const result = await toolModule[functionName](args);
            
            // Ensure result is a string
            if (typeof result === 'string') {
                return result;
            } else if (result !== null && result !== undefined) {
                return JSON.stringify(result);
            } else {
                return 'Tool executed successfully (no return value)';
            }

        } catch (error) {
            console.error(`Error running JavaScript function ${functionName}:`, error);
            return `Error executing function: ${error instanceof Error ? error.message : 'Unknown runtime error'}`;
        }
    }
}

// Singleton instance
let toolsManagerInstance: ToolsManager | null = null;

export function getToolsManager(): ToolsManager {
    if (!toolsManagerInstance) {
        toolsManagerInstance = new ToolsManager();
    }
    return toolsManagerInstance;
}
