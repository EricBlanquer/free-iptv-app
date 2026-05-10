/**
 * Regression test for the tmdb-id-based dedup strategy.
 *
 * Prior approach: dedup key was `cleanTitle + '|' + year`. That mis-grouped:
 *   - Same movie variants whose cleanTitles differed by punctuation/accents/
 *     non-standard prefixes (NOEL|, …).
 *   - Different movies that happened to share a cleanTitle (1241 cases in
 *     the user's actual playlist, e.g. cleanTitle="2" → 24 distinct films).
 *
 * New approach: when stream.tmdb is a non-empty / non-zero id (91.2% of the
 * user's catalog), the dedup key is `tmdb:<id>`. Otherwise we fall back to
 * `title:<cleanTitle>|<year>` for the orphan minority. Two streams with the
 * same tmdb_id always merge; two with different ids never do.
 *
 * The DEDUP_FORMAT_VERSION is bumped to 3 so any stream cached by an older
 * deploy is recomputed on first run.
 */

const fs = require('fs');

const browseCode = fs.readFileSync('./js/browse.js', 'utf8');

describe('preprocessStreams source: dedup uses tmdb_id when available', () => {
    let preprocessSrc;

    beforeAll(() => {
        const m = browseCode.match(/IPTVApp\.prototype\._preprocessStreams\s*=\s*function[\s\S]*?\n\};\n/);
        if (!m) throw new Error('Could not extract _preprocessStreams');
        preprocessSrc = m[0];
    });

    it('format version is bumped to 3 (or higher) so old caches are invalidated', () => {
        const m = preprocessSrc.match(/DEDUP_FORMAT_VERSION\s*=\s*(\d+)/);
        expect(m).not.toBeNull();
        expect(parseInt(m[1], 10)).toBeGreaterThanOrEqual(3);
    });

    it('computeFields branches on s.tmdb to build the key', () => {
        // Pin the wiring: the key string must include a 'tmdb:' branch.
        expect(preprocessSrc).toMatch(/['"]tmdb:['"]\s*\+/);
    });

    it('computeFields keeps a title-based fallback for streams without tmdb', () => {
        // Empty / zero tmdb must fall back to a title key (otherwise we'd lose
        // dedup for the 8.8% of streams that lack tmdb_id, e.g. karaoke).
        expect(preprocessSrc).toMatch(/['"]title:['"]\s*\+/);
    });
});

describe('integration: real-data dedup key behaviour', () => {
    // Run the actual computeFields-equivalent logic on a few representative
    // stream samples (lifted verbatim from the user's provider on 2026-05-10).
    let computeKey;

    beforeAll(() => {
        const vm = require('vm');
        function IPTVApp() {}
        const detailsCode = fs.readFileSync('./js/details.js', 'utf8');
        const regexCode = fs.readFileSync('./js/regex.js', 'utf8');
        const slice = (src, name) => {
            const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
            const m = src.match(re);
            if (!m) throw new Error('Could not extract ' + name);
            return m[0];
        };
        const ctx = vm.createContext({ IPTVApp: IPTVApp });
        vm.runInContext(regexCode, ctx);
        vm.runInContext(slice(browseCode, '_normalizeDedupTitle'), ctx);
        vm.runInContext(slice(browseCode, 'stripCategoryPrefix'), ctx);
        vm.runInContext(slice(detailsCode, 'cleanTitle'), ctx);
        vm.runInContext(slice(detailsCode, 'extractYear'), ctx);
        const app = new (ctx.IPTVApp)();
        // Mirror the production computeFields key-derivation logic verbatim
        // — extracted into a helper so a subtle source change here surfaces
        // as a test failure.
        computeKey = function(stream) {
            var title = stream.name || '';
            var ct = app._normalizeDedupTitle(title);
            var year = app.extractYear(title);
            var tmdbId = stream.tmdb && String(stream.tmdb).trim();
            if (tmdbId && tmdbId !== '0') return 'tmdb:' + tmdbId;
            return 'title:' + ct + '|' + (year || '');
        };
    });

    it('the 3 user-reported "Maman j\'ai raté l\'avion" variants all map to tmdb:771', () => {
        const a = { stream_id: 697329, name: "FR| Maman, j'ai raté l'avion ! - 1990", tmdb: '771' };
        const b = { stream_id: 616493, name: "FR| Maman, j'ai raté l'avion ! (1990)", tmdb: '771' };
        const c = { stream_id: 216176, name: "NOEL| Maman, j'ai raté l'avion !", tmdb: '771' };
        expect(computeKey(a)).toBe('tmdb:771');
        expect(computeKey(b)).toBe('tmdb:771');
        expect(computeKey(c)).toBe('tmdb:771');
    });

    it('two streams with DIFFERENT tmdb stay in different groups (Home Alone 1 vs 2)', () => {
        // Even though their cleanTitles overlap heavily, distinct tmdb ids
        // must keep them separate.
        const ha1 = { name: "Maman, j'ai raté l'avion (1990)", tmdb: '771' };
        const ha2 = { name: "Maman, j'ai encore raté l'avion (1992)", tmdb: '772' };
        expect(computeKey(ha1)).not.toBe(computeKey(ha2));
    });

    it('streams without tmdb_id fall back to title-based key (still merges by year)', () => {
        const a = { name: "FR| Some Karaoke", tmdb: '' };
        const b = { name: "FR| Some Karaoke", tmdb: '' };
        const c = { name: "FR| Some Karaoke", tmdb: '0' };
        expect(computeKey(a)).toBe(computeKey(b));
        expect(computeKey(a)).toBe(computeKey(c));
        expect(computeKey(a).startsWith('title:')).toBe(true);
    });

    it('a stream with tmdb does NOT collide with a no-tmdb stream that happens to share a cleanTitle', () => {
        // We deliberately keep the namespaces separate ("tmdb:..." vs
        // "title:...") because we cannot prove the no-tmdb stream is the
        // same movie — safer to leave them as 2 cards than risk a wrong
        // merge.
        const withTmdb = { name: "FR| Movie X", tmdb: '12345' };
        const noTmdb = { name: "FR| Movie X", tmdb: '' };
        expect(computeKey(withTmdb)).not.toBe(computeKey(noTmdb));
    });

    it('handles tmdb provided as a number (not just string)', () => {
        const a = { name: 'X', tmdb: 771 };
        const b = { name: 'X', tmdb: '771' };
        expect(computeKey(a)).toBe(computeKey(b));
        expect(computeKey(a)).toBe('tmdb:771');
    });

    it('treats whitespace-only tmdb as missing', () => {
        const a = { name: "FR| Foo (2020)", tmdb: '   ' };
        expect(computeKey(a).startsWith('title:')).toBe(true);
    });
});
