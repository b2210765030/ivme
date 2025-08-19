/* ==========================================================================
   DOSYA: src/services/executor.ts

   AMAÇ:
   - Planner planındaki tekil adımları (tool tabanlı) uygular
   - Kod üretimini sadece uygulama anında LLM ile yapar (planner çıktılarına asla kod yok)
   ========================================================================== */

import * as vscode from 'vscode';
import * as path from 'path';
import { ApiServiceManager } from './manager';
import { PlannerPlan, PlannerPlanStep } from './planner';
import { cleanLLMCodeBlock } from '../core/utils';
import { retrieve_initial_candidates, rerank_results, expand_context } from './retrieval';

type RetrievedChunk = { filePath: string; content: string; id?: string; name?: string; startLine?: number; endLine?: number; score?: number; rerank_score?: number };
type SavedLocation = { path: string; start: number; end: number; startLine: number; endLine: number };

const DEFAULT_RERANK_THRESHOLD = 0.7; // düşük ama tamamen alakasızları elemek için

export class PlannerExecutor {
    private lastRetrieved: RetrievedChunk[] = [];
    private lastLocations: Record<string, SavedLocation> = {};

    public async executeStep(
        context: vscode.ExtensionContext,
        api: ApiServiceManager,
        plan: PlannerPlan,
        stepIndex: number
    ): Promise<string> {
        const step = plan.steps?.[stepIndex];
        if (!step) {
            throw new Error(`Geçersiz adım index: ${stepIndex}`);
        }
        const tool = (step.tool || (Array.isArray(step.tool_calls) && step.tool_calls[0]?.tool)) as string | undefined;
        const args = step.args || (Array.isArray(step.tool_calls) ? step.tool_calls[0]?.args : undefined) || {};

        switch (tool) {
            case 'check_index':
                return await this.handleCheckIndex(context, api, args, step);
            case 'search':
                return await this.handleSearch(context, api, args, step);
            case 'locate_code':
                return await this.handleLocateCode(context, api, args, step);
            case 'retrieve_chunks':
                return await this.handleRetrieve(context, api, args, step);
            // open_file kaldırıldı
            case 'create_file':
                return await this.handleCreateFile(args, step);
            case 'edit_file':
                return await this.handleEditFile(context, api, args, step);
            case 'append_file':
                return await this.handleAppendFile(context, api, args, step);
            default:
                // Check if it's a custom tool
                if (tool) {
                    return await this.handleCustomTool(context, tool, args, step);
                }
                // Araç belirtilmemişse sadece bilgi mesajı
                return `Araç belirtilmedi veya desteklenmiyor: ${tool || 'yok'} — Adım: ${step.ui_text || step.action}`;
        }
    }

    private async handleCustomTool(
        context: vscode.ExtensionContext,
        toolName: string,
        args: any,
        step: PlannerPlanStep
    ): Promise<string> {
        try {
            // Load tools manager
            const { getToolsManager } = await import('./tools_manager.js');
            const toolsManager = getToolsManager();
            
            // Check if custom tool exists
            if (!toolsManager.hasCustomTool(toolName)) {
                return `Hata: '${toolName}' adlı özel araç bulunamadı`;
            }

            // Execute custom tool
            const result = await toolsManager.executeCustomTool(toolName, args);
            return result;

        } catch (error) {
            console.error(`Error executing custom tool ${toolName}:`, error);
            return `Hata: '${toolName}' aracı çalıştırılırken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`;
        }
    }

    private async handleRetrieve(
        context: vscode.ExtensionContext,
        api: ApiServiceManager,
        args: any,
        step: PlannerPlanStep
    ): Promise<string> {
        const query = String(args?.query || step.action || step.thought || '').trim();
        const topK = Number(args?.top_k || 8);
        if (!query) {
            return 'retrieve_chunks: Sorgu boş.';
        }

        const initial = await retrieve_initial_candidates(context, api, query, topK);
        const reranked = await rerank_results(query, initial);
        const expanded = await expand_context(context, reranked.slice(0, Math.max(1, Math.min(10, topK))));

        const scoreById = new Map(reranked.map(r => [r.id, r.rerank_score ?? r.score ?? 0] as const));
        this.lastRetrieved = expanded.slice(0, 10).map(c => ({
            id: (c as any).id,
            name: c.name,
            filePath: c.filePath,
            content: c.content,
            startLine: (c as any).startLine,
            endLine: (c as any).endLine,
            score: (c as any).score,
            rerank_score: scoreById.get((c as any).id)
        }));

        const summary = this.bestMatchesSummary();
        return `retrieve_chunks tamamlandı. Eşleşen örnek dosyalar:\n${summary}`;
    }

