/**
 * Tests for js/core/utils.js
 * Uses eval to load the module (same pattern as existing tests in this project)
 */

window.log = jest.fn();

const fs = require('fs');
const utilsCode = fs.readFileSync('./js/core/utils.js', 'utf8');

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
    this.settings = { proxyEnabled: false, proxyUrl: '', streamProxy: true, activePlaylistId: 'p1' };
    this.focusArea = '';
    this.focusIndex = 0;
}
IPTVApp.prototype.updateFocus = jest.fn();

// Load module via eval (same pattern as tests/storage.test.js)
eval(utilsCode);

describe('proxyDuidParam', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('should return empty string when no deviceId', () => {
        expect(proxyDuidParam()).toBe('');
    });

    it('should return encoded duid param when deviceId exists', () => {
        localStorage.setItem('deviceId', 'abc-123');
        expect(proxyDuidParam()).toBe('&duid=abc-123');
    });

    it('should encode special characters in deviceId', () => {
        localStorage.setItem('deviceId', 'id with spaces&stuff');
        expect(proxyDuidParam()).toBe('&duid=id%20with%20spaces%26stuff');
    });
});

describe('formatMs', () => {
    it('should return 0s for zero or negative', () => {
        expect(formatMs(0)).toBe('0s');
        expect(formatMs(-100)).toBe('0s');
    });

    it('should format milliseconds only', () => {
        expect(formatMs(500)).toBe('500ms');
    });

    it('should format seconds with remaining ms', () => {
        expect(formatMs(1500)).toBe('1s500ms');
    });

    it('should format exact seconds without ms', () => {
        expect(formatMs(3000)).toBe('3s');
    });

    it('should format minutes and seconds', () => {
        expect(formatMs(90000)).toBe('1m30s');
    });

    it('should format hours, minutes and seconds', () => {
        expect(formatMs(3661000)).toBe('1h1m1s');
    });

    it('should omit zero sub-units', () => {
        expect(formatMs(3600000)).toBe('1h');
        expect(formatMs(60000)).toBe('1m');
    });
});

describe('formatTimeAgo', () => {
    it('should return empty for falsy timestamp', () => {
        expect(formatTimeAgo(0)).toBe('');
        expect(formatTimeAgo(null)).toBe('');
        expect(formatTimeAgo(undefined)).toBe('');
    });

    it('should return "now" for recent timestamps', () => {
        expect(formatTimeAgo(Date.now())).toBe('now');
    });

    it('should return minute-based text', () => {
        expect(formatTimeAgo(Date.now() - 60000)).toBe('1 min ago');
        expect(formatTimeAgo(Date.now() - 300000)).toBe('5 min ago');
    });

    it('should return hour-based text', () => {
        expect(formatTimeAgo(Date.now() - 3600000)).toBe('1 hour ago');
        expect(formatTimeAgo(Date.now() - 7200000)).toBe('2 hours ago');
    });

    it('should return day-based text', () => {
        expect(formatTimeAgo(Date.now() - 86400000)).toBe('1 day ago');
        expect(formatTimeAgo(Date.now() - 86400000 * 5)).toBe('5 days ago');
    });

    it('should return month-based text', () => {
        expect(formatTimeAgo(Date.now() - 86400000 * 31)).toBe('1 month ago');
        expect(formatTimeAgo(Date.now() - 86400000 * 90)).toBe('3 months ago');
    });
});

describe('IPTVApp.prototype.showEmptyMessage', () => {
    it('should set innerHTML with empty-message div using string container', () => {
        var container = document.createElement('div');
        container.id = 'test-container';
        document.body.appendChild(container);
        var app = new IPTVApp();
        app.showEmptyMessage('test-container', 'some.key', 'No items found');
        expect(container.innerHTML).toBe('<div class="empty-message">No items found</div>');
        document.body.removeChild(container);
    });

    it('should work with DOM element directly', () => {
        var container = document.createElement('div');
        var app = new IPTVApp();
        app.showEmptyMessage(container, 'key', 'Empty');
        expect(container.innerHTML).toBe('<div class="empty-message">Empty</div>');
    });
});

describe('IPTVApp.prototype.getStreamId', () => {
    var app;
    beforeEach(() => { app = new IPTVApp(); });

    it('should return null for falsy stream', () => {
        expect(app.getStreamId(null)).toBeNull();
        expect(app.getStreamId(undefined)).toBeNull();
    });

    it('should prefer stream_id', () => {
        expect(app.getStreamId({ stream_id: 10, series_id: 20, vod_id: 30, id: 40 })).toBe(10);
    });

    it('should fallback to series_id', () => {
        expect(app.getStreamId({ series_id: 20, vod_id: 30, id: 40 })).toBe(20);
    });

    it('should fallback to vod_id', () => {
        expect(app.getStreamId({ vod_id: 30, id: 40 })).toBe(30);
    });

    it('should fallback to id', () => {
        expect(app.getStreamId({ id: 40 })).toBe(40);
    });
});

