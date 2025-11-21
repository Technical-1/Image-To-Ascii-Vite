#!/usr/bin/env python3
"""
Flask web application for converting images to ASCII art.
"""

from flask import Flask, render_template, request, jsonify, send_from_directory, make_response
import os
from generate_ascii import image_to_ascii

app = Flask(__name__, static_folder='static', static_url_path='/static')
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['ALLOWED_EXTENSIONS'] = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'}

# Create uploads directory if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/favicon.png')
def favicon_png():
    response = make_response(send_from_directory(app.static_folder, 'favicon.png', mimetype='image/png'))
    response.headers['Cache-Control'] = 'public, max-age=31536000'
    return response

@app.route('/favicon.ico')
def favicon_ico():
    response = make_response(send_from_directory(app.static_folder, 'favicon.png', mimetype='image/png'))
    response.headers['Cache-Control'] = 'public, max-age=31536000'
    return response

@app.route('/logo.png')
def logo():
    return send_from_directory(app.static_folder, 'logo.png', mimetype='image/png')

@app.route('/convert', methods=['POST'])
def convert():
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type'}), 400
        
        # Get parameters
        width = int(request.form.get('width', 50))
        height = int(request.form.get('height', 30))
        chars = request.form.get('chars', '@%#*+=-:. ')
        
        # Convert image to ASCII
        ascii_lines = image_to_ascii(file, width, height, chars)
        
        # Join lines with newlines
        ascii_text = '\n'.join(ascii_lines)
        
        return jsonify({
            'success': True,
            'ascii': ascii_text,
            'lines': ascii_lines
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    import sys
    # Use port from environment variable (for Render) or default to 5001
    port = int(os.environ.get('PORT', 5001))
    # Use port from command line if provided (for local development)
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    # Disable debug mode in production
    debug = os.environ.get('FLASK_ENV') == 'development'
    app.run(debug=debug, host='0.0.0.0', port=port)

