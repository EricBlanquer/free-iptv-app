/**
 * Regression test for: at app launch, the focus on the home grid lands
 * on the same section button the user was on when they last quit
 * (e.g., quit on Sport → relaunch focuses Sport, not the default Live).
 *
 * Two repairs are pinned here:
 *
 *   1) openSection (js/browse.js) MUST persist the section name into
 *      settings.lastViewedSection (with saveSettings) for browse-able
 *      sections only — NOT for the utility screens history / downloads /
 *      settings.
 *
 *   2) setDefaultHomeFocus (js/features/home.js) MUST honour
 *      settings.lastViewedSection when restoring focus, falling back to
 *      the live button if the saved section's home button no longer
 *      exists (e.g., user deleted a custom_* category in settings between
 *      sessions, or hidden a default section like 'sport').
 */

const fs = require('fs');
const vm = require('vm');

const browseCode = fs.readFileSync('./js/browse.js', 'utf8');
const homeCode = fs.readFileSync('./js/features/home.js', 'utf8');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function makeApp(settings, focusables) {
    function IPTVApp() {
        this.settings = settings || {};
        this.focusArea = 'home';
        this.focusIndex = 0;
        this.currentSection = null;
        this.currentScreen = 'home';
        this.savedCount = 0;
        this.data = {};
    }
    IPTVApp.prototype.getAllCategories = function() { return []; };
    IPTVApp.prototype.getFocusables = function() { return focusables || []; };
    IPTVApp.prototype.saveSettings = function() { this.savedCount++; };
    IPTVApp.prototype.showHistoryScreen = function() { this.currentScreen = 'history'; };
    IPTVApp.prototype.showDownloadsScreen = function() { this.currentScreen = 'downloads'; };
    IPTVApp.prototype.showSettings = function() { this.currentScreen = 'settings'; };
    IPTVApp.prototype.showScreen = function() {};
    IPTVApp.prototype.showElement = function() {};
    IPTVApp.prototype.setHidden = function() {};
    IPTVApp.prototype.resetFilters = function() {};
    IPTVApp.prototype.loadCategory = function() {};
    IPTVApp.prototype.log = function() {};
    const ctx = vm.createContext({
        IPTVApp: IPTVApp,
        console: console,
        window: { log: function() {} },
        document: {
            getElementById: function() { return { textContent: '', innerHTML: '' }; }
        },
        I18n: {
            t: function(_, def) { return def || ''; },
            getTntChannels: function() { return []; }
        }
    });
    vm.runInContext(slice(homeCode, 'getHomeButtonIndexBySection'), ctx);
    vm.runInContext(slice(homeCode, 'getHomeLiveButtonIndex'), ctx);
    vm.runInContext(slice(homeCode, 'setDefaultHomeFocus'), ctx);
    vm.runInContext(slice(browseCode, 'openSection'), ctx);
    return new (ctx.IPTVApp)();
}

function btn(section) {
    return { dataset: { section: section } };
}

const HOME_BUTTONS = [
    btn('live'),
    btn('vod'),
    btn('series'),
    btn('sport'),
    btn('manga'),
    btn('entertainment'),
    btn('custom_doc'),
    btn('history'),
    btn('downloads'),
    btn('settings')
];

describe('openSection — persists last viewed section', () => {
    it('saves a regular browse section to settings.lastViewedSection', () => {
        const app = makeApp({}, HOME_BUTTONS);
        app.openSection('sport');
        expect(app.settings.lastViewedSection).toBe('sport');
        expect(app.savedCount).toBe(1);
    });

    it('saves vod / series / live / manga / entertainment / custom_*', () => {
        ['live', 'vod', 'series', 'manga', 'entertainment', 'custom_doc'].forEach(function(section) {
            const app = makeApp({}, HOME_BUTTONS);
            app.openSection(section);
            expect(app.settings.lastViewedSection).toBe(section);
        });
    });

    it('does NOT save history (utility screen, not browse content)', () => {
        const app = makeApp({}, HOME_BUTTONS);
        app.openSection('history');
        expect(app.settings.lastViewedSection).toBeUndefined();
        expect(app.savedCount).toBe(0);
    });

    it('does NOT save downloads', () => {
        const app = makeApp({}, HOME_BUTTONS);
        app.openSection('downloads');
        expect(app.settings.lastViewedSection).toBeUndefined();
    });

    it('does NOT save settings', () => {
        const app = makeApp({}, HOME_BUTTONS);
        app.openSection('settings');
        expect(app.settings.lastViewedSection).toBeUndefined();
    });

    it('does not re-save when re-opening the already-current section (cheap idempotency)', () => {
        const app = makeApp({ lastViewedSection: 'sport' }, HOME_BUTTONS);
        app.openSection('sport');
        expect(app.savedCount).toBe(0);
    });

    it('updates and saves when switching to a different section', () => {
        const app = makeApp({ lastViewedSection: 'sport' }, HOME_BUTTONS);
        app.openSection('manga');
        expect(app.settings.lastViewedSection).toBe('manga');
        expect(app.savedCount).toBe(1);
    });
});

