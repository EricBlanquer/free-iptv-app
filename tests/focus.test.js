/**
 * Structural tests for js/core/focus.js.
 *
 * These guard the invariant that every focusArea declared in the
 * containerToArea click-to-area map has a corresponding case in
 * getFocusables(). When that invariant breaks, focus area is set on click,
 * getFocusables() falls through with selector === '', and querySelectorAll('')
 * throws "The provided selector is empty" — making the modal/screen
 * un-navigable. Bug shipped with the genre-picker feature: see commit fixing
 * the missing 'genre-picker' case.
 */

var fs = require('fs');

var focusSource = fs.readFileSync('./js/core/focus.js', 'utf8');

function extractContainerAreas(src) {
    var out = [];
    var matches = src.matchAll(/\{\s*id:\s*'([^']+)'\s*,\s*area:\s*'([^']+)'\s*\}/g);
    for (var m of matches) {
        out.push({ id: m[1], area: m[2] });
    }
    return out;
}

function extractGetFocusablesCases(src) {
    var fnStart = src.indexOf('IPTVApp.prototype.getFocusables');
    if (fnStart === -1) throw new Error('getFocusables not found in focus.js');
    var fnEnd = src.indexOf('\n};', fnStart);
    var fnBody = src.substring(fnStart, fnEnd);
    var cases = [];
    var matches = fnBody.matchAll(/case\s+'([^']+)'\s*:/g);
    for (var m of matches) {
        cases.push(m[1]);
    }
    return cases;
}

describe('focus.js invariants', function() {
    var areas = extractContainerAreas(focusSource);
    var cases = extractGetFocusablesCases(focusSource);

    it('extracts a non-empty containerToArea map', function() {
        expect(areas.length).toBeGreaterThan(5);
    });

    it('extracts a non-empty getFocusables case list', function() {
        expect(cases.length).toBeGreaterThan(5);
    });

    it('every clickable area has a getFocusables case (else querySelectorAll(empty) throws)', function() {
        // Areas that maintain their own focus state outside the navigate()/select()
        // path (and thus never call getFocusables) are exempt. Add new exemptions
        // here ONLY when the area genuinely manages its own focus — most modals
        // should go through getFocusables.
        var selfManagedAreas = ['tts-voice-modal'];
        var missing = [];
        for (var i = 0; i < areas.length; i++) {
            if (cases.indexOf(areas[i].area) === -1 && selfManagedAreas.indexOf(areas[i].area) === -1) {
                missing.push(areas[i].area + ' (id=' + areas[i].id + ')');
            }
        }
        expect(missing).toEqual([]);
    });

    it('genre-picker area has a getFocusables case (regression: was missing on first ship)', function() {
        expect(cases).toContain('genre-picker');
    });

    it('genre-picker is registered in containerToArea (regression)', function() {
        var hit = areas.some(function(a) { return a.area === 'genre-picker' && a.id === 'genre-picker-modal'; });
        expect(hit).toBe(true);
    });
});
