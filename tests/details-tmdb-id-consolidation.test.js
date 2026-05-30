/**
 * Regression test for the TMDB description clobber on the details screen, and
 * for the consolidation of TMDB resolution around the tmdb_id across every
 * origin that opens a movie (grid, history/resume, actor filmography).
 *
 * Bug captured 2026-05-31 in remote debug log (stream 203729 "Words of War"):
 *   04.300 DESC displayTMDBDetails → "Anna Politkovskaïa…"   (correct, by-id)
 *   06.042 DESC fetchTMDBInfo     → "Description non disponible"  (clobber)
 *
 * Root cause: the details screen fired a title search (fetchTMDBInfo) AND, in
 * parallel, get_vod_info which yielded the authoritative tmdb_id and re-fetched
 * by id. The two raced; the slower title search overwrote the good description.
 *
 * The repair consolidates around the tmdb_id: get_vod_info resolves the id
 * FIRST, so the description is fetched exactly once, by id, with no race. The
 * provider lookup lives in the shared _loadProviderVodInfo helper, reused by:
 *   - the grid path (_loadSingleStreamBitrate / _showDetailsVod await),
 *   - history/resume and actor filmography (_ensureTmdbIdThen gate),
 * so every origin gets the authoritative id before searching by title.
 */

const fs = require('fs');
const vm = require('vm');

const detailsCode = fs.readFileSync('./js/details.js', 'utf8');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function buildApp() {
    function IPTVApp() {
        this._detailsSession = 1;
        this.fetchTMDBInfoCalls = 0;
        this.fetchByIdCalls = 0;
        this.doShowCalls = 0;
        this.doShowTmdbIdAtCall = null;
        this.getVodInfoCalls = 0;
    }
    IPTVApp.prototype._getApiForPlaylist = function() { return this._api; };
    IPTVApp.prototype._formatBitrate = function(b) { return b ? (b / 1000) + 'Mbps' : ''; };
    IPTVApp.prototype.fetchTMDBInfo = function() { this.fetchTMDBInfoCalls++; };
    IPTVApp.prototype.fetchTMDBDetailsById = function() { this.fetchByIdCalls++; };
    IPTVApp.prototype._doShowDetailsVod = function() {
        this.doShowCalls++;
        this.doShowTmdbIdAtCall = this.selectedStream && this.selectedStream.data
            ? this.selectedStream.data.tmdb_id : null;
    };

    const ctx = vm.createContext({
        IPTVApp: IPTVApp,
        document: document,
        window: { log: function() {} },
    });
    vm.runInContext(slice(detailsCode, '_loadProviderVodInfo'), ctx);
    vm.runInContext(slice(detailsCode, '_loadSingleStreamBitrate'), ctx);
    vm.runInContext(slice(detailsCode, '_applyVodBitrate'), ctx);
    vm.runInContext(slice(detailsCode, '_ensureTmdbIdThen'), ctx);
    vm.runInContext(slice(detailsCode, '_showDetailsVod'), ctx);
    return new IPTVApp();
}

function flush() {
    return new Promise(function(resolve) { setTimeout(resolve, 0); });
}

function apiWithTmdb(id, bitrate) {
    return {
        getVodInfo: function() {
            return Promise.resolve({ info: { tmdb_id: id, bitrate: bitrate || 0 } });
        },
    };
}

beforeEach(() => {
    document.body.innerHTML = '<button id="play-btn">Play</button>';
});

describe('_loadProviderVodInfo — single get_vod_info resolves the tmdb_id, no concurrent TMDB fetch', () => {
    it('resolves to the provider tmdb_id, sets it on the stream, applies the bitrate', async () => {
        const app = buildApp();
        app._api = apiWithTmdb(975615, 5000);
        app.selectedStream = { type: 'vod', data: { stream_id: 203729 } };

        const id = await app._loadProviderVodInfo(app.selectedStream.data);

        expect(id).toBe('975615');
        expect(app.selectedStream.data.tmdb_id).toBe('975615');
        expect(document.querySelector('#play-btn .version-bitrate')).toBeTruthy();
        expect(app.fetchTMDBInfoCalls).toBe(0);
        expect(app.fetchByIdCalls).toBe(0);
    });

    it('returns null when the provider has no get_vod_info (M3U/Jellyfin)', () => {
        const app = buildApp();
        app._api = {};
        app.selectedStream = { type: 'vod', data: { stream_id: 1 } };
        expect(app._loadProviderVodInfo(app.selectedStream.data)).toBe(null);
    });

    it('_loadSingleStreamBitrate exposes the resolution through _vodInfoPromise', async () => {
        const app = buildApp();
        app._api = apiWithTmdb(975615, 5000);
        app.selectedStream = { type: 'vod', data: { stream_id: 203729 } };
        app._loadSingleStreamBitrate(app.selectedStream.data);
        expect(await app._vodInfoPromise).toBe('975615');
    });

    it('_loadSingleStreamBitrate sets _vodInfoPromise to null without provider info', () => {
        const app = buildApp();
        app._api = {};
        app.selectedStream = { type: 'vod', data: { stream_id: 1 } };
        app._loadSingleStreamBitrate(app.selectedStream.data);
        expect(app._vodInfoPromise).toBe(null);
    });
});

