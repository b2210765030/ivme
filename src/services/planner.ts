/* ==========================================================================
   DOSYA: src/services/planner.ts (YENİ)

   AMAÇ:
   - Planner Agent için zenginleştirilmiş "Mimari Rapor" üretir
   - Kullanıcı sorgusuna göre ilgili dosyaları bağlama ekler (özet + tam içerik)
   - Planner prompt'unu oluşturur ve LLM'den plan JSON'u alır
   - Gelen planı ayrıştırır ve şemaya göre doğrular
   ==========================================================================
*/

import * as vscode from 'vscode';
import * as path from 'path';
import { ApiServiceManager } from './manager';
import { cleanLLMJsonBlock } from '../core/utils';
import { EXTENSION_ID, SETTINGS_KEYS } from '../core/constants';
import * as systemPrompts from '../system_prompts';

type PlannerIndex = Record<string, string>;

export type PlannerToolCall = {
	tool: string; // Built-in veya custom araç adı
	args: any; // Gelecekte ayrıntılı argüman tipleri eklenebilir (ör. { keywords: string[] } | { query: string } | ...)
};

export type PlannerPlanStep = {
	step: number;
	action: string;
	thought: string;
	/** UI'da gösterilecek kısa, tek cümlelik açıklama (opsiyonel) */
	ui_text?: string;
	/** Tek adımlı aracı çağrısı (atomik adımlar için önerilir) */
	tool?: string;
	args?: PlannerToolCall['args'];
	/** Gerekirse bir adımda birden çok aracı çağrısı */
	tool_calls?: PlannerToolCall[];
	// Opsiyonel alanlar (LLM ekleyebilir)
	files_to_edit?: string[];
	notes?: string;
};

export type PlannerPlan = {
	steps: PlannerPlanStep[];
};

/**
 * Planner argümanlarını temizler; kod içeren alanları kaldırır veya spec alanlarına taşır.
 */
function sanitizePlannerArgs(tool: string | undefined, argsRaw: any): any | undefined {
    if (!argsRaw || typeof argsRaw !== 'object') return argsRaw;
    const args = { ...argsRaw };
    const stripCode = (v: any) => typeof v === 'string' ? v.replace(/```[\s\S]*?```/g, '').trim() : v;
    const looksCodeLike = (text: string): boolean => {
        const t = text.trim();
        if (t.includes('\n') && (t.includes('{') || t.includes('}') || t.includes(';'))) return true;
        if (/\b(function|class|interface|def|import|package|public|private|return)\b/.test(t)) return true;
        return false;
    };

    // Her araç için kod içerebilecek alanları sterilize et
    if (tool === 'create_file') {
        if (typeof args.content === 'string') {
            // content -> content_spec (kod yerine gereksinim)
            const cleaned = stripCode(args.content);
            args.content_spec = typeof cleaned === 'string' && !looksCodeLike(cleaned) ? cleaned : undefined;
            delete args.content;
        }
    }
    if (tool === 'edit_file') {
        if (typeof args.snippet === 'string') {
            // snippet -> change_spec
            const cleaned = stripCode(args.snippet);
            args.change_spec = typeof cleaned === 'string' && !looksCodeLike(cleaned) ? cleaned : undefined;
            delete args.snippet;
        }
        if (typeof args.replace === 'string') {
            const cleaned = stripCode(args.replace);
            args.change_spec = typeof cleaned === 'string' && !looksCodeLike(cleaned) ? cleaned : undefined;
            delete args.replace;
        }
        if (typeof args.find === 'string') {
            const cleaned = stripCode(args.find);
            args.find_spec = typeof cleaned === 'string' && !looksCodeLike(cleaned) ? cleaned : undefined;
            delete args.find;
        }
    }
    if (tool === 'append_file') {
        if (typeof args.content === 'string') {
            const cleaned = stripCode(args.content);
            args.content_spec = typeof cleaned === 'string' && !looksCodeLike(cleaned) ? cleaned : undefined;
            delete args.content;
        }
    }
    if (tool === 'search' || tool === 'retrieve_chunks') {
        if (typeof args.query === 'string') {
            args.query = stripCode(args.query);
        }
        if (Array.isArray(args.keywords)) {
            args.keywords = args.keywords.map((k: any) => stripCode(k)).filter((k: any) => typeof k === 'string' && k.length > 0);
        }
    }

    return args;
}

