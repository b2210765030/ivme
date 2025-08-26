/* ==========================================================================
   DOSYA: src/services/executor.ts

   AMAÇ:
   - Planner planındaki tekil adımları (tool tabanlı) uygular
   - Kod üretimini sadece uygulama anında LLM ile yapar (planner çıktılarına asla kod yok)
   ========================================================================== */

import * as vscode from 'vscode';
import * as path from 'path';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
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
    private lastToolOutputs: Array<{ tool: string; summary: string }> = [];
    private focusPathAbs: string | undefined;
    private focusSelection: { startLine: number; startCharacter: number; endLine: number; endCharacter: number } | undefined;

    public setFocusPath(absPath: string | undefined): void {
        this.focusPathAbs = absPath && absPath.trim().length > 0 ? absPath : undefined;
    }

    public setFocusSelection(sel: { startLine: number; startCharacter: number; endLine: number; endCharacter: number } | undefined): void {
        if (sel && typeof sel.startLine === 'number' && typeof sel.endLine === 'number') {
            this.focusSelection = sel;
        } else {
            this.focusSelection = undefined;
        }
    }

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

        let result: string;
        switch (tool) {
            case 'check_index':
                result = await this.handleCheckIndex(context, api, args, step); break;
            case 'search':
                result = await this.handleSearch(context, api, args, step); break;
            case 'locate_code':
                result = await this.handleLocateCode(context, api, args, step); break;
            case 'retrieve_chunks':
                result = await this.handleRetrieve(context, api, args, step); break;
            // open_file kaldırıldı
            case 'create_file':
                result = await this.handleCreateFile(args, step); break;
            case 'edit_file':
                result = await this.handleEditFile(context, api, args, step); break;
            case 'append_file':
                result = await this.handleAppendFile(context, api, args, step); break;
            case 'read_file':
                result = await this.handleReadFile(args); break;
            case 'list_dir':
                result = await this.handleListDir(args); break;
            case 'delete_path':
                result = await this.handleDeletePath(args); break;
            case 'move_path':
                result = await this.handleMovePath(args); break;
            case 'copy_path':
                result = await this.handleCopyPath(args); break;
            case 'create_directory':
                result = await this.handleCreateDirectory(args); break;
            case 'search_text':
                result = await this.handleSearchText(args); break;
            case 'replace_in_file':
                result = await this.handleReplaceInFile(args); break;
            case 'update_json':
                result = await this.handleUpdateJson(args); break;
            case 'run_command':
                result = await this.handleRunCommand(args); break;
            case 'run_npm_script':
                result = await this.handleRunNpmScript(args); break;
            case 'format_file':
                result = await this.handleFormatFile(args); break;
            case 'open_in_editor':
                result = await this.handleOpenInEditor(args); break;
            default:
                if (tool) {
                    result = await this.handleCustomTool(context, tool, args, step);
                } else {
                    result = `Araç belirtilmedi veya desteklenmiyor: ${tool || 'yok'} — Adım: ${step.ui_text || step.action}`;
                }
        }
        // Kısa özet kaydet (bir sonraki adımın tool seçimi bağlamında kullanılacak)
        this.recordToolOutput(tool || 'no_tool', args, result);
        return result;
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
    public getContextSnapshot(): { retrievedSummary: string; locationsSummary: string; toolOutputsSummary: string } {
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
        const toolOutputsSummary = this.lastToolOutputs.map((o, i) => `${i + 1}. ${o.tool}: ${o.summary}`).join('\n');
        return { retrievedSummary, locationsSummary, toolOutputsSummary };
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

        let files: string[] = Array.isArray(args?.files) ? args.files : (args?.file ? [String(args.file)] : []);
        // Enforce focus: if focus file exists, override any provided list to contain only it
        if (this.focusPathAbs) {
            const rel = path.relative(ws.uri.fsPath, this.focusPathAbs);
            files = [rel];
        }
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
        let filePath = String(args?.path || '').trim();
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'create_file: Workspace bulunamadı.';
        // Enforce focus: always create/ensure the focus file only
        let abs = '';
        if (this.focusPathAbs) {
            abs = this.focusPathAbs;
            filePath = path.relative(ws.uri.fsPath, abs);
        } else {
            if (!filePath) return 'create_file: path eksik.';
            abs = path.isAbsolute(filePath) ? filePath : path.join(ws.uri.fsPath, filePath);
        }
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
            // Prefer focused active file if available
            if (this.focusPathAbs) {
                filePath = path.relative(ws.uri.fsPath, this.focusPathAbs);
            } else {
                const best = this.pickBestRetrieved(step.action || step.ui_text || '');
                if (!best) return 'edit_file: path eksik ve uygun chunk bulunamadı.';
                filePath = path.relative(ws.uri.fsPath, best.filePath);
            }
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
        
        // Eğer focus selection varsa, edit'i sadece bu aralık içinde sınırla
        if (this.focusPathAbs && path.resolve(abs) === path.resolve(this.focusPathAbs) && this.focusSelection) {
            const sel = this.focusSelection;
            const lines = original.split(/\n/);
            const startPrefix = lines.slice(0, sel.startLine).join('\n');
            const endPrefix = lines.slice(0, sel.endLine).join('\n');
            const selStart = startPrefix.length + (sel.startLine > 0 ? 1 : 0) + Math.max(0, sel.startCharacter || 0);
            const selEnd = endPrefix.length + (sel.endLine > 0 ? 1 : 0) + Math.max(0, sel.endCharacter || 0);
            if (!range) {
                range = { start: selStart, end: Math.max(selStart, selEnd) } as any;
            } else {
                const clampedStart = Math.max(range.start, selStart);
                const clampedEnd = Math.min(range.end, Math.max(selStart, selEnd));
                if (clampedEnd <= clampedStart) {
                    range = { start: selStart, end: Math.max(selStart, selEnd) } as any;
                } else {
                    range = { start: clampedStart, end: clampedEnd } as any;
                }
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
                // EditFile prompt preview suppressed
            } catch {}
            let raw = '';
            await api.generateChatContent(messages, (chunk) => { raw += chunk; }, undefined as any);
            try { /* raw response length suppressed */ } catch {}
            const newSnippet = extractOnlyCode(raw);
            try { /* extracted snippet length suppressed */ } catch {}
            if (!newSnippet || newSnippet.trim().length === 0) return 'edit_file: Modelden geçerli snippet alınamadı.';
            const updated = original.slice(0, range.start) + newSnippet + original.slice(range.end);
            await vscode.workspace.fs.writeFile(vscode.Uri.file(abs), Buffer.from(updated, 'utf8'));
            return `Aralık güncellendi: ${filePath} [${range.start}-${range.end}]`;
        } else {
            // Tüm dosyayı güncelle
            // Eğer focus selection varsa, full file yerine sadece seçim aralığını güncelle moduna zorla
            if (this.focusPathAbs && path.resolve(abs) === path.resolve(this.focusPathAbs) && this.focusSelection) {
                const sel = this.focusSelection;
                const lines = original.split(/\n/);
                const startPrefix = lines.slice(0, sel.startLine).join('\n');
                const endPrefix = lines.slice(0, sel.endLine).join('\n');
                const selStart = startPrefix.length + (sel.startLine > 0 ? 1 : 0) + Math.max(0, sel.startCharacter || 0);
                const selEnd = endPrefix.length + (sel.endLine > 0 ? 1 : 0) + Math.max(0, sel.endCharacter || 0);
                const snippetOriginal = original.slice(selStart, selEnd);
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
                let raw = '';
                await api.generateChatContent(messages, (chunk) => { raw += chunk; }, undefined as any);
                const newSnippet = extractOnlyCode(raw);
                if (!newSnippet || newSnippet.trim().length === 0) return 'edit_file: Modelden geçerli snippet alınamadı (selection).';
                const updated = original.slice(0, selStart) + newSnippet + original.slice(selEnd);
                await vscode.workspace.fs.writeFile(vscode.Uri.file(abs), Buffer.from(updated, 'utf8'));
                return `Seçim aralığı güncellendi: ${filePath} [${selStart}-${selEnd}]`;
            }

            // Güvenli varsayılan: Eğer hedef dosya doluysa ve aralık belirtilmemişse, tam dosya yerine ekleme modunu tercih et
            // Kullanıcı açıkça "güncelle/değiştir/replace" belirtmediyse, ekleme yap
            if (original.trim().length > 0 && !args?.force_full_file) {
                const intentText = String(changeSpec || step.action || step.thought || '').toLowerCase();
                const looksReplace = /(replace|overwrite|update|modify|değiştir|degistir|güncelle|guncelle)/i.test(intentText);
                if (!looksReplace) {
                    const position = (args && typeof args.position === 'string') ? args.position : 'end';
                    return await this.handleAppendFile(context, api, { path: filePath, content_spec: changeSpec || step.action || step.thought, position }, step);
                }
            }
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
            try { /* full file update prompt preview suppressed */ } catch {}
            let raw = '';
            await api.generateChatContent(messages, (chunk) => { raw += chunk; }, undefined as any);
            try { /* raw response length suppressed */ } catch {}
            const newContent = extractOnlyCode(raw);
            try { /* extracted content length suppressed */ } catch {}
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
        let filePath = String(args?.path || '').trim();
        const position = (args?.position === 'beginning' || args?.position === 'end') ? args.position : 'end';
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'append_file: Workspace bulunamadı.';
        if (!filePath) {
            if (this.focusPathAbs) {
                filePath = path.relative(ws.uri.fsPath, this.focusPathAbs);
            } else {
                return 'append_file: path eksik.';
            }
        }
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
            'You are a senior engineer. Produce ONLY the minimal code snippet to insert based on the high-level specification.',
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

        // If focus selection is present and on this file, insert within selection bounds instead of entire file head/tail
        if (this.focusPathAbs && path.resolve(abs) === path.resolve(this.focusPathAbs) && this.focusSelection) {
            const sel = this.focusSelection;
            const lines = original.split(/\n/);
            const startPrefix = lines.slice(0, sel.startLine).join('\n');
            const endPrefix = lines.slice(0, sel.endLine).join('\n');
            const selStart = startPrefix.length + (sel.startLine > 0 ? 1 : 0) + Math.max(0, sel.startCharacter || 0);
            const selEnd = endPrefix.length + (sel.endLine > 0 ? 1 : 0) + Math.max(0, sel.endCharacter || 0);
            const insertAt = position === 'beginning' ? selStart : selEnd;
            const updated = original.slice(0, insertAt) + snippet + original.slice(insertAt);
            await vscode.workspace.fs.writeFile(vscode.Uri.file(abs), Buffer.from(updated, 'utf8'));
            return `Seçim içine içerik eklendi: ${filePath}`;
        }

        const updated = position === 'beginning' ? (snippet + '\n' + original) : (original + '\n' + snippet);
        await vscode.workspace.fs.writeFile(vscode.Uri.file(abs), Buffer.from(updated, 'utf8'));
        return `Dosyaya içerik eklendi: ${filePath}`;
    }

    private async handleReadFile(args: any): Promise<string> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'read_file: Workspace bulunamadı.';
        const rel = String(args?.path || '').trim();
        if (!rel) return 'read_file: path eksik.';
        const abs = path.isAbsolute(rel) ? rel : path.join(ws.uri.fsPath, rel);
        let text = '';
        try {
            const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(abs));
            text = Buffer.from(buf).toString('utf8');
        } catch {
            return `read_file: Dosya okunamadı: ${rel}`;
        }
        let startLine = Number(args?.start_line || 1);
        let endLine = Number(args?.end_line || 0);
        if (!isFinite(startLine) || startLine < 1) startLine = 1;
        const lines = text.split(/\n/);
        if (!isFinite(endLine) || endLine <= 0 || endLine > lines.length) endLine = lines.length;
        if (startLine > endLine) startLine = Math.max(1, Math.min(endLine, startLine));
        const snippet = lines.slice(startLine - 1, endLine).join('\n');
        const saveAs = typeof args?.save_as === 'string' ? args.save_as.trim() : '';
        if (saveAs) {
            const startChar = lines.slice(0, startLine - 1).join('\n').length + (startLine > 1 ? 1 : 0);
            const endChar = lines.slice(0, endLine).join('\n').length;
            this.lastLocations[saveAs] = { path: abs, start: startChar, end: endChar, startLine, endLine } as any;
        }
        return `read_file: ${rel} satırlar ${startLine}-${endLine}\n\n\`\`\`\n${snippet}\n\`\`\``;
    }

    private async handleListDir(args: any): Promise<string> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'list_dir: Workspace bulunamadı.';
        const rel = String(args?.path || '').trim();
        const base = rel ? (path.isAbsolute(rel) ? rel : path.join(ws.uri.fsPath, rel)) : ws.uri.fsPath;
        const depth = Math.max(0, Number(args?.depth ?? 1) || 1);
        const filesOnly = !!args?.files_only;
        const dirsOnly = !!args?.dirs_only;
        const items: string[] = [];
        const visit = async (dir: string, d: number) => {
            if (d < 0) return;
            let entries: [string, vscode.FileType][] = [];
            try { entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir)); } catch { return; }
            for (const [name, type] of entries) {
                const p = path.join(dir, name);
                const relPath = path.relative(ws.uri.fsPath, p).replace(/\\/g, '/');
                const isDir = type === vscode.FileType.Directory;
                if ((filesOnly && isDir) || (dirsOnly && !isDir)) {
                } else {
                    items.push((isDir ? '[D] ' : '[F] ') + relPath);
                }
                if (isDir && d > 0) await visit(p, d - 1);
            }
        };
        await visit(base, depth);
        return items.length ? ('list_dir:\n' + items.slice(0, 200).join('\n')) : 'list_dir: (boş)';
    }

    private async handleDeletePath(args: any): Promise<string> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'delete_path: Workspace bulunamadı.';
        const rel = String(args?.path || '').trim();
        if (!rel) return 'delete_path: path eksik.';
        const abs = path.isAbsolute(rel) ? rel : path.join(ws.uri.fsPath, rel);
        try {
            await vscode.workspace.fs.delete(vscode.Uri.file(abs), { recursive: !!args?.recursive, useTrash: false } as any);
            return `Silindi: ${rel}`;
        } catch (e: any) {
            return `delete_path hata: ${rel} — ${e?.message || e}`;
        }
    }

    private async handleMovePath(args: any): Promise<string> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'move_path: Workspace bulunamadı.';
        const srcRel = String(args?.source || '').trim();
        const dstRel = String(args?.target || '').trim();
        if (!srcRel || !dstRel) return 'move_path: source/target eksik.';
        const src = path.isAbsolute(srcRel) ? srcRel : path.join(ws.uri.fsPath, srcRel);
        const dst = path.isAbsolute(dstRel) ? dstRel : path.join(ws.uri.fsPath, dstRel);
        try {
            await vscode.workspace.fs.rename(vscode.Uri.file(src), vscode.Uri.file(dst), { overwrite: !!args?.overwrite } as any);
            return `Taşındı: ${srcRel} -> ${dstRel}`;
        } catch (e: any) {
            return `move_path hata: ${srcRel} -> ${dstRel} — ${e?.message || e}`;
        }
    }

    private async handleCopyPath(args: any): Promise<string> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'copy_path: Workspace bulunamadı.';
        const srcRel = String(args?.source || '').trim();
        const dstRel = String(args?.target || '').trim();
        if (!srcRel || !dstRel) return 'copy_path: source/target eksik.';
        const src = path.isAbsolute(srcRel) ? srcRel : path.join(ws.uri.fsPath, srcRel);
        const dst = path.isAbsolute(dstRel) ? dstRel : path.join(ws.uri.fsPath, dstRel);
        try {
            await vscode.workspace.fs.copy(vscode.Uri.file(src), vscode.Uri.file(dst), { overwrite: !!args?.overwrite } as any);
            return `Kopyalandı: ${srcRel} -> ${dstRel}`;
        } catch (e: any) {
            return `copy_path hata: ${srcRel} -> ${dstRel} — ${e?.message || e}`;
        }
    }

    private async handleCreateDirectory(args: any): Promise<string> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'create_directory: Workspace bulunamadı.';
        const rel = String(args?.path || '').trim();
        if (!rel) return 'create_directory: path eksik.';
        const abs = path.isAbsolute(rel) ? rel : path.join(ws.uri.fsPath, rel);
        try { await vscode.workspace.fs.createDirectory(vscode.Uri.file(abs)); return `Klasör oluşturuldu: ${rel}`; } catch (e: any) { return `create_directory hata: ${rel} — ${e?.message || e}`; }
    }

    private async handleSearchText(args: any): Promise<string> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'search_text: Workspace bulunamadı.';
        const query = String(args?.query || '').trim();
        if (!query) return 'search_text: query eksik.';
        const include = typeof args?.include === 'string' && args.include.trim().length > 0 ? args.include.trim() : '**/*';
        const excludeDefault = '**/{node_modules,.git,.ivme,dist,out,build,.next,.turbo,coverage}/**';
        const exclude = typeof args?.exclude === 'string' && args.exclude.trim().length > 0 ? args.exclude.trim() : excludeDefault;
        const maxFiles = 2000;
        const maxResults = Math.max(1, Math.min(200, Number(args?.top_k || 50)));
        const isRegex = !!args?.is_regex;
        let re: RegExp | null = null;
        if (isRegex) {
            try { re = new RegExp(query, 'i'); } catch { return 'search_text: Geçersiz regex.'; }
        }
        const files = await vscode.workspace.findFiles(include, exclude, maxFiles);
        const results: Array<{ p: string; line: number; text: string }> = [];
        for (const uri of files) {
            if (results.length >= maxResults) break;
            let content = '';
            try { const buf = await vscode.workspace.fs.readFile(uri); content = Buffer.from(buf).toString('utf8'); } catch { continue; }
            const lines = content.split(/\n/);
            for (let i = 0; i < lines.length; i++) {
                const ln = lines[i];
                const ok = re ? re.test(ln) : ln.includes(query);
                if (ok) {
                    results.push({ p: path.relative(ws.uri.fsPath, uri.fsPath).replace(/\\/g, '/'), line: i + 1, text: ln.trim().slice(0, 200) });
                    if (results.length >= maxResults) break;
                }
            }
        }
        if (results.length === 0) return `search_text: Sonuç yok (query="${query}")`;
        const body = results.map(r => `${r.p}:${r.line}: ${r.text}`).join('\n');
        return `search_text sonuçları (ilk ${results.length}):\n${body}`;
    }

    private async handleReplaceInFile(args: any): Promise<string> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'replace_in_file: Workspace bulunamadı.';
        const rel = String(args?.path || '').trim();
        if (!rel) return 'replace_in_file: path eksik.';
        const abs = path.isAbsolute(rel) ? rel : path.join(ws.uri.fsPath, rel);
        const find = String(args?.find || '').trim();
        const replace = String(args?.replace ?? '');
        if (!find) return 'replace_in_file: find eksik.';
        const isRegex = !!args?.is_regex;
        const flags = typeof args?.flags === 'string' && args.flags.trim().length > 0 ? args.flags.trim() : 'g';
        let content = '';
        try { const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(abs)); content = Buffer.from(buf).toString('utf8'); } catch { return `replace_in_file: Dosya okunamadı: ${rel}`; }
        let updated = content;
        if (isRegex) {
            let re: RegExp;
            try { re = new RegExp(find, flags.includes('g') ? flags : (flags + 'g')); } catch { return 'replace_in_file: Geçersiz regex/flags.'; }
            updated = content.replace(re, replace);
        } else {
            updated = content.split(find).join(replace);
        }
        if (updated === content) return 'replace_in_file: Değişiklik yok (eşleşme bulunamadı).';
        await vscode.workspace.fs.writeFile(vscode.Uri.file(abs), Buffer.from(updated, 'utf8'));
        return `replace_in_file: Güncellendi: ${rel}`;
    }

    private async handleUpdateJson(args: any): Promise<string> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'update_json: Workspace bulunamadı.';
        const rel = String(args?.path || '').trim();
        if (!rel) return 'update_json: path eksik.';
        const abs = path.isAbsolute(rel) ? rel : path.join(ws.uri.fsPath, rel);
        interface UpdateSpec { path: string; value: any }
        const updates: UpdateSpec[] = Array.isArray(args?.updates) ? args.updates : [];
        if (!updates.length) return 'update_json: updates boş.';
        let obj: any = {};
        try { const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(abs)); obj = JSON.parse(Buffer.from(buf).toString('utf8')); } catch { if (!args?.create_if_missing) return `update_json: Dosya yok veya okunamadı: ${rel}`; obj = {}; }
        const setByPath = (target: any, p: string, val: any) => {
            if (!p) return;
            let parts: string[];
            if (p.startsWith('/')) { parts = p.split('/').slice(1).map(s => s.replace(/~1/g, '/').replace(/~0/g, '~')); }
            else { parts = p.replace(/\[(\d+)\]/g, '.$1').split('.'); }
            let cur = target;
            for (let i = 0; i < parts.length; i++) {
                const key = parts[i];
                const isLast = i === parts.length - 1;
                if (isLast) { (cur as any)[key] = val; break; }
                if (cur[key] == null || typeof cur[key] !== 'object') {
                    const nextIsIndex = /^\d+$/.test(parts[i + 1] || '');
                    cur[key] = nextIsIndex ? [] : {};
                }
                cur = cur[key];
            }
        };
        for (const u of updates) { if (u && typeof u.path === 'string') setByPath(obj, u.path, u.value); }
        const text = JSON.stringify(obj, null, 2) + '\n';
        await vscode.workspace.fs.writeFile(vscode.Uri.file(abs), Buffer.from(text, 'utf8'));
        return `update_json: Güncellendi: ${rel}`;
    }

    private async handleRunCommand(args: any): Promise<string> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'run_command: Workspace bulunamadı.';
        const command = String(args?.command || '').trim();
        if (!command) return 'run_command: command eksik.';
        const cwd = typeof args?.cwd === 'string' && args.cwd.trim().length > 0 ? (path.isAbsolute(args.cwd) ? args.cwd : path.join(ws.uri.fsPath, args.cwd)) : ws.uri.fsPath;
        const timeoutMs = Math.max(1000, Math.min(300000, Number(args?.timeout_ms || 60000)));
        const allowedPrefixes = ['npm', 'pnpm', 'yarn', 'npx', 'echo'];
        const firstToken = command.split(/\s+/)[0].toLowerCase();
        if (!allowedPrefixes.includes(firstToken)) return 'run_command: Güvenlik nedeniyle bu komut engellendi.';
        const execAsync = promisify(execCb);
        try {
            const { stdout, stderr } = await execAsync(command, { cwd, timeout: timeoutMs, windowsHide: true } as any);
            const out = (stdout || '').toString();
            const err = (stderr || '').toString();
            const combined = [out.trim(), err.trim()].filter(Boolean).join('\n');
            return combined.length ? combined.slice(0, 8000) : 'run_command: Tamamlandı (çıktı yok)';
        } catch (e: any) {
            return `run_command hata: ${e?.message || e}`;
        }
    }

    private async handleRunNpmScript(args: any): Promise<string> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'run_npm_script: Workspace bulunamadı.';
        const script = String(args?.script || '').trim();
        if (!script) return 'run_npm_script: script eksik.';
        let manager = String(args?.package_manager || '').trim().toLowerCase();
        if (!manager) {
            try { await vscode.workspace.fs.stat(vscode.Uri.joinPath(ws.uri, 'pnpm-lock.yaml')); manager = 'pnpm'; } catch {}
            if (!manager) { try { await vscode.workspace.fs.stat(vscode.Uri.joinPath(ws.uri, 'yarn.lock')); manager = 'yarn'; } catch {} }
            if (!manager) manager = 'npm';
        }
        const extraArgs: string[] = Array.isArray(args?.args) ? args.args.map((a: any) => String(a)) : [];
        const cmd = manager === 'yarn' ? `yarn ${script} ${extraArgs.join(' ')}` : `${manager} run ${script} ${extraArgs.join(' ')}`;
        return await this.handleRunCommand({ command: cmd, cwd: ws.uri.fsPath, timeout_ms: args?.timeout_ms });
    }

    private async handleFormatFile(args: any): Promise<string> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'format_file: Workspace bulunamadı.';
        const rel = String(args?.path || '').trim();
        if (!rel) return 'format_file: path eksik.';
        const uri = vscode.Uri.file(path.isAbsolute(rel) ? rel : path.join(ws.uri.fsPath, rel));
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>('vscode.executeFormatDocumentProvider', uri);
            if (Array.isArray(edits) && edits.length > 0) {
                const we = new vscode.WorkspaceEdit();
                we.set(uri, edits);
                await vscode.workspace.applyEdit(we);
                await doc.save();
                return `format_file: Biçimlendirildi: ${path.relative(ws.uri.fsPath, uri.fsPath).replace(/\\/g, '/')}`;
            }
            return 'format_file: Biçimlendirme uygulanmadı (edit yok).';
        } catch (e: any) {
            return `format_file hata: ${e?.message || e}`;
        }
    }

    private async handleOpenInEditor(args: any): Promise<string> {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) return 'open_in_editor: Workspace bulunamadı.';
        const rel = String(args?.path || '').trim();
        if (!rel) return 'open_in_editor: path eksik.';
        const uri = vscode.Uri.file(path.isAbsolute(rel) ? rel : path.join(ws.uri.fsPath, rel));
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc, { preview: false });
            const line = Number(args?.line || 0);
            const col = Number(args?.column || 0);
            if (isFinite(line) && line > 0) {
                const pos = new vscode.Position(Math.max(0, line - 1), Math.max(0, col - 1));
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            }
            return `open_in_editor: Açıldı: ${path.relative(ws.uri.fsPath, uri.fsPath).replace(/\\/g, '/')}`;
        } catch (e: any) {
            return `open_in_editor hata: ${e?.message || e}`;
        }
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
            if (this.focusPathAbs) {
                targetAbs = this.focusPathAbs;
                try {
                    const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(targetAbs));
                    text = Buffer.from(buf).toString('utf8');
                } catch {
                    return `locate_code: Dosya okunamadı: ${path.relative(ws.uri.fsPath, targetAbs)}`;
                }
            } else {
                const best = this.pickBestRetrieved(name || pattern || '');
                if (!best) return 'locate_code: Önce search/retrieve çalıştırın veya path verin.';
                targetAbs = best.filePath;
                text = best.content;
            }
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

    private recordToolOutput(toolName: string, args: any, result: string) : void {
        try {
            const firstLine = String(result || '').split(/\r?\n/)[0] || '';
            const argHint = (() => {
                if (!args) return '';
                if (typeof args.path === 'string') return ` (${args.path})`;
                if (typeof args.query === 'string') return ` (${args.query})`;
                if (Array.isArray(args.files) && args.files.length > 0) return ` (${args.files[0]})`;
                return '';
            })();
            const summary = (firstLine + '').trim().slice(0, 200);
            this.lastToolOutputs.push({ tool: toolName + argHint, summary });
            // son 8 çıktı ile sınırla
            if (this.lastToolOutputs.length > 8) {
                this.lastToolOutputs = this.lastToolOutputs.slice(-8);
            }
        } catch { /* ignore */ }
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


