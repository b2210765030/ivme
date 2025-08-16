/* ==========================================================================
   DOSYA 5: src/core/utils.ts (GÜNCELLENMİŞ DOSYA)
   
   SORMLULUK: Proje genelinde kullanılacak yardımcı fonksiyonları barındırır.
   YENİ: cleanLLMJsonBlock fonksiyonu daha akıllı hale getirildi.
   ========================================================================== */

export function cleanLLMCodeBlock(rawResponse: string): string {
    const cleaned = rawResponse.replace(/^```(?:\w+)?\s*\n|```\s*$/g, '');
    return cleaned.trim();
}

/**
 * YENİ ve GÜÇLENDİRİLMİŞ FONKSİYON
 * Modelden gelen yanıtın içinden JSON metnini daha güvenilir bir şekilde çıkarır.
 * Önce markdown bloğunu arar, bulamazsa ilk '{' ve son '}' arasındaki metni alır.
 * @param rawResponse Modelden gelen ham metin.
 * @returns Temizlenmiş JSON string'i.
 */
export function cleanLLMJsonBlock(rawResponse: string): string {
    // 1. Önce ```json ile başlayan bir blok arayın ve kapanışı en sondaki ``` olarak kabul edin
    const fenceStart = rawResponse.indexOf('```json');
    if (fenceStart !== -1) {
        // Başlangıçtan sonra ilk satır sonunu geç (```json\n ...)
        const afterStart = rawResponse.indexOf('\n', fenceStart);
        const fenceEnd = rawResponse.lastIndexOf('```'); // iç içe kod blokları varsa ilk kapanış yerine en sondakini al
        if (afterStart !== -1 && fenceEnd > afterStart) {
            return rawResponse.substring(afterStart + 1, fenceEnd).trim();
        }
    }

    // 2. Markdown bloğu yoksa, ilk açılan ve son kapanan süslü parantezi bul
    const firstBrace = rawResponse.indexOf('{');
    const lastBrace = rawResponse.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace > firstBrace) {
        // Parantezler arasındaki metni alıp temizle
        return rawResponse.substring(firstBrace, lastBrace + 1).trim();
    }

    // 3. Hiçbir şey bulunamazsa, orijinal yanıtı (muhtemelen hatalı) geri döndür
    return rawResponse.trim();
}

export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// Basit UUID v4 üretici (çakışma riski düşük)
export function generateUuid(): string {
    // RFC4122 v4 (basitleştirilmiş)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}