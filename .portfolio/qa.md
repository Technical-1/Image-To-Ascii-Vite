# Project Q&A Knowledge Base

## Overview

Image to ASCII Converter is a web application that transforms any image into ASCII art directly in the browser. I built it to provide quick, private ASCII art generation with advanced controls for color, contrast, edge detection, and sharing — all without requiring software installation or server uploads. The target users are developers adding ASCII art to documentation, digital artists exploring text-based aesthetics, and anyone creating retro-style visual representations for social media, READMEs, or creative projects.

## Key Features

- **Real-Time Conversion**: Adjusting any setting (resolution, brightness, contrast, character set, color mode) updates the ASCII output instantly with a 150ms debounce for smooth interaction
- **Color Modes**: Four rendering modes — Grayscale (plain text), ANSI 256-color, RGB per-character coloring, and Full RGB with background tinting
- **Edge Detection**: Optional Sobel filter that emphasizes outlines and contours in the ASCII output
- **Shareable Links**: One-click sharing generates a self-contained URL — the downscaled image and settings are encoded directly into the link's fragment (`#s=…`). No server, no expiry, no third-party storage; the same app regenerates the art in a read-only view mode
- **Multi-Format Export**: Copy to clipboard, download as TXT, render to PNG (preserving colors), or export as standalone HTML
- **Quick Presets**: Six one-click presets (Classic, Colored, Blocks, Matrix, High Contrast, Inverted) that configure multiple settings at once
- **Persistent Settings**: All preferences automatically saved to localStorage and restored on next visit

## Technical Highlights

### Sobel Edge Detection
I implemented a Sobel filter that runs on the downscaled Canvas pixel data. The 3x3 convolution kernels detect horizontal and vertical gradients, and pixels whose combined gradient magnitude exceeds a threshold are replaced with that magnitude (clamped to 255). Non-edge pixels are left untouched, so the original image remains visible underneath while edges appear as crisp bright outlines instead of additive halos. The filter operates on the already-downscaled image, so performance impact is minimal.

### One Color Source of Truth Across Screen and Export
The `pixelsToAscii` method generates both plain text and colored HTML in a single pixel-processing loop. Grayscale mode renders with `textContent` (no DOM parsing), while color modes use `innerHTML` with per-character `<span>` elements. The subtle problem is that the live preview and the PNG exporter are two separate renderers of the same art, and they originally re-derived each cell's color independently — which let them diverge. ANSI mode painted the quantized 6×6×6 cube color on screen but stored the raw pixel RGB for export, and the PNG path indexed the text by UTF-16 code unit, splitting emoji custom charsets and shifting their colors. I pulled cell color and glyph resolution into pure helpers in `src/ascii-core.js` (`colorCellStyle`, `prepareGlyphs`, `lineToCells`) that both renderers consume, so the exported PNG matches the preview by construction instead of by two code paths happening to stay in sync.

### Auto-Fit Font Sizing
The "Fit to Container" feature calculates the optimal font size by dividing available viewport dimensions by the ASCII grid dimensions (accounting for monospace character width ratio of ~0.6). This ensures the output always fills the screen regardless of resolution settings or window size.

### Class-Based Architecture
I refactored the original module-scoped functions into an `ImageAsciiConverter` class. This encapsulates all state (current image, settings, debounce timer) and provides clean separation between image processing, UI management, and export functionality. Settings persist via localStorage with a defaults-merge pattern.

### Client-Side URL Share System
The share feature encodes the downscaled source image plus settings into the URL fragment using a small pure codec (`src/share-codec.js`): base64url of a JSON `{ v, settings, img: data:image/png;base64,… }`. Because it's a fragment, it never reaches any server. Opening the link puts the same SPA into a read-only view mode that re-runs the shared deterministic pipeline (`src/ascii-core.js`) to regenerate identical output. The codec hardens the untrusted-input boundary with a raster-only data-URI allowlist (no SVG), size and structural guards, and an injected `sanitizeSettings` clamp.

## Engineering Decisions

### Client-side fragment sharing instead of a server share API
- **Constraint**: Sharing needs to work without me operating a backend, paying for storage, or expiring links.
- **Options**: A serverless route writing to Upstash Redis with short IDs and a TTL; an object-store presigned upload; or encoding the payload directly into the URL.
- **Choice**: Encode the downscaled image plus settings into the URL fragment (`#s=…`) using a small base64url codec in `src/share-codec.js`.
- **Why**: Fragments never reach a server, so there is nothing to host, rate-limit, or expire. The 2 MB encode-time cap keeps links pasteable in browser address bars and chat apps; anything bigger fails with a toast pointing the user at the resolution slider. I previously had the Upstash flow working and removed it once the fragment path proved viable.

### Color-cell budget instead of an unbounded color render
- **Constraint**: At max canvas dimensions (2000×2000 = 4M cells) the color modes would allocate roughly 4M `<span>` nodes — about 150 MB of DOM — and OOM mobile Safari.
- **Options**: Cap the resolution slider, virtualize the output, or gate color rendering behind a tractability check.
- **Choice**: Keep the grid uncapped for grayscale (one `textContent` write) and gate color rendering on a 500k-cell budget (`MAX_COLOR_CELLS` in `src/settings-schema.js`). Above the budget, both `pixelsToAscii` and `renderAscii` fall back to grayscale text and show a one-shot toast.
- **Why**: Grayscale stays fast all the way to the canvas clamp, color stays usable up to the budget, and the failure mode is a readable image plus an explanation instead of a crashed tab.

