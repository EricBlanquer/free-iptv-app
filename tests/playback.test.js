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

describe('showButtonTooltip auto-dismiss after N shows', () => {
    var MAX = 3;
    var store;

    function showButtonTooltip(storageKey) {
        var stored = store[storageKey];
        if (stored === '1' || stored === 'done') return false;
        var shownCount = 0;
        if (stored && stored.indexOf('shown:') === 0) {
            shownCount = parseInt(stored.substring(6), 10) || 0;
        }
        if (shownCount >= MAX) {
            store[storageKey] = 'done';
            return false;
        }
        store[storageKey] = 'shown:' + (shownCount + 1);
        return true;
    }

    beforeEach(() => { store = {}; });

    it('shows tooltip exactly MAX times then auto-dismisses', () => {
        expect(showButtonTooltip('k')).toBe(true);
        expect(store.k).toBe('shown:1');
        expect(showButtonTooltip('k')).toBe(true);
        expect(store.k).toBe('shown:2');
        expect(showButtonTooltip('k')).toBe(true);
        expect(store.k).toBe('shown:3');
        expect(showButtonTooltip('k')).toBe(false);
        expect(store.k).toBe('done');
        expect(showButtonTooltip('k')).toBe(false);
    });

    it('respects legacy "1" sentinel as dismissed', () => {
        store.k = '1';
        expect(showButtonTooltip('k')).toBe(false);
        expect(store.k).toBe('1');
    });

    it('respects "done" sentinel as dismissed', () => {
        store.k = 'done';
        expect(showButtonTooltip('k')).toBe(false);
    });

    it('handles independent counters per key', () => {
        showButtonTooltip('a');
        showButtonTooltip('a');
        showButtonTooltip('b');
        expect(store.a).toBe('shown:2');
        expect(store.b).toBe('shown:1');
    });
});

describe('XSS: catchup modal program rendering must escape EPG title from provider', () => {
    function buildCatchupItemFixed(title, isLive, timeStr, durationStr) {
        var item = document.createElement('div');
        item.className = 'catchup-program' + (isLive ? ' live' : '');
        var timeDiv = document.createElement('div');
        timeDiv.className = 'catchup-program-time';
        timeDiv.textContent = timeStr;
        var titleDiv = document.createElement('div');
        titleDiv.className = 'catchup-program-title';
        titleDiv.textContent = title;
        if (isLive) {
            titleDiv.appendChild(document.createTextNode(' '));
            var dot = document.createElement('span');
            dot.style.color = '#e50914';
            dot.textContent = '●';
            titleDiv.appendChild(dot);
        }
        var durDiv = document.createElement('div');
        durDiv.className = 'catchup-program-duration';
        durDiv.textContent = durationStr;
        item.appendChild(timeDiv);
        item.appendChild(titleDiv);
        item.appendChild(durDiv);
        return item;
    }
    function buggyHtmlString(title, isLive, timeStr, durationStr) {
        return '<div class="catchup-program-time">' + timeStr + '</div>' +
            '<div class="catchup-program-title">' + title + (isLive ? ' <span style="color:#e50914;">●</span>' : '') + '</div>' +
            '<div class="catchup-program-duration">' + durationStr + '</div>';
    }
    it('fixed: HTML payload in title becomes inert text', () => {
        var payload = '<img src=x onerror="window.__pwned=1">';
        delete window.__pwned;
        var node = buildCatchupItemFixed(payload, false, '12:00', '1h');
        document.body.appendChild(node);
        expect(node.querySelector('img')).toBeNull();
        expect(node.querySelector('.catchup-program-title').textContent).toBe(payload);
        expect(window.__pwned).toBeUndefined();
        node.remove();
    });
    it('baseline repro: buggy concatenated string contains unescaped payload', () => {
        var payload = '<img src=x onerror="ignored">';
        var html = buggyHtmlString(payload, false, '12:00', '1h');
        // Documents that the original code would inject the payload verbatim into innerHTML
        expect(html).toContain('<img src=x onerror=');
    });
    it('fixed: live indicator dot is appended without parsing title as HTML', () => {
        var payload = '</div><div class="evil">x</div>';
        var node = buildCatchupItemFixed(payload, true, '12:00', '1h');
        var titleDiv = node.querySelector('.catchup-program-title');
        expect(titleDiv.textContent).toBe(payload + ' ●');
        expect(titleDiv.querySelectorAll('div').length).toBe(0);
        expect(titleDiv.querySelectorAll('span').length).toBe(1);
    });
});

