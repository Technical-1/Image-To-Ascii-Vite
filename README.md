# Image to ASCII Converter

A web-based tool for converting images to ASCII art with an interactive UI. Upload any image and customize the output with real-time preview. Built with Vite and pure JavaScript - no backend required!

🌐 **Live Demo**: [https://your-app-name.vercel.app](https://your-app-name.vercel.app)

## Features

- 🖼️ **Universal Image Support**: Works with PNG, JPG, JPEG, GIF, BMP, WEBP, and SVG files
- 🎨 **Real-time Preview**: See your ASCII art update instantly as you adjust settings
- 🎚️ **Customizable Dimensions**: Adjust width and height with sliders (10-200 characters)
- ✏️ **Multiple Character Sets**: Choose from preset character sets or create your own
- 📋 **Copy & Download**: Easily copy to clipboard or download as a text file
- 🎯 **Modern UI**: Beautiful, responsive interface that works on desktop and mobile
- ⚡ **100% Client-Side**: All processing happens in the browser - no server needed!

## Installation

1. Install dependencies:
```bash
npm install
```

## Development

Run the development server:

```bash
npm run dev
```

Then open your browser to the URL shown (typically `http://localhost:5173`).

## Building for Production

Build the project:

```bash
npm run build
```

The built files will be in the `dist/` directory.

Preview the production build:

```bash
npm run preview
```

## How It Works

The application uses the HTML5 Canvas API to:
1. Load the uploaded image
2. Draw it to a canvas at the target dimensions
3. Extract pixel data and convert to grayscale
4. Map brightness values to ASCII characters
5. Display the result in real-time

All processing happens entirely in the browser - no server-side code required!

## Character Sets

The web interface includes several preset character sets:

- **Standard**: `@%#*+=-:. ` - Good balance of detail
- **Extended**: Full ASCII character set - Maximum detail
- **Simple**: ` .:-=+*#%@` - Minimal characters
- **Blocks**: `█▓▒░ ` - Block characters for bold look
- **Detailed**: Long character set - Fine-grained detail

You can also enter custom character sets in the "Custom Characters" field.

## Project Structure

```
Image-To-Ascii-Flash/
├── index.html          # Main HTML file
├── package.json        # Node.js dependencies
├── vite.config.js      # Vite configuration
├── vercel.json         # Vercel deployment configuration
├── public/
│   ├── favicon.png    # Favicon
│   └── logo.png       # Logo image
└── src/
    ├── script.js      # Main JavaScript (client-side conversion)
    └── style.css     # Stylesheet
```
