/* ==========================================================================
   DOSYA: src/features/ConversationManager.ts (GÜNCELLENMİŞ)

   SORUMLULUK: Tüm konuşma verilerini yönetir.
   YENİ GÜNCELLEME: Artık başlangıç sistem talimatını promptBuilder'dan alıyor.
   ========================================================================== */

import * as vscode from 'vscode';
import { Conversation, ChatMessage } from '../../types/index';
import { generateUUID } from '../../core/utils';
import { EXTENSION_ID, SETTINGS_KEYS } from '../../core/constants';
import { createInitialSystemPrompt } from '../../system_prompts';

export class ConversationManager {
    private conversations: Conversation[] = [];
    private activeConversationId: string | null = null;
    private usageByConversationId: Record<string, number> = {};
    private uiStateByConversationId: Record<string, {
        agentModeActive?: boolean;
    }> = {};

    constructor(private readonly context: vscode.ExtensionContext) {
        this.loadConversationsFromState();
        this.loadUsageFromState();
        this.loadUiStateFromState();
        this.createNew();
    }

    public getExtensionContext(): vscode.ExtensionContext {
        return this.context;
    }

    public createNew(): Conversation {
        // YENİ: Sistem talimatı merkezi `promptBuilder`'dan çağrılıyor.
        const initialSystemPrompt = createInitialSystemPrompt();
        const newConv: Conversation = {
            id: generateUUID(),
            timestamp: Date.now(),
            title: "Yeni Konuşma",
            messages: [{ role: 'system', content: initialSystemPrompt }]
        };
        this.conversations.push(newConv);
        this.activeConversationId = newConv.id;
        this.usageByConversationId[newConv.id] = this.usageByConversationId[newConv.id] || 0;
        this.saveUsage();
        return newConv;
    }

    // ... (dosyanın geri kalanı değişmedi, bu yüzden buraya eklenmedi) ...
    public getActive(): Conversation | undefined {
        if (!this.activeConversationId) {
            // Eğer bir sebepten aktif ID yoksa, en sonuncusunu bul veya yeni oluştur.
            const lastConversation = this.conversations.sort((a, b) => b.timestamp - a.timestamp)[0];
            if (lastConversation) {
                this.activeConversationId = lastConversation.id;
            } else {
                return this.createNew();
            }
        }
        return this.conversations.find(c => c.id === this.activeConversationId);
    }

    public getActiveConversationSize(): number {
        // Backward-compat: return accumulated usage so UI can show history + responses
        const activeConv = this.getActive();
        if (!activeConv) return 0;
        return this.usageByConversationId[activeConv.id] || 0;
    }

    public addUsageTokens(count: number): void {
        const activeConv = this.getActive();
        if (!activeConv) return;
        const current = this.usageByConversationId[activeConv.id] || 0;
        this.usageByConversationId[activeConv.id] = Math.max(0, current + Math.max(0, Number(count) || 0));
        this.saveUsage();
    }

    public addMessage(role: 'user' | 'assistant', content: string): void {
        const activeConv = this.getActive();
        if (activeConv) {
            // Eğer bu, "Yeni Konuşma"nın ilk kullanıcı mesajı ise, başlığı güncelle.
            if (activeConv.title === "Yeni Konuşma" && role === 'user' && activeConv.messages.length <= 1) {
                 activeConv.title = content.length > 40 ? content.substring(0, 37) + '...' : content;
            }
            activeConv.messages.push({ role, content });
            activeConv.timestamp = Date.now();
            this.save();
        }
    }

    /**
     * Save the latest planner summary text into a per-conversation memory bucket
     * so we can inject it into subsequent planner runs.
     */
    public async savePlannerSummaryMemory(summaryText: string): Promise<void> {
        const activeConv = this.getActive();
        if (!activeConv) return;
        const key = 'baykar.planner.memories';
        const map = this.context.workspaceState.get<Record<string, string[]>>(key) || {};
        const list = Array.isArray(map[activeConv.id]) ? map[activeConv.id] : [];
        // Keep only the last few summaries per conversation
        list.push(String(summaryText || '').trim());
        const trimmed = list.filter(s => s && s.length > 0).slice(-3);
        map[activeConv.id] = trimmed;
        await this.context.workspaceState.update(key, map);
    }

