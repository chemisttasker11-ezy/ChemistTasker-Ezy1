/** Presentation helpers for API codes. No page or component dependencies. */

/** PHARMACY_ASSISTANT -> "Pharmacy assistant"; other text is returned unchanged. */
export const humanizeEnum = (value: unknown): string => {
    if (value == null) return '';
    const text = String(value).trim();
    if (!text) return '';
    if (!/^[A-Z0-9_]+$/.test(text)) return text;
    const words = text.toLowerCase().split('_').filter(Boolean).join(' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
};
