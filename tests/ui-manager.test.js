import { describe, it, expect } from 'vitest';
import { createUiMarkup, PRESETS } from '../src/ui-manager.js';
import { DEFAULT_SETTINGS, MIN_DIMENSION, MAX_DIMENSION } from '../src/settings-schema.js';

describe('createUiMarkup', () => {
    const markup = createUiMarkup(DEFAULT_SETTINGS, { MIN_DIMENSION, MAX_DIMENSION });
    it('contains the core control ids the converter wires up', () => {
        for (const id of ['upload-area', 'width-slider', 'height-slider', 'charset-select', 'color-mode-select', 'share-btn', 'ascii-output']) {
            expect(markup).toContain(`id="${id}"`);
        }
    });
    it('uses MAX_DIMENSION as the slider ceiling (hub-1106)', () => {
        expect(markup).toContain(`max="${MAX_DIMENSION}"`);
        expect(markup).not.toContain('max="1000"');
    });
});

describe('PRESETS', () => {
    it('makes Matrix visibly distinct from Classic (hub-168)', () => {
        expect(PRESETS.matrix).not.toEqual(PRESETS.classic);
    });
});