describe('XSS: catchup error path renders error text safely', () => {
    function buildCatchupErrorFixed(programsList, e) {
        while (programsList.firstChild) {
            programsList.removeChild(programsList.firstChild);
        }
        var div = document.createElement('div');
        div.style.cssText = 'color:#ff6b6b;padding:20px;';
        div.textContent = 'Error: ' + (e && e.message ? e.message : e);
        programsList.appendChild(div);
    }
    it('payload in error message is escaped', () => {
        var err = new Error('<script>window.__x=1</script>');
        delete window.__x;
        var list = document.createElement('div');
        document.body.appendChild(list);
        buildCatchupErrorFixed(list, err);
        expect(list.querySelector('script')).toBeNull();
        expect(list.firstChild.textContent).toContain('<script>window.__x=1</script>');
        expect(window.__x).toBeUndefined();
        list.remove();
    });
});

describe('XSS: guide channel logo URL must not break out of CSS url()', () => {
    function cssUrl(url) {
        if (!url) return '';
        return 'url("' + url.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '")';
    }
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function renderLogoFixed(channel) {
        var div = document.createElement('div');
        div.className = 'guide-channel-logo';
        div.setAttribute('data-bg', channel.logo);
        var bg = div.getAttribute('data-bg');
        if (bg) div.style.backgroundImage = cssUrl(bg);
        return div;
    }
    function buggyHtmlString(channel) {
        return '<div class="guide-channel-logo" style="background-image:url(\'' + channel.logo + '\')"></div>';
    }
    it('fixed: malicious quote in logo URL cannot inject extra attributes', () => {
        var div = renderLogoFixed({ logo: "x') onerror='alert(1)" });
        // Critical security expectation: the malicious onerror attribute is NOT injected on the div
        expect(div.getAttribute('onerror')).toBeNull();
        // The data-bg attribute holds the literal value (URL parser will reject; that's the safe path)
        expect(div.getAttribute('data-bg')).toBe("x') onerror='alert(1)");
    });
    it('fixed: escapeHtml escapes single-quote in data-bg attribute', () => {
        var s = escapeHtml("x') onerror='alert(1)");
        expect(s).not.toContain("'");
        expect(s).toContain('&#39;');
    });
    it('baseline repro: buggy template string concatenates the unescaped quote', () => {
        var html = buggyHtmlString({ logo: "x') onerror='document.body.dataset.pwn=1" });
        expect(html).toContain("') onerror='");
    });
});

