# Image to ASCII Converter

A feature-rich web application for converting images to ASCII art with real-time preview, color modes, sharing, and multiple export formats. Built with Vite and vanilla JavaScript.

Upload any image and customize the output with adjustable resolution, brightness, contrast, edge detection, and color modes. Share your creations via self-contained links encoded in the URL, or export as TXT, PNG, or HTML.

**Live Demo**: [https://image-to-ascii-fast.vercel.app](https://image-to-ascii-fast.vercel.app)

## Features

- **Raster Image Support** - Works with PNG, JPG, JPEG, GIF, BMP, and WEBP files (SVG is intentionally rejected — it has no reliable intrinsic raster size and is a known canvas attack surface)
- **Real-time Preview** - See ASCII art update instantly as you adjust any setting (150ms debounce)
- **Color Modes** - Grayscale, ANSI 256-color, RGB per-character, and Full RGB with background tinting
- **Edge Detection** - Sobel filter for emphasizing outlines and contours
- **Brightness & Contrast** - Fine-tune image processing with adjustable sliders
- **Resolution Scaling** - Percentage-based presets (10%-100%) or custom width/height up to full image dimensions
- **Multiple Character Sets** - Standard, Detailed, Blocks, Binary, Dots, or fully custom characters (any Unicode, including emoji and other multi-byte glyphs)
- **Quick Presets** - One-click styles: Classic, Colored, Blocks, Matrix, High Contrast, Inverted
- **Accessible** - ARIA labels on controls, keyboard-operable upload area (Tab + Enter/Space), `role="status"` / `aria-live` toast notifications for screen-reader users
- **Shareable Links** - Generate a self-contained share URL — the artwork is encoded directly in the link (no server, no expiry, works offline)
- **Multi-format Export** - Copy to clipboard, download as TXT, PNG (with color), or standalone HTML
- **Fit to Container** - Auto-calculates font size to fill the viewport, or manual font/line-height control
- **Persistent Settings** - All preferences saved to localStorage across sessions
- **Installable & Offline** - Installable as a PWA; a hand-rolled service worker (zero dependencies) caches the app shell so the whole app — including opening shared `#s=` links — works fully offline after the first visit
- **Responsive Design** - Sidebar layout on desktop, stacked layout on mobile

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5 Canvas API, CSS3 — a stateful UI orchestrator around DOM-free conversion/export/share modules
- **Build Tool**: Vite 8
- **Testing**: Vitest 4 — unit tests for the pure modules plus jsdom characterization tests for the orchestrator
- **Hosting**: Vercel with global CDN
- **Sharing**: URL-fragment encoded (no backend)

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Then open your browser to the URL shown (typically `http://localhost:5173`).

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## How It Works

1. **Upload** - User drops or selects an image file
2. **Resize** - Image is drawn to an HTML5 Canvas at the target ASCII dimensions
3. **Process** - Pixel data is extracted; optional edge detection (Sobel) is applied
4. **Adjust** - Brightness and contrast corrections are applied per-pixel
5. **Map** - Each pixel's brightness (weighted luminance: 0.299R + 0.587G + 0.114B) maps to an ASCII character
6. **Colorize** - In color modes, each character gets an inline `color` style from its source pixel
7. **Render** - Output is displayed with auto-fitted font sizing

All image processing happens entirely in the browser. Sharing encodes the downscaled image plus settings into the URL fragment; opening the link regenerates the art client-side.

## Character Sets

| Name | Characters | Use Case |
|------|-----------|----------|
| Standard | ` .:-=+*#%@` | Good balance of detail |
| Detailed | ` .'^:;!i><~+?...` | Fine-grained gradations |
| Blocks | ` ░▒▓█` | Bold, graphic look |
| Binary | ` █` | High-contrast silhouettes |
| Dots | ` .·:•` | Subtle, minimalist style |
| Custom | User-defined | Any Unicode characters |

## Project Structure

```
Image-To-Ascii-Vite/
├── index.html              # Main HTML entry point with critical CSS
├── package.json            # Dependencies and scripts
├── package-lock.json       # Pinned dependency tree (committed for reproducible builds)
├── vite.config.js          # Vite build configuration
├── vercel.json             # Vercel deployment, CSP/security headers
├── public/
│   ├── favicon-{16,32,180,512}.png   # Favicons at multiple sizes
│   ├── favicon.svg                    # Scalable favicon (primary)
│   ├── og-image.png                   # Open Graph / social preview image
│   ├── manifest.webmanifest           # PWA manifest (installable metadata)
│   └── sw.js                          # Offline service worker (zero deps)
├── src/
│   ├── script.js           # ImageAsciiConverter — stateful UI orchestrator
│   ├── ascii-core.js       # Pure DOM-free conversion algorithms (shared with tests)
│   ├── image-processor.js  # Canvas draw + pixels→ASCII ({text, html, colors})
│   ├── export-manager.js   # TXT / HTML / PNG artifact builders + downloads
│   ├── share-manager.js    # Builds the self-contained share URL
│   ├── ui-manager.js       # Create-mode markup builder + style presets
│   ├── share-codec.js      # URL-fragment share payload encode/decode
│   ├── settings-schema.js  # Settings schema, defaults, and clamp/validate
│   └── style.css           # Full application styles with responsive breakpoints
├── tests/
│   ├── ascii-conversion.test.js            # Unit tests for ascii-core algorithms
│   ├── image-processor.test.js             # Pixels→ASCII conversion tests
│   ├── settings-schema.test.js             # Sanitize/clamp contract tests
│   ├── share-codec.test.js                 # Encode/decode round-trip + hostile-input tests
│   ├── ui-manager.test.js                  # Markup builder tests
│   ├── converter.characterization.test.js  # jsdom characterization tests for the orchestrator
│   └── helpers/                            # Canvas + localStorage stubs for the jsdom tests
```

## License

MIT

## Author

Jacob Kanfer - [GitHub](https://github.com/Technical-1)
