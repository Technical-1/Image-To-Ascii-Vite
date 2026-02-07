# Technology Stack

## Core Technologies

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| Language | JavaScript (ES6+) | - | Application logic, DOM manipulation, Canvas processing |
| Markup | HTML5 | - | Application structure, semantic markup |
| Styling | CSS3 | - | Dark theme, flexbox layout, responsive design |
| Build Tool | Vite | ^5.0.0 | Development server and production bundler |
| Runtime | Node.js | 18+ | Build process and serverless functions |

## Frontend

- **Framework**: None (vanilla JavaScript)
- **Architecture**: Single `ImageAsciiConverter` class with DOM-based UI generation
- **State Management**: Class properties with localStorage persistence
- **Styling**: CSS custom properties (CSS variables) for theming, flexbox layout
- **Build Tool**: Vite 5 with ES module support

### Why Vanilla JavaScript?

I chose vanilla JavaScript over frameworks like React or Vue because:

1. **Simplicity**: The application has a single view with straightforward state management
2. **Performance**: No framework overhead means faster load times and smaller bundle size
3. **Maintainability**: Anyone familiar with JavaScript can understand and modify the code
4. **Learning demonstration**: Shows proficiency with core web APIs without framework abstraction

## Backend

- **Runtime**: Vercel Serverless Functions (Node.js)
- **API Style**: REST (single `/api/share` endpoint with GET/POST)
- **Database**: Upstash Redis (key-value store with TTL)

The backend exists solely for the sharing feature. The core image-to-ASCII conversion is entirely client-side.

## Infrastructure & Deployment

| Service | Purpose |
|---------|---------|
| Vercel | Hosting, serverless functions, CDN, CI/CD |
| Upstash Redis | Share link storage with 30-day TTL |
| GitHub | Source code repository |

### Deployment Configuration

The `vercel.json` file configures:
- Build command: `npm run build`
- Output directory: `dist/`
- API route rewrites: `/api/*` mapped to serverless functions
- CORS headers for API endpoints

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

| Package | Version | Purpose |
|---------|---------|---------|
| `@upstash/redis` | ^1.34.0 | Redis client for share link storage (serverless function only) |
| `nanoid` | ^5.0.0 | Unique ID generation for share links |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `vite` | ^5.0.0 | Build tool and development server |

### Why Minimal Dependencies?

I intentionally kept dependencies to the absolute minimum because:

1. **Security**: Fewer dependencies means smaller attack surface
2. **Maintenance**: No need to track and update many packages
3. **Bundle size**: The client-side build is extremely small
4. **Reliability**: No risk of dependency conflicts or breaking changes

The two production dependencies (`@upstash/redis` and `nanoid`) are only used in the serverless function, not in the client bundle.

## Performance Considerations

### Image Processing
- Images are processed at the target ASCII dimensions (not full resolution), keeping Canvas operations fast
- Edge detection uses a Sobel filter with pre-allocated typed arrays
- Debouncing (150ms) prevents excessive re-renders during slider adjustments
- Brightness/contrast adjustments are inlined in the pixel loop to avoid extra passes

### Rendering
- Grayscale mode uses `textContent` (no DOM parsing overhead)
- Color modes generate inline-styled `<span>` elements per character
- Auto-fit font sizing calculates once per render, not per frame
- Canvas-based PNG export handles color data in a single pass

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
