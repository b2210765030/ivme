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
export const INSERT_ICON_URI = ICON_URIS_CONTAINER?.dataset?.insertIcon || '';
export const TOOL_CODE_ICON_URI = ICON_URIS_CONTAINER?.dataset?.toolCodeIcon || '';

// YENİ: Kopyala ve Değişikliği Uygula butonları için SVG ikonları
export const COPY_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
export const APPLY_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

// YENİ: Adım ekleme butonları için SVG ikonları
export const INSERT_ABOVE_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path d="M12 5v14"/><path d="m5 12 7-7 7 7"/></svg>`;
export const INSERT_BELOW_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`;

// --- Karakter Sayacı ---
export const characterCounter = document.getElementById('character-counter');
export const tokenProgressRing = document.querySelector('.token-progress-ring');
export const tokenProgressFill = document.querySelector('.token-progress-ring .progress-fill');
export const tokenPercentageText = document.querySelector('.token-progress-ring .percentage-text');
export const planActToggle = document.getElementById('plan-act-toggle');
export const planActSwitch = document.getElementById('plan-act-switch');

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
        insertAbove: 'Üste Ekle',
        insertBelow: 'Alta Ekle',
        delete: 'Sil',
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
        temperature: 'Sıcaklık',
        cancel: 'İptal',
        save: 'Kaydet',
        showPresentation: 'Geliştirme Paketi Sunumunu Göster',
        history: 'Konuşma Geçmişi',
        newChat: 'Yeni Konuşma',
        feedback: 'Geri Bildirim',
        plan: 'Plan',
        act: 'Act',
        // Yeni i18n anahtarları
        planning: 'İvme planlıyor...',
        indexingEnabledTitle: 'İndeks modu açık',
        indexingDisabledTitle: 'İndeks modu kapalı',
        languageWarningText: 'Daha iyi sonuçlar için "EN" modu önerilir.',
        plannerActionNote: 'Hazırım. <span class="accent-act">Act</span> moduna geçerseniz planı uygulayabilirim.',
        plannerPanelTitle: 'Plan Adımları',
        toggleOpenClose: 'Aç/Kapa',
        agentMode: 'Agent Modu',
        chat: 'Chat',
        historyEmpty: 'Henüz bir konuşma geçmişi yok.',
        loading: 'Yükleniyor…',
        deleteToolTitle: 'Aracı Sil',
        toolCode: 'Tool Kodu',
        customBadge: 'ÖZEL',
        systemBadge: 'SİSTEM',
        confirmDeleteTool: '"{name}" aracını silmek istediğinizden emin misiniz?',
        errorToolCreate: 'Araç oluşturulurken bir hata oluştu: ',
        errorToolDelete: 'Araç silinirken bir hata oluştu: ',
        errorUnknown: 'Bilinmeyen bir hata oluştu.',
        fillAllFields: 'Lütfen tüm alanları doldurun.',
        invalidToolName: 'Araç adı yalnızca küçük harf, rakam ve alt çizgi içerebilir. Küçük harf ile başlamalıdır.',
        toolExists: 'Bu isimde bir araç zaten mevcut. Lütfen farklı bir isim seçin.',
        testing: 'Test Ediliyor...',
        close: 'Kapat',
        showSelection: 'Seçimi göster',
        hideSelection: 'Seçimi gizle',
        toolLabel: 'Araç:',
        autoOption: '(otomatik)',
        tools: 'Araçlar',
        developer: 'Geliştirici',
        toolsHeader: 'Mevcut Araçlar',
        toolsDescription: 'Sistemde kullanılabilir araçlar ve açıklamaları:',
        toolNameHeader: 'Araç Adı',
        toolDescriptionHeader: 'Açıklama',
        toolActionsHeader: 'İşlemler',
        addToolButton: 'Yeni Araç Ekle',
        smartPlannerAssistant: 'Akıllı Planlama Asistanı',
        smartPlannerAssistantDesc: 'Agent ile ortaklaşa çalışarak planlama sürecini yönetmenizi sağlar. Her bir plan adımına ait araç seçimlerini ve düzenleme seçeneklerini açarak sürece tam hakimiyet kurun.',
        reactMode: 'ReAct Modu',
        comingSoon: 'Yakında...',
        reactModeDesc: 'Planlama ve eylem özelliklerini gerçek zamanlı olarak uygulamak için kullanılır. Bu özellik yakında gelecek.',
        autocomplete: 'Otomatik Tamamlama',
        autocompleteDesc: 'Yazım sırasında öneriler sunar. Bu özellik yakında gelecek.',
        confirmRunTitle: 'Planı çalıştırmak istiyor musunuz?',
        confirmRunBody: 'Bu istek mevcut planı şimdi çalıştırma niyeti olarak algılandı. Onaylıyor musunuz?',
        yes: 'Evet',
        no: 'Hayır',
        error: 'Hata',
        uiTextPlaceholder: 'Panelde görünecek kısa açıklama...',
        actionPlaceholder: 'Yeni adımın action alanı...',
        thoughtPlaceholder: 'Yeni adımın thought alanı...',
        noPlanSteps: 'Plan adımları bulunamadı.'
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
        insertAbove: 'Insert Above',
        insertBelow: 'Insert Below',
        delete: 'Delete',
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
        feedback: 'Feedback',
        plan: 'Plan',
        act: 'Act',
        // New i18n keys
        planning: 'İvme is planning...',
        indexingEnabledTitle: 'Indexing enabled',
        indexingDisabledTitle: 'Indexing disabled',
        languageWarningText: 'Using English (EN) is recommended for better results.',
        plannerActionNote: 'Ready. Switch to <span class="accent-act">Act</span> mode to apply the plan.',
        plannerPanelTitle: 'Plan Steps',
        toggleOpenClose: 'Expand/Collapse',
        agentMode: 'Agent Mode',
        chat: 'Chat',
        historyEmpty: 'No conversation history yet.',
        loading: 'Loading…',
        deleteToolTitle: 'Delete Tool',
        toolCode: 'Tool Code',
        customBadge: 'CUSTOM',
        systemBadge: 'SYSTEM',
        confirmDeleteTool: 'Are you sure you want to delete "{name}"?',
        errorToolCreate: 'An error occurred while creating the tool: ',
        errorToolDelete: 'An error occurred while deleting the tool: ',
        errorUnknown: 'An unknown error occurred.',
        fillAllFields: 'Please fill in all fields.',
        invalidToolName: 'Tool name may contain only lowercase letters, digits, and underscores, and must start with a letter.',
        toolExists: 'A tool with this name already exists. Please choose a different name.',
        testing: 'Testing...',
        close: 'Close',
        showSelection: 'Show selection',
        hideSelection: 'Hide selection',
        toolLabel: 'Tool:',
        autoOption: '(auto)',
        tools: 'Tools',
        developer: 'Developer',
        toolsHeader: 'Available Tools',
        toolsDescription: 'Available tools and descriptions:',
        toolNameHeader: 'Tool Name',
        toolDescriptionHeader: 'Description',
        toolActionsHeader: 'Actions',
        addToolButton: 'Add New Tool',
        smartPlannerAssistant: 'Smart Planning Assistant',
        smartPlannerAssistantDesc: 'Works with the Agent to manage the planning process. Enable per-step tool selection and editing options for full control.',
        reactMode: 'ReAct Mode',
        comingSoon: 'Coming soon...',
        reactModeDesc: 'Used to apply planning and action capabilities in real-time. This feature is coming soon.',
        autocomplete: 'Autocomplete',
        autocompleteDesc: 'Provides suggestions while typing. This feature is coming soon.',
        confirmRunTitle: 'Do you want to execute the plan?',
        confirmRunBody: 'This request is interpreted as an intention to execute the current plan now. Do you confirm?',
        yes: 'Yes',
        no: 'No',
        error: 'Error',
        uiTextPlaceholder: 'Short description to show in the panel...',
        actionPlaceholder: 'Action for the new step...',
        thoughtPlaceholder: 'Thought for the new step...',
        noPlanSteps: 'No plan steps found.'
    }
};

// Mevcut dil için metinleri al
export function getText(key) {
    const currentLanguage = localStorage.getItem('language') || 'tr';
    return i18n[currentLanguage][key] || i18n.tr[key] || key;
}