function sanitizeToolName(tool: any): string | undefined {
    // Plan aşamasında hem built-in hem custom araç adlarını destekle.
    // Geçerli bir string ise olduğu gibi kabul et; boş veya geçersizse undefined döndür.
    if (typeof tool === 'string' && tool.trim().length > 0) return tool.trim();
    return undefined;
}

/**
 * planner_index.json dosyasını yükler.
 */
async function readPlannerIndex(context: vscode.ExtensionContext): Promise<PlannerIndex | null> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) return null;

	const file = vscode.Uri.joinPath(workspaceFolder.uri, '.ivme', 'planner_index.json');
	try {
		const bytes = await vscode.workspace.fs.readFile(file);
		const text = Buffer.from(bytes).toString('utf8');
		const parsed = JSON.parse(text) as PlannerIndex;
		return parsed;
	} catch {
		return null;
	}
}

function fileExistsInPlannerIndex(index: PlannerIndex, workspaceRoot: string, relativeOrName: string): { exists: boolean; matchedPath?: string } {
    const norm = (s: string) => s.replace(/\\/g, '/').toLowerCase();
    const nc = norm(relativeOrName);
    for (const key of Object.keys(index)) {
        const nk = norm(key);
        if (!nk.startsWith(norm(workspaceRoot))) continue;
        if (nk.endsWith(nc)) return { exists: true, matchedPath: key };
    }
    return { exists: false };
}

/** Dosya uzantısından markdown dil etiketi tahmini. */
function languageFromFile(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	switch (ext) {
		case '.ts': return 'typescript';
		case '.tsx': return 'tsx';
		case '.js': return 'javascript';
		case '.jsx': return 'jsx';
		case '.json': return 'json';
		case '.css': return 'css';
		case '.html': return 'html';
		case '.md': return 'markdown';
		case '.py': return 'python';
		case '.go': return 'go';
		case '.java': return 'java';
		case '.yml':
		case '.yaml': return 'yaml';
		default: return '';
	}
}

/**
 * Kullanıcı sorgusundan dosya adı/yolu adaylarını kaba regex ile çıkarır.
 * Ör: src/services/userService.ts, userService.ts, "utils.ts"
 */
function extractMentionedFileCandidates(userQuery: string): string[] {
	const results = new Set<string>();
	const patterns = [
		/[`'"]([\w./\\-]+\.[A-Za-z0-9]+)[`'"]/g, // tırnak içi dosya
		/\b([\w./\\-]+\.(?:ts|tsx|js|jsx|json|md|css|html|yml|yaml|py|go|java))\b/g // çıplak dosya
	];
	for (const re of patterns) {
		for (const m of userQuery.matchAll(re)) {
			const cand = (m[1] || '').trim();
			if (cand) results.add(cand);
		}
	}
	return Array.from(results);
}

/**
 * Index anahtarları (mutemelen mutlak yollar) üzerinden, kullanıcı sorgusundaki adaylarla eşleşen dosyaları bulur.
 * Eşleşme stratejisi: indexKey, candidate ile biterse (Windows büyük/küçük harf normalizasyonu uygulanır).
 */
function matchIndexFiles(index: PlannerIndex, candidates: string[], rootFsPath: string): string[] {
	if (candidates.length === 0) return [];
	const norm = (s: string) => s.replace(/\\/g, '/').toLowerCase();
	const indexKeys = Object.keys(index);
	const results = new Set<string>();
	for (const cand of candidates) {
		const nc = norm(cand);
		for (const key of indexKeys) {
			const nk = norm(key);
			// Sadece workspace içindeki yolları dikkate al
			if (!nk.startsWith(norm(rootFsPath))) continue;
			if (nk.endsWith(nc)) {
				results.add(key);
			}
		}
	}
	return Array.from(results);
}

async function statPath(fsPath: string): Promise<vscode.FileType | null> {
	try {
		const st = await vscode.workspace.fs.stat(vscode.Uri.file(fsPath));
		return st.type;
	} catch {
		return null;
	}
}

async function readFileContent(fsPath: string): Promise<string | null> {
	try {
		const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(fsPath));
		return Buffer.from(bytes).toString('utf8');
	} catch {
		return null;
	}
}

