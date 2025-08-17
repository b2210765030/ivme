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

type PlannerIndex = Record<string, string>;

export type PlannerPlanStep = {
	step: number;
	action: string;
	thought: string;
	/** UI'da gösterilecek kısa, tek cümlelik açıklama (opsiyonel) */
	ui_text?: string;
	// Opsiyonel alanlar (LLM ekleyebilir)
	files_to_edit?: string[];
	notes?: string;
};

export type PlannerPlan = {
	steps: PlannerPlanStep[];
};

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
export async function build_planner_context(context: vscode.ExtensionContext, userQuery: string): Promise<string> {
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

	return lines.join('\n');
}

/** Planner prompt şablonu: Mimari rapor ve kullanıcı isteğini içerir. */
export function createPlannerPrompt(plannerContext: string, userQuery: string): string {
	return (
		`# ROLE & GOAL\n` +
		`You are a 10x Principal Software Architect. Design the most optimal, feasible implementation plan that addresses the user's request while aligning with the project's architecture.\n\n` +
		`# CONTEXT\n` +
		`Here is the architectural overview of the project, plus any specific file content relevant to the user's request:\n` +
		`---\n` +
		`${plannerContext}\n` +
		`---\n\n` +
		`# USER REQUEST\n` +
		`"${userQuery}"\n\n` +
		`# INSTRUCTIONS\n` +
		`- Think step-by-step and produce a short sequence of concrete steps the agent will perform.\n` +
		`- For each step:\n` +
		`  * Set "step" to a consecutive integer.\n` +
		`  * Set "action" to a concise short label written from the agent's perspective (use first-person phrasing like "Create merge_sort.py" or preferably "I will create merge_sort.py"). Do NOT phrase actions as instructions the user must perform.\n` +
		`  * Set "thought" to a first-person plan describing exactly what the agent will do next (use future or present-continuous tense). Examples: "I will create a new file named merge_sort.py.", "I will implement the merge sort function in merge_sort.py and add unit tests.", "I will run the test suite to verify correctness."\n` +
		`  * Include a short Turkish one-sentence summary in ".ui_text" also written from the agent's perspective (e.g. "Yeni dosya oluşturacağım: merge_sort.py").\n` +
		`  * Do not include any instruction phrased to the user (avoid "Create a file", "Implement the function" directed at the user).\n` +
		`  * Do not output any plain-language summary, headings, bullet lists, or prose outside the JSON. The entire response MUST be a single valid JSON object that follows the schema below. If you want to include a short human-readable note, place it in the "notes" field of an appropriate step.\n` +
		`- Prefer minimal, safe edits to existing files; only create new files if necessary.\n` +
		`- Keep each step small and actionable so the agent can execute them one-by-one.\n` +
		`- Output strictly valid JSON following the schema below. Do not include any prose outside the JSON.\n\n` +
		`# JSON OUTPUT SCHEMA\n` +
		`{\n` +
		`  "steps": [\n` +
		`    { "step": <number>, "action": <string>, "thought": <string>, "ui_text": <string|optional>, "files_to_edit": <string[]|optional>, "notes": <string|optional> }\n` +
		`  ]\n` +
		`}`
	);
}

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
		steps.push({ step: s.step, action: s.action, thought: s.thought, ui_text: uiText, files_to_edit: s.files_to_edit, notes: s.notes });
	}

	return { steps };
}

/** Uçtan uca: Bağlamı inşa eder, prompt'u kurar, LLM'i çağırır ve planı döndürür. */
export async function run_planner(
	context: vscode.ExtensionContext,
	api: ApiServiceManager,
	userQuery: string,
	onUiEmit?: (stepNo: number | undefined, uiText: string, isFinal?: boolean) => Promise<void> | void,
	cancellationSignal?: AbortSignal
): Promise<PlannerPlan> {
	// GEÇİCİ: Planner her zaman çalışsın (indeksleme açık olmasa da). Bağlam üretimi indeks yoksa temel içerik döndürür.
	const plannerContext = await build_planner_context(context, userQuery);
	const prompt = createPlannerPrompt(plannerContext, userQuery);
	console.log('[Planner] Prompt sent to LLM (truncated to 2000 chars):', prompt.slice(0, 2000));

	if (typeof onUiEmit === 'function') {
		const messages = [{ role: 'user' as const, content: prompt }];
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

	const raw = await api.generateContent(prompt);
	console.log('[Planner] Raw response from LLM (truncated to 2000 chars):', String(raw).slice(0, 2000));
	return parse_and_validate_plan(raw);
}


