/**
 * Regression test for the recommendation engine's TMDB-result-to-provider-stream
 * matching path (_buildProviderIndex + _matchTmdbToStream in
 * js/features/recommended.js).
 *
 * Bug reported 2026-05-11: the "Recommandations" sidebar category never
 * appeared even though TMDB seeds (11 rated movies) were collected. Root
 * cause was a desync with the dedup-key changes shipped on 2026-05-10
 * (commits 8debb34 and d3caa99):
 *
 *   1) Provider index was built on `s.tmdb_id`, but raw provider streams
 *      from Xtream Codes carry the id under `s.tmdb`. So `byTmdb` was empty
 *      and never matched.
 *   2) The fallback key reused `s._dedupKey` as the byCleanKey key, but
 *      `_dedupKey` is now prefixed (`"tmdb:<id>"` / `"title:<clean>|<year>"`),
 *      while `_matchTmdbToStream` looks up `<clean>|<year>` without prefix.
 *      So byCleanKey never matched either.
 *   3) `_matchTmdbToStream` normalized titles with `cleanTitle().toLowerCase()`
 *      while the provider side used `_normalizeDedupTitle` (which also strips
 *      accents and non-alphanumeric chars). Asymmetric → most titles missed.
 *
 * Net effect: `buildRecommendations` returned 0 matches → sidebar category
 * hidden → user saw no recommendations.
 *
 * These tests pin the three repairs:
 *  - byTmdb indexes `s.tmdb` (with `s.tmdb_id` fallback).
 *  - byCleanKey indexes by the normalized cleantitle+year, regardless of
 *    `_dedupKey` prefix.
 *  - Title-side lookup uses `_normalizeDedupTitle` symmetrically.
 */

const fs = require('fs');
const vm = require('vm');

const browseCode = fs.readFileSync('./js/browse.js', 'utf8');
const detailsCode = fs.readFileSync('./js/details.js', 'utf8');
const regexCode = fs.readFileSync('./js/regex.js', 'utf8');
const utilsCode = fs.readFileSync('./js/core/utils.js', 'utf8');
const recoCode = fs.readFileSync('./js/features/recommended.js', 'utf8');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function buildApp() {
    function IPTVApp() {}
    const ctx = vm.createContext({ IPTVApp: IPTVApp, console: console });
    vm.runInContext(regexCode, ctx);
    vm.runInContext(slice(utilsCode, 'getStreamTitle'), ctx);
    vm.runInContext(slice(browseCode, 'stripCategoryPrefix'), ctx);
    vm.runInContext(slice(detailsCode, 'cleanTitle'), ctx);
    vm.runInContext(slice(detailsCode, 'extractYear'), ctx);
    vm.runInContext(slice(browseCode, '_normalizeDedupTitle'), ctx);
    vm.runInContext(slice(recoCode, '_buildProviderIndex'), ctx);
    vm.runInContext(slice(recoCode, '_matchTmdbToStream'), ctx);
    return new (ctx.IPTVApp)();
}

function makeStream(extras) {
    const s = Object.assign({ name: '', stream_id: 0 }, extras);
    if (s.name && s._dedupKey === undefined) {
        const title = s.name;
        const tmdbId = s.tmdb != null ? String(s.tmdb).trim() : '';
        if (tmdbId && tmdbId !== '0') {
            s._dedupKey = 'tmdb:' + tmdbId;
        }
        else {
            const app = buildApp();
            const clean = app._normalizeDedupTitle(title);
            const year = app.extractYear(title);
            s._dedupKey = 'title:' + clean + '|' + (year || '');
        }
    }
    return s;
}