    private async handleSearch(
        context: vscode.ExtensionContext,
        api: ApiServiceManager,
        args: any,
        step: PlannerPlanStep
    ): Promise<string> {
        // search aracı: model plan sırasında sadece anahtar kelimeleri belirler; biz bunları tek bir sorguya dönüştürürüz
        const keywords: string[] = Array.isArray(args?.keywords) ? args.keywords.filter((k: any) => typeof k === 'string' && k.trim().length > 0) : [];
        let query = String(args?.query || '').trim();
        if (keywords.length > 0 && !query) {
            query = keywords.join(' ');
        }
        if (!query) {
            // fallback: step.action içinden anahtar sözcük çıkar
            query = String(step.action || step.thought || '').replace(/\b(step|search|ara|bul)\b/gi, '').trim();
        }
        if (!query) return 'search: geçerli bir query/keywords verilmedi.';

        // search => retrieve + özet
        const initial = await retrieve_initial_candidates(context, api, query, Number(args?.top_k || 8));
        const reranked = await rerank_results(query, initial);
        const expanded = await expand_context(context, reranked.slice(0, Math.max(1, Math.min(10, Number(args?.top_k || 8)))));
        const scoreById = new Map(reranked.map(r => [r.id, r.rerank_score ?? r.score ?? 0] as const));
        this.lastRetrieved = expanded.slice(0, 10).map(c => ({
            id: (c as any).id,
            name: c.name,
            filePath: c.filePath,
            content: c.content,
            startLine: (c as any).startLine,
            endLine: (c as any).endLine,
            score: (c as any).score,
            rerank_score: scoreById.get((c as any).id)
        }));
        const summary = this.bestMatchesSummary();
        return `search tamamlandı. Sorgu: "${query}"\nEşleşen örnek dosyalar:\n${summary}`;
    }

    private bestMatchesSummary(): string {
        if (!this.lastRetrieved.length) return '(sonuç yok)';
        const filtered = this.lastRetrieved
            .filter(c => (typeof c.rerank_score === 'number' ? c.rerank_score : 0) >= DEFAULT_RERANK_THRESHOLD)
            .slice(0, 5);
        const list = (filtered.length > 0 ? filtered : this.lastRetrieved.slice(0, 5))
            .map((c, i) => `${i + 1}. ${c.filePath}`)
            .join('\n');
        return list;
    }

    /** Önceki araç çıktılarından hızlı bir özet döndürür (tool seçim prompt'larında kullanılabilir). */
    public getContextSnapshot(): { retrievedSummary: string; locationsSummary: string } {
        const retrievedSummary = this.bestMatchesSummary();
        let locationsSummary = '';
        try {
            const ws = (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath) || '';
            const rel = (p: string) => ws && p.startsWith(ws) ? path.relative(ws, p) : p;
            const lines: string[] = [];
            for (const key of Object.keys(this.lastLocations)) {
                const loc = this.lastLocations[key];
                lines.push(`${key}: ${rel(loc.path)} lines ${loc.startLine}-${loc.endLine}`);
            }
            locationsSummary = lines.join('\n');
        } catch {
            locationsSummary = Object.keys(this.lastLocations).join(', ');
        }
        return { retrievedSummary, locationsSummary };
    }

