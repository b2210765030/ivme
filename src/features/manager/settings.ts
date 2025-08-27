/* ==========================================================================
   DOSYA: src/features/SettingsManager.ts (HATASI GİDERİLMİŞ)
   ========================================================================== */

import * as vscode from 'vscode';
import { EXTENSION_ID, SETTINGS_KEYS, API_SERVICES } from '../../core/constants';
import { ApiServiceName } from '../../types';
import { VllmApiService } from '../../services/vLLM'; // EKSİK OLAN IMPORT SATIRI EKLENDİ

export class SettingsManager {
    public sendConfigToWebview(webview: vscode.Webview) {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        webview.postMessage({
            type: 'loadConfig',
            payload: {
                activeApiService: config.get<ApiServiceName>(SETTINGS_KEYS.activeApiService, API_SERVICES.vllm),
                vllmBaseUrl: config.get<string>(SETTINGS_KEYS.vllmBaseUrl, ''),
                vllmModelName: config.get<string>(SETTINGS_KEYS.vllmModelName, ''),
                vllmEmbeddingModelName: config.get<string>(SETTINGS_KEYS.vllmEmbeddingModelName, ''),
                geminiApiKey: config.get<string>(SETTINGS_KEYS.geminiApiKey, ''),
                conversationHistoryLimit: config.get<number>(SETTINGS_KEYS.conversationHistoryLimit, 2),
                agentModeActive: config.get<boolean>(SETTINGS_KEYS.agentModeActive, false),
                temperature: config.get<number>(SETTINGS_KEYS.temperature, 0.7)
            }
        });
    }

