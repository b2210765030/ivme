/* ==========================================================================
   TOKEN SAYMA UTILITY'Sİ
   ========================================================================== */

// GPT tokenizer için basit yaklaşım
// Gerçek tokenizer daha karmaşık ama bu yaklaşım çoğu durumda yeterli
export function countTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    
    // Basit token sayma: 1 token ≈ 4 karakter (GPT için yaklaşık)
    // Daha hassas hesaplama için:
    // - Kelime sayısı + özel karakterler
    // - Türkçe karakterler için ek düzeltme
    
    // Önce metni temizle
    const cleanText = text.trim();
    
    // Kelime sayısı (boşluklarla ayrılmış)
    const words = cleanText.split(/\s+/).filter(word => word.length > 0);
    
    // Özel karakterler ve sayılar için ek token
    const specialChars = cleanText.match(/[^\w\s]/g) || [];
    const numbers = cleanText.match(/\d+/g) || [];
    
    // Türkçe karakterler için ek düzeltme
    const turkishChars = cleanText.match(/[çğıöşüÇĞIİÖŞÜ]/g) || [];
    
    // Token sayısı = kelime sayısı + özel karakterler + sayılar + Türkçe karakter düzeltmesi
    let tokenCount = words.length + specialChars.length + numbers.length;
    
    // Türkçe karakterler için ek token (bazı tokenizer'lar bunları ayrı sayar)
    tokenCount += Math.ceil(turkishChars.length / 2);
    
    // Minimum token sayısı
    return Math.max(1, tokenCount);
}

// Daha hassas token sayma (GPT-3/4 için)
export function countTokensGPT(text) {
    if (!text || typeof text !== 'string') return 0;
    
    // GPT tokenizer yaklaşımı:
    // - Her kelime genellikle 1-2 token
    // - Özel karakterler genellikle 1 token
    // - Sayılar genellikle 1 token
    // - Türkçe karakterler ek token gerektirebilir
    
    const cleanText = text.trim();
    
    // Kelime sayısı
    const words = cleanText.split(/\s+/).filter(word => word.length > 0);
    
    // Uzun kelimeler için ek token (20+ karakter)
    const longWords = words.filter(word => word.length > 20);
    
    // Özel karakterler
    const specialChars = cleanText.match(/[^\w\s]/g) || [];
    
    // Sayılar
    const numbers = cleanText.match(/\d+/g) || [];
    
    // Türkçe karakterler
    const turkishChars = cleanText.match(/[çğıöşüÇĞIİÖŞÜ]/g) || [];
    
    // Token hesaplama
    let tokenCount = words.length;
    tokenCount += longWords.length; // Uzun kelimeler için ek token
    tokenCount += specialChars.length;
    tokenCount += numbers.length;
    tokenCount += Math.ceil(turkishChars.length / 3); // Türkçe karakterler için ek token
    
    return Math.max(1, tokenCount);
}

// Metin için token sayısını hesapla ve limit kontrolü yap
export function calculateTokenUsage(text, limit = 12000) {
    const tokenCount = countTokensGPT(text);
    const isLimitExceeded = tokenCount > limit;
    const remainingTokens = Math.max(0, limit - tokenCount);
    
    return {
        tokenCount,
        isLimitExceeded,
        remainingTokens,
        limit
    };
}

// Birden fazla metin parçası için toplam token sayısı
export function calculateTotalTokenUsage(texts, limit = 12000) {
    if (!Array.isArray(texts)) {
        texts = [texts];
    }
    
    const totalTokens = texts.reduce((sum, text) => sum + countTokensGPT(text), 0);
    const isLimitExceeded = totalTokens > limit;
    const remainingTokens = Math.max(0, limit - totalTokens);
    
    return {
        totalTokens,
        isLimitExceeded,
        remainingTokens,
        limit,
        breakdown: texts.map(text => ({
            text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
            tokens: countTokensGPT(text)
        }))
    };
}
