# Image to ASCII Converter

A feature-rich web application for converting images to ASCII art with real-time preview, color modes, sharing, and multiple export formats. Built with Vite and vanilla JavaScript.

Upload any image and customize the output with adjustable resolution, brightness, contrast, edge detection, and color modes. Share your creations via unique links stored in Upstash Redis, or export as TXT, PNG, or HTML.

**Live Demo**: [https://image-to-ascii-nine.vercel.app](https://image-to-ascii-nine.vercel.app)

## Features

- **Universal Image Support** - Works with PNG, JPG, JPEG, GIF, BMP, WEBP, and SVG files
- **Real-time Preview** - See ASCII art update instantly as you adjust any setting (150ms debounce)
- **Color Modes** - Grayscale, ANSI 256-color, RGB per-character, and Full RGB with background tinting
- **Edge Detection** - Sobel filter for emphasizing outlines and contours
- **Brightness & Contrast** - Fine-tune image processing with adjustable sliders
- **Resolution Scaling** - Percentage-based presets (10%-100%) or custom width/height up to full image dimensions
- **Multiple Character Sets** - Standard, Detailed, Blocks, Binary, Dots, or fully custom characters
- **Quick Presets** - One-click styles: Classic, Colored, Blocks, Matrix, High Contrast, Inverted
- **Shareable Links** - Generate unique share URLs backed by Upstash Redis (30-day expiration)
- **Multi-format Export** - Copy to clipboard, download as TXT, PNG (with color), or standalone HTML
- **Fit to Container** - Auto-calculates font size to fill the viewport, or manual font/line-height control
- **Persistent Settings** - All preferences saved to localStorage across sessions
- **Responsive Design** - Sidebar layout on desktop, stacked layout on mobile

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5 Canvas API, CSS3
- **Build Tool**: Vite 5
- **Backend**: Vercel Serverless Functions (Node.js)
- **Database**: Upstash Redis (share link storage)
- **Hosting**: Vercel with global CDN
- **IDs**: nanoid for share link generation

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

All image processing happens entirely in the browser. The only server-side component is the share API for generating and retrieving shared links.

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
├── index.html          # Main HTML entry point with critical CSS
├── package.json        # Dependencies and scripts
├── vite.config.js      # Vite build configuration
├── vercel.json         # Vercel deployment, API routing, CORS headers
├── api/
│   └── share.js        # Serverless function for share link CRUD (Upstash Redis)
├── public/
│   ├── favicon.png     # PNG favicon
│   ├── favicon.svg     # SVG favicon
│   ├── logo.png        # Logo / OG image
│   └── view.html       # Shared ASCII art viewer page
└── src/
    ├── script.js       # ImageAsciiConverter class - all conversion logic
    └── style.css       # Full application styles with responsive breakpoints
```

## License

MIT

## Author

Jacob Kanfer - [GitHub](https://github.com/Technical-1)
