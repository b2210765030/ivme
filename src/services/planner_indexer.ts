/* ============================================================================
   PLANNER INDEXER
   - Kaynak dosyaları ve dizinleri hiyerarşik olarak özetler
   - Amaç: Planner/Architect ajanına proje mimarisinin üst düzey haritasını sunmak
   - Çıktı: .ivme/planner_index.json (key-value: path -> summary)
   ============================================================================ */

import * as vscode from 'vscode';
import * as path from 'path';

import { ApiServiceManager } from './manager';
import { EXTENSION_ID, SETTINGS_KEYS } from '../core/constants';

type PlannerIndex = Record<string, string>;

export class PlannerIndexer {
    constructor(
        private readonly apiManager: ApiServiceManager,
        private readonly context: vscode.ExtensionContext
    ) {}

    public async buildPlannerIndex(progress?: { report: (info: { message?: string; percent?: number }) => void }): Promise<PlannerIndex> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('Aktif workspace bulunamadı.');
        }

        // Kullanıcı görsün ve özelleştirebilsin diye .ivme/.indexignore dosyasını otomatik oluştur
        await this.ensureIndexIgnoreExists();

        const includeGlobs = this.getIncludeGlobs();
        const excludeGlobs = await this.getExcludeGlobs();

        // 1) Dosyaları topla
        const fileUris = await this.findFiles(includeGlobs, excludeGlobs);

        // 2) Dosya özetleri
        progress?.report({ message: 'Planner: Dosya özetleri üretiliyor...', percent: 95 });
        const fileSummaries = await this.summarizeFiles(fileUris, (done, total) => {
            const pct = 95 + Math.min(4, Math.floor((done / Math.max(1, total)) * 4));
            progress?.report({ message: 'Planner: Dosya özetleri üretiliyor...', percent: pct });
        });

        // 3) Dizin özetleri (derinden yüzeye)
        progress?.report({ message: 'Planner: Dizin özetleri üretiliyor...', percent: 99 });
        const dirSummaries = await this.summarizeDirectories(workspaceFolder.uri.fsPath, fileSummaries, (done, total) => {
            const pct = 99; // İnce ayar: %99 civarında tut, son adımda %100
            progress?.report({ message: `Planner: Dizin özetleri (${done}/${total})`, percent: pct });
        });

        // 4) Proje geneli özeti (kök dizin)
        const rootSummary = await this.summarizeRoot(workspaceFolder.uri.fsPath, fileSummaries, dirSummaries);

        // 5) Kayıt
        const index: PlannerIndex = { ...fileSummaries, ...dirSummaries };
        index[workspaceFolder.uri.fsPath] = rootSummary;
        await this.writePlannerIndex(index);
        progress?.report({ message: 'Planner: Mimari harita kaydedildi.', percent: 100 });

        return index;
    }

    public async ensureIndexIgnoreExists(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;
        const ivmeDir = vscode.Uri.joinPath(workspaceFolder.uri, '.ivme');
        const ignoreFile = vscode.Uri.joinPath(ivmeDir, '.indexignore');
        try { await vscode.workspace.fs.createDirectory(ivmeDir); } catch {}
        try {
            await vscode.workspace.fs.stat(ignoreFile);
            // Zaten var, bir şey yapma
            return;
        } catch {}

        const content = this.buildIndexIgnoreTemplate();
        await vscode.workspace.fs.writeFile(ignoreFile, Buffer.from(content, 'utf8'));

        // Kullanıcıya bilgi ver (non-blocking) ve isterse aç
        try {
            void vscode.window
                .showInformationMessage('İndeksleme için .ivme/.indexignore oluşturuldu. Düzenlemek ister misiniz?', 'Aç', 'Kapat')
                .then(async (picked) => {
                    try {
                        if (picked === 'Aç') {
                            const doc = await vscode.workspace.openTextDocument(ignoreFile);
                            await vscode.window.showTextDocument(doc, { preview: false });
                        }
                    } catch {}
                });
        } catch {}
    }

    private buildIndexIgnoreTemplate(): string {
        return [
            '# İvme .indexignore',
            '# Bu dosyadaki glob desenleri indeksleme sırasında hariç tutulur.',
            '# Satır başına bir desen yazın. Yorum satırları # veya // ile başlayabilir.',
            '',
            '# Varsayılanlar:',
            '**/node_modules/**',
            '**/dist/**',
            '**/out/**',
            '**/.git/**',
            '**/.vscode/**',
            '**/.ivme/**',
            '',
            '# Örnekler:',
            '# coverage',
            '# **/*.log',
            '# **/*.min.js',
            ''
        ].join('\n');
    }

    private getIncludeGlobs(): string[] {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        const fromSettings = config.get<string[]>(SETTINGS_KEYS.indexingIncludeGlobs);
        if (fromSettings && fromSettings.length > 0) return fromSettings;
        // Planner için varsayılanlar (kaynak ve bazı config dosyaları)
        return [
            '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
            '**/*.py', '**/*.java', '**/*.go', '**/*.cs', '**/*.cpp', '**/*.c', '**/*.hpp', '**/*.h',
            '**/*.json', '**/*.md', '**/*.yml', '**/*.yaml'
        ];
    }

    private async getExcludeGlobs(): Promise<string[]> {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        const fromSettings = config.get<string[]>(SETTINGS_KEYS.indexingExcludeGlobs);
        const base = fromSettings && fromSettings.length > 0 ? fromSettings.slice() : ['**/node_modules/**', '**/dist/**', '**/out/**', '**/.vscode/**'];
        if (!base.some(p => p.includes('.git'))) base.push('**/.git/**');
        if (!base.some(p => p.includes('.ivme'))) base.push('**/.ivme/**');
        // .indexignore desteği
        try {
            const extra = await this.readIndexIgnorePatterns();
            for (const pat of extra) {
                if (!base.includes(pat)) base.push(pat);
            }
        } catch {}
        return base;
    }

    private async readIndexIgnorePatterns(): Promise<string[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return [];
        const ivmeIgnore = vscode.Uri.joinPath(workspaceFolder.uri, '.ivme', '.indexignore');
        const rootIgnore = vscode.Uri.joinPath(workspaceFolder.uri, '.indexignore');
        try {
            // Öncelik: .ivme/.indexignore, yoksa kökteki .indexignore
            let buf: Uint8Array | undefined;
            try {
                buf = await vscode.workspace.fs.readFile(ivmeIgnore);
            } catch {
                buf = await vscode.workspace.fs.readFile(rootIgnore);
            }
            if (!buf) return [];
            const text = Buffer.from(buf).toString('utf8');
            return text
                .split(/\r?\n/)
                .map(l => l.trim())
                .filter(l => l && !l.startsWith('#') && !l.startsWith('//'))
                .map(l => {
                    // Basit dizin adı verilirse **/dir/** şekline dönüştür
                    if (l.endsWith('/**') || l.includes('*')) return l;
                    if (l.endsWith('/')) return `**/${l}**`;
                    return `**/${l}/**`;
                });
        } catch {
            return [];
        }
    }

    private async findFiles(includeGlobs: string[], excludeGlobs: string[]): Promise<vscode.Uri[]> {
        const map = new Map<string, vscode.Uri>();
        for (const pattern of includeGlobs) {
            try {
                const uris = await vscode.workspace.findFiles(pattern, `{${excludeGlobs.join(',')}}`);
                for (const u of uris) map.set(u.fsPath, u);
            } catch (e) {
                console.warn('[PlannerIndexer] Pattern arama hatası:', pattern, e);
            }
        }
        return Array.from(map.values());
    }

    private async summarizeFiles(files: vscode.Uri[], onProgress?: (done: number, total: number) => void): Promise<Record<string, string>> {
        const summaries: Record<string, string> = {};
        let done = 0;

        const concurrency = 4;
        const queue = files.slice();

        const workers: Promise<void>[] = [];
        for (let i = 0; i < concurrency; i++) {
            workers.push((async () => {
                while (queue.length > 0) {
                    const uri = queue.shift();
                    if (!uri) break;
                    try {
                        const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
                        const prompt = this.buildFileSummaryPrompt(uri.fsPath, content);
                        const raw = await this.generateContentWithTimeout(prompt, 15000);
                        if (!raw) {
                            console.warn('[PlannerIndexer] Dosya özeti zaman aşımına uğradı veya boş döndü:', uri.fsPath);
                        } else {
                            const parsed = this.tryParseSummaryJson(raw);
                            if (parsed?.summary) {
                                summaries[uri.fsPath] = parsed.summary;
                            }
                        }
                    } catch (e) {
                        console.warn('[PlannerIndexer] Dosya özeti hata:', uri.fsPath, e);
                    } finally {
                        done++;
                        onProgress?.(done, files.length);
                    }
                }
            })());
        }

        await Promise.all(workers);
        return summaries;
    }

    private async summarizeDirectories(rootPath: string, fileSummaries: Record<string, string>, onProgress?: (done: number, total: number) => void): Promise<Record<string, string>> {
        // Tüm dizinleri çıkar
        const dirs = new Set<string>();
        for (const filePath of Object.keys(fileSummaries)) {
            let dir = path.dirname(filePath);
            while (dir.startsWith(rootPath)) {
                dirs.add(dir);
                const parent = path.dirname(dir);
                if (parent === dir) break;
                dir = parent;
            }
        }
        // Kök dahil, derinlikçe sırala (derinden sığa)
        const dirList = Array.from(dirs.values()).sort((a, b) => this.depth(b) - this.depth(a));

        const dirSummaryMap: Record<string, string> = {};

        let done = 0;
        const total = dirList.length;

        for (const dirPath of dirList) {
            try {
                const items = this.collectImmediateChildrenSummaries(dirPath, fileSummaries, dirSummaryMap);
                if (items.length === 0) {
                    done++;
                    onProgress?.(done, total);
                    continue;
                }
                const prompt = this.buildDirectorySummaryPrompt(dirPath, items.join('\n'));
                const raw = await this.generateContentWithTimeout(prompt, 15000);
                if (!raw) {
                    console.warn('[PlannerIndexer] Dizin özeti zaman aşımına uğradı veya boş döndü:', dirPath);
                } else {
                    const parsed = this.tryParseSummaryJson(raw);
                    if (parsed?.summary) {
                        dirSummaryMap[dirPath] = parsed.summary;
                    }
                }
            } catch (e) {
                console.warn('[PlannerIndexer] Dizin özeti hata:', dirPath, e);
            } finally {
                done++;
                onProgress?.(done, total);
            }
        }

        return dirSummaryMap;
    }

    private collectImmediateChildrenSummaries(dirPath: string, fileSummaries: Record<string, string>, dirSummaryMap: Record<string, string>): string[] {
        const entries: string[] = [];
        // Dosyalar (aynı dizinde olanlar)
        for (const [filePath, summary] of Object.entries(fileSummaries)) {
            if (path.dirname(filePath) === dirPath) {
                entries.push(`- file ${path.basename(filePath)}: ${summary}`);
            }
        }
        // Alt dizinler (bir seviye alt)
        const childrenDirs = new Set<string>();
        for (const p of [...Object.keys(fileSummaries), ...Object.keys(dirSummaryMap)]) {
            const parent = path.dirname(p);
            if (parent === dirPath) {
                const name = path.basename(p);
                const full = path.join(dirPath, name);
                const statIsDir = this.looksLikeDir(full, fileSummaries);
                if (statIsDir) childrenDirs.add(full);
            }
        }
        for (const subDir of Array.from(childrenDirs.values())) {
            const sum = dirSummaryMap[subDir];
            if (sum) entries.push(`- dir ${path.basename(subDir)}: ${sum}`);
        }
        return entries;
    }

    private looksLikeDir(candidate: string, fileSummaries: Record<string, string>): boolean {
        // Eğer altında dosya varsa dizindir varsayımı
        for (const filePath of Object.keys(fileSummaries)) {
            if (path.dirname(filePath) === candidate) return true;
            if (path.dirname(path.dirname(filePath)) === candidate) return true;
        }
        return false;
    }

    private async summarizeRoot(rootPath: string, fileSummaries: Record<string, string>, dirSummaries: Record<string, string>): Promise<string> {
        // Kökün doğrudan çocuklarını listele
        const contents: string[] = [];
        for (const [filePath, summary] of Object.entries(fileSummaries)) {
            if (path.dirname(filePath) === rootPath) {
                contents.push(`- file ${path.basename(filePath)}: ${summary}`);
            }
        }
        const childDirs = new Set<string>();
        const allDirs = new Set<string>(Object.keys(dirSummaries));
        for (const d of allDirs) {
            if (path.dirname(d) === rootPath) childDirs.add(d);
        }
        for (const d of Array.from(childDirs.values())) {
            const s = dirSummaries[d];
            if (s) contents.push(`- dir ${path.basename(d)}: ${s}`);
        }

        const prompt = this.buildDirectorySummaryPrompt(rootPath, contents.join('\n'));
        try {
            const raw = await this.generateContentWithTimeout(prompt, 20000);
            const parsed = raw ? this.tryParseSummaryJson(raw) : null;
            return parsed?.summary || 'A high-level summary describing the overall purpose of the project.';
        } catch (e) {
            console.warn('[PlannerIndexer] Kök özeti üretilemedi:', e);
            return 'A high-level summary describing the overall purpose of the project.';
        }
    }

    private async writePlannerIndex(index: PlannerIndex): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) throw new Error('Aktif workspace bulunamadı.');

        const dir = vscode.Uri.joinPath(workspaceFolder.uri, '.ivme');
        const file = vscode.Uri.joinPath(dir, 'planner_index.json');
        try { await vscode.workspace.fs.createDirectory(dir); } catch {}
        const content = Buffer.from(JSON.stringify(index, null, 2), 'utf8');
        await vscode.workspace.fs.writeFile(file, content);
    }

    private buildFileSummaryPrompt(filePath: string, fileContent: string): string {
        return (
            `# ROLE\n` +
            `You are an expert code analyst. Your task is to read a source code file and generate a single, concise sentence in English that describes its primary purpose and responsibility. Focus on WHAT the file does, not HOW it does it. This summary will be used by an AI architect to understand the project structure.\n\n` +
            `# CONTEXT\n` +
            `- File Path: \`${filePath}\`\n\n` +
            `# FILE CONTENT\n` +
            `---\n` +
            `${fileContent}\n` +
            `---\n\n` +
            `# TASK\n` +
            `Generate a one-sentence summary of the file's purpose in English.\n\n` +
            `# OUTPUT FORMAT (JSON ONLY)\n` +
            `{\n  "summary": "<your_one_sentence_summary_here>"\n}`
        );
    }

    private buildDirectorySummaryPrompt(directoryPath: string, contentsSummaries: string): string {
        return (
            `# ROLE\n` +
            `You are a software architect. Below are the summaries of files and sub-folders inside the \`${directoryPath}\` directory. Your task is to create a single, high-level sentence that describes the overall purpose of this directory.\n\n` +
            `# CONTENTS\n` +
            `${contentsSummaries}\n\n` +
            `# TASK\n` +
            `Generate a one-sentence summary of the directory's purpose.\n\n` +
            `# OUTPUT (JSON ONLY)\n` +
            `{ "summary": "<your_one_sentence_summary_here>" }`
        );
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

    private depth(p: string): number {
        return p.split(/\\|\//).filter(Boolean).length;
    }

    private async generateContentWithTimeout(prompt: string, timeoutMs: number): Promise<string | null> {
        try {
            const p = this.apiManager.generateContent(prompt);
            const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs));
            const res = await Promise.race([p, timeout]);
            return (typeof res === 'string') ? res : null;
        } catch (e) {
            console.warn('[PlannerIndexer] generateContentWithTimeout error:', e);
            return null;
        }
    }
}


