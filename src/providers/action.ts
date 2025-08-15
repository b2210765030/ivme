// src/providers/ActionProvider.ts

import * as vscode from 'vscode';
import { COMMAND_IDS, EXTENSION_NAME } from '../core/constants';
import { ApplyFixArgs } from '../types/index';

export class BaykarAiActionProvider implements vscode.CodeActionProvider {

    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.RefactorRewrite
    ];

    constructor() { }

    provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        const actions: vscode.CodeAction[] = [];

        const diagnostic = context.diagnostics.find(d => d.range.contains(range));
        if (diagnostic) {
            actions.push(this.createFixAction(document, diagnostic));
        }

        // KALDIRILDI: Artık modify action oluşturulmuyor.
        // if (range instanceof vscode.Selection && !range.isEmpty) {
        //     actions.push(this.createModifyAction(document, range));
        // }

        return actions;
    }

    private createFixAction(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction {
        const action = new vscode.CodeAction(`✈️ ${EXTENSION_NAME} ile Düzelt`, vscode.CodeActionKind.QuickFix);

        const args: ApplyFixArgs = {
            uri: document.uri.toString(),
            diagnostic: {
                message: diagnostic.message,
                range: [
                    diagnostic.range.start.line, diagnostic.range.start.character,
                    diagnostic.range.end.line, diagnostic.range.end.character
                ]
            }
        };

        action.command = {
            command: COMMAND_IDS.applyFix,
            title: `${EXTENSION_NAME} Düzeltmesini Uygula`,
            arguments: [args]
        };
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        return action;
    }

    // KALDIRILDI: `createModifyAction` metodu tamamen silindi.
}