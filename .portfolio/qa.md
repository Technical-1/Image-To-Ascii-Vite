# Project Q&A Knowledge Base

## Overview

Image to ASCII Converter is a web application that transforms any image into ASCII art directly in the browser. I built it to provide quick, private ASCII art generation with advanced controls for color, contrast, edge detection, and sharing — all without requiring software installation or server uploads. The target users are developers adding ASCII art to documentation, digital artists exploring text-based aesthetics, and anyone creating retro-style visual representations for social media, READMEs, or creative projects.

## Key Features

- **Real-Time Conversion**: Adjusting any setting (resolution, brightness, contrast, character set, color mode) updates the ASCII output instantly with a 150ms debounce for smooth interaction
- **Color Modes**: Four rendering modes — Grayscale (plain text), ANSI 256-color, RGB per-character coloring, and Full RGB with background tinting
- **Edge Detection**: Optional Sobel filter that emphasizes outlines and contours in the ASCII output
- **Shareable Links**: One-click sharing generates a unique URL backed by Upstash Redis with a 30-day expiration. The shared view page includes its own export buttons and view counter
- **Multi-Format Export**: Copy to clipboard, download as TXT, render to PNG (preserving colors), or export as standalone HTML
- **Quick Presets**: Six one-click presets (Classic, Colored, Blocks, Matrix, High Contrast, Inverted) that configure multiple settings at once
- **Persistent Settings**: All preferences automatically saved to localStorage and restored on next visit

## Technical Highlights

### Sobel Edge Detection
I implemented a Sobel filter that runs on the downscaled Canvas pixel data. The 3x3 convolution kernels detect horizontal and vertical gradients, and the combined magnitude is added to the original pixel brightness. This creates ASCII art that emphasizes edges and outlines while preserving the overall tonal structure. The filter operates on the already-downscaled image, so performance impact is minimal.

### Dual-Output Pipeline
The `pixelsToAscii` method generates both plain text and colored HTML in a single pixel-processing loop. Grayscale mode renders with `textContent` (no DOM parsing), while color modes use `innerHTML` with per-character `<span>` elements. This dual output means export functions can immediately use the appropriate format without re-processing.

### Auto-Fit Font Sizing
The "Fit to Container" feature calculates the optimal font size by dividing available viewport dimensions by the ASCII grid dimensions (accounting for monospace character width ratio of ~0.6). This ensures the output always fills the screen regardless of resolution settings or window size.

### Class-Based Architecture
I refactored the original module-scoped functions into an `ImageAsciiConverter` class. This encapsulates all state (current image, settings, debounce timer) and provides clean separation between image processing, UI management, and export functionality. Settings persist via localStorage with a defaults-merge pattern.

### Serverless Share System
The share feature uses a minimal serverless function (`api/share.js`) with Upstash Redis. POST creates a new entry with a nanoid-generated key and 30-day TTL; GET retrieves the data and increments a view counter. The shared viewer (`view.html`) is a fully self-contained page with its own auto-fit logic and export buttons.

## Development Story

- **Hardest Part**: Getting the color modes to work correctly across the conversion pipeline, export functions, and shared viewer. Each output format (clipboard text, PNG canvas, HTML download, shared view) needs different handling of the color data.
- **Lessons Learned**: The percentage-based resolution system works much better than fixed width/height sliders. Users intuitively understand "50% of original" better than "set width to 200 characters."
- **Future Plans**: Animated GIF support (multi-frame), WebWorker-based processing for very large images, and a gallery of community-shared creations.

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
Clicking "Share" sends the ASCII output and current settings to a serverless API. The API stores the data in Upstash Redis with a unique nanoid-generated ID and 30-day expiration. The generated URL points to `view.html?id=xxx`, which fetches and renders the shared art with its own auto-fit sizing and export buttons.

### How does edge detection work?
I implemented a Sobel filter — a classic image processing technique that uses two 3x3 convolution kernels to detect horizontal and vertical brightness gradients. The gradient magnitude is added to the original pixel brightness, which makes edges appear as brighter (more detailed) characters in the ASCII output.

### Can I use colored ASCII output?
Yes! The app supports four color modes. RGB and Full RGB modes produce colored HTML output that preserves in the PNG and HTML exports. The copy-to-clipboard function outputs plain text regardless of color mode, since terminal/text contexts don't support inline colors.

### Why did you choose vanilla JavaScript over a framework?
The application has a single view with straightforward state management. A framework would add bundle size and complexity without meaningful benefit. The `ImageAsciiConverter` class provides clean organization, and the total client-side JavaScript stays extremely lightweight.

### Can I convert animated GIFs?
The converter extracts a single frame from GIFs. Full animation support would require significantly more complex handling and larger output. This could be a future enhancement.

### What browsers are supported?
All modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+) are supported. The application uses standard Web APIs (Canvas, Clipboard, localStorage, ES modules) without polyfills.

### How do I report bugs or suggest features?
The project is hosted on GitHub. You can open an issue or pull request at [github.com/Technical-1/Image-To-Ascii-Vite](https://github.com/Technical-1/Image-To-Ascii-Vite).
