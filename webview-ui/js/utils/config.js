/* ==========================================================================
   KÜTÜPHANE YAPILANDIRMASI
   Marked.js ve Highlight.js gibi harici kütüphaneleri ayarlar.
   ========================================================================== */

export function configureLibraries() {
    if (typeof marked === 'undefined' || typeof hljs === 'undefined') {
        console.error("Marked.js veya Highlight.js yüklenemedi.");
        return;
    }

    marked.setOptions({
        highlight: function(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-'
    });
}