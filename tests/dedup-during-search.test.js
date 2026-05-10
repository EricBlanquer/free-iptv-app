/**
 * Regression test for: searching a title disabled the duplicate-collapsing logic.
 *
 * Before fix, applyFilters guarded `_applyDedup` with `&& !this.searchTitle`,
 * so as soon as the user typed something in the search box every quality
 * variant of the same movie (4K, FR, VOSTFR, …) showed up as separate cards
 * — defeating the purpose of dedup.
 *
 * The fix removes the !searchTitle guard so dedup applies during search too.
 *
 * Source-grep test pattern (matches what we did for setupRemoteDebug): we
 * pin the exact code change so a future refactor can't silently re-introduce
 * the guard.
 */

const fs = require('fs');

const browseCode = fs.readFileSync('./js/browse.js', 'utf8');

describe('applyFilters source: dedup runs during text search', () => {
    let applyFiltersSrc;

    beforeAll(() => {
        const m = browseCode.match(/IPTVApp\.prototype\.applyFilters\s*=\s*function[\s\S]*?\n\};\n/);
        if (!m) throw new Error('Could not extract applyFilters from js/browse.js');
        applyFiltersSrc = m[0];
    });

    it('the !searchTitle guard around _applyDedup must be gone', () => {
        // The bug was an explicit `&& !this.searchTitle` that bypassed dedup
        // whenever the search field had any value. The fix removes that clause.
        expect(applyFiltersSrc).toMatch(/_applyDedup\s*\(/);
        expect(applyFiltersSrc).not.toMatch(/!\s*this\.searchTitle/);
    });

    it('_applyDedup is still gated only on currentSection (downloads/history) — not on search', () => {
        // Sanity: dedup is rightfully skipped on downloads/history (those are
        // user-curated lists, dedup would hide explicit picks). Make sure THAT
        // guard is intact.
        expect(applyFiltersSrc).toMatch(/currentSection\s*!==\s*['"]downloads['"]/);
        expect(applyFiltersSrc).toMatch(/currentSection\s*!==\s*['"]history['"]/);
    });
});

describe('_applyDedup behaviour is unchanged', () => {
    // The function is large and depends on this.data[section]._dedupGroups etc.
    // We don't re-test all its branches here — the existing browse.test.js
    // covers behavior. We only make sure the function is still defined and
    // exported on the prototype (i.e. nothing got accidentally deleted).
    it('_applyDedup is still defined on IPTVApp.prototype', () => {
        expect(browseCode).toMatch(/IPTVApp\.prototype\._applyDedup\s*=\s*function/);
    });
});
