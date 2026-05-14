/**
 * Tests for configurable provider cache refresh interval (settings.cacheRefreshHours)
 *
 * Pins:
 * - storage.js exposes getProviderCacheTTL() reading settings.cacheRefreshHours
 * - default of 12h is preserved when the setting is missing or invalid
 * - loadProviderCacheLocal honours the configured TTL when deciding _needsRefresh
 * - loadSettings includes cacheRefreshHours = 12 in the defaults block
 * - the previous PROVIDER_CACHE_TTL inline references in storage.js and
 *   core/utils.js are no longer hardcoded literals — they delegate to the helper
 */

const fs = require('fs');
const vm = require('vm');

const storageCode = fs.readFileSync('./js/storage.js', 'utf8');
const utilsCode = fs.readFileSync('./js/core/utils.js', 'utf8');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function makeApp(extraSettings) {
    const sandbox = {
        window: { log: function() {} },
        Date: Date,
        Math: Math,
        Promise: Promise,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        JSON: JSON,
        Infinity: Infinity,
        isFinite: isFinite,
        console: console,
        localStorage: {
            _data: {},
            getItem: function(k) { return this._data[k] || null; },
            setItem: function(k, v) { this._data[k] = v; },
            removeItem: function(k) { delete this._data[k]; }
        },
        indexedDB: null,
        navigator: { language: 'en-US' }
    };
    sandbox.IPTVApp = function() {
        this.settings = Object.assign({}, extraSettings || {});
    };
    vm.createContext(sandbox);
    const ttlConst = (storageCode.match(/var PROVIDER_CACHE_TTL_DEFAULT_HOURS[^\n]+\n/) || [''])[0];
    const dbConsts = "var PROVIDER_CACHE_DB_NAME='IPTVProviderCache';var PROVIDER_CACHE_STORE_NAME='cache';var PROVIDER_CACHE_DB_VERSION=1;\n";
    const helper = slice(storageCode, 'getProviderCacheTTL');
    const loader = slice(storageCode, 'loadSettings');
    const provCacheKey = slice(storageCode, 'getProviderCacheKey');
    const filtersMatch = slice(storageCode, 'filtersMatch');
    const curFilters = slice(storageCode, 'getCurrentFilterSettings');
    const initDB = slice(storageCode, 'initProviderCacheDB');
    const loadLocal = slice(storageCode, 'loadProviderCacheLocal');
    vm.runInContext(ttlConst + dbConsts + helper + loader + provCacheKey + filtersMatch + curFilters + initDB + loadLocal, sandbox);
    return { sandbox: sandbox, app: new sandbox.IPTVApp() };
}

