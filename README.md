# Image to ASCII Converter

A web-based tool for converting images to ASCII art with a beautiful, interactive UI. Upload any image and customize the output with real-time preview.

🌐 **Live Demo**: [https://image-to-ascii-erfs.onrender.com](https://image-to-ascii-erfs.onrender.com)

## Features

- 🖼️ **Universal Image Support**: Works with PNG, JPG, JPEG, GIF, BMP, WEBP, and SVG files
- 🎨 **Real-time Preview**: See your ASCII art update instantly as you adjust settings
- 🎚️ **Customizable Dimensions**: Adjust width and height with sliders (10-200 characters)
- ✏️ **Multiple Character Sets**: Choose from preset character sets or create your own
- 📋 **Copy & Download**: Easily copy to clipboard or download as a text file
- 🎯 **Modern UI**: Beautiful, responsive interface that works on desktop and mobile

## Installation

1. Install the required dependencies:
```bash
pip install -r requirements.txt
```

## Usage

### Web Interface

**Try it online**: [https://image-to-ascii-erfs.onrender.com](https://image-to-ascii-erfs.onrender.com)

Or run locally:

1. Start the Flask server:
```bash
python app.py
```

2. Open your browser and navigate to:
```
http://localhost:5001
```

   (Note: Port 5001 is used by default since port 5000 is often occupied by AirPlay on macOS. You can specify a different port by running `python app.py <port_number>`)

3. Upload an image, adjust the settings, and preview your ASCII art!

### Command Line Interface

You can also use the script directly from the command line:

```bash
python generate_ascii.py <image_path> [options]
```

Options:
- `--width WIDTH`: Width in characters (default: 50)
- `--height HEIGHT`: Height in characters (default: 30)
- `--chars CHARS`: Character set for brightness levels (default: "@%#*+=-:. ")
- `--format FORMAT`: Output format - 'text' or 'svg' (default: 'text')

Example:
```bash
python generate_ascii.py my_image.png --width 80 --height 40
```

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
Image-To-Ascii/
├── app.py                 # Flask web application
├── generate_ascii.py      # Core ASCII conversion logic
├── requirements.txt       # Python dependencies
├── templates/
│   └── index.html        # Web UI template
├── static/
│   ├── style.css        # Stylesheet
│   └── script.js        # Frontend JavaScript
└── uploads/             # Temporary upload directory (created automatically)
```

## License

MIT License - feel free to use and modify as needed!

