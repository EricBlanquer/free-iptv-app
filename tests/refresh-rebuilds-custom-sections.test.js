/**
 * Regression test for: refreshing the provider cache while the user is
 * viewing (or about to navigate to) a custom section (sport, entertainment,
 * manga, custom_*) leaves the sidebar empty until app relaunch.
 *
 * Bug reported 2026-05-14: "j'actualise les data du provider et que je vais
 * dans les spectacles/sport/ou autre sections custom, les catégories sont
 * manquantes, je dois quitter l'app et la relancer pour les voir".
 *
 * Two distinct repairs are pinned here:
 *
 *  1) _invalidatePreprocessCache (js/browse.js) MUST NOT pre-empty
 *     this.data['sport' / 'manga' / 'entertainment' / 'custom_*'] before
 *     scheduling preloadSections. The pre-empty created a synchronous
 *     "categories=[], streams=[]" state that lasted for the full async
 *     window of preloadSections (initial setTimeout 100ms + sequential
 *     setTimeout-0 chain across 7+ sections + per-section dedup work);
 *     any renderCategories call hitting that window saw an empty list.
 *     The new shape only deletes _dedupGroups so _preprocessSection's
 *     early-return guard (`if (this.data[section]._dedupGroups) return`)
 *     fires false and the section gets rebuilt — but the OLD categories
 *     stay visible until the rebuild atomically replaces them.
 *
 *  2) refreshProviderCacheBackground (js/storage.js) MUST always re-render
 *     the sidebar after preloadSections completes when the user is in
 *     the browse view. The previous logic only re-rendered when newCount
 *     of streams was > 0, so any refresh that changed only the category
 *     shape (renamed categories, language-filter changes, custom-pattern
 *     edits) silently left the stale sidebar in place.
 */

const fs = require('fs');
const vm = require('vm');

const browseCode = fs.readFileSync('./js/browse.js', 'utf8');
const storageCode = fs.readFileSync('./js/storage.js', 'utf8');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

