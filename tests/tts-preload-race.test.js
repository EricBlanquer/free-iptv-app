/**
 * Regression pins for the TTS preload/play race condition that caused the
 * audio of a chunk to start mid-sentence (e.g. "Duval" instead of "Dans la
 * famille Duval, …") when the user clicked Play before the preload XHRs
 * had finished.
 *
 * Root cause that this test guards against:
 *
 *   1) preloadTTS() launched XHRs but kept no reference to them, so a later
 *      call to clearTTSPreload() (or to _doSpeakText() falling through the
 *      "Preloaded chunks incomplete, fetching normally" branch) could NOT
 *      abort the in-flight preload XHRs. They kept running and arrived at
 *      the server in parallel with the play XHRs — confirmed in stream-proxy
 *      logs by two identical /tts?... requests per chunk within ~2ms.
 *
 *   2) playNextChunk() did `audio.src = url; audio.play()` immediately, so
 *      on Tizen the decoder could miss the first few hundred ms of the
 *      blob if play() fired before the audio element was ready, producing
 *      the "audio starts in the middle" symptom.
 *
 * The fixes that this test pins:
 *
 *   - preloadTTS() pushes every XHR into `this.ttsPreloadXhrs[]`
 *   - clearTTSPreload() iterates that array and calls .abort() on any XHR
 *     whose readyState != 4 (DONE), then nulls the array
 *   - playNextChunk() waits for `oncanplaythrough` (with a 2s timeout
 *     fallback that uses readyState) before calling .play()
 *   - playNextChunk() logs the chunk duration on ready, and the played
 *     duration on ended — so a future "audio cut short" bug surfaces in
 *     the remote debug log instead of being invisible
 */

const fs = require('fs');

const ttsCode = fs.readFileSync('./js/tts.js', 'utf8');

describe('TTS preload/play race — source pins', () => {
    describe('preloadTTS() tracks XHRs so they can be aborted later', () => {
        it('initialises this.ttsPreloadXhrs as an array', () => {
            expect(ttsCode).toMatch(/this\.ttsPreloadXhrs\s*=\s*\[\]/);
        });

        it('pushes the single-chunk XHR into ttsPreloadXhrs before send', () => {
            const singleBlock = ttsCode.match(/if \(chunks\.length === 1\)[\s\S]*?xhr\.send\(\);/);
            expect(singleBlock).toBeTruthy();
            expect(singleBlock[0]).toMatch(/this\.ttsPreloadXhrs\.push\(xhr\)/);
        });

        it('pushes each multi-chunk XHR into ttsPreloadXhrs before send', () => {
            const multiBlock = ttsCode.match(/this\.ttsPreloadedChunks = \[\];[\s\S]*?\}\)\(i, chunks\[i\]\);/);
            expect(multiBlock).toBeTruthy();
            expect(multiBlock[0]).toMatch(/self\.ttsPreloadXhrs\.push\(xhr\)/);
        });

        it('logs preload start with the chunk count', () => {
            expect(ttsCode).toMatch(/window\.log\('TTS', 'preload start: ' \+ chunks\.length/);
        });
    });

    describe('clearTTSPreload() aborts in-flight preload XHRs', () => {
        it('iterates ttsPreloadXhrs and calls abort() on each non-DONE one', () => {
            const fn = ttsCode.match(/IPTVApp\.prototype\.clearTTSPreload = function[\s\S]*?\n\};/);
            expect(fn).toBeTruthy();
            const body = fn[0];
            expect(body).toMatch(/this\.ttsPreloadXhrs/);
            expect(body).toMatch(/readyState\s*!==?\s*4/);
            expect(body).toMatch(/\.abort\(\)/);
            expect(body).toMatch(/this\.ttsPreloadXhrs\s*=\s*null/);
        });

        it('logs how many XHRs were aborted (visibility for future races)', () => {
            expect(ttsCode).toMatch(/preload cleared \(aborted ' \+ aborted/);
        });
    });

    describe('playNextChunk() waits for canplaythrough before play()', () => {
        it('sets preload="auto" on the Audio element', () => {
            const fn = ttsCode.match(/IPTVApp\.prototype\.playNextChunk = function[\s\S]*?\n\};/);
            expect(fn).toBeTruthy();
            expect(fn[0]).toMatch(/this\.ttsAudio\.preload\s*=\s*'auto'/);
        });

        it('attaches an oncanplaythrough handler that triggers play()', () => {
            const fn = ttsCode.match(/IPTVApp\.prototype\.playNextChunk = function[\s\S]*?\n\};/)[0];
            expect(fn).toMatch(/oncanplaythrough\s*=\s*fireStart/);
            expect(fn).toMatch(/self\.ttsAudio\.play\(\)/);
        });

        it('uses a started flag so the play call fires only once', () => {
            const fn = ttsCode.match(/IPTVApp\.prototype\.playNextChunk = function[\s\S]*?\n\};/)[0];
            expect(fn).toMatch(/var started = false/);
            expect(fn).toMatch(/if \(started/);
            expect(fn).toMatch(/started = true/);
        });

        it('has a 2s timeout fallback that fires play() if canplaythrough never fires', () => {
            const fn = ttsCode.match(/IPTVApp\.prototype\.playNextChunk = function[\s\S]*?\n\};/)[0];
            expect(fn).toMatch(/setTimeout\([\s\S]*?readyState >= 3[\s\S]*?fireStart\(\)/);
        });

        it('logs the chunk duration when ready', () => {
            const fn = ttsCode.match(/IPTVApp\.prototype\.playNextChunk = function[\s\S]*?\n\};/)[0];
            expect(fn).toMatch(/ready to play \(duration=/);
        });

        it('logs the played duration vs total duration on ended', () => {
            const fn = ttsCode.match(/IPTVApp\.prototype\.playNextChunk = function[\s\S]*?\n\};/)[0];
            expect(fn).toMatch(/ended \(played=/);
        });

        it('logs the mediaError code on error (visibility for future bugs)', () => {
            const fn = ttsCode.match(/IPTVApp\.prototype\.playNextChunk = function[\s\S]*?\n\};/)[0];
            expect(fn).toMatch(/mediaError=/);
        });
    });

    describe('stopTTS() nulls all audio event handlers (no leaked listeners)', () => {
        it('nulls oncanplaythrough AND onloadeddata', () => {
            const fn = ttsCode.match(/IPTVApp\.prototype\.stopTTS = function[\s\S]*?\n\};/)[0];
            expect(fn).toMatch(/oncanplaythrough\s*=\s*null/);
            expect(fn).toMatch(/onloadeddata\s*=\s*null/);
        });
    });
});
