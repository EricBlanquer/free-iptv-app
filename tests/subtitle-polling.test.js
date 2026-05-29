/**
 * Regression test for the "frozen subtitle" bug reported on Android.
 *
 * Symptom: with external (SRT) subtitles, once a line ends the last cue stays
 * displayed for up to several minutes — until the NEXT cue appears.
 *
 * Root cause: external-subtitle rendering was driven solely by the player's
 * onTimeUpdate callback. On Android that callback maps to the native HTML5
 * 'timeupdate' DOM event, which can stall during long dialogue-free passages.
 * While it is stalled, displayExternalSubtitle() is never re-invoked, so the
 * gap after a cue's end is never observed and the cue is never cleared.
 *
 * Fix: a 250ms polling loop re-evaluates the active cue from the LIVE playback
 * position (read directly off the <video> element, not the cached value that
 * the stalled timeupdate would leave frozen), so a cue is cleared at its end
 * regardless of timeupdate cadence.
 *
 * This test loads the REAL functions from js/playback.js via the same VM-slice
 * technique used by the focus/details reachability tests.
 */

const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('./js/playback.js', 'utf8');

function slice(name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = code.match(re);
    if (!m) throw new Error('Could not extract ' + name + ' from js/playback.js');
    return m[0];
}

function IPTVApp() {}

const calls = { displaySubtitle: [] };

const ctx = vm.createContext({
    IPTVApp: IPTVApp,
    Math: Math,
    // Delegate to the test realm's globals at CALL time so jest fake timers
    // (which reassign global.setInterval/clearInterval) are honoured.
    setInterval: function(fn, ms) { return setInterval(fn, ms); },
    clearInterval: function(id) { return clearInterval(id); },
    window: {
        log: function() {},
        displaySubtitle: function(el, text) { calls.displaySubtitle.push(text); }
    },
    document: {
        getElementById: function() { return {}; }
    }
});

vm.runInContext([
    slice('displayExternalSubtitle'),
    slice('getSubtitlePlaybackTimeMs'),
    slice('startSubtitlePolling'),
    slice('stopSubtitlePolling')
].join('\n'), ctx);

function makeApp() {
    const app = Object.create(IPTVApp.prototype);
    app.applySubtitlePosition = function() {};
    app.resetSubtitlePosition = function() {};
    app.currentSubtitleIndex = -2;
    app.subtitleOffset = 0;
    app.lastExternalSubtitle = null;
    // First cue 1s-3s, then a long silence before the next cue at 10:00.
    app.externalSubtitles = [
        { start: 1000, end: 3000, text: 'Hello', align: null, pos: null },
        { start: 600000, end: 603000, text: 'Much later', align: null, pos: null }
    ];
    app.player = {
        useHtml5: true,
        videoElement: { currentTime: 0 },
        currentTime: 0
    };
    return app;
}

describe('external subtitle frozen-cue bug', () => {
    beforeEach(() => {
        calls.displaySubtitle.length = 0;
    });

    it('reads the LIVE video position, not the cached (possibly stalled) currentTime', () => {
        const app = makeApp();
        app.player.currentTime = 2000;          // cached value frozen by a stalled timeupdate
        app.player.videoElement.currentTime = 4; // real position has advanced past the cue end
        expect(app.getSubtitlePlaybackTimeMs()).toBe(4000);
    });

    it('clears the cue once playback passes its end (the gap is observed)', () => {
        const app = makeApp();

        app.displayExternalSubtitle(2000);
        expect(calls.displaySubtitle).toEqual(['Hello']);

        // Playback has moved into the silent gap after the cue.
        app.displayExternalSubtitle(4000);
        expect(calls.displaySubtitle).toEqual(['Hello', '']);
        expect(app.lastExternalSubtitle).toBeNull();
    });

    it('documents the bug: feeding the stale cached time keeps the cue frozen', () => {
        const app = makeApp();
        app.displayExternalSubtitle(2000);
        // Re-evaluating at the SAME stale time never clears the cue — this is
        // exactly what happened when only the stalled timeupdate drove rendering.
        app.displayExternalSubtitle(2000);
        expect(calls.displaySubtitle).toEqual(['Hello']);
        expect(app.lastExternalSubtitle).toBe('Hello');
    });

    it('keeps the cue while paused mid-line (live position does not advance)', () => {
        const app = makeApp();
        app.player.videoElement.currentTime = 2; // 2000ms, inside the cue
        app.displayExternalSubtitle(app.getSubtitlePlaybackTimeMs());
        expect(calls.displaySubtitle).toEqual(['Hello']);
        // Paused: same position on the next poll → still shown, not cleared.
        app.displayExternalSubtitle(app.getSubtitlePlaybackTimeMs());
        expect(calls.displaySubtitle).toEqual(['Hello']);
    });
});

describe('subtitle polling lifecycle', () => {
    beforeEach(() => {
        calls.displaySubtitle.length = 0;
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('polling clears a frozen cue even when onTimeUpdate never fires again', () => {
        const app = makeApp();

        // A cue is shown, then the native timeupdate event stalls for good.
        app.player.videoElement.currentTime = 2; // 2000ms, inside the cue
        app.displayExternalSubtitle(app.getSubtitlePlaybackTimeMs());
        expect(calls.displaySubtitle).toEqual(['Hello']);

        app.startSubtitlePolling();

        // Real playback advances into the gap while timeupdate stays silent.
        app.player.videoElement.currentTime = 5; // 5000ms, past the cue end
        jest.advanceTimersByTime(250);

        expect(calls.displaySubtitle).toEqual(['Hello', '']);
        expect(app.lastExternalSubtitle).toBeNull();

        app.stopSubtitlePolling();
    });

    it('stopSubtitlePolling halts further evaluation', () => {
        const app = makeApp();
        app.startSubtitlePolling();
        app.stopSubtitlePolling();

        app.player.videoElement.currentTime = 2;
        jest.advanceTimersByTime(1000);
        expect(calls.displaySubtitle).toEqual([]);
    });

    it('polling is a no-op when external subtitles are not the active track', () => {
        const app = makeApp();
        app.currentSubtitleIndex = -1; // embedded/native track or disabled
        app.startSubtitlePolling();
        app.player.videoElement.currentTime = 2;
        jest.advanceTimersByTime(1000);
        expect(calls.displaySubtitle).toEqual([]);
        app.stopSubtitlePolling();
    });
});
