/* ==========================================================================
   DOSYA: src/services/ApiServiceManager.ts (STREAM UYUMLU HALE GETİRİLDİ)
   ========================================================================== */

import * as vscode from 'vscode';
import { VllmApiService } from './vLLM';
import { GeminiApiService } from './gemini';
import { EXTENSION_ID, SETTINGS_KEYS, API_SERVICES } from '../core/constants';
import { ApiServiceName, ChatMessage } from '../types';

// YENİ GÜNCELLEME: Arayüz (interface) artık hem akışlı hem de akışsız
// çağrıları yönetebilmek için esnek hale getirildi.
export interface IApiService {
    checkConnection(): Promise<boolean>;
    // Akışsız, tekil yanıt bekleyen durumlar için (örn: niyet analizi).
    generateContent(prompt: string): Promise<string>;
    // Hem akışlı (callback ile) hem de akışsız (callback'siz) çağrıları destekler.
    generateChatContent(messages: ChatMessage[], onChunk?: (chunk: string) => void, cancellationSignal?: AbortSignal): Promise<string | void>;
    // Opsiyonel: embedding üretebilen servisler (Gemini)
    // Not: vLLM bu metodu sağlamayabilir; çağırmadan önce servis adına bakın.
    embedText?(text: string): Promise<number[]>;
    // Opsiyonel: vLLM için model bağlam limiti ve tokenize
    getModelContextLimit?(): Promise<number>;
    countTokens?(text: string): Promise<number>;
}

/**
 * Aktif AI servisini (vLLM veya Gemini) yönetir ve API çağrılarını delege eder.
 */
export class ApiServiceManager implements IApiService {
    private vllmService: VllmApiService;
    private geminiService: GeminiApiService;
    private _activeServiceName: ApiServiceName;

    constructor() {
        this.vllmService = new VllmApiService();
        this.geminiService = new GeminiApiService();
        this._activeServiceName = this.getActiveServiceNameFromSettings();

        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(`${EXTENSION_ID}.${SETTINGS_KEYS.activeApiService}`) || e.affectsConfiguration(`${EXTENSION_ID}.${SETTINGS_KEYS.geminiApiKey}`)) {
                this._activeServiceName = this.getActiveServiceNameFromSettings();
                this.geminiService.updateApiKey();
            }
        });
    }
    
    private getActiveServiceNameFromSettings(): ApiServiceName {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        return config.get<ApiServiceName>(SETTINGS_KEYS.activeApiService, API_SERVICES.vllm);
    }
    
    private getActiveService(): IApiService {
        // HATA DÜZELTMESİ: Artık her iki servis de IApiService arayüzüne uyumlu.
        if (this._activeServiceName === API_SERVICES.gemini) {
            return this.geminiService;
        }
        return this.vllmService;
    }

    // Gemini’ye özel erişim gerektiğinde kullanılır (embedding gibi)
    public getGeminiService(): GeminiApiService {
        return this.geminiService;
    }

    public getActiveServiceName(): ApiServiceName {
        return this._activeServiceName;
    }

    // --- Delege Edilen Metotlar ---

    public async checkConnection(): Promise<boolean> {
        return this.getActiveService().checkConnection();
    }

    public async generateContent(prompt: string): Promise<string> {
        return this.getActiveService().generateContent(prompt);
    }

    public async generateChatContent(messages: ChatMessage[], onChunk?: (chunk: string) => void, cancellationSignal?: AbortSignal): Promise<string | void> {
        return this.getActiveService().generateChatContent(messages, onChunk, cancellationSignal);
    }

    public async embedTextIfAvailable(text: string): Promise<number[] | null> {
        const service = this.getActiveService();
        if (typeof service.embedText === 'function') {
            return service.embedText(text);
        }
        return null;
    }

    public async getContextLimitIfAvailable(): Promise<number | null> {
        const service = this.getActiveService();
        if (typeof (service as any).getModelContextLimit === 'function') {
            try { return await (service as any).getModelContextLimit(); } catch { return null; }
        }
        return null;
    }

    public async countTokensIfAvailable(text: string): Promise<number | null> {
        const service = this.getActiveService();
        if (typeof (service as any).countTokens === 'function') {
            try { return await (service as any).countTokens(text); } catch { return null; }
        }
        return null;
    }

    // Return last usage info (prompt/completion/total tokens) if service provides it
    public getLastUsageIfAvailable(): { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null {
        const service = this.getActiveService() as any;
        if (typeof service.getLastUsage === 'function') {
            try { return service.getLastUsage(); } catch { return null; }
        }
        return null;
    }
}