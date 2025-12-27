/**
 * Tests for Storage/Cache functionality
 */

window.log = jest.fn();

const fs = require('fs');
const storageCode = fs.readFileSync('./js/storage.js', 'utf8');

const mockIndexedDB = {
    open: jest.fn(),
    deleteDatabase: jest.fn()
};
global.indexedDB = mockIndexedDB;

const mockLocalStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn()
};
global.localStorage = mockLocalStorage;

function IPTVApp() {
    this.settings = {};
}
eval(storageCode);

describe('Storage Cache Info Tracking', () => {
    let app;
    let mockDB;
    let mockStore;
    let mockTransaction;

    beforeEach(() => {
        app = new IPTVApp();
        app.settings = { playlists: [] };
        mockStore = {
            get: jest.fn(),
            put: jest.fn(),
            delete: jest.fn(),
            clear: jest.fn()
        };
        mockTransaction = {
            objectStore: jest.fn().mockReturnValue(mockStore)
        };
        mockDB = {
            transaction: jest.fn().mockReturnValue(mockTransaction),
            objectStoreNames: { contains: jest.fn().mockReturnValue(true) }
        };
        app._providerCacheDB = mockDB;
    });

    describe('loadProviderCacheLocal', () => {
        it('should add _cacheTimestamp and _cacheSource to returned data', async () => {
            const testTimestamp = Date.now() - 60000;
            const cachedData = {
                vod: { categories: [], streams: [] }
            };
            mockStore.get.mockImplementation(function() {
                const request = {
                    onsuccess: null,
                    onerror: null
                };
                setTimeout(() => {
                    request.onsuccess({
                        target: {
                            result: {
                                timestamp: testTimestamp,
                                data: cachedData
                            }
                        }
                    });
                }, 0);
                return request;
            });
            const result = await app.loadProviderCacheLocal('test-playlist');
            expect(result._cacheTimestamp).toBe(testTimestamp);
            expect(result._cacheSource).toBe('cache');
        });

        it('should return null when cache is not found', async () => {
            mockStore.get.mockImplementation(function() {
                const request = {
                    onsuccess: null,
                    onerror: null
                };
                setTimeout(() => {
                    request.onsuccess({ target: { result: null } });
                }, 0);
                return request;
            });
            const result = await app.loadProviderCacheLocal('test-playlist');
            expect(result).toBeNull();
        });
    });

    describe('loadMergedProviderCache', () => {
        it('should use oldest timestamp from individual caches', async () => {
            const oldTimestamp = Date.now() - 3600000;
            const newTimestamp = Date.now() - 60000;
            app.settings.playlists = [
                { id: 'playlist1' },
                { id: 'playlist2' }
            ];
            let callCount = 0;
            mockStore.get.mockImplementation(function() {
                const request = { onsuccess: null, onerror: null };
                setTimeout(() => {
                    const timestamp = callCount === 0 ? newTimestamp : oldTimestamp;
                    callCount++;
                    request.onsuccess({
                        target: {
                            result: {
                                timestamp: timestamp,
                                data: {
                                    _cacheTimestamp: timestamp,
                                    _cacheSource: 'cache',
                                    vod: { categories: [], streams: [] }
                                }
                            }
                        }
                    });
                }, 0);
                return request;
            });
            const result = await app.loadMergedProviderCache();
            expect(result._cacheTimestamp).toBe(oldTimestamp);
            expect(result._cacheSource).toBe('cache');
        });
    });
});
