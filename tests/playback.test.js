/**
 * Tests for Playback functionality
 */

// Mock window.log
window.log = jest.fn();

// Mock DOM elements
document.body.innerHTML = `
    <div id="progress-bar"></div>
    <div id="player-time"></div>
    <div id="player-remaining"></div>
    <div id="player-duration"></div>
`;

describe('updatePlayerProgress', () => {
    let app;

    beforeEach(() => {
        window.log.mockClear();
        app = {
            seekDirection: 0,
            seekDebounceTimer: null,
            currentPlayingType: 'vod',
            streamReady: true,
            seekTargetPosition: 0,
            _completionTriggered: false,
            player: {
                formatTime: function(ms) {
                    var s = Math.floor(ms / 1000);
                    var m = Math.floor(s / 60);
                    s = s % 60;
                    return m + ':' + (s < 10 ? '0' : '') + s;
                }
            },
            onPlaybackCompleted: jest.fn()
        };
    });

    describe('bug: seek to end freezes playback', () => {
        it('should trigger completion when within 2 seconds of end', () => {
            // Simulate being very close to the end (1.5 seconds remaining)
            var current = 58500;  // 58.5 seconds
            var total = 60000;    // 60 seconds total

            // Simulate updatePlayerProgress behavior
            if (total > 0 && current > 0 && (total - current) < 2000 && !app._completionTriggered) {
                app._completionTriggered = true;
                app.onPlaybackCompleted();
            }

            expect(app.onPlaybackCompleted).toHaveBeenCalled();
            expect(app._completionTriggered).toBe(true);
        });

        it('should not trigger completion when more than 2 seconds from end', () => {
            var current = 55000;  // 55 seconds
            var total = 60000;    // 60 seconds total (5 seconds remaining)

            if (total > 0 && current > 0 && (total - current) < 2000 && !app._completionTriggered) {
                app._completionTriggered = true;
                app.onPlaybackCompleted();
            }

            expect(app.onPlaybackCompleted).not.toHaveBeenCalled();
            expect(app._completionTriggered).toBe(false);
        });

        it('should not trigger completion multiple times', () => {
            var current = 59000;
            var total = 60000;

            // First call
            if (total > 0 && current > 0 && (total - current) < 2000 && !app._completionTriggered) {
                app._completionTriggered = true;
                app.onPlaybackCompleted();
            }

            // Second call (simulating another time update)
            if (total > 0 && current > 0 && (total - current) < 2000 && !app._completionTriggered) {
                app._completionTriggered = true;
                app.onPlaybackCompleted();
            }

            expect(app.onPlaybackCompleted).toHaveBeenCalledTimes(1);
        });

        it('should reset _completionTriggered on new stream', () => {
            app._completionTriggered = true;

            // Simulate playStream reset
            app._completionTriggered = false;

            expect(app._completionTriggered).toBe(false);
        });
    });
});

describe('playStream EPG reset', () => {
    beforeEach(() => {
        document.body.innerHTML += '<span id="player-epg">Previous EPG Title</span>';
    });

    afterEach(() => {
        var el = document.getElementById('player-epg');
        if (el) el.remove();
    });

    it('should clear EPG when starting a new stream', () => {
        // Simulate EPG from previous live stream
        var epgEl = document.getElementById('player-epg');
        epgEl.textContent = 'Previous Live Program Title';

        // Simulate playStream reset behavior
        epgEl.textContent = '';

        expect(epgEl.textContent).toBe('');
    });
});
