/* Centralized system prompts (EN) */

import { ContextManager } from '../features/manager/context';
import { ChatMessage } from '../types';
import { getToolsDescriptions, getToolsDescriptionsSync } from './tool';

export function createInitialSystemPrompt(): string {
    return `You are a concise software assistant. Do only what is asked. Answer in Markdown with code fences.`;
}

export function createFixErrorPrompt(errorMessage: string, lineNumber: number, fullCode: string): string {
    return `Fix the bug in the code below. Reply with ONLY the full, corrected code.\n\nERROR: "${errorMessage}" (Line: ${lineNumber})\n\nCODE:\n---\n${fullCode}\n---`;
}

export function createContextualPrompt(lastUserMessage: ChatMessage, contextManager: ContextManager): string {
    const { agentFileContext, agentSelectionContext, uploadedFileContexts, activeContextText } = contextManager;
    const userInstruction = lastUserMessage.content;

    if (agentFileContext && agentSelectionContext) {
        const startLine = agentSelectionContext.selection.start.line + 1;
        const endLine = agentSelectionContext.selection.end.line + 1;
        return `Apply the instruction to the selected code within the file below. Output ONLY what is asked.\n\n--- FILE (${agentFileContext.fileName}) ---\n${agentFileContext.content}\n---\n\n--- SELECTION (Lines ${startLine}-${endLine}) ---\n\`\`\`\n${agentSelectionContext.content}\n\`\`\`\n---\n\nINSTRUCTION: ${userInstruction}`;
    }

    if (agentFileContext) {
        return `Apply the instruction based on the file content below. Output ONLY what is asked.\n\n--- FILE CONTENT (${agentFileContext.fileName}) ---\n${agentFileContext.content}\n---\n\nINSTRUCTION: ${userInstruction}`;
    }

    if (uploadedFileContexts.length > 0) {
        const fileContents = uploadedFileContexts.map(file => `--- FILE: "${file.fileName}" ---\n${file.content}\n---`).join('\n\n');
        return `Apply the instruction based on the file contents below. Output ONLY what is asked.\n${fileContents}\n\nINSTRUCTION: ${userInstruction}`;
    }

    if (activeContextText) {
        return `Apply the instruction based on this snippet. Output ONLY what is asked.\n\`\`\`\n${activeContextText}\n\`\`\`\n\nINSTRUCTION: ${userInstruction}`;
    }

    return userInstruction;
}

export function createPlanExplanationPrompts(planJson: string): { system: string; user: string } {
    const planObj = (() => {
        try { return JSON.parse(planJson); } catch { return null; }
    })();
    const stepCount = Array.isArray(planObj?.steps) ? planObj.steps.length : 0;
    const stepsTemplate = Array.from({ length: stepCount }, (_, i) => `${i + 1}) <short sentence>`).join('\n');

    const system = [
        'Write VERY SHORT English sentences. No headings, no extra lines, no code blocks.',
        `There are ${stepCount} steps; output exactly ${stepCount} step lines.`,
        "Use step.ui_text if present; otherwise compress step.action.",
        "Ignore 'thought', 'notes'.",
        "End with 'Summary:' line."
    ].join(' ');

    const user = [
        'Below is the plan JSON. Output STRICTLY in this format:',
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

// Tool-calling based planner system prompt (EN)
export function createPlannerToolCallingSystemPrompt(): string {
    let toolList = '';
    try { toolList = getToolsDescriptionsSync('en'); } catch {}
    return [
        'You are a Principal Software Architect.',
        'Use tool-calling to either produce the INITIAL PLAN (create_plan) or propose ONLY DELTA CHANGES (propose_plan_changes) to an existing plan.',
        'MANDATORY BEHAVIOR:',
        "- If there is a 'Previous Plan (for revision)' section or signals of a previous plan, you MUST call 'propose_plan_changes'. Do NOT call 'create_plan'.",
        "- Steps listed under 'Completed Plan Steps' MUST NOT be re-added or modified; PRESERVE AS-IS.",
        'Rules:',
        '- Do NOT generate code; only step descriptions/tools/args.',
        '- In revision mode DO NOT output the full plan; return only changes (insert/delete/update/reorder).',
        "- If the user asks to 'write into' a specific file, first VERIFY existence with check_index. If it exists, directly edit (edit_file/append_file); otherwise propose only the necessary minimal step.",
        '- Respect file/selection constraints if present.',
        '- Prefer MINIMAL updates; keep the previous plan structure when possible.',
        '--- Available Tools (EN) ---\n' + toolList
    ].join(' ');
}

// Post-Act summary and suggestions (EN)
export function createActSummaryPrompts(actionsText: string): { system: string; user: string } {
    const system = [
        'Write in short, clear English. No headings or code blocks.',
        'Bullet points are allowed. First list what was done and created/changed.',
        "Then add 'Next recommended steps' with 1-3 bullets.",
        'End with a short question if the user should confirm next actions.'
    ].join(' ');
    const user = `Executed steps (labels):\n${actionsText}\n\nSummary and recommendations:`;
    return { system, user };
}