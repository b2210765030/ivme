/* ==========================================================================
   DOSYA: src/services/VllmApiService.ts (GÜNCELLENMİŞ)
   ========================================================================== */

import axios, { AxiosError } from 'axios';
import * as vscode from 'vscode';
import { VllmCompletionResponse, VllmChatCompletionResponse, ChatMessage, VllmChatCompletionStandardChoice } from '../types';
import { EXTENSION_ID, SETTINGS_KEYS, VLLM_PARAMS } from '../core/constants';
import { IApiService } from './manager';

/**
 * vLLM sunucusuyla olan tüm API etkileşimlerini yöneten servis sınıfı.
 */
export class VllmApiService implements IApiService {

    constructor() {}
    private lastUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null = null;

    public getBaseUrl(): string {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        const raw = config.get<string>(SETTINGS_KEYS.vllmBaseUrl) || '';
        // Normalize to ensure '/v1' suffix once
        if (!raw) return '';
        try {
            const url = new URL(raw);
            const needsV1 = !/\/?v1\/?$/.test(url.pathname);
            if (needsV1) {
                const normalized = raw.replace(/\/?$/, '') + '/v1';
                return normalized;
            }
            return raw;
        } catch {
            // If not a valid URL, return as-is
            return raw;
        }
    }

    public getModelName(): string {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        return config.get<string>(SETTINGS_KEYS.vllmModelName) || '';
    }

    public getEmbeddingModelName(): string {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        const explicit = config.get<string>(SETTINGS_KEYS.vllmEmbeddingModelName) || '';
        if (!explicit) {
            // Warn once per session when falling back
            try { console.warn('[vLLM] No embedding model configured. Falling back to chat model name.'); } catch {}
        }
        // Fallback to main model name if a dedicated embedding model isn't set
        return explicit || this.getModelName();
    }
    
    public async checkConnection(): Promise<boolean> {
        const url = `${this.getBaseUrl()}/models`;
        if (!url) return false;

        try {
            await axios.get(url, { timeout: 3000 });
            return true;
        } catch (error) {
            console.error("vLLM Connection Check Error:", error);
            return false;
        }
    }
    
    public static async testConnection(baseUrl: string): Promise<{ success: boolean; message: string }> {
        if (!baseUrl || !baseUrl.trim()) {
            return { success: false, message: 'vLLM Sunucu Adresi boş olamaz.' };
        }
        // Normalize to include '/v1' suffix like getBaseUrl(), but don't break already-suffixed URLs
        let normalized = String(baseUrl).trim();
        try {
            const parsed = new URL(normalized);
            const hasV1 = /\/v1\/?$/.test(parsed.pathname);
            if (!hasV1) {
                normalized = normalized.replace(/\/?$/, '') + '/v1';
            }
        } catch {
            // If not a valid URL, best effort append '/v1' if missing pattern
            if (!/\/v1\/?$/.test(normalized)) {
                normalized = normalized.replace(/\/?$/, '') + '/v1';
            }
        }
        const url = `${normalized}/models`;

        try {
            await axios.get(url, { timeout: 3000 });
            return { success: true, message: 'Bağlantı başarılı!' };
        } catch (error) {
            console.error("vLLM Connection Test Error:", error);
            const axiosError = error as AxiosError;
            if (axiosError.code === 'ECONNREFUSED') {
                 return { success: false, message: `Bağlantı reddedildi. Adresin doğru olduğundan ve sunucunun çalıştığından emin olun: ${baseUrl}` };
            } else if (axiosError.response) {
                return { success: false, message: `Sunucudan hata yanıtı alındı (HTTP ${axiosError.response.status}). Adresin '/v1' ile bittiğini kontrol edin.` };
            } else {
                return { success: false, message: `Sunucuya ulaşılamadı. Adresi veya ağ bağlantınızı kontrol edin.` };
            }
        }
    }

    public async generateContent(prompt: string): Promise<string> {
        const url = `${this.getBaseUrl()}/completions`;
        const model = this.getModelName();

        if (!url || !model) {
            throw new Error('vLLM URL veya Model Adı yapılandırılmamış.');
        }

        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        const temperature = config.get<number>(SETTINGS_KEYS.temperature, 0.7);
        const data = {
            model: model,
            prompt: prompt,
            ...VLLM_PARAMS.completion,
            temperature,
            stream: false
        };
        const headers = { 'Content-Type': 'application/json' };

        try {
            const response = await axios.post<VllmCompletionResponse>(url, data, { headers });
            if (response.data.choices && response.data.choices.length > 0) {
                return response.data.choices[0].text;
            }
            throw new Error('vLLM sunucusundan geçersiz yanıt.');
        } catch (error: any) {
            console.error("vLLM API Error:", error.response ? error.response.data : error.message);
            throw new Error('vLLM API isteği sırasında bir hata oluştu.');
        }
    }
    
