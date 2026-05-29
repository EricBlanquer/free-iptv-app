/**
 * Regression pins for the TTS first-word-clipped bug that reappears AFTER
 * watching a video (it was already fixed for the very first speak of a session).
 *
 * Root cause:
 *
 *   The Tizen 5 AVPlay decoder + speaker driver take ~466ms to wake on the
 *   first new Audio().play() of a session. tts.js masks that cold-start by
 *   prepending 600ms of real ffmpeg silence (the server `pad=N` parameter) to
 *   the first chunk, gated by `_ttsSessionNeedsPad`. That flag flips to false
 *   the moment the first chunk actually plays — so the pad is spent ONCE per
 *   session.
 *
 *   Watching a movie calls player.stop() → webapis.avplay.close(), which puts
 *   the audio decoder back to sleep. The pipeline is cold again, exactly like
 *   at app launch, but `_ttsSessionNeedsPad` is still false — so the next
 *   spoken description loses its first word.
 *
 * The fix that this test pins:
 *
 *   - tts.js exposes markTTSPipelineCold(), which re-arms _ttsSessionNeedsPad,
 *     drops any warm (pad-less) preload, and replays the warmup primer
 *   - player.stop() invokes an onStopped callback after avplay.close()
 *   - app.js wires player.onStopped to markTTSPipelineCold so every end of
 *     playback re-arms the pad
 */

const fs = require('fs');

const ttsCode = fs.readFileSync('./js/tts.js', 'utf8');
const playerCode = fs.readFileSync('./js/player.js', 'utf8');
const appCode = fs.readFileSync('./js/app.js', 'utf8');

describe('TTS cold pipeline after video — source pins', () => {
    describe('markTTSPipelineCold() re-arms the cold-start pad', () => {
        const fn = ttsCode.match(/IPTVApp\.prototype\.markTTSPipelineCold = function[\s\S]*?\n\};/);

        it('is defined', () => {
            expect(fn).toBeTruthy();
        });

        it('re-arms _ttsSessionNeedsPad to true', () => {
            expect(fn[0]).toMatch(/this\._ttsSessionNeedsPad\s*=\s*true/);
        });

        it('drops the warm (pad-less) preload', () => {
            expect(fn[0]).toMatch(/this\.clearTTSPreload\(\)/);
        });

        it('replays the warmup primer', () => {
            expect(fn[0]).toMatch(/this\._warmupAudioPipeline\(\)/);
        });

        it('does nothing while TTS is already speaking or loading', () => {
            expect(fn[0]).toMatch(/if \(this\.ttsSpeaking \|\| this\.ttsLoading\) return/);
        });
    });

    describe('player.stop() notifies via onStopped after closing AVPlay', () => {
        it('declares the onStopped callback slot in the constructor', () => {
            expect(playerCode).toMatch(/this\.onStopped\s*=\s*null/);
        });

        it('invokes onStopped at the end of stop()', () => {
            const fn = playerCode.match(/stop\(\)\s*\{[\s\S]*?\n {4}\}/);
            expect(fn).toBeTruthy();
            expect(fn[0]).toMatch(/if \(this\.onStopped\) this\.onStopped\(\)/);
            // must fire after avplay.close() so the decoder is actually asleep
            const closeIdx = fn[0].indexOf('avplay.close()');
            const stoppedIdx = fn[0].indexOf('this.onStopped()');
            expect(closeIdx).toBeGreaterThan(-1);
            expect(stoppedIdx).toBeGreaterThan(closeIdx);
        });
    });

    describe('app.js wires player.onStopped to markTTSPipelineCold', () => {
        it('binds the callback so end of playback re-arms the pad', () => {
            expect(appCode).toMatch(/this\.player\.onStopped\s*=\s*this\.markTTSPipelineCold\.bind\(this\)/);
        });
    });
});
