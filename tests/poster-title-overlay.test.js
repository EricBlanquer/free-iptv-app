/**
 * Regression test for js/browse.js _loadSingleImage.
 *
 * Bug: in a VOD section with TMDB enabled, the provider image and the TMDB
 * fallback load in parallel. When the TMDB poster arrives first (fast) it sets
 * the background and clears `no-image`, but 8s later the slow provider image
 * times out and the timeout handler used to unconditionally re-add `no-image`
 * and set loaded='error'. Result: a fully-loaded TMDB poster with the title
 * text overlaid on top of it (the `no-image` placeholder state).
 *
 * The fix guards the timeout AND onerror handlers so they never clobber a div
 * that already shows a valid image (loaded === 'ok' or 'tmdb').
 */

global.IPTVApp = function() {};
global.cssUrl = function(url) { return 'url("' + url + '")'; };
window.log = jest.fn();

global.TMDB = {
    isEnabled: function() { return true; },
    getGenres: function() { return []; }
};

global.Regex = {
    escape: function(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); },
    titleCase: /\b\w/g
};

require('../js/browse.js');

describe('Poster title overlay (browse._loadSingleImage)', () => {
    let app;
    let createdImages;
    let RealImage;

    beforeEach(() => {
        jest.useFakeTimers();
        window.log.mockClear();

        createdImages = [];
        RealImage = global.Image;
        global.Image = function() {
            this.naturalWidth = 0;
            this.naturalHeight = 0;
            this.onload = null;
            this.onerror = null;
            this._src = '';
            Object.defineProperty(this, 'src', {
                set: function(v) { this._src = v; },
                get: function() { return this._src; }
            });
            createdImages.push(this);
        };

        app = new IPTVApp();
        app._imageQueueId = 1;
        app.currentSection = 'vod';
        app.currentStreams = [];
        app.optimizeTmdbImageUrl = function(url) { return url; };
        app.proxyImageUrl = function(url) { return url; };
        // No matching stream -> tryTmdb goes straight to doFetch(null)
        app._getStreamById = function() { return null; };
    });

    afterEach(() => {
        global.Image = RealImage;
        jest.useRealTimers();
    });

    function makeDiv() {
        var div = document.createElement('div');
        div.className = 'grid-item-image';
        return div;
    }

    function makeGridItem() {
        var item = document.createElement('div');
        item.className = 'grid-item';
        item.dataset.streamTitle = 'Some Movie';
        item.dataset.streamType = 'movie';
        item.dataset.streamId = '951395';
        return item;
    }

    it('keeps the TMDB poster (no title overlay) when the provider image times out afterwards', () => {
        var div = makeDiv();
        var gridItem = makeGridItem();

        // TMDB returns a poster immediately (synchronous callback)
        app.fetchTMDBCached = function(title, type, cb) {
            cb({ poster_path: '/abc.jpg' });
        };

        app._loadSingleImage(div, 'http://covers-f.ddns.me/x.jpg', 7, gridItem, 1, function() {});

        // TMDB poster is in place
        expect(div.dataset.loaded).toBe('tmdb');
        expect(div.classList.contains('no-image')).toBe(false);
        expect(div.style.backgroundImage).toContain('abc.jpg');

        // Provider image never loads -> timeout fires after 8s
        jest.advanceTimersByTime(8000);

        // Regression: the timeout must NOT re-add the placeholder over the poster
        expect(div.classList.contains('no-image')).toBe(false);
        expect(div.dataset.loaded).toBe('tmdb');
        expect(div.style.backgroundImage).toContain('abc.jpg');
    });

    it('keeps the TMDB poster when the provider image errors afterwards', () => {
        var div = makeDiv();
        var gridItem = makeGridItem();

        app.fetchTMDBCached = function(title, type, cb) {
            cb({ poster_path: '/def.jpg' });
        };

        app._loadSingleImage(div, 'http://covers-f.ddns.me/y.jpg', 8, gridItem, 1, function() {});

        expect(div.dataset.loaded).toBe('tmdb');

        // Simulate the provider image firing a late error
        var providerImg = createdImages[createdImages.length - 1];
        providerImg.onerror();

        expect(div.classList.contains('no-image')).toBe(false);
        expect(div.dataset.loaded).toBe('tmdb');
        expect(div.style.backgroundImage).toContain('def.jpg');
    });

    it('still shows the placeholder when neither provider nor TMDB has an image', () => {
        var div = makeDiv();
        var gridItem = makeGridItem();

        app.fetchTMDBCached = function(title, type, cb) {
            cb(null);
        };

        app._loadSingleImage(div, 'http://covers-f.ddns.me/z.jpg', 9, gridItem, 1, function() {});

        jest.advanceTimersByTime(8000);

        expect(div.classList.contains('no-image')).toBe(true);
        expect(div.dataset.loaded).toBe('error');
    });
});