    private async handleCheckIndex(
        context: vscode.ExtensionContext,
        api: ApiServiceManager,
        args: any,
        step: PlannerPlanStep
    ): Promise<string> {
        // Planner index dosyası: .ivme/planner_index.json
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'check_index: Workspace bulunamadı.';
        const indexUri = vscode.Uri.joinPath(ws.uri, '.ivme', 'planner_index.json');
        let index: Record<string, string> = {};
        try {
            const buf = await vscode.workspace.fs.readFile(indexUri);
            index = JSON.parse(Buffer.from(buf).toString('utf8'));
        } catch {
            return 'check_index: planner_index.json okunamadı veya yok.';
        }

        const files: string[] = Array.isArray(args?.files) ? args.files : (args?.file ? [String(args.file)] : []);
        if (files.length === 0) return 'check_index: files/file parametresi verilmedi.';
        const norm = (s: string) => s.replace(/\\/g, '/').toLowerCase();
        const root = ws.uri.fsPath;
        const missing: string[] = [];
        const existing: string[] = [];
        for (const f of files) {
            const nc = norm(f);
            let found = false;
            for (const key of Object.keys(index)) {
                const nk = norm(key);
                if (!nk.startsWith(norm(root))) continue;
                if (nk.endsWith(nc)) { found = true; break; }
            }
            (found ? existing : missing).push(f);
        }
        const baseMsg = `check_index: existing=[${existing.join(', ')}] missing=[${missing.join(', ')}]`;
        try {
            // Otomatik: Eğer adım metni/niyeti 'create' içeriyorsa ve eksik dosyalar varsa, aynı adımda create_file uygula
            const wantsCreate = /\b(create|oluştur)\b/i.test(String(step.action || '') + ' ' + String(step.ui_text || '') + ' ' + String(step.thought || ''));
            if (wantsCreate && missing.length > 0) {
                const results: string[] = [];
                for (const mf of missing) {
                    try {
                        const r = await this.handleCreateFile({ path: mf }, step);
                        results.push(r);
                    } catch (e: any) {
                        results.push(`create_file hata: ${mf} — ${e?.message || String(e)}`);
                    }
                }
                return `${baseMsg}\n${results.join('\n')}`;
            }
        } catch {/* ignore */}
        return baseMsg;
    }

    private pickBestRetrieved(hint?: string): RetrievedChunk | undefined {
        if (!this.lastRetrieved.length) return undefined;
        const pool = this.lastRetrieved
            .filter(c => (typeof c.rerank_score === 'number' ? c.rerank_score : 0) >= DEFAULT_RERANK_THRESHOLD);
        const candidates = pool.length > 0 ? pool : this.lastRetrieved;
        if (hint && hint.trim().length > 0) {
            const h = hint.toLowerCase();
            const byPath = candidates.find(c => c.filePath.toLowerCase().includes(h));
            if (byPath) return byPath;
            const byName = candidates.find(c => (c.name || '').toLowerCase().includes(h));
            if (byName) return byName;
            const byContent = candidates.find(c => c.content.toLowerCase().includes(h));
            if (byContent) return byContent;
        }
        return candidates[0];
    }

    // open_file kaldırıldı

    private async handleCreateFile(args: any, step: PlannerPlanStep): Promise<string> {
        const filePath = String(args?.path || '').trim();
        if (!filePath) return 'create_file: path eksik.';
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'create_file: Workspace bulunamadı.';
        const abs = path.isAbsolute(filePath) ? filePath : path.join(ws.uri.fsPath, filePath);
        try {
            // Klasörü oluştur
            const dir = path.dirname(abs);
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
            // Eğer dosya yoksa oluştur (boş içerik)
            const uri = vscode.Uri.file(abs);
            try {
                await vscode.workspace.fs.stat(uri);
                // Var ise dokunma
                return `create_file: Dosya zaten var: ${filePath}`;
            } catch {}
            await vscode.workspace.fs.writeFile(uri, new Uint8Array());
            return `Dosya oluşturuldu: ${filePath}`;
        } catch (e) {
            return `create_file başarısız: ${filePath}`;
        }
    }

    private async handleEditFile(
        context: vscode.ExtensionContext,
        api: ApiServiceManager,
        args: any,
        step: PlannerPlanStep
    ): Promise<string> {
        let filePath = String(args?.path || '').trim();
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'edit_file: Workspace bulunamadı.';
        if (!filePath) {
            const best = this.pickBestRetrieved(step.action || step.ui_text || '');
            if (!best) return 'edit_file: path eksik ve uygun chunk bulunamadı.';
            filePath = path.relative(ws.uri.fsPath, best.filePath);
        }
        const abs = path.isAbsolute(filePath) ? filePath : path.join(ws.uri.fsPath, filePath);

        let original = '';
        try {
            const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(abs));
            original = Buffer.from(buf).toString('utf8');
        } catch {
            // Dosya yoksa boş içerikle çalış (create_file sonrası ilk edit gibi durumlar)
            original = '';
        }

