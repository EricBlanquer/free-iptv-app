/**
 * Regression test for the "Continue watching" sidebar pseudo-category filter
 * across custom and VOD-subsection contexts.
 *
 * Bug reported 2026-05-14: clicking "Continuer" on custom sections (sport,
 * entertainment, manga, custom_*) showed items from the bare VOD catalogue
 * instead of items belonging to that section.
 *
 * Two repairs are pinned here:
 *
 *   1) addToWatchHistory (js/features/history.js) MUST stamp the current
 *      section onto each history item, mirroring how toggleFavorite stamps
 *      _section on favorites — without it, no later filter can recover the
 *      origin of an item.
 *
 *   2) getFilteredContinueHistory (js/browse.js) MUST handle the same
 *      vodSubsections + custom_ branch already used by showFavoritesInGrid /
 *      getFavoritesCount; without it, every custom section falls through to
 *      the default `type === 'vod' || type === 'movie'` and leaks the entire
 *      movie catalogue.
 *
 * Legacy history entries written before the section-stamp fix have no
 * `section` field; they fall back to `type`, so they keep showing up in the
 * canonical vod/series/live views and stay invisible to subsection filters
 * — which matches the fallback behaviour already used for legacy favorites.
 */

const fs = require('fs');
const vm = require('vm');

const browseCode = fs.readFileSync('./js/browse.js', 'utf8');
const historyCode = fs.readFileSync('./js/features/history.js', 'utf8');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function buildApp(currentSection) {
    function IPTVApp() {
        this.watchHistory = [];
        this.settings = {
            activePlaylistId: 'p1',
            minProgressMinutes: 2
        };
        this.currentSection = currentSection || 'vod';
        this.tmdbInfo = null;
    }
    IPTVApp.prototype.saveWatchHistory = function() {};
    IPTVApp.prototype.getStreamTitle = function(s) { return s && s.name ? s.name : ''; };
    IPTVApp.prototype.getStreamImage = function(s) { return s && s.cover ? s.cover : ''; };
    const ctx = vm.createContext({
        IPTVApp: IPTVApp,
        console: console,
        Date: Date,
        window: { log: function() {} }
    });
    vm.runInContext(slice(historyCode, 'addToWatchHistory'), ctx);
    vm.runInContext(slice(browseCode, 'getFilteredContinueHistory'), ctx);
    return new (ctx.IPTVApp)();
}

const PROGRESS_OK = 5 * 60000;

describe('addToWatchHistory — stores the current section on every entry', () => {
    it('stamps section=vod when watching from the bare vod catalogue', () => {
        const app = buildApp('vod');
        app.addToWatchHistory({ stream_id: 10, name: 'Movie' }, 'vod', PROGRESS_OK);
        expect(app.watchHistory[0].section).toBe('vod');
    });

    it('stamps section=sport when watching from the sport subsection', () => {
        const app = buildApp('sport');
        app.addToWatchHistory({ stream_id: 11, name: 'Match' }, 'vod', PROGRESS_OK);
        expect(app.watchHistory[0].section).toBe('sport');
    });

    it('stamps section=manga when watching from the manga subsection', () => {
        const app = buildApp('manga');
        app.addToWatchHistory({ stream_id: 12, name: 'Naruto Movie' }, 'vod', PROGRESS_OK);
        expect(app.watchHistory[0].section).toBe('manga');
    });

    it('stamps section=custom_xyz when watching from a user-defined custom section', () => {
        const app = buildApp('custom_documentary');
        app.addToWatchHistory({ stream_id: 13, name: 'Doc' }, 'vod', PROGRESS_OK);
        expect(app.watchHistory[0].section).toBe('custom_documentary');
    });

    it('stamps section=series when watching a series episode', () => {
        const app = buildApp('series');
        app.addToWatchHistory({ stream_id: 14, name: 'Ep1', series_id: 5 }, 'series', PROGRESS_OK);
        expect(app.watchHistory[0].section).toBe('series');
    });

    it('stamps section=live for live channels', () => {
        const app = buildApp('live');
        app.addToWatchHistory({ stream_id: 15, name: 'Channel' }, 'live', PROGRESS_OK);
        expect(app.watchHistory[0].section).toBe('live');
    });
});

