/* ==========================================================================
   DOSYA: src/features/Handlers/Interaction.ts (GÜNCELLENMİŞ)
   
   SORUMLULUK: Kullanıcı etkileşimlerini yönetir.
   YENİ GÜNCELLEME: Talimat oluşturma mantığı `promptBuilder`'a taşındı.
   ========================================================================== */

import * as vscode from 'vscode';
import axios from 'axios';
import { ApiServiceManager } from '../../services/manager';
import { ConversationManager } from '../manager/conversation';
import { ContextManager } from '../manager/context';
import { ChatMessage } from '../../types/index';
import { EXTENSION_ID, SETTINGS_KEYS } from '../../core/constants';
import { createContextualPrompt } from '../../system_prompts';
import { build_context_for_query } from '../../services/orchestrator';
import { run_planner, PlannerPlan } from '../../services/planner';
import { PlannerExecutor } from '../../services/executor';
import { getToolsDescriptions } from '../../system_prompts/tool';
export class InteractionHandler {
    private currentRequestController: AbortController | null = null;
    private lastPlannerPlan: PlannerPlan | null = null;
    private executor: PlannerExecutor = new PlannerExecutor();
    private executedStepLogs: Array<{ label: string; elapsedMs: number; error?: string }> = [];
    private executedStepIndices: Set<number> = new Set();
    private isBatchRun: boolean = false;
    private didEmitSummaryNote: boolean = false;

    constructor(
        private conversationManager: ConversationManager,
        private apiManager: ApiServiceManager,
        private webview: vscode.Webview,
        private contextManager: ContextManager,
        private context: vscode.ExtensionContext
    ) {}

    public cancelStream() {
        if (this.currentRequestController) {
            this.currentRequestController.abort();
            this.currentRequestController = null;
            console.log('Stream cancelled by user.');
        }
    }

    public async handle(instruction: string) {
        if (this.currentRequestController) {
            this.cancelStream();
        }
        
        this.conversationManager.addMessage('user', instruction);
        console.log('[Planner] User instruction:', instruction);
        // Koşullu: Sadece Agent Modu aktif VE indeksleme (index butonu) açıkken planner akışı çalışsın
        try {
            this.currentRequestController = new AbortController();
            const cancellationSignal = this.currentRequestController.signal;

            const config = vscode.workspace.getConfiguration(EXTENSION_ID);
            const isAgentActive = config.get<boolean>(SETTINGS_KEYS.agentModeActive, false);
            const isIndexEnabled = config.get<boolean>(SETTINGS_KEYS.indexingEnabled, false);

            // Fallback: bazen UI state ile ayarlar arasındaki senkronizasyon gecikebilir.
            // Eğer agentMode aktif olarak kaydedilmemişse ama contextManager üzerinde
            // agent dosya/selection bağlamı varsa planner yolunu yine çalıştır.
            const agentContextPresent = !!(this.contextManager.agentFileContext || this.contextManager.agentSelectionContext);
            const shouldUsePlanner = (isAgentActive || agentContextPresent) && isIndexEnabled;

            console.log('[Interaction] Planner decision:', { isAgentActive, agentContextPresent, isIndexEnabled, shouldUsePlanner });

            if (shouldUsePlanner) {
                // Streaming: ui_text parçalarını anında UI'a ilet
                // Planner'ı hafızadaki son özetle zenginleştir
                const latestSummary = this.conversationManager.getPlannerSummaryMemory?.();
                const plan = await run_planner(
                    this.conversationManager.getExtensionContext(),
                    this.apiManager,
                    instruction,
                    (stepNo, uiText, isFinal) => {
                        // Tipografik/daktilo efekti için parça olarak gönderme yerine UI tarafında efekt verilecek
                        this.webview.postMessage({ type: 'plannerUiChunk', payload: { stepNo, uiText, isFinal } });
                    },
                    cancellationSignal as any,
                    latestSummary
                );
                // Plan tamamlandığında nihai sonucu da gönder
                try {
                    const { getToolsManager } = await import('../../services/tools_manager.js');
                    const tm = getToolsManager();
                    // İlk planlamada .ivme/tools.json dosyası henüz oluşmamış olabilir. Emin olmak için initialize çağır.
                    try { await tm['ensureIvmeDirectory']?.(); } catch {}
                    try { await (tm as any).initializeBuiltinTools?.(); } catch {}
                    const names = tm.getToolNames();
                    this.webview.postMessage({ type: 'plannerResult', payload: { plan, toolNames: names } });
                } catch {
                    this.webview.postMessage({ type: 'plannerResult', payload: { plan } });
                }
                // Planı hafızada tut
                this.lastPlannerPlan = plan;
                // Yeni plan için yürütülen adım izlerini sıfırla
                this.executedStepIndices = new Set();
                this.executedStepLogs = [];
                this.didEmitSummaryNote = false;
                this.currentRequestController = null;

                // Plan finalize edildikten sonra, aynı placeholder altında açıklamayı stream et
                setTimeout(() => {
                    this.streamPlanExplanationInline(plan).catch(err => console.error('[Interaction] Plan explanation error:', err));
                }, 50);
            } else {
                // Standart sohbet akışına geri dön
                await this.streamStandardChat();
                return;
            }
        } catch (e) {
            console.error('[Interaction] Planner çalıştırılırken hata oluştu:', e);
            // Hata durumunda kullanıcıya bilgi ver
            const errorMessage = e instanceof Error ? e.message : 'Planner çalıştırılırken hata oluştu.';
            this.webview.postMessage({ type: 'addResponse', payload: `**Hata:** ${errorMessage}` });
            this.webview.postMessage({ type: 'streamEnd' });
        }
    }

