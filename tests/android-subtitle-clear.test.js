/**
 * Regression test for embedded/native subtitles staying frozen on screen
 * (reported 2026-05-31 on Android).
 *
 * Root cause: the Android native player (NativePlayer.java onCues) emits
 * onsubtitlechange(0, text) — duration is hardcoded to 0, and the end of a
 * cue is signalled by an empty-text call. The old listener only acted when
 * `subtitleText` was truthy and only cleared via a duration-based timer, so:
 *   - duration 0 => no clear timer was ever armed;
 *   - the empty-text "end of cue" call was ignored.
 * Result: the last cue stayed on screen during dialogue-free passages.
 *
 * Fix: TVPlayer#_renderSubtitleCue clears the overlay on an empty cue
 * (driven by the player's own onCues end signal), independently of duration.
 */

const fs = require('fs');
const vm = require('vm');

const playerCode = fs.readFileSync('./js/player.js', 'utf8');

function sliceClassMethod(src, name, proto) {
    const re = new RegExp('^    ' + name + '(\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n    \\})', 'm');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract method ' + name);
    return proto + '.prototype.' + name + ' = function' + m[1] + ';';
}

function buildPlayer(overrides) {
    function P() {}
    const ctx = vm.createContext({
        P: P,
        document: document,
        window: window,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        Date: Date,
    });
    vm.runInContext(sliceClassMethod(playerCode, '_renderSubtitleCue', 'P'), ctx);
    const player = new P();
    Object.assign(player, overrides);
    return player;
}

const overlay = () => document.getElementById('subtitle-display');

beforeAll(() => {
    window.displaySubtitle = function(el, text) { if (el) el.innerHTML = text || ''; };
    window.log = function() {};
    window.app = null;
});

beforeEach(() => {
    document.body.innerHTML = '<div id="subtitle-display"></div>';
});

describe('TVPlayer#_renderSubtitleCue clears native cues on the empty-cue signal', () => {
    it('clears the overlay when an empty cue arrives (the bug)', () => {
        const player = buildPlayer({ subtitlesEnabled: true });
        player._renderSubtitleCue(0, 'Fucking go for it !');
        expect(overlay().innerHTML).toContain('Fucking go for it');

        player._renderSubtitleCue(0, '');
        expect(overlay().innerHTML).toBe('');
    });

    it('shows a cue with duration 0 (Android) without arming a clear timer', () => {
        const player = buildPlayer({ subtitlesEnabled: true });
        player._renderSubtitleCue(0, 'Hello');
        expect(overlay().innerHTML).toContain('Hello');
        expect(player.subtitleClearTimer).toBeFalsy();
    });

    it('arms a clear timer when a positive duration is provided (Tizen/AVPlay)', () => {
        const player = buildPlayer({ subtitlesEnabled: true });
        player._renderSubtitleCue(2000, 'Bonjour');
        expect(overlay().innerHTML).toContain('Bonjour');
        expect(player.subtitleClearTimer).toBeTruthy();
        clearTimeout(player.subtitleClearTimer);
    });

    it('cancels a previous timer when a new cue replaces the current one', () => {
        const player = buildPlayer({ subtitlesEnabled: true });
        player._renderSubtitleCue(2000, 'First');
        const firstTimer = player.subtitleClearTimer;
        player._renderSubtitleCue(0, 'Second');
        expect(overlay().innerHTML).toContain('Second');
        expect(player.subtitleClearTimer).not.toBe(firstTimer);
    });

    it('does nothing when subtitles are disabled', () => {
        const player = buildPlayer({ subtitlesEnabled: false });
        player._renderSubtitleCue(0, 'Should not show');
        expect(overlay().innerHTML).toBe('');
    });

    it('newlines are converted to <br>', () => {
        const player = buildPlayer({ subtitlesEnabled: true });
        player._renderSubtitleCue(0, 'line1\nline2');
        expect(overlay().innerHTML).toBe('line1<br>line2');
    });
});
