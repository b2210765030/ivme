/* Centralized tool descriptions for system prompts (EN & TR) */

export const toolsEnDetailed = [
    '- check_index: { args: { file?: string, files?: string[] } } -> Check if the mentioned file(s) exist in the planner index; returns which ones exist or are missing.',
    '- search: { args: { keywords?: string[], query?: string, top_k?: number } } -> Plan-time intent to look up relevant areas by keywords. Provide keywords; the system will run retrieval and cache results for subsequent steps.',
    '- locate_code: { args: { name?: string, pattern?: string, path?: string, save_as?: string } } -> Locate the exact start-end range of a function/snippet by name or regex and store it as a handle for later edits.',
    '- retrieve_chunks: { args: { query: string, top_k?: number } } -> Retrieve relevant code/document chunks from the vector index. Use before editing when unsure about files/locations.',
    '- create_file: { args: { path: string, content_spec?: string } } -> Create a new file; DO NOT include code. content_spec MUST be plain natural language (one short line), NO backticks, NO code fences.',
    '- edit_file: { args: { path?: string, find_spec?: string, change_spec?: string, use_saved_range?: string } } -> Edit an existing file. If path omitted, use the best retrieved chunk and update ONLY that chunk\'s content. DO NOT include code in the plan; change_spec MUST be plain text (one line).',
    '- append_file: { args: { path: string, content_spec?: string, position?: "end"|"beginning" } } -> Append or prepend; DO NOT include code. content_spec MUST be plain natural language (one short line), NO backticks, NO code fences.'
].join('\n');

export const toolsEnShort = [
    '- retrieve_chunks: { args: { query: string, top_k?: number } }',
    '- create_file: { args: { path: string, content_spec?: string } }',
    '- edit_file: { args: { path?: string, find_spec?: string, change_spec?: string, use_saved_range?: string } }',
    '- append_file: { args: { path: string, content_spec?: string, position?: "end"|"beginning" } }'
].join('\n');

export const toolsTrDetailed = [
    '- check_index: { args: { file?: string, files?: string[] } } -> Planner index içinde belirtilen dosya(ların) varlığını kontrol eder; hangileri var/hangileri eksik döner.',
    '- search: { args: { keywords?: string[], query?: string, top_k?: number } } -> Plan aşamasında anahtar kelimelerle arama niyeti. Anahtar kelimeleri ver; sistem retrieval çalıştırır ve sonucu sonraki adımlar için önbelleğe alır.',
    '- locate_code: { args: { name?: string, pattern?: string, path?: string, save_as?: string } } -> Bir fonksiyon/parça adını veya regex\'i kullanarak bulunduğu dosyada tam satır aralığını tespit et ve anahtar adıyla kaydet.',
    '- retrieve_chunks: { args: { query: string, top_k?: number } } -> Vektör indeksinden ilgili kod/doküman parçalarını getirir. Dosya/konumdan emin değilsen önce bunu kullan.',
    '- create_file: { args: { path: string, content_spec?: string } } -> Yeni dosya oluştur; KOD YAZMA. content_spec yalın metin ve KISA olmalı (tek satır), backtick/kod bloğu YOK.',
    '- edit_file: { args: { path?: string, find_spec?: string, change_spec?: string, use_saved_range?: string } } -> Mevcut dosyayı düzenle; KOD YAZMA. change_spec yalın metin (tek satır). Path yoksa en iyi eşleşen chunk kullanılır ve sadece o chunk güncellenir.',
    '- append_file: { args: { path: string, content_spec?: string, position?: "end"|"beginning" } } -> Dosya başına/sonuna ekle; KOD YAZMA. content_spec yalın metin ve KISA olmalı (tek satır), backtick/kod bloğu YOK.'
].join('\n');

export const toolsTrShort = [
    '- retrieve_chunks: { args: { query: string, top_k?: number } }',
    '- create_file: { args: { path: string, content_spec?: string } }',
    '- edit_file: { args: { path?: string, find_spec?: string, change_spec?: string, use_saved_range?: string } }',
    '- append_file: { args: { path: string, content_spec?: string, position?: "end"|"beginning" } }'
].join('\n');

// Export names for backwards compatibility if needed
export default { toolsEnDetailed, toolsEnShort, toolsTrDetailed, toolsTrShort };