        const findSpec = typeof args?.find_spec === 'string' ? args.find_spec : undefined;
        const changeSpec = typeof args?.change_spec === 'string' ? args.change_spec : undefined;
        let range = (args?.range && typeof args.range.start === 'number' && typeof args.range.end === 'number') ? args.range : undefined;
        const useSaved = typeof args?.use_saved_range === 'string' ? args.use_saved_range : undefined;
        if (!range && useSaved && this.lastLocations[useSaved]) {
            const loc = this.lastLocations[useSaved];
            if (path.resolve(loc.path) === path.resolve(abs)) {
                range = { start: loc.start, end: loc.end } as any;
            }
        }
        // Eğer saved yoksa ve retrieval cache içinde aynı dosyadan bir aralık varsa onu kullan
        if (!range) {
            const best = this.lastRetrieved.find(r => path.resolve(r.filePath) === path.resolve(abs));
            if (best && typeof best.startLine === 'number' && typeof best.endLine === 'number') {
                // satır aralığını karakter aralığına dönüştürmek için dosyayı parçala
                const lines = original.split(/\n/);
                const startLineIdx = Math.max(0, (best.startLine || 1) - 1);
                const endLineIdx = Math.max(0, (best.endLine || startLineIdx + 1) - 1);
                const startChar = lines.slice(0, startLineIdx).join('\n').length + (startLineIdx > 0 ? 1 : 0);
                const endChar = lines.slice(0, endLineIdx + 1).join('\n').length;
                range = { start: startChar, end: endChar } as any;
            }
        }
        // Eğer hala yoksa ve dosya yeni/boş ise, full file update moduna düş
        if (!range && original.trim().length === 0) {
            // full file update yapılır (aşağıdaki else bloğu)
        }
        // Eğer range yine yoksa ve find_spec varsa, basit bir text aramasıyla ilk eşleşmeyi kullan
        if (!range && findSpec && findSpec.trim().length > 0) {
            const idx = original.indexOf(findSpec);
            if (idx !== -1) {
                range = { start: idx, end: idx + findSpec.length } as any;
            }
        }

