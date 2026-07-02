/**
 * Regression test for the "in-progress series / favorites absent from Continue,
 * History and My-list when a playlist is active" bug (reported 2026-07-02).
 *
 * Root cause pinned by on-device trace:
 *   CONTINUEFILTER active=1782994642235 kept=0 |
 *   Cape Fear:...,pid=1782994642235,...,REJECT=playlist(1782994642235!=1782994642235)
 *
 * The stored `playlistId` is a NUMBER while `settings.activePlaylistId` is a
 * STRING (or vice-versa). The filters compared them with strict `!==`, so
 * 1782994642235 (number) !== "1782994642235" (string) is TRUE and every item
 * from the active playlist was wrongly dropped. In merged mode
 * (activePlaylistId falsy) the guard skipped the check, which is why the bug
 * only appeared once a specific playlist was selected.
 *
 * Fix: compare with String() coercion in every playlist-scope filter
 * (getFilteredContinueHistory, getFavoritesCount, showFavoritesInGrid,
 * showHistoryScreen, showContinueScreen).
 */

const fs = require('fs');
const vm = require('vm');

const browseCode = fs.readFileSync('./js/browse.js', 'utf8');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function buildApp(activePlaylistId, section) {
    function IPTVApp() {
        this.watchHistory = [];
        this.favorites = [];
        this.settings = { activePlaylistId: activePlaylistId, minProgressMinutes: 2 };
        this.currentSection = section || 'series';
    }
    const ctx = vm.createContext({ IPTVApp: IPTVApp, console: console, Date: Date, window: { log: function() {} } });
    vm.runInContext(slice(browseCode, 'getFilteredContinueHistory'), ctx);
    vm.runInContext(slice(browseCode, 'getFavoritesCount'), ctx);
    return new (ctx.IPTVApp)();
}

const NUM_PID = 1782994642235;
const STR_PID = '1782994642235';

describe('getFilteredContinueHistory — playlist id type mismatch', () => {
    it('keeps a series whose playlistId is a NUMBER while activePlaylistId is a STRING', () => {
        const app = buildApp(STR_PID, 'series');
        app.watchHistory = [
            { id: 237888, name: 'Cape Fear', type: 'series', section: 'series', position: 1905225, playlistId: NUM_PID, seriesId: 5679 }
        ];
        expect(app.getFilteredContinueHistory().map(i => i.id)).toEqual([237888]);
    });

    it('keeps a series whose playlistId is a STRING while activePlaylistId is a NUMBER', () => {
        const app = buildApp(NUM_PID, 'series');
        app.watchHistory = [
            { id: 237888, name: 'Cape Fear', type: 'series', section: 'series', position: 1905225, playlistId: STR_PID, seriesId: 5679 }
        ];
        expect(app.getFilteredContinueHistory().map(i => i.id)).toEqual([237888]);
    });

    it('still drops an item that genuinely belongs to another playlist', () => {
        const app = buildApp(STR_PID, 'series');
        app.watchHistory = [
            { id: 1, name: 'Mine', type: 'series', section: 'series', position: 100000, playlistId: NUM_PID, seriesId: 1 },
            { id: 2, name: 'Other', type: 'series', section: 'series', position: 100000, playlistId: 999999999, seriesId: 2 }
        ];
        expect(app.getFilteredContinueHistory().map(i => i.id)).toEqual([1]);
    });

    it('keeps everything in merged mode (activePlaylistId empty) regardless of type', () => {
        const app = buildApp('', 'series');
        app.watchHistory = [
            { id: 1, name: 'A', type: 'series', section: 'series', position: 100000, playlistId: NUM_PID, seriesId: 1 },
            { id: 2, name: 'B', type: 'series', section: 'series', position: 100000, playlistId: STR_PID, seriesId: 2 }
        ];
        expect(app.getFilteredContinueHistory().map(i => i.id).sort()).toEqual([1, 2]);
    });
});

describe('getFavoritesCount — playlist id type mismatch', () => {
    it('counts a favorite whose _playlistId is a NUMBER while activePlaylistId is a STRING', () => {
        const app = buildApp(STR_PID, 'series');
        app.favorites = [
            { series_id: 5679, name: 'Cape Fear', _type: 'series', _section: 'series', _playlistId: NUM_PID }
        ];
        expect(app.getFavoritesCount()).toBe(1);
    });

    it('does not count a favorite from a different playlist', () => {
        const app = buildApp(STR_PID, 'series');
        app.favorites = [
            { series_id: 5679, name: 'Mine', _type: 'series', _section: 'series', _playlistId: NUM_PID },
            { series_id: 42, name: 'Other', _type: 'series', _section: 'series', _playlistId: 123 }
        ];
        expect(app.getFavoritesCount()).toBe(1);
    });
});

describe('source-shape pins', () => {
    it('getFilteredContinueHistory coerces playlist ids with String() before comparing', () => {
        expect(slice(browseCode, 'getFilteredContinueHistory'))
            .toMatch(/String\(item\.playlistId\)\s*!==\s*String\(activePlaylistId\)/);
    });
    it('getFavoritesCount coerces playlist ids with String() before comparing', () => {
        expect(slice(browseCode, 'getFavoritesCount'))
            .toMatch(/String\(fav\._playlistId\)\s*!==\s*String\(activePlaylistId\)/);
    });
});