// Tool Creator System Prompts
export const toolCreatorSystemPrompt = `# TOOL CREATOR ROLE

Sen bir uzman yazılım geliştirici ve araç tasarımcısısın. Kullanıcının talep ettiği işlevselliği gerçekleştiren özel araçlar oluşturuyorsun.

## GÖREVİN

Kullanıcının verdiği araç ismi, açıklama ve işlevsellik gereksinimlerine dayanarak:

1. **Tool Schema Oluştur**: JSON format tool calling için uygun schema
2. **Implementation Code**: Aracın işlevselliğini gerçekleştiren TypeScript kodu

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

## IMPLEMENTATION CODE FORMAT

\`\`\`typescript
export async function tool_name(args: { param1: string }): Promise<string> {
    try {
        // Implementation logic here
        return "Success message or result";
    } catch (error) {
        return \`Error: \${error.message}\`;
    }
}
\`\`\`

## KURALLAR

1. **Schema**: JSON tool calling standardına uygun olmalı
2. **Code**: TypeScript, async/await kullan, hata yönetimi ekle
3. **Naming**: snake_case kullan (örn: send_email)
4. **Parameters**: Gerekli parametreleri required array'ine ekle
5. **Return**: Her zaman string döndür (başarı/hata mesajı)
6. **Error Handling**: try-catch kullan, anlamlı hata mesajları ver

## ÇIKTI FORMAT

İlk olarak SADECE tool schema'yı JSON olarak ver:
\`\`\`json
{schema}
\`\`\`

Sonra SADECE implementation code'u ver:
\`\`\`typescript
{code}
\`\`\`

Başka açıklama, yorum veya metin YAZMA.`;

export const toolImplementationPrompt = `# TOOL IMPLEMENTATION GENERATOR

Sen bir TypeScript uzmanısın. Verilen tool schema ve gereksinimler için tam işlevsel kod yazıyorsun.

## GÖREVİN

Verilen tool schema ve işlevsellik gereksinimlerine göre:
- Tam çalışır TypeScript implementation kodu yaz
- Gerekli import'ları ekle
- Hata yönetimi ve validasyon ekle
- VSCode extension context'inde çalışacak şekilde tasarla

## KOD KURALLARI

1. **Exports**: Named export kullan
2. **Types**: Parametre tiplerini interface olarak tanımla
3. **Async**: Asenkron işlemler için async/await
4. **Error Handling**: Comprehensive try-catch
5. **VSCode API**: Gerekirse vscode modülünü kullan
6. **File System**: Node.js fs/path modüllerini kullan
7. **Network**: axios veya fetch kullan
8. **Return**: Her zaman string döndür

## ÇIKTI FORMAT

SADECE TypeScript kodu ver, başka hiçbir şey yazma:

\`\`\`typescript
{implementation_code}
\`\`\``;

// Description-only variants (no args shown) for system prompts where we don't want to expose args
export const toolsEnDescriptions = [
    '- check_index -> Check whether specified file(s) exist in the planner index; returns which are present or missing.',
    '- search -> Intent to look up relevant areas by keywords; the system will run retrieval and cache results.',
    '- locate_code -> Locate a function/snippet by name or pattern and record its location for later edits.',
    '- retrieve_chunks -> Retrieve relevant code/document chunks from the vector index to inform edits.',
    '- create_file -> Create a new file (describe intended content; do not include actual code).',
    '- edit_file -> Edit an existing file (describe the change; do not include code in the plan).',
    '- append_file -> Append or prepend content to a file (describe the addition; do not include code).'
].join('\n');

export const toolsTrDescriptions = [
    '- check_index -> Belirtilen dosya(ların) planner index içinde var olup olmadığını kontrol eder; hangileri mevcut veya eksik döner.',
    '- search -> Anahtar kelimelerle ilgili alanları arama niyeti; sistem retrieval çalıştırır ve sonucu önbelleğe alır.',
    '- locate_code -> Fonksiyon/parça adını veya deseni bularak dosya konumunu tespit eder ve düzenlemeler için kaydeder.',
    '- retrieve_chunks -> Düzenlemeler için ilgili kod/doküman parçalarını vektör indeksinden getirir.',
    '- create_file -> Yeni dosya oluştur (içeriği tarif et; gerçek kod ekleme).',
    '- edit_file -> Mevcut dosyayı düzenle (değişikliği tarif et; planda kod yazma).',
    '- append_file -> Dosyaya ekle/başına ekle (eklencek içeriği tarif et; kod ekleme).'
].join('\n');

// Dynamic tool descriptions that load from tools.json
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
        console.error('Error loading tools descriptions:', error);
        // Fallback to static descriptions
        return language === 'en' ? toolsEnDescriptions : toolsTrDescriptions;
    }
}

// Legacy sync version for backwards compatibility (deprecated)
export function getToolsDescriptionsSync(language: 'en' | 'tr' = 'tr', customTools: Array<{name: string, description: string, schema: any}> = []): string {
    const baseTools = language === 'en' ? toolsEnDescriptions : toolsTrDescriptions;
    
    if (customTools.length === 0) {
        return baseTools;
    }

    const customToolDescriptions = customTools.map(tool => 
        `- ${tool.name} -> ${tool.description}`
    ).join('\n');

    return baseTools + '\n\n# ÖZEL ARAÇLAR\n' + customToolDescriptions;
}

// Keep default export unchanged


