/**
 * Regression test for: when ALL streams in a dedup group have an empty
 * `_dedupTag`, _applyDedup early-returned and left them all visible.
 *
 * Reported case (2026-05-10), confirmed against the user's real provider
 * data: searching "maman" returned three separate cards for "Maman, j'ai
 * raté l'avion ! (1990)" because the variants only differed by category
 * prefix ("FR|" vs "NOEL|") and that prefix gets stripped before computing
 * `_dedupTag`. With identical empty tags the early-return at
 * js/browse.js:3063 (`uniqueTags.length <= 1 && uniqueTags[0] === ''`)
 * skipped the dedup entirely.
 *
 * Fix removes that early-return. Even when versions can't be differentiated
 * by tag, the dedup pipeline still runs: the version-tag-dedup at line ~3105
 * collapses identical empty tags down to one, versions.length becomes 1, no
 * version buttons are set up (correct — there's nothing to choose between),
 * and lines ~3131-3132 hide the non-primary entries from the grid.
 */

const fs = require('fs');
const vm = require('vm');

window.log = jest.fn();

function IPTVApp() {}

const browseCode = fs.readFileSync('./js/browse.js', 'utf8');
const slice = (name) => {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = browseCode.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
};

const ctx = vm.createContext({
    IPTVApp: IPTVApp,
    Regex: {
        qualityPrefix: /^(4K|3D|SD|HD|FHD|UHD|DVB|DBV)[-|\s]+/i,
        sdQualities: ['SD']
    },
    window: { log: jest.fn() }
});
vm.runInContext(slice('_applyDedup'), ctx);

function makeStream(id, name, year, tag) {
    const cleanTitle = 'maman j ai rate l avion';
    return {
        stream_id: id,
        name: name,
        _dedupCleanTitle: cleanTitle,
        _dedupKey: cleanTitle + '|' + (year || ''),
        _dedupYear: year || null,
        _dedupTag: tag === undefined ? '' : tag,
        _dedupQualityScore: 0
    };
}

describe('IPTVApp.prototype._applyDedup: empty-tag groups', () => {
    let app;

    beforeEach(() => {
        app = new IPTVApp();
        app.currentSection = 'vod';
        app.hideSD = false;
        app.hide3D = false;
    });

    it('hides duplicates even when all _dedupTag values are empty (the user-reported bug)', () => {
        const a = makeStream(697329, "FR| Maman, j'ai raté l'avion ! - 1990", '1990');
        const b = makeStream(616493, "FR| Maman, j'ai raté l'avion ! (1990)", '1990');
        const c = makeStream(216176, "NOEL| Maman, j'ai raté l'avion !", '1990');
        const dedupGroups = { 'maman j ai rate l avion|1990': [a, b, c] };
        app.data = {
            vod: {
                _dedupGroups: dedupGroups,
                _dedupTitleCounts: { 'maman j ai rate l avion': 3 }
            }
        };
        const result = app._applyDedup([a, b, c]);
        // Only ONE card must survive in the grid output.
        expect(result.length).toBe(1);
        // The two non-primary streams must be marked hidden.
        const hiddenIds = [a, b, c].filter(s => s._hiddenDuplicate).map(s => s.stream_id);
        expect(hiddenIds).toHaveLength(2);
    });

    it('hides duplicates when group has 2 streams with identical empty tags', () => {
        const a = makeStream(1, 'FR| Movie', '2020');
        const b = makeStream(2, 'NOEL| Movie', '2020');
        const dedupGroups = { 'movie|2020': [a, b] };
        a._dedupCleanTitle = b._dedupCleanTitle = 'movie';
        a._dedupKey = b._dedupKey = 'movie|2020';
        app.data = {
            vod: {
                _dedupGroups: dedupGroups,
                _dedupTitleCounts: { 'movie': 2 }
            }
        };
        const result = app._applyDedup([a, b]);
        expect(result.length).toBe(1);
    });

    it('still sets up version buttons when at least one tag differs (existing behaviour)', () => {
        const a = makeStream(1, 'FR| Movie', '2020', '');
        const b = makeStream(2, '4K| Movie', '2020', '4K');
        b._dedupQualityScore = 4;
        a._dedupCleanTitle = b._dedupCleanTitle = 'movie';
        a._dedupKey = b._dedupKey = 'movie|2020';
        const dedupGroups = { 'movie|2020': [a, b] };
        app.data = {
            vod: {
                _dedupGroups: dedupGroups,
                _dedupTitleCounts: { 'movie': 2 }
            }
        };
        const result = app._applyDedup([a, b]);
        expect(result.length).toBe(1);
        // Version buttons must be set on the primary (4K wins via qualityScore).
        expect(result[0]._duplicateVersions).toBeDefined();
        expect(result[0]._duplicateVersions).toHaveLength(2);
        expect(result[0].stream_id).toBe(2); // 4K is primary
    });

    it('does nothing when group has only 1 stream', () => {
        const a = makeStream(1, 'FR| Solo', '2020');
        const dedupGroups = { 'solo|2020': [a] };
        a._dedupCleanTitle = 'solo';
        a._dedupKey = 'solo|2020';
        app.data = {
            vod: {
                _dedupGroups: dedupGroups,
                _dedupTitleCounts: { 'solo': 1 }
            }
        };
        const result = app._applyDedup([a]);
        expect(result.length).toBe(1);
        expect(a._hiddenDuplicate).toBeUndefined();
    });
});

describe('_applyDedup source: empty-tag early-return is gone', () => {
    let src;

    beforeAll(() => {
        const m = browseCode.match(/IPTVApp\.prototype\._applyDedup\s*=\s*function[\s\S]*?\n\};\n/);
        if (!m) throw new Error('Could not extract _applyDedup from js/browse.js');
        src = m[0];
    });

    it('does not skip groups whose tags are all empty (was: continue at line ~3063)', () => {
        // The original guard was:
        //   if (uniqueTags.length <= 1 && (uniqueTags.length === 0 || uniqueTags[0] === '')) continue;
        // Removing it lets the rest of the pipeline (tag-dedup → hide non-primary)
        // collapse the group correctly.
        expect(src).not.toMatch(/uniqueTags\[0\]\s*===\s*['"]['"][\s)]*\)\s*continue/);
    });
});