/**
 * Regression test for js/browse.js loadVisibleGenres.
 *
 * Bug: loadVisibleGenres only applied the TMDB poster when the image div already
 * had the `no-image` class. That class is only added 8s later, when the provider
 * image times out. If loadVisibleGenres ran while the provider image was still in
 * the 'loading' state, the poster was skipped BUT genreLoaded was burned to
 * 'done', so the item was never retried and stayed poster-less forever (e.g.
 * "Mother Mary" with a dead cover provider but a valid TMDB poster).
 *
 * The fix applies the TMDB poster whenever the provider image has not succeeded
 * (loadState is not 'ok'/'local'/'tmdb'), winning the race even during 'loading'.
 */
describe('Poster fallback during loading (browse.loadVisibleGenres)', () => {
    let app;

    beforeEach(() => {
        window.log.mockClear();
        document.body.innerHTML = '';

        app = new IPTVApp();
        app.currentSection = 'vod';
        app.currentStreams = [];
        app.getStreamId = function(s) { return s.stream_id; };
        app._getVisibleItemRange = function(items) {
            return { startIdx: 0, endIdx: items.length, cols: 6, visibleRows: 3 };
        };
        app.titleSimilarity = function() { return 0; };
    });

    function buildGrid(loadState) {
        var grid = document.createElement('div');
        grid.id = 'content-grid';
        var item = document.createElement('div');
        item.className = 'grid-item';
        item.dataset.streamTitle = 'Mother Mary';
        item.dataset.streamType = 'movie';
        item.dataset.streamId = '951300';
        var img = document.createElement('div');
        img.className = 'grid-item-image';
        if (loadState) img.dataset.loaded = loadState;
        item.appendChild(img);
        grid.appendChild(item);
        document.body.appendChild(grid);
        return img;
    }

    it('applies the TMDB poster while the provider image is still loading', () => {
        var img = buildGrid('loading');

        app.fetchTMDBCached = function(title, type, cb) {
            cb({ poster_path: '/uaCJhncUYYXFlG253BEPAzog3hl.jpg', title: 'Mother Mary' });
        };

        app.loadVisibleGenres();

        expect(img.dataset.loaded).toBe('tmdb');
        expect(img.classList.contains('no-image')).toBe(false);
        expect(img.style.backgroundImage).toContain('uaCJhncUYYXFlG253BEPAzog3hl.jpg');
    });

    it('does not overwrite a provider image that already succeeded', () => {
        var img = buildGrid('ok');
        img.style.backgroundImage = 'url("http://provider/poster.jpg")';

        app.fetchTMDBCached = function(title, type, cb) {
            cb({ poster_path: '/tmdb.jpg', title: 'Mother Mary' });
        };

        app.loadVisibleGenres();

        expect(img.dataset.loaded).toBe('ok');
        expect(img.style.backgroundImage).toContain('provider/poster.jpg');
    });
});
