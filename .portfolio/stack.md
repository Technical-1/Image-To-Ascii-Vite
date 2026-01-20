# Technology Stack

## Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| HTML5 | - | Application structure and semantic markup |
| CSS3 | - | Styling, animations, responsive design |
| JavaScript (ES6+) | - | Application logic, DOM manipulation |
| HTML5 Canvas API | - | Image processing and pixel manipulation |

### Why Vanilla JavaScript?

I chose vanilla JavaScript over frameworks like React or Vue because:

1. **Simplicity**: The application has a single view with straightforward state management
2. **Performance**: No framework overhead means faster load times and smaller bundle size
3. **Maintainability**: Anyone familiar with JavaScript can understand and modify the code
4. **Learning demonstration**: Shows proficiency with core web APIs without framework abstraction

## Build Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Vite | ^5.0.0 | Development server and production bundler |
| Node.js | 18+ | JavaScript runtime for build process |
| npm | 9+ | Package management |

### Why Vite?

I selected Vite as the build tool because:

1. **Development speed**: Native ES modules mean near-instant server startup
2. **Hot Module Replacement**: Changes reflect immediately without full page reload
3. **Minimal configuration**: Works out of the box for vanilla JS projects
4. **Optimized builds**: Automatic code splitting and minification for production

## Infrastructure & Deployment

| Service | Purpose |
|---------|---------|
| Vercel | Hosting and continuous deployment |
| GitHub | Source code repository |

### Deployment Configuration

The `vercel.json` file configures:
- Build command: `npm run build`
- Output directory: `dist/`
- SPA rewrites: All routes redirect to `index.html`

### Why Vercel?

I chose Vercel for deployment because:

1. **Zero configuration**: Automatic detection of Vite projects
2. **Global CDN**: Fast content delivery worldwide
3. **Free tier**: Suitable for personal projects and portfolios
4. **Git integration**: Automatic deployments on push to main branch

## Browser APIs Used

| API | Purpose |
|-----|---------|
| File API | Reading uploaded image files |
| FileReader API | Converting files to data URLs |
| Canvas API | Image resizing and pixel extraction |
| Clipboard API | Copy-to-clipboard functionality |
| Blob API | Generating downloadable text files |

## Dependencies

### Production Dependencies

None. The application runs entirely with native browser APIs.

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| vite | ^5.0.0 | Build tool and development server |

### Why Minimal Dependencies?

I intentionally kept dependencies to the absolute minimum because:

1. **Security**: Fewer dependencies means smaller attack surface
2. **Maintenance**: No need to track and update multiple packages
3. **Bundle size**: The final build is extremely small
4. **Reliability**: No risk of dependency conflicts or breaking changes

## Performance Considerations

### Image Processing

- Images are processed at the target ASCII dimensions (10-200 characters), not at full resolution
- Canvas operations are synchronous but fast due to small dimensions
- Debouncing prevents excessive re-renders during slider adjustments

### Load Time

- Total JavaScript: ~5KB minified
- CSS: ~8KB minified
- No external fonts or large assets
- First Contentful Paint: < 1 second on average connections

## Browser Support

The application works in all modern browsers that support:
- ES6+ JavaScript
- HTML5 Canvas
- CSS Grid and Flexbox
- Clipboard API (for copy functionality)

Tested browsers:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
