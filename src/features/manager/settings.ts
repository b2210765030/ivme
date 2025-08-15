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
                geminiApiKey: config.get<string>(SETTINGS_KEYS.geminiApiKey, ''),
                conversationHistoryLimit: config.get<number>(SETTINGS_KEYS.conversationHistoryLimit, 2),
                agentModeActive: config.get<boolean>(SETTINGS_KEYS.agentModeActive, false)
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
            await Promise.all([
                config.update(SETTINGS_KEYS.activeApiService, settings.activeApiService, vscode.ConfigurationTarget.Global),
                config.update(SETTINGS_KEYS.vllmBaseUrl, settings.vllmBaseUrl.trim(), vscode.ConfigurationTarget.Global),
                config.update(SETTINGS_KEYS.vllmModelName, settings.vllmModelName.trim(), vscode.ConfigurationTarget.Global),
                config.update(SETTINGS_KEYS.geminiApiKey, settings.geminiApiKey.trim(), vscode.ConfigurationTarget.Global),
                config.update(SETTINGS_KEYS.conversationHistoryLimit, Number(settings.conversationHistoryLimit) || 2, vscode.ConfigurationTarget.Global)
            ]);
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