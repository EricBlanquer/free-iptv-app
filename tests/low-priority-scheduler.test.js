/**
 * Tests for the cooperative low-priority scheduler that keeps UI navigation
 * smooth while background data processing runs.
 *
 * Pins:
 * - core/utils.js exposes isUserInteracting() driven by lastInputTime/lastNavTime
 *   and the LOWPRIO_INPUT_WINDOW_MS window
 * - runLowPriority() processes every item exactly once and resolves a Promise
 * - runLowPriority() uses small (busy) batches while the user is interacting and
 *   large (idle) batches when idle, so a recent keypress shrinks each synchronous
 *   chunk and lets input win
 * - the keydown handler in core/focus.js stamps lastInputTime
 * - _preprocessStreams (browse.js) routes its large-stream path through
 *   runLowPriority instead of a fixed full-speed batch loop
 * - applyQualityFiltersToSection (storage.js) returns a Promise (async-capable)
 */

const fs = require('fs');
const vm = require('vm');

const utilsCode = fs.readFileSync('./js/core/utils.js', 'utf8');
const focusCode = fs.readFileSync('./js/core/focus.js', 'utf8');
const browseCode = fs.readFileSync('./js/browse.js', 'utf8');
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
        Date: Date,
        Math: Math,
        Promise: Promise,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        console: console
    };
    sandbox.IPTVApp = function() {};
    vm.createContext(sandbox);
    const constants = utilsCode.match(/IPTVApp\.prototype\.LOWPRIO_[A-Z_]+\s*=\s*\d+;/g).join('\n') + '\n';
    vm.runInContext(
        constants
        + slice(utilsCode, 'isUserInteracting')
        + slice(utilsCode, 'runLowPriority'),
        sandbox
    );
    return new sandbox.IPTVApp();
}

describe('Low-priority cooperative scheduler', () => {
    describe('isUserInteracting()', () => {
        it('is true right after an input event', () => {
            const app = makeApp();
            app.lastInputTime = Date.now();
            app.lastNavTime = 0;
            expect(app.isUserInteracting()).toBe(true);
        });

        it('is true right after a navigation event', () => {
            const app = makeApp();
            app.lastInputTime = 0;
            app.lastNavTime = Date.now();
            expect(app.isUserInteracting()).toBe(true);
        });

        it('is false once the input window has elapsed', () => {
            const app = makeApp();
            app.lastInputTime = Date.now() - (app.LOWPRIO_INPUT_WINDOW_MS + 50);
            app.lastNavTime = Date.now() - (app.LOWPRIO_INPUT_WINDOW_MS + 50);
            expect(app.isUserInteracting()).toBe(false);
        });

        it('does not crash when timestamps were never set', () => {
            const app = makeApp();
            expect(app.isUserInteracting()).toBe(false);
        });
    });

    describe('runLowPriority()', () => {
        it('processes every item exactly once and resolves', async () => {
            const app = makeApp();
            app.lastInputTime = 0;
            app.lastNavTime = 0;
            const total = 5000;
            const seen = new Array(total).fill(0);
            await app.runLowPriority(total, function(start, end) {
                for (let i = start; i < end; i++) seen[i]++;
            });
            expect(seen.every((c) => c === 1)).toBe(true);
        });

        it('uses large idle batches when the user is idle', async () => {
            const app = makeApp();
            app.lastInputTime = 0;
            app.lastNavTime = 0;
            const ranges = [];
            await app.runLowPriority(app.LOWPRIO_IDLE_BATCH * 2, function(start, end) {
                ranges.push(end - start);
            });
            expect(ranges[0]).toBe(app.LOWPRIO_IDLE_BATCH);
        });

        it('shrinks to small busy batches while the user keeps interacting', async () => {
            const app = makeApp();
            const total = app.LOWPRIO_BUSY_BATCH * 4;
            const ranges = [];
            app.lastInputTime = Date.now();
            await app.runLowPriority(total, function(start, end) {
                app.lastInputTime = Date.now();
                ranges.push(end - start);
            });
            expect(ranges[0]).toBe(app.LOWPRIO_BUSY_BATCH);
            expect(ranges.length).toBeGreaterThan(total / app.LOWPRIO_IDLE_BATCH);
            expect(ranges.every((r) => r <= app.LOWPRIO_BUSY_BATCH)).toBe(true);
        });

        it('reports monotonic progress ending at 100', async () => {
            const app = makeApp();
            app.lastInputTime = 0;
            const progress = [];
            await app.runLowPriority(4000, function() {}, function(p) { progress.push(p); });
            expect(progress[progress.length - 1]).toBe(100);
            for (let i = 1; i < progress.length; i++) {
                expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
            }
        });
    });

    describe('Source-level wiring', () => {
        it('keydown handler stamps lastInputTime', () => {
            expect(focusCode).toMatch(/self\.lastInputTime\s*=\s*Date\.now\(\)/);
        });

        it('_preprocessStreams routes the large path through runLowPriority', () => {
            expect(browseCode).toMatch(/runLowPriority\(streams\.length/);
            expect(browseCode).not.toMatch(/setTimeout\(processBatch/);
        });

        it('applyQualityFiltersToSection uses runLowPriority for the heavy SD pass', () => {
            const fn = slice(storageCode, 'applyQualityFiltersToSection');
            expect(fn).toMatch(/runLowPriority\(/);
            expect(fn).toMatch(/return Promise\.resolve\(/);
        });
    });
});
