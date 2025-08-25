// src/core/constants.ts

// --- Core Extension Identity ---
export const EXTENSION_NAME = 'İvme';
export const EXTENSION_ID = 'baykar-ai-fixer';
export const PUBLISHER_NAME = 'Baykar';

// --- API Service Configuration ---
export const API_SERVICES = {
    vllm: 'vLLM',
    gemini: 'Gemini'
};

// --- Command Identifiers ---
// Ayar komutları arayüze taşındığı için kaldırıldı.
export const COMMAND_IDS = {
    applyFix: `${EXTENSION_ID}.applyFix`,
    showChat: `baykar-ai.showChat`,
    sendToChat: `baykar-ai.sendToChat`,
    confirmAgentSelection: `${EXTENSION_ID}.confirmAgentSelection`,
    checkVllmStatus: `${EXTENSION_ID}.checkVllmStatus`, // Genel bağlantı kontrolü için kalabilir
    showPresentation: `baykar.showPresentation`,
    indexProject: `baykar-ai.indexProject`,

};

// --- VS Code Settings Keys ---
// Bunlar ayarlara erişmek için anahtar görevi görür, olduğu gibi kalmalıdır.
export const SETTINGS_KEYS = {
    // General
    activeApiService: 'api.activeService',
    temperature: 'chat.temperature',
    // Indexing
    indexingSourceName: 'indexing.sourceName',
    indexingIncludeGlobs: 'indexing.includeGlobs',
    indexingExcludeGlobs: 'indexing.excludeGlobs',
    indexingVectorStorePath: 'indexing.vectorStorePath',
    indexingEnabled: 'indexing.enabled',
    // vLLM
    vllmBaseUrl: 'vllm.baseUrl',
    vllmModelName: 'vllm.modelName',
    vllmEmbeddingModelName: 'vllm.embeddingModelName',
    // Gemini
    geminiApiKey: 'gemini.apiKey',
    // Optional reranker (e.g., Cohere)
    cohereApiKey: 'retrieval.cohereApiKey',
    conversationHistoryLimit: 'chat.conversationHistoryLimit',
    tokenLimit: 'chat.tokenLimit',
    // UI State
    agentModeActive: 'ui.agentModeActive',
    agentBarExpanded: 'ui.agentBarExpanded'
};

// --- Gemini Model Adı ---
// Bu, kullanıcı tarafından değiştirilen bir varsayılan değil, kod içinde kullanılan
// sabit bir değer olduğu için burada kalabilir.
export const GEMINI_MODEL_NAME = 'gemini-1.5-flash';

// --- API Parameters ---
// Bunlar kullanıcı ayarı değil, API'ye gönderilen sabit parametrelerdir. Burada kalmaları doğrudur.
export const VLLM_PARAMS = {
    completion: { max_tokens: 2048, temperature: 0.1 },
    chat: { max_tokens: 2048, temperature: 0.1 }
};

export const GEMINI_PARAMS = {
    completion: { maxOutputTokens: 2048, temperature: 0.1 },
    chat: { maxOutputTokens: 2048, temperature: 0.7 }
};

// --- Retrieval Defaults ---
// Faz 2 için temel retrieval konfigürasyonları
export const RETRIEVAL_DEFAULTS = {
    RETRIEVAL_TOP_K: 50,
    RERANK_TOP_N: 10,
    MAX_CONTEXT_TOKENS: 10000,
    INDEXING_ENABLED_DEFAULT: true
};

// --- User Interface Messages ---
// Kullanıcıya gösterilen mesajlar burada kalabilir.
export const UI_MESSAGES = {
    thinking: `${EXTENSION_NAME} düşünüyor...`,
    codeFixed: `Kod, ${EXTENSION_NAME} ile başarıyla düzeltildi!`,
    codeModified: `Kod, ${EXTENSION_NAME} ile başarıyla düzenlendi!`,
    vllmConnectionError: `${EXTENSION_NAME} yerel LLM sunucusuna bağlanamadı. Lütfen sohbet panelindeki ayarları kontrol edin.`,
    geminiConnectionError: `${EXTENSION_NAME} Gemini API'ye bağlanamadı. Lütfen API anahtarınızı sohbet panelindeki ayarlardan kontrol edin.`,
    apiServiceSwitched: (service: string) => `Aktif servis ${service} olarak değiştirildi.`,
    activeService: (service: string) => `Aktif Servis: ${service}`,
    // Eski prompt mesajları artık kullanılmadığı için kaldırılabilir veya saklanabilir.
    vllmStatusChecking: 'vLLM sunucu durumu kontrol ediliyor...',
    vllmStatusSuccess: 'vLLM sunucusuyla bağlantı başarılı!',
    vllmStatusError: 'vLLM sunucusuna ulaşılamadı. Lütfen adresin doğru olduğundan ve sunucunun çalıştığından emin olun.',
    vllmModelSuccess: 'vLLM model adı başarıyla kaydedildi.',
    geminiApiKeySuccess: 'Gemini API anahtarı başarıyla kaydedildi.',
};