    /**
     * Planner planındaki tek bir adımı uygular (tool kullanarak). Kod üretimi bu aşamada yapılır.
     */
    public async executePlannerStep(stepIndex: number): Promise<{ label: string; elapsedMs: number; error?: string } | null> {
        if (this.lastPlannerPlan == null) {
            vscode.window.showWarningMessage('Önce bir plan oluşturulmalı.');
            return null;
        }
        if (typeof stepIndex !== 'number' || stepIndex < 0 || stepIndex >= this.lastPlannerPlan.steps.length) {
            vscode.window.showErrorMessage('Geçersiz adım index.');
            return null;
        }
        const ctx = this.conversationManager.getExtensionContext();
        const step = this.lastPlannerPlan.steps[stepIndex];
        const label = this.formatStepLabel(step);
        const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        // UI placeholder: başlat
        this.webview.postMessage({ type: 'stepExecStart', payload: { index: stepIndex, label } });
        try {
            // 1) Tool seçimi + args çıkarımı (LLM)
            const stepJson = JSON.stringify(step, null, 2);
            // Önceki araç çıktılarını tool seçiminde bağlama ekle
            const ctxSnap = this.executor.getContextSnapshot?.();
            const ctxText = ctxSnap ? [
                'Önceki araç bağlamı (özet):',
                ctxSnap.retrievedSummary ? ('Retrieved files (top):\n' + ctxSnap.retrievedSummary) : '',
                ctxSnap.locationsSummary ? ('Saved locations:\n' + ctxSnap.locationsSummary) : '',
                ctxSnap.toolOutputsSummary ? ('Recent tool outputs:\n' + ctxSnap.toolOutputsSummary) : ''
            ].filter(Boolean).join('\n') : '';
            // Get all tools from tools manager
            const { getToolsManager } = await import('../../services/tools_manager.js');
            const toolsManager = getToolsManager();
            let allToolNames = toolsManager.getToolNames();
            if (!Array.isArray(allToolNames) || allToolNames.length === 0) {
                try { await (toolsManager as any).initializeBuiltinTools?.(); } catch {}
                allToolNames = toolsManager.getToolNames();
            }
            
            // Eğer adımda önceden UI üzerinden bir araç seçildiyse, seçimde sadece onu geçerli kıl (ikinci aşama yine denetler)
            const preselected = (typeof step?.tool === 'string' && step.tool.trim().length > 0) ? step.tool.trim() : '';
            const isAuto = preselected.toLowerCase() === 'auto';
            const validTools = (!preselected || isAuto) ? allToolNames : [preselected];
            let system: string;
            let user: string;
            if (preselected && !isAuto) {
                // Args-only prompt for a preselected single tool
                const toolObj = toolsManager.getToolByName(preselected);
                const schemaJson = toolObj?.schema ? JSON.stringify(toolObj.schema, null, 2) : '{}';
                const toolDesc = toolObj?.description || '';
                system = [
                    'Aşağıdaki plan adımı için SEÇİLİ TEK aracın argümanlarını çıkar.',
                    'Başka araç seçme; sadece bu aracı kullan.',
                    'ÇIKTI FORMAT ZORUNLU: Yalnızca tek satır ve SADE JSON objesi döndür: {"args":{...}}',
                    'BAŞKA ANAHTAR EKLEME: tool, step, action, thought, ui_text, tool_input, parameters, params, arguments gibi anahtarları YAZMA.',
                    'TÜM string değerleri TEK SATIR olmalı; kod bloğu/backtick kullanma; \n dahil kaçış karakterleri kullanma.',
                    'Markdown, açıklama, kod bloğu, ön/arka metin YAZMA.'
                ].join(' ');
                user = [
                    `Seçilen Araç: ${preselected}`,
                    toolDesc ? (`Açıklama: ${toolDesc}`) : '',
                    'Araç Şeması (JSON):',
                    '```json',
                    schemaJson,
                    '```',
                    '',
                    ctxText || '',
                    'Plan Adımı (JSON):',
                    '```json',
                    stepJson,
                    '```'
                ].filter(Boolean).join('\n');
            } else {
                // Auto mode: tool + args
                system = [
                    'Aşağıdaki plan adımı için UYGUN TEK aracı ve argümanlarını çıkar.',
                    'Sadece geçerli araçlardan birini kullan (aşağıda listelenen).',
                    'ÇIKTI FORMAT ZORUNLU: Yalnızca tek satır ve SADE JSON objesi döndür: {"tool":"...","args":{...}}',
                    'BAŞKA ANAHTAR EKLEME: step, action, thought, ui_text, tool_input, parameters, params, arguments, input gibi anahtarları YAZMA.',
                    'TÜM string değerleri TEK SATIR olmalı; kod bloğu/backtick kullanma; \n dahil kaçış karakterleri kullanma.',
                    'Markdown, açıklama, kod bloğu, ön/arka metin YAZMA.',
                    'Örnek: {"tool":"edit_file","args":{"path":"merge.py","change_spec":"...","find_spec":"..."}}',
                    `Geçerli araç isimleri: ${validTools.join(', ')}`
                ].join(' ');
                const toolsListText = await getToolsDescriptions('tr');
                user = [
                    'Araç Listesi (TR):',
                    toolsListText,
                    '',
                    ctxText || '',
                    'Araç ön-seçimi: AUTO',
                    'Plan Adımı (JSON):',
                    '```json',
                    stepJson,
                    '```'
                ].join('\n');
            }
            // Debug: giden promptu ve adım bilgisini logla
            console.log('[ToolSelect] stepIndex=', stepIndex, 'label=', label);
            console.log('[ToolSelect] system prompt:\n' + system);
            console.log('[ToolSelect] user prompt:\n' + user);
            let raw = '';
            await this.apiManager.generateChatContent([
                { role: 'system' as const, content: system },
                { role: 'user' as const, content: user }
            ], (chunk) => { raw += chunk; }, undefined as any);
            console.log('[ToolSelect] raw response:\n' + raw);
            let selection: { tool: string; args?: any } | null = null;
            try {
                selection = preselected && !isAuto ? this.parseArgsOnlySelection(raw, preselected) : this.parseToolSelection(raw);
            } catch (e) {
                console.warn('[ToolSelect] parse error:', e);
            }
            if (!selection || typeof selection.tool !== 'string') {
                // Fallback: Eğer ön-seçim tek araca sabitlenmişse onu kullan; aksi halde heuristik seçimi dene
                if (preselected && !isAuto && validTools.length === 1) {
                    selection = { tool: preselected, args: {} };
                } else {
                    const heuristic = this.deriveToolFromStep(step, validTools);
                    if (heuristic) {
                        selection = heuristic;
                    } else {
                        throw new Error('Araç seçimi yapılamadı.');
                    }
                }
            }
            console.log('[ToolSelect] parsed selection (pre-normalize):', selection);
            // Normalize tool name to allowed set
            const normalized = this.normalizeToolName(selection.tool, validTools);
            if (!normalized) {
                throw new Error(`Geçersiz araç adı: ${selection.tool}`);
            }
            selection.tool = normalized;
            console.log('[ToolSelect] normalized selection:', selection);

            // Eksik args'ı adım metninden tamamlamaya çalış
            try {
                if (!selection.args || typeof selection.args !== 'object') selection.args = {};
                const inferredPath = this.inferFilePathFromStep(step);
                switch (selection.tool) {
                    case 'create_file': {
                        if (!selection.args.path && inferredPath) selection.args.path = inferredPath;
                        break;
                    }
                    case 'edit_file':
                    case 'append_file': {
                        if (!selection.args.path && inferredPath) selection.args.path = inferredPath;
                        break;
                    }
                    case 'check_index': {
                        if (!selection.args.files && inferredPath) selection.args.files = [inferredPath];
                        break;
                    }
                    default: break;
                }
            } catch {}
            // Seçimi plana uygula (runtime)
            (this.lastPlannerPlan.steps[stepIndex] as any).tool = selection.tool;
            (this.lastPlannerPlan.steps[stepIndex] as any).args = selection.args || {};

            // 2) Aracı çalıştır
            const result = await this.executor.executeStep(ctx, this.apiManager, this.lastPlannerPlan, stepIndex);
            const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const elapsedMs = Math.max(0, t1 - t0);
            this.webview.postMessage({ type: 'stepExecEnd', payload: { index: stepIndex, label, elapsedMs, result } });
            const log = { label, elapsedMs };
            this.executedStepLogs.push(log);
            this.executedStepIndices.add(stepIndex);
            // Eğer tüm adımlar (başarılı ya da hatalı) en az bir kez çalıştırıldıysa paneli tamamlandı olarak işaretle
            try {
                if (this.lastPlannerPlan && this.executedStepIndices.size >= this.lastPlannerPlan.steps.length) {
                    this.webview.postMessage({ type: 'plannerCompleted' });
                    if (!this.isBatchRun && !this.didEmitSummaryNote) {
                        this.didEmitSummaryNote = true;
                        await this.generateAndShowSummaryNote();
                    }
                }
            } catch (e) { /* ignore */ }
            return log;
        } catch (e: any) {
            const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const elapsedMs = Math.max(0, t1 - t0);
            this.webview.postMessage({ type: 'stepExecEnd', payload: { index: stepIndex, label, elapsedMs, error: e?.message || String(e) } });
            const log = { label, elapsedMs, error: e?.message || String(e) };
            this.executedStepLogs.push(log);
            this.executedStepIndices.add(stepIndex);
            try {
                if (this.lastPlannerPlan && this.executedStepIndices.size >= this.lastPlannerPlan.steps.length) {
                    this.webview.postMessage({ type: 'plannerCompleted' });
                    if (!this.isBatchRun && !this.didEmitSummaryNote) {
                        this.didEmitSummaryNote = true;
                        await this.generateAndShowSummaryNote();
                    }
                }
            } catch (e2) { /* ignore */ }
            return log;
        }
    }