### Pure conversion core separated from the UI driver
- **Constraint**: The conversion pipeline runs in create mode, in the share-view mode, and in unit tests — three call sites that have to agree exactly.
- **Options**: Duplicate the math, expose internals of the converter class, or extract the math into a DOM-free module.
- **Choice**: Split `src/ascii-core.js` out of `src/script.js`. The core module owns brightness/contrast, weighted luminance, character mapping, ANSI quantization, Sobel edges, and a pure HTML escape. The class in `script.js` is the UI driver around it.
- **Why**: Vitest imports the same code the production hot path runs, so a regression in luminance weights or ramp mapping fails a test instead of shipping. It also keeps the per-pixel inner loop free of DOM allocations — the HTML escape is a pure string replace, not a `<div>.textContent` round-trip.

### Vanilla JS with a single class instead of a framework
- **Constraint**: One screen, one piece of state (current image + settings), and a goal of a small bundle.
- **Options**: React, Vue/Svelte, or no framework.
- **Choice**: A single `ImageAsciiConverter` class with localStorage persistence and DOM-built controls.
- **Why**: A framework would add bundle weight and a render boundary without buying anything for a single-view app. The class keeps state in one place; localStorage gives session persistence without a router or store; the result is a ~38 kB / ~9.7 kB-gzip hand-written bundle.

## Frequently Asked Questions

### How does the image conversion work?
The image is drawn to an HTML5 Canvas at the target ASCII dimensions (e.g., 100x50 characters). I then extract pixel data, optionally apply Sobel edge detection, adjust brightness/contrast, convert each pixel to a weighted grayscale value (0.299R + 0.587G + 0.114B), and map that brightness to a character from the selected set. In color modes, each character also gets the original pixel's color as an inline style.

### Why does my ASCII art look stretched?
Characters are taller than they are wide, so ASCII art naturally appears stretched horizontally. The percentage-based resolution system automatically accounts for this by halving the height. For custom dimensions, I recommend using width values roughly 2x your height value for proportional results.

### What are the color modes?
- **Grayscale**: Plain text with green-on-black terminal aesthetic
- **ANSI**: Maps pixel colors to the nearest ANSI 256-color palette (6x6x6 color cube)
- **RGB**: Each character gets the exact pixel color via inline CSS
- **Full RGB**: Like RGB, but also adds a semi-transparent background tint per character for richer output

### How does sharing work?
Clicking "Share" encodes the downscaled image plus your current settings into the URL fragment (`#s=…`) and copies the resulting link to your clipboard. There's no server — the data never leaves the link. Opening that link in another browser puts the same app into a read-only view mode that decodes the fragment and re-runs the conversion pipeline to render byte-identical art, with the same Copy / TXT / PNG / HTML export buttons available.

### How does edge detection work?
I implemented a Sobel filter — a classic image processing technique that uses two 3x3 convolution kernels to detect horizontal and vertical brightness gradients. Pixels whose gradient magnitude exceeds a threshold are replaced with that magnitude (clamped to 255), while non-edge pixels are left untouched. This makes edges appear as crisp brighter characters in the ASCII output without washing out the rest of the image.

### Can I use colored ASCII output?
Yes! The app supports four color modes. RGB and Full RGB modes produce colored HTML output that preserves in the PNG and HTML exports. The copy-to-clipboard function outputs plain text regardless of color mode, since terminal/text contexts don't support inline colors.

### Will the exported PNG look exactly like the preview?
Yes. The on-screen renderer and the canvas PNG exporter resolve each cell's color and glyph through the same pure helpers (`colorCellStyle` and `lineToCells`), so they can't drift. That matters most in two cases: ANSI mode exports the same quantized 6×6×6 cube color it shows on screen (not the raw pixel color), and emoji custom charsets stay whole and color-aligned in the PNG because lines are split by grapheme rather than by UTF-16 code unit.

### Why did you choose vanilla JavaScript over a framework?
The application has a single view with straightforward state management. A framework would add bundle size and complexity without meaningful benefit. The `ImageAsciiConverter` class provides clean organization, and the total client-side JavaScript stays extremely lightweight.

### Can I convert animated GIFs?
The converter extracts a single frame from GIFs. Full animation support would require significantly more complex handling and larger output. This could be a future enhancement.

### What browsers are supported?
All modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+) are supported. The application uses standard Web APIs (Canvas, Clipboard, localStorage, ES modules) without polyfills.

### Can I use emoji or other multi-byte characters in custom character sets?
Yes. The character-ramp pipeline iterates with `Array.from`, which is grapheme-aware, so each emoji (or other surrogate-pair glyph) is treated as a single character instead of being split into two broken halves. You can paste a string like `🎨🔥💎` into the custom charset input and the brightness ramp will use one emoji per stop.

### Is the app accessible to screen-reader and keyboard users?
Yes on both counts. The upload area is exposed as `role="button"` with `tabindex="0"` and an `aria-label`, and it responds to Enter and Space — so a keyboard-only user can Tab to it and trigger the file picker without ever touching the mouse. All toolbar buttons have `aria-label` attributes, the ASCII output container has `role="img"` with a descriptive label, and the toast notification element uses `role="status"` with `aria-live="polite"` so status messages like "Image loaded", "Saved as PNG!", and error toasts are announced as they appear.

### What happens if I crank the resolution to max with a color mode on?
The converter clamps the underlying canvas at 2000×2000 (4M pixels). Above 500,000 cells in a color mode, the renderer falls back to grayscale text and shows a one-shot toast explaining that color rendering needs a lower resolution — without that guard, generating 4M `<span>` elements would allocate around 150 MB of DOM nodes and freeze (or crash) mobile Safari. Grayscale rendering is one `textContent` write and stays fast all the way up to the canvas clamp.

### How do I report bugs or suggest features?
The project is hosted on GitHub. You can open an issue or pull request at [github.com/Technical-1/Image-To-Ascii-Vite](https://github.com/Technical-1/Image-To-Ascii-Vite).
