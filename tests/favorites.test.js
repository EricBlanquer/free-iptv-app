/**
 * Tests for js/features/favorites.js and favorites-related storage functions
 * Uses eval to load modules - required because source uses global function
 * declarations (not CommonJS), same pattern as tests/storage.test.js
 */

window.log = jest.fn();

const fs = require('fs');
const utilsCode = fs.readFileSync('./js/core/utils.js', 'utf8');
const storageCode = fs.readFileSync('./js/storage.js', 'utf8');
const favoritesCode = fs.readFileSync('./js/features/favorites.js', 'utf8');

const mockLocalStorage = {
    store: {},
    getItem: jest.fn(function(key) { return mockLocalStorage.store[key] || null; }),
    setItem: jest.fn(function(key, value) { mockLocalStorage.store[key] = value; }),
    removeItem: jest.fn(function(key) { delete mockLocalStorage.store[key]; })
};
global.localStorage = mockLocalStorage;

global.I18n = {
    t: jest.fn(function(key, defaultText) { return defaultText; })
};

global.requestAnimationFrame = jest.fn(function(cb) { cb(); });
global.indexedDB = { open: jest.fn(), deleteDatabase: jest.fn() };

function cssUrl(url) {
    if (!url) return '';
    return 'url("' + url.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '")';
}

function IPTVApp() {
    this.settings = {
        proxyEnabled: false,
        proxyUrl: '',
        streamProxy: true,
        activePlaylistId: 'playlist1',
        playlists: []
    };
    this.favorites = [];
    this.watchHistory = [];
    this.currentSection = 'vod';
    this.currentStreamType = 'vod';
    this.focusArea = '';
    this.focusIndex = 0;
    this.currentStreams = [];
    this.favoritesEditMode = false;
    this.movingFavoriteIndex = -1;
    this.gridColumns = 5;
    this.inFilteredFavorites = false;
    this.filteredFavoriteIndices = null;
}
IPTVApp.prototype.updateFocus = jest.fn();
IPTVApp.prototype.updateFavoriteButton = jest.fn();
IPTVApp.prototype.updateFavoritesCounter = jest.fn();
IPTVApp.prototype.updateGridFavoriteIcon = jest.fn();

/* eslint-disable no-eval -- source files are non-CommonJS, eval is the only
   way to load them in tests (same approach as tests/storage.test.js) */
eval(utilsCode);
eval(storageCode);
eval(favoritesCode);
/* eslint-enable no-eval */

describe('isFavorite', () => {
    var app;
    beforeEach(() => {
        app = new IPTVApp();
        app.favorites = [
            { stream_id: 100, name: 'Channel A', _playlistId: 'playlist1' },
            { series_id: 200, name: 'Series B', _playlistId: 'playlist1' },
            { stream_id: 100, name: 'Channel A other', _playlistId: 'playlist2' }
        ];
    });

    it('should find favorite by id and playlistId', () => {
        expect(app.isFavorite(100, 'playlist1')).toBe(true);
    });

    it('should not find favorite with wrong playlistId', () => {
        expect(app.isFavorite(100, 'playlist3')).toBe(false);
    });

    it('should find favorite by series_id', () => {
        expect(app.isFavorite(200, 'playlist1')).toBe(true);
    });

    it('should use activePlaylistId as default', () => {
        app.settings.activePlaylistId = 'playlist1';
        expect(app.isFavorite(100)).toBe(true);
    });

    it('should accept stream object', () => {
        expect(app.isFavorite({ stream_id: 100, _playlistId: 'playlist1' })).toBe(true);
    });

    it('should accept stream object with series_id', () => {
        expect(app.isFavorite({ series_id: 200, _playlistId: 'playlist1' })).toBe(true);
    });

    it('should return false for non-existent id', () => {
        expect(app.isFavorite(999, 'playlist1')).toBe(false);
    });

    it('should use loose equality for id comparison', () => {
        expect(app.isFavorite('100', 'playlist1')).toBe(true);
    });

    it('should distinguish same id on different playlists', () => {
        expect(app.isFavorite(100, 'playlist1')).toBe(true);
        expect(app.isFavorite(100, 'playlist2')).toBe(true);
        expect(app.isFavorite(100, 'playlist3')).toBe(false);
    });
});

