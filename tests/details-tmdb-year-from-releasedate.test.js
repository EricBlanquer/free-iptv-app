/**
 * Regression: on the details screen, the TMDB lookup must use the provider's
 * declared year (series `releaseDate`) rather than the year parsed from the
 * title. Reported on the Smater Tvpro provider: the series "1923" (title is a
 * bare number) made extractYear() return 1923, so both the 2022 western and the
 * 1988 comedy searched TMDB as "1923 / 1923" and got the same (wrong) poster.
 *
 * Fix: getStreamYear() also reads `releaseDate` (camelCase, the Xtream series
 * field) and `releasedate`, and the details flow passes that year to the TMDB
 * search, overriding the misparsed title year.
 */

const fs = require('fs');
const vm = require('vm');

const detailsCode = fs.readFileSync('./js/details.js', 'utf8');
const regexCode = fs.readFileSync('./js/regex.js', 'utf8');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function buildApp() {
    function IPTVApp() {}
    const ctx = vm.createContext({ IPTVApp: IPTVApp, console: console });
    vm.runInContext(fs.readFileSync('./js/i18n-data.js', 'utf8'), ctx);
    vm.runInContext(regexCode, ctx);
    vm.runInContext('Regex.init && Regex.init();', ctx);
    ['getStreamYear', '_yearFromDate', 'extractYear'].forEach(function(fn) {
        vm.runInContext(slice(detailsCode, fn), ctx);
    });
    return new ctx.IPTVApp();
}

describe('getStreamYear prefers the provider releaseDate over the title number', () => {
    let app;
    beforeAll(() => { app = buildApp(); });

    it('reads camelCase releaseDate (Xtream series field)', () => {
        expect(app.getStreamYear({ releaseDate: '2022-12-18' }, '1923', null)).toBe('2022');
        expect(app.getStreamYear({ releaseDate: '1988-09-04' }, '1923', null)).toBe('1988');
    });

    it('reads lowercase releasedate (episode field)', () => {
        expect(app.getStreamYear({ releasedate: '2022-12-18' }, '1923', null)).toBe('2022');
    });

    it('still reads snake_case release_date (VOD field)', () => {
        expect(app.getStreamYear({ release_date: '2019-05-01' }, 'Whatever', null)).toBe('2019');
    });

    it('does NOT let a bare-number title (1923) override the real year', () => {
        // Western: releaseDate 2022 wins over title "1923"
        expect(app.getStreamYear({ releaseDate: '2022-12-18' }, 'SC| 1923', null)).toBe('2022');
        // Comedy: releaseDate 1988 wins over title "1923"
        expect(app.getStreamYear({ releaseDate: '1988-09-04' }, 'FR| 1923', null)).toBe('1988');
    });

    it('falls back to the title year only when no provider date exists', () => {
        expect(app.getStreamYear({}, 'Movie (2010)', null)).toBe('2010');
        expect(app.getStreamYear(null, 'Movie (2010)', null)).toBe('2010');
    });
});

describe('fetchTMDBCached honours an explicit yearOverride', () => {
    it('uses yearOverride for the cache key instead of the title year', () => {
        function IPTVApp() {}
        const ctx = vm.createContext({ IPTVApp: IPTVApp, console: console });
        vm.runInContext(regexCode, ctx);
        ['fetchTMDBCached', 'extractYear'].forEach(function(fn) {
            vm.runInContext(slice(detailsCode, fn), ctx);
        });
        const app = new ctx.IPTVApp();
        app.tmdbCache = {};
        app.cleanTitle = function(t) { return t; };
        app.getTMDBCacheKey = function(t, y) { return (t + '_' + (y || '')).toLowerCase(); };
        const calls = [];
        ctx.TMDB = {
            searchTV: function(title, year, cb) { calls.push({ title: title, year: year }); cb(null); },
            searchMovie: function(title, year, cb) { calls.push({ title: title, year: year }); cb(null); }
        };
        app.saveTMDBCache = function() {};
        app.trimTMDBResult = function(r) { return r; };

        app.fetchTMDBCached('1923', 'series', function() {}, false, null, '2022');
        expect(calls.length).toBe(1);
        expect(calls[0].year).toBe('2022'); // override, NOT extractYear('1923') === '1923'
    });
});