    /**
     * GÜNCELLEME: AbortSignal parametresi eklendi.
     */
    public async generateChatContent(
        messages: ChatMessage[],
        onChunk?: (chunk: string) => void,
        cancellationSignal?: AbortSignal,
        tools?: any[],
        tool_choice?: any
    ): Promise<string | void | any> {
        // Stream ve tool-calling birlikte desteklenmiyor; tools yoksa stream kullanılabilir
        if (onChunk && !tools) {
            try { console.log('[vLLM] streaming chat request (no tools). messages=', messages?.length || 0); } catch {}
            return this.generateChatContentStream(messages, onChunk, cancellationSignal);
        }

        const url = `${this.getBaseUrl()}/chat/completions`;
        const model = this.getModelName();
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        const temperature = config.get<number>(SETTINGS_KEYS.temperature, 0.7);
        const data: any = { model, messages, ...VLLM_PARAMS.chat, temperature, stream: false };

        if (tools) data.tools = tools;
        if (tool_choice) data.tool_choice = tool_choice;
        try {
            console.log('[vLLM] chat request (tool-calling possible)', {
                model,
                messagesCount: messages?.length || 0,
                toolsCount: Array.isArray(tools) ? tools.length : 0,
                toolChoice: tool_choice ? (tool_choice.function?.name || tool_choice) : 'none'
            });
        } catch {}
        
        try {
            const response = await axios.post<VllmChatCompletionResponse>(url, data, { signal: cancellationSignal });
            const choice = response.data.choices[0] as VllmChatCompletionStandardChoice;
            // Capture usage if present
            try {
                const anyResp: any = response?.data as any;
                const u = anyResp?.usage || anyResp?.token_usage || anyResp?.tokenUsage;
                if (u) {
                    this.lastUsage = {
                        prompt_tokens: Number(u.prompt_tokens ?? u.prompt ?? u.input_tokens ?? 0) || 0,
                        completion_tokens: Number(u.completion_tokens ?? u.completion ?? u.output_tokens ?? 0) || 0,
                        total_tokens: Number(u.total_tokens ?? ((u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0))) || 0
                    };
                }
            } catch {}
            if (choice && choice.message) {
                const msg: any = choice.message as any;
                if (Array.isArray(msg.tool_calls)) {
                    try { console.log('[vLLM] received tool_calls:', msg.tool_calls.map((t: any) => t?.function?.name)); } catch {}
                    return msg.tool_calls;
                }
                try { console.log('[vLLM] received content (no tool_calls). length=', (msg?.content || '').length); } catch {}
                return msg.content;
            }
            throw new Error('vLLM sunucusundan geçersiz sohbet yanıtı.');
        } catch (error: any) {
             if (axios.isCancel(error)) {
                console.log('vLLM request was cancelled.');
                return;
            }
             console.error("vLLM Chat API Error:", error.response ? error.response.data : error.message);
            throw new Error('vLLM API isteği sırasında bir hata oluştu.');
        }
    }

    /**
     * OpenAI-compatible embeddings endpoint via vLLM
     * POST { model, input }
     * Returns { data: [ { embedding: number[] } ] }
     */
    public async embedText(text: string): Promise<number[]> {
        const base = this.getBaseUrl();
        const model = this.getEmbeddingModelName();
        if (!base || !model) throw new Error('vLLM URL veya Embedding Model Name yapılandırılmamış.');

        const headers = { 'Content-Type': 'application/json' } as const;
        const payload: any = { model, input: text };
        const url = `${base}/embeddings`;

        try {
            const resp = await axios.post(url, payload, { headers });

            // Olası yanıt formatlarını kontrol et
            // Format 1 (OpenAI uyumlu): { data: [ { embedding: [...] } ] }
            const nestedEmbedding = resp?.data?.data?.[0]?.embedding;
            if (Array.isArray(nestedEmbedding)) {
                return nestedEmbedding as number[];
            }

            // Format 2 (düz): { embedding: [...] }
            const directEmbedding = resp?.data?.embedding;
            if (Array.isArray(directEmbedding)) {
                return directEmbedding as number[];
            }

            // Alternatif anahtarlar (bazı sunucular/cohere benzeri)
            const possibleValues = resp?.data?.data?.[0]?.values;
            if (Array.isArray(possibleValues)) {
                return possibleValues as number[];
            }
            const altVector = resp?.data?.vector || resp?.data?.embeddings?.[0];
            if (Array.isArray(altVector)) {
                return altVector as number[];
            }

            // Son çare: yanıttaki ilk büyük sayısal diziyi bul (>= 8 eleman)
            const pickFirstNumericArray = (obj: any): number[] | null => {
                const seen = new Set<any>();
                const stack: any[] = [obj];
                while (stack.length > 0) {
                    const cur = stack.pop();
                    if (!cur || typeof cur !== 'object') continue;
                    if (seen.has(cur)) continue;
                    seen.add(cur);
                    if (Array.isArray(cur)) {
                        if (cur.length >= 8 && cur.every(x => typeof x === 'number')) {
                            return cur as number[];
                        }
                        for (const v of cur) stack.push(v);
                    } else {
                        for (const k of Object.keys(cur)) stack.push(cur[k]);
                    }
                }
                return null;
            };
            const fallback = pickFirstNumericArray(resp?.data);
            if (Array.isArray(fallback)) {
                try { console.warn('[vLLM] Using fallback embedding extraction (numeric array search).'); } catch {}
                return fallback as number[];
            }

            try {
                const keys = resp && resp.data && typeof resp.data === 'object' ? Object.keys(resp.data) : [];
                console.warn(`[vLLM] Geçersiz embeddings yanıtı (${url}). Üst seviye anahtarlar:`, keys);
            } catch {}

            throw new Error('Geçersiz embeddings yanıtı alındı.');
        } catch (e: any) {
            console.error('vLLM Embeddings Error:', e?.response?.data || e?.message || e);
            throw new Error('vLLM embeddings isteği başarısız.');
        }
    }

