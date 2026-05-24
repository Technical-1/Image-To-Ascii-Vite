# Architecture Overview

## System Diagram

```mermaid
flowchart TB
    subgraph Client["Browser (Client-Side)"]
        UI["User Interface<br/>index.html + style.css"]
        Converter["ImageAsciiConverter Class<br/>script.js"]
        Canvas["HTML5 Canvas API"]
        FileAPI["File Reader API"]
        Clipboard["Clipboard API"]
        Storage["localStorage<br/>(Settings Persistence)"]
    end

    subgraph UserInteraction["User Interaction"]
        Upload["Image Upload<br/>(Click or Drag & Drop)"]
        Controls["Resolution / Brightness /<br/>Contrast / Color Mode"]
        CharSet["Character Set Selection"]
        Presets["Quick Presets<br/>(Classic, Colored, Blocks, etc.)"]
        Actions["Share / Copy / Export"]
    end

    subgraph Processing["Image Processing Pipeline"]
        Load["Load Image via FileReader"]
        Resize["Draw to Canvas at Target Dimensions"]
        Edge["Sobel Edge Detection<br/>(Optional)"]
        BrightContrast["Brightness & Contrast Adjustment"]
        Grayscale["Weighted Luminance<br/>(0.299R + 0.587G + 0.114B)"]
        Map["Map Brightness to Characters"]
        Colorize["Apply Color Mode<br/>(Grayscale / ANSI / RGB / Full RGB)"]
        Render["Render ASCII Output<br/>(Auto-fit or Manual Font)"]
    end

    ShareCodec["share-codec.js<br/>(URL fragment encode/decode)"]

    Upload --> FileAPI
    FileAPI --> Load
    Load --> Canvas
    Canvas --> Resize
    Controls --> Resize
    Resize --> Edge
    Edge --> BrightContrast
    BrightContrast --> Grayscale
    Grayscale --> Map
    CharSet --> Map
    Presets --> Controls
    Map --> Colorize
    Colorize --> Render
    Render --> UI
    Actions --> Clipboard
    Actions --> ShareCodec
    Converter --> Storage

    subgraph Build["Build & Deploy"]
        Vite["Vite 8 Build Tool"]
        Vercel["Vercel Hosting + CDN"]
    end

    UI --> Vite
    Vite --> Vercel
```

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant FileInput
    participant FileReader
    participant ImageAsciiConverter
    participant Canvas
    participant Preview
    participant ShareCodec

    User->>FileInput: Select/drop image file
    FileInput->>FileReader: Read as DataURL
    FileReader->>Preview: Display image thumbnail + metadata
    FileReader->>ImageAsciiConverter: Store DataURL

    User->>ImageAsciiConverter: Adjust settings (debounced 150ms)
    ImageAsciiConverter->>Canvas: Draw image at target dimensions
    Canvas->>ImageAsciiConverter: Return pixel data (RGBA)

    Note over ImageAsciiConverter: Optional: Sobel edge detection
    Note over ImageAsciiConverter: Apply brightness & contrast
    Note over ImageAsciiConverter: Convert RGB → weighted grayscale
    Note over ImageAsciiConverter: Map brightness → character index
    Note over ImageAsciiConverter: Generate plain text + colored HTML

    ImageAsciiConverter->>Preview: Render ASCII (auto-fit font size)
    ImageAsciiConverter->>ImageAsciiConverter: Save settings to localStorage

    User->>ShareCodec: Click Share button
    ShareCodec->>ShareCodec: Encode image + settings into #s= URL fragment
    ShareCodec-->>User: Copy self-contained share URL to clipboard

    Note over User: Recipient opens share URL
    User->>ShareCodec: Browser loads page with #s= fragment
    ShareCodec->>ShareCodec: Decode #s= → image + settings
    ShareCodec-->>Preview: Regenerate ASCII art client-side (no network)
