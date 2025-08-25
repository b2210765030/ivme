// src/extension.ts

import * as vscode from 'vscode';
import * as path from 'path';
import { BaykarAiActionProvider } from './providers/action';
import { BaykarAiHoverProvider } from './providers/hover';
import { IvmeSelectionCodeLensProvider, ivmeSelectionCodeLensProvider } from './providers/codelens';
import { ChatViewProvider } from './providers/view_chat';
import { ApiServiceManager } from './services/manager';
import { CommandHandler } from './features/Handlers/Command';
import { COMMAND_IDS, EXTENSION_NAME, EXTENSION_ID, SETTINGS_KEYS } from './core/constants';
import { ProjectIndexer } from './services/indexer';
import { PlannerIndexer } from './services/planner_indexer';

export function activate(context: vscode.ExtensionContext) {

    console.log(`"${EXTENSION_NAME}" eklentisi başarıyla aktif edildi!`);

    const apiManager = new ApiServiceManager();
    const chatProvider = new ChatViewProvider(context, apiManager);
    const commandHandler = new CommandHandler(apiManager, chatProvider);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    const checkConnectionCommand = vscode.commands.registerCommand(
        COMMAND_IDS.checkVllmStatus, () => commandHandler.checkConnection()
    );
    const applyFixCommand = vscode.commands.registerCommand(
        COMMAND_IDS.applyFix, (args) => commandHandler.applyFix(args)
    );
    const sendToChatCommand = vscode.commands.registerCommand(
        COMMAND_IDS.sendToChat, () => commandHandler.sendToChat()
    );
    const showChatCommand = vscode.commands.registerCommand(
        COMMAND_IDS.showChat, () => commandHandler.showChat()
    );
    const confirmAgentSelectionCommand = vscode.commands.registerCommand(
        COMMAND_IDS.confirmAgentSelection, () => chatProvider.applyPendingSelection()
    );

    const showPresentationCommand = vscode.commands.registerCommand(
        COMMAND_IDS.showPresentation, () => commandHandler.showPresentation()
    );

    // UI'dan gelen 'indexProject' mesajı için köprü komutu
    const indexProjectCommand = vscode.commands.registerCommand(
        'baykar-ai.indexProject', () => commandHandler.indexProject()
    );


    // DÜZELTİLDİ: Bu komut artık ChatViewProvider'daki public metodu çağırıyor.
    const requestContextSizeCommand = vscode.commands.registerCommand(
        `${EXTENSION_ID}.requestContextSize`, () => {
            chatProvider.requestContextSizeUpdate();
        }
    );

    const serviceStatusButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    serviceStatusButton.command = COMMAND_IDS.showChat;
    
    const updateStatusBar = () => {
        const activeService = apiManager.getActiveServiceName();
        serviceStatusButton.text = `$(chip) ${activeService}`;
        serviceStatusButton.tooltip = `Aktif Servis: ${activeService} (${EXTENSION_NAME} panelini aç)`;
    };
    
    updateStatusBar();
    serviceStatusButton.show();
    
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(`${EXTENSION_ID}.${SETTINGS_KEYS.activeApiService}`)) {
            updateStatusBar();
        }
    }));

    context.subscriptions.push(
        checkConnectionCommand,
        applyFixCommand,
        sendToChatCommand,
        showChatCommand,
        confirmAgentSelectionCommand,
        indexProjectCommand,
        requestContextSizeCommand,
        serviceStatusButton,
        vscode.languages.registerCodeActionsProvider('*', new BaykarAiActionProvider(), {
            providedCodeActionKinds: BaykarAiActionProvider.providedCodeActionKinds
        }),
        vscode.languages.registerHoverProvider('*', new BaykarAiHoverProvider()),
        vscode.languages.registerCodeLensProvider({ scheme: 'file' }, ivmeSelectionCodeLensProvider)
    );

    // Auto-indexing watcher (incremental updates)
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const indexer = new ProjectIndexer(apiManager, context);
            const plannerIndexer = new PlannerIndexer(apiManager, context);

            // Debounce per file to avoid thrashing on rapid saves
            const pendingTimers = new Map<string, NodeJS.Timeout>();
            const scheduleUpdate = (fsPath: string) => {
                // Basic excludes and internal folder
                if (
                    fsPath.includes(`${path.sep}node_modules${path.sep}`) ||
                    fsPath.includes(`${path.sep}dist${path.sep}`) ||
                    fsPath.includes(`${path.sep}out${path.sep}`) ||
                    fsPath.includes(`${path.sep}.ivme${path.sep}`)
                ) {
                    return;
                }
                const existing = pendingTimers.get(fsPath);
                if (existing) clearTimeout(existing);
                const t = setTimeout(() => {
                    // Vector store incremental
                    indexer.updateVectorStoreForFiles([fsPath]).catch(() => {});
                    // Planner index incremental
                    plannerIndexer.updatePlannerIndexForFiles([fsPath]).catch(() => {});
                    pendingTimers.delete(fsPath);
                }, 700);
                pendingTimers.set(fsPath, t);
            };
            const scheduleRemove = (fsPath: string) => {
                indexer.removeFileFromVectorStore(fsPath).catch(() => {});
                plannerIndexer.removeFileFromPlannerIndex(fsPath).catch(() => {});
            };

            // Watch common code file extensions; folder excludes handled above
            const pattern = new vscode.RelativePattern(workspaceFolder, '**/*');
            const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, false);
            watcher.onDidCreate(uri => scheduleUpdate(uri.fsPath));
            watcher.onDidChange(uri => scheduleUpdate(uri.fsPath));
            watcher.onDidDelete(uri => scheduleRemove(uri.fsPath));
            context.subscriptions.push(watcher);

            // Also listen to explicit rename events (delete+create usually covers it but this is safer)
            context.subscriptions.push(
                vscode.workspace.onDidRenameFiles(async (e) => {
                    for (const f of e.files) {
                        scheduleRemove(f.oldUri.fsPath);
                        scheduleUpdate(f.newUri.fsPath);
                    }
                })
            );
        }
    } catch (e) {
        console.warn('[AutoIndex] Watcher setup failed:', e);
    }
}

export function deactivate() {}