/**
 * Planner için zenginleştirilmiş mimari raporu üretir.
 */
export async function build_planner_context(
	context: vscode.ExtensionContext,
	userQuery: string,
	recentSummaryMemory?: string,
	previousPlanJson?: string,
	completedStepIndices?: number[]
): Promise<string> {
	// Sadece indeksleme aktifken çalış
	const config = vscode.workspace.getConfiguration(EXTENSION_ID);
	const indexingEnabled = config.get<boolean>(SETTINGS_KEYS.indexingEnabled, false);
	if (!indexingEnabled) {
		return '# Project Architectural Overview\n\nPlanner yalnızca indeksleme aktifken çalışır. Lütfen Index düğmesini etkinleştirin.';
	}

	const index = await readPlannerIndex(context);
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder || !index) {
		return '# Project Architectural Overview\n\nPlanner index bulunamadı. Lütfen önce proje indekslemesi yapınız.';
	}

	const rootPath = workspaceFolder.uri.fsPath;
	const rootSummary = index[rootPath] || 'Genel özet bulunamadı.';

	// Kök altındaki birinci seviye dizinler ve özetleri
	const dirSummaries: Array<{ rel: string; summary: string }> = [];
	for (const [absPath, summary] of Object.entries(index)) {
		if (!absPath || absPath === rootPath) continue;
		if (path.dirname(absPath) !== rootPath) continue; // sadece üst seviye
		const t = await statPath(absPath);
		if (t === vscode.FileType.Directory) {
			const rel = path.relative(rootPath, absPath);
			dirSummaries.push({ rel: rel.replace(/\\/g, '/'), summary });
		}
	}

	// Kullanıcı sorgusundan dosya adaylarını çıkar ve index ile eşleştir
	const fileCandidates = extractMentionedFileCandidates(userQuery);
	const matchedFiles = matchIndexFiles(index, fileCandidates, rootPath);
	const missingFiles = fileCandidates.filter(c => {
		const norm = (s: string) => s.replace(/\\/g, '/').toLowerCase();
		const nc = norm(c);
		return !Object.keys(index).some(k => {
			const nk = norm(k);
			return nk.startsWith(norm(rootPath)) && nk.endsWith(nc);
		});
	});

	const detailedSections: string[] = [];
	for (const absFile of matchedFiles) {
		const kind = await statPath(absFile);
		if (kind !== vscode.FileType.File) continue;
		const rel = path.relative(rootPath, absFile).replace(/\\/g, '/');
		const language = languageFromFile(absFile);
		const fileSummary = index[absFile] || '';
		const content = await readFileContent(absFile);
		if (content) {
			const section = [
				`## File Content: \`${rel}\``,
				fileSummary ? `Summary: ${fileSummary}` : '',
				'The user has specifically mentioned this file. Here is its full content:',
				'```' + language,
				content,
				'```'
			].filter(Boolean).join('\n');
			detailedSections.push(section);
		}
	}

	const lines: string[] = [];
	lines.push('# Project Architectural Overview');
	lines.push('');
	lines.push('## Project Summary');
	lines.push(`- ${rootSummary}`);
	lines.push('');
	// Inject recent planner summary memory for continuity
	if (typeof recentSummaryMemory === 'string' && recentSummaryMemory.trim().length > 0) {
		lines.push('## Recent Planner Summary (Memory)');
		lines.push(recentSummaryMemory.trim());
		lines.push('');
	}

	// Include previous plan JSON for revision/merge if provided
	if (typeof previousPlanJson === 'string' && previousPlanJson.trim().length > 0) {
		lines.push('## Previous Plan (for revision)');
		const maxLen = 6000;
		const truncated = previousPlanJson.length > maxLen ? (previousPlanJson.slice(0, maxLen) + '\n/* ... truncated ... */') : previousPlanJson;
		lines.push('```json');
		lines.push(truncated);
		lines.push('```');
		lines.push('');
	}

	// List completed step indices to preserve
	if (Array.isArray(completedStepIndices) && completedStepIndices.length > 0) {
		lines.push('## Completed Plan Steps');
		lines.push('- Already executed step indices (1-based): ' + completedStepIndices.sort((a,b)=>a-b).join(', '));
		lines.push('');
	}
	lines.push('## Key Directories and Their Responsibilities');
	if (dirSummaries.length === 0) {
		lines.push('- (No top-level directories summarized)');
	} else {
		for (const d of dirSummaries) {
			lines.push(`- **/${d.rel}**: ${d.summary}`);
		}
	}
	lines.push('');
	lines.push('---');
	lines.push('# Detailed Context for Current Request');
	lines.push('');
	if (detailedSections.length > 0) {
		lines.push(detailedSections.join('\n\n'));
	} else {
		lines.push('No specific files were detected in the user request.');
	}

	// Ek: Index İpuçları — Planlayıcı için dosya mevcudiyeti sinyali
	lines.push('');
	lines.push('---');
	lines.push('## Index Hints');
	if (fileCandidates.length > 0) {
		lines.push(`Requested files mentioned by the user: ${fileCandidates.map(f => '`' + f + '`').join(', ')}`);
	}
	if (matchedFiles.length > 0) {
		lines.push(`Existing requested files in the index: ${matchedFiles.map(f => '`' + path.relative(rootPath, f).replace(/\\\\/g, '/').replace(/\\/g, '/') + '`').join(', ')}`);
	}
	if (missingFiles.length > 0) {
		lines.push(`Missing requested files (DO NOT search/retrieve for these; create them first): ${missingFiles.map(f => '`' + f + '`').join(', ')}`);
	} else {
		lines.push('No missing requested files detected.');
	}

	return lines.join('\n');
}

