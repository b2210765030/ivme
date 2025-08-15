import * as vscode from 'vscode';
import { COMMAND_IDS, EXTENSION_NAME } from '../core/constants';
import { ApplyFixArgs } from '../types';
import { getPendingSelection } from '../core/pending_selection';

/**
 * Provides hover information for diagnostics (errors, warnings) in the editor.
 * When the user hovers over a line with a diagnostic, this provider
 * creates a hover popup with details and a command link to fix the issue.
 */
export class BaykarAiHoverProvider implements vscode.HoverProvider {
    
    /**
     * This method is called by VS Code when the user hovers over text in a document.
     * @param document The document in which the hover was triggered.
     * @param position The position in the document where the hover occurred.
     * @returns A vscode.Hover object containing the content to be displayed, or null if no hover should be shown.
     */
    public provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
        
        const markdown = new vscode.MarkdownString();
        markdown.isTrusted = true;

        // 1) Eğer mevcut dosya için bekleyen bir seçim varsa, "İvme'ye aktar" butonu göster.
        const pending = getPendingSelection(document.uri);
        if (pending && pending.range.contains(position)) {
            const applyUri = vscode.Uri.parse(`command:${COMMAND_IDS.confirmAgentSelection}`);
            markdown.appendMarkdown(`**İvme Seçim**\n\n`);
            markdown.appendMarkdown(`_${pending.fileName} (${pending.range.start.line + 1}-${pending.range.end.line + 1})_\n\n`);
            markdown.appendMarkdown(`[İvme'ye aktar](${applyUri})\n\n`);
        }

        // 2) Hata üzerine gelinirse mevcut fix hover'ını da göster.
        const diagnosticAtPosition = vscode.languages.getDiagnostics(document.uri).find(d => d.range.contains(position));
        if (!diagnosticAtPosition && !pending) {
            return null;
        }
        if (diagnosticAtPosition) {
            markdown.appendMarkdown(`**${EXTENSION_NAME} Fix**\n\n`);
            markdown.appendMarkdown(`*Problem: ${diagnosticAtPosition.message}*\n\n`);
        
            const args: ApplyFixArgs = {
                uri: document.uri.toString(),
                diagnostic: {
                    message: diagnosticAtPosition.message,
                    range: [
                        diagnosticAtPosition.range.start.line,
                        diagnosticAtPosition.range.start.character,
                        diagnosticAtPosition.range.end.line,
                        diagnosticAtPosition.range.end.character
                    ]
                }
            };
            const commandUri = vscode.Uri.parse(
                `command:${COMMAND_IDS.applyFix}?${encodeURIComponent(JSON.stringify(args))}`
            );
            markdown.appendMarkdown(`[✈️ ${EXTENSION_NAME} ile Düzelt](${commandUri})`);
        }

        return new vscode.Hover(markdown);
    }
}
