/**
 * Tests for js/features/history.js and history-related storage functions
 * Uses eval to load modules - required because source uses global function
 * declarations (not CommonJS), same pattern as tests/storage.test.js
 */

window.log = jest.fn();

const fs = require('fs');
const utilsCode = fs.readFileSync('./js/core/utils.js', 'utf8');
const historyCode = fs.readFileSync('./js/features/history.js', 'utf8');

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
        minProgressMinutes: 2,
        watchedThreshold: 90
    };
    this.watchHistory = [];
    this.tmdbInfo = null;
    this.focusArea = '';
    this.focusIndex = 0;
}
IPTVApp.prototype.updateFocus = jest.fn();
IPTVApp.prototype.saveWatchHistory = jest.fn(function() {
    mockLocalStorage.setItem('watchHistory', JSON.stringify(this.watchHistory));
});
IPTVApp.prototype.showHistoryScreen = jest.fn();

// Load modules (non-CommonJS source files, same approach as tests/storage.test.js)
eval(utilsCode); // eslint-disable-line no-eval
eval(historyCode); // eslint-disable-line no-eval

describe('addToWatchHistory', () => {
    var app;
    beforeEach(() => {
        app = new IPTVApp();
        app.watchHistory = [];
        app.saveWatchHistory = jest.fn();
        app.tmdbInfo = null;
    });

    it('should add a VOD item to history', () => {
        var stream = { stream_id: 101, name: 'Movie A', cover: 'cover.jpg' };
        app.addToWatchHistory(stream, 'vod', 5000);
        expect(app.watchHistory).toHaveLength(1);
        expect(app.watchHistory[0].id).toBe(101);
        expect(app.watchHistory[0].name).toBe('Movie A');
        expect(app.watchHistory[0].type).toBe('vod');
        expect(app.watchHistory[0].position).toBe(5000);
        expect(app.watchHistory[0].playlistId).toBe('playlist1');
        expect(app.saveWatchHistory).toHaveBeenCalled();
    });

    it('should add item at the beginning (most recent first)', () => {
        app.watchHistory = [{ id: 1, name: 'Old', type: 'vod', playlistId: 'playlist1', date: 1000 }];
        var stream = { stream_id: 2, name: 'New', cover: '' };
        app.addToWatchHistory(stream, 'vod', 0);
        expect(app.watchHistory[0].id).toBe(2);
        expect(app.watchHistory[1].id).toBe(1);
    });

    it('should remove duplicate entry before adding (same id + playlistId)', () => {
        app.watchHistory = [
            { id: 101, name: 'Movie A', type: 'vod', playlistId: 'playlist1', date: 1000 },
            { id: 102, name: 'Movie B', type: 'vod', playlistId: 'playlist1', date: 900 }
        ];
        var stream = { stream_id: 101, name: 'Movie A Updated', cover: '' };
        app.addToWatchHistory(stream, 'vod', 30000);
        expect(app.watchHistory).toHaveLength(2);
        expect(app.watchHistory[0].id).toBe(101);
        expect(app.watchHistory[0].name).toBe('Movie A Updated');
        expect(app.watchHistory[0].position).toBe(30000);
    });

    it('should not remove duplicate from different playlist', () => {
        app.watchHistory = [
            { id: 101, name: 'Movie A', type: 'vod', playlistId: 'playlist2', date: 1000 }
        ];
        var stream = { stream_id: 101, name: 'Movie A', cover: '' };
        app.addToWatchHistory(stream, 'vod', 0);
        expect(app.watchHistory).toHaveLength(2);
    });

    it('should skip adult content', () => {
        var stream = { stream_id: 999, name: 'Bad', genre: 'Adult Movies', cover: '' };
        app.addToWatchHistory(stream, 'vod', 0);
        expect(app.watchHistory).toHaveLength(0);
        expect(app.saveWatchHistory).not.toHaveBeenCalled();
    });

    it('should detect adult in category_name', () => {
        var stream = { stream_id: 999, name: 'Bad', category_name: 'XXX Adult', cover: '' };
        app.addToWatchHistory(stream, 'vod', 0);
        expect(app.watchHistory).toHaveLength(0);
    });

    it('should include TMDB info when available', () => {
        app.tmdbInfo = { id: 12345, _type: 'movie' };
        var stream = { stream_id: 50, name: 'Film', cover: '' };
        app.addToWatchHistory(stream, 'vod', 0);
        expect(app.watchHistory[0].tmdbId).toBe(12345);
        expect(app.watchHistory[0].tmdbType).toBe('movie');
    });

    it('should default tmdbType for series', () => {
        app.tmdbInfo = { id: 999 };
        var stream = { stream_id: 50, name: 'Show', cover: '' };
        app.addToWatchHistory(stream, 'series', 0);
        expect(app.watchHistory[0].tmdbType).toBe('tv');
    });

    it('should include series fields for series type', () => {
        var stream = {
            stream_id: 10,
            series_id: 5,
            name: 'Episode 1',
            cover: 'img.jpg',
            season: 2,
            episode: 3,
            episodeTitle: 'The One'
        };
        app.addToWatchHistory(stream, 'series', 1000);
        var item = app.watchHistory[0];
        expect(item.seriesId).toBe(5);
        expect(item.episodeId).toBe(10);
        expect(item.season).toBe(2);
        expect(item.episode).toBe(3);
        expect(item.episodeTitle).toBe('The One');
    });

    it('should use stream._playlistId over activePlaylistId', () => {
        var stream = { stream_id: 1, name: 'X', cover: '', _playlistId: 'customPlaylist' };
        app.addToWatchHistory(stream, 'vod', 0);
        expect(app.watchHistory[0].playlistId).toBe('customPlaylist');
    });

    it('should default position to 0', () => {
        var stream = { stream_id: 1, name: 'X', cover: '' };
        app.addToWatchHistory(stream, 'vod');
        expect(app.watchHistory[0].position).toBe(0);
    });
});

