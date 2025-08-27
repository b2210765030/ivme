/* =============================================================================
   Basit Vektör Mağazası Yardımcıları
   - vector_store.json dosyasını yükler
   - cosine similarity ile arama yapar
   ============================================================================ */

import * as vscode from 'vscode';
import * as path from 'path';
import { EXTENSION_ID, SETTINGS_KEYS, RETRIEVAL_DEFAULTS } from '../core/constants';
import { CodeChunkMetadata } from '../types';

export async function hasVectorStore(context: vscode.ExtensionContext): Promise<boolean> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return false;
    }
    const storageUri = vscode.Uri.joinPath(workspaceFolder.uri, '.ivme', 'vector_store.json');
    try {
        await vscode.workspace.fs.stat(storageUri);
        return true;
    } catch (e) {
        return false;
    }
}

export async function isIndexingEnabled(context: vscode.ExtensionContext): Promise<boolean> {
    const config = vscode.workspace.getConfiguration(EXTENSION_ID);
    const settingEnabled = config.get<boolean>(SETTINGS_KEYS.indexingEnabled, RETRIEVAL_DEFAULTS.INDEXING_ENABLED_DEFAULT);
    const indexExists = await hasVectorStore(context);
    if (!indexExists) {
        return false;
    }
    return settingEnabled;
}

export async function loadVectorStoreChunks(context: vscode.ExtensionContext): Promise<CodeChunkMetadata[]> {
    // İndeksleme kapalıysa boş dizi döndür
    if (!(await isIndexingEnabled(context))) {
        return [];
    }

    // Workspace-specific vector store path
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return [];
    }

    const ivmeDir = vscode.Uri.joinPath(workspaceFolder.uri, '.ivme');
    const storageUri = vscode.Uri.joinPath(ivmeDir, 'vector_store.json');

    try {
        const buf = await vscode.workspace.fs.readFile(storageUri);
        const json = JSON.parse(Buffer.from(buf).toString('utf8'));
        const chunks: CodeChunkMetadata[] = json?.chunks || [];
        // vector store loaded
        return chunks;
    } catch (e) {
        console.warn('[VectorStore] Okuma başarısız:', storageUri.fsPath, e);
        return [];
    }
}

export function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom ? dot / denom : 0;
}

export function topKByEmbedding(chunks: CodeChunkMetadata[], queryEmbedding: number[], k = 10): Array<{ score: number, chunk: CodeChunkMetadata }> {
    const scored = chunks
        .filter(c => Array.isArray(c.embedding))
        .map(c => ({ score: cosineSimilarity(queryEmbedding, c.embedding as number[]), chunk: c }));
    scored.sort((x, y) => y.score - x.score);
    return scored.slice(0, k);
}


