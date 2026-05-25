/**
 * Regression test for: when a movie has multiple version buttons (e.g. 4K + Default)
 * the mark-watched-btn (action-btn) ends up on the same flex row as the version
 * buttons inside #details-actions. The user could see the button but couldn't
 * reach it: pressing right from the last version button was rejected
 * by _navigateDetails (cross-zone horizontal move), and pressing down skipped
 * the actions zone entirely (navigate2D found a cast/similar card visually below).
 *
 * Fix adds explicit cross-zone handling for versions↔actions in left/right cases.
 *
 * Loads the relevant slice of js/core/focus.js via vm.runInContext (project
 * security hook blocks eval/Function in new test files).
 */

const fs = require('fs');
const vm = require('vm');

function IPTVApp() {}

const focusCode = fs.readFileSync('./js/core/focus.js', 'utf8');
const slice = (name) => {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = focusCode.match(re);
    if (!m) throw new Error('Could not extract ' + name + ' from js/core/focus.js');
    return m[0];
};

const fragment = [
    slice('_navigateDetails'),
    slice('getDetailsZone'),
    slice('getDetailsZones'),
    slice('getNextDetailsZone'),
    slice('getPrevDetailsZone'),
    slice('navigate2D')
].join('\n');

const ctx = vm.createContext({
    IPTVApp: IPTVApp,
    Date: Date,
    Math: Math,
    document: {
        getElementById: () => null,
        querySelector: () => null
    }
});
vm.runInContext(fragment, ctx);

function makeBtn(spec) {
    const classes = spec.classes || [];
    return {
        id: spec.id || '',
        classList: { contains: (c) => classes.indexOf(c) !== -1 },
        offsetTop: spec.y,
        offsetHeight: spec.h,
        getBoundingClientRect: () => ({
            top: spec.y,
            left: spec.x,
            right: spec.x + spec.w,
            bottom: spec.y + spec.h,
            width: spec.w,
            height: spec.h
        })
    };
}

describe('_navigateDetails: versions ↔ actions cross-zone navigation on same row', () => {
    let app;
    let fourK, def, markWatched;

    beforeEach(() => {
        app = new IPTVApp();
        fourK = makeBtn({ classes: ['version-btn', 'focusable', 'action-btn'], x: 0, y: 100, w: 80, h: 40 });
        def = makeBtn({ classes: ['version-btn', 'focusable', 'action-btn'], x: 90, y: 100, w: 80, h: 40 });
        markWatched = makeBtn({ id: 'mark-watched-btn', classes: ['focusable', 'action-btn', 'tertiary'], x: 180, y: 100, w: 200, h: 40 });
    });

    it('right from end of versions zone jumps to actions zone start (was unreachable before fix)', () => {
        const focusables = [fourK, def, markWatched];
        const result = app._navigateDetails({ index: 1, focusables: focusables, direction: 'right' });
        expect(result.index).toBe(2);
    });

    it('left from start of actions zone jumps back to end of versions zone', () => {
        const focusables = [fourK, def, markWatched];
        const result = app._navigateDetails({ index: 2, focusables: focusables, direction: 'left' });
        expect(result.index).toBe(1);
    });

    it('right within versions zone still moves between version buttons (regression guard)', () => {
        const focusables = [fourK, def, markWatched];
        const result = app._navigateDetails({ index: 0, focusables: focusables, direction: 'right' });
        expect(result.index).toBe(1);
    });

    it('right from end of versions zone is a no-op when no actions zone exists', () => {
        const focusables = [fourK, def];
        const result = app._navigateDetails({ index: 1, focusables: focusables, direction: 'right' });
        expect(result.index).toBe(1);
    });

    it('left from start of actions zone is a no-op when no versions zone exists', () => {
        const playBtn = makeBtn({ id: 'play-btn', classes: ['focusable', 'action-btn', 'secondary'], x: 0, y: 100, w: 80, h: 40 });
        const focusables = [playBtn, markWatched];
        const result = app._navigateDetails({ index: 0, focusables: focusables, direction: 'left' });
        expect(result.index).toBe(0);
    });

    it('right from middle of versions zone moves to next version button (not jump to actions)', () => {
        const fourKHDR = makeBtn({ classes: ['version-btn', 'focusable', 'action-btn'], x: 180, y: 100, w: 100, h: 40 });
        const focusables = [fourK, def, fourKHDR, markWatched];
        const result = app._navigateDetails({ index: 1, focusables: focusables, direction: 'right' });
        expect(result.index).toBe(2);
    });
});
