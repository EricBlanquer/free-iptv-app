/**
 * Regression test for the "empty home, only back works" bug
 * (reported 2026-06-15 by a user after modifying the provider list).
 *
 * Symptom: after a provider-list change the home screen looked empty and the
 * only working key was Back (which exits the app) — arrow keys did nothing.
 *
 * Root cause (proven from the code): #home-grid starts with an inline
 * `visibility: hidden` (index.html) and is only revealed inside the terminal
 * branches of autoConnect(). The early-return path `if (!playlist)` in
 * autoConnect (taken when the active playlist became invalid/deleted) called
 * updateHomeMenuVisibility() but NEVER reset the grid visibility. The buttons
 * therefore stayed invisible while still being focusable (visibility:hidden
 * keeps offsetParent), so the user saw nothing and could only press Back.
 *
 * Fix: updateHomeMenuVisibility() itself reveals the grid (visibility = '').
 * Since every terminal home state goes through that function, the grid can no
 * longer be left hidden.
 */

const fs = require('fs');
const vm = require('vm');

const homeCode = fs.readFileSync('./js/features/home.js', 'utf8');

function slicePrototype(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract prototype ' + name);
    return m[0];
}

function buildApp(overrides) {
    function IPTVApp() {}
    const noop = function() {};
    IPTVApp.prototype.isIPTVConfigured = function() { return false; };
    IPTVApp.prototype.getActivePlaylist = function() { return null; };
    IPTVApp.prototype.getCategoryPatterns = function() { return {}; };
    IPTVApp.prototype.hasEntertainmentPatterns = function() { return false; };
    IPTVApp.prototype.hasAppDownloads = function() { return false; };
    IPTVApp.prototype.renderCustomCategoryButtons = noop;
    IPTVApp.prototype.applyHomeTheme = noop;
    IPTVApp.prototype.updateHomeGridLayout = noop;
    IPTVApp.prototype.invalidateFocusables = noop;
    IPTVApp.prototype.clampHomeFocusIndex = noop;
    IPTVApp.prototype.updateFocus = noop;
    IPTVApp.prototype.maybeAutoJumpToLive = noop;

    const ctx = vm.createContext({
        IPTVApp: IPTVApp,
        document: document,
        window: { log: noop },
        JSON: JSON,
    });
    vm.runInContext(slicePrototype(homeCode, 'updateHomeMenuVisibility'), ctx);

    const app = new IPTVApp();
    app.settings = { hiddenDefaultCategories: [] };
    app.focusArea = 'home';
    Object.assign(app, overrides || {});
    return app;
}

const grid = () => document.getElementById('home-grid');
const settingsBtn = () => document.querySelector('#home-grid .home-btn[data-section="settings"]');

describe('updateHomeMenuVisibility reveals the home grid', () => {
    beforeEach(() => {
        document.body.innerHTML =
            '<div id="home-grid" style="visibility: hidden;">' +
            '<div class="home-btn focusable" data-section="settings"></div>' +
            '<div class="home-btn focusable" data-section="vod"></div>' +
            '<div class="home-btn focusable" data-section="live"></div>' +
            '</div>';
    });

    it('reveals the grid when there is no active playlist (the bug path)', () => {
        expect(grid().style.visibility).toBe('hidden');
        const app = buildApp();
        app.updateHomeMenuVisibility();
        expect(grid().style.visibility).toBe('');
    });

    it('keeps the settings button focusable so the home is never empty', () => {
        const app = buildApp();
        app.updateHomeMenuVisibility();
        expect(settingsBtn().style.display).not.toBe('none');
    });

    it('reveals the grid for a configured provider playlist', () => {
        const app = buildApp({
            isIPTVConfigured: function() { return true; },
            getActivePlaylist: function() { return { type: 'provider' }; },
        });
        app.updateHomeMenuVisibility();
        expect(grid().style.visibility).toBe('');
    });
});