describe('toggleFavorite', () => {
    var app;
    beforeEach(() => {
        app = new IPTVApp();
        app.favorites = [];
        app.saveFavorites = jest.fn();
        app.updateFavoriteButton = jest.fn();
        app.updateFavoritesCounter = jest.fn();
        app.updateGridFavoriteIcon = jest.fn();
        app.currentSection = 'vod';
    });

    it('should add a new favorite', () => {
        var stream = { stream_id: 50, name: 'Movie X', cover: 'img.jpg' };
        app.toggleFavorite(stream, 'vod');
        expect(app.favorites).toHaveLength(1);
        expect(app.favorites[0].stream_id).toBe(50);
        expect(app.favorites[0]._type).toBe('vod');
        expect(app.favorites[0]._section).toBe('vod');
        expect(app.favorites[0]._playlistId).toBe('playlist1');
        expect(app.saveFavorites).toHaveBeenCalled();
    });

    it('should remove existing favorite (toggle off)', () => {
        app.favorites = [
            { stream_id: 50, name: 'Movie X', _playlistId: 'playlist1' }
        ];
        var stream = { stream_id: 50, name: 'Movie X' };
        app.toggleFavorite(stream, 'vod');
        expect(app.favorites).toHaveLength(0);
        expect(app.saveFavorites).toHaveBeenCalled();
    });

    it('should not remove favorite from different playlist', () => {
        app.favorites = [
            { stream_id: 50, name: 'Movie X', _playlistId: 'playlist2' }
        ];
        var stream = { stream_id: 50, name: 'Movie X' };
        app.toggleFavorite(stream, 'vod');
        expect(app.favorites).toHaveLength(2);
    });

    it('should use stream._playlistId if provided', () => {
        var stream = { stream_id: 50, name: 'Movie', _playlistId: 'custom' };
        app.toggleFavorite(stream, 'vod');
        expect(app.favorites[0]._playlistId).toBe('custom');
    });

    it('should handle series with series_id', () => {
        var stream = { series_id: 300, name: 'Show Z' };
        app.toggleFavorite(stream, 'series');
        expect(app.favorites).toHaveLength(1);
        expect(app.favorites[0]._type).toBe('series');
    });

    it('should call updateFavoriteButton and updateFavoritesCounter', () => {
        var stream = { stream_id: 1, name: 'X' };
        app.toggleFavorite(stream, 'vod');
        expect(app.updateFavoriteButton).toHaveBeenCalled();
        expect(app.updateFavoritesCounter).toHaveBeenCalled();
    });

    it('should call updateGridFavoriteIcon with correct isFav state', () => {
        var stream = { stream_id: 1, name: 'X' };
        app.toggleFavorite(stream, 'vod');
        expect(app.updateGridFavoriteIcon).toHaveBeenCalledWith(1, true, 'playlist1');
    });
});

describe('moveFavorite', () => {
    var app;
    var container;
    beforeEach(() => {
        app = new IPTVApp();
        app.favoritesEditMode = true;
        app.movingFavoriteIndex = 1;
        app.currentSection = 'favorites';
        app.inFilteredFavorites = false;
        app.favorites = [
            { stream_id: 1, name: 'A' },
            { stream_id: 2, name: 'B' },
            { stream_id: 3, name: 'C' }
        ];
        container = document.createElement('div');
        container.id = 'content-grid';
        app.favorites.forEach(function(f) {
            var el = document.createElement('div');
            el.className = 'grid-item';
            el.textContent = f.name;
            container.appendChild(el);
        });
        document.body.appendChild(container);
        app.gridColumns = 5;
    });
    afterEach(() => {
        document.body.removeChild(container);
    });

    it('should swap favorites when moving right', () => {
        var result = app.moveFavorite('right');
        expect(result).toBe(true);
        expect(app.favorites[1].stream_id).toBe(3);
        expect(app.favorites[2].stream_id).toBe(2);
        expect(app.movingFavoriteIndex).toBe(2);
    });

    it('should swap favorites when moving left', () => {
        var result = app.moveFavorite('left');
        expect(result).toBe(true);
        expect(app.favorites[0].stream_id).toBe(2);
        expect(app.favorites[1].stream_id).toBe(1);
        expect(app.movingFavoriteIndex).toBe(0);
    });

    it('should not move beyond array bounds (left)', () => {
        app.movingFavoriteIndex = 0;
        var result = app.moveFavorite('left');
        expect(result).toBe(false);
    });

    it('should not move beyond array bounds (right)', () => {
        app.movingFavoriteIndex = 2;
        var result = app.moveFavorite('right');
        expect(result).toBe(false);
    });

    it('should return false when not in edit mode', () => {
        app.favoritesEditMode = false;
        expect(app.moveFavorite('right')).toBe(false);
    });

    it('should return false when no item is being moved', () => {
        app.movingFavoriteIndex = -1;
        expect(app.moveFavorite('right')).toBe(false);
    });

    it('should handle filtered favorites with index mapping', () => {
        app.inFilteredFavorites = true;
        app.filteredFavoriteIndices = [0, 2];
        app.favorites = [
            { stream_id: 1, name: 'A' },
            { stream_id: 2, name: 'B' },
            { stream_id: 3, name: 'C' }
        ];
        app.movingFavoriteIndex = 0;
        container.innerHTML = '';
        for (var i = 0; i < 2; i++) {
            var el = document.createElement('div');
            el.className = 'grid-item';
            container.appendChild(el);
        }
        var result = app.moveFavorite('right');
        expect(result).toBe(true);
        expect(app.favorites[0].stream_id).toBe(3);
        expect(app.favorites[2].stream_id).toBe(1);
    });
});

