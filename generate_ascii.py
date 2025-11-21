#!/usr/bin/env python3
"""
Script to convert an image to ASCII art.
Usage: python generate_ascii.py <image_path> [--width WIDTH] [--height HEIGHT]
"""

import sys
from PIL import Image
import argparse
from io import BytesIO

def image_to_ascii(image_input, width=50, height=30, chars="@%#*+=-:. "):
    """
    Convert an image to ASCII art.
    
    Args:
        image_input: Path to the image file, PIL Image object, or file-like object
        width: Width of ASCII output in characters
        height: Height of ASCII output in characters
        chars: Characters to use for different brightness levels (dark to light)
    
    Returns:
        List of strings, each representing a line of ASCII art
    """
    try:
        # Open image if it's a path or file-like object
        if isinstance(image_input, str):
            img = Image.open(image_input)
        elif isinstance(image_input, Image.Image):
            img = image_input
        else:
            # Assume it's a file-like object
            img = Image.open(image_input)
        
        # Convert to grayscale and resize
        img = img.convert('L')  # Convert to grayscale
        img = img.resize((width, height), Image.Resampling.LANCZOS)
        
        # Convert to ASCII
        pixels = img.getdata()
        ascii_lines = []
        
        for i in range(height):
            line = ""
            for j in range(width):
                pixel_value = pixels[i * width + j]
                # Map pixel value (0-255) to character index
                char_index = int((pixel_value / 255) * (len(chars) - 1))
                line += chars[char_index]
            ascii_lines.append(line)
        
        return ascii_lines
    
    except Exception as e:
        raise ValueError(f"Error processing image: {e}")

def format_for_svg(ascii_lines, x=15, y_start=30, line_height=20):
    """
    Format ASCII art lines as SVG tspan elements.
    
    Args:
        ascii_lines: List of ASCII art lines
        x: X position for all lines
        y_start: Starting Y position
        line_height: Height between lines
    
    Returns:
        String containing formatted SVG tspan elements
    """
    svg_lines = []
    for i, line in enumerate(ascii_lines):
        y = y_start + (i * line_height)
        # Escape special characters for XML/SVG
        escaped_line = line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        svg_lines.append(f'<tspan x="{x}" y="{y}">{escaped_line}</tspan>')
    
    return '\n'.join(svg_lines)

def main():
    parser = argparse.ArgumentParser(description='Convert image to ASCII art')
    parser.add_argument('image_path', help='Path to the image file')
    parser.add_argument('--width', type=int, default=50, help='Width in characters (default: 50)')
    parser.add_argument('--height', type=int, default=30, help='Height in characters (default: 30)')
    parser.add_argument('--chars', default='@%#*+=-:. ', help='Characters for brightness levels (default: "@%#*+=-:. ")')
    parser.add_argument('--format', choices=['text', 'svg'], default='text', help='Output format')
    parser.add_argument('--x', type=int, default=15, help='X position for SVG (default: 15)')
    parser.add_argument('--y-start', type=int, default=30, help='Starting Y position for SVG (default: 30)')
    parser.add_argument('--line-height', type=int, default=20, help='Line height for SVG (default: 20)')
    
    args = parser.parse_args()
    
    # Generate ASCII art
    try:
        ascii_lines = image_to_ascii(args.image_path, args.width, args.height, args.chars)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    
    if args.format == 'svg':
        # Output as SVG tspan elements
        svg_output = format_for_svg(ascii_lines, args.x, args.y_start, args.line_height)
        print(svg_output)
    else:
        # Output as plain text
        for line in ascii_lines:
            print(line)

if __name__ == '__main__':
    main()

