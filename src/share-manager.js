// Build the shareable URL (or throw via the codec). Clipboard, button text, and
// toasts stay in the converter — those are DOM/UX concerns. hub-1111.
import { encodeShare } from './share-codec.js';

export function buildShareUrl({ settings, img, origin, pathname }) {
    const encoded = encodeShare({ settings, img });
    return `${origin}${pathname}#s=${encoded}`;
}