describe('_buildProviderIndex / _matchTmdbToStream — regression for missing recommendations sidebar', () => {
    let app;
    beforeAll(() => { app = buildApp(); });

    it('byTmdb indexes streams that carry the id under s.tmdb (not just s.tmdb_id)', () => {
        // Real provider data from the user's catalog (Pure IPTV) puts the
        // TMDB id under `tmdb`, not `tmdb_id`. The bug was that the index
        // only checked `s.tmdb_id`.
        const streams = [
            makeStream({ stream_id: 949026, name: 'FR| Marcel, le Coquillage (avec ses chaussures) (2022)', tmdb: '869626' }),
        ];
        const idx = app._buildProviderIndex(streams);
        expect(idx.byTmdb['869626']).toBeDefined();
        expect(idx.byTmdb['869626'].stream_id).toBe(949026);
    });

    it('byTmdb still accepts the legacy s.tmdb_id field for backward compatibility', () => {
        // After visiting a movie's details page, get_vod_info populates
        // `stream.tmdb_id` (js/browse.js:484). We keep that path working.
        const streams = [
            makeStream({ stream_id: 1, name: 'Movie X', tmdb_id: '12345' }),
        ];
        const idx = app._buildProviderIndex(streams);
        expect(idx.byTmdb['12345']).toBeDefined();
    });

    it('byTmdb treats empty / "0" / whitespace-only tmdb as missing', () => {
        const streams = [
            makeStream({ stream_id: 1, name: 'No tmdb', tmdb: '' }),
            makeStream({ stream_id: 2, name: 'Zero tmdb', tmdb: '0' }),
            makeStream({ stream_id: 3, name: 'Whitespace tmdb', tmdb: '   ' }),
        ];
        const idx = app._buildProviderIndex(streams);
        expect(Object.keys(idx.byTmdb)).toEqual([]);
    });

    it('byCleanKey is keyed by raw cleantitle+year (NOT by the prefixed _dedupKey)', () => {
        // The fix: the cleankey lookup map must use the same key shape
        // _matchTmdbToStream uses on the TMDB side, i.e. clean + '|' + year.
        // The old code indexed by s._dedupKey which is now prefixed.
        const streams = [
            makeStream({ stream_id: 100, name: 'FR| Random Movie (2019)', tmdb: '' }),
        ];
        const idx = app._buildProviderIndex(streams);
        // It must NOT be the prefixed dedup key.
        expect(idx.byCleanKey['title:random movie|2019']).toBeUndefined();
        // It MUST be the bare normalized form.
        expect(idx.byCleanKey['random movie|2019']).toBeDefined();
    });

    it('matches by TMDB id when the stream carries s.tmdb (the common case)', () => {
        const streams = [
            makeStream({ stream_id: 949026, name: 'FR| Marcel, le Coquillage (avec ses chaussures) (2022)', tmdb: '869626' }),
            makeStream({ stream_id: 12, name: 'FR| Other Movie (2020)', tmdb: '99999' }),
        ];
        const idx = app._buildProviderIndex(streams);
        const tmdbResult = { id: 869626, title: 'Marcel le Coquillage avec ses chaussures', release_date: '2022-08-23' };
        const matched = app._matchTmdbToStream(tmdbResult, 'movie', idx);
        expect(matched).not.toBeNull();
        expect(matched.stream_id).toBe(949026);
    });

    it('falls back to clean-title match when stream has no tmdb (the karaoke / no-id case)', () => {
        // ~8.8% of the user's catalog has no tmdb id. The title-based fallback
        // must still work, with symmetric normalization on both sides.
        const streams = [
            makeStream({ stream_id: 555, name: "FR| Maman, j'ai raté l'avion ! (1990)", tmdb: '' }),
        ];
        const idx = app._buildProviderIndex(streams);
        const tmdbResult = { id: 771, title: "Maman, j'ai raté l'avion", release_date: '1990-11-16' };
        const matched = app._matchTmdbToStream(tmdbResult, 'movie', idx);
        expect(matched).not.toBeNull();
        expect(matched.stream_id).toBe(555);
    });

    it('clean-title match tolerates accents, punctuation and category prefixes (NOEL|, FR|, CA|)', () => {
        // _normalizeDedupTitle strips accents and non-alphanumeric chars and
        // also strips everything up to the last '|'. The TMDB-side lookup
        // must use the same normalization to symmetric-match.
        const streams = [
            makeStream({ stream_id: 1, name: "NOEL| Maman, j'ai raté l'avion !", tmdb: '' }),
        ];
        const idx = app._buildProviderIndex(streams);
        // No year on the stream side → fallback to keyNoYear branch.
        const tmdbResult = { id: 771, title: "Maman j'ai raté l'avion", release_date: '1990-11-16' };
        const matched = app._matchTmdbToStream(tmdbResult, 'movie', idx);
        expect(matched).not.toBeNull();
        expect(matched.stream_id).toBe(1);
    });

    it('clean-title match falls back to no-year key when the TMDB year is not on the provider side', () => {
        const streams = [
            makeStream({ stream_id: 42, name: 'FR| Some Movie', tmdb: '' }),
        ];
        const idx = app._buildProviderIndex(streams);
        const tmdbResult = { id: 555, title: 'Some Movie', release_date: '2020-01-01' };
        const matched = app._matchTmdbToStream(tmdbResult, 'movie', idx);
        expect(matched).not.toBeNull();
        expect(matched.stream_id).toBe(42);
    });

    it('returns null when no stream matches (does not throw or return a wrong stream)', () => {
        const streams = [
            makeStream({ stream_id: 1, name: 'Totally unrelated', tmdb: '111' }),
        ];
        const idx = app._buildProviderIndex(streams);
        const tmdbResult = { id: 999999, title: 'Brand New Movie', release_date: '2025-01-01' };
        const matched = app._matchTmdbToStream(tmdbResult, 'movie', idx);
        expect(matched).toBeNull();
    });

    it('TV results use name + first_air_date for matching', () => {
        const streams = [
            makeStream({ stream_id: 7, name: 'EN| Breaking Bad (2008)', tmdb: '1396' }),
        ];
        const idx = app._buildProviderIndex(streams);
        // tmdb id match path
        const tvResult1 = { id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20' };
        expect(app._matchTmdbToStream(tvResult1, 'tv', idx).stream_id).toBe(7);
        // No tmdb on stream → title path
        const streams2 = [makeStream({ stream_id: 8, name: 'EN| Some Show (2010)', tmdb: '' })];
        const idx2 = app._buildProviderIndex(streams2);
        const tvResult2 = { id: 42, name: 'Some Show', first_air_date: '2010-05-01' };
        expect(app._matchTmdbToStream(tvResult2, 'tv', idx2).stream_id).toBe(8);
    });

    it('end-to-end: a TMDB recommendation result for a real seed (Marcel le Coquillage) matches the right provider stream', () => {
        // Mimics buildRecommendations for the user's 2026-05-11 catalog:
        // seed = 869626 (Marcel le Coquillage). One of TMDB's recommended
        // titles is mixed with a real provider stream from Pure IPTV.
        const streams = [
            makeStream({ stream_id: 949026, name: 'FR| Marcel, le Coquillage (avec ses chaussures) (2022)', tmdb: '869626' }),
            makeStream({ stream_id: 1001, name: 'FR| Past Lives (2023)', tmdb: '666277' }),
            makeStream({ stream_id: 1002, name: "FR| Aftersun (2022)", tmdb: '876969' }),
            makeStream({ stream_id: 1003, name: "FR| Unrelated Karaoke", tmdb: '' }),
        ];
        const idx = app._buildProviderIndex(streams);
        // TMDB returned these as recommendations / similar for 869626:
        const tmdbResults = [
            { id: 666277, title: 'Past Lives', release_date: '2023-06-02' },
            { id: 876969, title: 'Aftersun', release_date: '2022-09-02' },
            { id: 1234567, title: 'Not in catalog', release_date: '2025-01-01' },
        ];
        const matched = tmdbResults.map(r => app._matchTmdbToStream(r, 'movie', idx)).filter(Boolean);
        // Two of the three TMDB results should resolve to a provider stream.
        // The third (not in catalog) is correctly dropped.
        expect(matched.map(s => s.stream_id).sort()).toEqual([1001, 1002]);
    });
});

describe('source-level pins: prevent the regressions from sneaking back', () => {
    it('_buildProviderIndex must read s.tmdb (the actual provider field), not only s.tmdb_id', () => {
        const fn = slice(recoCode, '_buildProviderIndex');
        // The function must reference s.tmdb somewhere (with or without _id).
        // We just check that `\.tmdb\b` appears outside of `tmdb_id`.
        const stripped = fn.replace(/\.tmdb_id\b/g, '');
        expect(stripped).toMatch(/\.tmdb\b/);
    });

    it('_buildProviderIndex must NOT use the prefixed _dedupKey directly as the byCleanKey key', () => {
        // The function must compute the title-based key itself (clean + '|' + year),
        // not blindly reuse s._dedupKey which now has a "tmdb:" / "title:" prefix.
        const fn = slice(recoCode, '_buildProviderIndex');
        // Either it never touches _dedupKey, or it does but explicitly strips
        // the prefix. Reject the bug shape: `var key = s._dedupKey;` followed
        // immediately by storing into byCleanKey without normalization.
        expect(fn).not.toMatch(/var\s+key\s*=\s*s\._dedupKey\s*;[\s\S]*?byCleanKey\s*\[\s*key\s*\]\s*=/);
    });

    it('_matchTmdbToStream must use the same title normalization as _buildProviderIndex (symmetric)', () => {
        const fn = slice(recoCode, '_matchTmdbToStream');
        // Symmetric: must call _normalizeDedupTitle (the canonical normalization)
        // on the TMDB-side title, so it matches what _buildProviderIndex stored.
        expect(fn).toMatch(/_normalizeDedupTitle/);
    });
});
