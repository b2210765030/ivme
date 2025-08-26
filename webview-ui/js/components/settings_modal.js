/* ==========================================================================
   SETTINGS MODAL BİLEŞENİ (GÜNCELLENMİŞ)
   ========================================================================== */
   
import * as DOM from '../utils/dom.js';
import * as VsCode from '../services/vscode.js';
import * as ChatView from './chat_view.js';
// YENİ: Gerekli state fonksiyonları import edildi
import { getState, setBackgroundVideoEnabled } from '../core/state.js';

// All tools array - will be loaded from backend (.ivme/tools.json)
let allTools = [];

// Pending helper: show a row immediately while backend creates the tool
function addPendingTool(toolData) {
	const name = String(toolData?.name || '').trim();
	if (!name) return;
	const exists = allTools.some(t => t.name === name);
	if (!exists) {
		allTools.push({
			name,
			description: String(toolData?.description || ''),
			type: 'custom',
			status: 'pending'
		});
	} else {
		allTools = allTools.map(t => t.name === name ? { ...t, status: 'pending' } : t);
	}
	populateToolsTable();
}

function setupToolButtons() {
    // Add Tool button event listener
    const addToolButton = document.getElementById('add-tool-button');
    if (addToolButton) {
        // Ensure previously bound listener is removed
        try { addToolButton.removeEventListener('click', openToolCreator); } catch (e) {}
        // If the button is disabled (feature gated), do not bind click handler so it's not clickable
        if (!addToolButton.disabled && addToolButton.getAttribute('aria-disabled') !== 'true') {
            addToolButton.addEventListener('click', openToolCreator);
        }
    }
}

function closeModal() {
    DOM.settingsModal.classList.add('hidden');
    // Hata mesajını temizle
    const errorContainer = document.getElementById('vllm-connection-error');
    if (errorContainer) {
        errorContainer.classList.add('hidden');
        errorContainer.textContent = '';
    }
}

function handleServiceChange() {
    DOM.vllmSettings.classList.toggle('hidden', DOM.serviceSelect.value === 'Gemini');
    DOM.geminiSettings.classList.toggle('hidden', DOM.serviceSelect.value !== 'Gemini');
}

function populateToolsTable() {
    const toolsTableBody = document.getElementById('tools-table-body');
    if (!toolsTableBody) return;

    // Clear existing content
    toolsTableBody.innerHTML = '';

    // Add all tools from .ivme/tools.json
    allTools.forEach(tool => {
        const isCustom = tool.type === 'custom';
        const toolRow = createToolRow(tool, isCustom);
        toolsTableBody.appendChild(toolRow);
    });
}