describe('removeFromWatchHistory', () => {
    var app;
    beforeEach(() => {
        app = new IPTVApp();
        app.saveWatchHistory = jest.fn();
        app.showHistoryScreen = jest.fn();
        app.watchHistory = [
            { id: 1, name: 'A', playlistId: 'p1' },
            { id: 2, name: 'B', playlistId: 'p1' },
            { id: 1, name: 'A2', playlistId: 'p2' }
        ];
    });

    it('should remove item by id and playlistId', () => {
        app.removeFromWatchHistory(1, 'p1');
        expect(app.watchHistory).toHaveLength(2);
        expect(app.watchHistory.find(function(i) { return i.id === 1 && i.playlistId === 'p1'; })).toBeUndefined();
        expect(app.watchHistory.find(function(i) { return i.id === 1 && i.playlistId === 'p2'; })).toBeDefined();
    });

    it('should remove all items with given id when no playlistId', () => {
        app.removeFromWatchHistory(1);
        expect(app.watchHistory).toHaveLength(1);
        expect(app.watchHistory[0].id).toBe(2);
    });

    it('should call saveWatchHistory and showHistoryScreen', () => {
        app.removeFromWatchHistory(2, 'p1');
        expect(app.saveWatchHistory).toHaveBeenCalled();
        expect(app.showHistoryScreen).toHaveBeenCalled();
    });
});

describe('updateWatchHistoryTmdbId', () => {
    var app;
    beforeEach(() => {
        app = new IPTVApp();
        app.saveWatchHistory = jest.fn();
        app.watchHistory = [
            { id: 10, playlistId: 'p1', name: 'Movie' }
        ];
        app.selectedStream = { id: 10, _playlistId: 'p1' };
        app.tmdbInfo = { id: 55555, _type: 'movie' };
    });

    it('should update tmdbId on matching history item', () => {
        app.updateWatchHistoryTmdbId();
        expect(app.watchHistory[0].tmdbId).toBe(55555);
        expect(app.watchHistory[0].tmdbType).toBe('movie');
        expect(app.saveWatchHistory).toHaveBeenCalled();
    });

    it('should not save if tmdbId already matches', () => {
        app.watchHistory[0].tmdbId = 55555;
        app.updateWatchHistoryTmdbId();
        expect(app.saveWatchHistory).not.toHaveBeenCalled();
    });

    it('should do nothing if tmdbInfo is null', () => {
        app.tmdbInfo = null;
        app.updateWatchHistoryTmdbId();
        expect(app.saveWatchHistory).not.toHaveBeenCalled();
    });

    it('should do nothing if selectedStream is null', () => {
        app.selectedStream = null;
        app.updateWatchHistoryTmdbId();
        expect(app.saveWatchHistory).not.toHaveBeenCalled();
    });
});
