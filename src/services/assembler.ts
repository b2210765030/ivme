/* =============================================================================
   Faz 2: Nihai Filtreleme ve Paketleme
   - assemble_final_prompt
   ============================================================================ */

type AnyChunk = { filePath: string; content: string; rerank_score?: number };

export function assemble_final_prompt(all_chunks: AnyChunk[], max_tokens: number): string {
    let current_tokens = 0;
    const final_context_parts: string[] = [];

    for (const chunk of all_chunks) {
        const header = `// File: ${chunk.filePath} (Rerank Score: ${(chunk.rerank_score ?? 0).toFixed(2)})`;
        const text_to_add = `${header}\n${chunk.content}`;
        const new_tokens = approxTokenCount(text_to_add);
        if (current_tokens + new_tokens <= max_tokens) {
            final_context_parts.push(text_to_add);
            current_tokens += new_tokens;
        } else {
            break;
        }
    }

    return final_context_parts.join('\n\n---\n\n');
}

function approxTokenCount(text: string): number {
    // Basit yaklaşık: 1 token ~= 4 karakter
    return Math.ceil(text.length / 4);
}


