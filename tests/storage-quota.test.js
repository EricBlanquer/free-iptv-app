/**
 * Regression test: critical user data (watch history, favorites) must survive
 * a saturated localStorage by evicting regenerable caches (backdrop data URIs,
 * subtitle blobs) and retrying, instead of being silently dropped.
 *
 * Reproduces the bug where history and favorites stopped being persisted once
 * localStorage was filled by base64 backdrops and per-stream subtitle states.
 */

window.log = jest.fn();

const fs = require('fs');
const storageCode = fs.readFileSync('./js/storage.js', 'utf8');

global.indexedDB = { open: jest.fn(), deleteDatabase: jest.fn() };

global.Premium = {
    getState: jest.fn().mockReturnValue('active'),
    STATE_EXPIRED: 'expired',
    getHistoryFreeLimit: jest.fn().mockReturnValue(100)
};

const quotaStore = {
    _data: {},
    _maxBytes: Infinity,
    _reset(maxBytes) { this._data = {}; this._maxBytes = maxBytes; },
    get length() { return Object.keys(this._data).length; },
    key(i) { return Object.keys(this._data)[i] || null; },
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
    removeItem(k) { delete this._data[k]; },
    setItem(k, v) {
        v = String(v);
        let total = k.length + v.length;
        for (const kk in this._data) {
            if (kk !== k) total += kk.length + this._data[kk].length;
        }
        if (total > this._maxBytes) {
            const err = new Error('QuotaExceededError');
            err.name = 'QuotaExceededError';
            throw err;
        }
        this._data[k] = v;
    }
};
Object.defineProperty(global, 'localStorage', { value: quotaStore, configurable: true, writable: true });

function IPTVApp() {
    this.settings = {};
    this.watchHistory = [];
    this.favorites = [];
    this.episodeProgress = {};
    this.seriesProgress = {};
}
eval(storageCode);

describe('localStorage quota recovery', () => {
    let app;

    beforeEach(() => {
        window.log.mockClear();
        quotaStore._reset(Infinity);
        app = new IPTVApp();
    });

    function fillWithCaches() {
        const big = 'X'.repeat(900);
        quotaStore.setItem('nextBackdropsData', big);
        quotaStore.setItem('subtitleState_pl1_42', big);
        quotaStore.setItem('subtitleState_pl1_99', big);
    }

    it('evicts caches and persists watch history when localStorage is full', () => {
        fillWithCaches();
        quotaStore._maxBytes = 2800;
        app.watchHistory = [{ id: '1', playlistId: 'pl1', position: 1000 }];

        app.saveWatchHistory();

        const stored = quotaStore.getItem('watchHistory');
        expect(stored).not.toBeNull();
        expect(JSON.parse(stored)).toHaveLength(1);
        expect(quotaStore.getItem('nextBackdropsData')).toBeNull();
        expect(quotaStore.getItem('subtitleState_pl1_42')).toBeNull();
    });

    it('evicts caches and persists favorites when localStorage is full', () => {
        fillWithCaches();
        quotaStore._maxBytes = 2800;
        app.favorites = [{ id: '7', playlistId: 'pl1', _addedAt: 1 }];

        app.saveFavorites();

        const stored = quotaStore.getItem('favorites');
        expect(stored).not.toBeNull();
        expect(JSON.parse(stored)).toHaveLength(1);
        expect(quotaStore.getItem('nextBackdropsData')).toBeNull();
    });

    it('keeps other critical user data while evicting only caches', () => {
        quotaStore.setItem('settings', '{"a":1}');
        fillWithCaches();
        quotaStore._maxBytes = 2800;
        app.episodeProgress = { 'pl1_5': 12345 };

        app.saveEpisodeProgress();

        expect(quotaStore.getItem('episodeProgress')).not.toBeNull();
        expect(quotaStore.getItem('settings')).toBe('{"a":1}');
        expect(quotaStore.getItem('subtitleState_pl1_99')).toBeNull();
    });

    it('returns false and logs an error when even eviction cannot free enough room', () => {
        quotaStore._maxBytes = 40;

        const ok = app._safeLocalSet('watchHistory', 'Y'.repeat(500));

        expect(ok).toBe(false);
        const loggedError = window.log.mock.calls.some(c => c[0] === 'ERROR');
        expect(loggedError).toBe(true);
    });
});
