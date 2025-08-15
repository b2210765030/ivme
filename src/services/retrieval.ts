/* =============================================================================
   Faz 2: Retrieval Yardımcıları
   - retrieve_initial_candidates
   - rerank_results (opsiyonel Cohere)
   - expand_context (temel import genişletme)
   ============================================================================ */

import * as vscode from 'vscode';
import * as path from 'path';
import { ApiServiceManager } from './manager';
import { CodeChunkMetadata } from '../types';
import { loadVectorStoreChunks, topKByEmbedding } from './vector_store';
import { RETRIEVAL_DEFAULTS, EXTENSION_ID, SETTINGS_KEYS } from '../core/constants';

type Retrieved = Array<CodeChunkMetadata & { score?: number; rerank_score?: number; priority?: number; }>;

/**
 * Geniş kapsamlı aday getirir: Query'yi embed eder, topK semantik arama yapar.
 * (Basit: Yerel JSON vector store + Gemini embed)
 */
export async function retrieve_initial_candidates(context: vscode.ExtensionContext, api: ApiServiceManager, query_text: string, k: number = RETRIEVAL_DEFAULTS.RETRIEVAL_TOP_K): Promise<Retrieved> {
    const allChunks = await loadVectorStoreChunks(context);
    const embedding = await api.getGeminiService().embedText(query_text);
    const top = topKByEmbedding(allChunks, embedding, k);
    const results: Retrieved = top.map(({ score, chunk }) => ({ ...chunk, score, priority: 1 }));

    // Basit yapısal arama: tırnak içinde fonksiyon adı varsa dosya adı/işlev adı eşleştirmesi
    const quotedMatches = Array.from(query_text.matchAll(/"([\w$]+)"|'([\w$]+)'/g));
    const names = new Set<string>();
    for (const m of quotedMatches) {
        const cand = (m[1] || m[2] || '').trim();
        if (cand.length >= 3) names.add(cand);
    }
    if (names.size > 0) {
        for (const chunk of allChunks) {
            const hay = `${chunk.name} ${chunk.content}`;
            for (const nm of names) {
                if (hay.includes(nm)) {
                    // zaten eklendiyse atla
                    if (!results.some(r => r.id === chunk.id)) {
                        results.push({ ...chunk, score: 0.0, priority: 0.8 });
                    }
                    break;
                }
            }
        }
    }

    return dedupeById(results);
}

/** Reranker (Cohere opsiyonel). API anahtısı yoksa skorları koruyup döner. */
export async function rerank_results(query_text: string, chunks: Retrieved): Promise<Retrieved> {
    const config = vscode.workspace.getConfiguration(EXTENSION_ID);
    const cohereKey = config.get<string>(SETTINGS_KEYS.cohereApiKey);
    if (!cohereKey) {
        // Cohere yoksa, mevcut score alanını rerank_score olarak kullan
        return chunks
            .map(c => ({ ...c, rerank_score: typeof c.score === 'number' ? c.score : 0 }))
            .sort((a, b) => (b.rerank_score ?? 0) - (a.rerank_score ?? 0));
    }

    try {
        // Dinamik import ile cohere müşterisi (farklı sürümler için esnek kullanım)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod: any = await import('cohere-ai');
        const CohereClient = mod.CohereClient || mod.default || mod.Cohere;
        const client = new CohereClient({ token: cohereKey, apiKey: cohereKey });

        const docs = chunks.map(c => ({ text: c.content }));
        const topN = Math.min(RETRIEVAL_DEFAULTS.RERANK_TOP_N, docs.length);

        const response: any = await (client.rerank ? client.rerank({ query: query_text, documents: docs, topN }) : client.rerank({ query: query_text, documents: chunks.map(c => c.content), topN }));

        const scores = new Map<number, number>();
        const results: any[] = response?.results || response?.data || [];
        for (const item of results) {
            const idx = item.index ?? item.document_index ?? item.documentIndex;
            const score = item.relevanceScore ?? item.score ?? item.relevance_score ?? 0;
            if (typeof idx === 'number') {
                scores.set(idx, score);
            }
        }

        const withScores = chunks.map((c, idx) => ({ ...c, rerank_score: scores.get(idx) ?? 0 }));
        withScores.sort((a, b) => (b.rerank_score ?? 0) - (a.rerank_score ?? 0));
        return withScores;
    } catch (e) {
        console.warn('[Retrieval] Cohere rerank kullanılamadı, skorlara geri dönülüyor:', e);
        return chunks
            .map(c => ({ ...c, rerank_score: typeof c.score === 'number' ? c.score : 0 }))
            .sort((a, b) => (b.rerank_score ?? 0) - (a.rerank_score ?? 0));
    }
}

/**
 * Akıllı bağlam genişletme: import edilen dosya adlarını basitçe içerik üzerinden tarar
 * ve aynı dosyalardan ekstra chunk'ları ekler.
 */
export async function expand_context(context: vscode.ExtensionContext, base_chunks: Retrieved): Promise<Retrieved> {
    const all = await loadVectorStoreChunks(context);
    const expanded: Retrieved = [...base_chunks];
    const byFile = groupBy(all, c => c.filePath);

    for (const chunk of base_chunks) {
        const imports = extractImports(chunk.content);
        for (const imp of imports) {
            // import edilen dosya yolunu çözümlemek bu basit sürümde doğrudan yapılamayabilir.
            // Heuristik: aynı klasörde adı geçen dosyaları/eşleşmeleri ekle
            const dir = path.dirname(chunk.filePath);
            for (const [filePath, chunksOfFile] of Object.entries(byFile)) {
                if (filePath.startsWith(dir) && filePath.includes(imp)) {
                    for (const add of chunksOfFile) {
                        if (!expanded.some(e => e.id === add.id)) {
                            expanded.push({ ...add, priority: 0.6 });
                        }
                    }
                }
            }
        }
    }

    return dedupeById(expanded);
}

function dedupeById(list: Retrieved): Retrieved {
    const seen = new Set<string>();
    const out: Retrieved = [];
    for (const item of list) {
        if (!seen.has(item.id)) {
            seen.add(item.id);
            out.push(item);
        }
    }
    return out;
}

function groupBy<T>(arr: T[], keyFn: (x: T) => string): Record<string, T[]> {
    const map: Record<string, T[]> = {};
    for (const it of arr) {
        const k = keyFn(it);
        (map[k] ||= []).push(it);
    }
    return map;
}

function extractImports(code: string): string[] {
    const matches: string[] = [];
    const re1 = /import\s+[^'"\n]+from\s+['\"]([^'\"]+)['\"];?/g;
    const re2 = /require\(\s*['\"]([^'\"]+)['\"]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re1.exec(code)) !== null) {
        matches.push(m[1]);
    }
    while ((m = re2.exec(code)) !== null) {
        matches.push(m[1]);
    }
    return Array.from(new Set(matches));
}


