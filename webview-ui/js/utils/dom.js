/* ==========================================================================
   DOM ELEMENT REFERANSLARI VE SABİTLER - GÜNCELLENDİ
   ========================================================================== */

export const vscode = acquireVsCodeApi();

// --- Ana Konteynerler ve Alanlar ---
export const chatContainer = document.getElementById('chat-container');
export const welcomeContainer = document.getElementById('welcome-container');
export const welcomeVideo = document.getElementById('background-video');
export const input = document.getElementById('prompt-input');
export const fileContextArea = document.getElementById('file-context-area');
export const languageWarning = document.getElementById('language-warning');


// --- Butonlar ---
export const logoButton = document.getElementById('logo-button');
export const newChatButton = document.getElementById('new-chat-button');
export const historyButton = document.getElementById('history-button');
export const settingsButton = document.getElementById('settings-button');
export const feedbackButton = document.getElementById('feedback-button');
export const sendButton = document.getElementById('send-button');
export const attachFileButton = document.getElementById('attach-file-button');
export const agentStatusBar = document.getElementById('agent-status-bar');
export const agentStatusText = document.getElementById('agent-status-text');

// Yeni: Agent mod indeksleme UI
export const indexerStartButton = document.getElementById('indexer-start-button');
export const indexerCancelButton = document.getElementById('indexer-cancel-button');
export const indexerOverlayLog = document.getElementById('indexer-overlay-log');

// --- Geçmiş Paneli ---
export const historyPanel = document.getElementById('history-panel');
export const historyListContainer = document.getElementById('history-list-container');

// --- Ayarlar Modalı Elementleri ---
export const settingsModal = document.getElementById('settings-modal');
export const settingsForm = document.getElementById('settings-form');
export const cancelSettingsButton = document.getElementById('cancel-settings-button');
export const serviceSelect = document.getElementById('service-select');
export const vllmSettings = document.getElementById('vllm-settings');
export const vllmUrlInput = document.getElementById('vllm-url');
export const vllmModelInput = document.getElementById('vllm-model');
export const geminiSettings = document.getElementById('gemini-settings');
export const geminiKeyInput = document.getElementById('gemini-key');
export const historyLimitInput = document.getElementById('history-limit');
export const navButtons = document.querySelectorAll('.nav-button');
export const settingsPanes = document.querySelectorAll('.settings-pane');


// --- İkon URI'ları ---
export const AI_ICON_URI = document.body.dataset.aiIconUri;
export const USER_ICON_URI = document.body.dataset.userIconUri;

// YENİ: Kopyala ve Değişikliği Uygula butonları için SVG ikonları
export const COPY_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
export const APPLY_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

// --- Karakter Sayacı ---
export const characterCounter = document.getElementById('character-counter');

// --- UI Metinleri ---
export const i18n = {
    thinking: 'İvme düşünüyor...'
};