describe('saveFavorites / loadFavorites', () => {
    var app;
    beforeEach(() => {
        app = new IPTVApp();
        localStorage.clear();
    });

    it('should save favorites to localStorage', () => {
        app.favorites = [{ stream_id: 1, name: 'A', _playlistId: 'p1' }];
        app.saveFavorites();
        var stored = JSON.parse(localStorage.getItem('favorites'));
        expect(stored).toEqual([{ stream_id: 1, name: 'A', _playlistId: 'p1' }]);
    });

    it('should load favorites from localStorage', () => {
        var data = [{ stream_id: 1, name: 'A' }];
        localStorage.setItem('favorites', JSON.stringify(data));
        var result = app.loadFavorites();
        expect(result).toEqual(data);
    });

    it('should return empty array when no data', () => {
        var result = app.loadFavorites();
        expect(result).toEqual([]);
    });

    it('should return empty array on parse error', () => {
        localStorage.setItem('favorites', 'invalid json{');
        var result = app.loadFavorites();
        expect(result).toEqual([]);
    });
});

describe('removeFavoriteAtIndex', () => {
    var app;
    var container;
    beforeEach(() => {
        app = new IPTVApp();
        app.saveFavorites = jest.fn();
        app.updateFavoritesCounter = jest.fn();
        app.updateFocus = jest.fn();
        app.favorites = [
            { stream_id: 1, name: 'A' },
            { stream_id: 2, name: 'B' },
            { stream_id: 3, name: 'C' }
        ];
        container = document.createElement('div');
        container.id = 'content-grid';
        app.favorites.forEach(function(f) {
            var el = document.createElement('div');
            el.className = 'grid-item';
            el.textContent = f.name;
            container.appendChild(el);
        });
        document.body.appendChild(container);
    });
    afterEach(() => {
        document.body.removeChild(container);
    });

    it('should remove favorite at given index', () => {
        app.removeFavoriteAtIndex(1);
        expect(app.favorites).toHaveLength(2);
        expect(app.favorites[0].stream_id).toBe(1);
        expect(app.favorites[1].stream_id).toBe(3);
        expect(app.saveFavorites).toHaveBeenCalled();
    });

    it('should remove DOM element', () => {
        app.removeFavoriteAtIndex(0);
        var items = container.querySelectorAll('.grid-item');
        expect(items).toHaveLength(2);
    });

    it('should show empty message when all removed', () => {
        app.removeFavoriteAtIndex(0);
        app.removeFavoriteAtIndex(0);
        app.removeFavoriteAtIndex(0);
        expect(container.innerHTML).toContain('empty-message');
    });

    it('should adjust focusIndex if at or beyond end', () => {
        app.focusIndex = 2;
        app.removeFavoriteAtIndex(2);
        expect(app.focusIndex).toBe(1);
    });

    it('should do nothing for out-of-range index', () => {
        app.removeFavoriteAtIndex(-1);
        expect(app.favorites).toHaveLength(3);
        app.removeFavoriteAtIndex(10);
        expect(app.favorites).toHaveLength(3);
    });
});