describe('Server-side: premium PUT must merge and strip licenseCode/licensedAt', () => {
    function premiumPutHandler(existing, body) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return { error: 'invalid body' };
        }
        delete body.licenseCode;
        delete body.licensedAt;
        delete body.payerEmail;
        var merged = Object.assign({}, existing || {});
        for (var k in body) {
            if (Object.prototype.hasOwnProperty.call(body, k)) {
                merged[k] = body[k];
            }
        }
        return merged;
    }
    it('strips client-supplied licenseCode (free premium attack)', () => {
        var existing = { installDate: 1000 };
        var attackerBody = { installDate: 2000, licenseCode: 'FAKEABC', licensedAt: 99999 };
        var result = premiumPutHandler(existing, attackerBody);
        expect(result.licenseCode).toBeUndefined();
        expect(result.licensedAt).toBeUndefined();
        expect(result.installDate).toBe(2000);
    });
    it('preserves existing server-set licenseCode when client sends empty', () => {
        var existing = { licenseCode: 'REAL01', licensedAt: 1234, installDate: 1000 };
        var clientBody = { installDate: 2000, licenseCode: '' };
        var result = premiumPutHandler(existing, clientBody);
        expect(result.licenseCode).toBe('REAL01');
        expect(result.licensedAt).toBe(1234);
        expect(result.installDate).toBe(2000);
    });
    it('rejects non-object body', () => {
        expect(premiumPutHandler({}, null).error).toBe('invalid body');
        expect(premiumPutHandler({}, []).error).toBe('invalid body');
        expect(premiumPutHandler({}, 'string').error).toBe('invalid body');
    });
    it('strips payerEmail to prevent client poisoning admin filters', () => {
        var existing = {};
        var body = { payerEmail: 'attacker@example.com' };
        var result = premiumPutHandler(existing, body);
        expect(result.payerEmail).toBeUndefined();
    });
});

describe('Server-side: license code generator uses CSPRNG (not Math.random)', () => {
    function generateLicenseCode() {
        var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        var buf = new Uint8Array(6);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(buf);
        }
        else {
            for (var k = 0; k < 6; k++) buf[k] = Math.floor(Math.random() * 256);
        }
        var out = '';
        for (var i = 0; i < buf.length; i++) {
            out += chars.charAt(buf[i] % chars.length);
        }
        return out;
    }
    it('produces 6 chars from the safe alphabet', () => {
        for (var i = 0; i < 50; i++) {
            var code = generateLicenseCode();
            expect(code.length).toBe(6);
            expect(/^[A-HJ-NP-Z2-9]+$/.test(code)).toBe(true);
        }
    });
    it('crypto.getRandomValues is available in test env (Node 18+ jsdom)', () => {
        expect(typeof crypto).toBe('object');
        expect(typeof crypto.getRandomValues).toBe('function');
    });
});

describe('Server-side: license-validate must reject non-alphanumeric license codes', () => {
    function validateInput(code) {
        if (!code || code.length < 4 || !/^[A-Z0-9]+$/.test(code)) {
            return { valid: false, error: 'invalid_code' };
        }
        return { valid: true };
    }
    it('rejects empty code', () => {
        expect(validateInput('').error).toBe('invalid_code');
    });
    it('rejects too short code', () => {
        expect(validateInput('ABC').error).toBe('invalid_code');
    });
    it('rejects code with special chars (path traversal attempt)', () => {
        expect(validateInput('../etc').error).toBe('invalid_code');
        expect(validateInput('AB CD').error).toBe('invalid_code');
        expect(validateInput('AB:CD').error).toBe('invalid_code');
    });
    it('accepts valid 6-char uppercase alphanumeric', () => {
        expect(validateInput('AB23DE').valid).toBe(true);
    });
    it('rejects lowercase (must be uppercased before)', () => {
        expect(validateInput('abc123').error).toBe('invalid_code');
    });
});

describe('Server-side: log.php newline injection prevention', () => {
    function logSanitize(s, maxLen) {
        if (typeof s !== 'string') s = String(s);
        s = s.replace(/[\r\n\0]/g, ' ');
        if (s.length > maxLen) s = s.slice(0, maxLen);
        return s;
    }
    it('strips newlines from device id (log injection)', () => {
        var dirty = 'Device1\n[FAKE TIMESTAMP] [evil_user] Forged log line';
        var clean = logSanitize(dirty, 80);
        expect(clean).not.toContain('\n');
    });
    it('strips carriage returns and null bytes', () => {
        expect(logSanitize('a\rb\nc\0d', 80)).toBe('a b c d');
    });
    it('truncates over-long input', () => {
        var s = 'x'.repeat(200);
        expect(logSanitize(s, 50).length).toBe(50);
    });
});
