/**
 * Regression test for the dead Back / frozen-app bug seen by the Whale TV
 * reviewer (2026-06-25) on the 2.0.0 release.
 *
 * Root cause: every confirm dialog reuses the single #confirm-modal. On a
 * fresh, unconfigured launch the welcome-demo modal is shown, then (in the
 * tested build) the in-app APK update prompt fired 3s later and called
 * showConfirmModal() AGAIN, on top of it. showConfirmModal saved
 * confirmModalPreviousFocusArea = this.focusArea unconditionally — which by
 * then was already 'confirm-modal'. So the "previous" focus became the modal
 * itself: dismissing restored focusArea='confirm-modal' over a hidden modal,
 * and Back (backHandlers['focusArea:confirm-modal'] -> confirmModalAction ->
 * hideConfirmModal -> restore 'confirm-modal') looped forever. The native Back
 * is consumed by MainActivity, so it looked completely dead.
 *
 * Fix: showConfirmModal only captures the previous focus when a modal is NOT
 * already open, so confirmModalPreviousFocusArea can never become
 * 'confirm-modal'. Dismissing always returns to the real underlying screen and
 * Back escapes normally.
 *
 * (The update prompt itself is also removed — see whaletv-no-inapp-update — but
 * this guard hardens the whole class of stacked-modal freezes.)
 */

const fs = require('fs');

function extractMethod(src, name) {
    const lines = src.split('\n');
    const start = lines.findIndex(function(l) {
        return l.indexOf('IPTVApp.prototype.' + name + ' = function') === 0;
    });
    if (start < 0) throw new Error('method not found: ' + name);
    for (let i = start; i < lines.length; i++) {
        if (lines[i] === '};') {
            return lines.slice(start, i + 1).join('\n').replace('IPTVApp.prototype.', 'TestApp.prototype.');
        }
    }
    throw new Error('method end not found: ' + name);
}

const settingsSrc = fs.readFileSync('./js/settings.js', 'utf8');

function buildApp() {
    document.body.innerHTML =
        '<div id="confirm-modal" class="hidden"></div>' +
        '<div id="confirm-modal-title"></div>' +
        '<div id="confirm-modal-message"></div>' +
        '<div id="confirm-yes-btn"></div>' +
        '<div id="confirm-no-btn"></div>';

    global.I18n = { t: function(k, d) { return d || k; } };
    global.window = global.window || {};
    window.log = function() {};

    function TestApp() {}
    TestApp.prototype.setHidden = function(el, hidden) {
        if (typeof el === 'string') el = document.getElementById(el);
        if (el) el.classList.toggle('hidden', hidden);
    };
    TestApp.prototype.updateFocus = function() {};
    TestApp.prototype.getFocusables = function() { return []; };

    /* eslint-disable no-eval */
    eval(extractMethod(settingsSrc, 'showConfirmModal'));
    eval(extractMethod(settingsSrc, 'hideConfirmModal'));
    eval(extractMethod(settingsSrc, 'confirmModalAction'));
    /* eslint-enable no-eval */

    return new TestApp();
}

describe('showConfirmModal does not corrupt the saved focus when modals stack', () => {
    it('a single modal restores the real underlying screen on dismiss', () => {
        const app = buildApp();
        app.focusArea = 'home';
        app.focusIndex = 3;

        app.showConfirmModal('msg', function() {}, {});
        expect(app.focusArea).toBe('confirm-modal');
        expect(app.confirmModalPreviousFocusArea).toBe('home');
        expect(app.confirmModalPreviousFocusIndex).toBe(3);

        app.hideConfirmModal();
        expect(app.focusArea).toBe('home');
        expect(app.focusIndex).toBe(3);
    });

    it('a second modal stacked on the first never saves "confirm-modal" as previous', () => {
        const app = buildApp();
        app.focusArea = 'home';
        app.focusIndex = 3;

        // welcome-demo modal
        app.showConfirmModal('demo', function() {}, { noAction: function() {} });
        expect(app.focusArea).toBe('confirm-modal');

        // update prompt (or any modal) fires on top
        app.showConfirmModal('update', function() {}, {});
        expect(app.confirmModalPreviousFocusArea).toBe('home');
        expect(app.confirmModalPreviousFocusArea).not.toBe('confirm-modal');

        // dismiss -> back to the real screen, NOT a dead loop on the modal
        app.confirmModalAction(false);
        expect(app.focusArea).toBe('home');
        expect(app.focusIndex).toBe(3);
    });

    it('Back (confirmModalAction) escapes to the underlying screen, breaking the dead loop', () => {
        const app = buildApp();
        app.focusArea = 'browse';
        app.focusIndex = 7;

        app.showConfirmModal('a', function() {}, {});
        app.showConfirmModal('b', function() {}, {}); // stacked

        app.confirmModalAction(false); // simulates Back
        expect(app.focusArea).toBe('browse');
        // a subsequent Back would now dispatch to backHandlers['focusArea:browse'],
        // never again to 'confirm-modal'
        expect(app.focusArea).not.toBe('confirm-modal');
    });
});