describe('Provider cache refresh interval (configurable)', () => {
    describe('getProviderCacheTTL()', () => {
        it('returns 12h by default when setting is missing', () => {
            const { app } = makeApp();
            expect(app.getProviderCacheTTL()).toBe(12 * 60 * 60 * 1000);
        });

        it('reflects the configured value in milliseconds', () => {
            const { app } = makeApp({ cacheRefreshHours: 3 });
            expect(app.getProviderCacheTTL()).toBe(3 * 60 * 60 * 1000);
            app.settings.cacheRefreshHours = 48;
            expect(app.getProviderCacheTTL()).toBe(48 * 60 * 60 * 1000);
            app.settings.cacheRefreshHours = 1;
            expect(app.getProviderCacheTTL()).toBe(60 * 60 * 1000);
        });

        it('falls back to 12h when the value is invalid (0, negative, NaN, non-number, Infinity)', () => {
            const expected = 12 * 60 * 60 * 1000;
            const { app } = makeApp();
            app.settings.cacheRefreshHours = 0;
            expect(app.getProviderCacheTTL()).toBe(expected);
            app.settings.cacheRefreshHours = -5;
            expect(app.getProviderCacheTTL()).toBe(expected);
            app.settings.cacheRefreshHours = NaN;
            expect(app.getProviderCacheTTL()).toBe(expected);
            app.settings.cacheRefreshHours = '6';
            expect(app.getProviderCacheTTL()).toBe(expected);
            app.settings.cacheRefreshHours = Infinity;
            expect(app.getProviderCacheTTL()).toBe(expected);
        });

        it('does not crash when this.settings is missing entirely', () => {
            const { app } = makeApp();
            app.settings = null;
            expect(app.getProviderCacheTTL()).toBe(12 * 60 * 60 * 1000);
        });
    });

    describe('loadProviderCacheLocal honours configured TTL', () => {
        function attachMockDB(app, cacheEntry) {
            const mockStore = {
                get: function() {
                    const request = { onsuccess: null, onerror: null };
                    setTimeout(() => {
                        if (request.onsuccess) {
                            request.onsuccess({ target: { result: cacheEntry } });
                        }
                    }, 0);
                    return request;
                }
            };
            const mockDB = {
                transaction: () => ({ objectStore: () => mockStore }),
                objectStoreNames: { contains: () => true }
            };
            app._providerCacheDB = mockDB;
            app.initProviderCacheDB = function() { return Promise.resolve(mockDB); };
        }

        const baseFilters = { hideSD: false, hide3D: false, hideSM: false, providerLanguage: undefined };

        it('flags cache as stale when older than configured TTL (1h setting, 2h-old cache)', async () => {
            const { app } = makeApp({ cacheRefreshHours: 1, hideSD: false, hide3D: false, hideHearingImpaired: false });
            attachMockDB(app, {
                timestamp: Date.now() - 2 * 60 * 60 * 1000,
                data: { vod: { categories: [], streams: [] } },
                filters: baseFilters
            });
            const result = await app.loadProviderCacheLocal('test');
            expect(result._needsRefresh).toBe(true);
        });

        it('does NOT flag cache as stale when within configured TTL (24h setting, 2h-old cache)', async () => {
            const { app } = makeApp({ cacheRefreshHours: 24, hideSD: false, hide3D: false, hideHearingImpaired: false });
            attachMockDB(app, {
                timestamp: Date.now() - 2 * 60 * 60 * 1000,
                data: { vod: { categories: [], streams: [] } },
                filters: baseFilters
            });
            const result = await app.loadProviderCacheLocal('test');
            expect(result._needsRefresh).toBeUndefined();
        });

        it('uses 12h default: 11h-old cache fresh, 13h-old cache stale', async () => {
            const fresh = makeApp({ hideSD: false, hide3D: false, hideHearingImpaired: false });
            attachMockDB(fresh.app, {
                timestamp: Date.now() - 11 * 60 * 60 * 1000,
                data: { vod: { categories: [], streams: [] } },
                filters: baseFilters
            });
            let r = await fresh.app.loadProviderCacheLocal('test');
            expect(r._needsRefresh).toBeUndefined();

            const stale = makeApp({ hideSD: false, hide3D: false, hideHearingImpaired: false });
            attachMockDB(stale.app, {
                timestamp: Date.now() - 13 * 60 * 60 * 1000,
                data: { vod: { categories: [], streams: [] } },
                filters: baseFilters
            });
            r = await stale.app.loadProviderCacheLocal('test');
            expect(r._needsRefresh).toBe(true);
        });
    });

    describe('loadSettings defaults', () => {
        it('defaults cacheRefreshHours to 12 when no saved settings exist', () => {
            const { app } = makeApp();
            const result = app.loadSettings();
            expect(result.cacheRefreshHours).toBe(12);
        });

        it('fills cacheRefreshHours with 12 when saved settings omit it', () => {
            const { app, sandbox } = makeApp();
            sandbox.localStorage._data.settings = JSON.stringify({ locale: 'fr' });
            const result = app.loadSettings();
            expect(result.cacheRefreshHours).toBe(12);
        });

        it('preserves a user-saved cacheRefreshHours value', () => {
            const { app, sandbox } = makeApp();
            sandbox.localStorage._data.settings = JSON.stringify({ cacheRefreshHours: 6 });
            const result = app.loadSettings();
            expect(result.cacheRefreshHours).toBe(6);
        });
    });

    describe('Source-level pins (refactor took)', () => {
        it('storage.js no longer compares against a bare 12*60*60*1000 literal', () => {
            const offenders = [];
            storageCode.split('\n').forEach((line, idx) => {
                if (/12\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(line)) {
                    offenders.push((idx + 1) + ': ' + line.trim());
                }
            });
            expect(offenders).toEqual([]);
        });

        it('storage.js routes TTL comparisons through getProviderCacheTTL()', () => {
            const matches = storageCode.match(/getProviderCacheTTL\s*\(\s*\)/g) || [];
            expect(matches.length).toBeGreaterThanOrEqual(3);
        });

        it('core/utils.js onAppResumed uses getProviderCacheTTL() rather than a literal', () => {
            expect(utilsCode).toMatch(/this\.getProviderCacheTTL\s*\(\s*\)/);
        });
    });
});
