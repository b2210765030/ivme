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

    public getBaseUrl(): string {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        return config.get<string>(SETTINGS_KEYS.vllmBaseUrl) || '';
    }

    public getModelName(): string {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        return config.get<string>(SETTINGS_KEYS.vllmModelName) || '';
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
        
        const url = `${baseUrl}/models`;

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
    public async generateChatContent(messages: ChatMessage[], onChunk?: (chunk: string) => void, cancellationSignal?: AbortSignal): Promise<string | void> {
        if (onChunk) {
            return this.generateChatContentStream(messages, onChunk, cancellationSignal);
        }
        
        const url = `${this.getBaseUrl()}/chat/completions`;
        const model = this.getModelName();
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        const temperature = config.get<number>(SETTINGS_KEYS.temperature, 0.7);
        const data = { model, messages, ...VLLM_PARAMS.chat, temperature, stream: false };
        
        try {
            const response = await axios.post<VllmChatCompletionResponse>(url, data, { signal: cancellationSignal });
            const choice = response.data.choices[0] as VllmChatCompletionStandardChoice;
            if (choice && choice.message) {
                return choice.message.content;
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
     * GÜNCELLEME: AbortSignal parametresi eklendi ve axios isteğine iletildi.
     */
    private async generateChatContentStream(messages: ChatMessage[], onChunk: (chunk: string) => void, cancellationSignal?: AbortSignal): Promise<void> {
        const url = `${this.getBaseUrl()}/chat/completions`;
        const model = this.getModelName();
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        const temperature = config.get<number>(SETTINGS_KEYS.temperature, 0.7);
        const data = { model, messages, ...VLLM_PARAMS.chat, temperature, stream: true };
        const headers = { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' };
        
        try {
            const response = await axios.post(url, data, { headers, responseType: 'stream', signal: cancellationSignal });
            
            let buffer = '';
            
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


                    if (jsonString === '[DONE]') return;
                    
                    try {
                        const parsed = JSON.parse(jsonString);
                        if (parsed.choices && parsed.choices.length > 0 && parsed.choices[0].delta) {
                            const contentChunk = parsed.choices[0].delta.content || '';
                            if(contentChunk) onChunk(contentChunk);
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
                console.log('vLLM stream request was cancelled.');
                return;
            }
            console.error("vLLM Chat API Stream Error:", error.response ? error.response.data : error.message);
            throw new Error('vLLM API akış isteği sırasında bir hata oluştu.');
        }
    }
}