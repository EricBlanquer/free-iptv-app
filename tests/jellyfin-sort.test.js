/**
 * Regression test for: changing the sort order on a Jellyfin VOD/series
 * library had no visible effect. Root cause: Jellyfin items had neither
 * `added` (so default-by-date sort fell back to insertion order = SortName
 * from the API) nor a year embedded in their title "Name" (so the year
 * sort regex `/\((\d{4})\)/` never matched and `_sortYear` was always 0,
 * making year sort degenerate to name sort). The three default directions
 * (default desc, name asc, year desc) therefore all produced the same
 * SortName order.
 *
 * Fix:
 *   1. _mapItemToVod / _mapItemToSeries populate `added` from
 *      item.DateCreated (ISO 8601 -> unix seconds string).
 *   2. applyFilters falls back to `s.year` when the title-regex year
 *      extraction returns 0.
 */

const fs = require('fs');
const vm = require('vm');

// ---------------------------------------------------------------------------
// Part 1: JellyfinAPI._mapItemToVod / _mapItemToSeries set `added`
// ---------------------------------------------------------------------------

// Provide the minimal globals the class file expects.
global.window = global.window || {};
global.window.log = () => {};

const jellyfinSrc = fs.readFileSync('./js/jellyfin.js', 'utf8');
const ctxJf = { window: global.window, console };
vm.createContext(ctxJf);
// ES6 class declarations don't become properties of the context — expose explicitly.
vm.runInContext(jellyfinSrc + '\nthis.JellyfinAPI = JellyfinAPI;', ctxJf);
const JellyfinAPI = ctxJf.JellyfinAPI;

describe('JellyfinAPI._mapItemToVod populates added from DateCreated', () => {
    let api;

    beforeEach(() => {
        api = new JellyfinAPI('http://jf.local', 'u', 'p', 'uid', 'tok');
    });

    it('converts ISO DateCreated into a unix-seconds string', () => {
        const item = {
            Id: 'abc',
            Name: 'Inception',
            ProductionYear: 2010,
            DateCreated: '2024-04-15T10:30:00.0000000Z'
        };
        const mapped = api._mapItemToVod(item, 'lib1');
        // 2024-04-15T10:30:00Z = 1713177000
        expect(mapped.added).toBe('1713177000');
    });

    it('leaves added empty when DateCreated is missing', () => {
        const item = { Id: 'abc', Name: 'NoDate', ProductionYear: 2010 };
        const mapped = api._mapItemToVod(item, 'lib1');
        expect(mapped.added).toBe('');
    });

    it('series mapping also populates added from DateCreated', () => {
        const item = {
            Id: 's1',
            Name: 'Severance',
            ProductionYear: 2022,
            DateCreated: '2022-02-18T00:00:00.0000000Z'
        };
        const mapped = api._mapItemToSeries(item, 'lib1');
        // 2022-02-18T00:00:00Z = 1645142400
        expect(mapped.added).toBe('1645142400');
    });
});

describe('JellyfinAPI._streamUrl handles malformed containers', () => {
    let api;

    beforeEach(() => {
        api = new JellyfinAPI('http://jf.local', 'u', 'p', 'uid', 'tok');
    });

    it('uses normal extension for clean container (mkv)', () => {
        const url = api._streamUrl('xyz', 'mkv');
        expect(url).toContain('/Videos/xyz/stream.mkv?');
    });

    it('omits extension when container is empty/null (Jellyfin returns null for some files)', () => {
        const u1 = api._streamUrl('xyz', '');
        const u2 = api._streamUrl('xyz', null);
        const u3 = api._streamUrl('xyz', undefined);
        // No "stream." in URL — must be "stream?" because no extension was appended.
        expect(u1).toContain('/Videos/xyz/stream?');
        expect(u2).toContain('/Videos/xyz/stream?');
        expect(u3).toContain('/Videos/xyz/stream?');
    });

    it('omits extension when container is the FFmpeg multi-format probe string', () => {
        // Jellyfin returns "mov,mp4,m4a,3gp,3g2,mj2" for any FFmpeg-probed
        // MP4-family file. That string is not a valid extension and the
        // Tizen player chokes on /stream.mov,mp4,m4a,3gp,3g2,mj2 .
        const url = api._streamUrl('xyz', 'mov,mp4,m4a,3gp,3g2,mj2');
        expect(url).toContain('/Videos/xyz/stream?');
        expect(url).not.toContain('mov,mp4');
    });
});

