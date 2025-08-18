/* ==========================================================================
   MESAJ YÖNLENDİRİCİ (MESSAGE ROUTER) (AGENT SEÇİM ÖZELLİĞİ EKLENDİ)
   ========================================================================== */

import { onMessage } from '../services/vscode.js';
import * as ChatView from '../components/chat_view.js';
import * as FileTags from '../components/file_tags.js';
import * as HistoryPanel from '../components/history_panel.js';
import * as InputArea from '../components/InputArea.js';
import * as SettingsModal from '../components/settings_modal.js';
import { setContextSize, resetChatState, setAgentMode, setAgentSelectionStatus, clearAgentSelectionStatus, setIndexingActive, updateIndexerProgress, setIndexingEnabledState, setWorkspaceName, getState, setTokenLimit, updateUITexts, setHasIndex, setAgentBarExpanded } from './state.js';
import * as DOM from '../utils/dom.js';

export function initMessageListener() {
    let currentStreamingStep = null;
    let plannerStreamActive = false;
    let planTimerStart = null;
    onMessage(message => {
        const data = message.payload ?? message.value;
        
        switch (message.type) {
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
            case 'updateTokenLimit':
                // Token limiti güncellendi
                setTokenLimit(data.tokenLimit);
                InputArea.recalculateTotalAndUpdateUI();
                break;
            // --- Standart Mesajlar ---
            case 'addResponse':
                ChatView.showAiResponse(data);
                break;
            
            // --- Akış (Stream) Mesajları ---
            case 'addResponsePlaceholder': {
                ChatView.addAiResponsePlaceholder();
                // Planner süresi için başlangıcı da yedekle (plannerResult yoksa kullanılmaz)
                planTimerStart = ChatView.getPlanTimerStartMs?.() || (performance?.now ? performance.now() : Date.now());
                break;
            }
            case 'addResponseChunk': {
                ChatView.appendResponseChunk(data);
                break;
            }
            case 'streamEnd': {
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
                    // Chat modunda bu mesajları yok say
                    break;
                }
                // Her yeni ui_text geldiğinde mevcut placeholder içeriğini başlıkla sıfırla ve
                // daktilo efektini ChatView tarafındaki animasyonla (requestAnimationFrame) yap
                try {
                    const stepNo = data?.stepNo;
                    const uiText = String(data?.uiText ?? '');
                    plannerStreamActive = true;

                    // Her parçada başlığı yeniden kur (Adım numarası varsa göster)
                    const header = (typeof stepNo === 'number') ? `Adım ${stepNo}: ` : '';
                    currentStreamingStep = stepNo;
                    ChatView.replaceStreamingPlaceholderHeader(header);
                    ChatView.setPlannerStreaming(true);
                    // Adım akarken shimmer aktif (sadece placeholder için)
                    ChatView.setShimmerActive(true);
                    // Tek seferde metni kuyruğa ekle; animasyon ChatView.processTypingQueue ile yapılır
                    if (uiText.length > 0) {
                        // Her parça öncesi shimmer konumunu resetle
                        try { document.getElementById('ai-streaming-placeholder')?.querySelector('.message-content')?.style?.setProperty('background-position', '-150% 0'); } catch {}
                        ChatView.appendResponseChunk(uiText);
                    }
                } catch (e) {
                    console.warn('plannerUiChunk render error', e);
                }
                break;
            }

            // --- Planner Sonucu ---
            case 'plannerResult': {
                const { isAgentModeActive, isIndexingEnabled } = getState();
                if (!(isAgentModeActive && isIndexingEnabled)) {
                    // Chat modunda planner sonucu yok sayılır (planner zaten çağrılmaz)
                    break;
                }
                // Yeni plan geldiğinde panel tamamlandı işaretini kaldır
                try { ChatView.setPlannerPanelCompleted(false); } catch (e) {}
                const plan = data?.plan ?? data?.payload?.plan ?? data;
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
                    // Paneli doldurup göster (ui_text varsa onu kullan, yoksa action)
                    try {
                        const stepsForPanel = (plan.steps||[]).map(s => (typeof s?.ui_text === 'string' && s.ui_text.trim().length>0) ? s.ui_text.trim() : (typeof s?.action === 'string' ? s.action : ''));
                        ChatView.showPlannerPanel(stepsForPanel);
                    } catch(e) { console.warn('showPlannerPanel error', e); }
                    break;
                }
                // Streaming yoksa da tek placeholder üzerinde sırayla yaz ve finalize et
                if (!document.getElementById('ai-streaming-placeholder')) {
                    ChatView.addAiResponsePlaceholder();
                }
                (async () => {
                    for (const step of plan.steps) {
                        const stepNo = typeof step?.step === 'number' ? step.step : 0;
                        const uiTextFromPlan = typeof step?.ui_text === 'string' && step.ui_text.trim().length > 0
                            ? step.ui_text.trim()
                            : (typeof step?.action === 'string' ? step.action : '');
                        const header = stepNo > 0 ? `**Adım ${stepNo}:** ` : '';
                        ChatView.replaceStreamingPlaceholderHeader(header);
                        const totalMs = 500;
                        const interval = Math.max(10, Math.floor(totalMs / Math.max(1, uiTextFromPlan.length)));
                        let i = 0;
                        await new Promise(resolve => {
                            const timer = setInterval(() => {
                                if (i >= uiTextFromPlan.length) { clearInterval(timer); resolve(null); return; }
                                ChatView.appendResponseChunk(uiTextFromPlan[i++]);
                            }, interval);
                        });
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
                        const stepsForPanel = (plan.steps||[]).map(s => (typeof s?.ui_text === 'string' && s.ui_text.trim().length>0) ? s.ui_text.trim() : (typeof s?.action === 'string' ? s.action : ''));
                        ChatView.showPlannerPanel(stepsForPanel);
                    } catch(e) { console.warn('showPlannerPanel error', e); }
                })();
                break;
            }
            case 'plannerCompleted': {
                try { ChatView.setPlannerPanelCompleted(true); } catch (e) {}
                break;
            }

            // --- Agent durumu mesajı ---
            case 'updateAgentStatus':
                setAgentMode(data.isActive, data.activeFileName);
                try { ChatView.refreshPlannerPanelVisibility(); } catch(e) {}
                break;
            case 'restoreAgentMode':
                setAgentMode(data.isActive, '');
                if (data.isBarExpanded !== undefined) {
                    setAgentBarExpanded(data.isBarExpanded);
                }
                try { ChatView.refreshPlannerPanelVisibility(); } catch(e) {}
                break;
            case 'languageChanged':
                // Dil değişikliği sırasında UI metinlerini güncelle
                updateUITexts();
                break;
            case 'agentSelectionSet':
                setAgentSelectionStatus(data.fileName, data.startLine, data.endLine);
                break;
            case 'agentSelectionCleared':
                clearAgentSelectionStatus();
                break;

            // --- Bağlam (Context) Mesajları ---
            case 'updateContextSize':
                setContextSize(data.conversationSize, data.filesSize);
                InputArea.recalculateTotalAndUpdateUI();
                break;
            
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
        }
    });
}