// Import CSS
import './style.css';

// Core conversion algorithms now live in the extracted modules below.
import { pixelsToAscii as pixelsToAsciiCore, drawToImageData } from './image-processor.js';
import { exportTxtBlob, exportHtmlBlob, buildPngCanvas, downloadBlob as downloadBlobUtil } from './export-manager.js';
import { DEFAULT_SETTINGS, MIN_DIMENSION, MAX_DIMENSION, clampDimension, clampToSliderMax, capGraphemes, sanitizeSettings, isColorRenderTractable } from './settings-schema.js';
import { decodeShare, validateShare } from './share-codec.js';
import { buildShareUrl } from './share-manager.js';
import { createUiMarkup, PRESETS } from './ui-manager.js';

/**
 * Image to ASCII Converter
 * Matching features with Video ASCII Converter
 */

// Export buttons present in read-only view mode (no share-btn there).
const VIEW_EXPORT_BUTTON_IDS = ['copy-btn', 'export-txt-btn', 'export-png-btn', 'export-html-btn'];

// Fallback charset when a "custom" charset is empty — MUST be identical in
// create mode and view mode so a shared link reproduces byte-identically.
const EMPTY_CUSTOM_CHARSET_FALLBACK = ' .:-=+*#%@';

// Application State
export class ImageAsciiConverter {
    constructor() {
        this.currentImage = null;
        this.currentImageDataUrl = null;
        this.currentAscii = null;
        this.currentShareImage = null;
        this.debounceTimer = null;

        // Decoded-image cache (see _getDecodedImage), keyed by the data URL so
        // re-decoding only happens when the actual source image changes.
        this._decodedImage = null;
        this._decodedImageSrc = null;

        // Monotonic upload token. A new file upload bumps this; any in-flight
        // FileReader / Image onload from a previous upload checks the token
        // before mutating instance state, so rapid-fire uploads can't race
        // (older callback lands after newer one and clobbers the active image).
        this._uploadToken = 0;

        // Monotonic conversion token. convertToAscii is async (it awaits an
        // image decode), so a newer debounced conversion can start before an
        // older one finishes. Each run checks this token after the await and
        // bails if superseded, so a slow older decode can't overwrite the
        // newer settings' output / currentAscii.
        this._convertToken = 0;

        // Pending hide-timer for the shared toast element. Cleared on each
        // new toast so a stale timer can't hide the next message early.
        this._toastHideTimer = null;

        // Pending restore-text timer for the share button. Cleared on each
        // share so two clicks within 2s can't revert the button text at
        // the wrong moment relative to the user's latest action.
        this._shareRestoreTimer = null;

        // One-shot guard so the "color too heavy" toast doesn't fire on every
        // debounced re-render while the user is dragging a slider.
        this._colorBudgetWarned = false;

        // Cap on fitOutputToContainer RAF retries. Without a cap, a
        // permanently-zero-size container (display:none, hidden tab,
        // detached subtree) would spin RAF forever.
        this._fitRetryCount = 0;

        // Settings (with localStorage persistence)
        this.settings = this.loadSettings();

        // Instance-scoped custom charset. Was previously stored on the
        // module-level `charsets` object which leaked state across instances
        // and made the module non-reentrant for tests / future multi-canvas
        // use. Tracked as Hub #133.
        this.customChars = this.settings.customCharset || EMPTY_CUSTOM_CHARSET_FALLBACK;

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
            this.customChars = this.settings.customCharset || EMPTY_CUSTOM_CHARSET_FALLBACK;
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
        app.innerHTML = createUiMarkup(this.settings, { MIN_DIMENSION, MAX_DIMENSION });
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
        // Match the create-mode toast so screen readers announce status
        // messages in shared-art view mode too.
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');

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
        uploadArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                imageInput.click();
            }
        });
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
                    const percent = parseInt(e.target.value, 10) / 100;
                    this.updateSliderMax();
                    this.syncDimension('width', this.currentImage.width * percent);
                    // Divide height by 2 because ASCII chars are taller than wide.
                    this.syncDimension('height', (this.currentImage.height * percent) / 2);
                    this.saveSettings();
                    this.debounceConvert();
                }
            }
        });

        // Width slider
        const widthSlider = document.getElementById('width-slider');
        const heightSlider = document.getElementById('height-slider');
        widthSlider.addEventListener('input', (e) => {
            const value = this.syncDimension('width', parseInt(e.target.value, 10));
            document.getElementById('resolution-select').value = 'custom';
            document.getElementById('custom-resolution').classList.remove('hidden');
            if (this.settings.preserveAspectRatio && this.currentImage) {
                // /2 because ASCII chars are roughly twice as tall as wide.
                const aspectRatio = this.currentImage.width / this.currentImage.height;
                this.syncDimension('height', value / aspectRatio / 2);
            }
            this.saveSettings();
            this.debounceConvert();
        });

        // Height slider
        heightSlider.addEventListener('input', (e) => {
            const value = this.syncDimension('height', parseInt(e.target.value, 10));
            document.getElementById('resolution-select').value = 'custom';
            document.getElementById('custom-resolution').classList.remove('hidden');
            if (this.settings.preserveAspectRatio && this.currentImage) {
                const aspectRatio = this.currentImage.width / this.currentImage.height;
                this.syncDimension('width', value * 2 * aspectRatio);
            }
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
            // Code-point cap so the live ramp matches the sanitized (shared-link) value
            // and never carries a lone surrogate. hub-1109.
            const value = capGraphemes(e.target.value, 200);
            this.settings.customCharset = value;
            this.customChars = value || EMPTY_CUSTOM_CHARSET_FALLBACK;
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
        // Route through syncDimension so a persisted dimension that exceeds the
        // current slider max can't leave the thumb and label disagreeing. hub-1106.
        this.syncDimension('width', this.settings.width);
        this.syncDimension('height', this.settings.height);

        // The resolution dropdown's percentage options are relative to a loaded
        // image, which doesn't exist yet on restore. If the persisted dims
        // differ from the defaults they're literal custom values, so reflect
        // that instead of leaving the dropdown stuck on its markup default
        // ("50% Scale") while the sliders show unrelated numbers.
        if (this.settings.width !== DEFAULT_SETTINGS.width ||
            this.settings.height !== DEFAULT_SETTINGS.height) {
            document.getElementById('resolution-select').value = 'custom';
            document.getElementById('custom-resolution').classList.remove('hidden');
        }

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

        // SVG has no reliable intrinsic raster size and can encode external refs; the
        // share codec already excludes SVG (RASTER_DATA_URI), so the create path must
        // match. Reject up front with a clear message instead of failing at draw time.
        if (file.type === 'image/svg+xml') {
            this.showToast('SVG is not supported. Please use a PNG, JPEG, GIF, or WebP image.', 'error');
            return;
        }

        const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
        if (file.size > MAX_FILE_SIZE) {
            this.showToast('File too large. Maximum size is 50MB.', 'error');
            return;
        }

        const uploadToken = ++this._uploadToken;

        const reader = new FileReader();
        reader.onload = (e) => {
            if (this._uploadToken !== uploadToken) return; // newer upload superseded this one
            this.currentImageDataUrl = e.target.result;

            // Show preview
            const previewContainer = document.getElementById('image-preview');
            const previewImg = document.getElementById('preview-img');
            const imageInfo = document.getElementById('image-info');

            previewImg.onload = () => {
                if (this._uploadToken !== uploadToken) return; // newer upload superseded this one

                // A decode can "succeed" with zero intrinsic size (a dimensionless image, or a
                // malformed raster that slipped past the MIME check). drawImage with a 0×0
                // source rect throws downstream, so reject here with a clear message instead of
                // a misleading "Image loaded successfully!" followed by "Error:". hub-1107.
                if (!previewImg.naturalWidth || !previewImg.naturalHeight) {
                    previewContainer.classList.add('hidden');
                    this.showToast('Could not read image dimensions. The file may be corrupt or an unsupported format.', 'error');
                    return;
                }

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
                    const percent = parseInt(resolutionSelect.value, 10) / 100;
                    this.syncDimension('width', this.currentImage.width * percent);
                    this.syncDimension('height', (this.currentImage.height * percent) / 2);
                    this.saveSettings();
                } else if (this.settings.preserveAspectRatio) {
                    // updateSliderMax (called above) may have lowered the width slider's max
                    // for a smaller image — re-clamp the carried-over width so slider/label/
                    // setting agree, THEN derive height from the freshly-clamped width. hub-1110.
                    const width = this.syncDimension('width', this.settings.width);
                    const aspectRatio = previewImg.naturalWidth / previewImg.naturalHeight;
                    this.syncDimension('height', width / aspectRatio / 2);
                    this.saveSettings();
                }
                
                // Toast only after a confirmed decode — a corrupt file that
                // passes the MIME check never reaches here (onerror fires).
                this.showToast('Image loaded successfully!', 'success');
                this.convertToAscii();
            };

            previewImg.onerror = () => {
                if (this._uploadToken !== uploadToken) return; // newer upload superseded this one
                previewContainer.classList.add('hidden');
                this.showToast('Could not load image. The file may be corrupt or an unsupported format.', 'error');
            };

            previewImg.src = e.target.result;
            previewContainer.classList.remove('hidden');
        };

        reader.onerror = () => {
            if (this._uploadToken !== uploadToken) return; // newer upload superseded this one
            this.showToast('Could not read the file. Please try again.', 'error');
        };

    reader.readAsDataURL(file);
}

    debounceConvert() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.convertToAscii(), 150);
    }

    async convertToAscii() {
        if (!this.currentImageDataUrl) return;

        const token = ++this._convertToken;

        try {
            const imageData = await this.processImage();
            // A newer conversion superseded this one while the image was
            // decoding — drop this stale result instead of rendering it.
            if (token !== this._convertToken) return;

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
            // Ignore errors from a conversion that's already been superseded.
            if (token !== this._convertToken) return;
            console.error('Conversion error:', error);
            const output = document.getElementById('ascii-output');
            const p = document.createElement('p');
            p.className = 'placeholder error';
            p.textContent = `Error: ${error.message}`;
            if (output) output.replaceChildren(p);

            // Failed conversion must invalidate the previous-good output so
            // share/copy/export don't silently re-emit stale art. Tracked as
            // Hub #134.
            this.currentAscii = null;
            ['share-btn', 'copy-btn', 'export-txt-btn', 'export-png-btn', 'export-html-btn']
                .forEach((id) => {
                    const el = document.getElementById(id);
                    if (el) el.disabled = true;
                });
        }
    }

    // Decode the source image once and cache it, keyed by the data URL. Every
    // slider/adjustment debounce re-runs processImage; without this cache each
    // run re-decoded the full-resolution source (up to the 50MB upload limit)
    // before drawing the small ASCII canvas.
    _getDecodedImage() {
        if (this._decodedImage && this._decodedImageSrc === this.currentImageDataUrl) {
            return Promise.resolve(this._decodedImage);
        }
        return new Promise((resolve, reject) => {
            const img = new Image();
            const src = this.currentImageDataUrl;
            img.onload = () => {
                this._decodedImage = img;
                this._decodedImageSrc = src;
                resolve(img);
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = src;
        });
    }

    processImage() {
        return this._getDecodedImage().then((img) => {
            // Convert-time safety net: canvas can never exceed MAX_DIMENSION. Tracker C2.
            const width = clampDimension(this.settings.width);
            const height = clampDimension(this.settings.height);
            return drawToImageData({
                image: img, width, height,
                canvas: this.canvas, ctx: this.ctx,
                edgeDetection: this.settings.edgeDetection,
            });
        });
    }

    pixelsToAscii(imageData) {
        return pixelsToAsciiCore(imageData, {
            colorMode: this.settings.colorMode,
            inverted: this.settings.inverted,
            charsetType: this.settings.charsetType,
            customChars: this.customChars,
            brightness: this.settings.brightness,
            contrast: this.settings.contrast,
        });
    }

    renderAscii(asciiContent) {
        if (!asciiContent) return;
        
        const output = document.getElementById('ascii-output');
        
        const wantedColor = this.settings.colorMode !== 'grayscale';
        const tractable = isColorRenderTractable(
            this.settings.width,
            this.settings.height,
            this.settings.colorMode,
        );

        if (wantedColor && tractable) {
            // Safe: asciiContent.html is built in pixelsToAscii from numeric
            // pixel values + escapeHtml(char) only — never from link/network strings.
            output.innerHTML = asciiContent.html;
        } else {
            output.textContent = asciiContent.text;
            if (wantedColor && !tractable && !this._colorBudgetWarned) {
                this._colorBudgetWarned = true;
                this.showToast(
                    'Resolution too high for color rendering — showing grayscale. Lower resolution to use color.',
                    'error',
                );
                setTimeout(() => { this._colorBudgetWarned = false; }, 5000);
            }
        }

        // Auto-calculate font size if fitToContainer is enabled
        if (this.settings.fitToContainer) {
            this.fitOutputToContainer();
        } else {
            this.updateOutputStyle();
        }
    }
    
    // Measure the actual glyph aspect ratio of the rendered monospace font
    // once per session. A hardcoded 0.6 is right for Courier New on macOS
    // but drifts on Windows/Linux fallbacks, producing overflow or wasted
    // space. Cached on the instance to avoid re-measuring per resize.
    getCharWidthRatio() {
        if (this._charWidthRatio !== undefined) return this._charWidthRatio;
        try {
            const c = document.createElement('canvas');
            const ctx = c.getContext('2d');
            const probeSize = 100;
            ctx.font = `${probeSize}px "Courier New", monospace`;
            const measured = ctx.measureText('M').width / probeSize;
            this._charWidthRatio = measured > 0 && isFinite(measured) ? measured : 0.6;
        } catch {
            this._charWidthRatio = 0.6;
        }
        return this._charWidthRatio;
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
            // Layout not measured yet (e.g. first view-mode paint): retry on
            // the next frame, but cap retries at 10 so a permanently-hidden
            // container can't spin RAF forever.
            const MAX_FIT_RETRIES = 10;
            if (!this._fitRetryScheduled && this._fitRetryCount < MAX_FIT_RETRIES) {
                this._fitRetryScheduled = true;
                this._fitRetryCount += 1;
                requestAnimationFrame(() => {
                    this._fitRetryScheduled = false;
                    this.fitOutputToContainer();
                });
            }
            return;
        }
        // Successful measure — reset the counter so a later resize starts fresh.
        this._fitRetryCount = 0;
        
        // Measure once (cached) instead of assuming 0.6.
        const charWidth = this.getCharWidthRatio();
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
        const preset = PRESETS[presetName];
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
            if (!shareBtn) return;
            clearTimeout(this._shareRestoreTimer);
            this._shareRestoreTimer = setTimeout(() => {
                shareBtn.textContent = originalText;
                this._shareRestoreTimer = null;
            }, 2000);
        };

        let url;
        try {
            url = buildShareUrl({
                settings: this.settings,
                img: this.currentShareImage,
                origin: location.origin,
                pathname: location.pathname,
            });
        } catch (error) {
            console.error('Share encode error:', error);
            const friendly = error.message && error.message.includes('too large')
                ? 'Image too large to share. Lower the resolution and try again.'
                : 'Failed to create share link';
            this.showToast(friendly, 'error');
            return;
        }

        if (!navigator.clipboard?.writeText) {
            this.showToast('Clipboard not available — copy the URL from the address bar after navigating to it.', 'error');
            return;
        }

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

        if (!navigator.clipboard?.writeText) {
            this.showToast('Clipboard not available in this browser', 'error');
            return;
        }

        navigator.clipboard.writeText(this.currentAscii.text).then(() => {
            this.showToast('Copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Copy failed:', err);
            this.showToast('Failed to copy', 'error');
        });
    }

    exportAsTxt() {
        if (!this.currentAscii) return;
        downloadBlobUtil(exportTxtBlob(this.currentAscii), `ascii-art-${Date.now()}.txt`, document);
        this.showToast('Saved as TXT!', 'success');
    }

    exportAsPng() {
        if (!this.currentAscii) return;
        const result = buildPngCanvas(this.currentAscii, this.settings, document);
        if (result.error) {
            this.showToast(result.error, 'error');
            return;
        }
        result.canvas.toBlob((blob) => {
            if (!blob) {
                this.showToast('PNG export failed', 'error');
                return;
            }
            downloadBlobUtil(blob, `ascii-art-${Date.now()}.png`, document);
            this.showToast('Saved as PNG!', 'success');
        });
    }

    exportAsHtml() {
        if (!this.currentAscii) return;
        const blob = exportHtmlBlob(this.currentAscii, this.settings, this.currentImage?.name);
        downloadBlobUtil(blob, `ascii-art-${Date.now()}.html`, document);
        this.showToast('Saved as HTML!', 'success');
    }

    // Single source of truth for writing a width/height. Clamps the requested
    // value to the global contract AND the live slider max, then sets the slider
    // thumb, the numeric label, and this.settings together so they can never
    // disagree. Returns the value actually written. hub-1106/1110.
    syncDimension(dim, requested) {
        const slider = document.getElementById(`${dim}-slider`);
        const valueEl = document.getElementById(`${dim}-value`);
        const sliderMax = slider ? parseInt(slider.max, 10) : MAX_DIMENSION;
        const value = clampToSliderMax(requested, sliderMax);
        this.settings[dim] = value;
        if (slider) slider.value = value;
        if (valueEl) valueEl.textContent = value;
        return value;
    }

    updateSliderMax() {
        if (!this.currentImage) return;

        const widthSlider = document.getElementById('width-slider');
        const heightSlider = document.getElementById('height-slider');

        // Floor at MIN_DIMENSION so a tiny image (e.g. a 5x5 favicon)
        // doesn't produce a slider whose max is below its hardcoded min=10.
        widthSlider.max = Math.max(
            MIN_DIMENSION,
            Math.min(this.currentImage.width, MAX_DIMENSION),
        );
        heightSlider.max = Math.max(
            MIN_DIMENSION,
            Math.min(Math.round(this.currentImage.height / 2), MAX_DIMENSION),
        );
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

        // Cancel any previously-scheduled hide so rapid toasts each get the
        // full 3s of visibility instead of being cut short by an older timer.
        clearTimeout(this._toastHideTimer);
        this._toastHideTimer = setTimeout(() => {
            toast.classList.add('hidden');
            this._toastHideTimer = null;
        }, 3000);
    }
}

// Auto-start only in a real browser. Under Vitest, NODE_ENV is 'test' and the
// class is imported + instantiated explicitly with a controlled DOM. `process`
// is undefined in the browser, so the typeof guard is browser-safe. hub-1105.
const __isTestEnv = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test';
if (!__isTestEnv) {
    new ImageAsciiConverter();

    // Register the offline service worker. Registered here (an external module)
    // rather than an inline <script> so it complies with the deployed CSP
    // (script-src 'self'). Guarded so it no-ops where SW is unsupported and
    // under the jsdom test environment.
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support is best-effort */ });
        });
    }
}

