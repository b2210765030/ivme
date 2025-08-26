import * as vscode from 'vscode';
import { getPendingSelection } from '../core/pending_selection';
import { COMMAND_IDS, EXTENSION_ID, SETTINGS_KEYS } from '../core/constants';

export class IvmeSelectionInlayHintsProvider implements vscode.InlayHintsProvider {
	private _onDidChangeInlayHints = new vscode.EventEmitter<void>();
	public readonly onDidChangeInlayHints = this._onDidChangeInlayHints.event;

	public refresh() {
		this._onDidChangeInlayHints.fire();
	}

	provideInlayHints(document: vscode.TextDocument, range: vscode.Range, token: vscode.CancellationToken): vscode.ProviderResult<vscode.InlayHint[]> {
		// Yalnız Agent modu aktifken göster
		const config = vscode.workspace.getConfiguration(EXTENSION_ID);
		const isAgentActive = config.get<boolean>(SETTINGS_KEYS.agentModeActive, false);
		if (!isAgentActive) return [];
		const pending = getPendingSelection(document.uri);
		if (!pending) return [];
		// Yalnızca bekleyen seçimin bulunduğu satır aralığında ipucu göster
		if (!range.intersection(pending.range)) return [];

		const at = pending.range.end;
		const parts: vscode.InlayHintLabelPart[] = [
			{ value: '[ ' },
			{ value: "İvme'ye aktar", tooltip: "Seçimi agent bağlamına ekle", command: { title: "İvme'ye aktar", command: COMMAND_IDS.confirmAgentSelection } },
			{ value: ' ]' }
		];
		const hint = new vscode.InlayHint(at, parts, vscode.InlayHintKind.Parameter);
		return [hint];
	}
}

export const ivmeSelectionInlayHintsProvider = new IvmeSelectionInlayHintsProvider();