describe('IPTVApp.prototype.findByStreamId', () => {
    var app;
    beforeEach(() => { app = new IPTVApp(); });

    it('should return null for null array', () => {
        expect(app.findByStreamId(null, 1)).toBeNull();
    });

    it('should find stream by stream_id', () => {
        var streams = [{ stream_id: 1, name: 'A' }, { stream_id: 2, name: 'B' }];
        expect(app.findByStreamId(streams, 2)).toEqual({ stream_id: 2, name: 'B' });
    });

    it('should find stream by series_id', () => {
        var streams = [{ series_id: 100, name: 'S1' }];
        expect(app.findByStreamId(streams, 100)).toEqual({ series_id: 100, name: 'S1' });
    });

    it('should match with string/number coercion', () => {
        var streams = [{ stream_id: 42, name: 'X' }];
        expect(app.findByStreamId(streams, '42')).toEqual({ stream_id: 42, name: 'X' });
    });

    it('should return null when not found', () => {
        var streams = [{ stream_id: 1 }];
        expect(app.findByStreamId(streams, 999)).toBeNull();
    });
});

describe('IPTVApp.prototype.sameId', () => {
    var app;
    beforeEach(() => { app = new IPTVApp(); });

    it('should match same types', () => {
        expect(app.sameId(1, 1)).toBe(true);
        expect(app.sameId('a', 'a')).toBe(true);
    });

    it('should match number and string of same value', () => {
        expect(app.sameId(42, '42')).toBe(true);
    });

    it('should not match different values', () => {
        expect(app.sameId(1, 2)).toBe(false);
    });
});

describe('IPTVApp.prototype.getStreamProxyUrl', () => {
    var app;
    beforeEach(() => {
        app = new IPTVApp();
        app.settings = { proxyEnabled: true, proxyUrl: 'http://proxy:8080', streamProxy: true };
    });

    it('should return proxy URL when all conditions met', () => {
        expect(app.getStreamProxyUrl()).toBe('http://proxy:8080');
    });

    it('should return empty when proxy disabled', () => {
        app.settings.proxyEnabled = false;
        expect(app.getStreamProxyUrl()).toBe('');
    });

    it('should return empty when no proxy URL', () => {
        app.settings.proxyUrl = '';
        expect(app.getStreamProxyUrl()).toBe('');
    });

    it('should return empty when streamProxy is false', () => {
        app.settings.streamProxy = false;
        expect(app.getStreamProxyUrl()).toBe('');
    });
});

describe('IPTVApp.prototype.proxyImageUrl', () => {
    var app;
    beforeEach(() => {
        app = new IPTVApp();
        app.settings = { proxyEnabled: true, proxyUrl: 'http://proxy:8080/', streamProxy: true };
        localStorage.clear();
    });

    it('should return original URL when no proxy configured', () => {
        app.settings.proxyEnabled = false;
        expect(app.proxyImageUrl('http://example.com/img.jpg')).toBe('http://example.com/img.jpg');
    });

    it('should return original URL for falsy input', () => {
        expect(app.proxyImageUrl('')).toBe('');
        expect(app.proxyImageUrl(null)).toBeNull();
    });

    it('should not proxy tmdb.org URLs', () => {
        expect(app.proxyImageUrl('http://image.tmdb.org/t/p/w500/abc.jpg')).toBe('http://image.tmdb.org/t/p/w500/abc.jpg');
    });

    it('should proxy non-tmdb URLs through proxy', () => {
        var result = app.proxyImageUrl('http://example.com/img.jpg');
        expect(result).toBe('http://proxy:8080/image?url=http%3A%2F%2Fexample.com%2Fimg.jpg');
    });
});

describe('IPTVApp.prototype.optimizeTmdbImageUrl', () => {
    var app;
    beforeEach(() => { app = new IPTVApp(); });

    it('should return original URL for non-tmdb URLs', () => {
        expect(app.optimizeTmdbImageUrl('http://other.com/img.jpg')).toBe('http://other.com/img.jpg');
    });

    it('should replace size in tmdb URL', () => {
        var url = 'http://image.tmdb.org/t/p/original/abc.jpg';
        expect(app.optimizeTmdbImageUrl(url, 'w185')).toBe('http://image.tmdb.org/t/p/w185/abc.jpg');
    });

    it('should use w300 as default size', () => {
        var url = 'http://image.tmdb.org/t/p/w500/abc.jpg';
        expect(app.optimizeTmdbImageUrl(url)).toBe('http://image.tmdb.org/t/p/w300/abc.jpg');
    });

    it('should return falsy URL as-is', () => {
        expect(app.optimizeTmdbImageUrl('')).toBe('');
        expect(app.optimizeTmdbImageUrl(null)).toBeNull();
    });
});

