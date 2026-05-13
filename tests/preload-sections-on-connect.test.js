/**
 * Regression test for: opening VOD/Series/Sport after autoConnect (or after
 * switchPlaylist, which calls autoConnect) shows a "Loading categories…"
 * spinner because data[section]._dedupGroups is undefined and the user has
 * to wait for the synchronous _preprocessSection to run.
 *
 * Pre-fix: preloadSections() was only invoked from _invalidatePreprocessCache,
 * which itself is only called on background-refresh data changes — never on
 * the cache-hit autoConnect path that runs at every app launch and every
 * provider switch.
 *
 * Fix: autoConnect now calls preloadSections() at the end of both the
 * cache-hit branch and the no-cache branch, so data.{vod,series,sport,manga,
 * entertainment,custom_*}._dedupGroups is populated in the background and the
 * loadCategory early-return at js/browse.js:820 fires instantly when the user
 * eventually opens any section. Source-grep test pins the wiring.
 */

const fs = require('fs');

const appCode = fs.readFileSync('./js/app.js', 'utf8');

describe('autoConnect source: preloadSections is invoked after data is ready', () => {
    let autoConnectSrc;

    beforeAll(() => {
        const m = appCode.match(/autoConnect\s*\(\s*\)\s*\{[\s\S]*?\n    \}\n/);
        if (!m) throw new Error('Could not extract autoConnect from js/app.js');
        autoConnectSrc = m[0];
    });

    it('autoConnect calls self.preloadSections() somewhere in its body', () => {
        // Pin existence — don't care exactly which branch, only that it runs.
        expect(autoConnectSrc).toMatch(/self\.preloadSections\s*\(/);
    });

    it('preloadSections is called in the cache-hit branch', () => {
        // The cache-hit branch is the one that contains 'using provider cache for'.
        // Find that string and verify preloadSections appears before the next branch's marker.
        const cacheHitStart = autoConnectSrc.indexOf('using provider cache for');
        expect(cacheHitStart).toBeGreaterThan(0);
        // Walk forward to either the matching `else` (no-cache branch) or end of try.
        const slice = autoConnectSrc.substring(cacheHitStart);
        const elseIdx = slice.indexOf('else {');
        const branchEnd = elseIdx > 0 ? elseIdx : slice.length;
        const cacheHitBranch = slice.substring(0, branchEnd);
        expect(cacheHitBranch).toMatch(/self\.preloadSections\s*\(/);
    });
});
