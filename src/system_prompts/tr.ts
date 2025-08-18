/* ==========================================================================
   DOSYA: src/core/promptBuilder.ts (BASKILANMIŞ TALİMATLAR)

   SORUMLULUK: Tüm sistem (system) ve kullanıcı (user) talimatlarını
   merkezi olarak oluşturur.
   ========================================================================== */

import { ContextManager } from '../features/manager/context';
import { ChatMessage } from '../types';

/**
 * Yeni bir konuşma başlatıldığında LLM'e verilecek olan ilk sistem talimatını oluşturur.
 * Bu versiyon, modelin daha direkt ve az konuşkan olması için baskılanmıştır.
 */
export function createInitialSystemPrompt(): string {
    return `Uzman bir yazılım geliştirme asistanısın. Sadece istenen görevi yerine getir. Ekstra açıklama, selamlama veya yorum yapma. Cevaplarını Markdown formatında, kod bloklarını dil belirterek ver.`;
}

/**
 * LLM'e, verilen bir kod parçasındaki hatayı düzeltmesini söyler.
 * Bu versiyon, sadece kodun kendisini istemek için daha baskılayıcıdır.
 */
export function createFixErrorPrompt(errorMessage: string, lineNumber: number, fullCode: string): string {
    return `Aşağıdaki koddaki hatayı düzelt. Sadece düzeltilmiş kodun tamamını, başka hiçbir metin olmadan yanıt olarak ver.

HATA: "${errorMessage}" (Satır: ${lineNumber})

KOD:
---
${fullCode}
---`;
}

/**
 * Kullanıcının son mesajını, sağlanan bağlama (agent modu, dosya, seçili kod)
 * göre zenginleştirerek LLM için nihai bir talimat oluşturur.
 * Bu versiyon, modelin yalnızca istenen çıktıyı vermesi için baskılanmıştır.
 * @param lastUserMessage Kullanıcının girdiği son mesaj.
 * @param contextManager Aktif bağlamları içeren yönetici.
 * @returns Zenginleştirilmiş ve birleştirilmiş talimat metni.
 */
export function createContextualPrompt(lastUserMessage: ChatMessage, contextManager: ContextManager): string {
    const { agentFileContext, agentSelectionContext, uploadedFileContexts, activeContextText } = contextManager;
    const userInstruction = lastUserMessage.content;

    // 1. ÖNCELİK: Agent modu aktif VE bir kod seçimi var.
    if (agentFileContext && agentSelectionContext) {
        const startLine = agentSelectionContext.selection.start.line + 1;
        const endLine = agentSelectionContext.selection.end.line + 1;
        return `Aşağıdaki dosya ve içindeki seçili alana göre verilen talimatı harfiyen uygula. Yalnızca istenen çıktıyı ver, ek açıklama yapma.

--- DOSYA (${agentFileContext.fileName}) ---
${agentFileContext.content}
---

--- SEÇİLİ ALAN (Satır ${startLine}-${endLine}) ---
\`\`\`
${agentSelectionContext.content}
\`\`\`
---

TALİMAT: ${userInstruction}`;
    }

    // 2. DURUM: Sadece Agent modu aktif, seçim yok.
    if (agentFileContext) {
        return `Verilen dosya içeriğine dayanarak aşağıdaki talimatı yerine getir. Sadece istenen çıktıyı ver.

--- DOSYA İÇERİĞİ (${agentFileContext.fileName}) ---
${agentFileContext.content}
---

TALİMAT: ${userInstruction}`;
    }

    // 3. DURUM: Dosya yüklenmiş.
    if (uploadedFileContexts.length > 0) {
        const fileContents = uploadedFileContexts.map(file => `--- DOSYA: "${file.fileName}" ---\n${file.content}\n---`).join('\n\n');
        return `Verilen dosya içeriklerine dayanarak aşağıdaki talimatı yerine getir. Sadece istenen çıktıyı ver.\n${fileContents}\n\nTALİMAT: ${userInstruction}`;
    }

    // 4. DURUM: Sadece kod parçacığı "İvme'ye Gönder" ile gönderilmiş.
    if (activeContextText) {
        return `Verilen kod parçacığına dayanarak aşağıdaki talimatı yerine getir. Sadece istenen çıktıyı ver.\n\`\`\`\n${activeContextText}\n\`\`\`\n\nTALİMAT: ${userInstruction}`;
    }

    // 5. DURUM: Hiçbir bağlam yok, sadece kullanıcı talimatı.
    return userInstruction;
}

