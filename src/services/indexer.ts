/* ==========================================================================
   PROJE İNDEKSLEYİCİ
   - Workspace dosyalarını tarar
   - @babel/parser ile JS/TS AST çıkarır ve kod parçacıklarını (chunk) üretir
   - Gemini ile özet ve embedding alır (opsiyonel)
   - Sonucu yerel JSON vektör mağazasına yazar
   ========================================================================== */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { ApiServiceManager } from './manager';
import { CodeChunkMetadata } from '../types';
import { EXTENSION_ID, SETTINGS_KEYS, RETRIEVAL_DEFAULTS } from '../core/constants';
import { generateUuid } from '../core/utils';

type IndexResult = {
    chunks: CodeChunkMetadata[];
};

export class ProjectIndexer {
    constructor(private readonly apiManager: ApiServiceManager, private readonly context: vscode.ExtensionContext) {}

    public async isWorkspaceIndexed(): Promise<boolean> {
        // Workspace-specific vector store path
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return false;
        }

        const ivmeDir = vscode.Uri.joinPath(workspaceFolder.uri, '.ivme');
        const storageUri = vscode.Uri.joinPath(ivmeDir, 'vector_store.json');

        try {
            const buf = await vscode.workspace.fs.readFile(storageUri);
            const json = JSON.parse(Buffer.from(buf).toString('utf8'));
            const chunks: CodeChunkMetadata[] = json?.chunks || [];
            return chunks.length > 0;
        } catch (e) {
            return false;
        }
    }

    /**
     * Incremental: Given a list of absolute file paths, (re)index only those files
     * and merge the resulting chunks into the existing vector store. If the
     * vector store does not yet exist or indexing is disabled, this method is a no-op.
     */
    public async updateVectorStoreForFiles(fsPaths: string[]): Promise<void> {
        const uniquePaths = Array.from(new Set(fsPaths.filter(Boolean)));
        if (uniquePaths.length === 0) return;

        // Guard: Only run if workspace is already indexed AND indexing is enabled
        const isIndexed = await this.isWorkspaceIndexed();
        const isEnabled = await this.getIndexingEnabled();
        if (!isIndexed || !isEnabled) {
            return;
        }

        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        const sourceName = config.get<string>(SETTINGS_KEYS.indexingSourceName) || 'workspace';

        const newChunks: CodeChunkMetadata[] = [];
        for (const filePath of uniquePaths) {
            try {
                const language = this.detectLanguageByExtension(filePath);
                if (!language) continue;
                const uri = vscode.Uri.file(filePath);
                const fileText = (await vscode.workspace.fs.readFile(uri)).toString();
                const fileChunks = this.extractChunksFromSource(fileText, filePath, language, sourceName);
                if (fileChunks.length === 0) {
                    const totalLines = fileText.split(/\r?\n/).length;
                    const fallbackChunk = this.makeChunk(sourceName, filePath, language as any, 'other', path.basename(filePath), 1, totalLines, this.simpleDependenciesFromText(fileText), fileText);
                    fileChunks.push(fallbackChunk);
                }

                // Optional summary + embedding (best-effort, time-limited)
                for (const chunk of fileChunks) {
                    try {
                        const summaryPrompt = this.buildSummaryPrompt(chunk.content);
                        const summaryText = await this.generateContentWithTimeout(summaryPrompt, 10000);
                        const parsed = summaryText ? this.tryParseSummaryJson(summaryText) : null;
                        if (parsed?.summary) {
                            chunk.summary = parsed.summary;
                        }
                    } catch {}

                    try {
                        const combined = this.buildCombinedForEmbedding(chunk);
                        const embedding = await this.embedWithTimeout(combined, 10000);
                        if (embedding) chunk.embedding = embedding;
                    } catch {}
                }

                newChunks.push(...fileChunks);
            } catch (e) {
                console.warn('[Indexer] Incremental index failed for', filePath, e);
            }
        }

        if (newChunks.length === 0) return;

        // Load existing store; if it doesn't exist, do not create here (require full indexing)
        const existing = await this.readVectorStoreOrEmpty(/*allowCreate*/ false);
        if (!existing) return;

        // Remove old chunks for touched files, then append new chunks
        const touchedSet = new Set(uniquePaths.map(p => path.normalize(p)));
        const filtered = existing.filter(c => !touchedSet.has(path.normalize(c.filePath)));
        filtered.push(...newChunks);
        await this.writeVectorStore(filtered);
    }

    /**
     * Incremental: Remove all chunks that belong to the given file from the
     * existing vector store. No-op if the store does not exist.
     */
    public async removeFileFromVectorStore(fsPath: string): Promise<void> {
        const existing = await this.readVectorStoreOrEmpty(/*allowCreate*/ false);
        if (!existing) return;
        const normalized = path.normalize(fsPath);
        const filtered = existing.filter(c => path.normalize(c.filePath) !== normalized);
        await this.writeVectorStore(filtered);
    }

    private async generateContentWithTimeout(prompt: string, timeoutMs: number): Promise<string | null> {
        try {
            const p = this.apiManager.generateContent(prompt);
            const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs));
            const res = await Promise.race([p, timeout]);
            return (typeof res === 'string') ? res : null;
        } catch (e) {
            console.warn('[Indexer] generateContentWithTimeout error:', e);
            return null;
        }
    }

    private async embedWithTimeout(text: string, timeoutMs: number): Promise<number[] | null> {
        try {
            const p = this.apiManager.embedTextIfAvailable(text);
            const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs));
            const res = await Promise.race([p, timeout]);
            return Array.isArray(res) ? res as number[] : null;
        } catch (e) {
            console.warn('[Indexer] embedWithTimeout error:', e);
            return null;
        }
    }

    public async indexWorkspace(progress?: { report: (info: { message?: string; percent?: number }) => void } | vscode.Progress<{ message?: string; increment?: number }>): Promise<IndexResult> {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        const includeGlobs = config.get<string[]>(SETTINGS_KEYS.indexingIncludeGlobs) || ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
        const excludeGlobs = config.get<string[]>(SETTINGS_KEYS.indexingExcludeGlobs) || ['**/node_modules/**', '**/dist/**', '**/out/**'];
        const sourceName = config.get<string>(SETTINGS_KEYS.indexingSourceName) || 'workspace';
        console.log('[Indexer] Başlatılıyor...');
        console.log('[Indexer] Include globs:', JSON.stringify(includeGlobs));
        console.log('[Indexer] Exclude globs:', JSON.stringify(excludeGlobs));
        console.log('[Indexer] Source name:', sourceName);

        // VS Code'un brace pattern davranışına güvenmek yerine her pattern için ayrı arama yap
        const uriMap = new Map<string, vscode.Uri>();
        for (const pattern of includeGlobs) {
            try {
                const found = await vscode.workspace.findFiles(pattern, `{${excludeGlobs.join(',')}}`);
                for (const u of found) uriMap.set(u.fsPath, u);
                console.log(`[Indexer] Pattern: ${pattern} -> ${found.length} dosya`);
            } catch (e) {
                console.warn('[Indexer] Pattern arama hatası:', pattern, e);
            }
        }
        const uris = Array.from(uriMap.values());
        console.log(`[Indexer] Toplam bulunan dosya: ${uris.length}`);
        if (uris.length > 0) {
            console.log('[Indexer] İlk 10 dosya:', uris.slice(0, 10).map(u => u.fsPath));
        }
        const chunks: CodeChunkMetadata[] = [];

        let processed = 0;
        for (const uri of uris) {
            processed++;
            if (progress && (progress as any).report && typeof (progress as any).report === 'function' && !(progress as any).hasOwnProperty('increment')) {
                progress.report({ message: `Dosya: ${path.basename(uri.fsPath)} analiz ediliyor`, percent: Math.min(79, Math.round((processed / uris.length) * 70)) });
            } else {
                ((progress as unknown) as vscode.Progress<{ message?: string; increment?: number }>)?.report({ message: `Analiz ediliyor: ${uri.fsPath}`, increment: (processed / uris.length) * 80 });
            }
            try {
                const fileText = (await vscode.workspace.fs.readFile(uri)).toString();
                const language = this.detectLanguageByExtension(uri.fsPath);
                console.log(`[Indexer] Dosya: ${uri.fsPath} -> dil: ${language || 'tanımsız'}`);
                if (!language) {
                    console.log(`[Indexer] Dil tanınamadı, atlanıyor: ${uri.fsPath}`);
                    continue;
                }
                const fileChunks = this.extractChunksFromSource(fileText, uri.fsPath, language, sourceName);
                if (fileChunks.length === 0) {
                    // Fallback: Dosyanın tamamını tek parça olarak ekle
                    const totalLines = fileText.split(/\r?\n/).length;
                    const fallbackChunk = this.makeChunk(sourceName, uri.fsPath, language as any, 'other', path.basename(uri.fsPath), 1, totalLines, this.simpleDependenciesFromText(fileText), fileText);
                    fileChunks.push(fallbackChunk);
                    console.log(`[Indexer] Fallback chunk eklendi: ${uri.fsPath}`);
                }
                console.log(`[Indexer] Dosya chunk sayısı: ${fileChunks.length}`);
                chunks.push(...fileChunks);
            } catch (e) {
                console.error('Index parse error for', uri.fsPath, e);
            }
        }

        // Opsiyonel: Özet ve embedding üretimi (sadece Gemini destekler)
        let done = 0;
        for (const chunk of chunks) {
            done++;
            if (progress && (progress as any).report && typeof (progress as any).report === 'function' && !(progress as any).hasOwnProperty('increment')) {
                progress.report({ message: `Özet & embedding: ${chunk.name}`, percent: 80 + Math.round((done / Math.max(1, chunks.length)) * 20) });
            } else {
                ((progress as unknown) as vscode.Progress<{ message?: string; increment?: number }>)?.report({ message: `Özet ve embedding: ${chunk.name}`, increment: 80 + (done / chunks.length) * 20 });
            }

            const summaryPrompt = this.buildSummaryPrompt(chunk.content);
            try {
                const idx = done;
                console.log(`[Indexer] (summary) Başlıyor: ${idx}/${chunks.length} -> ${chunk.filePath} :: ${chunk.name}`);
                const start = Date.now();
                const summaryText = await this.generateContentWithTimeout(summaryPrompt, 10000);
                const elapsed = Date.now() - start;
                if (!summaryText) {
                    console.warn(`[Indexer] (summary) Zaman aşımı veya boş yanıt: ${chunk.filePath} :: ${chunk.name} (elapsed ${elapsed}ms)`);
                } else {
                    const parsed = this.tryParseSummaryJson(summaryText);
                    if (parsed?.summary) {
                        chunk.summary = parsed.summary;
                        console.log(`[Indexer] Özet üretildi: ${chunk.name} -> ${chunk.summary.slice(0, 80)}... (elapsed ${elapsed}ms)`);
                    } else {
                        console.warn(`[Indexer] (summary) Geçersiz JSON çıktı: ${chunk.filePath} :: ${chunk.name}`);
                    }
                }
            } catch (e) {
                console.warn('[Indexer] Summary generation failed for', chunk.name, e);
            }

            try {
                const combined = this.buildCombinedForEmbedding(chunk);
                const startE = Date.now();
                const embedding = await this.embedWithTimeout(combined, 10000);
                const elapsedE = Date.now() - startE;
                if (!embedding) {
                    console.warn(`[Indexer] (embed) Zaman aşımı veya hata: ${chunk.filePath} :: ${chunk.name} (elapsed ${elapsedE}ms)`);
                } else {
                    chunk.embedding = embedding;
                    console.log(`[Indexer] Embedding üretildi: ${chunk.name} -> boyut ${embedding.length} (elapsed ${elapsedE}ms)`);
                }
            } catch (e) {
                console.warn('Embedding generation failed for', chunk.name, e);
            }
        }

        await this.writeToLocalVectorStore(chunks);
        console.log(`[Indexer] Yazma tamamlandı. Chunk sayısı: ${chunks.length}`);
        return { chunks };
    }

    private detectLanguageByExtension(fsPath: string): string | null {
        const ext = path.extname(fsPath).toLowerCase();
        if (ext === '.ts' || ext === '.tsx') return 'typescript';
        if (ext === '.js' || ext === '.jsx') return 'javascript';
        if (ext === '.py') return 'python';
        if (ext === '.css') return 'css';
        if (ext === '.json') return 'json';
        if (ext === '.c++') return 'cpp';
        if (['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx', '.h', '.c'].includes(ext)) return 'cpp';
        return null;
    }

    private extractChunksFromSource(source: string, filePath: string, language: string, sourceName: string): CodeChunkMetadata[] {
        if (language === 'javascript' || language === 'typescript') {
            return this.extractChunksFromTsJs(source, filePath, language, sourceName);
        }
        if (language === 'python') {
            return this.extractChunksFromPython(source, filePath, sourceName);
        }
        if (language === 'cpp') {
            return this.extractChunksFromCpp(source, filePath, sourceName);
        }
        if (language === 'json') {
            return this.extractChunksFromJson(source, filePath, sourceName);
        }
        if (language === 'css') {
            return this.extractChunksFromCss(source, filePath, sourceName);
        }
        return [];
    }

    private extractChunksFromTsJs(source: string, filePath: string, language: string, sourceName: string): CodeChunkMetadata[] {
        const isTS = language === 'typescript';
        let ast: t.File;
        try {
            ast = parse(source, {
                sourceType: 'unambiguous',
                allowReturnOutsideFunction: true,
                plugins: [isTS ? 'typescript' : undefined, 'jsx'].filter(Boolean) as any
            });
        } catch (e) {
            console.warn('[Indexer] Babel parse başarısız, dosya atlanıyor:', filePath, e);
            return [];
        }

        const chunks: CodeChunkMetadata[] = [];

        traverse(ast, {
            FunctionDeclaration: (p: NodePath<t.FunctionDeclaration>) => {
                const node = p.node;
                const name = node.id?.name || 'anonymous_function';
                const content = this.generateCode(node, source);
                const [startLine, endLine] = this.getNodeLines(node, source);
                const dependencies = this.simpleDependenciesFromText(content);
                chunks.push(this.makeChunk(sourceName, filePath, language, 'function', name, startLine, endLine, dependencies, content));
            },
            ClassDeclaration: (p: NodePath<t.ClassDeclaration>) => {
                const node = p.node;
                const name = (node.id && node.id.name) || 'anonymous_class';
                const content = this.generateCode(node, source);
                const [startLine, endLine] = this.getNodeLines(node, source);
                const dependencies = this.simpleDependenciesFromText(content);
                chunks.push(this.makeChunk(sourceName, filePath, language, 'class', name, startLine, endLine, dependencies, content));
            },
            ClassMethod: (p: NodePath<t.ClassMethod>) => {
                const node = p.node;
                const className = t.isClassDeclaration(p.parentPath?.node) && (p.parentPath?.node as t.ClassDeclaration).id?.name;
                const name = `${className || 'class'}.${(node.key as any)?.name || 'method'}`;
                const content = this.generateCode(node, source);
                const [startLine, endLine] = this.getNodeLines(node, source);
                const dependencies = this.simpleDependenciesFromText(content);
                chunks.push(this.makeChunk(sourceName, filePath, language, 'method', name, startLine, endLine, dependencies, content));
            },
            TSInterfaceDeclaration: (p: NodePath<t.TSInterfaceDeclaration>) => {
                const node = p.node as t.TSInterfaceDeclaration;
                const name = node.id?.name || 'interface';
                const content = this.generateCode(node, source);
                const [startLine, endLine] = this.getNodeLines(node, source);
                const dependencies: string[] = [];
                chunks.push(this.makeChunk(sourceName, filePath, language, 'interface', name, startLine, endLine, dependencies, content));
            },
            ImportDeclaration: (p: NodePath<t.ImportDeclaration>) => {
                const node = p.node;
                const name = (node.source && (node.source as any).value) || 'import';
                const content = this.generateCode(node, source);
                const [startLine, endLine] = this.getNodeLines(node, source);
                const dependencies: string[] = [];
                chunks.push(this.makeChunk(sourceName, filePath, language, 'import', String(name), startLine, endLine, dependencies, content));
            },
            VariableDeclaration: (p: NodePath<t.VariableDeclaration>) => {
                const node = p.node;
                const declNames = node.declarations.map((d: t.VariableDeclarator) => this.extractIdentifierName(d.id)).filter(Boolean) as string[];
                const name = declNames.join(', ') || 'variable';
                const content = this.generateCode(node, source);
                const [startLine, endLine] = this.getNodeLines(node, source);
                const dependencies = this.simpleDependenciesFromText(content);
                chunks.push(this.makeChunk(sourceName, filePath, language, 'variable', name, startLine, endLine, dependencies, content));
            }
        });

        return chunks;
    }

    private extractChunksFromPython(source: string, filePath: string, sourceName: string): CodeChunkMetadata[] {
        const chunks: CodeChunkMetadata[] = [];
        const lines = source.split(/\r?\n/);
        const functionRegex = /^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:\s*$/;
        const classRegex = /^\s*class\s+([A-Za-z_]\w*)(?:\s*\([^)]*\))?\s*:\s*$/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let match = line.match(functionRegex);
            if (match) {
                const name = match[1];
                const startLine = i + 1;
                const endLine = this.findPythonBlockEnd(lines, i);
                const content = this.sliceLines(source, startLine, endLine);
                chunks.push(this.makeChunk(sourceName, filePath, 'python', 'function', name, startLine, endLine, this.simpleDependenciesFromText(content), content));
                i = endLine - 1;
                continue;
            }
            match = line.match(classRegex);
            if (match) {
                const name = match[1];
                const startLine = i + 1;
                const endLine = this.findPythonBlockEnd(lines, i);
                const content = this.sliceLines(source, startLine, endLine);
                chunks.push(this.makeChunk(sourceName, filePath, 'python', 'class', name, startLine, endLine, this.simpleDependenciesFromText(content), content));
                i = endLine - 1;
                continue;
            }
        }
        return chunks;
    }

    private findPythonBlockEnd(lines: string[], headerIndex: number): number {
        const headerIndent = this.leadingSpaces(lines[headerIndex]);
        for (let i = headerIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            const indent = this.leadingSpaces(line);
            if (indent <= headerIndent) {
                return i; // previous line is end
            }
        }
        return lines.length; // till end
    }

    private leadingSpaces(line: string): number {
        const m = line.match(/^\s*/);
        return m ? m[0].length : 0;
    }

    private extractChunksFromCpp(source: string, filePath: string, sourceName: string): CodeChunkMetadata[] {
        const chunks: CodeChunkMetadata[] = [];
        const lines = source.split(/\r?\n/);
        // Class declarations
        const classRegex = /^\s*class\s+([A-Za-z_]\w*)\b[^{]*\{/;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const m = line.match(classRegex);
            if (m) {
                const name = m[1];
                const startLine = i + 1;
                const endLine = this.findBraceBlockEnd(lines, i);
                const content = this.sliceLines(source, startLine, endLine);
                chunks.push(this.makeChunk(sourceName, filePath, 'cpp', 'class', name, startLine, endLine, this.simpleDependenciesFromText(content), content));
                i = endLine - 1;
            }
        }
        // Function definitions (best-effort)
        const funcRegex = /^\s*[\w:\*&<>~\s]+\s+[A-Za-z_]\w*\s*\([^;{]*\)\s*(const\s*)?\s*\{/;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (funcRegex.test(line)) {
                const nameMatch = line.match(/([A-Za-z_]\w*)\s*\([^)]*\)\s*(const\s*)?\{/);
                const name = nameMatch ? nameMatch[1] : 'function';
                const startLine = i + 1;
                const endLine = this.findBraceBlockEnd(lines, i);
                const content = this.sliceLines(source, startLine, endLine);
                chunks.push(this.makeChunk(sourceName, filePath, 'cpp', 'function', name, startLine, endLine, this.simpleDependenciesFromText(content), content));
                i = endLine - 1;
            }
        }
        return chunks;
    }

    private findBraceBlockEnd(lines: string[], startIndex: number): number {
        // Find first '{' from startIndex line onward, then match braces
        let open = 0;
        let started = false;
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];
            for (let j = 0; j < line.length; j++) {
                const ch = line[j];
                if (ch === '{') { open++; started = true; }
                if (ch === '}') { open--; }
            }
            if (started && open === 0) {
                return i + 1; // end line is inclusive, return next index as exclusive
            }
        }
        return lines.length;
    }

    private extractChunksFromJson(source: string, filePath: string, sourceName: string): CodeChunkMetadata[] {
        const chunks: CodeChunkMetadata[] = [];
        try {
            const data = JSON.parse(source);
            const recurse = (value: any, pathParts: string[]) => {
                if (value && typeof value === 'object') {
                    if (Array.isArray(value)) {
                        value.forEach((item, idx) => recurse(item, [...pathParts, String(idx)]));
                    } else {
                        Object.keys(value).forEach(key => recurse(value[key], [...pathParts, key]));
                    }
                } else {
                    const name = pathParts.join('.') || 'root';
                    const content = JSON.stringify(value, null, 2);
                    const startLine = 1;
                    const endLine = content.split(/\r?\n/).length;
                    chunks.push(this.makeChunk(sourceName, filePath, 'json', 'json_property', name, startLine, endLine, [], content));
                }
            };
            recurse(data, []);
        } catch (e) {
            console.warn('JSON parse failed for', filePath, e);
        }
        return chunks;
    }

    private extractChunksFromCss(source: string, filePath: string, sourceName: string): CodeChunkMetadata[] {
        const chunks: CodeChunkMetadata[] = [];
        let cssAst: any;
        try {
            // Lazy import to avoid type hassles
            const cssParser = require('css');
            cssAst = cssParser.parse(source, { source: filePath });
        } catch (e) {
            console.warn('CSS parse failed for', filePath, e);
            return chunks;
        }
        const rules: any[] = cssAst?.stylesheet?.rules || [];
        for (const rule of rules) {
            if (rule.type === 'rule') {
                const selectors: string[] = rule.selectors || ['rule'];
                const name = selectors.join(', ');
                const startLine: number = rule.position?.start?.line || 1;
                const endLine: number = rule.position?.end?.line || startLine;
                const content = this.sliceLines(source, startLine, endLine);
                chunks.push(this.makeChunk(sourceName, filePath, 'css', 'css_rule', name, startLine, endLine, [], content));
            }
        }
        return chunks;
    }

    private sliceLines(source: string, startLine: number, endLine: number): string {
        const lines = source.split(/\r?\n/);
        return lines.slice(startLine - 1, endLine).join('\n');
    }

    private simpleDependenciesFromText(text: string): string[] {
        const names = new Set<string>();
        const callRegex = /\b([A-Za-z_]\w*)\s*\(/g;
        let m: RegExpExecArray | null;
        while ((m = callRegex.exec(text))) {
            names.add(m[1]);
            if (names.size > 50) break;
        }
        return Array.from(names);
    }

    private extractIdentifierName(id: t.LVal | any): string | null {
        if (t.isIdentifier(id)) return id.name;
        if (t.isObjectPattern(id) || t.isArrayPattern(id)) return 'destructured';
        return null;
    }

    private generateCode(node: t.Node, source: string): string {
        try {
            const { code } = generate(node, { retainLines: true }, source);
            return code;
        } catch {
            return source.slice(node.start ?? 0, node.end ?? 0);
        }
    }

    private getNodeLines(node: t.Node, source: string): [number, number] {
        const start = node.start ?? 0;
        const end = node.end ?? 0;
        const startLine = this.offsetToLine(source, start);
        const endLine = this.offsetToLine(source, end);
        return [startLine, endLine];
    }

    private offsetToLine(source: string, offset: number): number {
        let line = 1;
        for (let i = 0; i < offset && i < source.length; i++) {
            if (source.charCodeAt(i) === 10) line++;
        }
        return line;
    }

    // collectDependencies kaldırıldı; TS/JS için de basit metin tabanlı bağımlılık çıkarımı kullanıyoruz.

    private makeChunk(source: string, filePath: string, language: string, contentType: CodeChunkMetadata['contentType'], name: string, startLine: number, endLine: number, dependencies: string[], content: string): CodeChunkMetadata {
        return {
            id: generateUuid(),
            source,
            filePath,
            language,
            contentType,
            name,
            startLine,
            endLine,
            dependencies,
            content
        };
    }

    private buildSummaryPrompt(code: string): string {
        return `# ROLE\nYou are an expert software developer and technical writer, specializing in creating concise and clear code documentation. Your primary language is English.\n\n# TASK\nYour task is to analyze the provided code snippet and generate a single, descriptive sentence in English that explains its core purpose and functionality. This summary will be used as metadata for a semantic search system, so it should be clear, concise, and capture the main intent of the code.\n\n# CONTEXT\nThe code snippet is a part of a larger codebase. The summary you generate will be embedded along with the code to help an AI agent find the most relevant code snippet to fulfill a user's request. Focus on *what* the code does, not *how* it does it. For example, instead of "loops through an array and checks a condition", say "Filters users based on their active status".\n\n# INPUT CODE SNIPPET\n${code}\n\n# OUTPUT FORMAT\nStrictly respond with a JSON object containing a single key "summary". Do not add any other text, explanations, or markdown formatting.`;
    }

    private tryParseSummaryJson(text: string): { summary?: string } | null {
        try {
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            const json = start !== -1 && end !== -1 ? text.slice(start, end + 1) : text;
            return JSON.parse(json);
        } catch {
            return null;
        }
    }

    private buildCombinedForEmbedding(chunk: CodeChunkMetadata): string {
        const namePart = `Fonksiyon adı: ${chunk.name}.`;
        const summaryPart = ` Ne yapar: ${chunk.summary || ''}.`;
        const codePart = ` Kod: \n${chunk.content}`;
        return `${namePart}${summaryPart}${codePart}`.trim();
    }

    private async writeToLocalVectorStore(chunks: CodeChunkMetadata[]): Promise<void> {
        // Workspace-specific vector store path
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('Aktif workspace bulunamadı');
        }

        // Workspace root'ta .ivme klasörü oluştur
        const ivmeDir = vscode.Uri.joinPath(workspaceFolder.uri, '.ivme');
        const storageUri = vscode.Uri.joinPath(ivmeDir, 'vector_store.json');

        try {
            await vscode.workspace.fs.createDirectory(ivmeDir);
        } catch {}

        const contentBytes = Buffer.from(JSON.stringify({ chunks }, null, 2), 'utf8');
        await vscode.workspace.fs.writeFile(storageUri, contentBytes);
        
        console.log(`[Indexer] Vector store kaydedildi: ${storageUri.fsPath}`);
        
        // İndeksleme tamamlandığında ayarı aktif et
        await this.setIndexingEnabled(true);
    }

    /**
     * Read vector_store.json and return chunks. If allowCreate is false and the
     * file does not exist, return null to signal that the store is missing.
     */
    private async readVectorStoreOrEmpty(allowCreate = false): Promise<CodeChunkMetadata[] | null> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return allowCreate ? [] : null;

        const ivmeDir = vscode.Uri.joinPath(workspaceFolder.uri, '.ivme');
        const storageUri = vscode.Uri.joinPath(ivmeDir, 'vector_store.json');
        try {
            const buf = await vscode.workspace.fs.readFile(storageUri);
            const json = JSON.parse(Buffer.from(buf).toString('utf8'));
            const chunks: CodeChunkMetadata[] = json?.chunks || [];
            return chunks;
        } catch (e) {
            if (allowCreate) return [];
            return null;
        }
    }

    /**
     * Write chunks to vector_store.json without changing the indexing-enabled setting.
     */
    private async writeVectorStore(chunks: CodeChunkMetadata[]): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('Aktif workspace bulunamadı');
        }

        const ivmeDir = vscode.Uri.joinPath(workspaceFolder.uri, '.ivme');
        const storageUri = vscode.Uri.joinPath(ivmeDir, 'vector_store.json');

        try {
            await vscode.workspace.fs.createDirectory(ivmeDir);
        } catch {}

        const contentBytes = Buffer.from(JSON.stringify({ chunks }, null, 2), 'utf8');
        await vscode.workspace.fs.writeFile(storageUri, contentBytes);
        console.log(`[Indexer] Vector store güncellendi (incremental): ${storageUri.fsPath} -> ${chunks.length} parçacık`);
    }
    public async setIndexingEnabled(enabled: boolean): Promise<void> {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        await config.update(SETTINGS_KEYS.indexingEnabled, enabled, vscode.ConfigurationTarget.Workspace);
    }

    public async getIndexingEnabled(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        return config.get<boolean>(SETTINGS_KEYS.indexingEnabled, RETRIEVAL_DEFAULTS.INDEXING_ENABLED_DEFAULT);
    }
}


