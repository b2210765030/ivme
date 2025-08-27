/* ==========================================================================
   DOSYA: src/core/promptBuilder.ts (BASKILANMIŞ TALİMATLAR)

   SORUMLULUK: Tüm sistem (system) ve kullanıcı (user) talimatlarını
   merkezi olarak oluşturur.
   ========================================================================== */

import { ContextManager } from '../features/manager/context';
import { ChatMessage } from '../types';
import { toolsTrDetailed, toolsTrShort, toolsTrDescriptions, getToolsDescriptions, getToolsDescriptionsSync } from './tool';

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
 * Tool-calling tabanlı planner için kısa TR system prompt’u.
 */
export function createPlannerToolCallingSystemPrompt(): string {
    // Araç listesini (TR) sisteme ekle (statik tanım; dinamik yükleme başarısızsa fallback)
    let toolList = toolsTrDescriptions;
    try {
        toolList = getToolsDescriptionsSync('tr');
    } catch {}
    return [
        "Sen bir Baş Yazılım Mimarısısın.",
        "Görevin: tool-calling ile ya İLK PLAN (create_plan) üretmek ya da mevcut plan için SADECE DEĞİŞİKLİK (propose_plan_changes) önermektir.",
        "ZORUNLU DAVRANIŞ:",
        "- Eğer 'Previous Plan (for revision)' bölümü veya önceki plana dair işaretler varsa, KESİNLİKLE 'propose_plan_changes' kullan. 'create_plan' kullanma.",
        "- 'Completed Plan Steps' bölümünde listelenen adımları ASLA yeniden ekleme/değiştirme; olduğun gibi KORU.",
        "Kurallar:",
        "- Kod üretme; sadece adım tanımı/araç ve argümanları.",
        "- Revizyon modunda TAM PLANI yazma; sadece değişiklikleri (insert/delete/update/reorder) döndür.",
        "- Dosya odak/selection kısıtları varsa onlara uy.",
        "- Kullanıcı 'şuraya yaz' gibi bir düzenleme isterse, önce dizin ve dosyanın mevcudiyetini KONTROL ET (check_index). Varsa doğrudan düzenle (edit_file/append_file); yoksa sadece gerekli adımı öner.",
        "- Daha önce tamamlanmış adımları tekrarlama; minimal delta öner.",
        "- Önceki planı mümkün olduğunca KORU; sadece gerekli minimal değişiklikleri öner.",
        "--- Kullanılabilir Araçlar (TR) ---\n" + toolList
    ].join(' ');
}

// Act sonrası özet ve öneriler (TR)
export function createActSummaryPrompts(actionsText: string): { system: string; user: string } {
    const system = [
        'Türkçe ve kısa yaz. Kod blokları, başlıklar veya gereksiz süsleme yok.',
        'Madde işareti kullanabilirsin. Önce neler yapıldığını ve nelerin eklendiğini/oluşturulduğunu belirt.',
        "Ardından 'Önerilen sonraki adımlar' için 1-3 madde yaz.",
        'Gerekirse kullanıcıdan onay talep eden kısa bir kapanış ekle.'
    ].join(' ');
    const user = `Gerçekleştirilen adımlar:\n${actionsText}\n\nÖzet ve öneriler:`;
    return { system, user };
}