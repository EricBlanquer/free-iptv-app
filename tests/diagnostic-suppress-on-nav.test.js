/**
 * Regression test for: stale connection-problem modal popping up after the user
 * navigated away (reported 2026-06-05).
 *
 * A provider that times out triggers NetworkDiagnostic.runAndShow() only after
 * its retries exhaust (tens of seconds). If, in the meantime, the user went to
 * Settings / playlist-edit to add or pick another provider, the modal used to
 * appear anyway (and even force the screen back to home). runAndShow() must now
 * suppress the modal when the user has navigated to manage providers, or when
 * the provider instance that triggered it is no longer the active one.
 */

const fs = require('fs');

// Trusted project source; eval so the test runs the shipped IIFE that installs
// window.NetworkDiagnostic.
global.window.log = function() {};
global.I18n = { t: function(k, d) { return d || k; } };
global.fetch = function() { return Promise.reject(new Error('no-net')); };
// eslint-disable-next-line no-eval
eval(fs.readFileSync('./js/core/diagnostic.js', 'utf8'));

const runAndShow = window.NetworkDiagnostic.runAndShow;

function makeApp(over) {
    const api = {};
    return Object.assign({
        currentScreen: 'home',
        settings: {},
        api: api,
        getActivePlaylist: function() { return { serverUrl: 'http://srv' }; },
        showLoading: function() {},
        showScreen: function() {},
        updateHomeMenuVisibility: function() {},
        updateFocus: function() {},
        showConfirmModal: jest.fn()
    }, over);
}

describe('NetworkDiagnostic.runAndShow: suppress stale modal after navigation', () => {
    it('suppresses the modal while the user is on the settings screen', () => {
        const app = makeApp({ currentScreen: 'settings' });
        runAndShow(app, 'http://srv/x', 'timeout', app.api);
        expect(app.showConfirmModal).not.toHaveBeenCalled();
    });

    it('suppresses the modal while the user is on the playlist-edit screen', () => {
        const app = makeApp({ currentScreen: 'playlist-edit' });
        runAndShow(app, 'http://srv/x', 'timeout', app.api);
        expect(app.showConfirmModal).not.toHaveBeenCalled();
    });

    it('suppresses the modal when the triggering provider is no longer active', () => {
        const app = makeApp();
        const otherApi = {};
        runAndShow(app, 'http://srv/x', 'timeout', otherApi);
        expect(app.showConfirmModal).not.toHaveBeenCalled();
    });

    it('shows the modal on home when the active provider really fails', () => {
        const app = makeApp();
        runAndShow(app, 'http://srv/x', 'timeout', app.api);
        expect(app.showConfirmModal).toHaveBeenCalledTimes(1);
    });
});
