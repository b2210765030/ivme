/* ==========================================================================
   FILE: src/core/promptBuilder.en.ts (REPRESSIVE PROMPTS)

   RESPONSIBILITY: Centrally creates all system and user prompts
   for the English version.
   ========================================================================== */

import { ContextManager } from '../features/manager/context';
import { ChatMessage } from '../types';
import { toolsEnDetailed, toolsEnShort, toolsEnDescriptions, getToolsDescriptions } from './tool';

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

/**
 * Returns system and user prompts for plan explanation (EN).
 * `planJson` must be a JSON string.
 */
export function createPlanExplanationPrompts(planJson: string): { system: string; user: string } {
    const planObj = (() => {
        try { return JSON.parse(planJson); } catch { return null; }
    })();
    const stepCount = Array.isArray(planObj?.steps) ? planObj.steps.length : 0;
    const stepsTemplate = Array.from({ length: stepCount }, (_, i) => `${i + 1}) <short sentence>`).join('\n');

    const system = [
        'Write in English using VERY SHORT sentences.',
        'Output ONLY the exact format requested; no extra explanation, headings, markdown, code blocks, blank lines, or extra lines.',
        `The plan has ${stepCount} steps; the number of step lines must be exactly ${stepCount}.`,
        'For each step write ONLY ONE SENTENCE; do not add rationale, examples, or notes.',
        "For each line prefer step.ui_text if present; otherwise reduce step.action to a very short single sentence.",
        "IGNORE fields like 'thought' or 'notes'.",
        "The final line must start with 'Summary:' followed by one very short sentence.",
        'Do not write anything else.'
    ].join(' ');

    const user = [
        'Below is the plan JSON. Produce output in the EXACT format below:',
        'Intro sentence',
        stepsTemplate,
        'Summary: <very short sentence>',
        '',
        'Plan(JSON):',
        '```json',
        planJson,
        '```'
    ].join('\n');

    return { system, user };
}

/**
 * Returns the planner SYSTEM prompt (EN). Must not deviate from the JSON output requirement.
 */
export async function createPlannerSystemPrompt(plannerContext: string, userQuery: string, customTools?: Array<{name: string, description: string, schema: any}>): Promise<string> {
    return (
        `# ROLE & GOAL\n` +
        `You are a Principal Software Architect. Design an optimal, actionable and CODE-CENTRIC implementation plan for the user's request that fits the project's architecture.\n\n` +
        `# CONTEXT\n` +
        `${plannerContext}\n\n` +
        `# USER REQUEST\n` +
        `"${userQuery}"\n\n` +
        `# INSTRUCTIONS\n` +
        `- Think step-by-step and split each task into the smallest atomic actions a developer can follow.\n` +
        `- NO CODE IN THE PLAN OUTPUT: do not write code/pseudocode/blocks; describe WHAT to change. (Code is generated during execution.)\n` +
        `- Make it CODE-CENTRIC: reason in terms of concrete file edits to realize the request.\n` +
        `- File flow (critical):\n` +
        `  1) For every mentioned or implied file, first add a 'check_index' step (args.files).\n` +
        `  2) If missing, create it with 'create_file' (args.path).\n` +
        `  3) Then write/update code via 'edit_file' or 'append_file'. In the plan, do NOT include code;\n` +
        `     instead provide args.change_spec or args.content_spec as short plain-text instructions for the execution phase.\n` +
        `  4) Use 'locate_code' if needed to target ranges; reference it via edit_file.args.use_saved_range.\n` +
        `  5) If additional context is needed, use 'search'/'retrieve_chunks'.\n` +
        `- Prefer editing existing files; avoid unnecessary new files. Keep changes minimal and correct in scope.\n` +
        `- Each plan step must include a short English sentence in the field ".ui_text". Keep it concise.\n` +
        `- If a step REQUIRES a TOOL, provide the tool name in ".tool" and its parameters in ".args". If unsure, you may omit ".tool".\n` +
        `- Output STRICTLY valid JSON only, matching the schema below; do not add prose outside the JSON.\n` +
        `- If the CONTEXT contains 'Previous Plan (for revision)': UPDATE/MERGE the existing plan to incorporate the new request.\n` +
        `  - Steps listed under 'Completed Plan Steps' MUST NOT be modified or duplicated; add new steps as needed and renumber.\n` +
        `  - Remove duplicates and merge overlapping steps; produce a single coherent refreshed plan end-to-end.\n\n` +
        `# AVAILABLE TOOLS\n` +
        await getToolsDescriptions('en') + `\n\n` +
        `# IMPORTANT INDEX RULES\n` +
        `- If CONTEXT lists 'Missing requested files', DO NOT search for them; the first steps must create those files.\n` +
        `- Only use search/retrieve for files already present in the index.\n\n` +
        `# JSON OUTPUT SCHEMA\n` +
        `{\n` +
        `  "steps": [\n` +
        `    {\n` +
        `      "step": <number>,\n` +
        `      "action": <string>,\n` +
        `      "thought": <string>,\n` +
        `      "ui_text": <string|optional>,\n` +
        `      "tool": <string|optional>,\n` +
        `      "args": <object|optional>,\n` +
        `      "tool_calls": <array|optional>\n` +
        `    }\n` +
        `  ]\n` +
        `}`
    );
}

export async function createPlannerPrompt(plannerContext: string, userQuery: string, customTools?: Array<{name: string, description: string, schema: any}>): Promise<string> {
    return (
        `# ROLE & GOAL\n` +
        `You are a Principal Software Architect. Produce a CODE-CENTRIC implementation plan that addresses the user's request and fits the project's architecture.\n\n` +
        `# CONTEXT\n` +
        `${plannerContext}\n\n` +
        `# USER REQUEST\n` +
        `"${userQuery}"\n\n` +
        `# INSTRUCTIONS\n` +
        `- Break the work into the smallest possible actionable steps.\n` +
        `- NO CODE in the plan: describe the change in args.change_spec/args.content_spec; code will be generated during execution.\n` +
        `- File flow: (1) check_index, (2) create_file if missing, (3) edit_file/append_file to implement.\n` +
        `- Use locate_code to target ranges and search/retrieve_chunks for context when helpful.\n` +
        `- Keep each step short and precise; include a short ".ui_text" sentence for UI display.\n` +
        `- If a step REQUIRES a TOOL, provide the tool name in ".tool" and its parameters in ".args". If unsure, you may omit ".tool".\n` +
        `- Output strictly valid JSON only, following the schema below.\n` +
        `- If 'Previous Plan (for revision)' is present in CONTEXT, return a revised MERGED plan: keep completed steps intact and add missing steps for the new request.\n\n` +
        `# AVAILABLE TOOLS\n` +
        await getToolsDescriptions('en') + `\n\n` +
        `# JSON OUTPUT SCHEMA\n` +
        `{\n` +
        `  "steps": [\n` +
        `    {\n` +
        `      "step": <number>,\n` +
        `      "action": <string>,\n` +
        `      "thought": <string>,\n` +
        `      "ui_text": <string|optional>,\n` +
        `      "tool": <string|optional>,\n` +
        `      "args": <object|optional>,\n` +
        `      "tool_calls": <array|optional>\n` +
        `    }\n` +
        `  ]\n` +
        `}`
    );
}