/** Planner prompt şablonu: Mimari rapor ve kullanıcı isteğini içerir. */
// createPlannerPrompt removed from this file; use `systemPrompts.createPlannerPrompt(plannerContext, userQuery)`
// which selects the prompt from `src/system_prompts/en.ts` or `src/system_prompts/tr.ts` based on the current language.

/** Model yanıtını ayrıştırır ve temel şemaya göre doğrular. */
export function parse_and_validate_plan(rawResponse: string): PlannerPlan {
	const jsonText = cleanLLMJsonBlock(rawResponse);
	let parsed: any;
	try {
		parsed = JSON.parse(jsonText);
	} catch (e) {
		throw new Error('Planner yanıtı geçerli JSON değil.');
	}

	if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.steps)) {
		throw new Error('Planner planı beklenen şemaya uymuyor: "steps" dizisi eksik.');
	}

	const steps: PlannerPlanStep[] = [];
	for (const [idx, s] of parsed.steps.entries()) {
		if (!s || typeof s !== 'object') {
			throw new Error(`Plan adımı ${idx} geçersiz.`);
		}
		if (typeof s.step !== 'number' || typeof s.action !== 'string' || typeof s.thought !== 'string') {
			throw new Error(`Plan adımı ${idx} zorunlu alanları içermiyor (step:number, action:string, thought:string).`);
		}
		const uiText = typeof s.ui_text === 'string' ? s.ui_text : undefined;
		const tool = sanitizeToolName(s.tool);
		const argsRaw = s.args && typeof s.args === 'object' ? s.args : undefined;
		const args = sanitizePlannerArgs(tool, argsRaw);
		let tool_calls: PlannerToolCall[] | undefined;
		if (Array.isArray(s.tool_calls)) {
			tool_calls = s.tool_calls
				.map((c: any) => {
					const t = sanitizeToolName(c?.tool);
					if (!t) return null;
					return { tool: t, args: sanitizePlannerArgs(t, c.args) } as PlannerToolCall;
				})
				.filter((c: PlannerToolCall | null): c is PlannerToolCall => !!c);
		}
		steps.push({ step: s.step, action: s.action, thought: s.thought, ui_text: uiText, tool, args, tool_calls, files_to_edit: s.files_to_edit, notes: s.notes });
	}

	return { steps };
}

