/* ==========================================================================
   MESAJ YÖNLENDİRİCİ (MESSAGE ROUTER) (AGENT SEÇİM ÖZELLİĞİ EKLENDİ)
   ========================================================================== */

import { onMessage, postMessage } from '../services/vscode.js';
import * as ChatView from '../components/chat_view.js';
import * as FileTags from '../components/file_tags.js';
import * as HistoryPanel from '../components/history_panel.js';
import * as InputArea from '../components/InputArea.js';
import * as SettingsModal from '../components/settings_modal.js';
import { setContextSize, resetChatState, setAgentMode, setAgentSelectionStatus, clearAgentSelectionStatus, setIndexingActive, updateIndexerProgress, setIndexingEnabledState, setWorkspaceName, getState, setTokenLimit, updateUITexts, setHasIndex, setAgentBarExpanded, setAgentActMode, incrementConversationSize } from './state.js';
import * as DOM from '../utils/dom.js';

export function initMessageListener() {
    let currentStreamingStep = null;
    let plannerStreamActive = false;
    let planTimerStart = null;
    // ACT modunda plan açıklaması akışını UI'da maskelemek için bayrak
    let suppressPlannerExplanation = false;
    onMessage(message => {
        const data = message.payload ?? message.value;
        
        switch (message.type) {
            case 'requestExecuteConfirmation':
                try {
                    const instr = (data && (data.instruction || (data.payload && data.payload.instruction))) || '';
                    if (typeof ChatView.showConfirmationPanel === 'function') {
                        ChatView.showConfirmationPanel(instr);
                    }
                } catch (e) {}
                break;
            case 'indexingProgress':
                setIndexingActive(true);
                updateIndexerProgress(Math.round(data.percent || 0), data.message || '');
                if (data.message) {
                    InputArea.setPlaceholder(data.message);
                }
                try { ChatView.refreshPlannerPanelVisibility(); } catch(e) {}
                break;
            case 'indexingDone':
                // Önce hasIndex'i güncelle, sonra UI enable et
                if (typeof data?.hasIndex !== 'undefined') {
                    setHasIndex(!!data.hasIndex);
                } else {
                    setHasIndex(true);
                }
                updateIndexerProgress(100, '');
                setIndexingActive(false, { preserveBar: true });
                setIndexingEnabledState(true); // İndeksleme tamamlandığında active et
                // Placeholder mesajını güncelle (sadece "ivmeye soru sorun..." göster)
                InputArea.setPlaceholder();
                try { ChatView.refreshPlannerPanelVisibility(); } catch(e) {}
                break;
            case 'indexingToggled':
                // Eğer backend hasIndex bilgisi veriyorsa önce onu uygula
                if (typeof data?.hasIndex !== 'undefined') {
                    setHasIndex(!!data.hasIndex);
                    setIndexingEnabledState(data.enabled);
                } else {
                    // hasIndex bilgisi yoksa mevcut UI'yı bozmayalım; sadece aktiflik durumunu koru
                    if (data.enabled === false) {
                        setIndexingEnabledState(false);
                    }
                }
                setIndexingActive(false, { preserveBar: true });
                // Placeholder mesajını güncelle (sadece "ivmeye soru sorun..." göster)
                InputArea.setPlaceholder();
                try { ChatView.refreshPlannerPanelVisibility(); } catch(e) {}
                // disable durumunda planner steps balonunu da kaldır
                try {
                    if (data?.enabled === false) {
                        document.querySelectorAll('.planner-steps-message').forEach(el => el.remove());
                    }
                } catch(e) {}
                break;
            case 'indexingStatus':
                // İndeksleme durumu bilgisi geldi
                if (typeof data?.hasIndex !== 'undefined') {
                    setHasIndex(!!data.hasIndex);
                }
                setIndexingEnabledState(data.isEnabled);
                // Panel görünürlüğünü güncelle
                try { ChatView.refreshPlannerPanelVisibility(); } catch(e) {}
                break;
            case 'workspaceInfo':
                // Workspace bilgisi geldi
                setWorkspaceName(data.workspaceName);
                if (typeof data?.hasIndex !== 'undefined') {
                    setHasIndex(!!data.hasIndex);
                }
                break;
            case 'updateTokenLimit': {
                const limit = Number(data?.tokenLimit || 0);
                if (limit > 0) {
                    setTokenLimit(limit);
                    // Settings modal input'unu da güncel göster
                    try {
                        const input = document.getElementById('token-limit');
                        if (input) {
                            input.value = String(limit);
                            input.setAttribute('readonly', 'true');
                        }
                    } catch (e) {}
                    InputArea.recalculateTotalAndUpdateUI();
                }
                break; }
            case 'modelTokenUsage': {
                // Backend: { prompt_tokens, completion_tokens, total_tokens }
                const u = data || {};
                const completion = Number(u.completion_tokens || 0) || 0;
                if (completion > 0) {
                    try { incrementConversationSize(completion); } catch (e) {}
                    try { InputArea.recalculateTotalAndUpdateUI(); } catch (e) {}
                }
                break; }
            // --- Standart Mesajlar ---
            case 'addResponse':
                ChatView.showAiResponse(data);
                break;
            
            // --- Akış (Stream) Mesajları ---
            case 'addResponsePlaceholder': {
                ChatView.addAiResponsePlaceholder();
                // ACT modunda plan açıklamasını maskele; başlık yazma
                try {
                    const { isAgentActMode } = getState();
                    if (isAgentActMode) {
                        // Plan açıklaması akışını uygulama adımına kadar maskele
                        suppressPlannerExplanation = true;
                    }
                } catch (e) {}
                // Planner süresi için başlangıcı da yedekle (plannerResult yoksa kullanılmaz)
                planTimerStart = ChatView.getPlanTimerStartMs?.() || (performance?.now ? performance.now() : Date.now());
                break;
            }
            case 'addResponseChunk': {
                // ACT modunda plan açıklaması chunks'larını gizle
                if (suppressPlannerExplanation) break;
                ChatView.appendResponseChunk(data);
                break;
            }
            case 'streamEnd': {
                // Plan açıklaması gizleniyorsa finalize etmeyelim; adım/sumary akışı devam edebilir
                if (suppressPlannerExplanation) { suppressPlannerExplanation = false; break; }
                ChatView.finalizeStreamedResponse();
                break;
            }

            // --- Step Execution Placeholder Messages ---
            case 'stepExecStart': {
                const label = String(data?.label || '');
                ChatView.showStepExecutionPlaceholder(label);
                break;
            }
            case 'stepExecEnd': {
                const label = String(data?.label || '');
                const elapsedMs = Number(data?.elapsedMs || 0);
                const error = data?.error;
                ChatView.finishStepExecutionPlaceholder(label, elapsedMs, error);
                // Panelde ilgili adımı tamamlandı olarak işaretle
                try {
                    const idx = Number(data?.index);
                    if (!Number.isNaN(idx)) {
                        ChatView.markPlannerStepCompleted(idx);
                    }
                } catch (e) {}
                break;
            }

            // --- Summary streaming into same placeholder ---
            case 'summaryStart': {
                ChatView.startInlineSummary();
                break;
            }
            case 'summaryChunk': {
                ChatView.appendInlineSummary(String(data || ''));
                break;
            }
            case 'summaryEnd': {
                ChatView.finishInlineSummary();
                break;
            }

            // --- Planner streaming UI parça mesajı ---
            case 'plannerUiChunk': {
                const { isAgentModeActive, isIndexingEnabled } = getState();
                if (!(isAgentModeActive && isIndexingEnabled)) {
                    // Index modu kapalıysa planlama bildirimi göstermeyelim
                    break;
                }
                // PLAN AKIŞI: Index aktifken shimmer ve başlık
                try {
                    plannerStreamActive = true;
                    currentStreamingStep = data?.stepNo ?? null;
                    if (!document.getElementById('ai-streaming-placeholder')) {
                        ChatView.addAiResponsePlaceholder();
                    }
                    ChatView.setPlannerStreaming(true);
                    ChatView.setShimmerActive(true);
                    ChatView.replaceStreamingPlaceholderHeader('İvme planlıyor...');
                } catch (e) {
                    console.warn('plannerUiChunk render error', e);
                }
                break;
            }

            // --- Planner Sonucu ---
            case 'plannerResult': {
                const { isAgentModeActive, isIndexingEnabled, isAgentActMode } = getState();
                if (!(isAgentModeActive && isIndexingEnabled)) {
                    // Chat modunda planner sonucu yok sayılır (planner zaten çağrılmaz)
                    break;
                }
                const plan = data?.plan ?? data?.payload?.plan ?? data;
                // ACT modunda: paneli gizle, açıklamayı maskele, otomatik uygula
                if (isAgentActMode) {
                    try { ChatView.setPlannerPanelCompleted(false); } catch (e) {}
                    try { ChatView.showPlannerPanelWithPlan(plan); ChatView.hidePlannerPanel(); } catch (e) { try { ChatView.hidePlannerPanel(); } catch (e2) {} }
                    suppressPlannerExplanation = true;
                    try { setTimeout(() => { try { postMessage('executePlannerAll'); } catch (e) {} }, 0); } catch (e) {}
                    break;
                }
                // Yeni plan geldiğinde panel tamamlandı işaretini kaldır
                try { ChatView.setPlannerPanelCompleted(false); } catch (e) {}
                try {
                    const names = Array.isArray(plan?.steps) ? (data?.toolNames || data?.payload?.toolNames || []) : (data?.payload?.toolNames || []);
                    if (Array.isArray(names) && names.length > 0 && ChatView.setAvailableTools) {
                        ChatView.setAvailableTools(names);
                    }
                    // Tool isimleri set edildikten hemen sonra planı oluştur ki eşleşme kontrolü yapılsın
                    ChatView.showPlannerPanelWithPlan(plan);
                } catch (e) { ChatView.showPlannerPanelWithPlan(plan); }
                if (!plan || !Array.isArray(plan.steps)) {
                    ChatView.showAiResponse('Plan adımları bulunamadı.');
                    break;
                }
                // Eğer streaming aktifleştirildiyse: plan tamamlandığında aynı mesajda "İvme planladı (Xs)" yaz ve altında açıklama için boşluk bırak
                if (plannerStreamActive) {
                    plannerStreamActive = false;
                    currentStreamingStep = null;
                    const plannedBase = DOM.getText('planned') || 'İvme planladı';
                    const msNow = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                    // Öncelik chat_view başlangıç zamanında, yoksa local değişken
                    const started = ChatView.getPlanTimerStartMs?.() || planTimerStart;
                    const elapsedSec = started ? Math.max(0, (msNow - started) / 1000) : 0;
                    const plannedText = `${plannedBase} (${elapsedSec.toFixed(2)}s)`;
                    ChatView.setPlannerStreaming(false);
                    // "İvme planladı" anından sonra shimmer'ı kapat
                    ChatView.setShimmerActive(false);
                    ChatView.replaceStreamingPlaceholderWithPlanned(plannedText);
                    // Paneli adım JSON'ları ile doldur
                    try {
                        ChatView.showPlannerPanelWithPlan(plan);
                    } catch(e) { console.warn('showPlannerPanelWithPlan error', e); }
                    break;
                }
                // Streaming yoksa da sade: sadece "İvme planladı (Xs)" yaz ve paneli güncelle
                if (!document.getElementById('ai-streaming-placeholder')) {
                    ChatView.addAiResponsePlaceholder();
                }
                const plannedBase = DOM.getText('planned') || 'İvme planladı';
                const msNow = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                const started = ChatView.getPlanTimerStartMs?.() || planTimerStart;
                const elapsedSec = started ? Math.max(0, (msNow - started) / 1000) : 0;
                const plannedText = `${plannedBase} (${elapsedSec.toFixed(2)}s)`;
                ChatView.setPlannerStreaming(false);
                ChatView.setShimmerActive(false);
                ChatView.replaceStreamingPlaceholderWithPlanned(plannedText);
                try {
                    ChatView.showPlannerPanelWithPlan(plan);
                } catch(e) { console.warn('showPlannerPanelWithPlan error', e); }
                break;
            }
            case 'plannerCompleted': {
                try { ChatView.setPlannerPanelCompleted(true); } catch (e) {}
                // Plan->Act geçişinde tamamlanınca paneli 3sn sonra kapat
                try {
                    const { isAgentActMode } = getState();
                    if (isAgentActMode) {
                        setTimeout(() => { try { ChatView.hidePlannerPanel(); } catch (e) {} }, 3000);
                    }
                } catch (e) {}
                break;
            }

            // Yeni adım eklendi - panel güncelle
            case 'plannerStepInserted': {
                const plan = data?.plan;
                const insertedIndex = data?.insertedIndex;
                if (plan && Array.isArray(plan.steps)) {
                    try {
                        // Completed step tracking'i güncelle
                        if (typeof insertedIndex === 'number') {
                            ChatView.updateCompletedStepsAfterInsertion(insertedIndex);
                        }
                        ChatView.showPlannerPanelWithPlan(plan);
                    } catch(e) { console.warn('plannerStepInserted update error', e); }
                }
                break;
            }
            // Planner adımı silindi - paneli güncelle
            case 'plannerStepDeleted': {
                const plan = data?.plan;
                const deletedIndex = data?.deletedIndex;
                if (plan && Array.isArray(plan.steps)) {
                    try {
                        if (typeof deletedIndex === 'number') {
                            ChatView.updateCompletedStepsAfterDeletion(deletedIndex);
                        }
                        ChatView.showPlannerPanelWithPlan(plan);
                    } catch(e) { console.warn('plannerStepDeleted update error', e); }
                }
                break;
            }

            // --- Agent durumu mesajı ---
            case 'updateAgentStatus':
                setAgentMode(data.isActive, data.activeFileName);
                try { ChatView.refreshPlannerPanelVisibility(); } catch(e) {}
                break;
            case 'restoreAgentMode':
                // Accept payload nested or flat for compatibility
                try {
                    const p = message.payload || message.value || data || {};
                    const isActive = typeof p.isActive === 'boolean' ? p.isActive : !!p.payload?.isActive;
                    const isBarExpanded = (Object.prototype.hasOwnProperty.call(p, 'isBarExpanded') ? p.isBarExpanded : p.payload?.isBarExpanded);
                    const isActMode = (Object.prototype.hasOwnProperty.call(p, 'isActMode') ? p.isActMode : p.payload?.isActMode);
                    // Apply bar expansion first so setAgentMode can reflect it in DOM
                    if (typeof isBarExpanded === 'boolean') setAgentBarExpanded(!!isBarExpanded);
                    setAgentMode(!!isActive, '');
                    if (typeof isActMode === 'boolean') setAgentActMode(!!isActMode);
                    // Ensure toggle visibility is synced after applying modes
                    try { updatePlanActToggleVisibility(); } catch (e) {}
                } catch {}
                try { ChatView.refreshPlannerPanelVisibility(); } catch(e) {}
                break;
            case 'languageChanged':
                // Dil değişikliği sırasında UI metinlerini güncelle
                updateUITexts();
                break;
            case 'agentSelectionSet':
                setAgentSelectionStatus(data.fileName, data.startLine, data.endLine, data.content);
                break;
            case 'agentSelectionCleared':
                clearAgentSelectionStatus();
                break;

            // --- Bağlam (Context) Mesajları ---
            case 'updateContextSize': {
                // Backend'den gelen konuşma ve dosya token sayılarını state'e uygula
                try {
                    const conv = Number(data?.conversationSize || 0) || 0;
                    const files = Number(data?.filesSize || 0) || 0;
                    setContextSize(conv, files);
                } catch (e) {}
                try { InputArea.recalculateTotalAndUpdateUI(); } catch (e) {}
                break; }
            
            case 'fileContextSet': 
                FileTags.display(message.fileNames); 
                break;

            case 'clearContext':
            case 'clearFileContext':
                FileTags.clear(); 
                break;
            
            // YENİ/GÜNCELLENDİ: Hem manuel seçim hem de agent seçimi için placeholder'ı ayarlar.
            case 'contextSet': 
                 // Artık placeholder güncellemiyoruz
                 break;

            // --- Diğer Mesajlar ---
            case 'loadConfig':
                SettingsModal.loadConfig(data);
                break;

            case 'loadHistory':
                HistoryPanel.populate(data);
                break;

            case 'clearChat':
                ChatView.clear();
                resetChatState();
                InputArea.recalculateTotalAndUpdateUI();
                InputArea.autoResize();
                break;

            case 'loadConversation':
                // Yeni sayfa/konuşma yüklenirken eski planner adımları görünmesin
                try { ChatView.hidePlannerPanel(); } catch(e) {}
                ChatView.load(data);
                break;

            case 'settingsSaveResult':
                SettingsModal.handleSaveResult(data);
                break;

            // Custom Tools Messages
            case 'customToolCreated':
                SettingsModal.handleCustomToolCreated(data);
                break;

            case 'customToolDeleted':
                SettingsModal.handleCustomToolDeleted(data);
                break;

            case 'customToolsList':
                SettingsModal.handleCustomToolsList(data);
                break;

            case 'toolsInitialized':
                SettingsModal.handleToolsInitialized(data);
                break;
        }
    });
}