    /**
     * Model bağlam limiti: vLLM OpenAI uyumlu /models veya özel endpoint ile alınabilir.
     * Burada /models listesinden aktif modelin context window değerini elde etmeyi deneriz.
     */
    public async getModelContextLimit(): Promise<number> {
        const url = `${this.getBaseUrl()}/models`;
        const model = this.getModelName();
        try {
            const resp = await axios.get(url);
            const data = resp?.data;
            const arr = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
            const found = arr.find((m: any) => (m?.id === model) || (m?.name === model));
            const ctx = found?.context_length || found?.max_context_length || found?.max_position_embeddings;
            return typeof ctx === 'number' && ctx > 0 ? ctx : 0;
        } catch (e) {
            return 0;
        }
    }

    /**
     * /tokens veya benzeri bir endpoint yoksa, kabaca tahmin edebilir ya da 0 dönebiliriz.
     * Burada basit bir fallback: sunucu count endpoint sağlamıyorsa null yerine yaklaşık hesap kullanmak UI tarafında yapılabilir.
     */
    public async countTokens(text: string): Promise<number> {
        // Eğer vLLM özel bir tokenize endpoint sağlıyorsa buraya adapte edin.
        // Şimdilik kaba tahmin: 1 token ~ 4 karakter
        try {
            const approx = Math.max(1, Math.round((text || '').length / 4));
            return approx;
        } catch {
            return 0;
        }
    }

    public getLastUsage(): { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null {
        return this.lastUsage;
    }

    /**
     * GÜNCELLEME: AbortSignal parametresi eklendi ve axios isteğine iletildi.
     */
    private async generateChatContentStream(messages: ChatMessage[], onChunk: (chunk: string) => void, cancellationSignal?: AbortSignal): Promise<void> {
        const url = `${this.getBaseUrl()}/chat/completions`;
        const model = this.getModelName();
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        const temperature = config.get<number>(SETTINGS_KEYS.temperature, 0.7);
        const data = { model, messages, ...VLLM_PARAMS.chat, temperature, stream: true, stream_options: { include_usage: true } };
        const headers = { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' };
        
        try {
            const response = await axios.post(url, data, { headers, responseType: 'stream', signal: cancellationSignal });
            
            let buffer = '';
            let finalUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null = null;
            
            for await (const chunk of response.data) {

                buffer += chunk.toString('utf8');

                let boundaryIndex = buffer.indexOf('\n\n');
                while (boundaryIndex !== -1) {
                    const event = buffer.slice(0, boundaryIndex).trim();
                    buffer = buffer.slice(boundaryIndex + 2);

                    if (!event.startsWith('data:')) {
                        boundaryIndex = buffer.indexOf('\n\n');
                        continue;
                    }

                    const jsonString = event.replace(/^data:\s*/, '').trim();


                    if (jsonString === '[DONE]') {
                        // apply usage if we collected it
                        if (finalUsage) this.lastUsage = finalUsage;
                        return;
                    }
                    
                    try {
                        const parsed = JSON.parse(jsonString);
                        if (parsed.choices && parsed.choices.length > 0 && parsed.choices[0].delta) {
                            const contentChunk = parsed.choices[0].delta.content || '';
                            if(contentChunk) onChunk(contentChunk);
                        }
                        const u = parsed?.usage || parsed?.token_usage || parsed?.tokenUsage;
                        if (u) {
                            finalUsage = {
                                prompt_tokens: Number(u.prompt_tokens ?? u.prompt ?? u.input_tokens ?? 0) || 0,
                                completion_tokens: Number(u.completion_tokens ?? u.completion ?? u.output_tokens ?? 0) || 0,
                                total_tokens: Number(u.total_tokens ?? ((u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0))) || 0
                            };
                        }
                    } catch (e) {
                        console.error("Stream JSON parse error:", e, "on chunk:", jsonString);
                    }

                    boundaryIndex = buffer.indexOf('\n\n');
                
                }
            }
        } catch (error: any) {
            // İptal hatası bir hata olarak kabul edilmemeli, sessizce sonlandırılmalı.
            if (axios.isCancel(error) || (error as AxiosError).name === 'AbortError') {
                return;
            }
            console.error("vLLM Chat API Stream Error:", error.response ? error.response.data : error.message);
            throw new Error('vLLM API akış isteği sırasında bir hata oluştu.');
        }
    }
}