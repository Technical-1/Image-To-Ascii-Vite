// Build export artifacts from a converted ascii result. DOM-light: takes
// explicit args, returns Blobs/canvases. Toasts, downloads, and canvas.toBlob
// stay in the converter. hub-1111.
import { escapeHtml, lineToCells, sumAdvances } from './ascii-core.js';

export function exportTxtBlob(ascii) {
    return new Blob([ascii.text], { type: 'text/plain;charset=utf-8' });
}

export function exportHtmlBlob(ascii, { fontSize, lineHeight }, imageName) {
    const safeName = escapeHtml(imageName || 'ASCII Art');
    const body = ascii.html || escapeHtml(ascii.text);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeName} - ASCII Art</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #0a0a0a; display: flex; justify-content: center; padding: 40px 20px; min-height: 100vh; }
        .ascii-container { background: #000; color: #00ff00; font-family: 'Courier New', monospace; font-size: ${fontSize}px; line-height: ${lineHeight}; white-space: pre; padding: 30px; border: 2px solid #333; border-radius: 12px; box-shadow: 0 0 30px rgba(0, 255, 0, 0.1); overflow: auto; max-width: 100%; }
    </style>
</head>
<body>
    <pre class="ascii-container">${body}</pre>
</body>
</html>`;
    return new Blob([html], { type: 'text/html;charset=utf-8' });
}

// Render the ascii into a fresh canvas. Returns { error } if the canvas would
// exceed the browser dimension cap, else { canvas }. `doc` is injected so this
// is testable with a stubbed document. Preserves the per-cell advance model
// (hub-1108) and the monospace fast path.
export function buildPngCanvas(ascii, settings, doc) {
    const { fontSize, lineHeight, colorMode } = settings;
    const backgroundColor = '#000000';
    const textColor = '#00ff00';
    const MAX_CANVAS_DIMENSION = 32000;

    const canvas = doc.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${fontSize}px 'Courier New', monospace`;

    const lines = ascii.text.split('\n').filter((l) => l.length > 0);
    const isCustomColor = colorMode !== 'grayscale' && settings.charsetType === 'custom';
    const monoCharWidth = ctx.measureText('M').width;
    const advanceFor = isCustomColor ? (ch) => ctx.measureText(ch).width : () => monoCharWidth;

    const maxWidth = lines.length > 0 ? Math.max(...lines.map((line) => sumAdvances(line, advanceFor))) : 100;
    const canvasHeight = lines.length * fontSize * lineHeight;
    const targetWidth = maxWidth + 40;
    const targetHeight = canvasHeight + 40;

    if (targetWidth > MAX_CANVAS_DIMENSION || targetHeight > MAX_CANVAS_DIMENSION) {
        return { error: 'PNG export too large for this browser. Lower the resolution or font size and try again.' };
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${fontSize}px 'Courier New', monospace`;

    if (colorMode !== 'grayscale' && ascii.colors) {
        for (let y = 0; y < lines.length; y++) {
            const cells = lineToCells(lines[y], ascii.colors[y]);
            let currentX = 20;
            const yPos = 20 + (y + 1) * fontSize * lineHeight;
            for (let x = 0; x < cells.length; x++) {
                const { char, style } = cells[x];
                const adv = advanceFor(char);
                if (style) {
                    if (style.background) {
                        ctx.fillStyle = style.background;
                        ctx.fillRect(currentX, yPos - fontSize * lineHeight, adv, fontSize * lineHeight);
                    }
                    ctx.fillStyle = style.color;
                } else {
                    ctx.fillStyle = textColor;
                }
                ctx.fillText(char, currentX, yPos);
                currentX += adv;
            }
        }
    } else {
        ctx.fillStyle = textColor;
        lines.forEach((line, index) => {
            ctx.fillText(line, 20, 20 + (index + 1) * fontSize * lineHeight);
        });
    }

    return { canvas };
}

export function downloadBlob(blob, filename, doc) {
    const url = URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    // Defer revoke so the download latches onto the URL first (older Safari/Firefox).
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
