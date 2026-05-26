# Technology Stack

## Core Technologies

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| Language | JavaScript (ES6+) | - | Application logic, DOM manipulation, Canvas processing |
| Markup | HTML5 | - | Application structure, semantic markup |
| Styling | CSS3 | - | Dark theme, flexbox layout, responsive design |
| Build Tool | Vite | ^8.0.14 | Development server and production bundler |
| Runtime | Node.js | 18+ | Build process only (no serverless / runtime backend) |

## Frontend

- **Framework**: None (vanilla JavaScript)
- **Architecture**: Single `ImageAsciiConverter` class with DOM-based UI generation
- **State Management**: Class properties with localStorage persistence
- **Styling**: CSS custom properties (CSS variables) for theming, flexbox layout
- **Build Tool**: Vite 8 with ES module support

### Why Vanilla JavaScript?

I chose vanilla JavaScript over frameworks like React or Vue because:

1. **Simplicity**: The application has a single view with straightforward state management
2. **Performance**: No framework overhead means faster load times and smaller bundle size
3. **Maintainability**: Anyone familiar with JavaScript can understand and modify the code
4. **Learning demonstration**: Shows proficiency with core web APIs without framework abstraction

## Backend

**There is no backend.** The application is fully static: image-to-ASCII conversion is entirely client-side (Canvas API), and sharing is implemented by encoding the downscaled image plus settings into the URL fragment (`#s=…`) — no server, no database, no expiry. An earlier prototype kept share payloads in Upstash Redis behind a rate-limited serverless route; I removed it in favor of fragment encoding so the share contract has zero runtime cost and no expiry to manage.

## Infrastructure & Deployment

| Service | Purpose |
|---------|---------|
| Vercel | Static hosting + CDN + CI/CD |
| GitHub | Source code repository |

### Deployment Configuration

The `vercel.json` file configures:
- Build command: `npm run build`
- Output directory: `dist/`
- Security headers (CSP `script-src 'self'`, X-Frame-Options DENY, Referrer-Policy, X-Content-Type-Options nosniff)

## Browser APIs Used

| API | Purpose |
|-----|---------|
| Canvas API | Image resizing, pixel extraction, Sobel edge detection |
| File API | Reading uploaded image files |
| FileReader API | Converting files to data URLs |
| Clipboard API | Copy-to-clipboard functionality |
| Blob API | Generating downloadable TXT, PNG, and HTML files |
| localStorage | Persisting user settings across sessions |

## Dependencies

### Production Dependencies

**None.** The shipped application has zero runtime dependencies — all sharing, conversion, and rendering use built-in browser APIs.

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `vite` | ^8.0.14 | Build tool and development server |
| `vitest` | ^4.1.7 | Unit-test runner for the pure modules |

### Why Zero Runtime Dependencies?

1. **Security**: The smallest possible attack surface — every dependency is a supply-chain risk; this app has none at runtime.
2. **Maintenance**: No production packages to track or update.
3. **Bundle size**: The client bundle is ~38 kB (~9.7 kB gzipped) of hand-written code only.
4. **Reliability**: No upstream breakage can affect the deployed app.

## Performance Considerations

### Image Processing
- Images are processed at the target ASCII dimensions (not full resolution), keeping Canvas operations fast
- Edge detection uses a Sobel filter with pre-allocated typed arrays
- Debouncing (150ms) prevents excessive re-renders during slider adjustments
- Brightness/contrast adjustments are inlined in the pixel loop to avoid extra passes

### Rendering
- Grayscale mode uses `textContent` (no DOM parsing overhead)
- Color modes generate inline-styled `<span>` elements per character
- A 500k-cell budget gates the per-character color path; above it the renderer falls back to grayscale text with a one-shot toast (prevents ~150 MB DOM allocations at the canvas clamp ceiling)
- HTML escaping on the per-pixel hot path is a pure string replace from `src/ascii-core.js`, not a `<div>.textContent` round-trip
- Auto-fit font sizing calculates once per render and caps RAF retries at 10 to protect against permanently-hidden containers
- Canvas-based PNG export handles color data in a single pass and refuses upfront if dimensions would exceed the browser canvas limit

### Load Time
- Critical CSS inlined in `index.html` for instant loading state
- Total client JavaScript: lightweight single module
- No external fonts or large assets
- First Contentful Paint: < 1 second on average connections

## Browser Support

The application works in all modern browsers that support:
- ES6+ JavaScript (ES modules)
- HTML5 Canvas with `willReadFrequently` optimization hint
- CSS Grid and Flexbox
- Clipboard API (for copy functionality)
- localStorage

Tested browsers:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