function createToolRow(tool, isCustom = false) {
    const toolRow = document.createElement('div');
    const isPending = tool?.status === 'pending';
    toolRow.className = isPending ? 'tool-row pending' : 'tool-row';
    toolRow.dataset.toolName = String(tool?.name || '');
    
    const toolName = document.createElement('div');
    toolName.className = 'tool-name';
    toolName.textContent = tool.name;
    
    const toolDescription = document.createElement('div');
    toolDescription.className = 'tool-description';
    toolDescription.textContent = isPending ? (tool.description || 'Yükleniyor…') : tool.description;
    
    const toolActions = document.createElement('div');
    toolActions.className = 'tool-actions';
    
    if (isPending) {
        const loading = document.createElement('div');
        loading.className = 'tool-loading';
        loading.innerHTML = '<span class="loading-indicator" aria-hidden="true"></span><span class="loading-text">Yükleniyor…</span>';
        toolActions.appendChild(loading);
    } else if (isCustom) {
        // Add delete button for custom tools
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'delete-tool-button';
        deleteButton.title = 'Aracı Sil';
        deleteButton.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 1.152l.557 10.056A2 2 0 0 0 5.046 16h5.908a2 2 0 0 0 1.993-1.792l.557-10.056a.58.58 0 0 0-.01-1.152H11ZM9 5a.5.5 0 1 1-1 0v6a.5.5 0 0 1 1 0V5Zm-3 0a.5.5 0 1 1-1 0v6a.5.5 0 0 1 1 0V5Z"/>
            </svg>
        `;
        deleteButton.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); deleteCustomTool(tool.name); });
        toolActions.appendChild(deleteButton);

        // Yeni: Tool Code görüntüleme/düzenleme butonu (silme butonunun altında)
        const codeButton = document.createElement('button');
        codeButton.type = 'button';
        codeButton.className = 'tool-code-button';
        codeButton.title = 'Tool Code';
        codeButton.innerHTML = `<img src="${DOM.TOOL_CODE_ICON_URI}" alt="code" width="14" height="14"/>`;
        codeButton.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); openToolCodeEditor(tool.name); });
        toolActions.appendChild(codeButton);
        
        // Add custom tool badge
        toolName.innerHTML += ' <span class="custom-tool-badge">[ÖZEL]</span>';
    } else {
        toolActions.innerHTML = '<span class="system-tool-badge">SİSTEM</span>';
    }
    
    toolRow.appendChild(toolName);
    toolRow.appendChild(toolDescription);
    toolRow.appendChild(toolActions);
    
    return toolRow;
}



function openToolCreator() {
    const modal = document.getElementById('tool-creator-modal');
    if (modal) {
        modal.classList.remove('hidden');
        // Clear form
        document.getElementById('tool-creator-form').reset();
    }
}

function closeToolCreator() {
    const modal = document.getElementById('tool-creator-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function deleteCustomTool(toolName) {
    const proceed = confirm(`"${toolName}" aracını silmek istediğinizden emin misiniz?`);
    if (!proceed) return;
    // Optimistic UI: remove immediately from table
    allTools = allTools.filter(tool => tool.name !== toolName);
    populateToolsTable();
    // Send delete request to backend (will also broadcast fresh list)
    VsCode.postMessage('deleteCustomTool', { toolName });
}

async function createCustomTool(toolData) {
    try {
        // Show pending row immediately
        addPendingTool(toolData);

        // Send tool creation request to backend
        VsCode.postMessage('createCustomTool', toolData);
        
        // Close modal
        closeToolCreator();
        
        // Tool creation request sent (pending row added)
        
    } catch (error) {
        console.error('Error creating custom tool:', error);
        alert('Araç oluşturulurken bir hata oluştu: ' + error.message);
    }
}

// --- Public Fonksiyonlar ---

export function init() {
    DOM.settingsButton.addEventListener('click', () => {
        VsCode.postMessage('requestConfig');
        DOM.settingsModal.classList.remove('hidden');
        // Populate tools table when modal opens
        populateToolsTable();
        
        // Setup tool buttons when modal opens
        setupToolButtons();
    });

    DOM.cancelSettingsButton.addEventListener('click', closeModal);
    DOM.settingsModal.addEventListener('click', (event) => {
        if (event.target === DOM.settingsModal) closeModal();
    });

    DOM.navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const currentActiveButton = document.querySelector('.nav-button.active');
            if (currentActiveButton === button) return;
            
            document.querySelector('.settings-pane.active')?.classList.remove('active');
            currentActiveButton?.classList.remove('active');

            button.classList.add('active');
            document.getElementById(button.dataset.target).classList.add('active');
        });
    });

    DOM.serviceSelect.addEventListener('change', handleServiceChange);

    // Temperature slider live label update + ensure precision is preserved
    if (DOM.temperatureInput && DOM.temperatureLabel) {
        const updateTempLabel = () => {
            const v = Number(DOM.temperatureInput.value);
            const clamped = Math.max(0, Math.min(2, isFinite(v) ? v : 0.7));
            DOM.temperatureInput.value = String(clamped);
            DOM.temperatureLabel.textContent = clamped.toFixed(1);
        };
        DOM.temperatureInput.addEventListener('input', updateTempLabel);
        DOM.temperatureInput.addEventListener('change', updateTempLabel);
    }

    // YENİ: Video Oynatma Butonu Mantığı
    const videoToggle = document.getElementById('video-toggle-switch');
    if (videoToggle) {
        // Butonun başlangıç durumunu state'den al
        videoToggle.checked = getState().isBackgroundVideoEnabled;

        // Değiştiğinde state'i güncelle
        videoToggle.addEventListener('change', (event) => {
            setBackgroundVideoEnabled(event.currentTarget.checked);
        });
    }

    // YENİ: Diffusion Effect Butonu (Şimdilik sadece state değiştirir, mantığı ChatView.js'de)
    const effectToggle = document.getElementById('effect-toggle-switch');
    if (effectToggle) {
        effectToggle.disabled = true;
        effectToggle.checked = false;
    }

    DOM.settingsForm.addEventListener('submit', (event) => {
        event.preventDefault();
        
        const errorContainer = document.getElementById('vllm-connection-error');
        if (errorContainer) {
            errorContainer.classList.add('hidden');
            errorContainer.textContent = '';
        }

        const saveButton = DOM.settingsForm.querySelector('button[type="submit"]');
        saveButton.disabled = true;
        saveButton.textContent = 'Test Ediliyor...';

        const settingsPayload = {
            activeApiService: DOM.serviceSelect.value,
            vllmBaseUrl: DOM.vllmUrlInput.value,
            vllmModelName: DOM.vllmModelInput.value,
            geminiApiKey: DOM.geminiKeyInput.value,
            conversationHistoryLimit: DOM.historyLimitInput.value,
            temperature: DOM.temperatureInput ? DOM.temperatureInput.value : 0.7
        };
        VsCode.postMessage('saveSettings', settingsPayload);
    });

    // Tool Creator Event Listeners will be setup when modal opens

    const closeToolCreatorButton = document.getElementById('close-tool-creator');
    if (closeToolCreatorButton) {
        closeToolCreatorButton.addEventListener('click', closeToolCreator);
    }

    const cancelToolCreatorButton = document.getElementById('cancel-tool-creator');
    if (cancelToolCreatorButton) {
        cancelToolCreatorButton.addEventListener('click', closeToolCreator);
    }

    const toolCreatorModal = document.getElementById('tool-creator-modal');
    if (toolCreatorModal) {
        toolCreatorModal.addEventListener('click', (event) => {
            if (event.target === toolCreatorModal) {
                closeToolCreator();
            }
        });
    }

    const toolCreatorForm = document.getElementById('tool-creator-form');
    if (toolCreatorForm) {
        toolCreatorForm.addEventListener('submit', (event) => {
            event.preventDefault();
            
            const toolName = document.getElementById('tool-name').value.trim();
            const toolDescription = document.getElementById('tool-description').value.trim();
            const toolFunctionality = document.getElementById('tool-functionality').value.trim();
            
            if (!toolName || !toolDescription || !toolFunctionality) {
                alert('Lütfen tüm alanları doldurun.');
                return;
            }

            // Validate tool name format (snake_case)
            if (!/^[a-z][a-z0-9_]*$/.test(toolName)) {
                alert('Araç adı yalnızca küçük harf, rakam ve alt çizgi içerebilir. Küçük harf ile başlamalıdır.');
                return;
            }

            // Check if tool name already exists
            const existingTool = allTools.find(tool => tool.name === toolName);
            if (existingTool) {
                alert('Bu isimde bir araç zaten mevcut. Lütfen farklı bir isim seçin.');
                return;
            }

            const toolData = {
                name: toolName,
                description: toolDescription,
                functionality: toolFunctionality
            };

            createCustomTool(toolData);
        });
    }
}

export function handleSaveResult(payload) {
    const saveButton = DOM.settingsForm.querySelector('button[type="submit"]');
    saveButton.disabled = false;
    saveButton.textContent = 'Kaydet';

    if (payload.success) {
        closeModal();
    } else {
        const errorContainer = document.getElementById('vllm-connection-error');
        if (errorContainer && DOM.serviceSelect.value === 'vLLM') {
            errorContainer.textContent = payload.message || 'Bilinmeyen bir hata oluştu.';
            errorContainer.classList.remove('hidden');
        } else {
            // vLLM seçili değilse inline hata göstermiyoruz.
        }
    }
}

export function loadConfig(config) {
    DOM.vllmUrlInput.value = config.vllmBaseUrl;
    DOM.vllmModelInput.value = config.vllmModelName;
    DOM.geminiKeyInput.value = config.geminiApiKey;
    DOM.historyLimitInput.value = config.conversationHistoryLimit;
    // Token limit artık modelden otomatik alınıyor; alanı readonly yap ve güncel değeri backend'den gelen updateTokenLimit ile set edeceğiz
    if (DOM.tokenLimitInput) {
        DOM.tokenLimitInput.setAttribute('readonly', 'true');
        try { DOM.tokenLimitInput.classList.add('readonly'); } catch(e) {}
    }
    DOM.serviceSelect.value = config.activeApiService;
    if (DOM.temperatureInput) {
        const t = typeof config.temperature === 'number' ? config.temperature : 0.7;
        const clamped = Math.max(0, Math.min(2, t));
        DOM.temperatureInput.value = String(clamped);
        if (DOM.temperatureLabel) DOM.temperatureLabel.textContent = clamped.toFixed(1);
    }
    handleServiceChange();

    // Request tools from backend when config is loaded
    VsCode.postMessage('requestCustomTools');
}

// Handle custom tool creation response
export function handleCustomToolCreated(payload) {
    try {
        if (payload.success) {
            const created = payload.tool || {};
            const name = String(created.name || '');
            // Update existing pending row if present; otherwise append
            let updated = false;
            allTools = allTools.map(t => {
                if (t.name === name) {
                    updated = true;
                    return {
                        name,
                        description: created.description,
                        schema: created.schema,
                        code: created.code,
                        type: 'custom'
                    };
                }
                return t;
            });
            if (!updated && name) {
                allTools.push({
                    name,
                    description: created.description,
                    schema: created.schema,
                    code: created.code,
                    type: 'custom'
                });
            }
            populateToolsTable();
            // Fetch the persisted tools.json instantly to reflect final state
            VsCode.postMessage('requestCustomTools');
            // Custom tool created successfully
        } else {
            const name = String(payload?.tool?.name || '');
            allTools = allTools.map(t => t.name === name ? { ...t, status: 'error' } : t);
            populateToolsTable();
            alert('Araç oluşturulurken bir hata oluştu: ' + (payload.error || 'Bilinmeyen hata'));
        }
    } catch (e) {
        console.error('handleCustomToolCreated error', e);
    }
}

// Handle custom tool deletion response
export function handleCustomToolDeleted(payload) {
    if (payload.success) {
        try {
            // Ensure local state is clean and UI is synced with backend
            if (payload.toolName) {
                allTools = allTools.filter(t => t.name !== payload.toolName);
            }
            populateToolsTable();
            // Fetch fresh list from tools.json to guarantee persistence reflected
            VsCode.postMessage('requestCustomTools');
            // Custom tool deleted successfully
        } catch (e) { console.error('handleCustomToolDeleted sync error', e); }
    } else {
        alert('Araç silinirken bir hata oluştu: ' + (payload.error || 'Bilinmeyen hata'));
        // Reload custom tools from backend to ensure consistency
        VsCode.postMessage('requestCustomTools');
    }
}

// Handle custom tools list response
export function handleCustomToolsList(payload) {
    if (payload.success && Array.isArray(payload.tools)) {
        // Merge incoming tools with any pending ones not yet materialized
        const incoming = payload.tools || [];
        const pending = allTools.filter(t => t.status === 'pending');
        const merged = [...incoming];
        for (const p of pending) {
            if (!incoming.some(t => t.name === p.name)) {
                merged.push(p);
            }
        }
        allTools = merged;
        populateToolsTable();
        try {
            // Planner tool selector'larına da güncel listeyi aktar
            const names = allTools.map(t => t.name);
            if (typeof ChatView.setAvailableTools === 'function') {
                ChatView.setAvailableTools(names);
            }
        } catch (e) { /* ignore */ }
    }
}

// Tool code modal state
let activeToolCodeName = '';

function openToolCodeEditor(toolName) {
    try {
        activeToolCodeName = String(toolName || '');
        const modal = document.getElementById('tool-code-modal');
        const title = document.getElementById('tool-code-title');
        const editor = document.getElementById('tool-code-editor');
        if (!modal || !title || !editor) return;

        // Find code from allTools (may require full fetch later)
        const tool = (allTools || []).find(t => t.name === activeToolCodeName);
        const code = (tool && tool.code) ? String(tool.code) : '';
        title.textContent = `Tool Kodu: ${activeToolCodeName}`;
        editor.value = code;

        modal.classList.remove('hidden');

        // Bind actions
        const saveBtn = document.getElementById('save-tool-code');
        const closeBtn = document.getElementById('close-tool-code');
        if (saveBtn && !saveBtn.dataset.bound) {
            saveBtn.dataset.bound = '1';
            saveBtn.addEventListener('click', saveToolCodeChanges);
        }
        if (closeBtn && !closeBtn.dataset.bound) {
            closeBtn.dataset.bound = '1';
            closeBtn.addEventListener('click', closeToolCodeModal);
        }
    } catch (e) { console.error('openToolCodeEditor error', e); }
}

function closeToolCodeModal() {
    const modal = document.getElementById('tool-code-modal');
    if (modal) modal.classList.add('hidden');
}

function saveToolCodeChanges() {
    try {
        const editor = document.getElementById('tool-code-editor');
        const newCode = String(editor && editor.value || '');
        if (!activeToolCodeName) return;
        // Update local cache immediately
        allTools = allTools.map(t => t.name === activeToolCodeName ? { ...t, code: newCode } : t);
        populateToolsTable();
        // Send update request to backend (to be handled): updateCustomToolCode
        VsCode.postMessage('updateCustomToolCode', { name: activeToolCodeName, code: newCode });
        closeToolCodeModal();
    } catch (e) { console.error('saveToolCodeChanges error', e); }
}

