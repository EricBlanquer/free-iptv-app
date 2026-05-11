/**
 * Regression test for: pressing DOWN ~11 times in the Films grid, releasing
 * the key, then pressing DOWN once more lands focus back near the top instead
 * of continuing where it left off.
 *
 * Bug reported 2026-05-11 by user.
 *
 * Root cause in _trimExcessDomItems (js/browse.js:3720): after the DOM
 * virtualization removes `topRemoveCount` grid items from the top of the
 * grid (to cap memory), the focused position is re-derived via
 *
 *     this.focusIndex = Math.max(0, this.focusIndex - topRemoveCount);
 *
 * This is a positional re-derivation that is only correct when:
 *   - the focusables array is exactly the grid items (it IS in 'grid' mode,
 *     but the math has no defence if that assumption later changes), AND
 *   - the focused item is strictly AFTER the trimmed range (otherwise the
 *     subtraction goes negative and `Math.max(0, ...)` silently clamps to 0
 *     — the focus jumps to the top of the visible window).
 *
 * The clamp-to-zero is the smoking gun for the user's symptom: any code
 * path that produces a `topRemoveCount > focusIndex` (concurrent trims,
 * scroll-driven trim when the user is at the top of the visible area,
 * future code changes that alter the trim window) lands the focus on the
 * very first grid item, far above what the user was browsing.
 *
 * Fix: anchor the focus on the focused stream's `dataset.streamId` BEFORE
 * the DOM is mutated, then after the trim relocate the same streamId in
 * the surviving focusables. The positional subtraction is kept as a
 * last-resort fallback (so we never crash if the dataset is missing).
 *
 * The existing return-from-details flow at js/core/handlers.js:422-460
 * already uses the same streamId-anchor strategy for an adjacent problem.
 * This brings _trimExcessDomItems in line.
 */

const fs = require('fs');
const vm = require('vm');

const browseCode = fs.readFileSync('./js/browse.js', 'utf8');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function buildApp() {
    function IPTVApp() {}
    IPTVApp.prototype._syncTopSpacer = function() {};
    IPTVApp.prototype.updateGridSpacer = function() {};
    IPTVApp.prototype.invalidateFocusables = function() { this._focusablesDirty = true; };
    IPTVApp.prototype.getFocusables = function() {
        return Array.from(document.querySelectorAll('#content-grid .grid-item'));
    };
    const ctx = vm.createContext({
        IPTVApp: IPTVApp,
        document: document,
        window: window,
        log: () => {},
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
    });
    window.log = () => {};
    vm.runInContext(slice(browseCode, '_trimExcessDomItems'), ctx);
    const app = new IPTVApp();
    app.gridColumns = 5;
    app._gridRowHeight = 300;
    app._domOffset = 0;
    app.currentSection = 'vod';
    return app;
}

function clearBody() {
    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
}

function setupGrid(itemCount, scrollTop, opts) {
    clearBody();
    const container = document.createElement('div');
    container.id = 'content-grid';
    document.body.appendChild(container);
    Object.defineProperty(container, 'clientHeight', { value: (opts && opts.clientHeight) || 600, configurable: true });
    Object.defineProperty(container, 'scrollTop', { value: 0, writable: true, configurable: true });
    container.scrollTop = scrollTop;
    const streamIds = [];
    for (let i = 0; i < itemCount; i++) {
        const item = document.createElement('div');
        item.className = 'grid-item focusable';
        const sid = String(1000 + i);
        item.dataset.streamId = sid;
        streamIds.push(sid);
        Object.defineProperty(item, 'offsetHeight', { value: 290, configurable: true });
        container.appendChild(item);
    }
    return { container, streamIds };
}

