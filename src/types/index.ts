/* ==========================================================================
   DOSYA: src/types/index.ts (GÜNCELLENMİŞ VE BASİTLEŞTİRİLMİŞ)
   ========================================================================== */

import { API_SERVICES } from '../core/constants';

// A type for the names of available services
export type ApiServiceName = typeof API_SERVICES[keyof typeof API_SERVICES];

//================================================
// API and Service Types
//================================================

/** vLLM'den gelen standart (akışsız) bir tamamlama yanıtının yapısını tanımlar. */
export interface VllmCompletionResponse {
    choices: Array<{
        text: string;
    }>;
}

/** * YENİ: vLLM'den gelen sohbet tamamlama yanıtının akış (stream) parçasının yapısını tanımlar.
 * Akış sırasında 'delta' objesi gelir.
 */
export interface VllmChatCompletionStreamChoice {
    delta: {
        content?: string;
    };
    index: number;
    finish_reason: string | null;
}

/** * YENİ: vLLM'den gelen sohbet tamamlama yanıtının standart (akışsız) halini tanımlar.
 * Akış bittiğinde veya akışsız isteklerde 'message' objesi gelir.
 */
export interface VllmChatCompletionStandardChoice {
     message: {
        content: string;
    };
    index: number;
    finish_reason: string | null;
}


/** vLLM'den gelen bir sohbet tamamlama yanıtının genel yapısı. Hem akış hem de standart yanıtları kapsar. */
export interface VllmChatCompletionResponse {
    choices: Array<VllmChatCompletionStreamChoice | VllmChatCompletionStandardChoice>;
}


/** Konuşma geçmişindeki tek bir mesajın yapısı. */
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/** Tek bir konuşma oturumunu temsil eder. */
export interface Conversation {
    id: string; 
    timestamp: number; 
    title: string; 
    messages: ChatMessage[];
}

//================================================
// Indexing Types
//================================================

export type CodeContentType = 'function' | 'class' | 'method' | 'interface' | 'import' | 'variable' | 'markdown_comment' | 'json_property' | 'css_rule' | 'other';

export interface CodeChunkMetadata {
    id: string;
    source: string;
    filePath: string;
    language: string;
    contentType: CodeContentType;
    name: string;
    startLine: number;
    endLine: number;
    dependencies: string[];
    content: string;
    summary?: string;
    embedding?: number[];
}

//================================================
// VS Code Command and Webview Message Argument Types
//================================================

/** 'applyFix' komutunun argüman yapısı. */
export interface ApplyFixArgs {
  uri: string;
  diagnostic: {
    message: string;
    range: [number, number, number, number];
  };
}
