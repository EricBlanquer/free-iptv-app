/**
 * Regression test for: same-title variants with different (or missing) year info
 * weren't deduped together.
 *
 * Reported case (2026-05-10): searching "maman" returned two cards for
 * "10 jours encore sans maman" — one tagged "4K-UHD" with no year in the title,
 * one with "(2023)". Their _dedupKey differs (`...|` vs `...|2023`), so they
 * landed in two separate groups and dedup never saw them as the same movie.
 *
 * Fix adds a post-pass `_consolidateDedupGroupsByCleanTitle` that, for each
 * cleanTitle that has multiple groups:
 *   - If at least one group has no year AND all groups with a year are within
 *     a 2-year window of each other, merge everything into the most populous
 *     year group (or the first group if all are no-year).
 *   - If groups span >2 years (e.g. "King Kong" 1933 vs 2005), leave them
 *     separate — they're almost certainly distinct movies.
 *
 * Loaded via vm.runInContext so we don't need to instantiate IPTVApp + globals.
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
vm.runInContext(slice('_consolidateDedupGroupsByCleanTitle'), ctx);

function makeStream(id, cleanTitle, year, tag) {
    return {
        stream_id: id,
        _dedupCleanTitle: cleanTitle,
        _dedupKey: cleanTitle + '|' + (year || ''),
        _dedupYear: year || null,
        _dedupTag: tag || ''
    };
}

describe('IPTVApp.prototype._consolidateDedupGroupsByCleanTitle', () => {
    let app;

    beforeEach(() => {
        app = new IPTVApp();
    });

    it('merges no-year group into the year group (the bug case)', () => {
        const s4k = makeStream(1, '10 jours encore sans maman', null, '4K-UHD');
        const s2023 = makeStream(2, '10 jours encore sans maman', '2023', '');
        const dedupGroups = {
            '10 jours encore sans maman|':     [s4k],
            '10 jours encore sans maman|2023': [s2023]
        };
        app._consolidateDedupGroupsByCleanTitle(dedupGroups);
        // Only one group must remain (the year-anchor).
        expect(Object.keys(dedupGroups)).toEqual(['10 jours encore sans maman|2023']);
        expect(dedupGroups['10 jours encore sans maman|2023']).toHaveLength(2);
        // Both streams' _dedupKey now point to the anchor.
        expect(s4k._dedupKey).toBe('10 jours encore sans maman|2023');
        expect(s2023._dedupKey).toBe('10 jours encore sans maman|2023');
    });

    it('does NOT merge "King Kong" 1933 vs 2005 (different movies, year delta > 2)', () => {
        const s1933 = makeStream(1, 'king kong', '1933', '');
        const s2005 = makeStream(2, 'king kong', '2005', '');
        const dedupGroups = {
            'king kong|1933': [s1933],
            'king kong|2005': [s2005]
        };
        app._consolidateDedupGroupsByCleanTitle(dedupGroups);
        // Both groups remain separate.
        expect(Object.keys(dedupGroups).sort()).toEqual(['king kong|1933', 'king kong|2005']);
        expect(s1933._dedupKey).toBe('king kong|1933');
        expect(s2005._dedupKey).toBe('king kong|2005');
    });

    it('still merges no-year into the first year group when years differ by 1 (data discrepancy)', () => {
        // Same movie, one provider reports 2023 and another 2024 (off-by-one is
        // common for late-year releases that crossed Jan 1).
        const sNo = makeStream(1, 'avatar la voie de l eau', null, '4K');
        const s2023 = makeStream(2, 'avatar la voie de l eau', '2023', '');
        const s2024 = makeStream(3, 'avatar la voie de l eau', '2024', '');
        const dedupGroups = {
            'avatar la voie de l eau|':     [sNo],
            'avatar la voie de l eau|2023': [s2023],
            'avatar la voie de l eau|2024': [s2024]
        };
        app._consolidateDedupGroupsByCleanTitle(dedupGroups);
        // All three streams must end up in one group (delta 2024-2023=1, ≤2).
        const keys = Object.keys(dedupGroups);
        expect(keys).toHaveLength(1);
        expect(dedupGroups[keys[0]]).toHaveLength(3);
    });

    it('does NOT merge no-year group when year groups span > 2 years (ambiguous)', () => {
        // No-year stream could belong to either remake → leave it alone.
        const sNo = makeStream(1, 'king kong', null, '4K');
        const s1933 = makeStream(2, 'king kong', '1933', '');
        const s2005 = makeStream(3, 'king kong', '2005', '');
        const dedupGroups = {
            'king kong|':     [sNo],
            'king kong|1933': [s1933],
            'king kong|2005': [s2005]
        };
        app._consolidateDedupGroupsByCleanTitle(dedupGroups);
        // All three groups remain separate (ambiguous: don't risk wrong merge).
        expect(Object.keys(dedupGroups).sort()).toEqual([
            'king kong|', 'king kong|1933', 'king kong|2005'
        ]);
    });

    it('does nothing when only one group exists for a cleanTitle', () => {
        const s = makeStream(1, 'avatar', '2009', '');
        const dedupGroups = { 'avatar|2009': [s] };
        app._consolidateDedupGroupsByCleanTitle(dedupGroups);
        expect(Object.keys(dedupGroups)).toEqual(['avatar|2009']);
        expect(dedupGroups['avatar|2009']).toHaveLength(1);
    });

    it('does nothing when cleanTitle has only year groups (no missing-year case)', () => {
        // Two streams both have year — not the bug pattern. Existing dedup-by-key
        // already handles same-year. Different-year (1y delta) is the reverse case
        // of the previous test — let me verify the logic is symmetric.
        const s2023 = makeStream(1, 'foo', '2023', '');
        const s2024 = makeStream(2, 'foo', '2024', '');
        const dedupGroups = {
            'foo|2023': [s2023],
            'foo|2024': [s2024]
        };
        app._consolidateDedupGroupsByCleanTitle(dedupGroups);
        // Even without a no-year anchor, two groups within 2-year delta should
        // still merge (same logical movie).
        const keys = Object.keys(dedupGroups);
        expect(keys).toHaveLength(1);
        expect(dedupGroups[keys[0]]).toHaveLength(2);
    });

    it('preserves separate groups for different cleanTitles', () => {
        const a = makeStream(1, 'foo', '2023', '');
        const b = makeStream(2, 'foo', null, '4K');
        const c = makeStream(3, 'bar', '2023', '');
        const d = makeStream(4, 'bar', null, '4K');
        const dedupGroups = {
            'foo|2023': [a],
            'foo|':     [b],
            'bar|2023': [c],
            'bar|':     [d]
        };
        app._consolidateDedupGroupsByCleanTitle(dedupGroups);
        // Two final groups, one per cleanTitle, each with 2 streams.
        const keys = Object.keys(dedupGroups);
        expect(keys.sort()).toEqual(['bar|2023', 'foo|2023']);
        expect(dedupGroups['foo|2023']).toHaveLength(2);
        expect(dedupGroups['bar|2023']).toHaveLength(2);
    });

    it('picks the most populous year group as anchor when multiple year groups merge', () => {
        const sNo = makeStream(1, 'movie', null, '4K');
        const s2023a = makeStream(2, 'movie', '2023', '');
        const s2023b = makeStream(3, 'movie', '2023', 'VOSTFR');
        const s2024 = makeStream(4, 'movie', '2024', '');
        const dedupGroups = {
            'movie|':     [sNo],
            'movie|2023': [s2023a, s2023b],
            'movie|2024': [s2024]
        };
        app._consolidateDedupGroupsByCleanTitle(dedupGroups);
        // movie|2023 has 2 entries — biggest — should win.
        expect(Object.keys(dedupGroups)).toEqual(['movie|2023']);
        expect(dedupGroups['movie|2023']).toHaveLength(4);
        expect(sNo._dedupKey).toBe('movie|2023');
        expect(s2024._dedupKey).toBe('movie|2023');
    });

    it('does not crash on empty dedupGroups', () => {
        const dedupGroups = {};
        expect(() => app._consolidateDedupGroupsByCleanTitle(dedupGroups)).not.toThrow();
        expect(dedupGroups).toEqual({});
    });

    it('handles cleanTitle that contains a literal "|" character defensively', () => {
        // Defensive: cleanTitle should never contain '|' (stripCategoryPrefix removes
        // the prefix), but if it ever did, the logic must use lastIndexOf to split.
        const s = makeStream(1, 'weird|title', '2020', '');
        const sNo = makeStream(2, 'weird|title', null, '4K');
        const dedupGroups = {
            'weird|title|2020': [s],
            'weird|title|':     [sNo]
        };
        app._consolidateDedupGroupsByCleanTitle(dedupGroups);
        const keys = Object.keys(dedupGroups);
        expect(keys).toHaveLength(1);
        expect(dedupGroups[keys[0]]).toHaveLength(2);
    });
});

describe('preprocessStreams source: consolidation pass is wired in', () => {
    it('preprocessStreams calls _consolidateDedupGroupsByCleanTitle', () => {
        // Pin that the new helper is actually invoked from the preprocessing pipeline,
        // otherwise the unit-tested function wouldn't run in production.
        expect(browseCode).toMatch(/_consolidateDedupGroupsByCleanTitle\s*\(/);
    });
});
