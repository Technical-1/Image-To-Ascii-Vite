// Pure create-mode markup + the static style presets. No DOM access — returns a
// string the converter injects. Keeps the 150-line template out of the
// orchestrator and makes the markup independently assertable. hub-1111.
export const PRESETS = {
    classic:      { charsetType: 'standard', colorMode: 'grayscale', inverted: false, brightness: 1.0, contrast: 1.0 },
    colored:      { charsetType: 'standard', colorMode: 'rgb',       inverted: false, brightness: 1.0, contrast: 1.0 },
    blocks:       { charsetType: 'blocks',   colorMode: 'grayscale', inverted: false, brightness: 1.0, contrast: 1.0 },
    matrix:       { charsetType: 'detailed', colorMode: 'grayscale', inverted: true,  brightness: 1.3, contrast: 1.4 },
    highContrast: { charsetType: 'detailed', colorMode: 'grayscale', inverted: false, brightness: 1.2, contrast: 1.5 },
    inverted:     { charsetType: 'standard', colorMode: 'grayscale', inverted: true,  brightness: 1.0, contrast: 1.0 },
};

// `bounds` = { MIN_DIMENSION, MAX_DIMENSION }. Move the EXACT template from the
// old setupUI here; only the slider min/max use the bounds (Bucket A).
export function createUiMarkup(settings, bounds) {
    const { MIN_DIMENSION, MAX_DIMENSION } = bounds;
    return `
            <div class="app-layout">
                <!-- Left Sidebar - Controls -->
                <aside class="sidebar">
                    <div class="sidebar-header">
                        <h1 class="logo">🖼️ Image to ASCII</h1>
                    </div>

                    <div class="sidebar-content">
                        <!-- Upload -->
                        <div class="panel">
                            <div class="upload-area" id="upload-area" role="button" tabindex="0" aria-label="Upload image. Press Enter or Space to choose a file.">
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
                                    <label>W: <span id="width-value">${settings.width}</span></label>
                                    <input type="range" id="width-slider" min="${MIN_DIMENSION}" max="${MAX_DIMENSION}" value="${settings.width}" step="1">
                                </div>
                                <div class="slider-row">
                                    <label>H: <span id="height-value">${settings.height}</span></label>
                                    <input type="range" id="height-slider" min="${MIN_DIMENSION}" max="${MAX_DIMENSION}" value="${settings.height}" step="1">
                                </div>
                                <label class="checkbox-inline">
                                    <input type="checkbox" id="aspect-ratio-checkbox" checked>
                                    <span>Lock Aspect Ratio</span>
                                </label>
                            </div>

                            <label class="checkbox-inline">
                                <input type="checkbox" id="fit-container-checkbox" ${settings.fitToContainer ? 'checked' : ''}>
                                <span>Fit to Container</span>
                            </label>
                            <div class="manual-font-controls" id="manual-font-controls" ${settings.fitToContainer ? 'style="display:none"' : ''}>
                                <div class="slider-row">
                                    <label>Font: <span id="font-size-value">${settings.fontSize}</span>px</label>
                                    <input type="range" id="font-size-slider" min="4" max="20" value="${settings.fontSize}" step="1">
                                </div>
                                <div class="slider-row">
                                    <label>Line H: <span id="line-height-value">${settings.lineHeight.toFixed(2)}</span></label>
                                    <input type="range" id="line-height-slider" min="0.5" max="1.5" value="${settings.lineHeight}" step="0.05">
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
                                <input type="text" id="custom-charset" placeholder="Custom chars..." maxlength="200">
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
                                <label>Brightness: <span id="brightness-value">${settings.brightness.toFixed(1)}</span></label>
                                <input type="range" id="brightness-slider" min="0.5" max="2" value="${settings.brightness}" step="0.1">
                            </div>
                            <div class="slider-row">
                                <label>Contrast: <span id="contrast-value">${settings.contrast.toFixed(1)}</span></label>
                                <input type="range" id="contrast-slider" min="0.5" max="2" value="${settings.contrast}" step="0.1">
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

                <!-- Toast: aria-live=polite + role=status so screen readers
                     announce dynamic status messages without interrupting. -->
                <div class="toast hidden" id="toast" role="status" aria-live="polite"></div>
            </div>
        `;
}
