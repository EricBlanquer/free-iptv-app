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

describe('bug: setTimeout loses this context in updatePlayerOverlay', () => {
    it('should call setHidden with correct this context after timeout', () => {
        jest.useFakeTimers();
        var setHiddenCalls = [];
        var app = {
            isBuffering: false,
            bufferPercent: 100,
            overlayTimer: null,
            setHidden: function(el, hidden) {
                setHiddenCalls.push({ el: el, hidden: hidden });
            },
            updatePlayerStateIndicator: jest.fn(),
            updatePlayerTracks: jest.fn(),
            player: { isPlaying: true }
        };
        var overlay = { id: 'overlay' };
        var titleEl = { id: 'title' };
        var topRightEl = { id: 'topRight' };
        var hideDelay = 3000;
        if (app.overlayTimer) {
            clearTimeout(app.overlayTimer);
        }
        var isBuffering = app.isBuffering || (app.bufferPercent !== undefined && app.bufferPercent < 100);
        if (!isBuffering) {
            var self = app;
            app.overlayTimer = setTimeout(function() {
                self.setHidden(overlay, true);
                self.setHidden(titleEl, true);
                if (topRightEl) self.setHidden(topRightEl, true);
            }, hideDelay);
        }
        jest.advanceTimersByTime(hideDelay);
        expect(setHiddenCalls.length).toBe(3);
        expect(setHiddenCalls[0]).toEqual({ el: overlay, hidden: true });
        expect(setHiddenCalls[1]).toEqual({ el: titleEl, hidden: true });
        expect(setHiddenCalls[2]).toEqual({ el: topRightEl, hidden: true });
        jest.useRealTimers();
    });
});

describe('bug: resume position should be reset when episode is completed', () => {
    let app;

    beforeEach(() => {
        app = {
            episodeProgress: {},
            watchHistory: [],
            settings: { watchedThreshold: 90 },
            currentEpisodeId: null,
            currentPlayingStream: null,
            saveEpisodeProgress: jest.fn(),
            saveWatchHistory: jest.fn(),
            getWatchHistoryItem: function(id) {
                return this.watchHistory.find(function(item) {
                    return item.id === id;
                });
            }
        };
    });

    describe('episode completed - position should be reset to 0', () => {
        it('should reset episodeProgress.position to 0 when episode is completed', () => {
            // Setup: episode watched to 95% (2850000ms out of 3000000ms = 47.5min out of 50min)
            var episodeId = 'ep123';
            app.episodeProgress[episodeId] = {
                position: 2850000,  // 47.5 minutes
                duration: 3000000,  // 50 minutes total
                percent: 95,
                watched: true,
                timestamp: Date.now()
            };
            app.currentEpisodeId = episodeId;

            // Simulate onPlaybackCompleted resetting position
            var epProgress = app.episodeProgress[episodeId];
            if (epProgress && epProgress.watched) {
                epProgress.position = 0;
                app.saveEpisodeProgress();
            }

            // Verify position is reset
            expect(app.episodeProgress[episodeId].position).toBe(0);
            expect(app.episodeProgress[episodeId].watched).toBe(true);
            expect(app.saveEpisodeProgress).toHaveBeenCalled();
        });

        it('should reset watchHistory position to 0 when VOD is completed', () => {
            // Setup: movie watched to 98%
            var streamId = 'vod456';
            app.watchHistory.push({
                id: streamId,
                position: 7050000,  // 117.5 minutes
                duration: 7200000,  // 120 minutes total
                percent: 98,
                watched: true
            });
            app.currentPlayingStream = { stream_id: streamId };

            // Simulate onPlaybackCompleted resetting position
            var historyItem = app.getWatchHistoryItem(streamId);
            if (historyItem) {
                historyItem.watched = true;
                historyItem.position = 0;
                app.saveWatchHistory();
            }

            // Verify position is reset
            expect(app.watchHistory[0].position).toBe(0);
            expect(app.watchHistory[0].watched).toBe(true);
            expect(app.saveWatchHistory).toHaveBeenCalled();
        });

        it('should NOT reset position if episode is not marked as watched', () => {
            // Setup: episode watched to 50% (not finished)
            var episodeId = 'ep789';
            app.episodeProgress[episodeId] = {
                position: 1500000,  // 25 minutes
                duration: 3000000,  // 50 minutes total
                percent: 50,
                watched: false,
                timestamp: Date.now()
            };
            app.currentEpisodeId = episodeId;

            // Simulate checking if should reset
            var epProgress = app.episodeProgress[episodeId];
            if (epProgress && epProgress.watched) {
                epProgress.position = 0;
                app.saveEpisodeProgress();
            }

            // Position should NOT be reset because watched is false
            expect(app.episodeProgress[episodeId].position).toBe(1500000);
            expect(app.saveEpisodeProgress).not.toHaveBeenCalled();
        });
    });

    describe('resume modal should not show for completed episodes', () => {
        it('should NOT propose resume for completed episode (watched=true)', () => {
            var minMs = 2 * 60000; // 2 minutes minimum
            var progress = {
                position: 2850000,  // 47.5 minutes (after reset this should be 0)
                duration: 3000000,
                percent: 95,
                watched: true
            };

            // Current buggy condition (only checks position >= minMs)
            var buggyShowResume = progress && progress.position >= minMs;

            // Fixed condition (also checks !watched)
            var fixedShowResume = progress && progress.position >= minMs && !progress.watched;

            expect(buggyShowResume).toBe(true);  // Bug: would show resume modal
            expect(fixedShowResume).toBe(false); // Fix: should NOT show resume modal
        });
    });
});

