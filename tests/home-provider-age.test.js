/**
 * Regression tests for the home "freshness" indicator (#home-provider-age),
 * the "🕐 X min ago" chip shown bottom-right of the home screen.
 *
 * Bug reported 2026-05-31: the chip was not shown systematically on the TV.
 * Root cause (proven from device logs): it was tied to the `homeProviderList`
 * setting and hidden whenever the provider list was hidden. Fix: a dedicated
 * `homeProviderAge` setting (default false) controls the chip independently,
 * via IPTVApp#updateProviderAge. updateRefreshProgress() honours the same
 * setting and delegates its "done" state to updateProviderAge.
 */

const fs = require('fs');
const vm = require('vm');

const appCode = fs.readFileSync('./js/app.js', 'utf8');
const storageCode = fs.readFileSync('./js/storage.js', 'utf8');

function slicePrototype(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract prototype ' + name);
    return m[0];
}

function sliceClassMethod(src, name) {
    const re = new RegExp('^    ' + name + '(\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n    \\})', 'm');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract method ' + name);
    return 'IPTVApp.prototype.' + name + ' = function' + m[1] + ';';
}

function buildApp(overrides) {
    function IPTVApp() {}
    IPTVApp.prototype.sameId = function(a, b) { return String(a) === String(b); };
    IPTVApp.prototype.setHidden = function(el, hide) {
        if (el) el.classList.toggle('hidden', hide);
    };

    const ctx = vm.createContext({
        IPTVApp: IPTVApp,
        document: document,
        window: { log: function() {} },
        formatTimeAgo: function(ts) { return ts ? 'mock-ago' : ''; },
        Date: Date,
    });
    vm.runInContext(sliceClassMethod(appCode, 'updateProviderAge'), ctx);
    vm.runInContext(slicePrototype(storageCode, 'updateRefreshProgress'), ctx);

    const app = new IPTVApp();
    Object.assign(app, overrides);
    return app;
}

const chip = () => document.getElementById('home-provider-age');

describe('updateProviderAge — chip controlled by the homeProviderAge setting', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="home-provider-age" class="hidden"></div>';
    });

    it('stays hidden when the setting is off, even with a fresh timestamp', () => {
        const app = buildApp({
            settings: { homeProviderAge: false, activePlaylistId: 'p1', playlists: [{ id: 'p1', showOnHome: true }] },
            playlistCacheTimestamps: { p1: 1700000000000 },
        });
        app.updateProviderAge();
        expect(chip().classList.contains('hidden')).toBe(true);
    });

    it('shows the chip for the active provider when the setting is on', () => {
        const app = buildApp({
            settings: { homeProviderAge: true, activePlaylistId: 'p1', playlists: [{ id: 'p1', showOnHome: true }, { id: 'p2', showOnHome: true }] },
            playlistCacheTimestamps: { p1: 1700000000000 },
        });
        app.updateProviderAge();
        const el = chip();
        expect(el.classList.contains('hidden')).toBe(false);
        expect(el.querySelector('.material-symbols-outlined')).not.toBeNull();
        expect(el.textContent).toContain('mock-ago');
    });

    it('falls back to the single visible playlist when there is no active id', () => {
        const app = buildApp({
            settings: { homeProviderAge: true, activePlaylistId: null, playlists: [{ id: 'solo', showOnHome: true }] },
            playlistCacheTimestamps: { solo: 1700000000000 },
        });
        app.updateProviderAge();
        expect(chip().classList.contains('hidden')).toBe(false);
    });

    it('hides the chip (no stale label) when the setting is on but the timestamp is missing', () => {
        const app = buildApp({
            settings: { homeProviderAge: true, activePlaylistId: 'p1', playlists: [{ id: 'p1', showOnHome: true }] },
            playlistCacheTimestamps: {},
        });
        app.updateProviderAge();
        const el = chip();
        expect(el.classList.contains('hidden')).toBe(true);
        expect(el.querySelector('.material-symbols-outlined')).toBeNull();
        expect(el.textContent.trim()).toBe('');
    });
});

describe('updateRefreshProgress honours the homeProviderAge setting', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="home-provider-age" class="hidden"></div>';
    });

    it('shows no refresh progress when the setting is off', () => {
        const app = buildApp({
            settings: { homeProviderAge: false, activePlaylistId: 'p1', playlists: [{ id: 'p1', showOnHome: true }] },
            playlistCacheTimestamps: { p1: 1700000000000 },
        });
        app.updateRefreshProgress('p1', 1, 3, 'TV');
        const el = chip();
        expect(el.classList.contains('hidden')).toBe(true);
        expect(el.querySelector('.hourglass')).toBeNull();
    });

    it('shows the hourglass during a refresh when the setting is on', () => {
        const app = buildApp({
            settings: { homeProviderAge: true, activePlaylistId: 'p1', playlists: [{ id: 'p1', showOnHome: true }] },
            playlistCacheTimestamps: {},
        });
        app.updateRefreshProgress('p1', 1, 3, 'TV');
        const el = chip();
        expect(el.classList.contains('hidden')).toBe(false);
        expect(el.querySelector('.hourglass')).not.toBeNull();
        expect(el.textContent).toContain('1/3 TV');
    });

    it('delegates to updateProviderAge when the refresh finishes', () => {
        const app = buildApp({
            settings: { homeProviderAge: true, activePlaylistId: 'p1', playlists: [{ id: 'p1', showOnHome: true }] },
            playlistCacheTimestamps: { p1: 1700000000000 },
        });
        app.updateRefreshProgress('p1', 0, 0, null);
        const el = chip();
        expect(el.classList.contains('hidden')).toBe(false);
        expect(el.querySelector('.hourglass')).toBeNull();
        expect(el.textContent).toContain('mock-ago');
    });
});
