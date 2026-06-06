/**
 * Tests for deferring the provider background refresh until playback.
 *
 * Rationale: refreshing the provider cache at startup steals CPU exactly when
 * the user browses the home menu the most, causing lag (reported on Freebox Pop).
 * The refresh is now queued and only fires after a movie/series has been playing
 * for a few minutes, and is cancelled if playback stops before the delay.
 *
 * Pins:
 * - queueDeferredRefresh() accumulates unique playlist ids
 * - armDeferredRefreshTimer() only arms for vod/series/episode, never live
 * - the queued refresh fires after DEFERRED_REFRESH_PLAYBACK_DELAY_MS of playback
 * - cancelDeferredRefreshTimer() prevents a queued refresh from firing on the menu
 * - flushing clears the queue and triggers refreshProviderCacheBackground per id
 */

const fs = require('fs');
const vm = require('vm');

const storageCode = fs.readFileSync('./js/storage.js', 'utf8');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function makeApp() {
    const sandbox = {
        window: { log: function() {} },
        Math: Math,
        Array: Array,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        console: console
    };
    sandbox.IPTVApp = function() {};
    vm.createContext(sandbox);
    const delayConst = (storageCode.match(/var DEFERRED_REFRESH_PLAYBACK_DELAY_MS[^\n]+\n/) || [''])[0];
    const code = delayConst
        + slice(storageCode, 'queueDeferredRefresh')
        + slice(storageCode, 'armDeferredRefreshTimer')
        + slice(storageCode, 'cancelDeferredRefreshTimer')
        + slice(storageCode, 'flushDeferredRefresh');
    vm.runInContext(code, sandbox);
    const app = new sandbox.IPTVApp();
    app.refreshCalls = [];
    app.refreshProviderCacheBackground = function(playlistId) {
        app.refreshCalls.push(playlistId);
    };
    return { sandbox, app };
}

const DELAY = 5 * 60 * 1000;

describe('Deferred background refresh until playback', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    describe('queueDeferredRefresh()', () => {
        it('accumulates unique ids (single and array forms)', () => {
            const { app } = makeApp();
            app.queueDeferredRefresh('a');
            app.queueDeferredRefresh(['b', 'c']);
            app.queueDeferredRefresh('a');
            expect(app._deferredRefreshPlaylists).toEqual(['a', 'b', 'c']);
        });

        it('ignores falsy ids', () => {
            const { app } = makeApp();
            app.queueDeferredRefresh([null, '', 'x', undefined]);
            expect(app._deferredRefreshPlaylists).toEqual(['x']);
        });
    });

    describe('armDeferredRefreshTimer()', () => {
        it('fires the queued refresh after the playback delay for vod', () => {
            const { app } = makeApp();
            app.queueDeferredRefresh(['p1', 'p2']);
            app.armDeferredRefreshTimer('vod');
            expect(app.refreshCalls).toEqual([]);
            jest.advanceTimersByTime(DELAY - 1);
            expect(app.refreshCalls).toEqual([]);
            jest.advanceTimersByTime(1);
            expect(app.refreshCalls).toEqual(['p1', 'p2']);
            expect(app._deferredRefreshPlaylists).toEqual([]);
        });

        it('arms for series and episode too', () => {
            ['series', 'episode'].forEach((type) => {
                const { app } = makeApp();
                app.queueDeferredRefresh('p');
                app.armDeferredRefreshTimer(type);
                jest.advanceTimersByTime(DELAY);
                expect(app.refreshCalls).toEqual(['p']);
            });
        });

        it('never arms for live playback', () => {
            const { app } = makeApp();
            app.queueDeferredRefresh('p');
            app.armDeferredRefreshTimer('live');
            jest.advanceTimersByTime(DELAY * 2);
            expect(app.refreshCalls).toEqual([]);
            expect(app._deferredRefreshTimer).toBeFalsy();
        });

        it('does nothing when the queue is empty', () => {
            const { app } = makeApp();
            app.armDeferredRefreshTimer('vod');
            expect(app._deferredRefreshTimer).toBeFalsy();
            jest.advanceTimersByTime(DELAY);
            expect(app.refreshCalls).toEqual([]);
        });

        it('does not double-arm or reset the timer on repeated playing events', () => {
            const { app } = makeApp();
            app.queueDeferredRefresh('p');
            app.armDeferredRefreshTimer('vod');
            jest.advanceTimersByTime(DELAY - 1000);
            app.armDeferredRefreshTimer('vod');
            jest.advanceTimersByTime(1000);
            expect(app.refreshCalls).toEqual(['p']);
        });

        it('does not refresh again after firing once (fired guard)', () => {
            const { app } = makeApp();
            app.queueDeferredRefresh('p');
            app.armDeferredRefreshTimer('vod');
            jest.advanceTimersByTime(DELAY);
            expect(app.refreshCalls).toEqual(['p']);
            app.queueDeferredRefresh('q');
            app.armDeferredRefreshTimer('vod');
            jest.advanceTimersByTime(DELAY);
            expect(app.refreshCalls).toEqual(['p']);
        });
    });

    describe('cancelDeferredRefreshTimer()', () => {
        it('prevents a queued refresh from firing when playback stops early', () => {
            const { app } = makeApp();
            app.queueDeferredRefresh('p');
            app.armDeferredRefreshTimer('vod');
            jest.advanceTimersByTime(DELAY / 2);
            app.cancelDeferredRefreshTimer();
            jest.advanceTimersByTime(DELAY);
            expect(app.refreshCalls).toEqual([]);
            expect(app._deferredRefreshPlaylists).toEqual(['p']);
        });

        it('re-arms after cancellation (new playback session)', () => {
            const { app } = makeApp();
            app.queueDeferredRefresh('p');
            app.armDeferredRefreshTimer('vod');
            app.cancelDeferredRefreshTimer();
            app.armDeferredRefreshTimer('vod');
            jest.advanceTimersByTime(DELAY);
            expect(app.refreshCalls).toEqual(['p']);
        });
    });

    describe('flushDeferredRefresh()', () => {
        it('skips ids already being refreshed', () => {
            const { app } = makeApp();
            app.queueDeferredRefresh(['p1', 'p2']);
            app._backgroundRefreshInProgress = { p1: true };
            app.flushDeferredRefresh();
            expect(app.refreshCalls).toEqual(['p2']);
        });

        it('is a no-op when nothing is queued', () => {
            const { app } = makeApp();
            app.flushDeferredRefresh();
            expect(app.refreshCalls).toEqual([]);
        });
    });
});