describe('getFilteredContinueHistory — section-aware filtering', () => {
    function seedMixed(app) {
        app.watchHistory = [
            { id: 100, name: 'Bare VOD',     type: 'vod',    section: 'vod',               position: PROGRESS_OK, playlistId: 'p1' },
            { id: 200, name: 'Sport item',   type: 'vod',    section: 'sport',             position: PROGRESS_OK, playlistId: 'p1' },
            { id: 201, name: 'Sport item 2', type: 'vod',    section: 'sport',             position: PROGRESS_OK, playlistId: 'p1' },
            { id: 300, name: 'Manga item',   type: 'vod',    section: 'manga',             position: PROGRESS_OK, playlistId: 'p1' },
            { id: 400, name: 'Ent item',     type: 'vod',    section: 'entertainment',     position: PROGRESS_OK, playlistId: 'p1' },
            { id: 500, name: 'Custom item',  type: 'vod',    section: 'custom_doc',        position: PROGRESS_OK, playlistId: 'p1' },
            { id: 600, name: 'Series ep',    type: 'series', section: 'series',            position: PROGRESS_OK, playlistId: 'p1', seriesId: 60 },
            { id: 700, name: 'Live ch',      type: 'live',   section: 'live',              position: PROGRESS_OK, playlistId: 'p1' }
        ];
    }

    it('returns only sport items when current section is sport', () => {
        const app = buildApp('sport');
        seedMixed(app);
        const out = app.getFilteredContinueHistory();
        expect(out.map(i => i.id).sort()).toEqual([200, 201]);
    });

    it('returns only manga items when current section is manga', () => {
        const app = buildApp('manga');
        seedMixed(app);
        expect(app.getFilteredContinueHistory().map(i => i.id)).toEqual([300]);
    });

    it('returns only entertainment items when current section is entertainment', () => {
        const app = buildApp('entertainment');
        seedMixed(app);
        expect(app.getFilteredContinueHistory().map(i => i.id)).toEqual([400]);
    });

    it('returns only custom_doc items when current section is custom_doc', () => {
        const app = buildApp('custom_doc');
        seedMixed(app);
        expect(app.getFilteredContinueHistory().map(i => i.id)).toEqual([500]);
    });

    it('returns nothing for a custom section that has no matching history', () => {
        const app = buildApp('custom_nothing_here');
        seedMixed(app);
        expect(app.getFilteredContinueHistory()).toHaveLength(0);
    });

    it('returns ONLY bare-vod items (no subsection leakage) for the vod section', () => {
        const app = buildApp('vod');
        seedMixed(app);
        const ids = app.getFilteredContinueHistory().map(i => i.id);
        expect(ids).toEqual([100]);
        expect(ids).not.toContain(200);
        expect(ids).not.toContain(300);
        expect(ids).not.toContain(400);
        expect(ids).not.toContain(500);
    });

    it('returns only series items for the series section', () => {
        const app = buildApp('series');
        seedMixed(app);
        expect(app.getFilteredContinueHistory().map(i => i.id)).toEqual([600]);
    });

    it('returns only live items for the live section', () => {
        const app = buildApp('live');
        seedMixed(app);
        expect(app.getFilteredContinueHistory().map(i => i.id)).toEqual([700]);
    });
});

describe('getFilteredContinueHistory — legacy entries without a section field', () => {
    it('treats a legacy vod entry (no section field) as belonging to the bare vod section', () => {
        const app = buildApp('vod');
        app.watchHistory = [
            { id: 1, name: 'Legacy', type: 'vod', position: PROGRESS_OK, playlistId: 'p1' }
        ];
        expect(app.getFilteredContinueHistory().map(i => i.id)).toEqual([1]);
    });

    it('hides a legacy vod entry from sport / manga / custom views (no false positive)', () => {
        const legacy = [
            { id: 1, name: 'Legacy', type: 'vod', position: PROGRESS_OK, playlistId: 'p1' }
        ];
        ['sport', 'manga', 'entertainment', 'custom_anything'].forEach(function(section) {
            const app = buildApp(section);
            app.watchHistory = legacy.slice();
            expect(app.getFilteredContinueHistory()).toHaveLength(0);
        });
    });

    it('treats a legacy series entry as belonging to the series section', () => {
        const app = buildApp('series');
        app.watchHistory = [
            { id: 2, name: 'Old Show', type: 'series', position: PROGRESS_OK, playlistId: 'p1' }
        ];
        expect(app.getFilteredContinueHistory().map(i => i.id)).toEqual([2]);
    });
});

describe('getFilteredContinueHistory — preserves the unrelated invariants', () => {
    it('still drops items whose progress is below the minimum threshold', () => {
        const app = buildApp('sport');
        app.watchHistory = [
            { id: 1, name: 'Too short', type: 'vod', section: 'sport', position: 30000, playlistId: 'p1' },
            { id: 2, name: 'Long enough', type: 'vod', section: 'sport', position: PROGRESS_OK, playlistId: 'p1' }
        ];
        expect(app.getFilteredContinueHistory().map(i => i.id)).toEqual([2]);
    });

    it('still drops items flagged as watched', () => {
        const app = buildApp('manga');
        app.watchHistory = [
            { id: 1, name: 'Watched', type: 'vod', section: 'manga', position: PROGRESS_OK, watched: true, playlistId: 'p1' },
            { id: 2, name: 'Pending', type: 'vod', section: 'manga', position: PROGRESS_OK, playlistId: 'p1' }
        ];
        expect(app.getFilteredContinueHistory().map(i => i.id)).toEqual([2]);
    });

    it('still deduplicates series by name within the same playlist', () => {
        const app = buildApp('series');
        app.watchHistory = [
            { id: 10, name: 'Show A', type: 'series', section: 'series', position: PROGRESS_OK, playlistId: 'p1', seriesId: 99 },
            { id: 11, name: 'Show A', type: 'series', section: 'series', position: PROGRESS_OK, playlistId: 'p1', seriesId: 99 },
            { id: 12, name: 'Show B', type: 'series', section: 'series', position: PROGRESS_OK, playlistId: 'p1', seriesId: 88 }
        ];
        const out = app.getFilteredContinueHistory();
        expect(out).toHaveLength(2);
        expect(out.map(i => i.name).sort()).toEqual(['Show A', 'Show B']);
    });
});

describe('source-shape pins (cheap structural guards)', () => {
    it('addToWatchHistory references this.currentSection (so the section stamp is wired)', () => {
        const src = slice(historyCode, 'addToWatchHistory');
        expect(src).toMatch(/this\.currentSection/);
    });

    it('getFilteredContinueHistory references the vodSubsections list and custom_ prefix', () => {
        const src = slice(browseCode, 'getFilteredContinueHistory');
        expect(src).toMatch(/sport/);
        expect(src).toMatch(/entertainment/);
        expect(src).toMatch(/manga/);
        expect(src).toMatch(/custom_/);
    });
});
