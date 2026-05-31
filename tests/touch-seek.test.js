/**
 * Tests for touch scrubbing on mobile: horizontal swipe on the player seeks
 * the playback position (added 2026-05-31), mirroring the vertical
 * brightness/volume gestures.
 *
 * Covers IPTVApp#beginTouchSeek / updateTouchSeek / endTouchSeek:
 *   - seek is refused for live / catchup / zero-duration content;
 *   - the target position tracks the horizontal delta and is clamped to
 *     [0, duration];
 *   - the seek is applied (player.seekTo) and playback resumes on release.
 */

const fs = require('fs');
const vm = require('vm');

const playbackCode = fs.readFileSync('./js/playback.js', 'utf8');

function slicePrototype(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function buildApp(overrides) {
    function IPTVApp() {}
    IPTVApp.prototype.clearTimer = function() {};
    IPTVApp.prototype.showPlayerOverlay = function() {};
    IPTVApp.prototype.setProgressBarWidth = function() {};
    IPTVApp.prototype.hideSeekIndicator = function() {
        var el = document.getElementById('seek-indicator');
        if (el) el.classList.remove('visible');
    };

    const ctx = vm.createContext({
        IPTVApp: IPTVApp,
        document: document,
        window: { log: function() {} },
        Date: { now: function() { return 1000; } },
    });
    ['beginTouchSeek', 'updateTouchSeek', 'endTouchSeek'].forEach(function(name) {
        vm.runInContext(slicePrototype(playbackCode, name), ctx);
    });

    const app = new IPTVApp();
    Object.assign(app, overrides);
    return app;
}

function fakePlayer(opts) {
    return Object.assign({
        duration: 600000,
        currentTime: 120000,
        isPlaying: true,
        isPaused: false,
        isBuffering: false,
        paused: false,
        seekToCalls: [],
        resumed: false,
        pause: function() { this.isPaused = true; },
        resume: function() { this.resumed = true; },
        seekTo: function(ms) { this.seekToCalls.push(ms); },
        formatTime: function(ms) { return String(Math.round(ms)); },
    }, opts || {});
}

beforeEach(() => {
    document.body.innerHTML =
        '<div id="player-time"></div><div id="player-remaining"></div>' +
        '<div id="seek-indicator"></div>';
});

describe('beginTouchSeek gating', () => {
    it('refuses to seek a live stream', () => {
        const app = buildApp({ currentPlayingType: 'live', player: fakePlayer() });
        expect(app.beginTouchSeek()).toBe(false);
        expect(app._touchSeekActive).toBeFalsy();
    });

    it('refuses to seek a catchup stream', () => {
        const app = buildApp({ currentPlayingType: 'catchup', player: fakePlayer() });
        expect(app.beginTouchSeek()).toBe(false);
    });

    it('refuses when duration is unknown (0)', () => {
        const app = buildApp({ currentPlayingType: 'vod', player: fakePlayer({ duration: 0 }) });
        expect(app.beginTouchSeek()).toBe(false);
    });

    it('starts a touch seek on VOD and pauses if playing', () => {
        const player = fakePlayer();
        const app = buildApp({ currentPlayingType: 'vod', player: player });
        expect(app.beginTouchSeek()).toBe(true);
        expect(app._touchSeekActive).toBe(true);
        expect(app._touchSeekStartPos).toBe(120000);
        expect(app.seekTargetPosition).toBe(120000);
        expect(player.isPaused).toBe(true);
        expect(app._touchSeekWasPlaying).toBe(true);
    });
});

describe('updateTouchSeek clamps the target to [0, duration]', () => {
    it('moves the target forward by the delta', () => {
        const app = buildApp({ currentPlayingType: 'vod', player: fakePlayer() });
        app.beginTouchSeek();
        app.updateTouchSeek(60000);
        expect(app.seekTargetPosition).toBe(180000);
        expect(document.getElementById('seek-indicator').classList.contains('visible')).toBe(true);
    });

    it('clamps to duration when swiping far right', () => {
        const app = buildApp({ currentPlayingType: 'vod', player: fakePlayer() });
        app.beginTouchSeek();
        app.updateTouchSeek(9999999);
        expect(app.seekTargetPosition).toBe(600000);
    });

    it('clamps to 0 when swiping far left', () => {
        const app = buildApp({ currentPlayingType: 'vod', player: fakePlayer() });
        app.beginTouchSeek();
        app.updateTouchSeek(-9999999);
        expect(app.seekTargetPosition).toBe(0);
    });
});

describe('endTouchSeek applies the seek', () => {
    it('seeks to the target and resumes playback when it was playing', () => {
        const player = fakePlayer();
        const app = buildApp({ currentPlayingType: 'vod', player: player });
        app.beginTouchSeek();
        app.updateTouchSeek(60000);
        app.endTouchSeek();
        expect(player.seekToCalls).toEqual([180000]);
        expect(player.resumed).toBe(true);
        expect(app._touchSeekActive).toBe(false);
    });

    it('defers the seek while buffering instead of calling seekTo', () => {
        const player = fakePlayer({ isBuffering: true });
        const app = buildApp({ currentPlayingType: 'vod', player: player });
        app.beginTouchSeek();
        app.updateTouchSeek(30000);
        app.endTouchSeek();
        expect(player.seekToCalls).toEqual([]);
        expect(app._pendingSeekPosition).toBe(150000);
    });

    it('triggers completion when released past the end', () => {
        const player = fakePlayer();
        let completed = false;
        const app = buildApp({
            currentPlayingType: 'vod',
            player: player,
            onPlaybackCompleted: function() { completed = true; },
        });
        app.beginTouchSeek();
        app.updateTouchSeek(9999999);
        app.endTouchSeek();
        expect(completed).toBe(true);
        expect(player.seekToCalls).toEqual([]);
    });
});
