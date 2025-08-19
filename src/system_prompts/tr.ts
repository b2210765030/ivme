/* ==========================================================================
   DOSYA: src/core/promptBuilder.ts (BASKILANMIŞ TALİMATLAR)

   SORUMLULUK: Tüm sistem (system) ve kullanıcı (user) talimatlarını
   merkezi olarak oluşturur.
   ========================================================================== */

import { ContextManager } from '../features/manager/context';
import { ChatMessage } from '../types';
import { toolsTrDetailed, toolsTrShort, toolsTrDescriptions } from './tool';

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
        `Bir Baş Yazılım Mimarısısın. Kullanıcının isteğini proje mimarisine uygun, uygulanabilir bir plan hâline getir.\n\n` +
        `# CONTEXT\n` +
        `${plannerContext}\n\n` +
        `# USER REQUEST\n` +
        `"${userQuery}"\n\n` +
        `# INSTRUCTIONS\n` +
        `- Adım adım düşün ve her görevi geliştiricinin uygulayabileceği en küçük atomik eylemlere böl.\n` +
        `- Kod, pseudocode veya kod blokları yazma. Sadece ne yapılacağını tarif et.\n` +
        `- Mevcut dosyaları düzenlemeyi tercih et; gerekirse yeni dosya oluştur. Yapılacak değişiklikleri minimumda tut.\n` +
        `- Her adım için kısa bir ".ui_text" cümlesi ekle; UI bu metni gösterecek.\n` +
        `- Sadece GEÇERLİ JSON çıktısı ver; JSON dışı metin ekleme.\n\n` +
        `# KULLANILABİLİR ARAÇLAR\n` +
        toolsTrDescriptions + `\n\n` +
        `# ÖNEMLİ KURAL\n` +
        `- CONTEXT içinde 'Missing requested files' listeleniyorsa, bu dosyalar için arama yapma; ilk adımlar bu dosyaları oluşturmalı.\n` +
        `- Arama/retrieval yalnızca index'te mevcut dosyalar için kullanılmalı.\n\n` +
        `# JSON OUTPUT SCHEMA\n` +
        `{
` +
        `  "steps": [
` +
        `    {
` +
        `      "step": <number>,
` +
        `      "action": <string>,
` +
        `      "thought": <string>,
` +
        `      "ui_text": <string|optional>
` +
        `    }
` +
        `  ]
` +
        `}`
    );
}

export function createPlannerPrompt(plannerContext: string, userQuery: string): string {
    return (
        `# ROLE & GOAL\n` +
        `Bir Baş Yazılım Mimarısısın. Kullanıcının isteğini proje mimarisine uygun şekilde karşılayan bir uygulama planı üret.\n\n` +
        `# CONTEXT\n` +
        `${plannerContext}\n\n` +
        `# USER REQUEST\n` +
        `"${userQuery}"\n\n` +
        `# INSTRUCTIONS\n` +
        `- Yapılacak işleri en küçük uygulanabilir adımlara böl.\n` +
        `- Kod veya kod blokları ekleme; yalnızca eylemleri tarif et.\n` +
        `- Her adım kısa ve net olsun; UI için kısa bir ".ui_text" cümlesi ekle.\n` +
        `- Sadece geçerli JSON çıktısı ver, aşağıdaki şemaya uy.\n\n` +
        `# KULLANILABİLİR ARAÇLAR\n` +
        toolsTrDescriptions + `\n\n` +
        `# JSON OUTPUT SCHEMA\n` +
        `{
` +
        `  "steps": [
` +
        `    {
` +
        `      "step": <number>,
` +
        `      "action": <string>,
` +
        `      "thought": <string>,
` +
        `      "ui_text": <string|optional>
` +
        `    }
` +
        `  ]
` +
        `}`
    );
}