describe('_ensureTmdbIdThen — every origin resolves the id before searching by title', () => {
    it('runs the callback immediately when the id is already known, without hitting the provider', () => {
        const app = buildApp();
        let hits = 0;
        app._api = { getVodInfo: function() { hits++; return Promise.resolve({}); } };
        let done = false;
        app._ensureTmdbIdThen({ stream_id: 1, tmdb_id: '555' }, function() { done = true; });
        expect(done).toBe(true);
        expect(hits).toBe(0);
    });

    it('resolves the id via get_vod_info, then runs the callback', async () => {
        const app = buildApp();
        app._api = apiWithTmdb(975615);
        const stream = { stream_id: 203729 };
        app.selectedStream = { type: 'vod', data: stream };
        let doneTmdb = null;
        app._ensureTmdbIdThen(stream, function() { doneTmdb = stream.tmdb_id; });
        await flush();
        expect(doneTmdb).toBe('975615');
    });

    it('falls back to the callback (title search) when the provider cannot resolve an id', () => {
        const app = buildApp();
        app._api = {};
        let done = false;
        app._ensureTmdbIdThen({ stream_id: 1 }, function() { done = true; });
        expect(done).toBe(true);
    });

    it('does not run the callback when the resolution arrives in a stale session', async () => {
        const app = buildApp();
        app._api = apiWithTmdb(975615);
        const stream = { stream_id: 203729 };
        app.selectedStream = { type: 'vod', data: stream };
        let done = false;
        app._ensureTmdbIdThen(stream, function() { done = true; });
        app._detailsSession = 2;
        await flush();
        expect(done).toBe(false);
    });
});

describe('_showDetailsVod — render order: id resolved before the TMDB fetch', () => {
    it('waits for _vodInfoPromise, sets the tmdb_id, THEN renders (no title-search race)', async () => {
        const app = buildApp();
        app._versionInfosPromise = null;
        app._vodInfoPromise = Promise.resolve('975615');
        app.selectedStream = { type: 'vod', data: { stream_id: 203729 } };

        app._showDetailsVod(203729, app.selectedStream.data);
        await app._vodInfoPromise;
        await Promise.resolve();

        expect(app.doShowCalls).toBe(1);
        expect(app.selectedStream.data.tmdb_id).toBe('975615');
        expect(app.doShowTmdbIdAtCall).toBe('975615');
    });

    it('reuses an already-known tmdb_id without waiting (work done by the list)', () => {
        const app = buildApp();
        app._versionInfosPromise = null;
        app._vodInfoPromise = Promise.resolve('999');
        app.selectedStream = { type: 'vod', data: { stream_id: 1, tmdb_id: '555' } };

        app._showDetailsVod(1, app.selectedStream.data);

        expect(app.doShowCalls).toBe(1);
        expect(app.selectedStream.data.tmdb_id).toBe('555');
    });

    it('does not overwrite the new movie when the resolution arrives in a stale session', async () => {
        const app = buildApp();
        app._versionInfosPromise = null;
        app._vodInfoPromise = Promise.resolve('975615');
        app.selectedStream = { type: 'vod', data: { stream_id: 203729 } };

        app._showDetailsVod(203729, app.selectedStream.data);
        app._detailsSession = 2;
        await app._vodInfoPromise;
        await Promise.resolve();

        expect(app.doShowCalls).toBe(0);
    });
});

describe('source — no path triggers a concurrent TMDB fetch, and every origin gates on the id', () => {
    it('_loadProviderVodInfo and _loadSingleStreamBitrate never fetch TMDB themselves', () => {
        const provider = slice(detailsCode, '_loadProviderVodInfo');
        const bitrate = slice(detailsCode, '_loadSingleStreamBitrate');
        [provider, bitrate].forEach(function(body) {
            expect(body).not.toMatch(/fetchTMDBDetailsById/);
            expect(body).not.toMatch(/fetchTMDBInfo/);
            expect(body).not.toMatch(/displayTMDBDetails/);
        });
    });

    it('history (prepareDetailsFromHistory) resolves the id before fetchTMDBInfo', () => {
        const body = slice(detailsCode, 'prepareDetailsFromHistory');
        expect(body).toMatch(/_ensureTmdbIdThen\([\s\S]*?fetchTMDBInfo/);
    });

    it('filmography (showDetailsFromFilmography) resolves the id before fetchTMDBInfo', () => {
        const body = slice(detailsCode, 'showDetailsFromFilmography');
        expect(body).toMatch(/_ensureTmdbIdThen\([\s\S]*?fetchTMDBInfo/);
    });
});
