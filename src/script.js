// Import CSS
import './style.css';

// Core conversion algorithms (shared with the test suite).
import {
    adjustBrightnessContrast,
    weightedLuminance,
    charForBrightness,
    ansiColor,
    applyEdgeDetection,
} from './ascii-core.js';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings-schema.js';
import { encodeShare, decodeShare, validateShare } from './share-codec.js';

/**
 * Image to ASCII Converter
 * Matching features with Video ASCII Converter
 */

// Export buttons present in read-only view mode (no share-btn there).
const VIEW_EXPORT_BUTTON_IDS = ['copy-btn', 'export-txt-btn', 'export-png-btn', 'export-html-btn'];

// Fallback charset when a "custom" charset is empty — MUST be identical in
// create mode and view mode so a shared link reproduces byte-identically.
const EMPTY_CUSTOM_CHARSET_FALLBACK = ' .:-=+*#%@';

// Character set presets (matching video project)
const charsets = {
    standard: ' .:-=+*#%@',
    detailed: ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
    blocks: ' ░▒▓█',
    binary: ' █',
    dots: ' .·:•',
    custom: ' .:-=+*#%@'
};

// Style presets (matching video project)
const presets = {
    classic: {
        charsetType: 'standard',
        colorMode: 'grayscale',
        inverted: false,
        brightness: 1.0,
        contrast: 1.0
    },
    colored: {
        charsetType: 'standard',
        colorMode: 'rgb',
        inverted: false,
        brightness: 1.0,
        contrast: 1.0
    },
    blocks: {
        charsetType: 'blocks',
        colorMode: 'grayscale',
        inverted: false,
        brightness: 1.0,
        contrast: 1.0
    },
    matrix: {
        charsetType: 'standard',
        colorMode: 'grayscale',
        inverted: false,
        brightness: 1.0,
        contrast: 1.0
    },
    highContrast: {
        charsetType: 'detailed',
        colorMode: 'grayscale',
        inverted: false,
        brightness: 1.2,
        contrast: 1.5
    },
    inverted: {
        charsetType: 'standard',
        colorMode: 'grayscale',
        inverted: true,
        brightness: 1.0,
        contrast: 1.0
    }
};

