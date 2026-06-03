// Minimal 2D-context + canvas stub so ImageAsciiConverter can be instantiated
// and exercised under jsdom (which has no canvas). Deterministic: measureText
// is 6px/char, getImageData returns a flat mid-gray buffer of the requested
// size. Call installCanvasStub() once per test file before importing/creating
// the converter. hub-1105.
export function installCanvasStub() {
    const ctxStub = {
        canvas: null,
        font: '',
        fillStyle: '',
        drawImage() {},
        fillRect() {},
        fillText() {},
        measureText: (text) => ({ width: String(text).length * 6 }),
        getImageData: (x, y, w, h) => ({
            data: new Uint8ClampedArray(w * h * 4).fill(128),
            width: w,
            height: h,
        }),
    };
    HTMLCanvasElement.prototype.getContext = function getContext() {
        ctxStub.canvas = this;
        return ctxStub;
    };
    HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,iVBORw0KGgo=';
    HTMLCanvasElement.prototype.toBlob = function toBlob(cb) {
        cb(new Blob([], { type: 'image/png' }));
    };
    return ctxStub;
}
