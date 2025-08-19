/* ==========================================================================
   DOSYA: src/services/GeminiApiService.ts (HATA DÜZELTİLMİŞ)
   ========================================================================== */

import * as vscode from 'vscode';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerationConfig, GenerateContentRequest } from '@google/generative-ai';
import { EXTENSION_ID, GEMINI_MODEL_NAME, GEMINI_PARAMS, SETTINGS_KEYS } from '../core/constants';
import { ChatMessage } from '../types';
import { IApiService } from './manager';

/**
 * Google Gemini API'si ile tüm etkileşimleri yöneten servis sınıfı.
 * HATA DÜZELTMESİ: AbortSignal'in doğru kullanımı.
 */
export class GeminiApiService implements IApiService {
    private genAI?: GoogleGenerativeAI;
    private apiKey?: string;

    constructor() {
        this.updateApiKey();
    }

    /**
     * Metin için embedding vektörü üretir (text-embedding-004).
     */
    public async embedText(text: string): Promise<number[]> {
        if (!this.genAI) {
            throw new Error('Gemini API anahtarı ayarlanmamış.');
        }
        try {
            const model = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
            const result: any = await model.embedContent(text);
            const values: number[] | undefined = result && result.embedding && Array.isArray(result.embedding.values)
                ? result.embedding.values
                : undefined;
            if (!values || !Array.isArray(values)) {
                throw new Error('Embedding sonucu geçersiz.');
            }
            return values;
        } catch (error: any) {
            console.error('Gemini Embedding Error:', error);
            throw new Error(`Gemini Embedding Hatası: ${error.message}`);
        }
    }

    public updateApiKey(): string | undefined {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        this.apiKey = config.get<string>(SETTINGS_KEYS.geminiApiKey);
        if (this.apiKey) {
            this.genAI = new GoogleGenerativeAI(this.apiKey);
        }
        return this.apiKey;
    }

    public async checkConnection(): Promise<boolean> {
        if (!this.genAI) {
            return false;
        }
        try {
            const model = this.genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });
            await model.countTokens("test");
            return true;
        } catch (error) {
            console.error("Gemini connection check failed:", error);
            return false;
        }
    }

    public async generateContent(prompt: string): Promise<string> {
        if (!this.genAI) {
            throw new Error('Gemini API anahtarı ayarlanmamış.');
        }

        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        const temperature = config.get<number>(SETTINGS_KEYS.temperature, 0.7);
        const model = this.genAI.getGenerativeModel({
            model: GEMINI_MODEL_NAME,
            generationConfig: { ...(GEMINI_PARAMS.completion as GenerationConfig), temperature }
        });

        try {
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (error: any) {
            console.error("Gemini API Error:", error);
            throw new Error(`Gemini API Hatası: ${error.message}`);
        }
    }
    
    public async generateChatContent(messages: ChatMessage[], onChunk?: (chunk: string) => void, cancellationSignal?: AbortSignal): Promise<string | void> {
        if (!this.genAI) {
            throw new Error('Gemini API anahtarı ayarlanmamış.');
        }

        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        const temperature = config.get<number>(SETTINGS_KEYS.temperature, 0.7);
        const model = this.genAI.getGenerativeModel({
            model: GEMINI_MODEL_NAME,
            generationConfig: { ...(GEMINI_PARAMS.chat as GenerationConfig), temperature },
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }
            ]
        });

        const { history, lastMessage } = this.prepareMessagesForGemini(messages);

        if (onChunk) {
            try {
                const request: GenerateContentRequest = {
                    contents: [...history, { role: 'user', parts: [{ text: lastMessage }] }]
                };
                
                // HATA DÜZELTMESİ: generateContentStream sadece 1 argüman alır.
                const result = await model.generateContentStream(request);
                
                for await (const chunk of result.stream) {
                    // YENİ MANTIKSAL KONTROL: Her parçayı işlemeden önce sinyali kontrol et.
                    if (cancellationSignal?.aborted) {
                        console.log('Gemini stream processing was cancelled by the user.');
                        return; // Döngüden çık ve işlemi sonlandır.
                    }
                    onChunk(chunk.text());
                }
            } catch (error: any) {
                // AbortError, döngü içinde manuel olarak çıktığımız için burada yakalanmayacak,
                // ancak olası diğer API hataları için bu blok kalmalı.
                if (error.name === 'AbortError') {
                    console.log('Gemini stream request was aborted.');
                    return;
                }
                console.error("Gemini Chat Stream API Error:", error);
                throw new Error(`Gemini Sohbet Akış Hatası: ${error.message}`);
            }
        } 
        else {
            try {
                const chat = model.startChat({ history });
                const result = await chat.sendMessage(lastMessage);
                return result.response.text();
            } catch (error: any) {
                console.error("Gemini Chat API Error:", error);
                throw new Error(`Gemini Sohbet Hatası: ${error.message}`);
            }
        }
    }

    private prepareMessagesForGemini(messages: ChatMessage[]): { history: any[], lastMessage: string } {
        const history = messages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));
        
        const lastUserMessage = history.pop();
        if (!lastUserMessage) {
            return { history: [], lastMessage: '' };
        }
        
        return { history, lastMessage: lastUserMessage.parts[0].text };
    }
}