/**
 * Plan açıklaması için sistem ve kullanıcı promptlarını döndürür (TR).
 * `planJson` string olarak verilir.
 */
export function createPlanExplanationPrompts(planJson: string): { system: string; user: string } {
    const planObj = (() => {
        try { return JSON.parse(planJson); } catch { return null; }
    })();
    const stepCount = Array.isArray(planObj?.steps) ? planObj.steps.length : 0;
    const stepsTemplate = Array.from({ length: stepCount }, (_, i) => `${i + 1}) <kısa cümle>`).join('\n');

    const system = [
        'Türkçe ve ÇOK KISA cümlelerle yaz.',
        'Sadece belirtilen formatta yaz; ekstra açıklama, başlık, markdown, kod bloğu, boş satır veya ek satır ekleme.',
        `Plan ${stepCount} adım içeriyor; adım satırı sayısı tam olarak ${stepCount} olmalı.`,
        'Her adım için yalnızca TEK cümle yaz; açıklama, gerekçe, örnek, not ekleme.',
        "Her satırda mevcutsa step.ui_text'i kullan; yoksa step.action'ı çok kısa tek cümleye indir.",
        "'thought', 'notes' gibi alanları YOK SAY.",
        "Son satır 'Özet:' ile başlayan çok kısa bir cümle olmalı.",
        'Başka hiçbir şey yazma.'
    ].join(' ');

    const user = [
        "Aşağıda plan JSON'u var. Aşağıdaki KESİN formatta çıktı üret:",
        'Giriş cümlesi',
        stepsTemplate,
        'Özet: <çok kısa cümle>',
        '',
        'Plan(JSON):',
        '```json',
        planJson,
        '```'
    ].join('\n');

    return { system, user };
}

/**
 * Planner için system prompt'u üretir (TR).
 * Bu, planner agent'a gönderilecek SYSTEM talimatıdır; JSON çıktısından kesinlikle sapmamalıdır.
 */
export function createPlannerSystemPrompt(plannerContext: string, userQuery: string): string {
    return (
        `# ROLE & GOAL\n` +
        `You are a Principal Software Architect (Turkish). Design an optimal, feasible implementation plan addressing the user's request while aligning with the project's architecture.\n\n` +
        `# CONTEXT\n` +
        `${plannerContext}\n\n` +
        `# USER REQUEST\n` +
        `"${userQuery}"\n\n` +
        `# INSTRUCTIONS\n` +
        `- Think step-by-step.\n` +
        `- Optimize for minimal changes while ensuring correctness.\n` +
        `- Prefer editing existing files over creating new ones unless necessary.\n` +
        `- For each step, include a concise Turkish one-sentence summary in the field ".ui_text" that will be shown directly in the UI. Keep it short and human-friendly.\n` +
        `- Output strictly valid JSON following the schema below. Do not include any prose outside JSON.\n\n` +
        `# JSON OUTPUT SCHEMA\n` +
        `{\n` +
        `  "steps": [\n` +
        `    { "step": <number>, "action": <string>, "thought": <string>, "ui_text": <string|optional>, "files_to_edit": <string[]|optional>, "notes": <string|optional> }\n` +
        `  ]\n` +
        `}`
    );
}

/**
 * Planner user prompt (TR) - same structure but localized to Turkish.
 */
export function createPlannerPrompt(plannerContext: string, userQuery: string): string {
    return (
        `# ROL & AMAÇ\n` +
        `Bir Baş Yazılım Mimarısın. Kullanıcının isteğini proje mimarisine uygun şekilde karşılayacak en uygun ve uygulanabilir planı tasarla.\n\n` +
        `# BAĞLAM\n` +
        `${plannerContext}\n\n` +
        `# KULLANICI İSTEĞİ\n` +
        `"${userQuery}"\n\n` +
        `# TALİMATLAR\n` +
        `- Adım adım düşün.\n` +
        `- Doğruluğu sağlarken minimum değişikliği tercih et.\n` +
        `- Yeni dosya oluşturmadan önce mevcut dosyaları düzenlemeyi tercih et.\n` +
        `- Her adım için UI'da gösterilecek ".ui_text" alanına kısa bir cümle yaz.\n` +
        `- Sadece JSON çıktısı ver; sistemde belirtilen şemadan sapma yapma.\n\n` +
        `# JSON ÇIKTI ŞEMASI\n` +
        `{\n` +
        `  "steps": [\n` +
        `    { "step": <number>, "action": <string>, "thought": <string>, "ui_text": <string|optional>, "files_to_edit": <string[]|optional>, "notes": <string|optional> }\n` +
        `  ]\n` +
        `}`
    );
}