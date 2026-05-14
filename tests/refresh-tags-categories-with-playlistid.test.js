/**
 * Regression test for: empty sidebar after a background-refresh of the
 * provider cache (sport / entertainment / manga / custom_*).
 *
 * Bug captured 2026-05-14 in remote debug log:
 *   SIDEBAR render section=sport inputCats=6 afterCountFilter=0 streams=2574
 *
 * Root cause: refreshProviderCacheBackground at js/storage.js wrote the new
 * cacheData.{vod,series,live}.categories straight into self.api.cache.*Categories
 * WITHOUT calling tagRefresh on them — only the streams arrays were tagged.
 *
 * Result: after refresh, streams carry _playlistId but categories do NOT.
 *   - _preprocessStreams builds catKey = `${category_id}_${_playlistId}` because
 *     streams have _playlistId.
 *   - renderCategories builds cat.id = `${category_id}` because cat._playlistId
 *     is falsy.
 *   - The count filter `countByCategory[cat.id] > 0` then drops every
 *     category, leaving a sidebar with only the "All" item.
 *
 * The repair: refreshProviderCacheBackground tagRefreshes categories the
 * same way it tagRefreshes streams.
 *
 * This test pins the source shape — it walks the function body of
 * refreshProviderCacheBackground and asserts every `*Categories` assignment
 * is followed by a tagRefresh call before the next `_invalidatePreprocessCache`.
 */

const fs = require('fs');

const storageCode = fs.readFileSync('./js/storage.js', 'utf8');

describe('refreshProviderCacheBackground — categories must be tagged with _playlistId after refresh', () => {
    let body;

    beforeAll(() => {
        const start = storageCode.indexOf('IPTVApp.prototype.refreshProviderCacheBackground');
        if (start < 0) throw new Error('refreshProviderCacheBackground not found');
        const end = storageCode.indexOf('IPTVApp.prototype.startCacheRefreshTimer', start);
        if (end < 0) throw new Error('end marker not found');
        body = storageCode.substring(start, end);
    });

    it('tags self.api.cache.vodCategories with _playlistId', () => {
        const idx = body.indexOf('self.api.cache.vodCategories =');
        expect(idx).toBeGreaterThan(0);
        const window = body.substring(idx, idx + 200);
        expect(window).toMatch(/tagRefresh\(\s*self\.api\.cache\.vodCategories\s*\)/);
    });

    it('tags self.api.cache.seriesCategories with _playlistId', () => {
        const idx = body.indexOf('self.api.cache.seriesCategories =');
        expect(idx).toBeGreaterThan(0);
        const window = body.substring(idx, idx + 200);
        expect(window).toMatch(/tagRefresh\(\s*self\.api\.cache\.seriesCategories\s*\)/);
    });

    it('tags self.api.cache.liveCategories with _playlistId', () => {
        const idx = body.indexOf('self.api.cache.liveCategories =');
        expect(idx).toBeGreaterThan(0);
        const window = body.substring(idx, idx + 200);
        expect(window).toMatch(/tagRefresh\(\s*self\.api\.cache\.liveCategories\s*\)/);
    });

    it('tagRefresh assigns _playlistId on every entry without one (untouched contract)', () => {
        // Sanity: the helper still does the right thing — verify the inline
        // function definition matches the if-not-tagged-then-tag pattern.
        expect(body).toMatch(/var\s+tagRefresh\s*=\s*function\s*\(\s*arr\s*\)\s*\{[\s\S]*?_playlistId\s*=\s*playlistId/);
    });
});

describe('tagRefresh behaviour — pure function (extracted)', () => {
    function makeTagRefresh(playlistId) {
        return function tagRefresh(arr) {
            if (!arr) return;
            for (var ti = 0; ti < arr.length; ti++) {
                if (!arr[ti]._playlistId) arr[ti]._playlistId = playlistId;
            }
        };
    }

    it('sets _playlistId on category objects that lack it', () => {
        const cats = [{ category_id: '1', category_name: 'Sport FR' }, { category_id: '2', category_name: 'Boxing' }];
        makeTagRefresh('Pure IPTV')(cats);
        expect(cats[0]._playlistId).toBe('Pure IPTV');
        expect(cats[1]._playlistId).toBe('Pure IPTV');
    });

    it('does not overwrite an existing _playlistId (multi-provider safe)', () => {
        const cats = [{ category_id: '1', _playlistId: 'OtherProvider' }];
        makeTagRefresh('Pure IPTV')(cats);
        expect(cats[0]._playlistId).toBe('OtherProvider');
    });

    it('handles null arrays without throwing', () => {
        expect(function() { makeTagRefresh('X')(null); }).not.toThrow();
    });

    it('handles empty arrays', () => {
        const cats = [];
        makeTagRefresh('X')(cats);
        expect(cats.length).toBe(0);
    });
});

describe('countByCategory / cat.id symmetry — explains why an untagged refresh empties the sidebar', () => {
    function buildPreparedId(cat) {
        return cat._playlistId ? cat.category_id + '_' + cat._playlistId : cat.category_id;
    }
    function buildStreamCatKey(s) {
        return s._playlistId ? s.category_id + '_' + s._playlistId : s.category_id;
    }

    it('matching: tagged cats + tagged streams produce identical keys', () => {
        const cat = { category_id: '42', _playlistId: 'Pure IPTV' };
        const stream = { category_id: '42', _playlistId: 'Pure IPTV' };
        expect(buildPreparedId(cat)).toBe(buildStreamCatKey(stream));
    });

    it('mismatch: untagged cats + tagged streams (the bug) produce different keys', () => {
        const cat = { category_id: '42' };
        const stream = { category_id: '42', _playlistId: 'Pure IPTV' };
        expect(buildPreparedId(cat)).not.toBe(buildStreamCatKey(stream));
        expect(buildPreparedId(cat)).toBe('42');
        expect(buildStreamCatKey(stream)).toBe('42_Pure IPTV');
    });
});
