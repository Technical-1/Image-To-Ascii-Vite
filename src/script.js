// Import CSS
import './style.css';

// Global variables
let currentImage = null;
let currentImageDataUrl = null;
let currentAscii = '';
let debounceTimer = null;

// Character set presets
const charSets = {
    standard: '@%#*+=-:. ',
    extended: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
    simple: ' .:-=+*#%@',
    blocks: '█▓▒░ ',
    detailed: ' .\'`^\\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$'
};

// DOM elements
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const asciiPreview = document.getElementById('asciiPreview');
const widthSlider = document.getElementById('widthSlider');
const heightSlider = document.getElementById('heightSlider');
const widthInput = document.getElementById('widthInput');
const heightInput = document.getElementById('heightInput');
const charCheckboxes = document.querySelectorAll('.char-checkbox');
const customCharsInput = document.getElementById('customChars');
const copyButton = document.getElementById('copyButton');
const downloadButton = document.getElementById('downloadButton');

// Event listeners
imageInput.addEventListener('change', handleImageUpload);

// Sync sliders and text inputs
widthSlider.addEventListener('input', () => {
    widthInput.value = widthSlider.value;
    debounceConvert();
});

heightSlider.addEventListener('input', () => {
    heightInput.value = heightSlider.value;
    debounceConvert();
});

widthInput.addEventListener('input', () => {
    let value = parseInt(widthInput.value) || 10;
    value = Math.max(10, Math.min(200, value));
    widthInput.value = value;
    widthSlider.value = value;
    debounceConvert();
});

heightInput.addEventListener('input', () => {
    let value = parseInt(heightInput.value) || 10;
    value = Math.max(10, Math.min(200, value));
    heightInput.value = value;
    heightSlider.value = value;
    debounceConvert();
});

charCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', debounceConvert);
});
customCharsInput.addEventListener('input', debounceConvert);
copyButton.addEventListener('click', copyAscii);
downloadButton.addEventListener('click', downloadAscii);

// Functions
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file');
        return;
    }

    currentImage = file;

    // Show image preview
    const reader = new FileReader();
    reader.onload = function(e) {
        currentImageDataUrl = e.target.result;
        imagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
        imagePreview.style.display = 'block';
        // Convert to ASCII
        convertToAscii();
    };
    reader.readAsDataURL(file);
}

function getSelectedChars() {
    // Check if custom characters are provided
    const customChars = customCharsInput.value.trim();
    if (customChars) {
        return customChars;
    }

    // Get selected checkboxes
    const selected = Array.from(charCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    if (selected.length === 0) {
        // Default to standard if nothing selected
        return '@%#*+=-:. ';
    }

    // Combine selected character sets
    return selected.join('');
}

function debounceConvert() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(convertToAscii, 300);
}

/**
 * Convert image to ASCII art using Canvas API
 * @param {string} imageDataUrl - Data URL of the image
 * @param {number} width - Width in characters
 * @param {number} height - Height in characters
 * @param {string} chars - Character set for brightness levels
 * @returns {Promise<string[]>} Promise resolving to array of ASCII lines
 */
function imageToAscii(imageDataUrl, width, height, chars) {
    return new Promise((resolve, reject) => {
        try {
            const img = new Image();
            img.onload = function() {
                // Create canvas for processing
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Set canvas size to target dimensions
                canvas.width = width;
                canvas.height = height;
                
                // Draw image to canvas (this automatically resizes)
                ctx.drawImage(img, 0, 0, width, height);
                
                // Get image data
                const imageData = ctx.getImageData(0, 0, width, height);
                const pixels = imageData.data;
                
                // Convert to ASCII
                const asciiLines = [];
                
                for (let i = 0; i < height; i++) {
                    let line = '';
                    for (let j = 0; j < width; j++) {
                        // Get pixel index (RGBA format)
                        const pixelIndex = (i * width + j) * 4;
                        const r = pixels[pixelIndex];
                        const g = pixels[pixelIndex + 1];
                        const b = pixels[pixelIndex + 2];
                        
                        // Convert RGB to grayscale using luminance formula
                        const grayscale = 0.299 * r + 0.587 * g + 0.114 * b;
                        
                        // Map grayscale value (0-255) to character index
                        const charIndex = Math.floor((grayscale / 255) * (chars.length - 1));
                        line += chars[charIndex];
                    }
                    asciiLines.push(line);
                }
                
                resolve(asciiLines);
            };
            
            img.onerror = function() {
                reject(new Error('Failed to load image'));
            };
            
            img.src = imageDataUrl;
        } catch (error) {
            reject(error);
        }
    });
}

function convertToAscii() {
    if (!currentImage || !currentImageDataUrl) {
        asciiPreview.innerHTML = '<p class="placeholder">Upload an image to see the ASCII art preview</p>';
        copyButton.disabled = true;
        downloadButton.disabled = true;
        return;
    }

    // Show loading state
    asciiPreview.innerHTML = '<p class="placeholder">Converting...</p>';
    copyButton.disabled = true;
    downloadButton.disabled = true;

    // Get parameters
    const width = parseInt(widthInput.value) || parseInt(widthSlider.value);
    const height = parseInt(heightInput.value) || parseInt(heightSlider.value);
    const chars = getSelectedChars();

    // Perform client-side conversion
    imageToAscii(currentImageDataUrl, width, height, chars)
        .then(asciiLines => {
            const asciiText = asciiLines.join('\n');
            currentAscii = asciiText;
            asciiPreview.textContent = asciiText;
            copyButton.disabled = false;
            downloadButton.disabled = false;
        })
        .catch(error => {
            console.error('Error:', error);
            asciiPreview.innerHTML = `<p class="placeholder" style="color: #ff4444;">Error converting image: ${error.message}</p>`;
        });
}

function copyAscii() {
    if (!currentAscii) return;

    navigator.clipboard.writeText(currentAscii).then(() => {
        // Visual feedback
        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        copyButton.style.background = '#28a745';
        setTimeout(() => {
            copyButton.textContent = originalText;
            copyButton.style.background = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    });
}

function downloadAscii() {
    if (!currentAscii) return;

    const blob = new Blob([currentAscii], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ascii_art.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