    /**
     * Return the most recent planner summary for the active conversation, if any.
     */
    public getPlannerSummaryMemory(): string | undefined {
        const activeConv = this.getActive();
        if (!activeConv) return undefined;
        const key = 'baykar.planner.memories';
        const map = this.context.workspaceState.get<Record<string, string[]>>(key) || {};
        const list = Array.isArray(map[activeConv.id]) ? map[activeConv.id] : [];
        return list.length > 0 ? list[list.length - 1] : undefined;
    }

    /**
     * Append a single planner execution record for the active conversation.
     * Keeps the last ~50 executions per conversation.
     */
    public async addPlannerExecution(entry: {
        stepIndex: number;
        label: string;
        tool?: string;
        args?: any;
        result?: string;
        elapsedMs?: number;
        filePathHint?: string;
    }): Promise<void> {
        const activeConv = this.getActive();
        if (!activeConv) return;
        const key = 'baykar.planner.execs';
        const map = this.context.workspaceState.get<Record<string, any[]>>(key) || {};
        const list = Array.isArray(map[activeConv.id]) ? map[activeConv.id] : [];
        const now = Date.now();
        const record = {
            ts: now,
            stepIndex: Number(entry.stepIndex) || 0,
            label: String(entry.label || ''),
            tool: typeof entry.tool === 'string' ? entry.tool : undefined,
            args: entry.args && typeof entry.args === 'object' ? entry.args : undefined,
            result: typeof entry.result === 'string' ? entry.result : undefined,
            elapsedMs: Number(entry.elapsedMs || 0) || 0,
            filePath: typeof entry.filePathHint === 'string' ? entry.filePathHint : (typeof entry?.args?.path === 'string' ? entry.args.path : undefined)
        };
        list.push(record);
        // keep last 50
        map[activeConv.id] = list.slice(-50);
        await this.context.workspaceState.update(key, map);
    }

    /**
     * Returns a concise memory text describing recent planner executions (files changed, created, etc.).
     */
    public getPlannerExecutionsMemory(maxItems: number = 10): string | undefined {
        const activeConv = this.getActive();
        if (!activeConv) return undefined;
        const key = 'baykar.planner.execs';
        const map = this.context.workspaceState.get<Record<string, any[]>>(key) || {};
        const list = Array.isArray(map[activeConv.id]) ? map[activeConv.id] : [];
        if (!list.length) return undefined;
        const recent = list.slice(-Math.max(1, maxItems));
        const lines: string[] = [];
        lines.push('Son gerçekleştirilen değişiklikler (en yeni en sonda):');
        for (const rec of recent) {
            const path = typeof rec?.filePath === 'string' ? rec.filePath : (rec?.args && typeof rec.args.path === 'string' ? rec.args.path : '');
            const tool = typeof rec?.tool === 'string' ? rec.tool : '';
            const label = typeof rec?.label === 'string' ? rec.label : '';
            const res = typeof rec?.result === 'string' ? rec.result.split('\n')[0] : '';
            const short = [tool, path].filter(Boolean).join(' ');
            const line = `- ${short || label}${res ? ` — ${res}` : ''}`.trim();
            lines.push(line);
        }
        // Also include a compact list of changed files to bias future planning
        const files = Array.from(new Set(recent.map(r => (typeof r?.filePath === 'string' ? r.filePath : (r?.args && typeof r.args.path === 'string' ? r.args.path : ''))).filter((p: any) => typeof p === 'string' && p.trim().length > 0)));
        if (files.length > 0) {
            lines.push('');
            lines.push('Son değiştirilen/oluşturulan dosyalar:');
            lines.push(files.map(f => `- ${f}`).join('\n'));
        }
        return lines.join('\n');
    }
    
    public removeLastMessage(): void {
        const activeConv = this.getActive();
        if (activeConv) {
            activeConv.messages.pop();
            // Not: Geçici olduğu için burada save() çağırmıyoruz.
        }
    }

