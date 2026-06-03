// Vitest 4's jsdom environment exposes `localStorage` as a bare `{}` with no
// Storage methods (a known regression in its --localstorage-file wiring), so
// the converter's loadSettings/saveSettings and the characterization tests'
// direct setItem/clear calls have nothing real to talk to. This setupFile
// installs a minimal, spec-shaped in-memory Storage on the jsdom global before
// any test imports run. Only runs under test; never shipped to the browser.
// hub-1105.
if (typeof window !== 'undefined') {
    const needsPolyfill = typeof window.localStorage !== 'object'
        || window.localStorage === null
        || typeof window.localStorage.setItem !== 'function';
    if (needsPolyfill) {
        const store = new Map();
        const storage = {
            getItem(key) {
                return store.has(String(key)) ? store.get(String(key)) : null;
            },
            setItem(key, value) {
                store.set(String(key), String(value));
            },
            removeItem(key) {
                store.delete(String(key));
            },
            clear() {
                store.clear();
            },
            key(index) {
                return Array.from(store.keys())[index] ?? null;
            },
            get length() {
                return store.size;
            },
        };
        Object.defineProperty(window, 'localStorage', {
            value: storage,
            configurable: true,
            writable: false,
        });
    }
}
