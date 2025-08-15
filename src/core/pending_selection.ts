import * as vscode from 'vscode';

type PendingSelection = {
	uri: vscode.Uri;
	range: vscode.Range;
	content: string;
	fileName: string;
};

const uriToPendingSelection: Map<string, PendingSelection> = new Map();

export function setPendingSelection(uri: vscode.Uri, selection: vscode.Selection, fileName: string, content: string) {
	uriToPendingSelection.set(uri.toString(), {
		uri,
		range: new vscode.Range(selection.start, selection.end),
		content,
		fileName
	});
}

export function clearPendingSelection(uri: vscode.Uri) {
	uriToPendingSelection.delete(uri.toString());
}

export function getPendingSelection(uri: vscode.Uri): PendingSelection | undefined {
	return uriToPendingSelection.get(uri.toString());
}