    /**
     * LLM'den dönen aracı/argümanı JSON olarak ayrıştırmak için toleranslı parser.
     * ```json ... ``` bloklarını, düz metin öneklerini/son eklerini ve saf JSON dışı çıktıları temizlemeye çalışır.
     */
    private parseToolSelection(raw: string): { tool: string; args?: any } | null {
        if (!raw) return null;
        let text = String(raw).trim();
        // 1) Kod bloğu içeriğini yakala (```json or ```)
        const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
        if (fenceMatch && fenceMatch[1]) {
            text = fenceMatch[1].trim();
        }
        // 2) İlk { ile son } arasını al
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');
        if (first !== -1 && last !== -1 && last > first) {
            text = text.slice(first, last + 1);
        }
        // 3) JSON parse dene (toleranslı)
        let parsed: any;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            try {
                const sanitized = this.sanitizeToolSelectionJson(text);
                parsed = JSON.parse(sanitized);
            } catch {
                throw e;
            }
        }
        // Bazı modeller tek öğeli dizi döndürebilir
        if (Array.isArray(parsed) && parsed.length > 0) parsed = parsed[0];
        if (parsed && typeof parsed === 'object') {
            // Bazı modeller tool yerine action döndürebilir; args varsa kullan
            const tool = typeof parsed.tool === 'string' ? parsed.tool
                        : (typeof parsed.tool_name === 'string' ? parsed.tool_name
                        : (typeof parsed.action === 'string' ? parsed.action
                        : (parsed.function_call && typeof parsed.function_call.name === 'string' ? parsed.function_call.name
                        : (typeof parsed.name === 'string' ? parsed.name : undefined))));
            const args = (parsed.args && typeof parsed.args === 'object') ? parsed.args
                      : (parsed.tool_args && typeof parsed.tool_args === 'object') ? parsed.tool_args
                      : (parsed.tool_input && typeof parsed.tool_input === 'object') ? parsed.tool_input
                      : (parsed.arguments && typeof parsed.arguments === 'object') ? parsed.arguments
                      : (parsed.params && typeof parsed.params === 'object') ? parsed.params
                      : (parsed.parameters && typeof parsed.parameters === 'object') ? parsed.parameters
                      : (parsed.input && typeof parsed.input === 'object') ? parsed.input
                      : (parsed.function_call && typeof parsed.function_call.arguments === 'object') ? parsed.function_call.arguments
                      : undefined;
            if (tool) return { tool, args };
        }
        return null;
    }

    /** Args-only JSON parser: expects {"args":{...}} and injects the fixed tool name. */
    private parseArgsOnlySelection(raw: string, fixedTool: string): { tool: string; args?: any } | null {
        if (!raw) return { tool: fixedTool, args: {} };
        let text = String(raw).trim();
        const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
        if (fenceMatch && fenceMatch[1]) {
            text = fenceMatch[1].trim();
        }
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');
        if (first !== -1 && last !== -1 && last > first) {
            text = text.slice(first, last + 1);
        }
        try {
            const parsed = JSON.parse(text);
            const args = (parsed && typeof parsed === 'object' && typeof parsed.args === 'object') ? parsed.args : {};
            return { tool: fixedTool, args };
        } catch {
            // tolerate minor issues
            return { tool: fixedTool, args: {} };
        }
    }

    // LLM'den gelen "JSON gibi" çıktıyı onarmak için basit bir sanitizer.
    private sanitizeToolSelectionJson(input: string): string {
        try {
            let s = String(input);
            // 1) Triple backtick blokları tamamen kaldır (plan gereği kod istemiyoruz)
            s = s.replace(/```[\s\S]*?```/g, '');
            // 2) content_spec / change_spec / find_spec değerlerini tek satıra indir, backtick ve çift tırnakları kaçır
            const fixField = (field: string) => {
                const re = new RegExp(`("${field}"\\s*:\\s*")([\\s\\S]*?)("\n|"\r|"\t|"\s*[},])`, 'g');
                s = s.replace(re, (_m, p1, p2, p3) => {
                    const cleaned = String(p2).replace(/[\r\n]+/g, ' ').replace(/`+/g, '').replace(/\\"/g, '"').replace(/"/g, '\\"');
                    const tail = p3.startsWith('"') ? '"' + p3.slice(1) : '"' + p3; // ensure quote restored
                    return p1 + cleaned + tail;
                });
            };
            ['content_spec','change_spec','find_spec','query','path'].forEach(fixField);
            // 3) Genel: kontrol karakterlerini boşlukla değiştir
            s = s.replace(/[\u0000-\u001F]+/g, ' ');
            return s;
        } catch {
            return input;
        }
    }

    /** Gevşek adı verilen aracı kanonik ada dönüştürür; geçerli değilse null döndürür. */
    private normalizeToolName(name: string, knownTools: string[]): string | null {
        const n = String(name || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
        const map: Record<string, string> = {
            'check_index': 'check_index',
            'checkindex': 'check_index',
            'search': 'search',
            'locate_code': 'locate_code',
            'locatecode': 'locate_code',
            'retrieve_chunks': 'retrieve_chunks',
            'retrieve': 'retrieve_chunks',
            'create_file': 'create_file',
            'createfile': 'create_file',
            'edit_file': 'edit_file',
            'editfile': 'edit_file',
            'append_file': 'append_file',
            'appendfile': 'append_file'
        };
        return map[n] || (knownTools.includes(n) ? n : null);
    }

    /** Heuristik araç seçimi: UI metni/action üzerinden olası aracı çıkarır. */
    private deriveToolFromStep(step: PlannerPlan['steps'][number], validTools: string[]): { tool: string; args: any } | null {
        try {
            const text = [step?.ui_text, step?.action, step?.thought].filter(Boolean).join(' ').toLowerCase();
            const args: any = {};
            const setPath = () => {
                const p = this.inferFilePathFromStep(step);
                if (p) args.path = p;
            };
            const has = (name: string) => validTools.includes(name);
            if ((text.includes('oluştur') || text.includes('create')) && has('create_file')) {
                setPath();
                return { tool: 'create_file', args };
            }
            if ((text.includes('düzenle') || text.includes('edit')) && has('edit_file')) {
                setPath();
                return { tool: 'edit_file', args };
            }
            if ((text.includes('ekle') || text.includes('append')) && has('append_file')) {
                setPath();
                return { tool: 'append_file', args };
            }
            if ((text.includes('ara') || text.includes('search')) && has('search')) {
                return { tool: 'search', args: {} };
            }
            if ((text.includes('retrieve') || text.includes('getir')) && has('retrieve_chunks')) {
                return { tool: 'retrieve_chunks', args: {} };
            }
            if ((text.includes('konum') || text.includes('locate')) && has('locate_code')) {
                return { tool: 'locate_code', args: {} };
            }
            if ((text.includes('kontrol') || text.includes('check')) && has('check_index')) {
                const p = this.inferFilePathFromStep(step);
                return { tool: 'check_index', args: p ? { files: [p] } : {} };
            }
            return null;
        } catch {
            return null;
        }
    }

    /** step.ui_text ve step.thought içinden dosya adı/uzantı yakalamaya çalışır. */
    private inferFilePathFromStep(step: PlannerPlan['steps'][number]): string | undefined {
        try {
            const pool = [step?.ui_text, step?.thought, step?.action].filter(Boolean).join(' ');
            const m = pool.match(/([\w\-./]+\.[\w\d]+)/);
            if (m && m[1]) return m[1];
        } catch {}
        return undefined;
    }

    /** Tüm plan adımlarını sırayla uygular. */
    public async executePlannerAll(): Promise<void> {
        if (!this.lastPlannerPlan || !Array.isArray(this.lastPlannerPlan.steps)) return;
        this.executedStepLogs = [];
        this.isBatchRun = true;
        try {
            for (let i = 0; i < this.lastPlannerPlan.steps.length; i++) {
                await this.executePlannerStep(i);
            }
            await this.generateAndShowSummaryNote();
            this.didEmitSummaryNote = true;
            try {
                // UI: Plan panelini tamamlandı olarak işaretle
                this.webview.postMessage({ type: 'plannerCompleted' });
            } catch (e) { /* ignore */ }
        } finally {
            this.isBatchRun = false;
        }
    }

    /** Webview'den gelen düzenlenmiş step JSON'unu bellekteki son plan üzerinde günceller. */
    public async updatePlannerStep(stepIndex: number, newStep: any): Promise<void> {
        if (!this.lastPlannerPlan || !Array.isArray(this.lastPlannerPlan.steps)) return;
        if (typeof stepIndex !== 'number' || stepIndex < 0 || stepIndex >= this.lastPlannerPlan.steps.length) return;
        try {
            // Basit doğrulama: nesne mi?
            if (typeof newStep !== 'object' || newStep == null) throw new Error('Geçersiz adım verisi');
            this.lastPlannerPlan.steps[stepIndex] = newStep as any;
        } catch (e) {
            console.error('[Interaction] updatePlannerStep error:', e);
            throw e;
        }
    }

    /** Belirtilen konuma yeni bir adım ekler ve adım numaralarını yeniden düzenler. */
    public async insertPlannerStep(insertIndex: number, direction: string, newStep: any): Promise<void> {
        if (!this.lastPlannerPlan || !Array.isArray(this.lastPlannerPlan.steps)) {
            throw new Error('Geçerli bir plan bulunamadı');
        }
        
        try {
            // Basit doğrulama: nesne mi?
            if (typeof newStep !== 'object' || newStep == null) throw new Error('Geçersiz adım verisi');
            
            // Ekleme pozisyonunu belirle
            let targetIndex: number;
            if (direction === 'above') {
                targetIndex = Math.max(0, insertIndex);
            } else { // 'below' veya diğer
                targetIndex = Math.min(insertIndex + 1, this.lastPlannerPlan.steps.length);
            }
            
            // Yeni adımı uygun konuma ekle
            this.lastPlannerPlan.steps.splice(targetIndex, 0, newStep as any);
            
            // Tüm adım numaralarını yeniden düzenle
            this.renumberPlanSteps();
            
            // Execution tracking'i güncelle: ekleme noktasından sonraki tüm indeksleri kaydır
            this.updateExecutionTrackingAfterInsertion(targetIndex);
            
            // UI'ı güncelle - yeni planı webview'e gönder
            this.webview.postMessage({
                type: 'plannerStepInserted',
                payload: { plan: this.lastPlannerPlan, insertedIndex: targetIndex }
            });
            
            console.log(`[Interaction] Inserted new step at index ${targetIndex}, plan now has ${this.lastPlannerPlan.steps.length} steps`);
            
        } catch (e) {
            console.error('[Interaction] insertPlannerStep error:', e);
            throw e;
        }
    }

    /** Belirtilen index'teki adımı siler ve adım numaralarını yeniden düzenler. */
    public async deletePlannerStep(stepIndex: number): Promise<void> {
        if (!this.lastPlannerPlan || !Array.isArray(this.lastPlannerPlan.steps)) {
            throw new Error('Geçerli bir plan bulunamadı');
        }
        if (typeof stepIndex !== 'number' || stepIndex < 0 || stepIndex >= this.lastPlannerPlan.steps.length) {
            throw new Error('Geçersiz adım index');
        }
        try {
            // Sil
            this.lastPlannerPlan.steps.splice(stepIndex, 1);
            // Yeniden numaralandır
            this.renumberPlanSteps();

            // Execution tracking'i güncelle: silinen index'ten sonraki tüm indeksleri kaydır
            const newExecuted = new Set<number>();
            for (const oldIndex of this.executedStepIndices) {
                if (oldIndex === stepIndex) {
                    // silinen adımı atla (artık yok)
                    continue;
                }
                if (oldIndex > stepIndex) {
                    newExecuted.add(oldIndex - 1);
                } else {
                    newExecuted.add(oldIndex);
                }
            }
            this.executedStepIndices = newExecuted;

            // UI'ı güncelle - yeni planı webview'e gönder
            this.webview.postMessage({ type: 'plannerStepDeleted', payload: { plan: this.lastPlannerPlan, deletedIndex: stepIndex } });
        } catch (e) {
            console.error('[Interaction] deletePlannerStep error:', e);
            throw e;
        }
    }

    /** Adım numaralarını 1'den başlayarak yeniden düzenler. */
    private renumberPlanSteps(): void {
        if (!this.lastPlannerPlan || !Array.isArray(this.lastPlannerPlan.steps)) return;
        
        this.lastPlannerPlan.steps.forEach((step, index) => {
            if (step && typeof step === 'object') {
                step.step = index + 1;
            }
        });
    }

    /** Yeni adım eklendikten sonra execution tracking indekslerini günceller. */
    private updateExecutionTrackingAfterInsertion(insertedIndex: number): void {
        // Eklenen indeks ve sonrasındaki tüm adımların indekslerini bir artır
        const newExecutedStepIndices = new Set<number>();
        
        for (const oldIndex of this.executedStepIndices) {
            if (oldIndex >= insertedIndex) {
                // Bu adım kaydırıldı, yeni pozisyonunu kaydet
                newExecutedStepIndices.add(oldIndex + 1);
            } else {
                // Bu adım etkilenmedi
                newExecutedStepIndices.add(oldIndex);
            }
        }
        
        this.executedStepIndices = newExecutedStepIndices;
        
        console.log(`[Interaction] Updated execution tracking after insertion at ${insertedIndex}:`, Array.from(this.executedStepIndices));
    }

    private async generateAndShowSummaryNote(): Promise<void> {
        try {
            if (!this.executedStepLogs.length) return;
            const lines = this.executedStepLogs.map((l, idx) => {
                const sec = (l.elapsedMs / 1000).toFixed(2);
                const status = l.error ? `Hata: ${l.error}` : 'Tamamlandı';
                return `${idx + 1}. ${l.label} — ${status}`; // süreyi LLM'e göndermiyoruz, içerik odağı
            }).join('\n');

            const system = [
                'Türkçe ve kısa yaz. Kod blokları, başlıklar veya gereksiz süsleme yok.',
                'Madde işareti kullanabilirsin. Önce neler yapıldığını ve nelerin eklendiğini/oluşturulduğunu belirt.',
                "Ardından 'Önerilen sonraki adımlar' için 1-3 madde yaz.",
                'Kullanıcıdan gerekirse onay/istek talep eden bir son cümle ekle.'
            ].join(' ');
            const user = `Gerçekleştirilen adımlar:\n${lines}\n\nÖzet ve öneriler:`;

            // Aynı placeholder içinde stream edilecek
            this.webview.postMessage({ type: 'summaryStart' });
            let summaryCollected = '';
            await this.apiManager.generateChatContent([
                { role: 'system' as const, content: system },
                { role: 'user' as const, content: user }
            ], (chunk) => {
                summaryCollected += chunk;
                this.webview.postMessage({ type: 'summaryChunk', payload: chunk });
            }, undefined as any);
            this.webview.postMessage({ type: 'summaryEnd' });

            // Özet tamamlandığında konuşma geçmişine sadece özet metnini assistant mesajı olarak ekle
            try {
                const finalSummary = (summaryCollected && summaryCollected.trim().length > 0)
                    ? summaryCollected.trim()
                    : `Özet/Öneriler (Uygulama Sonu)\n${lines}`;
                this.conversationManager.addMessage('assistant', finalSummary);
                // Ayrıca hafızaya kaydet (planner memory)
                await this.conversationManager.savePlannerSummaryMemory(finalSummary);
            } catch (e) { /* ignore */ }
        } catch (e) {
            // sessizce geç
        }
    }

    private formatStepLabel(step: PlannerPlan['steps'][number]): string {
        const tool = step.tool || step.tool_calls?.[0]?.tool || 'step';
        const args = step.args || step.tool_calls?.[0]?.args || {};
        const q = (s?: string) => (typeof s === 'string' && s.trim().length > 0 ? s.trim() : undefined);
        switch (tool) {
            case 'check_index': {
                const files = Array.isArray(args?.files) ? args.files : (args?.file ? [String(args.file)] : []);
                return `check index ${files.join(', ')}`.trim();
            }
            case 'search': {
                const kw = Array.isArray(args?.keywords) ? args.keywords.join(' ') : q(args?.query) || '';
                return `search ${kw}`.trim();
            }
            case 'locate_code': {
                return `locate ${q(args?.name) || q(args?.pattern) || ''}`.trim();
            }
            case 'retrieve_chunks': {
                return `retrieve ${q(args?.query) || ''}`.trim();
            }
            case 'create_file': {
                return `create file ${q(args?.path) || ''}`.trim();
            }
            case 'edit_file': {
                return `edit file ${q(args?.path) || q(args?.use_saved_range) || ''}`.trim();
            }
            case 'append_file': {
                return `append file ${q(args?.path) || ''}`.trim();
            }
            default:
                return `${tool}: ${step.ui_text || step.action}`;
        }
    }

    /**
     * Plan çıktılarını çok kısa, sade Türkçe cümlelerle adım adım açıklar ve webview'e stream eder.
     */
    private async streamPlanExplanationInline(plan: PlannerPlan) {
        // Yeni bir akış başlatılacağı için önce varsa önceki isteği iptal et
        if (this.currentRequestController) {
            try { this.currentRequestController.abort(); } catch {}
        }
        this.currentRequestController = new AbortController();
        const cancellationSignal = this.currentRequestController.signal;
        // Yeni placeholder açma — aynı mesajda devam edeceğiz, sadece markdown açıklama gelecek

        // Promptu hazırla
        const planJson = JSON.stringify(plan, null, 2);
        const stepCount = Array.isArray((plan as any)?.steps) ? (plan as any).steps.length : 0;
        const stepsTemplate = Array.from({ length: stepCount }, (_, i) => `${i + 1}) <kısa cümle>`).join('\n');

        const systemInstruction = [
            'Türkçe ve ÇOK KISA cümlelerle yaz.',
            'Sadece belirtilen formatta yaz; ekstra açıklama, başlık, markdown, kod bloğu, boş satır veya ek satır ekleme.',
            `Plan ${stepCount} adım içeriyor; adım satırı sayısı tam olarak ${stepCount} olmalı.`,
            'Her adım için yalnızca TEK cümle yaz; açıklama, gerekçe, örnek, not ekleme.',
            "Her satırda mevcutsa step.ui_text'i kullan; yoksa step.action'ı çok kısa tek cümleye indir.",
            "'thought', 'notes' gibi alanları YOK SAY.",
            "Son satır 'Özet:' ile başlayan çok kısa bir cümle olmalı.",
            'Başka hiçbir şey yazma.'
        ].join(' ');

        const userRequest = [
            "Aşağıda plan JSON'u var. Aşağıdaki KESİN formatta çıktı üret:",
            'Giriş cümlesi',
            stepsTemplate,
            'Özet: <çok kısa cümle>',
            '',
            'Plan(JSON):',
            '```json',
            planJson,
            '```'
        ].join('\n');

        // Use centralized prompt builder (language selection is handled via src/system_prompts.setPromptLanguage elsewhere)
        const prompts = require('../../system_prompts').createPlanExplanationPrompts(planJson);

        const messages = [
            { role: 'system' as const, content: prompts.system },
            { role: 'user' as const, content: prompts.user }
        ];

        try {
            await this.apiManager.generateChatContent(
                messages,
                (chunk) => {
                    if ((cancellationSignal as any)?.aborted) return;
                    this.webview.postMessage({ type: 'addResponseChunk', payload: chunk });
                },
                cancellationSignal as any
            );
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                console.log('[Interaction] Plan explanation aborted by user.');
            } else {
                console.error('[Interaction] Plan explanation stream error:', error);
                const errorMessage = error instanceof Error ? error.message : 'Açıklama oluşturulurken bir hata oluştu.';
                this.webview.postMessage({ type: 'addResponse', payload: `**Hata:** ${errorMessage}` });
            }
        } finally {
            this.webview.postMessage({ type: 'streamEnd' });
            this.currentRequestController = null;
        }
    }

    private async streamStandardChat() {
        this.currentRequestController = new AbortController();
        const cancellationSignal = this.currentRequestController.signal;
        
        const messagesForApi = await this.prepareMessagesForApiWithRetrieval();
        console.log('Prompt to LLM:', JSON.stringify(messagesForApi, null, 2));

        
        let fullResponse = '';
        try {
            await this.apiManager.generateChatContent(messagesForApi, (chunk) => {
                fullResponse += chunk;
                this.webview.postMessage({ type: 'addResponseChunk', payload: chunk });
            }, cancellationSignal);

            if (!cancellationSignal.aborted) {
                this.conversationManager.addMessage('assistant', fullResponse);
            }
            
        } catch (error: any) {
            if (axios.isCancel(error) || error.name === 'AbortError') {
                console.log('Stream successfully aborted by the user.');
            } else {
                this.conversationManager.removeLastMessage();
                console.error("Chat API Stream Hatası:", error);
                const errorMessage = error instanceof Error ? error.message : "Bilinmeyen bir hata oluştu.";
                this.webview.postMessage({ type: 'addResponse', payload: `**Hata:** ${errorMessage}` });
            }
        } finally {
            this.webview.postMessage({ type: 'streamEnd' });
            this.currentRequestController = null;
        }
    }
    
    /**
     * GÜNCELLENDİ: API'ye gönderilecek mesajları hazırlarken `promptBuilder` kullanır.
     * Bu, bu dosyayı daha temiz ve yönetilebilir hale getirir.
     */
    private async prepareMessagesForApiWithRetrieval(): Promise<ChatMessage[]> {
        const activeConversation = this.conversationManager.getActive();
        if (!activeConversation) return [];
        
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        const historyLimit = config.get<number>(SETTINGS_KEYS.conversationHistoryLimit, 2);
        
        const systemPrompt = activeConversation.messages.find(m => m.role === 'system');
        const conversationHistory = activeConversation.messages.filter(m => m.role !== 'system');
        const limitedHistory = conversationHistory.slice(-(historyLimit * 2 + 1));

        const lastUserMessageIndex = limitedHistory.map(m => m.role).lastIndexOf('user');
        if (lastUserMessageIndex !== -1) {
            const lastUserMessage = limitedHistory[lastUserMessageIndex];
            
            // YENİ: Talimat oluşturma işlemi `promptBuilder`'a devredildi.
            const contextualContent = createContextualPrompt(lastUserMessage, this.contextManager);
            
            // GEÇİCİ: Retrieval'ı tamamen bypass ediyoruz; sadece contextual content kullanıyoruz.
            limitedHistory[lastUserMessageIndex] = { role: 'user', content: contextualContent };
        }

        return systemPrompt ? [systemPrompt, ...limitedHistory] : limitedHistory;
    }
}