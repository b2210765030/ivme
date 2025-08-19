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
export const tokenLimitInput = document.getElementById('token-limit');
export const temperatureInput = document.getElementById('temperature');
export const temperatureLabel = document.getElementById('temperature-label');
export const navButtons = document.querySelectorAll('.nav-button');
export const settingsPanes = document.querySelectorAll('.settings-pane');


// --- İkon URI'ları ---
export const AI_ICON_URI = document.body.dataset.aiIconUri;
export const USER_ICON_URI = document.body.dataset.userIconUri;
const ICON_URIS_CONTAINER = document.getElementById('icon-uris');
export const EDIT_ICON_URI = ICON_URIS_CONTAINER?.dataset?.editIcon || '';
export const APPLY_ICON_URI = ICON_URIS_CONTAINER?.dataset?.applyIcon || '';

// YENİ: Kopyala ve Değişikliği Uygula butonları için SVG ikonları
export const COPY_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
export const APPLY_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

// --- Karakter Sayacı ---
export const characterCounter = document.getElementById('character-counter');
export const tokenProgressRing = document.querySelector('.token-progress-ring');
export const tokenProgressFill = document.querySelector('.token-progress-ring .progress-fill');
export const tokenPercentageText = document.querySelector('.token-progress-ring .percentage-text');

// --- UI Metinleri ---
export const i18n = {
    tr: {
        thinking: 'İvme düşünüyor...',
        planned: 'İvme planladı',
        planExplaining: 'Plan açıklaması',
        responding: 'İvme yanıtlıyor, lütfen bekleyin...',
        placeholder: 'ivmeye soru sorun...',
        welcomeSubtitle: 'Kod geliştirme ve analiz süreçlerinizi yapay zeka ile hızlandırın.',
        copy: 'Kopyala',
        copied: 'Kopyalandı!',
        apply: 'Değişikliği Uygula',
        applied: 'Uygulandı!',
        edit: 'Düzenle',
        stepJsonTitle: 'Adım JSON',
        stop: 'Durdur',
        send: 'Gönder',
        tokenUsage: '📊 Token Kullanımı',
        tokenDetail: '📋 Detay:',
        conversation: '• Konuşma:',
        files: '• Dosyalar:',
        prompt: '• Prompt:',
        remaining: '• Kalan:',
        tokens: 'tokens',
        // HTML metinleri
        attachFile: 'Dosya Ekle',
        modChange: 'Mod Değiştir',
        indexProject: 'Projeyi İndeksle',
        index: 'İndeksle',
        showAgentContext: 'Agent bağlamını göster',
        agent: 'Agent',
        agentActive: 'Agent Aktif',
        activeContext: 'Aktif bağlam',
        hideContext: 'Bağlamı gizle',
        settings: 'Ayarlar',
        services: 'Servisler',
        interface: 'Arayüz',
        general: 'Genel',
        activeService: 'Aktif Servis',
        vllmServerAddress: 'vLLM Sunucu Adresi',
        vllmModelName: 'vLLM Model Adı',
        geminiApiKey: 'Gemini API Anahtarı',
        enterApiKey: 'API Anahtarınızı girin',
        backgroundVideo: 'Arka Plan Videosu',
        backgroundVideoDesc: 'Karşılama ekranında oynatılan arka plan videosunu açar veya kapatır.',
        conversationHistoryLimit: 'Konuşma Geçmişi Limiti',
        conversationHistoryDesc: 'Sohbete gönderilecek önceki mesaj sayısı. Modelin bağlamı hatırlaması için kullanılır.',
        tokenLimit: 'Token Limiti',
        tokenLimitDesc: 'Maksimum token sayısı. Bu limit aşıldığında yeni mesaj gönderilemez.',
        temperature: 'Sıcaklık (Temperature)',
        cancel: 'İptal',
        save: 'Kaydet',
        showPresentation: 'Geliştirme Paketi Sunumunu Göster',
        history: 'Konuşma Geçmişi',
        newChat: 'Yeni Konuşma',
        feedback: 'Geri Bildirim'
    },
    en: {
        thinking: 'İvme is thinking...',
        planned: 'İvme planned',
        planExplaining: 'Plan explanation',
        responding: 'İvme is responding, please wait...',
        placeholder: 'ask İvme a question...',
        welcomeSubtitle: 'Accelerate your code development and analysis with AI.',
        copy: 'Copy',
        copied: 'Copied!',
        apply: 'Apply Change',
        applied: 'Applied!',
        edit: 'Edit',
        stepJsonTitle: 'Step JSON',
        stop: 'Stop',
        send: 'Send',
        tokenUsage: '📊 Token Usage',
        tokenDetail: '📋 Details:',
        conversation: '• Conversation:',
        files: '• Files:',
        prompt: '• Prompt:',
        remaining: '• Remaining:',
        tokens: 'tokens',
        // HTML metinleri
        attachFile: 'Attach File',
        modChange: 'Change Mode',
        indexProject: 'Index Project',
        index: 'Index',
        showAgentContext: 'Show Agent Context',
        agent: 'Agent',
        agentActive: 'Agent Active',
        activeContext: 'Active Context',
        hideContext: 'Hide Context',
        settings: 'Settings',
        services: 'Services',
        interface: 'Interface',
        general: 'General',
        activeService: 'Active Service',
        vllmServerAddress: 'vLLM Server Address',
        vllmModelName: 'vLLM Model Name',
        geminiApiKey: 'Gemini API Key',
        enterApiKey: 'Enter your API key',
        backgroundVideo: 'Background Video',
        backgroundVideoDesc: 'Enables or disables the background video played on the welcome screen.',
        conversationHistoryLimit: 'Conversation History Limit',
        conversationHistoryDesc: 'Number of previous messages to send to the conversation. Used for the model to remember context.',
        tokenLimit: 'Token Limit',
        tokenLimitDesc: 'Maximum number of tokens. New messages cannot be sent when this limit is exceeded.',
        temperature: 'Temperature',
        cancel: 'Cancel',
        save: 'Save',
        showPresentation: 'Show Development Package Presentation',
        history: 'Conversation History',
        newChat: 'New Chat',
        feedback: 'Feedback'
    }
};

// Mevcut dil için metinleri al
export function getText(key) {
    const currentLanguage = localStorage.getItem('language') || 'tr';
    return i18n[currentLanguage][key] || i18n.tr[key] || key;
}