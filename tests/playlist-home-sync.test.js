/**
 * Regression tests for home/settings playlist synchronisation.
 *
 * Three bugs reported 2026-05-31, all sharing the same root cause: returning
 * to the home screen from settings did not reconcile the home state with the
 * playlist list that was just edited.
 *
 *  A. First launch, decline the demo -> land in settings -> press back with no
 *     playlist configured -> empty home. Fix: re-propose the demo playlist.
 *  B. Delete a playlist -> back -> the deleted playlist tab still shows in the
 *     home selector. Fix: re-render the selector + reconnect to the new active
 *     playlist.
 *  C. Add a playlist -> back -> the selector does not appear, and the new
 *     playlist is not selected. Fix: a newly added playlist becomes active, and
 *     the selector is re-rendered on back.
 */

const fs = require('fs');
const vm = require('vm');

const settingsCode = fs.readFileSync('./js/settings.js', 'utf8');
const handlersCode = fs.readFileSync('./js/core/handlers.js', 'utf8');
const appCode = fs.readFileSync('./js/app.js', 'utf8');

function slicePrototype(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function buildApp(playlists, activePlaylistId) {
    function IPTVApp() {
        this.settings = { playlists: playlists, activePlaylistId: activePlaylistId };
        this.currentPlaylistType = 'm3u';
        this.editingPlaylistId = null;
    }
    IPTVApp.prototype.sameId = function(a, b) { return String(a) === String(b); };
    IPTVApp.prototype.getNextPlaylistId = function() { return 42; };
    IPTVApp.prototype.detectXtreamFromM3UUrl = function() { return null; };
    IPTVApp.prototype.clearM3UCache = function() {};
    IPTVApp.prototype.clearProviderCache = function() {};
    IPTVApp.prototype.saveSettings = function() {};
    IPTVApp.prototype.showScreen = function() {};
    IPTVApp.prototype.startApp = function() {};

    const ctx = vm.createContext({
        IPTVApp: IPTVApp,
        document: document,
        window: { log: function() {} },
        I18n: { t: function(k, fb) { return fb || k; } },
    });
    vm.runInContext(slicePrototype(settingsCode, 'savePlaylist'), ctx);
    return new IPTVApp();
}

function setFormM3U(url, name) {
    document.body.innerHTML =
        '<input id="playlist-name" value="' + name + '">' +
        '<input id="playlist-m3uUrl" value="' + url + '">';
}

describe('savePlaylist — a newly added playlist becomes the active one (bug C)', () => {
    it('sets activePlaylistId to the first playlist when adding the very first one', () => {
        const app = buildApp([], null);
        setFormM3U('http://host/first.m3u', 'First');
        app.savePlaylist();
        expect(app.settings.playlists.length).toBe(1);
        expect(String(app.settings.activePlaylistId)).toBe(String(app.settings.playlists[0].id));
    });

    it('switches activePlaylistId to the new playlist when adding a second one', () => {
        const existing = { id: 1, name: 'Demo', type: 'm3u', url: 'assets/demo.m3u' };
        const app = buildApp([existing], 1);
        setFormM3U('http://host/second.m3u', 'Second');
        app.savePlaylist();
        expect(app.settings.playlists.length).toBe(2);
        expect(String(app.settings.activePlaylistId)).toBe('42');
    });

    it('does NOT change activePlaylistId when editing an existing playlist', () => {
        const a = { id: 1, name: 'A', type: 'm3u', url: 'http://host/a.m3u' };
        const b = { id: 2, name: 'B', type: 'm3u', url: 'http://host/b.m3u' };
        const app = buildApp([a, b], 2);
        app.editingPlaylistId = 1;
        setFormM3U('http://host/a-edited.m3u', 'A edited');
        app.savePlaylist();
        expect(app.settings.playlists.length).toBe(2);
        expect(String(app.settings.activePlaylistId)).toBe('2');
    });
});

describe('screen:settings back handler reconciles home state (bugs A, B, C)', () => {
    let handler;

    beforeAll(() => {
        const start = handlersCode.indexOf("'screen:settings': function() {");
        expect(start).toBeGreaterThan(0);
        const end = handlersCode.indexOf('},', start);
        handler = handlersCode.substring(start, end);
    });

    it('re-proposes the demo when no playlist is configured (bug A)', () => {
        expect(handler).toMatch(/if\s*\(\s*!this\.isIPTVConfigured\(\)\s*\)/);
        expect(handler).toMatch(/this\.showWelcomeDemo\(\)/);
    });

    it('re-renders the playlist selector so deleted/added tabs are reflected (bugs B, C)', () => {
        expect(handler).toMatch(/this\.renderPlaylistSelector\(\)/);
    });

    it('reconnects when the active playlist changed while in settings (bugs B, C)', () => {
        expect(handler).toMatch(/this\.reconnectIfActivePlaylistChanged\(\)/);
    });
});

describe('reconnectIfActivePlaylistChanged resets data and refreshes on a real switch (bug B)', () => {
    let body;

    beforeAll(() => {
        const start = appCode.indexOf('reconnectIfActivePlaylistChanged()');
        expect(start).toBeGreaterThan(0);
        const end = appCode.indexOf('\n    }', start);
        body = appCode.substring(start, end);
    });

    it('skips reconnection when already connected to the desired playlist', () => {
        expect(body).toMatch(/this\.sameId\(\s*this\._connectingPlaylistId\s*,\s*desiredId\s*\)/);
        expect(body).toMatch(/return;/);
    });

    it('clears data and forces a refresh before reconnecting on a switch', () => {
        expect(body).toMatch(/this\.data\s*=\s*\{/);
        expect(body).toMatch(/this\._forceRefresh\s*=\s*true/);
        expect(body).toMatch(/this\.autoConnect\(\)/);
    });
});
