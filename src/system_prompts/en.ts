/* ==========================================================================
   FILE: src/core/promptBuilder.en.ts (REPRESSIVE PROMPTS)

   RESPONSIBILITY: Centrally creates all system and user prompts
   for the English version.
   ========================================================================== */

import { ContextManager } from '../features/manager/context';
import { ChatMessage } from '../types';

/**
 * Creates the initial system prompt given to the LLM when a new conversation starts.
 * This version is repressed to make the model more direct and less conversational.
 */
export function createInitialSystemPrompt(): string {
    // GÜNCELLENDİ: "working at Baykar" ifadesi eklendi.
    return `You are an expert software development assistant working at Baykar. Only perform the requested task. Do not add extra explanations, greetings, or comments. Provide your answers in Markdown format, specifying the language for code blocks.`;
}

/**
 * Instructs the LLM to fix an error in a given piece of code.
 * This version is more repressive to request only the code itself.
 */
export function createFixErrorPrompt(errorMessage: string, lineNumber: number, fullCode: string): string {
    return `Fix the error in the following code. Only provide the complete, corrected code as a response, with no other text.

ERROR: "${errorMessage}" (Line: ${lineNumber})

CODE:
---
${fullCode}
---`;
}

/**
 * Enriches the user's last message based on the provided context (agent mode, file, selected code)
 * to create a final prompt for the LLM.
 * This version is repressed to ensure the model provides only the requested output.
 * @param lastUserMessage The last message entered by the user.
 * @param contextManager The manager containing active contexts.
 * @returns The enriched and combined prompt text.
 */
export function createContextualPrompt(lastUserMessage: ChatMessage, contextManager: ContextManager): string {
    const { agentFileContext, agentSelectionContext, uploadedFileContexts, activeContextText } = contextManager;
    const userInstruction = lastUserMessage.content;

    // PRIORITY 1: Agent mode is active AND there is a code selection.
    if (agentFileContext && agentSelectionContext) {
        const startLine = agentSelectionContext.selection.start.line + 1;
        const endLine = agentSelectionContext.selection.end.line + 1;
        return `Strictly follow the instruction based on the file and the selected area within it. Provide only the requested output, without additional explanation.

--- FILE (${agentFileContext.fileName}) ---
${agentFileContext.content}
---

--- SELECTED AREA (Lines ${startLine}-${endLine}) ---
\`\`\`
${agentSelectionContext.content}
\`\`\`
---

INSTRUCTION: ${userInstruction}`;
    }

    // CASE 2: Only Agent mode is active, no selection.
    if (agentFileContext) {
        return `Based on the provided file content, execute the following instruction. Provide only the requested output.

--- FILE CONTENT (${agentFileContext.fileName}) ---
${agentFileContext.content}
---

INSTRUCTION: ${userInstruction}`;
    }

    // CASE 3: Files have been uploaded.
    if (uploadedFileContexts.length > 0) {
        const fileContents = uploadedFileContexts.map(file => `--- FILE: "${file.fileName}" ---\n${file.content}\n---`).join('\n\n');
        return `Based on the provided file contents, execute the following instruction. Provide only the requested output.\n${fileContents}\n\nINSTRUCTION: ${userInstruction}`;
    }

    // CASE 4: A code snippet was sent via "Send to İvme".
    if (activeContextText) {
        return `Based on the provided code snippet, execute the following instruction. Provide only the requested output.\n\`\`\`\n${activeContextText}\n\`\`\`\n\nINSTRUCTION: ${userInstruction}`;
    }

    // CASE 5: No context, just the user instruction.
    return userInstruction;
}