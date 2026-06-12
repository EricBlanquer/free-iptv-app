/**
 * Regression test for: opening the playlists list should focus the active
 * playlist by default (not always the first row).
 *
 * getActivePlaylistFocusIndex() returns the index, within the screen's
 * focusable list, of the .playlist-item matching settings.activePlaylistId.
 * The focusables are ordered per row [item, edit, visibility, delete] then a
 * trailing add button, so the active item's index is row-dependent.
 */

var fs = require('fs');
var vm = require('vm');

function loadSettings() {
    var src = fs.readFileSync('./js/settings.js', 'utf8');
    var sandbox = {
        IPTVApp: function() {},
        window: { log: function() {} },
        document: {},
        I18n: { t: function(k, d) { return d; }, getLocale: function() { return 'en'; } },
        Regex: { trailingSlash: /\/$/ },
        Date: Date
    };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    return sandbox;
}

function makeEl(classes, playlistId) {
    return {
        classList: { contains: function(c) { return classes.split(' ').indexOf(c) >= 0; } },
        dataset: { playlistId: playlistId }
    };
}

function makeApp(sandbox, activeId, focusables) {
    var app = new sandbox.IPTVApp();
    app.settings = { activePlaylistId: activeId };
    app.sameId = function(a, b) { return String(a) === String(b); };
    app.getFocusables = function() { return focusables; };
    return app;
}

describe('playlists list focuses the active playlist', function() {
    var sandbox = loadSettings();

    var focusables = [
        makeEl('playlist-item focusable', 'p1'),
        makeEl('playlist-action-btn focusable', 'p1'),
        makeEl('playlist-action-btn focusable', 'p1'),
        makeEl('playlist-action-btn focusable', 'p1'),
        makeEl('playlist-item focusable', 'p2'),
        makeEl('playlist-action-btn focusable', 'p2'),
        makeEl('playlist-action-btn focusable', 'p2'),
        makeEl('playlist-action-btn focusable', 'p2'),
        makeEl('playlist-add-btn focusable', undefined)
    ];

    it('returns the index of the active playlist-item (second row)', function() {
        var app = makeApp(sandbox, 'p2', focusables);
        expect(app.getActivePlaylistFocusIndex()).toBe(4);
    });

    it('returns the index of the active playlist-item (first row)', function() {
        var app = makeApp(sandbox, 'p1', focusables);
        expect(app.getActivePlaylistFocusIndex()).toBe(0);
    });

    it('falls back to 0 when no active id is set', function() {
        var app = makeApp(sandbox, null, focusables);
        expect(app.getActivePlaylistFocusIndex()).toBe(0);
    });

    it('falls back to 0 when the active id is not found', function() {
        var app = makeApp(sandbox, 'ghost', focusables);
        expect(app.getActivePlaylistFocusIndex()).toBe(0);
    });

    it('matches the item, never an action button of the same playlist', function() {
        var app = makeApp(sandbox, 'p2', focusables);
        var idx = app.getActivePlaylistFocusIndex();
        expect(focusables[idx].classList.contains('playlist-item')).toBe(true);
    });
});