describe('IPTVApp.prototype.ratingToStars', () => {
    var app;
    beforeEach(() => { app = new IPTVApp(); });

    it('should convert 10 to 5 stars', () => {
        expect(app.ratingToStars(10)).toBe(5);
    });

    it('should convert 0 or falsy to 0 stars', () => {
        expect(app.ratingToStars(0)).toBe(0);
        expect(app.ratingToStars(null)).toBe(0);
        expect(app.ratingToStars(undefined)).toBe(0);
    });

    it('should round correctly', () => {
        expect(app.ratingToStars(7)).toBe(4);
        expect(app.ratingToStars(3)).toBe(2);
    });
});

describe('IPTVApp.prototype.getStreamTitle', () => {
    var app;
    beforeEach(() => { app = new IPTVApp(); });

    it('should return name if present', () => {
        expect(app.getStreamTitle({ name: 'Test', title: 'Other' })).toBe('Test');
    });

    it('should fallback to title', () => {
        expect(app.getStreamTitle({ title: 'Fallback' })).toBe('Fallback');
    });

    it('should return empty for null stream', () => {
        expect(app.getStreamTitle(null)).toBe('');
    });
});

describe('IPTVApp.prototype.parseDelimitedList', () => {
    var app;
    beforeEach(() => { app = new IPTVApp(); });

    it('should split by comma by default', () => {
        expect(app.parseDelimitedList('a, b, c')).toEqual(['a', 'b', 'c']);
    });

    it('should use custom delimiter', () => {
        expect(app.parseDelimitedList('a|b|c', '|')).toEqual(['a', 'b', 'c']);
    });

    it('should filter empty items', () => {
        expect(app.parseDelimitedList('a,,b, ,c')).toEqual(['a', 'b', 'c']);
    });

    it('should return empty array for falsy input', () => {
        expect(app.parseDelimitedList('')).toEqual([]);
        expect(app.parseDelimitedList(null)).toEqual([]);
        expect(app.parseDelimitedList(undefined)).toEqual([]);
    });
});

describe('IPTVApp.prototype.formatTime', () => {
    var app;
    beforeEach(() => { app = new IPTVApp(); });

    it('should pad hours and minutes', () => {
        expect(app.formatTime(8, 5)).toBe('08h05');
    });

    it('should not pad double-digit values', () => {
        expect(app.formatTime(14, 30)).toBe('14h30');
    });
});

describe('IPTVApp.prototype.formatTimeColon', () => {
    var app;
    beforeEach(() => { app = new IPTVApp(); });

    it('should format with colon separator', () => {
        expect(app.formatTimeColon(8, 5)).toBe('08:05');
        expect(app.formatTimeColon(14, 30)).toBe('14:30');
    });
});

describe('IPTVApp.prototype.padZero', () => {
    var app;
    beforeEach(() => { app = new IPTVApp(); });

    it('should pad to 2 digits by default', () => {
        expect(app.padZero(5)).toBe('05');
        expect(app.padZero(12)).toBe('12');
    });

    it('should pad to custom length', () => {
        expect(app.padZero(5, 4)).toBe('0005');
    });
});

describe('IPTVApp.prototype.renderStarRating', () => {
    var app;
    beforeEach(() => { app = new IPTVApp(); });

    it('should render full stars and empty stars', () => {
        var html = app.renderStarRating(6);
        expect(html).toContain('\u2605\u2605\u2605');
        expect(html).toContain('<span class="empty-stars">\u2606\u2606</span>');
    });

    it('should render all empty for rating 0', () => {
        var html = app.renderStarRating(0);
        expect(html).toContain('\u2606\u2606\u2606\u2606\u2606');
    });

    it('should render all full for rating 10', () => {
        var html = app.renderStarRating(10);
        expect(html).toBe('\u2605\u2605\u2605\u2605\u2605');
    });
});

describe('IPTVApp.prototype.saveFocusIndex / restoreFocusIndex', () => {
    var app;
    beforeEach(() => {
        app = new IPTVApp();
        app.focusIndex = 5;
    });

    it('should save and restore focus index for an area', () => {
        app.saveFocusIndex('grid');
        app.focusIndex = 0;
        app.restoreFocusIndex('grid');
        expect(app.focusIndex).toBe(5);
    });

    it('should use default index when no saved value', () => {
        app.restoreFocusIndex('sidebar', 3);
        expect(app.focusIndex).toBe(3);
    });

    it('should use 0 when no saved value and no default', () => {
        app.restoreFocusIndex('categories');
        expect(app.focusIndex).toBe(0);
    });
});

describe('IPTVApp.prototype.clearTimer', () => {
    var app;
    beforeEach(() => {
        app = new IPTVApp();
        jest.useFakeTimers();
    });
    afterEach(() => { jest.useRealTimers(); });

    it('should clear and null the timer', () => {
        app.myTimer = setTimeout(() => {}, 1000);
        app.clearTimer('myTimer');
        expect(app.myTimer).toBeNull();
    });

    it('should do nothing if timer is null', () => {
        app.myTimer = null;
        app.clearTimer('myTimer');
        expect(app.myTimer).toBeNull();
    });
});
