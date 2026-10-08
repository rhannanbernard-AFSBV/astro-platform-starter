/** Resize remote menu images for faster loads and smaller offline cache. */
export function optimizeImageUrl(url: string, width = 480): string {
    if (!url) return url;
    try {
        const parsed = new URL(url);
        if (parsed.hostname.includes('images.unsplash.com')) {
            parsed.searchParams.set('auto', 'format');
            parsed.searchParams.set('fit', 'crop');
            parsed.searchParams.set('w', String(width));
            parsed.searchParams.set('q', '70');
            return parsed.toString();
        }
    } catch {
        return url;
    }
    return url;
}