```

## Component Descriptions

### ImageAsciiConverter Class (`src/script.js`)
- **Purpose**: Core application logic — image processing, ASCII conversion, UI setup, event handling, export functionality
- **Key responsibilities**: File upload handling, Canvas-based pixel extraction, Sobel edge detection, brightness/contrast adjustment, grayscale luminance calculation, character mapping, color mode rendering (Grayscale/ANSI/RGB/Full RGB), auto-fit font sizing, settings persistence via localStorage, share/copy/export operations
- **Pattern**: Single class with state management, debounced conversion, and DOM-based UI generation

### Share Codec (`src/share-codec.js`)
- **Purpose**: Client-side encode/decode of share payloads into URL fragments (`#s=`)
- **Key responsibilities**: Encode downscaled image + settings into a base64url URL fragment, decode and validate incoming `#s=` fragments, drive view-mode entry when a share link is opened

### Settings Schema (`src/settings-schema.js`)
- **Purpose**: Authoritative settings schema, defaults, and validation/clamping
- **Key responsibilities**: Define all setting keys with types and bounds, clamp/validate values from localStorage or share payloads, used by both main converter and share codec

### Main Entry (`index.html`)
- **Purpose**: HTML shell with critical inline CSS for loading state, loads `script.js` as ES module
- **Key responsibilities**: Provides `#app` mount point, shows loading spinner during module load

### Styles (`src/style.css`)
- **Purpose**: Full application layout and component styling
- **Key responsibilities**: Sidebar + main content flexbox layout, dark theme with CSS variables, responsive breakpoints at 900px and 480px, custom scrollbar and range input styling

## Key Architectural Decisions

### 1. Client-Side Image Processing
I chose to implement all image processing entirely in the browser using the HTML5 Canvas API.
- **Privacy**: User images never leave their device
- **Performance**: No network latency for conversions; results appear instantly
- **Cost**: No server infrastructure for the core conversion
- **Simplicity**: The conversion logic is self-contained in a single class

### 2. Client-Side URL Sharing
Sharing is entirely client-side via URL fragment encoding (`#s=`). The downscaled image and settings are encoded into a self-contained URL; opening the link regenerates the ASCII art without any network request. This removes server costs, eliminates share expiry, and works offline.

### 3. Class-Based State Management
I encapsulated all application state in the `ImageAsciiConverter` class with localStorage persistence. This avoids framework dependencies while keeping state organized and recoverable across sessions.

### 4. No Framework Dependency
I deliberately avoided React, Vue, or other frameworks because:
- The application has a single view with manageable complexity
- The final JavaScript bundle stays extremely lightweight
- Anyone can read and modify the code without framework knowledge

### 5. Debounced Real-Time Updates
I implemented a 150ms debounce on all setting changes to balance responsiveness with performance. This prevents excessive re-renders during rapid slider movements while keeping the feel interactive.

### 6. Dual Color Output Pipeline
The converter generates both plain text and colored HTML in a single pass. This enables:
- Grayscale mode using `textContent` (fast, no DOM overhead)
- Color modes using `innerHTML` with per-character `<span>` elements
- Export functions can choose the appropriate format without re-conversion

### 7. Auto-Fit Font Sizing
Rather than requiring users to manually set font sizes, the "Fit to Container" mode calculates the optimal font size based on the viewport dimensions and ASCII grid size. This ensures the output always fills the available space.

## Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| `index.html` | Entry point, critical CSS, loading state |
| `src/script.js` | ImageAsciiConverter class — all conversion and UI logic |
| `src/share-codec.js` | URL share payload codec (encode/decode `#s=` fragment) |
| `src/settings-schema.js` | Settings schema, defaults, clamp/validate |
| `src/style.css` | Layout, theming, responsive design |
| `vite.config.js` | Build configuration, asset handling |
| `vercel.json` | Deployment settings, CSP/security headers |

## Limitations

- **Large images**: Very high-resolution source images may cause brief processing delays during initial load
- **Color mode performance**: RGB/Full RGB modes generate a `<span>` per character, which can be slow at high resolutions
- **Share URL length**: The encoder caps the `#s=` fragment at ~2 MB so it remains pasteable in browser address bars and most chat apps. Very high-resolution shares that would exceed the cap fail with a toast prompting the user to lower the resolution slider before retrying
- **PNG export size**: Browser canvases have a per-dimension maximum (~32000 px). At very high grid resolutions combined with large fonts, the PNG export refuses upfront with a toast that names the two settings the user can lower (resolution / font size) instead of failing silently
- **No animation**: GIF files extract a single frame only
- **Mobile typing**: Custom character input can be awkward on mobile keyboards
