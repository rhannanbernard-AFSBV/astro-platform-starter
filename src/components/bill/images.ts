/** Resize remote menu images for faster loads and smaller offline cache. */
export function optimizeImageUrl(url: string, width = 480): string {
    if (!url) return url;
    if (url.startsWith('data:')) return url;
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

const MAX_MENU_IMAGE_EDGE = 960;
const JPEG_QUALITY = 0.82;

/** Compress a local photo for menu storage (data URL). */
export async function fileToMenuImageDataUrl(file: File): Promise<string> {
    if (!file.type.startsWith('image/')) {
        throw new Error('Choose an image file (JPG, PNG, WebP, or SVG).');
    }
    // Keep SVG as-is (already tiny / crisp)
    if (file.type === 'image/svg+xml') {
        const text = await file.text();
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
    }
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_MENU_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        bitmap.close();
        throw new Error('Could not process image.');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    return canvas.toDataURL(mime, JPEG_QUALITY);
}