describe('_invalidatePreprocessCache — does not pre-empty custom sections', () => {
    let app;
    let preloadCalled;

    beforeEach(() => {
        function IPTVApp() {
            this.data = {
                vod: { categories: [{ category_id: 'v1', category_name: 'Action' }], streams: [{ stream_id: 1 }], _dedupGroups: { keep: true } },
                series: { categories: [{ category_id: 's1', category_name: 'Drama' }], streams: [{ stream_id: 2 }], _dedupGroups: { keep: true } },
                live: { categories: [{ category_id: 'l1', category_name: 'News' }], streams: [{ stream_id: 3 }], _dedupGroups: { keep: true } },
                sport: { categories: [{ category_id: 'sp1', category_name: 'Football' }], streams: [{ stream_id: 100 }, { stream_id: 101 }], _dedupGroups: { keep: true } },
                manga: { categories: [{ category_id: 'mg1', category_name: 'Anime' }], streams: [{ stream_id: 200 }], _dedupGroups: { keep: true } },
                entertainment: { categories: [{ category_id: 'en1', category_name: 'Spectacles' }], streams: [{ stream_id: 300 }], _dedupGroups: { keep: true } },
                custom_doc: { categories: [{ category_id: 'cd1', category_name: 'Documentaire' }], streams: [{ stream_id: 400 }], _dedupGroups: { keep: true } }
            };
            this.settings = {
                customCategories: [{ id: 'doc', name: 'Doc', keywords: ['document'] }]
            };
        }
        IPTVApp.prototype.preloadSections = function(onDone) {
            preloadCalled = true;
            if (onDone) onDone();
        };
        const ctx = vm.createContext({ IPTVApp: IPTVApp, console: console, window: { log: function() {} } });
        vm.runInContext(slice(browseCode, '_invalidatePreprocessCache'), ctx);
        app = new (ctx.IPTVApp)();
        preloadCalled = false;
    });

    it('keeps sport categories visible while the rebuild is pending (no pre-empty)', () => {
        app._invalidatePreprocessCache(function() {});
        expect(app.data.sport.categories.length).toBe(1);
        expect(app.data.sport.categories[0].category_name).toBe('Football');
        expect(app.data.sport.streams.length).toBe(2);
    });

    it('keeps manga categories visible while the rebuild is pending', () => {
        app._invalidatePreprocessCache(function() {});
        expect(app.data.manga.categories.length).toBe(1);
        expect(app.data.manga.categories[0].category_name).toBe('Anime');
    });

    it('keeps entertainment (Spectacles) categories visible while the rebuild is pending', () => {
        app._invalidatePreprocessCache(function() {});
        expect(app.data.entertainment.categories.length).toBe(1);
        expect(app.data.entertainment.categories[0].category_name).toBe('Spectacles');
    });

    it('keeps custom_* categories visible while the rebuild is pending', () => {
        app._invalidatePreprocessCache(function() {});
        expect(app.data.custom_doc.categories.length).toBe(1);
        expect(app.data.custom_doc.categories[0].category_name).toBe('Documentaire');
    });

    it('keeps vod / series / live categories visible while the rebuild is pending', () => {
        app._invalidatePreprocessCache(function() {});
        expect(app.data.vod.categories.length).toBe(1);
        expect(app.data.series.categories.length).toBe(1);
        expect(app.data.live.categories.length).toBe(1);
    });

    it('deletes _dedupGroups on every section so _preprocessSection re-runs', () => {
        app._invalidatePreprocessCache(function() {});
        ['vod', 'series', 'live', 'sport', 'manga', 'entertainment', 'custom_doc'].forEach(function(sec) {
            expect(app.data[sec]._dedupGroups).toBeUndefined();
        });
    });

    it('triggers preloadSections to schedule the rebuild', () => {
        app._invalidatePreprocessCache(function() {});
        expect(preloadCalled).toBe(true);
    });

    it('forwards the onDone callback to preloadSections', () => {
        let cbCalled = false;
        app._invalidatePreprocessCache(function() { cbCalled = true; });
        expect(cbCalled).toBe(true);
    });

    it('handles missing custom_* sections in this.data without crashing', () => {
        app.settings.customCategories = [{ id: 'never_seen' }];
        expect(function() {
            app._invalidatePreprocessCache(function() {});
        }).not.toThrow();
    });
});

describe('source-shape pins (cheap structural guards)', () => {
    it('_invalidatePreprocessCache no longer assigns { categories: [], streams: [] } to custom sections', () => {
        const src = slice(browseCode, '_invalidatePreprocessCache');
        expect(src).not.toMatch(/this\.data\[customSections\[/);
        expect(src).not.toMatch(/this\.data\[cid\]\s*=\s*\{\s*categories:\s*\[\]/);
        expect(src).not.toMatch(/categories:\s*\[\]\s*,\s*streams:\s*\[\]/);
    });

    it('_invalidatePreprocessCache still references customCategories so the dedup-clear loop covers them', () => {
        const src = slice(browseCode, '_invalidatePreprocessCache');
        expect(src).toMatch(/customCategories/);
    });

    it('refreshProviderCacheBackground always renders categories after preloadSections, not only when newCount > 0', () => {
        // The renderCategories call must sit OUTSIDE the `if (newCount > 0)` block.
        // Locate the _invalidatePreprocessCache callback and check its body.
        const cbStart = storageCode.indexOf('self._invalidatePreprocessCache(function()');
        expect(cbStart).toBeGreaterThan(0);
        // Walk forward to the matching closing `});` — find the next occurrence of `});\n` followed by `}` or `delete`
        const after = storageCode.substring(cbStart);
        const cbEndRel = after.indexOf('            });');
        expect(cbEndRel).toBeGreaterThan(0);
        const cbBody = after.substring(0, cbEndRel);
        // The unconditional renderCategories call must be present
        expect(cbBody).toMatch(/self\.renderCategories\s*\(/);
        // And it must NOT be nested inside the `if (newCount > 0)` block — the
        // simplest check: renderCategories appears BEFORE the newCount check.
        const renderIdx = cbBody.indexOf('self.renderCategories');
        const newCountIdx = cbBody.indexOf('newCount > 0');
        expect(renderIdx).toBeLessThan(newCountIdx);
    });
});