// Application State
class ImageAsciiConverter {
    constructor() {
        this.currentImage = null;
        this.currentImageDataUrl = null;
        this.currentAscii = null;
        this.currentShareImage = null;
        this.debounceTimer = null;
        
        // Settings (with localStorage persistence)
        this.settings = this.loadSettings();
        
        // Canvas for processing
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', {
            willReadFrequently: true,
            alpha: false
        });
        
        this.init();
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem('imageAsciiSettings');
            if (saved) {
                return sanitizeSettings(JSON.parse(saved), DEFAULT_SETTINGS);
            }
            return { ...DEFAULT_SETTINGS };
        } catch (e) {
            return { ...DEFAULT_SETTINGS };
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('imageAsciiSettings', JSON.stringify(this.settings));
        } catch (e) {
            console.warn('Could not save settings:', e);
        }
    }

    init() {
        const shareValue = new URLSearchParams(location.hash.slice(1)).get('s');
        if (shareValue) {
            this.enterViewMode(shareValue);
            return;
        }

        this.setupUI();
        this.attachEventListeners();
        this.applySettings();

        window.addEventListener('resize', () => {
            if (this.settings.fitToContainer && this.currentAscii) {
                this.fitOutputToContainer();
            }
        });
    }

    enterViewMode(shareValue) {
        this.setupViewUI();

        let validated;
        try {
            const decoded = decodeShare(shareValue);
            validated = validateShare(decoded, (raw) => sanitizeSettings(raw, DEFAULT_SETTINGS));
        } catch (error) {
            console.error('Share decode error:', error);
            this.showShareError(error.message);
            return;
        }

        // View mode intentionally never calls saveSettings() — a shared link must
        // not clobber the visitor's own create-mode localStorage preferences.
        this.settings = validated.settings;
        if (this.settings.charsetType === 'custom') {
            charsets.custom = this.settings.customCharset || EMPTY_CUSTOM_CHARSET_FALLBACK;
        }
        this.currentImageDataUrl = validated.img;

        this.attachViewListeners();
        this.updateOutputStyle();
        // fire-and-forget: image-load / conversion errors are handled inside convertToAscii
        this.convertToAscii();

        window.addEventListener('resize', () => {
            if (this.settings.fitToContainer && this.currentAscii) {
                this.fitOutputToContainer();
            }
        });
    }

    setupUI() {
        const app = document.querySelector('#app') || document.body;
        
        app.innerHTML = `
            <div class="app-layout">
                <!-- Left Sidebar - Controls -->
                <aside class="sidebar">
                    <div class="sidebar-header">
                        <h1 class="logo">🖼️ Image to ASCII</h1>
                    </div>
                    
                    <div class="sidebar-content">
                        <!-- Upload -->
                        <div class="panel">
                            <div class="upload-area" id="upload-area">
                                <span class="upload-icon">📁</span>
                                <span>Drop image or click</span>
                                <input type="file" id="image-input" accept="image/*" hidden>
                            </div>
                            <div class="image-preview hidden" id="image-preview">
                                <img id="preview-img" alt="Preview">
                                <div class="image-info" id="image-info"></div>
                            </div>
                        </div>

                        <!-- Resolution -->
                        <div class="panel">
                            <h4 class="panel-title">Resolution</h4>
                            <select id="resolution-select" class="full-width">
                                <option value="custom">Custom</option>
                                <option value="10">10% Scale</option>
                                <option value="25">25% Scale</option>
                                <option value="50" selected>50% Scale</option>
                                <option value="75">75% Scale</option>
                                <option value="100">100% (Full)</option>
                            </select>
                            
                            <div class="custom-resolution hidden" id="custom-resolution">
                                <div class="slider-row">
                                    <label>W: <span id="width-value">${this.settings.width}</span></label>
                                    <input type="range" id="width-slider" min="10" max="1000" value="${this.settings.width}" step="1">
                                </div>
                                <div class="slider-row">
                                    <label>H: <span id="height-value">${this.settings.height}</span></label>
                                    <input type="range" id="height-slider" min="10" max="1000" value="${this.settings.height}" step="1">
                                </div>
                                <label class="checkbox-inline">
                                    <input type="checkbox" id="aspect-ratio-checkbox" checked>
                                    <span>Lock Aspect Ratio</span>
                                </label>
                            </div>
                            
                            <label class="checkbox-inline">
                                <input type="checkbox" id="fit-container-checkbox" ${this.settings.fitToContainer ? 'checked' : ''}>
                                <span>Fit to Container</span>
                            </label>
                            <div class="manual-font-controls" id="manual-font-controls" ${this.settings.fitToContainer ? 'style="display:none"' : ''}>
                                <div class="slider-row">
                                    <label>Font: <span id="font-size-value">${this.settings.fontSize}</span>px</label>
                                    <input type="range" id="font-size-slider" min="4" max="20" value="${this.settings.fontSize}" step="1">
                                </div>
                                <div class="slider-row">
                                    <label>Line H: <span id="line-height-value">${this.settings.lineHeight.toFixed(2)}</span></label>
                                    <input type="range" id="line-height-slider" min="0.5" max="1.5" value="${this.settings.lineHeight}" step="0.05">
                                </div>
                            </div>
                        </div>

                        <!-- Presets -->
                        <div class="panel">
                            <h4 class="panel-title">Quick Presets</h4>
                            <div class="preset-grid">
                                <button class="preset-btn" data-preset="classic">🟢 Classic</button>
                                <button class="preset-btn" data-preset="colored">🌈 Colored</button>
                                <button class="preset-btn" data-preset="blocks">▓ Blocks</button>
                                <button class="preset-btn" data-preset="matrix">💚 Matrix</button>
                                <button class="preset-btn" data-preset="highContrast">⚡ Hi-Con</button>
                                <button class="preset-btn" data-preset="inverted">🔄 Invert</button>
                            </div>
                        </div>

                        <!-- Style -->
                        <div class="panel">
                            <h4 class="panel-title">Style</h4>
                            <div class="control-row">
                                <label>Characters</label>
                                <select id="charset-select">
                                    <option value="standard">Standard: .:-=+*#%@</option>
                                    <option value="detailed">Detailed: .'^:;!i&gt;&lt;~+?</option>
                                    <option value="blocks">Blocks: ░▒▓█</option>
                                    <option value="binary">Binary: █</option>
                                    <option value="dots">Dots: .·:•</option>
                                    <option value="custom">Custom...</option>
                                </select>
                            </div>
                            <div class="control-row hidden" id="custom-charset-group">
                                <input type="text" id="custom-charset" placeholder="Custom chars..." value="${this.settings.customCharset}">
                            </div>
                            <div class="control-row">
                                <label>Color Mode</label>
                                <select id="color-mode-select">
                                    <option value="grayscale">Grayscale</option>
                                    <option value="ansi">ANSI</option>
                                    <option value="rgb">RGB</option>
                                    <option value="full-rgb">Full RGB</option>
                                </select>
                            </div>
                        </div>

                        <!-- Adjustments -->
                        <div class="panel">
                            <h4 class="panel-title">Adjustments</h4>
                            <div class="slider-row">
                                <label>Brightness: <span id="brightness-value">${this.settings.brightness.toFixed(1)}</span></label>
                                <input type="range" id="brightness-slider" min="0.5" max="2" value="${this.settings.brightness}" step="0.1">
                            </div>
                            <div class="slider-row">
                                <label>Contrast: <span id="contrast-value">${this.settings.contrast.toFixed(1)}</span></label>
                                <input type="range" id="contrast-slider" min="0.5" max="2" value="${this.settings.contrast}" step="0.1">
                            </div>
                            <div class="checkbox-row">
                                <label class="checkbox-inline">
                                    <input type="checkbox" id="invert-checkbox">
                                    <span>Invert</span>
                                </label>
                                <label class="checkbox-inline">
                                    <input type="checkbox" id="edge-detection-checkbox">
                                    <span>Edges</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </aside>

                <!-- Main Content - Output -->
                <main class="main-content">
                    <div class="output-toolbar">
                        <div class="toolbar-left">
                            <span class="output-title">ASCII Output</span>
                        </div>
                        <div class="toolbar-right">
                            <button class="tool-btn share-btn" id="share-btn" disabled aria-label="Share ASCII art">🔗 Share</button>
                            <button class="tool-btn" id="copy-btn" disabled aria-label="Copy to clipboard">📋 Copy</button>
                            <button class="tool-btn" id="export-txt-btn" disabled aria-label="Export as text file">📄 TXT</button>
                            <button class="tool-btn" id="export-png-btn" disabled aria-label="Export as PNG image">🖼️ PNG</button>
                            <button class="tool-btn" id="export-html-btn" disabled aria-label="Export as HTML file">🌐 HTML</button>
                        </div>
                    </div>
                    <div class="ascii-container" id="ascii-output" role="img" aria-label="ASCII art output">
                        <p class="placeholder">Upload an image to see the ASCII art preview</p>
                    </div>
                </main>

                <!-- Toast -->
                <div class="toast hidden" id="toast"></div>
            </div>
        `;
    }

    setupViewUI() {
        const app = document.querySelector('#app') || document.body;
        app.replaceChildren();

        const mkBtn = (id, label, aria) => {
            const b = document.createElement('button');
            b.className = 'tool-btn';
            b.id = id;
            b.textContent = label;
            b.setAttribute('aria-label', aria);
            return b;
        };

        const layout = document.createElement('div');
        layout.className = 'app-layout';

        const main = document.createElement('main');
        main.className = 'main-content';

        const toolbar = document.createElement('div');
        toolbar.className = 'output-toolbar';

        const left = document.createElement('div');
        left.className = 'toolbar-left';
        const title = document.createElement('span');
        title.className = 'output-title';
        title.textContent = '🖼️ Shared ASCII Art';
        left.appendChild(title);

        const right = document.createElement('div');
        right.className = 'toolbar-right';
        right.appendChild(mkBtn('copy-btn', '📋 Copy', 'Copy to clipboard'));
        right.appendChild(mkBtn('export-txt-btn', '📄 TXT', 'Export as text file'));
        right.appendChild(mkBtn('export-png-btn', '🖼️ PNG', 'Export as PNG image'));
        right.appendChild(mkBtn('export-html-btn', '🌐 HTML', 'Export as HTML file'));
        const create = document.createElement('a');
        create.className = 'tool-btn';
        create.id = 'create-link';
        create.href = location.pathname;
        create.textContent = '✨ Create Your Own';
        right.appendChild(create);

        toolbar.appendChild(left);
        toolbar.appendChild(right);

        const output = document.createElement('div');
        output.className = 'ascii-container';
        output.id = 'ascii-output';
        output.setAttribute('role', 'img');
        output.setAttribute('aria-label', 'Shared ASCII art');
        const ph = document.createElement('p');
        ph.className = 'placeholder';
        ph.textContent = 'Loading shared art…';
        output.appendChild(ph);

        main.appendChild(toolbar);
        main.appendChild(output);

        const toast = document.createElement('div');
        toast.className = 'toast hidden';
        toast.id = 'toast';

        layout.appendChild(main);
        layout.appendChild(toast);
        app.appendChild(layout);
    }

    attachViewListeners() {
        const handlers = {
            'copy-btn': () => this.copyAscii(),
            'export-txt-btn': () => this.exportAsTxt(),
            'export-png-btn': () => this.exportAsPng(),
            'export-html-btn': () => this.exportAsHtml(),
        };
        VIEW_EXPORT_BUTTON_IDS.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', handlers[id]);
        });
    }

    showShareError(message) {
        const output = document.getElementById('ascii-output');
        if (!output) return;
        output.replaceChildren();
        const h = document.createElement('p');
        h.className = 'placeholder error';
        h.textContent = 'This share link is invalid or corrupted.';
        const detail = document.createElement('p');
        detail.className = 'placeholder';
        detail.textContent = String(message);
        const a = document.createElement('a');
        a.href = location.pathname;
        a.className = 'tool-btn';
        a.textContent = '✨ Create Your Own';
        output.append(h, detail, a);
        VIEW_EXPORT_BUTTON_IDS.forEach((id) => { const el = document.getElementById(id); if (el) el.disabled = true; });
    }

    attachEventListeners() {
        // File upload
        const uploadArea = document.getElementById('upload-area');
        const imageInput = document.getElementById('image-input');

        uploadArea.addEventListener('click', () => imageInput.click());
        imageInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                this.handleFileSelect({ target: { files: e.dataTransfer.files } });
            }
        });

        // Settings controls
        this.attachSettingsListeners();

        // Export buttons
        document.getElementById('share-btn').addEventListener('click', () => this.shareAscii());
        document.getElementById('copy-btn').addEventListener('click', () => this.copyAscii());
        document.getElementById('export-txt-btn').addEventListener('click', () => this.exportAsTxt());
        document.getElementById('export-png-btn').addEventListener('click', () => this.exportAsPng());
        document.getElementById('export-html-btn').addEventListener('click', () => this.exportAsHtml());

        // Preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.applyPreset(e.target.dataset.preset));
        });
    }

    attachSettingsListeners() {
        // Resolution presets (percentage-based)
        const resolutionSelect = document.getElementById('resolution-select');
        resolutionSelect.addEventListener('change', (e) => {
            const customRes = document.getElementById('custom-resolution');
            if (e.target.value === 'custom') {
                customRes.classList.remove('hidden');
            } else {
                customRes.classList.add('hidden');
                // Calculate dimensions based on percentage of actual image
                if (this.currentImage) {
                    const percent = parseInt(e.target.value) / 100;
                    const width = Math.max(10, Math.round(this.currentImage.width * percent));
                    // Divide height by 2 because ASCII chars are taller than wide
                    const height = Math.max(10, Math.round((this.currentImage.height * percent) / 2));
                    this.settings.width = width;
                    this.settings.height = height;
                    this.updateSliderMax();
                    document.getElementById('width-slider').value = width;
                    document.getElementById('height-slider').value = height;
                    document.getElementById('width-value').textContent = width;
                    document.getElementById('height-value').textContent = height;
                    this.saveSettings();
                    this.debounceConvert();
                }
            }
        });

        // Width slider
        const widthSlider = document.getElementById('width-slider');
        widthSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('width-value').textContent = value;
            document.getElementById('resolution-select').value = 'custom';
            document.getElementById('custom-resolution').classList.remove('hidden');
            this.settings.width = value;
            this.saveSettings();
            this.debounceConvert();
        });

        // Height slider
        const heightSlider = document.getElementById('height-slider');
        heightSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('height-value').textContent = value;
            document.getElementById('resolution-select').value = 'custom';
            document.getElementById('custom-resolution').classList.remove('hidden');
            this.settings.height = value;
            this.saveSettings();
            this.debounceConvert();
        });

        // Charset select
        const charsetSelect = document.getElementById('charset-select');
        charsetSelect.addEventListener('change', (e) => {
            const customGroup = document.getElementById('custom-charset-group');
            if (e.target.value === 'custom') {
                customGroup.classList.remove('hidden');
            } else {
                customGroup.classList.add('hidden');
            }
            this.settings.charsetType = e.target.value;
            this.saveSettings();
            this.debounceConvert();
        });

        // Custom charset
        document.getElementById('custom-charset').addEventListener('input', (e) => {
            // Cap to 200 to match sanitizeSettings, so a shared link reproduces
            // bit-identically (the viewer always sees the sanitized <=200 value).
            const value = e.target.value.slice(0, 200);
            this.settings.customCharset = value;
            charsets.custom = value || EMPTY_CUSTOM_CHARSET_FALLBACK;
            this.saveSettings();
            this.debounceConvert();
        });

        // Color mode
        document.getElementById('color-mode-select').addEventListener('change', (e) => {
            this.settings.colorMode = e.target.value;
            this.saveSettings();
            this.debounceConvert();
        });

        // Fit to container toggle
        document.getElementById('fit-container-checkbox').addEventListener('change', (e) => {
            this.settings.fitToContainer = e.target.checked;
            const manualControls = document.getElementById('manual-font-controls');
            manualControls.style.display = e.target.checked ? 'none' : 'block';
            this.saveSettings();
            this.renderAscii(this.currentAscii);
        });

        // Font size
        document.getElementById('font-size-slider').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            document.getElementById('font-size-value').textContent = value;
            this.settings.fontSize = value;
            this.updateOutputStyle();
            this.saveSettings();
        });

        // Line height
        document.getElementById('line-height-slider').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('line-height-value').textContent = value.toFixed(2);
            this.settings.lineHeight = value;
            this.updateOutputStyle();
            this.saveSettings();
        });

        // Brightness
        document.getElementById('brightness-slider').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('brightness-value').textContent = value.toFixed(1);
            this.settings.brightness = value;
            this.saveSettings();
            this.debounceConvert();
        });

        // Contrast
        document.getElementById('contrast-slider').addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            document.getElementById('contrast-value').textContent = value.toFixed(1);
            this.settings.contrast = value;
            this.saveSettings();
            this.debounceConvert();
        });

        // Invert
        document.getElementById('invert-checkbox').addEventListener('change', (e) => {
            this.settings.inverted = e.target.checked;
            this.saveSettings();
            this.debounceConvert();
        });

        // Edge detection
        document.getElementById('edge-detection-checkbox').addEventListener('change', (e) => {
            this.settings.edgeDetection = e.target.checked;
            this.saveSettings();
            this.debounceConvert();
        });

        // Preserve aspect ratio
        document.getElementById('aspect-ratio-checkbox').addEventListener('change', (e) => {
            this.settings.preserveAspectRatio = e.target.checked;
            this.saveSettings();
            this.debounceConvert();
        });
    }

    applySettings() {
        // Apply saved settings to UI
        document.getElementById('width-slider').value = this.settings.width;
        document.getElementById('width-value').textContent = this.settings.width;

        document.getElementById('height-slider').value = this.settings.height;
        document.getElementById('height-value').textContent = this.settings.height;

        document.getElementById('charset-select').value = this.settings.charsetType;
        if (this.settings.charsetType === 'custom') {
            document.getElementById('custom-charset-group').classList.remove('hidden');
        }
        document.getElementById('custom-charset').value = this.settings.customCharset;

        document.getElementById('color-mode-select').value = this.settings.colorMode;

        document.getElementById('font-size-slider').value = this.settings.fontSize;
        document.getElementById('font-size-value').textContent = this.settings.fontSize;

        document.getElementById('line-height-slider').value = this.settings.lineHeight;
        document.getElementById('line-height-value').textContent = this.settings.lineHeight.toFixed(2);

        document.getElementById('brightness-slider').value = this.settings.brightness;
        document.getElementById('brightness-value').textContent = this.settings.brightness.toFixed(1);

        document.getElementById('contrast-slider').value = this.settings.contrast;
        document.getElementById('contrast-value').textContent = this.settings.contrast.toFixed(1);

        document.getElementById('invert-checkbox').checked = this.settings.inverted;
        document.getElementById('edge-detection-checkbox').checked = this.settings.edgeDetection;
        document.getElementById('aspect-ratio-checkbox').checked = this.settings.preserveAspectRatio;
        document.getElementById('fit-container-checkbox').checked = this.settings.fitToContainer;
        document.getElementById('manual-font-controls').style.display = this.settings.fitToContainer ? 'none' : 'block';

        this.updateOutputStyle();
    }

    updateOutputStyle() {
        const output = document.getElementById('ascii-output');
        output.style.fontSize = `${this.settings.fontSize}px`;
        output.style.lineHeight = this.settings.lineHeight;
    }

    handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
            this.showToast('Please select a valid image file', 'error');
        return;
    }

        const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
        if (file.size > MAX_FILE_SIZE) {
            this.showToast('File too large. Maximum size is 50MB.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.currentImageDataUrl = e.target.result;
            
            // Show preview
            const previewContainer = document.getElementById('image-preview');
            const previewImg = document.getElementById('preview-img');
            const imageInfo = document.getElementById('image-info');
            
            previewImg.onload = () => {
                imageInfo.textContent = '';

                const fileSpan = document.createElement('span');
                const fileLabel = document.createElement('strong');
                fileLabel.textContent = 'File: ';
                fileSpan.appendChild(fileLabel);
                fileSpan.appendChild(document.createTextNode(file.name));
                imageInfo.appendChild(fileSpan);

                const sizeSpan = document.createElement('span');
                const sizeLabel = document.createElement('strong');
                sizeLabel.textContent = 'Size: ';
                sizeSpan.appendChild(sizeLabel);
                sizeSpan.appendChild(document.createTextNode(this.formatFileSize(file.size)));
                imageInfo.appendChild(sizeSpan);

                const dimSpan = document.createElement('span');
                const dimLabel = document.createElement('strong');
                dimLabel.textContent = 'Dimensions: ';
                dimSpan.appendChild(dimLabel);
                dimSpan.appendChild(document.createTextNode(`${previewImg.naturalWidth} × ${previewImg.naturalHeight}`));
                imageInfo.appendChild(dimSpan);
                
                this.currentImage = {
                    width: previewImg.naturalWidth,
                    height: previewImg.naturalHeight,
                    name: file.name
                };
                
                // Update slider max values based on image dimensions
                this.updateSliderMax();
                
                // Apply default 50% resolution for new images
                const resolutionSelect = document.getElementById('resolution-select');
                if (resolutionSelect.value !== 'custom') {
                    const percent = parseInt(resolutionSelect.value) / 100;
                    this.settings.width = Math.max(10, Math.round(this.currentImage.width * percent));
                    this.settings.height = Math.max(10, Math.round((this.currentImage.height * percent) / 2));
                    document.getElementById('width-slider').value = this.settings.width;
                    document.getElementById('height-slider').value = this.settings.height;
                    document.getElementById('width-value').textContent = this.settings.width;
                    document.getElementById('height-value').textContent = this.settings.height;
                    this.saveSettings();
                } else if (this.settings.preserveAspectRatio) {
                    // Auto-adjust height to preserve aspect ratio for custom mode
                    const aspectRatio = previewImg.naturalWidth / previewImg.naturalHeight;
                    const newHeight = Math.round(this.settings.width / aspectRatio / 2);
                    this.settings.height = Math.max(10, newHeight);
                    document.getElementById('height-slider').value = this.settings.height;
                    document.getElementById('height-value').textContent = this.settings.height;
                    this.saveSettings();
                }
                
                this.convertToAscii();
            };
            
            previewImg.src = e.target.result;
            previewContainer.classList.remove('hidden');
            
            this.showToast('Image loaded successfully!', 'success');
        };
        
    reader.readAsDataURL(file);
}

    debounceConvert() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.convertToAscii(), 150);
    }

    async convertToAscii() {
        if (!this.currentImageDataUrl) return;

        try {
            const imageData = await this.processImage();
            // Snapshot the downscaled canvas (raw resized pixels, pre-effects)
            // for backend-free URL sharing.
            this.currentShareImage = this.canvas.toDataURL('image/png');

            const asciiContent = this.pixelsToAscii(imageData);

            this.currentAscii = asciiContent;
            this.renderAscii(asciiContent);

            ['share-btn', 'copy-btn', 'export-txt-btn', 'export-png-btn', 'export-html-btn']
                .forEach((id) => {
                    const el = document.getElementById(id);
                    if (el) el.disabled = false;
                });
        } catch (error) {
            console.error('Conversion error:', error);
            const output = document.getElementById('ascii-output');
            const p = document.createElement('p');
            p.className = 'placeholder error';
            p.textContent = `Error: ${error.message}`;
            if (output) output.replaceChildren(p);
        }
    }

    processImage() {
    return new Promise((resolve, reject) => {
            const img = new Image();
            
            img.onload = () => {
                const { width, height } = this.settings;
                
                this.canvas.width = width;
                this.canvas.height = height;
                
                // Draw scaled image
                this.ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, width, height);
                
                // Get image data
                const imageData = this.ctx.getImageData(0, 0, width, height);
                
                // Apply edge detection if enabled
                if (this.settings.edgeDetection) {
                    this.applyEdgeDetection(imageData);
                }
                
                resolve(imageData);
            };
            
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = this.currentImageDataUrl;
        });
    }

    applyEdgeDetection(imageData) {
        return applyEdgeDetection(imageData);
    }

    adjustBrightnessContrast(r, g, b) {
        return adjustBrightnessContrast(
            r, g, b,
            this.settings.brightness,
            this.settings.contrast,
        );
    }

    pixelsToAscii(imageData) {
        const { width, height, colorMode, inverted, charsetType } = this.settings;
        const pixels = imageData.data;
        
        let chars = charsets[charsetType] || charsets.standard;
        if (inverted) {
            chars = chars.split('').reverse().join('');
        }

        let text = '';
        let html = '';
        const colors = [];

        for (let y = 0; y < height; y++) {
            const rowColors = [];
            for (let x = 0; x < width; x++) {
                const offset = (y * width + x) * 4;
                let r = pixels[offset];
                let g = pixels[offset + 1];
                let b = pixels[offset + 2];

                // Apply brightness and contrast
                [r, g, b] = this.adjustBrightnessContrast(r, g, b);

                // Calculate brightness using weighted formula
                const brightness = weightedLuminance(r, g, b);

                // Map brightness to character
                const char = charForBrightness(brightness, chars);

                text += char;

                // Apply color based on mode
                let colorData = null;

                switch (colorMode) {
                    case 'rgb':
                        const rgb = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
                        html += `<span style="color:${rgb}">${this.escapeHtml(char)}</span>`;
                        colorData = { color: rgb };
                        break;
                    case 'full-rgb':
                        const frgb = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
                        const bgBrightness = brightness * 0.3;
                        const bg = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${bgBrightness/255})`;
                        html += `<span style="color:${frgb};background:${bg}">${this.escapeHtml(char)}</span>`;
                        colorData = { color: frgb, background: bg };
                        break;
                    case 'ansi':
                        const ansiHtml = this.toAnsiColor(r, g, b, char);
                        html += ansiHtml;
                        colorData = { color: `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})` };
                        break;
                    default: // grayscale
                        html += this.escapeHtml(char);
                        colorData = null;
                }

                rowColors.push(colorData);
            }
            text += '\n';
            html += '\n';
            colors.push(rowColors);
        }

        return { text, html, colors };
    }

    toAnsiColor(r, g, b, char) {
        const { r: ansiR, g: ansiG, b: ansiB } = ansiColor(r, g, b);
        return `<span style="color:rgb(${ansiR},${ansiG},${ansiB})">${this.escapeHtml(char)}</span>`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    renderAscii(asciiContent) {
        if (!asciiContent) return;
        
        const output = document.getElementById('ascii-output');
        
        if (this.settings.colorMode !== 'grayscale') {
            // Safe: asciiContent.html is built in pixelsToAscii from numeric
            // pixel values + escapeHtml(char) only — never from link/network strings.
            output.innerHTML = asciiContent.html;
        } else {
            output.textContent = asciiContent.text;
        }
        
        // Auto-calculate font size if fitToContainer is enabled
        if (this.settings.fitToContainer) {
            this.fitOutputToContainer();
        } else {
            this.updateOutputStyle();
        }
    }
    
    fitOutputToContainer() {
        const output = document.getElementById('ascii-output');
        const container = document.querySelector('.main-content');
        
        if (!container || !this.settings.width) return;
        
        // Get available space (accounting for toolbar and padding)
        const toolbar = container.querySelector('.output-toolbar');
        const toolbarHeight = toolbar ? toolbar.offsetHeight : 0;
        const availableWidth = container.clientWidth - 40;
        const availableHeight = container.clientHeight - toolbarHeight - 60;
        
        if (availableWidth <= 0 || availableHeight <= 0) {
            // Layout not measured yet (e.g. first view-mode paint): retry once
            // on the next frame rather than silently leaving text unsized.
            if (!this._fitRetryScheduled) {
                this._fitRetryScheduled = true;
                requestAnimationFrame(() => {
                    this._fitRetryScheduled = false;
                    this.fitOutputToContainer();
                });
            }
            return;
        }
        
        // Calculate font size to fit width
        // Each character is roughly 0.6 times the font size in width (monospace)
        const charWidth = 0.6;
        const fontSizeFromWidth = availableWidth / (this.settings.width * charWidth);
        
        // Calculate font size to fit height
        const lineHeight = this.settings.lineHeight;
        const fontSizeFromHeight = availableHeight / (this.settings.height * lineHeight);
        
        // Use the smaller of the two to fit both dimensions
        const calculatedFontSize = Math.min(fontSizeFromWidth, fontSizeFromHeight);
        
        // Clamp to reasonable bounds
        const fontSize = Math.max(2, Math.min(100, calculatedFontSize));
        
        output.style.fontSize = `${fontSize}px`;
        output.style.lineHeight = String(lineHeight);
    }

    applyPreset(presetName) {
        const preset = presets[presetName];
        if (!preset) return;

        // Apply preset settings
        Object.entries(preset).forEach(([key, value]) => {
            this.settings[key] = value;
        });

        // Update UI
        this.applySettings();
        this.saveSettings();
        this.debounceConvert();

        this.showToast(`Applied "${presetName}" preset`, 'success');
    }

    // Share function — fully client-side: encodes image + settings into the URL.
    shareAscii() {
        if (!this.currentAscii || !this.currentShareImage) return;

        const shareBtn = document.getElementById('share-btn');
        const originalText = shareBtn ? shareBtn.textContent : '';
        const restoreButtonSoon = () => {
            if (shareBtn) {
                setTimeout(() => { shareBtn.textContent = originalText; }, 2000);
            }
        };

        let encoded;
        try {
            encoded = encodeShare({
                settings: this.settings,
                img: this.currentShareImage,
            });
        } catch (error) {
            console.error('Share encode error:', error);
            this.showToast('Failed to create share link', 'error');
            return;
        }

        const url = `${location.origin}${location.pathname}#s=${encoded}`;

        navigator.clipboard.writeText(url).then(() => {
            if (shareBtn) shareBtn.textContent = '✅ Link Copied!';
            this.showToast('Share link copied to clipboard!', 'success');
            restoreButtonSoon();
        }).catch(() => {
            this.showToast('Could not copy link to clipboard', 'error');
            restoreButtonSoon();
        });
    }

    // Export functions
    copyAscii() {
        if (!this.currentAscii) return;

        navigator.clipboard.writeText(this.currentAscii.text).then(() => {
            this.showToast('Copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Copy failed:', err);
            this.showToast('Failed to copy', 'error');
        });
    }

    exportAsTxt() {
        if (!this.currentAscii) return;

        const blob = new Blob([this.currentAscii.text], { type: 'text/plain' });
        this.downloadBlob(blob, `ascii-art-${Date.now()}.txt`);
        this.showToast('Saved as TXT!', 'success');
    }

    exportAsPng() {
        if (!this.currentAscii) return;

        const { fontSize, lineHeight, colorMode } = this.settings;
        const backgroundColor = '#000000';
        const textColor = '#00ff00';

        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Set font
        ctx.font = `${fontSize}px 'Courier New', monospace`;

        // Calculate dimensions
        const lines = this.currentAscii.text.split('\n').filter(l => l.length > 0);
        const maxWidth = lines.length > 0 ? Math.max(...lines.map(line => ctx.measureText(line).width)) : 100;
        const canvasHeight = lines.length * fontSize * lineHeight;

        canvas.width = maxWidth + 40;
        canvas.height = canvasHeight + 40;

        // Fill background
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Set font again after resize
        ctx.font = `${fontSize}px 'Courier New', monospace`;

        if (colorMode !== 'grayscale' && this.currentAscii.colors) {
            // Draw character by character with color
            for (let y = 0; y < lines.length; y++) {
                const line = lines[y];
                const rowColors = this.currentAscii.colors[y];
                let currentX = 20;
                const yPos = 20 + (y + 1) * fontSize * lineHeight;

                for (let x = 0; x < line.length; x++) {
                    const char = line[x];
                    const colorData = rowColors ? rowColors[x] : null;

                    if (colorData) {
                        if (colorData.background) {
                            const charWidth = ctx.measureText(char).width;
                            ctx.fillStyle = colorData.background;
                            ctx.fillRect(currentX, yPos - fontSize * lineHeight, charWidth, fontSize * lineHeight);
                        }
                        ctx.fillStyle = colorData.color;
                    } else {
                        ctx.fillStyle = textColor;
                    }

                    ctx.fillText(char, currentX, yPos);
                    currentX += ctx.measureText(char).width;
                }
            }
        } else {
            // Draw grayscale
            ctx.fillStyle = textColor;
            lines.forEach((line, index) => {
                ctx.fillText(line, 20, 20 + (index + 1) * fontSize * lineHeight);
            });
        }

        // Download
        canvas.toBlob((blob) => {
            if (!blob) {
                this.showToast('PNG export failed', 'error');
                return;
            }
            this.downloadBlob(blob, `ascii-art-${Date.now()}.png`);
            this.showToast('Saved as PNG!', 'success');
        });
    }

    exportAsHtml() {
        if (!this.currentAscii) return;

        const { fontSize, lineHeight } = this.settings;
        const imageName = this.escapeHtml(this.currentImage?.name || 'ASCII Art');

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${imageName} - ASCII Art</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #0a0a0a;
            display: flex;
            justify-content: center;
            padding: 40px 20px;
            min-height: 100vh;
        }
        .ascii-container {
            background: #000;
            color: #00ff00;
            font-family: 'Courier New', monospace;
            font-size: ${fontSize}px;
            line-height: ${lineHeight};
            white-space: pre;
            padding: 30px;
            border: 2px solid #333;
            border-radius: 12px;
            box-shadow: 0 0 30px rgba(0, 255, 0, 0.1);
            overflow: auto;
            max-width: 100%;
        }
    </style>
</head>
<body>
    <pre class="ascii-container">${this.currentAscii.html || this.escapeHtml(this.currentAscii.text)}</pre>
</body>
</html>`;

        const blob = new Blob([html], { type: 'text/html' });
        this.downloadBlob(blob, `ascii-art-${Date.now()}.html`);
        this.showToast('Saved as HTML!', 'success');
    }

    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        try {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    updateSliderMax() {
        if (!this.currentImage) return;
        
        const widthSlider = document.getElementById('width-slider');
        const heightSlider = document.getElementById('height-slider');
        
        // Set max to the full image dimensions
        widthSlider.max = this.currentImage.width;
        heightSlider.max = Math.round(this.currentImage.height / 2); // /2 for char aspect ratio
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.remove('hidden');

        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }
}

// Initialize the application
new ImageAsciiConverter();

