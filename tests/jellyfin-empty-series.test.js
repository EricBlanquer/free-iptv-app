/**
 * Regression test for: the app listed 12 series with 0 episodes from
 * the user's Jellyfin library — they appeared in the grid with their
 * poster/metadata but clicking on them led to an empty episode list.
 *
 * Root cause: Jellyfin keeps the series metadata (title, poster, year)
 * even after the source video files are deleted/renamed/moved, or when
 * a third party (Sonarr, integrations) pushes metadata without files.
 * Those "ghost" series have `RecursiveItemCount === 0`. Our
 * `JellyfinAPI._fetchItems` was not requesting that field, so we could
 * not distinguish them from real series and listed everything.
 *
 * Fix:
 *   1. `_fetchItems` adds `ChildCount,RecursiveItemCount` to the Fields
 *      param so the server returns them.
 *   2. `getSeries` filters items whose `RecursiveItemCount === 0`.
 *      Items where the field is missing (older Jellyfin versions,
 *      unexpected schema) are KEPT — never silently hide content.
 */

const fs = require('fs');
const vm = require('vm');

global.window = global.window || {};
global.window.log = () => {};

const jellyfinSrc = fs.readFileSync('./js/jellyfin.js', 'utf8');
const ctx = { window: global.window, console };
vm.createContext(ctx);
vm.runInContext(jellyfinSrc + '\nthis.JellyfinAPI = JellyfinAPI;', ctx);
const JellyfinAPI = ctx.JellyfinAPI;

describe('JellyfinAPI._fetchItems requests episode-count fields', () => {
    const src = fs.readFileSync('./js/jellyfin.js', 'utf8');

    it('_fetchItems Fields= includes RecursiveItemCount', () => {
        // The whole filtering logic only works if Jellyfin actually
        // returns the count. Pin the URL parameter so a refactor cannot
        // silently drop it.
        const m = src.match(/_fetchItems\s*\([^)]*\)\s*\{[\s\S]*?Fields=([^&'"]+)/);
        expect(m).not.toBeNull();
        expect(m[1]).toMatch(/RecursiveItemCount/);
    });
});

describe('JellyfinAPI.getSeries filters out "ghost" series with zero episodes', () => {
    let api;

    beforeEach(() => {
        api = new JellyfinAPI('http://jf.local', 'u', 'p', 'uid', 'tok');
        api._libraries = {
            movies: [],
            tvshows: [{ ItemId: 'tvlib', Name: 'TV', CollectionType: 'tvshows' }],
            homevideos: [],
            mixed: []
        };
        api._loadLibraries = async function() { return []; };
    });

    it('keeps only series with RecursiveItemCount > 0', async () => {
        api.fetchJellyfin = async function(path) {
            return { Items: [
                { Id: 'real1',  Name: 'Bref',        RecursiveItemCount: 8 },
                { Id: 'ghost1', Name: 'Dexter',      RecursiveItemCount: 0 },
                { Id: 'real2',  Name: 'Alien Earth', RecursiveItemCount: 6, ChildCount: 1 },
                { Id: 'ghost2', Name: 'Pluribus',    RecursiveItemCount: 0, ChildCount: 0 }
            ]};
        };
        const series = await api.getSeries();
        const names = series.map(s => s.name).sort();
        expect(names).toEqual(['Alien Earth', 'Bref']);
    });

    it('keeps series when RecursiveItemCount is missing (older Jellyfin or schema change)', async () => {
        // Defensive: if the server doesn't supply the field, KEEP the
        // series. We never want to silently hide real content because
        // of a schema mismatch.
        api.fetchJellyfin = async function(path) {
            return { Items: [
                { Id: 'a', Name: 'Has count zero',    RecursiveItemCount: 0 },
                { Id: 'b', Name: 'No count field' },
                { Id: 'c', Name: 'Has count three',   RecursiveItemCount: 3 }
            ]};
        };
        const series = await api.getSeries();
        const names = series.map(s => s.name).sort();
        expect(names).toEqual(['Has count three', 'No count field']);
    });

    it('caches the filtered series under "_all" (no ghosts in cache)', async () => {
        api.fetchJellyfin = async function() {
            return { Items: [
                { Id: 'real', Name: 'Real',  RecursiveItemCount: 5 },
                { Id: 'ghost', Name: 'Ghost', RecursiveItemCount: 0 }
            ]};
        };
        await api.getSeries();
        const cached = api.cache.series['_all'];
        expect(cached).toBeDefined();
        expect(cached.map(s => s.name)).toEqual(['Real']);
    });
});
