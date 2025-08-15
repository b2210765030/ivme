import * as vscode from 'vscode';
import { getPendingSelection } from '../core/pending_selection';
import { COMMAND_IDS } from '../core/constants';

export class IvmeSelectionCodeLensProvider implements vscode.CodeLensProvider {
	private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
	public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

	public refresh(): void {
		this._onDidChangeCodeLenses.fire();
	}

	provideCodeLenses(document: vscode.TextDocument): vscode.ProviderResult<vscode.CodeLens[]> {
		const pending = getPendingSelection(document.uri);
		if (!pending) return [];
		const startLine = pending.range.start.line;
		const range = new vscode.Range(startLine, 0, startLine, 0);
        const title = "$(play) İvme'ye aktar";
        const command: vscode.Command = { title, command: COMMAND_IDS.confirmAgentSelection, tooltip: "Seçimi agent bağlamına ekle" };
        return [new vscode.CodeLens(range, command)];
	}
}

export const ivmeSelectionCodeLensProvider = new IvmeSelectionCodeLensProvider();

