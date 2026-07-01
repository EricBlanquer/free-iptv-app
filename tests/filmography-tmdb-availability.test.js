/**
 * Regression test for opening a TMDB card from an actor filmography.
 *
 * Reported with Eric McCormack -> Love, Again:
 * direct provider item opens stream 238932, but the same TMDB movie opened from
 * the actor filmography was marked unavailable. The provider title includes a
 * suffix ("MULTI"), so title-only matching misses even though the TMDB id is
 * present on both sides.
 */

const fs = require('fs');
const vm = require('vm');

const detailsCode = fs.readFileSync('./js/details.js', 'utf8');
const browseCode = fs.readFileSync('./js/browse.js', 'utf8');
const regexCode = fs.readFileSync('./js/regex.js', 'utf8');
const utilsCode = fs.readFileSync('./js/core/utils.js', 'utf8');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function buildApp(streams) {
    function IPTVApp() {
        this._streams = streams;
    }
    IPTVApp.prototype.getStreams = function(section) {
        return section === 'vod' ? this._streams : [];
    };
    const ctx = vm.createContext({ IPTVApp: IPTVApp });
    vm.runInContext(regexCode, ctx);
    vm.runInContext(slice(utilsCode, '_normalizeTitleForMatch'), ctx);
    vm.runInContext(slice(browseCode, 'stripCategoryPrefix'), ctx);
    vm.runInContext(slice(detailsCode, 'cleanTitle'), ctx);
    vm.runInContext(slice(detailsCode, '_searchInStreams'), ctx);
    vm.runInContext(slice(detailsCode, '_searchInStreamsByTmdb'), ctx);
    vm.runInContext(slice(detailsCode, 'findInPlaylist'), ctx);
    return new ctx.IPTVApp();
}

describe('filmography TMDB card availability', () => {
    it('matches provider streams by TMDB id before title fallback', () => {
        const app = buildApp([
            {
                stream_id: 238932,
                name: 'Love, Again (2026) MULTI ',
                tmdb: '1653453',
            },
        ]);

        const match = app.findInPlaylist('Love, Again', 'movie', '1653453');

        expect(match).not.toBeNull();
        expect(match.id).toBe(238932);
        expect(match.type).toBe('vod');
    });

    it('keeps title fallback working when no TMDB id is available', () => {
        const app = buildApp([
            {
                stream_id: 42,
                name: 'Some Film (2026)',
            },
        ]);

        const match = app.findInPlaylist('Some Film', 'movie', null);

        expect(match).not.toBeNull();
        expect(match.id).toBe(42);
    });

    it('title fallback strips provider quality/version suffixes before scoring', () => {
        const app = buildApp([
            {
                stream_id: 238932,
                name: 'Love, Again (2026) MULTI ',
            },
        ]);

        const match = app.findInPlaylist('Love, Again', 'movie', null);

        expect(match).not.toBeNull();
        expect(match.id).toBe(238932);
    });
});

describe('source wiring for TMDB-card availability', () => {
    it('showDetailsFromTMDB passes the card TMDB id into provider matching', () => {
        const body = slice(detailsCode, 'showDetailsFromTMDB');
        expect(body).toMatch(/findInPlaylist\(\s*title\s*,\s*tmdbType\s*,\s*tmdbId\s*\)/);
    });

    it('_checkTmdbCardsAvailability passes each card TMDB id into provider matching', () => {
        const body = slice(detailsCode, '_checkTmdbCardsAvailability');
        expect(body).toMatch(/findInPlaylist\(\s*title\s*,\s*mediaType\s*,\s*tmdbId\s*\)/);
    });
});
