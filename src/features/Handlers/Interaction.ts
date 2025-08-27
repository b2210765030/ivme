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

    /** Yeni sohbet/sayfa açıldığında veya sohbet değiştirildiğinde plan/act durumunu sıfırla. */
    public resetPlannerState(): void {
        try { this.currentRequestController?.abort(); } catch {}
        this.currentRequestController = null;
        this.lastPlannerPlan = null;
        this.executedStepIndices = new Set();
        this.executedStepLogs = [];
        this.didEmitSummaryNote = false;
        this.isBatchRun = false;
    }

    public cancelStream() {
        if (this.currentRequestController) {
            this.currentRequestController.abort();
            this.currentRequestController = null;
        }
    }

    public async handle(instruction: string, forcePlanMode: boolean = false) {
        if (this.currentRequestController) {
            this.cancelStream();
        }
        
        this.conversationManager.addMessage('user', instruction);

        // Natural-language trigger: if the user asks to execute all steps, request confirmation instead of auto-running
        let intentWantsExecuteAll = false;
        if (!forcePlanMode) {
            intentWantsExecuteAll = this.isExecuteAllInstruction(instruction);
            if (!intentWantsExecuteAll) {
                try {
                    intentWantsExecuteAll = await this.shouldAutoExecuteByLLM(instruction);
                } catch {}
            }
            if (intentWantsExecuteAll) {
                if (this.lastPlannerPlan && Array.isArray(this.lastPlannerPlan.steps) && this.lastPlannerPlan.steps.length > 0) {
                    // Ask for user confirmation via webview UI
                    this.webview.postMessage({ type: 'requestExecuteConfirmation', payload: { instruction } });
                    return;
                } else {
                    this.webview.postMessage({ type: 'addResponse', payload: 'Önce bir plan oluşturulmalı. Lütfen önce bir plan isteyin (örn. "merge.py oluştur").' });
                    this.webview.postMessage({ type: 'streamEnd' });
                    return;
                }
            }
        }
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

            // Planner decision logged

            if (shouldUsePlanner) {
                // Streaming: ui_text parçalarını anında UI'a ilet
                // Planner'ı hafızadaki son özetle zenginleştir
                const latestSummary = this.conversationManager.getPlannerSummaryMemory?.();
                // Persisted state: previous plan and completed steps
                let prevPlanJson: string | undefined = this.lastPlannerPlan ? JSON.stringify(this.lastPlannerPlan) : undefined;
                if (!prevPlanJson) {
                    try {
                        const saved = this.conversationManager.getLastPlannerPlanJson?.();
                        if (typeof saved === 'string' && saved.trim().length > 0) {
                            prevPlanJson = saved;
                            try { this.lastPlannerPlan = JSON.parse(saved); } catch {}
                        }
                    } catch {}
                }
                // Completed indices (1-based) — prefer in-memory, else load persisted
                let completedIndices: number[] | undefined;
                if (this.executedStepIndices && this.executedStepIndices.size > 0) {
                    completedIndices = Array.from(this.executedStepIndices).map(i => i + 1);
                } else {
                    try {
                        const savedCompleted = this.conversationManager.getCompletedPlannerStepIndices?.();
                        if (Array.isArray(savedCompleted) && savedCompleted.length > 0) {
                            completedIndices = savedCompleted;
                            // Also hydrate in-memory zero-based set for UI coherence
                            this.executedStepIndices = new Set(savedCompleted.map(n => Math.max(0, Number(n) - 1)).filter(n => Number.isFinite(n) && n >= 0));
                        }
                    } catch {}
                }
                // Build focused context from Agent mode (active editor) if available
                const agentFile = this.contextManager.agentFileContext;
                const agentSel = this.contextManager.agentSelectionContext;
                const ws = vscode.workspace.workspaceFolders?.[0];
                const focus = agentFile ? {
                    fileName: agentFile.fileName,
                    content: agentFile.content,
                    selection: (agentSel && agentSel.selection) ? {
                        startLine: agentSel.selection.start.line + 1,
                        endLine: agentSel.selection.end.line + 1,
                        content: agentSel.content
                    } : undefined,
                    pathRel: (ws && agentFile.uri?.fsPath) ? (require('path').relative(ws.uri.fsPath, agentFile.uri.fsPath).replace(/\\/g, '/')) : undefined
                } : undefined;

                const plan = await run_planner(
                    this.conversationManager.getExtensionContext(),
                    this.apiManager,
                    instruction,
                    (stepNo, uiText, isFinal) => {
                        // Tipografik/daktilo efekti için parça olarak gönderme yerine UI tarafında efekt verilecek
                        this.webview.postMessage({ type: 'plannerUiChunk', payload: { stepNo, uiText, isFinal } });
                    },
                    cancellationSignal as any,
                    latestSummary,
                    this.conversationManager.getPlannerExecutionsMemory?.(),
                    prevPlanJson,
                    completedIndices,
                    focus
                );
                // Planner tool-calling kullanımını token sayacına yansıt
                try {
                    const usage = (this.apiManager as any).getLastUsageIfAvailable?.();
                    if (usage && typeof usage === 'object') {
                        const completion = Number((usage as any).completion_tokens || 0) || 0;
                        if (completion > 0) {
                            try { this.conversationManager.addUsageTokens(completion); } catch {}
                        }
                        this.webview.postMessage({ type: 'modelTokenUsage', payload: usage });
                    }
                } catch {}
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
                // Planı hafızada tut ve kalıcı hale getir
                this.lastPlannerPlan = plan;
                try { await this.conversationManager.saveLastPlannerPlanJson(JSON.stringify(plan)); } catch {}
                // Yeni plan için yürütülen adım izlerini sıfırla ve kalıcı completed listesini temizle
                this.executedStepIndices = new Set();
                this.executedStepLogs = [];
                this.didEmitSummaryNote = false;
                try { await this.conversationManager.saveCompletedPlannerStepIndices([]); } catch {}
                this.currentRequestController = null;

                // Plan finalize edildikten sonra, aynı placeholder altında açıklamayı stream et
                // UI'da bozulmaları önlemek için kısa bir gecikme ekle (500ms)
                setTimeout(() => {
                    // Planner LLM çağrısından bağımsız ikinci akış: token kullanımını yakalamak için
                    try {
                        const usage = (this.apiManager as any).getLastUsageIfAvailable?.();
                        if (usage && typeof usage === 'object') {
                            const completion = Number((usage as any).completion_tokens || 0) || 0;
                            if (completion > 0) {
                                try { this.conversationManager.addUsageTokens(completion); } catch {}
                            }
                            this.webview.postMessage({ type: 'modelTokenUsage', payload: usage });
                        }
                    } catch {}
                    this.streamPlanExplanationInline(plan).catch(err => console.error('[Interaction] Plan explanation error:', err));
                }, 500);
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
    public async executePlannerStep(stepIndex: number, useManualArgs?: boolean): Promise<{ label: string; elapsedMs: number; error?: string } | null> {
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
        // Not: ACT modunda kullanıcı, çalıştırılan gerçek tool ve argümanları görmek istiyor.
        // Bu nedenle label'ı tool/args seçimi tamamlandıktan sonra oluşturacağız.
        let label = '';
        let t0 = 0;

        const attemptCount = useManualArgs ? 1 : 3;
        let lastError: any = null;
        for (let attempt = 1; attempt <= attemptCount; attempt++) {
            try {
                // 1) Tool seçimi + args çıkarımı (LLM) veya manuel argüman
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
                let selection: { tool: string; args?: any } | null = null;
                if (useManualArgs) {
                    // Skip LLM selection; use the tool/args already present on the step
                    selection = { tool: String(step.tool || ''), args: (step as any).args || {} };
                } else {
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
                    // Tool selection debug logs removed
                    let raw = '';
                    await this.apiManager.generateChatContent([
                        { role: 'system' as const, content: system },
                        { role: 'user' as const, content: user }
                    ], (chunk) => { raw += chunk; }, undefined as any);
                    // raw response logged for debugging
                    try {
                        selection = preselected && !isAuto ? this.parseArgsOnlySelection(raw, preselected) : this.parseToolSelection(raw);
                    } catch (e) {
                        console.warn('[ToolSelect] parse error:', e);
                    }
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
            // parsed selection (pre-normalize)
            // Normalize tool name to allowed set
            const normalized = this.normalizeToolName(selection.tool, validTools);
            if (!normalized) {
                throw new Error(`Geçersiz araç adı: ${selection.tool}`);
            }
            selection.tool = normalized;
            // normalized selection

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

                // 2) Aracı çalıştır - odak dosya yolunu executora ilet (Agent aktif dosya)
                try {
                    const focusAbs = this.contextManager.agentFileContext?.uri?.fsPath;
                    if (focusAbs && typeof (this.executor as any).setFocusPath === 'function') {
                        (this.executor as any).setFocusPath(focusAbs);
                    }
                    const sel = this.contextManager.agentSelectionContext?.selection;
                    if (sel && typeof (this.executor as any).setFocusSelection === 'function') {
                        (this.executor as any).setFocusSelection({
                            startLine: sel.start.line,
                            startCharacter: sel.start.character,
                            endLine: sel.end.line,
                            endCharacter: sel.end.character
                        });
                    } else {
                        if (typeof (this.executor as any).setFocusSelection === 'function') {
                            (this.executor as any).setFocusSelection(undefined);
                        }
                    }
                } catch {}
                // ACT görselleştirme: gerçek tool ve args ile label oluştur ve UI'da pulse başlat
                try {
                    label = this.formatToolAndArgsDisplay(selection.tool, selection.args);
                } catch {
                    label = this.formatStepLabel(this.lastPlannerPlan.steps[stepIndex]);
                }
                // Kalıcılık: Adım başlangıcını da konuşma geçmişine yaz
                try { this.conversationManager.addMessage('assistant', `Adım başlıyor: ${label}`); } catch {}
                // UI placeholder: başlat (pulse)
                this.webview.postMessage({ type: 'stepExecStart', payload: { index: stepIndex, label } });
                // Süre ölçümünü sadece gerçek araç çalışması için başlat
                t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                const result = await this.executor.executeStep(ctx, this.apiManager, this.lastPlannerPlan, stepIndex);
                // Capture token usage produced by the tool's internal LLM calls (if any)
                try {
                    const usage = (this.apiManager as any).getLastUsageIfAvailable?.();
                    if (usage && typeof usage === 'object') {
                        const completion = Number((usage as any).completion_tokens || 0) || 0;
                        if (completion > 0) {
                            try { this.conversationManager.addUsageTokens(completion); } catch {}
                        }
                        this.webview.postMessage({ type: 'modelTokenUsage', payload: usage });
                    }
                } catch {}
                const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                const elapsedMs = Math.max(0, t1 - t0);
                this.webview.postMessage({ type: 'stepExecEnd', payload: { index: stepIndex, label, elapsedMs, result } });
                // Persist concise step completion note so history fully reflects UI
                try {
                    const seconds = (elapsedMs / 1000).toFixed(2);
                    const summary = `Adım tamamlandı: ${label} (${seconds}s)`;
                    this.conversationManager.addMessage('assistant', summary);
                } catch {}
                const log = { label, elapsedMs };
                this.executedStepLogs.push(log);
                this.executedStepIndices.add(stepIndex);
                // Persist completed steps (1-based)
                try { await this.conversationManager.saveCompletedPlannerStepIndices(Array.from(this.executedStepIndices).map(i => i + 1)); } catch {}
                // Persist execution record to conversation memory (for future planning continuity)
                try {
                    await this.conversationManager.addPlannerExecution({
                        stepIndex,
                        label,
                        tool: (this.lastPlannerPlan?.steps?.[stepIndex]?.tool || this.lastPlannerPlan?.steps?.[stepIndex]?.tool_calls?.[0]?.tool) as any,
                        args: (this.lastPlannerPlan?.steps?.[stepIndex]?.args || this.lastPlannerPlan?.steps?.[stepIndex]?.tool_calls?.[0]?.args),
                        result,
                        elapsedMs
                    });
                } catch {}
                // Eğer tüm adımlar başarıyla veya manuel atlama ile tamamlandıysa paneli tamamlandı olarak işaretle
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
                lastError = e;
                console.warn(`[StepExec] attempt ${attempt} failed:`, e?.message || String(e));
                // retry unless last attempt
                if (attempt < attemptCount) {
                    continue;
                }
                const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                const elapsedMs = Math.max(0, t1 - t0);
                this.webview.postMessage({ type: 'stepExecEnd', payload: { index: stepIndex, label, elapsedMs, error: e?.message || String(e) } });
                // Persist failure note to conversation history
                try {
                    const seconds = (elapsedMs / 1000).toFixed(2);
                    const msg = `Adım hatası: ${label} (${seconds}s) — ${e?.message || String(e)}`;
                    this.conversationManager.addMessage('assistant', msg);
                } catch {}
                const log = { label, elapsedMs, error: e?.message || String(e) };
                this.executedStepLogs.push(log);
                // Persist completed/failed step index as well (considered handled)
                try { await this.conversationManager.saveCompletedPlannerStepIndices(Array.from(this.executedStepIndices).map(i => i + 1)); } catch {}
                // Persist failed execution as well for continuity
                try {
                    await this.conversationManager.addPlannerExecution({
                        stepIndex,
                        label,
                        tool: (this.lastPlannerPlan?.steps?.[stepIndex]?.tool || this.lastPlannerPlan?.steps?.[stepIndex]?.tool_calls?.[0]?.tool) as any,
                        args: (this.lastPlannerPlan?.steps?.[stepIndex]?.args || this.lastPlannerPlan?.steps?.[stepIndex]?.tool_calls?.[0]?.args),
                        result: `Hata: ${e?.message || String(e)}`,
                        elapsedMs
                    });
                } catch {}
                // 3 kez denendi ve başarısız: kullanıcıdan manuel giriş iste veya atlama öner
                try {
                    this.webview.postMessage({ type: 'plannerStepManualRequired', payload: { index: stepIndex, step, error: e?.message || String(e) } });
                    this.webview.postMessage({ type: 'addResponse', payload: `Adım '${label}' üç denemede tamamlanamadı. Bu adımı elle araç/argüman girerek uygulamak ister misiniz, yoksa atlayalım mı?` });
                } catch {}
                return log;
            }
        }
        // Should not reach here; return a safe default if loop exits unexpectedly
        return { label, elapsedMs: 0, error: String(lastError || 'Bilinmeyen hata') };
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
            // Plan değişti: kalıcı hale getir
            try { await this.conversationManager.saveLastPlannerPlanJson(JSON.stringify(this.lastPlannerPlan)); } catch {}
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
            // Persist execution tracking after insert (1-based)
            try { await this.conversationManager.saveCompletedPlannerStepIndices(Array.from(this.executedStepIndices).map(i => i + 1)); } catch {}
            // Plan değişti: kalıcı hale getir
            try { await this.conversationManager.saveLastPlannerPlanJson(JSON.stringify(this.lastPlannerPlan)); } catch {}
            
            // UI'ı güncelle - yeni planı webview'e gönder
            this.webview.postMessage({
                type: 'plannerStepInserted',
                payload: { plan: this.lastPlannerPlan, insertedIndex: targetIndex }
            });
            
            // Inserted new step at index
            
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
            // Persist execution tracking after delete (1-based)
            try { await this.conversationManager.saveCompletedPlannerStepIndices(Array.from(this.executedStepIndices).map(i => i + 1)); } catch {}
            // Plan değişti: kalıcı hale getir
            try { await this.conversationManager.saveLastPlannerPlanJson(JSON.stringify(this.lastPlannerPlan)); } catch {}

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
        
        // Updated execution tracking after insertion
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

    /** ACT modunda UI'da gösterilecek net tool+args etiketini oluşturur. */
    private formatToolAndArgsDisplay(tool: string, args: any): string {
        try {
            const safeTool = String(tool || 'tool').trim();
            const q = (s?: string) => (typeof s === 'string' && s.trim().length > 0 ? s.trim() : undefined);
            switch (safeTool) {
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
                default: {
                    // Genel gösterim: kısa JSON args (kırpılmış)
                    let argsShort = '';
                    try {
                        const json = JSON.stringify(args ?? {}, null, 0);
                        argsShort = json.length > 120 ? (json.slice(0, 117) + '...') : json;
                    } catch { argsShort = ''; }
                    return argsShort && argsShort !== '{}' ? `${safeTool} ${argsShort}` : `${safeTool}`;
                }
            }
        } catch {
            return String(tool || 'tool');
        }
    }

    /** UI'dan manuel araç/argüman sağlanırsa bu metot çağrılır ve seçim aşaması atlanır. */
    public async provideManualToolArgs(stepIndex: number, tool: string, args: any): Promise<void> {
        if (!this.lastPlannerPlan) return;
        if (stepIndex < 0 || stepIndex >= this.lastPlannerPlan.steps.length) return;
        try {
            (this.lastPlannerPlan.steps[stepIndex] as any).tool = tool;
            (this.lastPlannerPlan.steps[stepIndex] as any).args = args || {};
            await this.executePlannerStep(stepIndex, true);
        } catch (e) {
            console.error('[Interaction] provideManualToolArgs error:', e);
        }
    }

    /** Kullanıcı adımı atlamak isterse çağrılır. */
    public async skipPlannerStep(stepIndex: number): Promise<void> {
        if (!this.lastPlannerPlan) return;
        if (stepIndex < 0 || stepIndex >= this.lastPlannerPlan.steps.length) return;
        const step = this.lastPlannerPlan.steps[stepIndex];
        const label = this.formatStepLabel(step);
        // İşaretle ve UI'a bildir
        this.executedStepIndices.add(stepIndex);
        // Persist completed (skipped) steps as well (1-based)
        try { await this.conversationManager.saveCompletedPlannerStepIndices(Array.from(this.executedStepIndices).map(i => i + 1)); } catch {}
        this.webview.postMessage({ type: 'stepSkipped', payload: { index: stepIndex, label } });
        try {
            if (this.lastPlannerPlan && this.executedStepIndices.size >= this.lastPlannerPlan.steps.length) {
                this.webview.postMessage({ type: 'plannerCompleted' });
                if (!this.isBatchRun && !this.didEmitSummaryNote) {
                    this.didEmitSummaryNote = true;
                    await this.generateAndShowSummaryNote();
                }
            }
        } catch {}
    }

    /** Detects user intent to execute all planner steps using natural-language cues (TR/EN). */
    private isExecuteAllInstruction(input: string): boolean {
        try {
            const s = String(input || '').toLowerCase();
            const sStripped = s.replace(/[.!?\s]+$/g, '').trim();

            // Does the sentence mention plan/steps?
            const hasPlanKeyword = /\b(plan|adım|adim|adımları|adimlari|step|steps)\b/i.test(s);

            // Direct patterns that already contain plan/steps cues
            const directPatterns: RegExp[] = [
                // Turkish — explicit
                /(tüm|tum|tamamını|tamamini|bütün|butun)\s+(adımları|adimlari|adımlar|adimlar)\s*(uygula|çalıştır|calistir|başlat|baslat|yürüt|yurut|yap|tamamla|bitir)/i,
                /tüm\s*plan[ıi]?\s*(uygula|çalıştır|calistir|başlat|baslat|yürüt|yurut|tamamla|bitir)/i,
                /plan[ıi]?\s*(uygula|çalıştır|calistir|başlat|baslat|yürüt|yurut|tamamla|bitir|devreye\s*al)/i,
                /(adımları|adimlari)\s*(sırayla|sirayla|tek\s*tek)\s*(uygula|çalıştır|calistir|başlat|baslat|yürüt|yurut|yap|tamamla|bitir)/i,
                /(kalan|geri\s*kalan)\s*(adımları|adimlari)\s*(uygula|çalıştır|calistir|başlat|baslat|yürüt|yurut|tamamla|bitir)/i,
                /act\s*modunda/i,

                // English — explicit
                /(?:execute|run|apply|perform|carry\s*out|complete|finish|kick\s*off|start|begin)\s+(?:the\s+)?(?:(?:entire|whole|full|complete)\s+)?(?:plan|all\s*steps)/i,
                /go\s*ahead\s*(?:and)?\s*(?:run|execute|apply)\s*(?:the\s+)?(?:plan|all\s*steps)/i,
                /proceed\s*with\s*(?:the\s+)?plan/i,
                /run\s*it\s*(?:end\s*to\s*end|e2e)/i
            ];

            if (directPatterns.some(re => re.test(s))) return true;

            // Broad patterns; require plan/steps keywords to reduce false positives
            const broadPatterns: RegExp[] = [
                // Turkish
                /(hepsini|hepsin(i)?|tümünü|tumunu|tamamını|tamamini|bütününü|butununu)\s*(uygula|çalıştır|calistir|başlat|baslat|yürüt|yurut|yap|tamamla|bitir)/i,
                /(devam\s*et|sürdür|ilerle)/i,
                /(hemen\s*başla|başlat\s*gitsin|direkt\s*uygula|şimdi\s*uygula)/i,
                /(otomatik|auto)\s*(uygula|çalıştır|calistir|başlat|baslat)/i,
                // English
                /(execute|run|apply|perform|complete|finish|start|begin)\s*(it|this)/i,
                /(continue|proceed|go\s*ahead)/i,
                /(auto\s*run|batch\s*run|run\s*everything|do\s*everything)/i,
                /(let'?s|lets)\s+(apply|run|do)\b/i
            ];

            if (hasPlanKeyword && broadPatterns.some(re => re.test(s))) return true;

            // If we already have a plan, allow very short/elliptical triggers like just "çalıştır" or "run"
            if (this.lastPlannerPlan && Array.isArray(this.lastPlannerPlan.steps) && this.lastPlannerPlan.steps.length > 0) {
                const singleVerbPatterns: RegExp[] = [
                    // Turkish (accented and non-accented variants)
                    /^(çalıştır|calistir)$/i,
                    /^(başlat|baslat)$/i,
                    /^(yürüt|yurut)$/i,
                    /^(uygula)$/i,
                    /^(tamamla|bitir)$/i,
                    /^(devreye\s*al)$/i,
                    /^(başla|basla|başlayalım|baslayalim)$/i,
                    /^(hadi|hadi\s*başla|hadi\s*basla)$/i,
                    // English
                    /^(run|execute|apply|start|begin|go)$/i,
                    /^(go\s*ahead)$/i,
                    /^(let'?s\s*(go|run|start|begin))$/i
                ];
                if (singleVerbPatterns.some(re => re.test(sStripped))) return true;
            }

            return false;
        } catch {
            return false;
        }
    }

    /**
     * LLM-based intent classifier: asks the model whether the user wants to execute all plan steps now.
     * Returns true only when the instruction clearly requests auto execution (TR/EN), otherwise false.
     * Very low token, strict JSON output.
     */
    private async shouldAutoExecuteByLLM(instruction: string): Promise<boolean> {
        try {
            const hasPlan = !!(this.lastPlannerPlan && Array.isArray(this.lastPlannerPlan.steps) && this.lastPlannerPlan.steps.length > 0);
            if (!hasPlan) return false; // cannot auto-execute without a plan

            const examplesTR = [
                'tüm adımları uygula',
                'planı çalıştır',
                'adımları sırayla başlat',
                'hepsini tamamla',
                'act modunda uygula'
            ].join(' | ');
            const examplesEN = [
                'execute all steps',
                'run the plan',
                'apply everything',
                'proceed with the plan',
                'run it end to end'
            ].join(' | ');

            const system = [
                'You are a strict intent classifier. Decide if the user asks to EXECUTE ALL PLAN STEPS NOW.',
                'Return ONLY a compact JSON object: {"auto_execute": true|false}. No extra fields, no text.',
                'If the instruction is ambiguous or general (e.g., asking for planning or code help), return false.',
                'Turkish and English supported.'
            ].join(' ');

            const user = [
                'Context:',
                `plan_exists: ${hasPlan ? 'true' : 'false'}`,
                `instruction: "${instruction.replace(/"/g, '\\"')}"`,
                'Positive examples (TR): ' + examplesTR,
                'Positive examples (EN): ' + examplesEN,
                'Output strictly: {"auto_execute": true|false}'
            ].join('\n');

            let raw = '';
            await this.apiManager.generateChatContent([
                { role: 'system' as const, content: system },
                { role: 'user' as const, content: user }
            ], (chunk) => { raw += chunk; }, undefined as any);

            // Extract first JSON block or braces
            const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
            const text = fence && fence[1] ? fence[1].trim() : raw.trim();
            const first = text.indexOf('{');
            const last = text.lastIndexOf('}');
            const jsonSlice = (first !== -1 && last !== -1 && last > first) ? text.slice(first, last + 1) : text;
            let parsed: any = {};
            try { parsed = JSON.parse(jsonSlice); } catch { return false; }
            return parsed && typeof parsed.auto_execute === 'boolean' ? parsed.auto_execute === true : false;
        } catch {
            return false;
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

        // Promptu hazırla — açıklamada ÖNCE TAMAMLANAN ADIMLARI gizle
        let planForExplanation = plan;
        try {
            const completed1Based = this.conversationManager.getCompletedPlannerStepIndices?.();
            if (Array.isArray(completed1Based) && completed1Based.length > 0) {
                const set = new Set<number>(completed1Based);
                const filtered = Array.isArray((plan as any)?.steps)
                    ? (plan as any).steps.filter((s: any) => !set.has(Number(s?.step)))
                    : [];
                planForExplanation = { steps: filtered } as any;
            }
        } catch {}
        const planJson = JSON.stringify(planForExplanation, null, 2);
        const stepCount = Array.isArray((planForExplanation as any)?.steps) ? (planForExplanation as any).steps.length : 0;
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
            let fullResponse = '';
            await this.apiManager.generateChatContent(
                messages,
                (chunk) => {
                    if ((cancellationSignal as any)?.aborted) return;
                    fullResponse += chunk;
                    this.webview.postMessage({ type: 'addResponseChunk', payload: chunk });
                },
                cancellationSignal as any
            );
            // Store assistant explanation in conversation history
            try {
                if (!cancellationSignal.aborted && fullResponse && fullResponse.trim().length > 0) {
                    this.conversationManager.addMessage('assistant', fullResponse);
                }
            } catch {}
            // Capture token usage for this stream and reflect in UI/context size
            try {
                const usage = (this.apiManager as any).getLastUsageIfAvailable?.();
                if (usage && typeof usage === 'object') {
                    const completion = Number((usage as any).completion_tokens || 0) || 0;
                    if (completion > 0) {
                        try { this.conversationManager.addUsageTokens(completion); } catch {}
                    }
                    this.webview.postMessage({ type: 'modelTokenUsage', payload: usage });
                }
            } catch {}
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                // Plan explanation aborted by user.
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
        // Prompt to LLM suppressed

        
        let fullResponse = '';
        try {
            await this.apiManager.generateChatContent(messagesForApi, (chunk) => {
                fullResponse += chunk;
                this.webview.postMessage({ type: 'addResponseChunk', payload: chunk });
            }, cancellationSignal);

            if (!cancellationSignal.aborted) {
                this.conversationManager.addMessage('assistant', fullResponse);
                // Model kullanımını (token) UI'a bildir
                try {
                    const usage = (this.apiManager as any).getLastUsageIfAvailable?.();
                    if (usage && typeof usage === 'object') {
                        const completion = Number((usage as any).completion_tokens || 0) || 0;
                        if (completion > 0) {
                            try { this.conversationManager.addUsageTokens(completion); } catch {}
                        }
                        this.webview.postMessage({ type: 'modelTokenUsage', payload: usage });
                    }
                } catch {}
            }
            
        } catch (error: any) {
            if (axios.isCancel(error) || error.name === 'AbortError') {
                // Stream aborted by the user.
            } else {
                // Kullanıcı mesajını silmeyelim; tarihi tam tutalım
                console.error("Chat API Stream Hatası:", error);
                const errorMessage = error instanceof Error ? error.message : "Bilinmeyen bir hata oluştu.";
                const uiMsg = `**Hata:** ${errorMessage}`;
                this.webview.postMessage({ type: 'addResponse', payload: uiMsg });
                try { this.conversationManager.addMessage('assistant', uiMsg); } catch {}
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