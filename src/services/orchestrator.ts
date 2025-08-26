/* =============================================================================
   Faz 2: Ana Orkestratör
   - build_context_for_query
   ============================================================================ */

import * as vscode from 'vscode';
import { ApiServiceManager } from './manager';
import { RETRIEVAL_DEFAULTS } from '../core/constants';
import { retrieve_initial_candidates, rerank_results, expand_context } from './retrieval';
import { assemble_final_prompt } from './assembler';

export async function build_context_for_query(context: vscode.ExtensionContext, api: ApiServiceManager, user_query: string): Promise<string> {
    // orchestration phase log removed
    const candidate_chunks = await retrieve_initial_candidates(context, api, user_query, RETRIEVAL_DEFAULTS.RETRIEVAL_TOP_K);

    // orchestration phase log removed
    const reranked_chunks = await rerank_results(user_query, candidate_chunks);

    const top_chunks = reranked_chunks.slice(0, RETRIEVAL_DEFAULTS.RERANK_TOP_N);

    // orchestration phase log removed
    const expanded_chunks = await expand_context(context, top_chunks);

    // orchestration phase log removed
    const final_context = assemble_final_prompt(expanded_chunks, RETRIEVAL_DEFAULTS.MAX_CONTEXT_TOKENS);
    return final_context;
}


