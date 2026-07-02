/**
 * Regression test for the Samsung TV certification defects (2026-06-29, v1.0.7,
 * LIC model groups):
 *   - "Network error doesn't remain in screen": when the network drops during
 *     playback, a persistent error popup must be shown (the old code only
 *     flashed a transient toast, then returned to Browse).
 *   - "Content does not resume after connect the network": when the network is
 *     restored, playback must resume automatically from the saved position.
 *
 * The fix adds a playback network monitor (js/playback.js) that shows a
 * persistent confirm-modal popup on loss and re-issues playStream() on restore.
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

const playbackSrc = fs.readFileSync('./js/playback.js', 'utf8');
const settingsSrc = fs.readFileSync('./js/settings.js', 'utf8');

function buildApp(opts) {
    opts = opts || {};
    document.body.innerHTML =
        '<div id="confirm-modal" class="hidden"></div>' +
        '<div id="confirm-modal-title"></div>' +
        '<div id="confirm-modal-message"></div>' +
        '<div id="confirm-yes-btn"></div>' +
        '<div id="confirm-no-btn"></div>';

    global.I18n = { t: function(k, d) { return d || k; } };
    global.window = global.window || {};
    window.log = function() {};
    window.NetworkDiagnostic = {
        _offline: false,
        isLikelyOffline: function() { return window.NetworkDiagnostic._offline; }
    };

    function TestApp() {}
    TestApp.prototype.setHidden = function(el, hidden) {
        if (typeof el === 'string') el = document.getElementById(el);
        if (el) el.classList.toggle('hidden', hidden);
    };
    TestApp.prototype.updateFocus = function() {};
    TestApp.prototype.getFocusables = function() { return []; };
    TestApp.prototype.showLoading = function() {};
    TestApp.prototype.getStreamId = function(s) { return s ? s.stream_id : null; };
    TestApp.prototype.playStream = jest.fn();
    TestApp.prototype.stopPlayback = jest.fn();

    /* eslint-disable no-eval */
    eval(extractMethod(settingsSrc, 'showConfirmModal'));
    eval(extractMethod(settingsSrc, 'hideConfirmModal'));
    eval(extractMethod(settingsSrc, 'confirmModalAction'));
    eval(extractMethod(playbackSrc, 'isPlaybackActive'));
    eval(extractMethod(playbackSrc, '_isOfflineNow'));
    eval(extractMethod(playbackSrc, 'handlePlaybackNetworkLost'));
    eval(extractMethod(playbackSrc, 'handlePlaybackNetworkRestored'));
    eval(extractMethod(playbackSrc, 'startNetworkRecoveryPoll'));
    eval(extractMethod(playbackSrc, 'stopNetworkRecoveryPoll'));
    eval(extractMethod(playbackSrc, 'showNetworkLostPopup'));
    eval(extractMethod(playbackSrc, 'hideNetworkLostPopup'));
    eval(extractMethod(playbackSrc, 'cancelNetworkRecovery'));
    /* eslint-enable no-eval */

    const app = new TestApp();
    app.currentScreen = 'player';
    app.focusArea = 'player';
    app.focusIndex = 0;
    app.currentPlayingStream = { stream_id: 42 };
    app.currentPlayingType = opts.type || 'vod';
    app.player = {
        stop: jest.fn(),
        getCurrentTime: function() { return opts.position != null ? opts.position : 90000; }
    };
    return app;
}

function modalHidden() {
    return document.getElementById('confirm-modal').classList.contains('hidden');
}

describe('network loss during playback (Samsung cert regression)', () => {
    afterEach(() => { jest.useRealTimers(); });

    it('shows a PERSISTENT error popup when the network drops (bug: error must remain on screen)', () => {
        const app = buildApp({ type: 'vod', position: 120000 });
        window.NetworkDiagnostic._offline = true;

        app.handlePlaybackNetworkLost();

        expect(modalHidden()).toBe(false);            // popup is visible...
        expect(app.focusArea).toBe('confirm-modal');  // ...and stays (persistent), not a toast
        expect(app._networkPopupShown).toBe(true);
        expect(app.player.stop).toHaveBeenCalled();
        expect(app._resumeAfterNetwork).toEqual({ streamId: 42, type: 'vod', stream: app.currentPlayingStream, position: 120000 });
    });

    it('auto-resumes from the saved position when the network is restored (bug: content must resume)', () => {
        const app = buildApp({ type: 'vod', position: 120000 });
        window.NetworkDiagnostic._offline = true;
        app.handlePlaybackNetworkLost();

        window.NetworkDiagnostic._offline = false;
        app.handlePlaybackNetworkRestored();

        expect(app.playStream).toHaveBeenCalledWith(42, 'vod', app.currentPlayingStream, 120000);
        expect(modalHidden()).toBe(true);       // popup dismissed on resume
        expect(app._networkLost).toBe(false);
    });

    it('live streams resume from the start (position 0)', () => {
        const app = buildApp({ type: 'live' });
        window.NetworkDiagnostic._offline = true;
        app.handlePlaybackNetworkLost();
        expect(app._resumeAfterNetwork.position).toBe(0);

        window.NetworkDiagnostic._offline = false;
        app.handlePlaybackNetworkRestored();
        expect(app.playStream).toHaveBeenCalledWith(42, 'live', app.currentPlayingStream, 0);
    });

    it('the recovery poll resumes playback once connectivity comes back', () => {
        jest.useFakeTimers();
        const app = buildApp({ type: 'vod', position: 5000 });
        window.NetworkDiagnostic._offline = true;
        app.handlePlaybackNetworkLost();
        expect(app.playStream).not.toHaveBeenCalled();

        window.NetworkDiagnostic._offline = false;
        jest.advanceTimersByTime(2600);

        expect(app.playStream).toHaveBeenCalledWith(42, 'vod', app.currentPlayingStream, 5000);
    });

    it('pressing OK on the popup stops playback and cancels the auto-resume', () => {
        const app = buildApp({ type: 'vod', position: 5000 });
        window.NetworkDiagnostic._offline = true;
        app.handlePlaybackNetworkLost();

        // OK button = the "no" action of the OK-only confirm modal
        app.confirmModalAction(false);

        expect(app.stopPlayback).toHaveBeenCalled();
        expect(app._networkLost).toBe(false);
        expect(app._resumeAfterNetwork).toBe(null);

        // a late "online" event must NOT resume after the user chose to exit
        window.NetworkDiagnostic._offline = false;
        app.handlePlaybackNetworkRestored();
        expect(app.playStream).not.toHaveBeenCalled();
    });

    it('does nothing when no stream is playing (not on the player screen)', () => {
        const app = buildApp({ type: 'vod' });
        app.currentScreen = 'home';
        app.currentPlayingStream = null;

        app.handlePlaybackNetworkLost();

        expect(modalHidden()).toBe(true);
        expect(app._networkLost).toBeFalsy();
    });
});