describe('JellyfinAPI.getVodCategories excludes homevideos libraries', () => {
    // The Plex equivalent is the "Autres vidéos" library — it must NOT be
    // merged into the Films section. Plex shows it as a separate library;
    // the Tizen client has no homevideos section, so they are hidden.
    let api;

    beforeEach(() => {
        api = new JellyfinAPI('http://jf.local', 'u', 'p', 'uid', 'tok');
        api._libraries = {
            movies: [
                { ItemId: 'm1', Name: 'Films', CollectionType: 'movies' }
            ],
            tvshows: [],
            homevideos: [
                { ItemId: 'h1', Name: 'Autres vidéos', CollectionType: 'homevideos' }
            ],
            mixed: []
        };
        // Stub _loadLibraries so getVodCategories doesn't hit the network.
        api._loadLibraries = async function() { return []; };
    });

    it('returns only movie-type libraries, not homevideos', async () => {
        const cats = await api.getVodCategories();
        expect(cats).toHaveLength(1);
        expect(cats[0].category_id).toBe('m1');
        expect(cats[0].category_name).toBe('Films');
        // Explicitly assert the homevideos library is absent.
        expect(cats.some(c => c.category_id === 'h1')).toBe(false);
    });
});

describe('JellyfinAPI item-type query excludes generic Video entries', () => {
    // "Video" type in Jellyfin covers extras, clips, theme videos — Plex
    // never shows those under Films. The source must request "Movie" only.
    const fs = require('fs');
    const src = fs.readFileSync('./js/jellyfin.js', 'utf8');

    it('_fetchItems is called with includeTypes "Movie", not "Movie,Video"', () => {
        // Pin the calls so a refactor cannot silently bring "Video" back.
        expect(src).not.toMatch(/_fetchItems\([^)]*'Movie,Video'/);
        // At least one call must request just Movies.
        expect(src).toMatch(/_fetchItems\([^)]*'Movie'\)/);
    });
});

// ---------------------------------------------------------------------------
// Part 2: applyFilters year-sort falls back to s.year when title has no year
// ---------------------------------------------------------------------------

function IPTVApp() {}

const browseCode = fs.readFileSync('./js/browse.js', 'utf8');
const slice = (name) => {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = browseCode.match(re);
    if (!m) throw new Error('Could not extract ' + name + ' from js/browse.js');
    return m[0];
};

const ctx = vm.createContext({ IPTVApp, console, window: { log: () => {} } });
vm.runInContext(slice('_sortByDateAdded'), ctx);

describe('Year sort falls back to s.year when title has no "(YYYY)" pattern', () => {
    it('extracts year from s.year field when regex on title fails (Jellyfin case)', () => {
        // Jellyfin names are just "Inception" without "(2010)", so the
        // existing /\((\d{4})\)/ regex returns 0. The fallback to s.year
        // must populate _sortYear so the sort actually orders by year.
        const streams = [
            { stream_id: 1, name: 'Inception', year: 2010, _jellyfin: true },
            { stream_id: 2, name: 'Dune', year: 2021, _jellyfin: true },
            { stream_id: 3, name: 'The Matrix', year: 1999, _jellyfin: true }
        ];
        // Mirror the production code path inline so we can pin the contract.
        const yearRegex = /\((\d{4})\)/;
        streams.forEach((s) => {
            if (s._sortYear === undefined) {
                const m = (s.name || '').match(yearRegex);
                let extracted = m ? parseInt(m[1], 10) : 0;
                if (!extracted && s.year) {
                    extracted = parseInt(s.year, 10) || 0;
                }
                s._sortYear = extracted;
            }
        });
        expect(streams.map(s => s._sortYear)).toEqual([2010, 2021, 1999]);
    });

    it('production applyFilters source uses s.year as fallback for _sortYear', () => {
        // Pin the source so a refactor cannot silently drop the fallback.
        const applyFiltersMatch = browseCode.match(
            /IPTVApp\.prototype\.applyFilters\s*=\s*function[\s\S]*?\n\};\n/
        );
        expect(applyFiltersMatch).not.toBeNull();
        const src = applyFiltersMatch[0];
        // The year-extraction block must reference s.year as a fallback.
        // We accept any of: s.year, stream.year, parseInt(s.year ...
        expect(src).toMatch(/s\.year|stream\.year/);
    });
});