        // Kod üretim prompt'u — sadece yeni dosya içeriği olarak döndürmesini ister
        const retrievedContext = this.composeRetrievedContext();
        if (range) {
            // Sadece ilgili snippet'i güncelle
            const snippetOriginal = original.slice(range.start, range.end);
            const system = [
                'You are a senior engineer. Update ONLY the provided code snippet based on the change specification.',
                'Output ONLY the updated snippet as a single Markdown code block. No prose, no explanation, no surrounding text.'
            ].join(' ');
            const userParts: string[] = [];
            userParts.push('Change specification:');
            userParts.push('---');
            userParts.push(String(changeSpec || step.action || step.thought || ''));
            userParts.push('---');
            if (step.thought && String(step.thought).trim().length > 0) {
                userParts.push('User request (from plan.thought):');
                userParts.push('---');
                userParts.push(String(step.thought));
                userParts.push('---');
            }
            if (findSpec) userParts.push(`Helpful find_spec: ${findSpec}`);
            userParts.push('Current snippet:');
            userParts.push('```');
            userParts.push(snippetOriginal);
            userParts.push('```');
            if (retrievedContext) {
                userParts.push('\nRelevant context (snippets):');
                userParts.push(retrievedContext);
            }
            const messages = [
                { role: 'system' as const, content: system },
                { role: 'user' as const, content: userParts.join('\n') }
            ];
            // Debug log: prompt ve hedef aralık bilgisi
            try {
                const preview = (s: string) => (s.length > 2000 ? s.slice(0, 2000) + '... [truncated]' : s);
                console.log('[EditFile] Path:', filePath, 'range:', range.start + '-' + range.end);
                console.log('[EditFile] System prompt:\n' + system);
                console.log('[EditFile] User prompt:\n' + preview(userParts.join('\n')));
            } catch {}
            let raw = '';
            await api.generateChatContent(messages, (chunk) => { raw += chunk; }, undefined as any);
            try { console.log('[EditFile] Raw response length:', raw.length); } catch {}
            const newSnippet = extractOnlyCode(raw);
            try { console.log('[EditFile] Extracted snippet length:', (newSnippet || '').length); } catch {}
            if (!newSnippet || newSnippet.trim().length === 0) return 'edit_file: Modelden geçerli snippet alınamadı.';
            const updated = original.slice(0, range.start) + newSnippet + original.slice(range.end);
            await vscode.workspace.fs.writeFile(vscode.Uri.file(abs), Buffer.from(updated, 'utf8'));
            return `Aralık güncellendi: ${filePath} [${range.start}-${range.end}]`;
        } else {
            // Tüm dosyayı güncelle
            const system = [
                'You are a senior engineer. Update the given file based on the change specification.',
                'Output ONLY the complete, final file content as a single Markdown code block. No prose, no explanation.'
            ].join(' ');
            const userParts: string[] = [];
            userParts.push('Change specification:');
            userParts.push('---');
            userParts.push(String(changeSpec || step.action || step.thought || ''));
            userParts.push('---');
            if (step.thought && String(step.thought).trim().length > 0) {
                userParts.push('User request (from plan.thought):');
                userParts.push('---');
                userParts.push(String(step.thought));
                userParts.push('---');
            }
            if (findSpec) userParts.push(`Locate using find_spec: ${findSpec}`);
            userParts.push('Current file content:');
            userParts.push('```');
            userParts.push(original);
            userParts.push('```');
            if (retrievedContext) {
                userParts.push('\nRelevant context (snippets):');
                userParts.push(retrievedContext);
            }
            const messages = [
                { role: 'system' as const, content: system },
                { role: 'user' as const, content: userParts.join('\n') }
            ];
            // Debug log: prompt ve full-file bilgisi
            try {
                const preview = (s: string) => (s.length > 2000 ? s.slice(0, 2000) + '... [truncated]' : s);
                console.log('[EditFile] Path:', filePath, 'FULL FILE UPDATE');
                console.log('[EditFile] System prompt:\n' + system);
                console.log('[EditFile] User prompt:\n' + preview(userParts.join('\n')));
            } catch {}
            let raw = '';
            await api.generateChatContent(messages, (chunk) => { raw += chunk; }, undefined as any);
            try { console.log('[EditFile] Raw response length:', raw.length); } catch {}
            const newContent = extractOnlyCode(raw);
            try { console.log('[EditFile] Extracted content length:', (newContent || '').length); } catch {}
            if (!newContent || newContent.trim().length === 0) return 'edit_file: Modelden geçerli içerik alınamadı.';
            await vscode.workspace.fs.writeFile(vscode.Uri.file(abs), Buffer.from(newContent, 'utf8'));
            return `Dosya güncellendi: ${filePath}`;
        }
    }

    private async handleAppendFile(
        context: vscode.ExtensionContext,
        api: ApiServiceManager,
        args: any,
        step: PlannerPlanStep
    ): Promise<string> {
        const filePath = String(args?.path || '').trim();
        const position = (args?.position === 'beginning' || args?.position === 'end') ? args.position : 'end';
        if (!filePath) return 'append_file: path eksik.';
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'append_file: Workspace bulunamadı.';
        const abs = path.isAbsolute(filePath) ? filePath : path.join(ws.uri.fsPath, filePath);

        let original = '';
        try {
            const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(abs));
            original = Buffer.from(buf).toString('utf8');
        } catch {
            return `append_file: Dosya okunamadı: ${filePath}`;
        }

        // content_spec yalın metin isteniyor; kod burada üretilecek (LLM) ve sadece snippet dönecek
        const contentSpec = typeof args?.content_spec === 'string' ? args.content_spec : (step.action || step.thought || '');
        const retrievedContext = this.composeRetrievedContext();
        const system = [
            'You are a senior engineer. Produce ONLY the minimal Python code snippet to append based on the high-level specification.',
            'Strictly output ONE Markdown code block with ONLY the code. No prose, no comments, no extra text.'
        ].join(' ');
        const user = [
            'Goal (high-level, plain text spec; no code shown here):',
            String(contentSpec).replace(/```[\s\S]*?```/g, '').replace(/[\r\n]+/g, ' '),
            '',
            'Existing file (reference only; do NOT repeat unchanged parts):',
            '```',
            original,
            '```',
            retrievedContext ? ('\nRelevant context (snippets):\n' + retrievedContext) : ''
        ].join('\n');

        const messages = [
            { role: 'system' as const, content: system },
            { role: 'user' as const, content: user }
        ];

        let raw = '';
        await api.generateChatContent(messages, (chunk) => { raw += chunk; }, undefined as any);
        const snippet = cleanLLMCodeBlock(raw);
        if (!snippet || snippet.trim().length === 0) {
            return 'append_file: Modelden geçerli içerik alınamadı.';
        }

        const updated = position === 'beginning' ? (snippet + '\n' + original) : (original + '\n' + snippet);
        await vscode.workspace.fs.writeFile(vscode.Uri.file(abs), Buffer.from(updated, 'utf8'));
        return `Dosyaya içerik eklendi: ${filePath}`;
    }

    private composeRetrievedContext(): string {
        if (!this.lastRetrieved || this.lastRetrieved.length === 0) return '';
        const blocks = this.lastRetrieved.slice(0, 5).map(rc => [
            `File: ${rc.filePath}`,
            '```',
            rc.content,
            '```'
        ].join('\n'));
        return blocks.join('\n\n');
    }

    private async handleLocateCode(
        context: vscode.ExtensionContext,
        api: ApiServiceManager,
        args: any,
        step: PlannerPlanStep
    ): Promise<string> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'locate_code: Workspace bulunamadı.';
        const saveAs = String(args?.save_as || 'default').trim();
        const name = typeof args?.name === 'string' ? args.name.trim() : '';
        const pattern = typeof args?.pattern === 'string' ? args.pattern.trim() : '';
        const inputPath = typeof args?.path === 'string' ? args.path.trim() : '';
        let targetAbs = '';
        let text = '';

        if (inputPath) {
            targetAbs = path.isAbsolute(inputPath) ? inputPath : path.join(ws.uri.fsPath, inputPath);
            try {
                const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(targetAbs));
                text = Buffer.from(buf).toString('utf8');
            } catch {
                return `locate_code: Dosya okunamadı: ${inputPath}`;
            }
        } else {
            const best = this.pickBestRetrieved(name || pattern || '');
            if (!best) return 'locate_code: Önce search/retrieve çalıştırın veya path verin.';
            targetAbs = best.filePath;
            text = best.content;
        }

        const loc = this.findFunctionRange(text, name, pattern);
        if (!loc) return `locate_code: Uygun kod parçası bulunamadı.`;
        const startLine = 1 + (text.slice(0, loc.start).match(/\n/g)?.length || 0);
        const endLine = 1 + (text.slice(0, loc.end).match(/\n/g)?.length || 0);
        this.lastLocations[saveAs] = { path: targetAbs, start: loc.start, end: loc.end, startLine, endLine };
        return `locate_code tamamlandı: ${path.relative(ws.uri.fsPath, targetAbs)} satırlar ${startLine}-${endLine} (anahtar: ${saveAs}).`;
    }

    private findFunctionRange(text: string, name?: string, pattern?: string): { start: number; end: number } | null {
        const src = text;
        if (pattern) {
            try {
                const re = new RegExp(pattern, 'm');
                const m = re.exec(src);
                if (m) {
                    const start = m.index;
                    const end = this.expandToBlockEnd(src, m.index + m[0].length);
                    return { start, end };
                }
            } catch {}
        }
        if (name) {
            const reList = [
                new RegExp(`function\\s+${this.escapeRegex(name)}\\s*\\(`, 'm'),
                new RegExp(`export\\s+function\\s+${this.escapeRegex(name)}\\s*\\(`, 'm'),
                new RegExp(`const\\s+${this.escapeRegex(name)}\\s*=\\s*\\(`, 'm'),
                new RegExp(`${this.escapeRegex(name)}\\s*=\\s*\\(`, 'm'),
                new RegExp(`${this.escapeRegex(name)}\\s*\\(.*?\\)\\s*{`, 'm')
            ];
            for (const re of reList) {
                const m = re.exec(src);
                if (m) {
                    const start = m.index;
                    const end = this.expandToBlockEnd(src, m.index + m[0].length);
                    return { start, end };
                }
            }
        }
        return null;
    }

    private expandToBlockEnd(src: string, fromIndex: number): number {
        const openIdx = src.indexOf('{', fromIndex);
        if (openIdx === -1) return fromIndex;
        let depth = 1;
        for (let i = openIdx + 1; i < src.length; i++) {
            const ch = src[i];
            if (ch === '{') depth++;
            else if (ch === '}') { depth--; if (depth === 0) return i + 1; }
        }
        return src.length;
    }

    private escapeRegex(s: string): string {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// Yardımcı: LLM çıktısından yalnızca kod bloğunu çıkarır.
// Birden fazla kod bloğu varsa, ilk tam blok tercih edilir; hiç yoksa cleanLLMCodeBlock ile kalan metin döndürülür.
function extractOnlyCode(raw: string): string {
    if (!raw) return '';
    // Önce üçlü fence arayın (```lang ... ```)
    const fenceRegex = /```[a-zA-Z0-9]*\s*([\s\S]*?)```/m;
    const m = fenceRegex.exec(raw);
    if (m && m[1]) return m[1].trim();
    // Bazı modeller tek backtickli veya hiçbir fence kullanmayabilir
    // Yine de en azından markdown olmayan ön/arka metni temizle
    return cleanLLMCodeBlock(raw);
}


