// Global variables
let currentImage = null;
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
        imagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
        imagePreview.style.display = 'block';
    };
    reader.readAsDataURL(file);

    // Convert to ASCII
    convertToAscii();
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

function convertToAscii() {
    if (!currentImage) {
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

    // Create form data
    const formData = new FormData();
    formData.append('image', currentImage);
    formData.append('width', width);
    formData.append('height', height);
    formData.append('chars', chars);

    // Send request
    fetch('/convert', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            asciiPreview.innerHTML = `<p class="placeholder" style="color: #ff4444;">Error: ${data.error}</p>`;
            return;
        }

        currentAscii = data.ascii;
        asciiPreview.textContent = data.ascii;
        copyButton.disabled = false;
        downloadButton.disabled = false;
    })
    .catch(error => {
        console.error('Error:', error);
        asciiPreview.innerHTML = `<p class="placeholder" style="color: #ff4444;">Error converting image. Please try again.</p>`;
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

