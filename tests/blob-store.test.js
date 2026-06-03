/**
 * Tests for the IndexedDB blob store that holds the large regenerable blobs
 * (base64 loading backdrops, external subtitle SRT content) moved out of
 * localStorage, plus the one-time cleanup of the legacy localStorage keys.
 */

window.log = jest.fn();

const fs = require('fs');
const storageCode = fs.readFileSync('./js/storage.js', 'utf8');

function createMockIndexedDB() {
    const dbs = {};
    function makeTx(db) {
        const tx = { error: null };
        function complete() {
            setTimeout(function() { if (tx.oncomplete) tx.oncomplete(); }, 0);
        }
        tx.objectStore = function(name) {
            const store = db.stores[name];
            return {
                put(obj) {
                    const r = {};
                    setTimeout(function() {
                        store.data[obj[store.keyPath]] = obj;
                        if (r.onsuccess) r.onsuccess({ target: { result: obj[store.keyPath] } });
                        complete();
                    }, 0);
                    return r;
                },
                get(key) {
                    const r = {};
                    setTimeout(function() {
                        if (r.onsuccess) r.onsuccess({ target: { result: store.data[key] } });
                        complete();
                    }, 0);
                    return r;
                },
                delete(key) {
                    const r = {};
                    setTimeout(function() {
                        delete store.data[key];
                        if (r.onsuccess) r.onsuccess({ target: { result: undefined } });
                        complete();
                    }, 0);
                    return r;
                }
            };
        };
        return tx;
    }
    return {
        open(name) {
            const req = {};
            setTimeout(function() {
                let db = dbs[name];
                const isNew = !db;
                if (isNew) {
                    db = {
                        name: name,
                        stores: {},
                        objectStoreNames: { contains(n) { return Object.prototype.hasOwnProperty.call(db.stores, n); } },
                        createObjectStore(n, opts) { db.stores[n] = { keyPath: opts.keyPath, data: {} }; },
                        transaction() { return makeTx(db); }
                    };
                    dbs[name] = db;
                    if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: db } });
                }
                if (req.onsuccess) req.onsuccess({ target: { result: db } });
            }, 0);
            return req;
        }
    };
}

global.indexedDB = createMockIndexedDB();
window.indexedDB = global.indexedDB;

function IPTVApp() {
    this.settings = {};
}
eval(storageCode);

describe('IndexedDB blob store', () => {
    let app;

    beforeEach(() => {
        window.log.mockClear();
        app = new IPTVApp();
        app._blobStoreDB = null;
        app._blobStoreDBPromise = null;
    });

    it('round-trips a value through blobPut/blobGet', async () => {
        const ok = await app.blobPut('nextBackdropsData', JSON.stringify(['data:image/jpeg;base64,AAAA']));
        expect(ok).toBe(true);
        const value = await app.blobGet('nextBackdropsData');
        expect(JSON.parse(value)).toEqual(['data:image/jpeg;base64,AAAA']);
    });

    it('returns null for a missing key', async () => {
        const value = await app.blobGet('does-not-exist');
        expect(value).toBeNull();
    });

    it('removes a value with blobDelete', async () => {
        await app.blobPut('subtitleState_pl1_42', '{"content":"1\\n00:00","offset":0}');
        expect(await app.blobGet('subtitleState_pl1_42')).not.toBeNull();
        await app.blobDelete('subtitleState_pl1_42');
        expect(await app.blobGet('subtitleState_pl1_42')).toBeNull();
    });
});

describe('legacy localStorage cleanup', () => {
    let app;
    const legacyStore = {
        _data: {},
        _reset() { this._data = {}; },
        get length() { return Object.keys(this._data).length; },
        key(i) { return Object.keys(this._data)[i] || null; },
        getItem(k) { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
        setItem(k, v) { this._data[k] = String(v); },
        removeItem(k) { delete this._data[k]; }
    };

    beforeAll(() => {
        Object.defineProperty(global, 'localStorage', { value: legacyStore, configurable: true, writable: true });
    });

    beforeEach(() => {
        window.log.mockClear();
        legacyStore._reset();
        app = new IPTVApp();
    });

    it('removes legacy backdrop and subtitle keys, keeps critical data', () => {
        legacyStore.setItem('nextBackdropsData', 'X'.repeat(500));
        legacyStore.setItem('nextBackdrops', '["http://a"]');
        legacyStore.setItem('loadingBackdrops', '["http://b"]');
        legacyStore.setItem('subtitleState_pl1_42', 'srt');
        legacyStore.setItem('subtitleState_pl2_99', 'srt');
        legacyStore.setItem('favorites', '[{"id":"7"}]');
        legacyStore.setItem('watchHistory', '[{"id":"1"}]');

        app._cleanupLegacyBlobStorage();

        expect(legacyStore.getItem('nextBackdropsData')).toBeNull();
        expect(legacyStore.getItem('nextBackdrops')).toBeNull();
        expect(legacyStore.getItem('loadingBackdrops')).toBeNull();
        expect(legacyStore.getItem('subtitleState_pl1_42')).toBeNull();
        expect(legacyStore.getItem('subtitleState_pl2_99')).toBeNull();
        expect(legacyStore.getItem('favorites')).toBe('[{"id":"7"}]');
        expect(legacyStore.getItem('watchHistory')).toBe('[{"id":"1"}]');
    });

    it('does nothing when there are no legacy keys', () => {
        legacyStore.setItem('favorites', '[]');
        app._cleanupLegacyBlobStorage();
        expect(legacyStore.getItem('favorites')).toBe('[]');
    });
});
