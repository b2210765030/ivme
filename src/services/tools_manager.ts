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
            await this.ensureToolsFile();
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
                },
                // Extended built-in tools for richer code-agent capabilities
                {
                    name: 'read_file',
                    description: 'Bir dosyanın tamamını veya belirli satır aralığını oku',
                    schema: {
                        name: 'read_file',
                        description: 'Bir dosyanın tamamını veya belirli satır aralığını oku',
                        parameters: {
                            type: 'object',
                            properties: {
                                path: { type: 'string', description: 'Okunacak dosya yolu' },
                                start_line: { type: 'number', description: 'Başlangıç satırı (1-indexed, opsiyonel)' },
                                end_line: { type: 'number', description: 'Bitiş satırı (1-indexed, opsiyonel)' },
                                save_as: { type: 'string', description: 'Okunan aralığı ileride kullanmak için anahtar' }
                            }
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'list_dir',
                    description: 'Bir dizindeki dosya ve klasörleri listeler',
                    schema: {
                        name: 'list_dir',
                        description: 'Bir dizindeki dosya ve klasörleri listeler',
                        parameters: {
                            type: 'object',
                            properties: {
                                path: { type: 'string', description: 'Listelenecek dizin (varsayılan: proje kökü)' },
                                depth: { type: 'number', description: 'Alt dizin derinliği (varsayılan: 1)' },
                                glob: { type: 'string', description: 'Dahil edilecek glob (örn. **/*.ts)' },
                                files_only: { type: 'boolean', description: 'Sadece dosyaları listele' },
                                dirs_only: { type: 'boolean', description: 'Sadece klasörleri listele' }
                            }
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'delete_path',
                    description: 'Belirtilen dosya veya klasörü siler',
                    schema: {
                        name: 'delete_path',
                        description: 'Belirtilen dosya veya klasörü siler',
                        parameters: {
                            type: 'object',
                            properties: {
                                path: { type: 'string', description: 'Silinecek yol' },
                                recursive: { type: 'boolean', description: 'Klasörler için içeriğiyle birlikte sil' }
                            },
                            required: ['path']
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'move_path',
                    description: 'Dosya veya klasörü yeni bir konuma taşır/yeniden adlandırır',
                    schema: {
                        name: 'move_path',
                        description: 'Dosya veya klasörü yeni bir konuma taşır/yeniden adlandırır',
                        parameters: {
                            type: 'object',
                            properties: {
                                source: { type: 'string', description: 'Kaynak yol' },
                                target: { type: 'string', description: 'Hedef yol' },
                                overwrite: { type: 'boolean', description: 'Üstüne yaz' }
                            },
                            required: ['source','target']
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'copy_path',
                    description: 'Dosya veya klasörü yeni bir konuma kopyalar',
                    schema: {
                        name: 'copy_path',
                        description: 'Dosya veya klasörü yeni bir konuma kopyalar',
                        parameters: {
                            type: 'object',
                            properties: {
                                source: { type: 'string', description: 'Kaynak yol' },
                                target: { type: 'string', description: 'Hedef yol' },
                                overwrite: { type: 'boolean', description: 'Üstüne yaz' }
                            },
                            required: ['source','target']
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'create_directory',
                    description: 'Yeni bir klasör oluşturur (gerekli üst dizinlerle)',
                    schema: {
                        name: 'create_directory',
                        description: 'Yeni bir klasör oluşturur (gerekli üst dizinlerle)',
                        parameters: {
                            type: 'object',
                            properties: {
                                path: { type: 'string', description: 'Oluşturulacak klasör yolu' }
                            },
                            required: ['path']
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'search_text',
                    description: 'Workspace içinde metin/regex araması yapar',
                    schema: {
                        name: 'search_text',
                        description: 'Workspace içinde metin/regex araması yapar',
                        parameters: {
                            type: 'object',
                            properties: {
                                query: { type: 'string', description: 'Aranacak metin veya regex' },
                                is_regex: { type: 'boolean', description: 'Regex olarak ara' },
                                include: { type: 'string', description: 'Dahil glob (örn. src/**/*.ts)' },
                                exclude: { type: 'string', description: 'Hariç glob (örn. **/dist/**)' },
                                top_k: { type: 'number', description: 'Maksimum sonuç' }
                            },
                            required: ['query']
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'replace_in_file',
                    description: 'Bir dosyada metni/regex eşleşmelerini değiştirir',
                    schema: {
                        name: 'replace_in_file',
                        description: 'Bir dosyada metni/regex eşleşmelerini değiştirir',
                        parameters: {
                            type: 'object',
                            properties: {
                                path: { type: 'string', description: 'Hedef dosya' },
                                find: { type: 'string', description: 'Bulunacak metin veya regex' },
                                replace: { type: 'string', description: 'Yerine konacak metin' },
                                is_regex: { type: 'boolean', description: 'Regex olarak ara' },
                                flags: { type: 'string', description: 'Regex bayrakları (örn. gi)' }
                            },
                            required: ['path','find','replace']
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'update_json',
                    description: 'JSON dosyasında belirtilen alanları günceller/ekler',
                    schema: {
                        name: 'update_json',
                        description: 'JSON dosyasında belirtilen alanları günceller/ekler',
                        parameters: {
                            type: 'object',
                            properties: {
                                path: { type: 'string', description: 'JSON dosya yolu' },
                                updates: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            path: { type: 'string', description: 'Dot notasyonu veya JSON Pointer (/a/b)' },
                                            value: { description: 'Yeni değer (string/number/boolean/object/array)' }
                                        },
                                        required: ['path','value']
                                    }
                                },
                                create_if_missing: { type: 'boolean', description: 'Dosya yoksa oluştur' }
                            },
                            required: ['path','updates']
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'run_command',
                    description: 'Güvenli beyaz liste ile terminal komutu çalıştırır (kısa süreli)',
                    schema: {
                        name: 'run_command',
                        description: 'Güvenli beyaz liste ile terminal komutu çalıştırır (kısa süreli)',
                        parameters: {
                            type: 'object',
                            properties: {
                                command: { type: 'string', description: 'Çalıştırılacak komut (örn. npm ci)' },
                                cwd: { type: 'string', description: 'Çalışma dizini (varsayılan: proje kökü)' },
                                timeout_ms: { type: 'number', description: 'Zaman aşımı (ms, varsayılan: 60000)' }
                            },
                            required: ['command']
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'run_npm_script',
                    description: 'package.json içindeki bir scripti çalıştırır (npm/pnpm/yarn)',
                    schema: {
                        name: 'run_npm_script',
                        description: 'package.json içindeki bir scripti çalıştırır (npm/pnpm/yarn)',
                        parameters: {
                            type: 'object',
                            properties: {
                                script: { type: 'string', description: 'Çalıştırılacak script adı (örn. build, test)' },
                                package_manager: { type: 'string', enum: ['npm','pnpm','yarn'], description: 'Paket yöneticisi (varsayılan otomatik)' },
                                args: { type: 'array', items: { type: 'string' }, description: 'Ek argümanlar' }
                            },
                            required: ['script']
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'format_file',
                    description: 'Dosyayı kayıtlı formatlayıcı ile biçimlendirir',
                    schema: {
                        name: 'format_file',
                        description: 'Dosyayı kayıtlı formatlayıcı ile biçimlendirir',
                        parameters: {
                            type: 'object',
                            properties: {
                                path: { type: 'string', description: 'Biçimlendirilecek dosya' }
                            },
                            required: ['path']
                        }
                    },
                    type: 'builtin'
                },
                {
                    name: 'open_in_editor',
                    description: 'Bir dosyayı editörde açar ve (opsiyonel) satıra gider',
                    schema: {
                        name: 'open_in_editor',
                        description: 'Bir dosyayı editörde açar ve (opsiyonel) satıra gider',
                        parameters: {
                            type: 'object',
                            properties: {
                                path: { type: 'string', description: 'Açılacak dosya' },
                                line: { type: 'number', description: 'Satır numarası (1-indexed, opsiyonel)' },
                                column: { type: 'number', description: 'Sütun (opsiyonel)' }
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
        // Created initial tools file
    }

    private async loadTools(): Promise<void> {
        if (!this.toolsFilePath) return;

        try {
            const bytes = await vscode.workspace.fs.readFile(this.toolsFilePath);
            const content = Buffer.from(bytes).toString('utf8');
            this.toolsData = JSON.parse(content);
            // Tools loaded
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'FileNotFound') {
                // tools.json not found
            } else {
                console.error('Failed to load tools:', error);
            }
            this.toolsData = { builtin_tools: [], custom_tools: [] };
        }
    }

    private async saveTools(): Promise<void> {
        if (!this.toolsFilePath) {
            // Try to establish tools path lazily
            await this.ensureIvmeDirectory();
            await this.ensureToolsFile();
        }
        if (!this.toolsFilePath) return;

        try {
            const content = Buffer.from(JSON.stringify(this.toolsData, null, 2), 'utf8');
            await vscode.workspace.fs.writeFile(this.toolsFilePath, content);
            // Tools saved
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

            // Custom tool created
            return { success: true, tool: customTool };

        } catch (error) {
            console.error('Error creating custom tool:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Bilinmeyen hata' };
        }
    }

    public async updateCustomToolCode(toolName: string, newCode: string): Promise<{ success: boolean; tool?: CustomTool; error?: string }> {
        try {
            const tool = this.toolsData.custom_tools.find(t => t.name === toolName);
            if (!tool) {
                return { success: false, error: 'Araç bulunamadı' };
            }
            tool.code = String(newCode ?? '');
            tool.updated_at = new Date().toISOString();
            await this.saveTools();
            return { success: true, tool };
        } catch (error) {
            console.error('Error updating custom tool code:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Bilinmeyen hata' };
        }
    }

    public async deleteCustomTool(toolName: string): Promise<{ success: boolean; error?: string }> {
        try {
            // Ensure file exists before mutating/saving and refresh in-memory state
            await this.ensureToolsFile();
            await this.loadTools();
            const toolIndex = this.toolsData.custom_tools.findIndex(tool => tool.name === toolName);
            if (toolIndex === -1) {
                return { success: false, error: 'Araç bulunamadı' };
            }

            // Remove from tools data and save
            this.toolsData.custom_tools.splice(toolIndex, 1);
            await this.saveTools();
            await this.loadTools();

            // Custom tool deleted
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

/**
 * Planner LLM'in tool-calling özelliği için kullanılacak araç şemalarını oluşturur.
 * Tüm planlama mantığını tek bir 'create_plan' fonksiyonuna sararak LLM'in işini basitleştirir.
 * OpenAI/vLLM uyumlu tool-calling formatında bir araç dizisi döndürür.
 */
export function getToolsForPlanner(): any[] {
    const tools = [
        {
            type: 'function',
            function: {
                name: 'create_plan',
                description: 'İLK planı üretir. Adımları sırayla döndürür. Revizyon için kullanmayın.',
                parameters: {
                    type: 'object',
                    properties: {
                        steps: {
                            type: 'array',
                            description: 'Uygulanacak eylem adımlarının sıralı listesi.',
                            items: {
                                type: 'object',
                                properties: {
                                    step: { type: 'number', description: 'Adımın 1\'den başlayan sıra numarası.' },
                                    action: { type: 'string', description: 'Bu adımda yapılacak işlemin geliştirici için net açıklaması.' },
                                    thought: { type: 'string', description: 'Bu adımı neden ve nasıl yapmayı planladığına dair kısa içsel akıl yürütme.' },
                                    ui_text: { type: 'string', description: 'Arayüzde gösterilecek tek cümlelik özet.' },
                                    tool: { type: 'string', description: 'Bu adımı uygulamak için kullanılacak araç adı (örn: edit_file, create_file, search).'},
                                    args: {
                                        type: 'object',
                                        description: 'Seçilen tool için gerekli parametreler. Esnek alanlar içerir.',
                                        properties: {},
                                        additionalProperties: true
                                    },
                                    files_to_edit: { type: 'array', items: { type: 'string' }, description: 'Bu adımda düzenlenmesi planlanan dosyaların göreli yolları.' },
                                    notes: { type: 'string', description: 'Opsiyonel ek notlar.' }
                                },
                                required: ['step', 'action', 'thought']
                            }
                        }
                    },
                    required: ['steps'],
                    additionalProperties: false
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'propose_plan_changes',
                description: 'Mevcut plana uygulanacak DEĞİŞİKLİKLERİ (delta) önerir: yeni adım ekle/çıkar/değiştir/sırala. TAM plan değil, sadece değişiklikleri döndür.',
                parameters: {
                    type: 'object',
                    properties: {
                        changes: {
                            type: 'array',
                            description: 'Plan üzerinde yapılacak değişiklikler listesi.',
                            items: {
                                type: 'object',
                                properties: {
                                    op: { type: 'string', enum: ['insert','delete','update','reorder'], description: 'Değişiklik türü' },
                                    anchor_step: { type: 'number', description: 'Hedef/Referans adım numarası (örn. 5. adımın önüne ekle)' },
                                    position: { type: 'string', enum: ['before','after','replace','append_end','prepend_start'], description: 'Yerleştirme biçimi' },
                                    new_step: {
                                        type: 'object',
                                        description: 'Ekleme/değiştirme için önerilen yeni adım içeriği (KISA ve KODSUZ).',
                                        properties: {
                                            action: { type: 'string' },
                                            thought: { type: 'string' },
                                            ui_text: { type: 'string' },
                                            tool: { type: 'string' },
                                            args: { type: 'object', additionalProperties: true }
                                        },
                                        required: ['action','thought']
                                    },
                                    notes: { type: 'string', description: 'Kısa gerekçe/uyarı (opsiyonel)' }
                                },
                                required: ['op']
                            }
                        }
                    },
                    required: ['changes'],
                    additionalProperties: false
                }
            }
        }
    ];
    return tools;
}
