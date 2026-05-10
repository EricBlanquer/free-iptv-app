/**
 * Regression test for: "Tout" / "Date d'ajout" never refreshed even when the
 * provider added new VOD. Root cause: applyFilters' `default` branch did not
 * actually sort by `s.added` — it preserved the API order, which most Xtream
 * providers return as `stream_id ASC` for the un-categorized list. So a movie
 * added today (e.g. "Mon frère") landed at the end while "1981" stayed first.
 *
 * Fix introduces _sortByDateAdded(streams, asc) and applyFilters now calls it
 * for the default / default-asc modes (except for entertainment which keeps
 * its category-order sort).
 *
 * The helper is extracted via vm.runInContext to avoid loading the full
 * js/browse.js (which drags in IPTVApp/TMDB/Storage/Regex globals).
 */

const fs = require('fs');
const vm = require('vm');

window.log = jest.fn();

function IPTVApp() {}

const browseCode = fs.readFileSync('./js/browse.js', 'utf8');
const slice = (name) => {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = browseCode.match(re);
    if (!m) throw new Error('Could not extract ' + name + ' from js/browse.js');
    return m[0];
};

const ctx = vm.createContext({ IPTVApp: IPTVApp });
vm.runInContext(slice('_sortByDateAdded'), ctx);

describe('IPTVApp.prototype._sortByDateAdded', () => {
    let app;

    beforeEach(() => {
        app = new IPTVApp();
    });

    it('sorts by added desc by default (newest first)', () => {
        // 1700000000 = Nov 2023, 1714442000 = Apr 2024, 1745000000 = Apr 2025
        const streams = [
            { stream_id: 1, name: '1981',      added: '1700000000' },
            { stream_id: 2, name: 'Avatar',    added: '1714442000' },
            { stream_id: 3, name: 'Mon frere', added: '1745000000' }
        ];
        app._sortByDateAdded(streams, false);
        expect(streams.map(s => s.stream_id)).toEqual([3, 2, 1]);
    });

    it('sorts by added asc when asc=true (oldest first)', () => {
        const streams = [
            { stream_id: 1, name: '1981',      added: '1700000000' },
            { stream_id: 2, name: 'Avatar',    added: '1714442000' },
            { stream_id: 3, name: 'Mon frere', added: '1745000000' }
        ];
        app._sortByDateAdded(streams, true);
        expect(streams.map(s => s.stream_id)).toEqual([1, 2, 3]);
    });

    it('treats missing/empty added as 0 (oldest)', () => {
        const streams = [
            { stream_id: 1, name: 'Recent',  added: '1745000000' },
            { stream_id: 2, name: 'NoAdded' /* missing */ },
            { stream_id: 3, name: 'EmptyAdded', added: '' },
            { stream_id: 4, name: 'NullAdded',  added: null },
            { stream_id: 5, name: 'Older',  added: '1700000000' }
        ];
        app._sortByDateAdded(streams, false);
        const ids = streams.map(s => s.stream_id);
        expect(ids[0]).toBe(1);
        expect(ids[1]).toBe(5);
        // The three "missing" entries land at the bottom, in original order (stable).
        expect(ids.slice(2)).toEqual([2, 3, 4]);
    });

    it('is stable: equal added preserves original order', () => {
        const streams = [
            { stream_id: 'a', added: '1700000000' },
            { stream_id: 'b', added: '1700000000' },
            { stream_id: 'c', added: '1700000000' },
            { stream_id: 'd', added: '1700000000' },
            { stream_id: 'e', added: '1700000000' }
        ];
        app._sortByDateAdded(streams, false);
        expect(streams.map(s => s.stream_id)).toEqual(['a', 'b', 'c', 'd', 'e']);
        app._sortByDateAdded(streams, true);
        expect(streams.map(s => s.stream_id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('is stable when all streams have no added field (live section case)', () => {
        // Live streams typically lack `added` — must not shuffle the channel order.
        const streams = [
            { stream_id: 100, name: 'TF1' },
            { stream_id: 101, name: 'France 2' },
            { stream_id: 102, name: 'M6' },
            { stream_id: 103, name: 'BFM' }
        ];
        app._sortByDateAdded(streams, false);
        expect(streams.map(s => s.stream_id)).toEqual([100, 101, 102, 103]);
    });

    it('handles numeric added (non-string)', () => {
        const streams = [
            { stream_id: 1, added: 1700000000 },
            { stream_id: 2, added: 1745000000 }
        ];
        app._sortByDateAdded(streams, false);
        expect(streams.map(s => s.stream_id)).toEqual([2, 1]);
    });

    it('mutates the input array in place (returns void / same array)', () => {
        const streams = [
            { stream_id: 1, added: '1000' },
            { stream_id: 2, added: '2000' }
        ];
        const ref = streams;
        app._sortByDateAdded(streams, false);
        expect(streams).toBe(ref);
        expect(streams[0].stream_id).toBe(2);
    });

    it('handles empty array', () => {
        const streams = [];
        expect(() => app._sortByDateAdded(streams, false)).not.toThrow();
        expect(streams).toEqual([]);
    });

    it('handles single-element array', () => {
        const streams = [{ stream_id: 42, added: '1700000000' }];
        app._sortByDateAdded(streams, false);
        expect(streams).toEqual([{ stream_id: 42, added: '1700000000' }]);
    });
});

describe('applyFilters source: default sort wires _sortByDateAdded', () => {
    it('default and default-asc both reach _sortByDateAdded for non-entertainment sections', () => {
        // The bug was that `default` did nothing (no sort) and `default-asc` only
        // reverse()'d the API order. This test pins the new wiring so a future
        // refactor can't silently re-introduce the no-sort behaviour.
        const applyFiltersMatch = browseCode.match(
            /IPTVApp\.prototype\.applyFilters\s*=\s*function[\s\S]*?\n\};\n/
        );
        expect(applyFiltersMatch).not.toBeNull();
        const src = applyFiltersMatch[0];
        // _sortByDateAdded must be invoked from applyFilters.
        expect(src).toMatch(/_sortByDateAdded\s*\(/);
        // The non-entertainment default branch must drop the naive `streams.reverse()`
        // shortcut and route through _sortByDateAdded — the wiring should mention
        // both default and default-asc together.
        expect(src).toMatch(/_sortByDateAdded\s*\([^)]*default-asc/);
    });
});
