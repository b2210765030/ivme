import * as tr from './tr';
import * as en from './en';
import { ContextManager } from '../features/manager/context';
import { ChatMessage } from '../types';

export type PromptLanguage = 'tr' | 'en';

let currentLanguage: PromptLanguage = 'tr';

export function setPromptLanguage(lang: PromptLanguage) {
    currentLanguage = lang;
}

function getModule() {
    return currentLanguage === 'en' ? en : tr;
}

export const createInitialSystemPrompt = () => getModule().createInitialSystemPrompt();
export const createFixErrorPrompt = (
    errorMessage: string,
    lineNumber: number,
    fullCode: string
) => getModule().createFixErrorPrompt(errorMessage, lineNumber, fullCode);
export const createContextualPrompt = (
    lastUserMessage: ChatMessage,
    contextManager: ContextManager
) => getModule().createContextualPrompt(lastUserMessage, contextManager);

// Returns an object with `system` and `user` fields to be sent as messages
export const createPlanExplanationPrompts = (planJson: string) => getModule().createPlanExplanationPrompts(planJson);
// Internal planner tool-calling prompt MUST be in English regardless of UI language
export const createPlannerToolCallingSystemPrompt = () => en.createPlannerToolCallingSystemPrompt();

// Act-mode (post-execution) summary prompts should follow UI language
export const createActSummaryPrompts = (actionsText: string) => getModule().createActSummaryPrompts(actionsText);