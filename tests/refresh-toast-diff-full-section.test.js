/**
 * Regression test for: "+19098 Films" toast appearing after a background
 * provider-cache refresh even when the section's stream total did not change.
 *
 * Bug captured 2026-05-17: when the user is browsing a category, the diff
 * computation used `self.currentStreams` (the displayed subset — could be a
 * single category, favorites view, "ma liste", etc.) as the "old" set and
 * compared it against the FULL refreshed `sectionData.streams`. So every
 * stream outside the displayed subset was flagged as "new", producing a
 * massively inflated count (e.g. +19098 when only a handful of streams,
 * or none at all, actually appeared in the provider catalog).
 *
 * Fix: snapshot the OLD `self.data[section].streams` BEFORE invalidating
 * the preprocess cache, then diff that snapshot against the new
 * `sectionData.streams`. That way the comparison is full-section vs
 * full-section and the toast only fires when the catalog genuinely grew.
 */

const fs = require('fs');

const storageCode = fs.readFileSync('./js/storage.js', 'utf8');

describe('refreshProviderCacheBackground — toast diff must snapshot the full old section, not currentStreams', () => {
    let body;

    beforeAll(() => {
        const start = storageCode.indexOf('IPTVApp.prototype.refreshProviderCacheBackground');
        if (start < 0) throw new Error('refreshProviderCacheBackground not found');
        const end = storageCode.indexOf('IPTVApp.prototype.startCacheRefreshTimer', start);
        if (end < 0) throw new Error('end marker not found');
        body = storageCode.substring(start, end);
    });

    it('the oldStreamIds snapshot does NOT iterate self.currentStreams', () => {
        // The bug was a `for (... ; si < self.currentStreams.length; ...)` loop
        // that captured the displayed subset instead of the full section.
        const snapshotIdx = body.indexOf('var oldStreamIds = {}');
        expect(snapshotIdx).toBeGreaterThan(0);
        // Find the loop that populates oldStreamIds (the next ~600 chars).
        const window = body.substring(snapshotIdx, snapshotIdx + 600);
        expect(window).not.toMatch(/self\.currentStreams\.length/);
    });

    it('the oldStreamIds snapshot reads self.data[<section>].streams', () => {
        const snapshotIdx = body.indexOf('var oldStreamIds = {}');
        expect(snapshotIdx).toBeGreaterThan(0);
        const window = body.substring(snapshotIdx, snapshotIdx + 600);
        expect(window).toMatch(/self\.data\[/);
        expect(window).toMatch(/\.streams/);
    });

    it('the snapshot still happens BEFORE _invalidatePreprocessCache', () => {
        // Otherwise the new section data would already be in place and the
        // diff would always be zero.
        const snapshotIdx = body.indexOf('var oldStreamIds = {}');
        const invalidateIdx = body.indexOf('self._invalidatePreprocessCache');
        expect(snapshotIdx).toBeGreaterThan(0);
        expect(invalidateIdx).toBeGreaterThan(snapshotIdx);
    });
});
