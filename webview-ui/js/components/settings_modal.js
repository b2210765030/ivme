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

function setupToolButtons() {
    // Initialize Tools button event listener
    const initializeToolsButton = document.getElementById('initialize-tools-button');
    if (initializeToolsButton) {
        initializeToolsButton.removeEventListener('click', initializeTools);
        initializeToolsButton.addEventListener('click', initializeTools);
    }

    // Add Tool button event listener
    const addToolButton = document.getElementById('add-tool-button');
    if (addToolButton) {
        addToolButton.removeEventListener('click', openToolCreator);
        addToolButton.addEventListener('click', openToolCreator);
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
    toolRow.className = 'tool-row';
    
    const toolName = document.createElement('div');
    toolName.className = 'tool-name';
    toolName.textContent = tool.name;
    
    const toolDescription = document.createElement('div');
    toolDescription.className = 'tool-description';
    toolDescription.textContent = tool.description;
    
    const toolActions = document.createElement('div');
    toolActions.className = 'tool-actions';
    
    if (isCustom) {
        // Add delete button for custom tools
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-tool-button';
        deleteButton.title = 'Aracı Sil';
        deleteButton.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 1.152l.557 10.056A2 2 0 0 0 5.046 16h5.908a2 2 0 0 0 1.993-1.792l.557-10.056a.58.58 0 0 0-.01-1.152H11ZM9 5a.5.5 0 1 1-1 0v6a.5.5 0 0 1 1 0V5Zm-3 0a.5.5 0 1 1-1 0v6a.5.5 0 0 1 1 0V5Z"/>
            </svg>
        `;
        deleteButton.addEventListener('click', () => deleteCustomTool(tool.name));
        toolActions.appendChild(deleteButton);
        
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

function initializeTools() {
    if (confirm('Bu işlem mevcut built-in araçları .ivme/tools.json dosyasına yazacak. Devam etmek istiyor musunuz?')) {
        // Show loading state
        const button = document.getElementById('initialize-tools-button');
        const originalText = button.innerHTML;
        button.innerHTML = '<span>Başlatılıyor...</span>';
        button.disabled = true;
        
        // Send initialization request to backend
        VsCode.postMessage('initializeTools');
        
        // Reset button after a delay (will be updated by response)
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
        }, 3000);
    }
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
    if (confirm(`"${toolName}" aracını silmek istediğinizden emin misiniz?`)) {
        // Remove from all tools array
        allTools = allTools.filter(tool => tool.name !== toolName);
        
        // Send delete request to backend
        VsCode.postMessage('deleteCustomTool', { toolName });
        
        // Refresh table
        populateToolsTable();
    }
}

async function createCustomTool(toolData) {
    try {
        // Send tool creation request to backend
        VsCode.postMessage('createCustomTool', toolData);
        
        // Close modal
        closeToolCreator();
        
        // Show success message (could be improved with proper notification system)
        console.log('Tool creation request sent:', toolData);
        
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

    // Temperature slider live label update
    if (DOM.temperatureInput && DOM.temperatureLabel) {
        const updateTempLabel = () => {
            const v = Number(DOM.temperatureInput.value);
            DOM.temperatureLabel.textContent = isFinite(v) ? v.toFixed(1) : '0.7';
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
            tokenLimit: DOM.tokenLimitInput.value,
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
    DOM.tokenLimitInput.value = config.tokenLimit || 12000;
    DOM.serviceSelect.value = config.activeApiService;
    if (DOM.temperatureInput) {
        const t = typeof config.temperature === 'number' ? config.temperature : 0.7;
        DOM.temperatureInput.value = String(t);
        if (DOM.temperatureLabel) DOM.temperatureLabel.textContent = String(t);
    }
    handleServiceChange();

    // Request tools from backend when config is loaded
    VsCode.postMessage('requestCustomTools');
}

// Handle custom tool creation response
export function handleCustomToolCreated(payload) {
    if (payload.success) {
        // Add the new tool to all tools array
        allTools.push({
            name: payload.tool.name,
            description: payload.tool.description,
            schema: payload.tool.schema,
            code: payload.tool.code,
            type: 'custom'
        });
        
        // Refresh the tools table
        populateToolsTable();
        
        console.log('Custom tool created successfully:', payload.tool.name);
    } else {
        alert('Araç oluşturulurken bir hata oluştu: ' + (payload.error || 'Bilinmeyen hata'));
    }
}

// Handle custom tool deletion response
export function handleCustomToolDeleted(payload) {
    if (payload.success) {
        console.log('Custom tool deleted successfully:', payload.toolName);
        // Table is already updated in deleteCustomTool function
    } else {
        alert('Araç silinirken bir hata oluştu: ' + (payload.error || 'Bilinmeyen hata'));
        // Reload custom tools from backend to ensure consistency
        VsCode.postMessage('requestCustomTools');
    }
}

// Handle custom tools list response
export function handleCustomToolsList(payload) {
    if (payload.success && Array.isArray(payload.tools)) {
        allTools = payload.tools;
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

// Handle tools initialization response
export function handleToolsInitialized(payload) {
    const button = document.getElementById('initialize-tools-button');
    
    if (payload.success) {
        // Update button to show success
        button.innerHTML = '✅ Başarılı';
        button.style.background = 'var(--vscode-testing-iconPassed)';
        
        // Load the initialized tools
        VsCode.postMessage('requestCustomTools');
        
        // Reset button after delay
        setTimeout(() => {
            button.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zM4.5 7.5a.5.5 0 0 1 0-1h5.793L8.146 4.354a.5.5 0 1 1 .708-.708l3 3a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L10.293 7.5H4.5z"/>
            </svg>Araçları Başlat`;
            button.style.background = '';
            button.disabled = false;
        }, 2000);
        
        console.log('Tools initialized successfully');
    } else {
        // Show error
        button.innerHTML = '❌ Hata';
        button.style.background = 'var(--vscode-testing-iconFailed)';
        
        setTimeout(() => {
            button.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zM4.5 7.5a.5.5 0 0 1 0-1h5.793L8.146 4.354a.5.5 0 1 1 .708-.708l3 3a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L10.293 7.5H4.5z"/>
            </svg>Araçları Başlat`;
            button.style.background = '';
            button.disabled = false;
        }, 2000);
        
        alert('Araç başlatma hatası: ' + (payload.error || 'Bilinmeyen hata'));
    }
}