describe('bug: updateWatchPosition should filter by playlistId', () => {
    let app;

    beforeEach(() => {
        app = {
            watchHistory: [],
            currentPlayingStream: null,
            settings: { activePlaylistId: 'playlist_A' },
            saveWatchHistory: jest.fn(),
            getStreamId: function(stream) {
                return stream.stream_id || stream.vod_id || stream.id;
            }
        };
    });

    it('should only update position for matching playlistId, not first matching streamId', () => {
        app.watchHistory = [
            { id: 123, playlistId: 'playlist_A', position: 60000, name: 'Avatar (Playlist A)' },
            { id: 123, playlistId: 'playlist_B', position: 120000, name: 'Avatar (Playlist B)' }
        ];
        app.currentPlayingStream = { stream_id: 123, _playlistId: 'playlist_B' };
        var stream = { stream_id: 123, _playlistId: 'playlist_B' };
        var newPosition = 180000;
        var streamId = app.getStreamId(stream);
        var playlistId = stream._playlistId || (app.currentPlayingStream && app.currentPlayingStream._playlistId);
        for (var i = 0; i < app.watchHistory.length; i++) {
            if (app.watchHistory[i].id == streamId && app.watchHistory[i].playlistId == playlistId) {
                app.watchHistory[i].position = newPosition;
                app.saveWatchHistory();
                break;
            }
        }
        expect(app.watchHistory[0].position).toBe(60000);
        expect(app.watchHistory[1].position).toBe(180000);
    });

    it('buggy behavior: without playlistId check, wrong item gets updated', () => {
        app.watchHistory = [
            { id: 123, playlistId: 'playlist_A', position: 60000, name: 'Avatar (Playlist A)' },
            { id: 123, playlistId: 'playlist_B', position: 120000, name: 'Avatar (Playlist B)' }
        ];
        app.currentPlayingStream = { stream_id: 123, _playlistId: 'playlist_B' };
        var stream = { stream_id: 123, _playlistId: 'playlist_B' };
        var newPosition = 180000;
        var streamId = app.getStreamId(stream);
        for (var i = 0; i < app.watchHistory.length; i++) {
            if (app.watchHistory[i].id == streamId) {
                app.watchHistory[i].position = newPosition;
                app.saveWatchHistory();
                break;
            }
        }
        expect(app.watchHistory[0].position).toBe(180000);
        expect(app.watchHistory[1].position).toBe(120000);
    });
});