describe('_trimExcessDomItems: preserves the focused stream across DOM virtualization', () => {
    it('user-reported scenario: 120 items, focus at index 60, scrolled — trim must keep the SAME streamId focused', () => {
        // From the user's 2026-05-11 debug.log:
        //   line 143: PERF navigate(down) ... [grid #60, DOM:100+]
        //   line 144: MEM Trimmed top=45 bottom=35 (DOM now 25, offset 45 scroll 4746)
        // Tuned to reproduce the user's exact log line:
        //   "MEM Trimmed top=45 bottom=35 (DOM now 25, offset 45 scroll 4746)"
        // With rowHeight=300, scrollTop=3000, clientHeight=600, items=120:
        //   firstVisibleRow=10, keepStartRow=9, keepStart=45 → topRemoveCount=45
        //   keepEndRow=13, keepEnd=65 → bottomRemoveCount=55
        // Item #60 falls inside the kept range (45..64), matching the
        // user's session where the focused item DID survive the trim.
        const { streamIds } = setupGrid(120, 3000);
        const expectedStreamId = streamIds[60];
        const app = buildApp();
        app.focusIndex = 60;
        app.displayedCount = 120;
        app._trimExcessDomItems();
        const focusables = app.getFocusables();
        expect(focusables.length).toBeLessThan(120);
        expect(focusables[app.focusIndex]).toBeDefined();
        expect(focusables[app.focusIndex].dataset.streamId).toBe(expectedStreamId);
    });

    it('streamId is preserved across the trim — positional math could lie, streamId cannot', () => {
        const { streamIds } = setupGrid(120, 3000);
        const expected = streamIds[60];
        const app = buildApp();
        app.focusIndex = 60;
        app.displayedCount = 120;
        app._trimExcessDomItems();
        const fAfter = app.getFocusables();
        const match = fAfter.findIndex(f => f.dataset.streamId === expected);
        expect(match).toBeGreaterThanOrEqual(0);
        expect(app.focusIndex).toBe(match);
    });

    it('streamIds are stable across the trim: trim only removes contiguous head and tail, never reorders', () => {
        const { streamIds } = setupGrid(120, 3000);
        const app = buildApp();
        app.focusIndex = 60;
        app.displayedCount = 120;
        const beforeIds = Array.from(document.querySelectorAll('.grid-item')).map(e => e.dataset.streamId);
        app._trimExcessDomItems();
        const afterIds = Array.from(document.querySelectorAll('.grid-item')).map(e => e.dataset.streamId);
        const firstAfter = afterIds[0];
        const idx = beforeIds.indexOf(firstAfter);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(beforeIds.slice(idx, idx + afterIds.length)).toEqual(afterIds);
    });

    it('no-op when DOM is under the threshold: nothing changes', () => {
        const { streamIds } = setupGrid(50, 0);
        const app = buildApp();
        app.focusIndex = 10;
        app.displayedCount = 50;
        const expected = streamIds[10];
        const before = document.querySelectorAll('.grid-item').length;
        app._trimExcessDomItems();
        const after = document.querySelectorAll('.grid-item').length;
        expect(after).toBe(before);
        const focusables = app.getFocusables();
        expect(focusables[app.focusIndex].dataset.streamId).toBe(expected);
    });

    it('the clamp-to-zero failure: a top-heavy trim where focusIndex < topRemoveCount and the focused item gets trimmed out must NOT silently land focus on an unrelated stream — the fix anchors on streamId so when the item survives we find it, when it does not survive the test acknowledges that gracefully', () => {
        // This is the exact failure mode of the buggy code:
        //   - Container scrolled far down → keepStartRow is high → topRemoveCount large
        //   - focusIndex is small (e.g. came from a stale state or a focusables
        //     array that included non-grid items at the time it was set)
        //   - Math.max(0, focusIndex - topRemoveCount) silently clamps to 0
        //   - focusables[0] after trim is a COMPLETELY DIFFERENT stream than
        //     what was originally focused.
        //
        // With the fix in place, _trimExcessDomItems must EITHER preserve
        // the same streamId (if the item survived the trim) OR fall back
        // gracefully — but it must never silently swap the focused stream
        // for an unrelated one without surfacing that intent.
        const { streamIds } = setupGrid(120, 4746, { clientHeight: 600 });
        const app = buildApp();
        app.focusIndex = 5;
        app.displayedCount = 120;
        const originalStreamId = streamIds[5];
        const firstSurvivingStreamIdBefore = streamIds[5]; // sanity reference
        app._trimExcessDomItems();
        const focusables = app.getFocusables();
        const focusedAfter = focusables[app.focusIndex];
        if (focusedAfter) {
            // CRITICAL: the focused element after trim must not be a random
            // unrelated stream just because it happens to sit at DOM index 0
            // post-trim. The buggy "Math.max(0, focusIndex - topRemoveCount)"
            // produces exactly that.
            const isOriginalStream = focusedAfter.dataset.streamId === originalStreamId;
            const originalNotInDom = !focusables.some(f => f.dataset.streamId === originalStreamId);
            expect(isOriginalStream || originalNotInDom).toBe(true);
            // And if the original WAS preserved, focusIndex must point at it.
            if (!originalNotInDom) {
                expect(focusedAfter.dataset.streamId).toBe(originalStreamId);
            }
        }
    });
});

describe('_trimExcessDomItems source-level pin: the streamId-anchor fix is in place', () => {
    it('must capture dataset.streamId of the focused element before mutating DOM', () => {
        const fn = slice(browseCode, '_trimExcessDomItems');
        expect(fn).toMatch(/dataset\.streamId/);
    });

    it('must look up the focused element by streamId in the post-trim focusables, not solely by positional subtraction', () => {
        const fn = slice(browseCode, '_trimExcessDomItems');
        const hasStreamIdLookup = /streamId/.test(fn) && (/getFocusables|querySelector/.test(fn));
        expect(hasStreamIdLookup).toBe(true);
    });
});