/** Uçtan uca: Bağlamı inşa eder, prompt'u kurar, LLM'i çağırır ve planı döndürür. */
export async function run_planner(
	context: vscode.ExtensionContext,
	api: ApiServiceManager,
	userQuery: string,
	onUiEmit?: (stepNo: number | undefined, uiText: string, isFinal?: boolean) => Promise<void> | void,
	cancellationSignal?: AbortSignal,
	recentSummaryMemory?: string,
	previousPlanJson?: string,
	completedStepIndices?: number[]
): Promise<PlannerPlan> {
	// GEÇİCİ: Planner her zaman çalışsın (indeksleme açık olmasa da). Bağlam üretimi indeks yoksa temel içerik döndürür.
	const plannerContext = await build_planner_context(context, userQuery, recentSummaryMemory, previousPlanJson, completedStepIndices);
	
	// Load tools from tools.json
	const { getToolsManager } = await import('./tools_manager.js');
	const toolsManager = getToolsManager();
	const allTools = toolsManager.getAllTools();
	
	const systemPrompt = await systemPrompts.createPlannerSystemPrompt(plannerContext, userQuery, allTools);
	console.log('[Planner] System prompt sent to LLM (truncated to 2000 chars):', systemPrompt.slice(0, 2000));

	if (typeof onUiEmit === 'function') {
		const messages = [
			{ role: 'system' as const, content: systemPrompt },
			{ role: 'user' as const, content: await systemPrompts.createPlannerPrompt(plannerContext, userQuery, allTools) }
		];
		let buffer = '';
		let fullRaw = '';
		const emittedOffsets = new Set<number>();
		const reUi = /\"ui_text\"\s*:\s*\"((?:\\\\.|[^\"\\\\])*)\"/g;

		const onChunk = (chunk: string) => {
			if ((cancellationSignal as any)?.aborted) return;
			buffer += chunk;
			fullRaw += chunk;

			let m: RegExpExecArray | null;
			while ((m = reUi.exec(buffer)) !== null) {
				const idx = m.index;
				if (emittedOffsets.has(idx)) continue;
				emittedOffsets.add(idx);
				const before = buffer.slice(Math.max(0, idx - 200), idx + m[0].length);
				const stepMatch = /\"step\"\s*:\s*(\d+)/.exec(before);
				const stepNo = stepMatch ? Number(stepMatch[1]) : undefined;
				const rawUi = m[1].replace(/\\\\\"/g, '"').replace(/\\\\\\/g, '\\');
				try { onUiEmit(stepNo, rawUi, true); } catch (e) { console.warn('[Planner] onUiEmit error', e); }
			}
			if (buffer.length > 20000) buffer = buffer.slice(-10000);
		};

		await api.generateChatContent(messages, onChunk, cancellationSignal as any);
		console.log('[Planner] Raw response from LLM (truncated to 2000 chars):', String(fullRaw).slice(0, 2000));
		return parse_and_validate_plan(fullRaw);
	}

	// Non-streaming: prefer chat-style system prompt
	const chatMessages = [
		{ role: 'system' as const, content: systemPrompt },
		{ role: 'user' as const, content: await systemPrompts.createPlannerPrompt(plannerContext, userQuery, allTools) }
	];
	let raw = '';
	try {
		await api.generateChatContent(chatMessages, (chunk) => { raw += chunk; }, undefined as any);
	} catch (e) {
		// fallback to text completion
		raw = await api.generateContent(systemPrompt);
	}
	console.log('[Planner] Raw response from LLM (truncated to 2000 chars):', String(raw).slice(0, 2000));
	return parse_and_validate_plan(raw);
}