    public async saveSettings(settings: any, webview: vscode.Webview) {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        
        // Eğer aktif servis vLLM ise, kaydetmeden önce bağlantıyı test et.
        if (settings.activeApiService === API_SERVICES.vllm) {
            const result = await VllmApiService.testConnection(settings.vllmBaseUrl);
            if (!result.success) {
                // Başarısız olursa, arayüze hata mesajı gönder ve işlemi durdur.
                webview.postMessage({
                    type: 'settingsSaveResult',
                    payload: { success: false, message: result.message }
                });
                return; 
            }
        }
        
        try {
            const tempValue = Math.max(0, Math.min(2, Number(settings.temperature)));
            const baseUrl = String(settings.vllmBaseUrl || '').trim();
            const modelName = String(settings.vllmModelName || '').trim();
            const embeddingModelName = String(settings.vllmEmbeddingModelName || settings.vllmModelName || '').trim();
            const hasWorkspace = Array.isArray(vscode.workspace.workspaceFolders) && vscode.workspace.workspaceFolders.length > 0;
            const safeWorkspaceUpdate = async (key: string, value: any) => {
                if (!hasWorkspace) return;
                try {
                    await config.update(key, value, vscode.ConfigurationTarget.Workspace);
                } catch (e) {
                    try { console.warn('[settings] Workspace update skipped for key:', key, e); } catch {}
                }
            };
            let majorOk = true;
            const tryGlobal = async (key: string, value: any) => {
                try {
                    await config.update(key, value, vscode.ConfigurationTarget.Global);
                } catch (e) {
                    try { console.error('[settings] Global update failed for key:', key, e); } catch {}
                    // Major keys failure will flip flag below where used
                    throw e;
                }
            };

            // Aktif servis (MAJOR)
            try {
                await tryGlobal(SETTINGS_KEYS.activeApiService, settings.activeApiService);
                await safeWorkspaceUpdate(SETTINGS_KEYS.activeApiService, settings.activeApiService);
            } catch { majorOk = false; }

            // vLLM Base URL (MAJOR)
            try {
                await tryGlobal(SETTINGS_KEYS.vllmBaseUrl, baseUrl);
                await safeWorkspaceUpdate(SETTINGS_KEYS.vllmBaseUrl, baseUrl);
            } catch { majorOk = false; }

            // vLLM Model Name (MAJOR)
            try {
                await tryGlobal(SETTINGS_KEYS.vllmModelName, modelName);
                await safeWorkspaceUpdate(SETTINGS_KEYS.vllmModelName, modelName);
            } catch { majorOk = false; }

            // vLLM Embedding Model Name (NON-MAJOR)
            try {
                await tryGlobal(SETTINGS_KEYS.vllmEmbeddingModelName, embeddingModelName);
                await safeWorkspaceUpdate(SETTINGS_KEYS.vllmEmbeddingModelName, embeddingModelName);
            } catch (e) {
                try { console.warn('[settings] Optional update failed: vllmEmbeddingModelName'); } catch {}
            }

            // Gemini anahtarı (yalnızca Global, NON-MAJOR)
            try {
                await tryGlobal(SETTINGS_KEYS.geminiApiKey, String(settings.geminiApiKey || '').trim());
            } catch (e) {
                try { console.warn('[settings] Optional update failed: geminiApiKey'); } catch {}
            }

            // Sohbet geçmiş limiti (Global, NON-MAJOR)
            try {
                await tryGlobal(SETTINGS_KEYS.conversationHistoryLimit, Number(settings.conversationHistoryLimit) || 2);
            } catch (e) {
                try { console.warn('[settings] Optional update failed: conversationHistoryLimit'); } catch {}
            }

            // Sıcaklık - Global zorunlu (MAJOR-ish), Workspace opsiyonel
            const finalTemp = (isFinite(tempValue) ? tempValue : 0.7);
            try {
                await tryGlobal(SETTINGS_KEYS.temperature, finalTemp);
                await safeWorkspaceUpdate(SETTINGS_KEYS.temperature, finalTemp);
            } catch (e) {
                // Temperature failure shouldn't block save entirely
                try { console.warn('[settings] Temperature update failed, proceeding'); } catch {}
            }

            if (!majorOk) {
                // Report error but keep a helpful message
                const message = 'Ayarlar kaydedilirken bir hata oluştu (temel alanlar kaydedilemedi).';
                vscode.window.showErrorMessage(message);
                webview.postMessage({ type: 'settingsSaveResult', payload: { success: false, message } });
                return;
            }
            vscode.window.showInformationMessage('Ayarlar başarıyla kaydedildi.');
            
            // Başarılı olursa, arayüze başarı durumunu gönder.
            webview.postMessage({
                type: 'settingsSaveResult',
                payload: { success: true }
            });
        } catch (error) {
            console.error("Failed to save settings:", error);
            const message = 'Ayarlar kaydedilirken bir hata oluştu.';
            vscode.window.showErrorMessage(message);
            
            // Hata durumunda, arayüze hata mesajı gönder.
             webview.postMessage({
                type: 'settingsSaveResult',
                payload: { success: false, message }
            });
        }
    }

    public async saveAgentModeState(isActive: boolean) {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        try {
            await config.update(SETTINGS_KEYS.agentModeActive, isActive, vscode.ConfigurationTarget.Global);
        } catch (error) {
            console.error("Failed to save agent mode state:", error);
        }
    }

    public getAgentModeState(): boolean {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        return config.get<boolean>(SETTINGS_KEYS.agentModeActive, false);
    }

    public async saveAgentBarExpandedState(isExpanded: boolean) {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        try {
            await config.update(SETTINGS_KEYS.agentBarExpanded, isExpanded, vscode.ConfigurationTarget.Global);
        } catch (error) {
            console.error("Failed to save agent bar expanded state:", error);
        }
    }

    public getAgentBarExpandedState(): boolean {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        return config.get<boolean>(SETTINGS_KEYS.agentBarExpanded, false);
    }

    public async saveIndexingEnabled(enabled: boolean) {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        try {
            await config.update(SETTINGS_KEYS.indexingEnabled, enabled, vscode.ConfigurationTarget.Workspace);
        } catch (error) {
            console.error("Failed to save indexing enabled state:", error);
        }
    }

    public getIndexingEnabled(): boolean {
        const config = vscode.workspace.getConfiguration(EXTENSION_ID);
        return config.get<boolean>(SETTINGS_KEYS.indexingEnabled, false);
    }
}