describe('setDefaultHomeFocus — restores focus on last viewed section', () => {
    it('focuses the saved section button at launch', () => {
        const app = makeApp({ lastViewedSection: 'sport' }, HOME_BUTTONS);
        app.focusArea = 'home';
        app.setDefaultHomeFocus();
        expect(app.focusIndex).toBe(3);
    });

    it('focuses live (the default) when no section was saved', () => {
        const app = makeApp({}, HOME_BUTTONS);
        app.focusArea = 'home';
        app.setDefaultHomeFocus();
        expect(app.focusIndex).toBe(0);
    });

    it('falls back to live when the saved section no longer has a home button (custom_* deleted)', () => {
        const app = makeApp({ lastViewedSection: 'custom_was_deleted' }, HOME_BUTTONS);
        app.focusArea = 'home';
        app.setDefaultHomeFocus();
        expect(app.focusIndex).toBe(0);
    });

    it('falls back to live when the saved section was hidden in settings (button removed)', () => {
        const buttonsWithoutSport = HOME_BUTTONS.filter(function(b) { return b.dataset.section !== 'sport'; });
        const app = makeApp({ lastViewedSection: 'sport' }, buttonsWithoutSport);
        app.focusArea = 'home';
        app.setDefaultHomeFocus();
        expect(app.focusIndex).toBe(0);
    });

    it('focuses index 0 when neither saved section nor live is present (degenerate fallback)', () => {
        const app = makeApp({ lastViewedSection: 'nonexistent' }, [btn('settings'), btn('downloads')]);
        app.focusArea = 'home';
        app.setDefaultHomeFocus();
        expect(app.focusIndex).toBe(0);
    });

    it('does nothing when focusArea is not "home" (e.g., currently in player)', () => {
        const app = makeApp({ lastViewedSection: 'sport' }, HOME_BUTTONS);
        app.focusArea = 'player';
        app.focusIndex = 99;
        app.setDefaultHomeFocus();
        expect(app.focusIndex).toBe(99);
    });

    it('correctly restores a custom_* section when it still exists', () => {
        const app = makeApp({ lastViewedSection: 'custom_doc' }, HOME_BUTTONS);
        app.focusArea = 'home';
        app.setDefaultHomeFocus();
        expect(app.focusIndex).toBe(6);
    });
});

describe('getHomeButtonIndexBySection — generic helper', () => {
    let app;

    beforeEach(() => {
        app = makeApp({}, HOME_BUTTONS);
    });

    it('returns the index of a matching button', () => {
        expect(app.getHomeButtonIndexBySection('vod')).toBe(1);
        expect(app.getHomeButtonIndexBySection('series')).toBe(2);
        expect(app.getHomeButtonIndexBySection('manga')).toBe(4);
    });

    it('returns -1 for an unknown section', () => {
        expect(app.getHomeButtonIndexBySection('does_not_exist')).toBe(-1);
    });

    it('returns -1 for a falsy section name (defensive)', () => {
        expect(app.getHomeButtonIndexBySection(null)).toBe(-1);
        expect(app.getHomeButtonIndexBySection('')).toBe(-1);
        expect(app.getHomeButtonIndexBySection(undefined)).toBe(-1);
    });
});

describe('getHomeLiveButtonIndex — backwards-compat wrapper', () => {
    it('returns the index of the live button when present', () => {
        const app = makeApp({}, HOME_BUTTONS);
        expect(app.getHomeLiveButtonIndex()).toBe(0);
    });

    it('returns 0 (degenerate fallback) when live button is missing', () => {
        const app = makeApp({}, [btn('vod'), btn('series')]);
        expect(app.getHomeLiveButtonIndex()).toBe(0);
    });
});