    public getHistorySummary(): { id: string, title: string }[] {
        // "Yeni Konuşma" başlığına sahip ve içinde sadece sistem mesajı olan geçici sohbetleri listeye dahil etme
        return this.conversations
            .filter(c => !(c.title === "Yeni Konuşma" && c.messages.length <= 1))
            .sort((a, b) => b.timestamp - a.timestamp)
            .map(c => ({ id: c.id, title: c.title }));
    }

    public switchConversation(id: string): Conversation | undefined {
        const conversation = this.conversations.find(c => c.id === id);
        if (conversation) {
            this.activeConversationId = id;
        }
        return conversation;
    }

    public updateSystemPrompt(prompt: string) {
        const activeConv = this.getActive();
        if (activeConv) {
            const systemMsg = activeConv.messages.find(m => m.role === 'system');
            if (systemMsg) {
                systemMsg.content = prompt;
            } else {
                activeConv.messages.unshift({ role: 'system', content: prompt });
            }
            this.save();
        }
    }



    public deleteConversation(id: string): Conversation | null {
        // Silinecek olanın dışındaki tüm konuşmaları ve geçici olmayanları tut
        this.conversations = this.conversations.filter(c => c.id !== id && !(c.title === "Yeni Konuşma" && c.messages.length <= 1));
        
        if (this.activeConversationId === id) {
            // Aktif olan silindiyse, en son kaydedilmiş sohbete geç
            const lastConversation = this.conversations
                .filter(c => !(c.title === "Yeni Konuşma" && c.messages.length <= 1))
                .sort((a, b) => b.timestamp - a.timestamp)[0];
            
            if (lastConversation) {
                this.activeConversationId = lastConversation.id;
                return lastConversation;
            } else {
                // Hiç sohbet kalmadıysa, yeni bir tane oluştur ama bunu aktif yapma
                return this.createNew();
            }
        }
        this.save();
        return this.getActive() ?? null;
    }

    private async save() {
        // Kaydedilirken, geçici, boş "Yeni Konuşma"ları kaydetmediğimizden emin olalım.
        const conversationsToSave = this.conversations
            .filter(c => !(c.title === "Yeni Konuşma" && c.messages.length <= 1))
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 50); // En son 50 konuşmayı sakla
        await this.context.workspaceState.update('baykar.conversations', conversationsToSave);
    }

    private loadConversationsFromState() {
        const savedConversations = this.context.workspaceState.get<Conversation[]>('baykar.conversations');
        if (savedConversations && savedConversations.length > 0) {
            this.conversations = savedConversations;
        } else {
            this.conversations = [];
        }
    }

    private saveUsage() {
        this.context.workspaceState.update('baykar.conversation.usage', this.usageByConversationId);
    }

    private loadUsageFromState() {
        const saved = this.context.workspaceState.get<Record<string, number>>('baykar.conversation.usage');
        if (saved && typeof saved === 'object') {
            this.usageByConversationId = saved;
        } else {
            this.usageByConversationId = {};
        }
    }

    // --- UI State per Conversation ---
    public getUiState(conversationId?: string): { agentModeActive?: boolean } {
        const id = conversationId || (this.getActive()?.id || '');
        if (!id) return {};
        return this.uiStateByConversationId[id] || {};
    }

    public setUiState(partial: Partial<{ agentModeActive: boolean }>, conversationId?: string): void {
        const active = this.getActive();
        const id = conversationId || (active ? active.id : '');
        if (!id) return;
        const prev = this.uiStateByConversationId[id] || {};
        this.uiStateByConversationId[id] = { ...prev, ...partial };
        this.saveUiState();
    }

    private saveUiState() {
        this.context.workspaceState.update('baykar.conversation.ui', this.uiStateByConversationId);
    }

    private loadUiStateFromState() {
        const saved = this.context.workspaceState.get<Record<string, any>>('baykar.conversation.ui');
        if (saved && typeof saved === 'object') {
            this.uiStateByConversationId = saved as any;
        } else {
            this.uiStateByConversationId = {};
        }
    }
}