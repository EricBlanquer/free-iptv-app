/**
 * Reachability test: for each canonical state of the details screen,
 * every focusable element MUST be reachable from every other focusable
 * via some sequence of arrow key presses.
 *
 * This is the closest thing to a guarantee we can give for the hand-rolled
 * 2D nav state machine — it catches the entire class of "element visible
 * but unreachable" bugs (mark-watched isolated when versions present,
 * rating zone trapped, etc.) at the moment the focus.js code changes.
 *
 * Strategy:
 *   - Build canonical scenarios (movie 1-version, movie N-versions, movie+rating,
 *     series w/ seasons+episodes+cast+similar, etc.) with realistic geometry.
 *   - For each focusable as starting point, BFS via _navigateDetails simulating
 *     left/right/up/down. Collect the reachable set.
 *   - Assert reached.size === focusables.length for every starting point.
 *
 * When this test fails, the failure message names exactly which focusable
 * is unreachable from which starting point — easy to debug.
 */

const fs = require('fs');
const vm = require('vm');

function IPTVApp() {}
IPTVApp.prototype.scrollableTextNav = function() { return false; };
IPTVApp.prototype.getEpisodeColumns = function() { return 4; };

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

const ctx = vm.createContext({ IPTVApp: IPTVApp, Date: Date, Math: Math });
vm.runInContext(fragment, ctx);

function makeBtn(spec) {
    const classes = spec.classes || [];
    return {
        id: spec.id || '',
        _label: spec.label || spec.id || classes.join('.') || '?',
        classList: { contains: (c) => classes.indexOf(c) !== -1, _classes: classes },
        offsetTop: spec.y,
        offsetHeight: spec.h,
        getBoundingClientRect: () => ({
            top: spec.y, left: spec.x,
            right: spec.x + spec.w, bottom: spec.y + spec.h,
            width: spec.w, height: spec.h
        })
    };
}

function step(app, focusables, idx, direction) {
    const result = app._navigateDetails({ index: idx, focusables: focusables, direction: direction });
    if (result.handled) return idx;
    return result.index;
}

function reachableFrom(app, focusables, start) {
    const reached = new Set([start]);
    const queue = [start];
    const dirs = ['left', 'right', 'up', 'down'];
    while (queue.length) {
        const i = queue.shift();
        for (const d of dirs) {
            const j = step(app, focusables, i, d);
            if (j !== i && !reached.has(j)) {
                reached.add(j);
                queue.push(j);
            }
        }
    }
    return reached;
}

function topRow() {
    // Real layout (css/details.css): both buttons position:absolute top:30px on the right edge.
    // download right:110 → x=1740 ; favorite right:40 → x=1810. So visually: title ... download favorite.
    return [
        { id: 'details-title', label: 'title', x: 200, y: 30, w: 600, h: 50 },
        { classes: ['favorite-star', 'focusable'], label: 'favorite', x: 1810, y: 30, w: 70, h: 70 },
        { classes: ['download-btn', 'focusable'], label: 'download', x: 1740, y: 30, w: 70, h: 70 }
    ];
}

const scenarios = [
    {
        name: 'movie, single Play button (no versions)',
        specs: [
            ...topRow(),
            { id: 'details-description', label: 'description', x: 0, y: 200, w: 800, h: 100 },
            { id: 'play-btn', classes: ['focusable', 'action-btn'], label: 'play', x: 0, y: 350, w: 100, h: 40 }
        ]
    },
    {
        name: 'movie, 4K + Default versions, mark-watched visible, cast+similar below (regression: today fix)',
        specs: [
            ...topRow(),
            { id: 'details-description', label: 'description', x: 0, y: 200, w: 800, h: 100 },
            { classes: ['version-btn', 'focusable', 'action-btn'], label: '4K', x: 0, y: 350, w: 80, h: 40 },
            { classes: ['version-btn', 'focusable', 'action-btn'], label: 'Default', x: 90, y: 350, w: 80, h: 40 },
            { id: 'mark-watched-btn', classes: ['focusable', 'action-btn'], label: 'mark-watched', x: 180, y: 350, w: 200, h: 40 },
            { classes: ['cast-card', 'focusable'], label: 'cast1', x: 0, y: 500, w: 120, h: 180 },
            { classes: ['cast-card', 'focusable'], label: 'cast2', x: 130, y: 500, w: 120, h: 180 },
            { classes: ['tmdb-card', 'focusable'], label: 'similar1', x: 0, y: 720, w: 120, h: 180 },
            { classes: ['tmdb-card', 'focusable'], label: 'similar2', x: 130, y: 720, w: 120, h: 180 }
        ]
    },
    {
        name: 'movie, 3 versions wrapping to 2 rows + mark-watched on row 2',
        specs: [
            ...topRow(),
            { id: 'details-description', label: 'description', x: 0, y: 200, w: 800, h: 100 },
            { classes: ['version-btn', 'focusable', 'action-btn'], label: '4K-HDR', x: 0, y: 350, w: 200, h: 40 },
            { classes: ['version-btn', 'focusable', 'action-btn'], label: '4K', x: 210, y: 350, w: 200, h: 40 },
            { classes: ['version-btn', 'focusable', 'action-btn'], label: 'Default', x: 420, y: 350, w: 200, h: 40 },
            { id: 'mark-watched-btn', classes: ['focusable', 'action-btn'], label: 'mark-watched', x: 0, y: 410, w: 200, h: 40 }
        ]
    },
    {
        name: 'movie with 5 rating stars + remove button (regression: rating zone trap)',
        specs: [
            ...topRow(),
            { classes: ['user-rating-star', 'focusable'], label: 'star1', x: 0, y: 100, w: 30, h: 30 },
            { classes: ['user-rating-star', 'focusable'], label: 'star2', x: 35, y: 100, w: 30, h: 30 },
            { classes: ['user-rating-star', 'focusable'], label: 'star3', x: 70, y: 100, w: 30, h: 30 },
            { classes: ['user-rating-star', 'focusable'], label: 'star4', x: 105, y: 100, w: 30, h: 30 },
            { classes: ['user-rating-star', 'focusable'], label: 'star5', x: 140, y: 100, w: 30, h: 30 },
            { id: 'user-rating-remove-btn', classes: ['focusable'], label: 'rating-remove', x: 200, y: 100, w: 30, h: 30 },
            { id: 'details-description', label: 'description', x: 0, y: 200, w: 800, h: 100 },
            { id: 'play-btn', classes: ['focusable', 'action-btn'], label: 'play', x: 0, y: 350, w: 100, h: 40 }
        ]
    },
    {
        name: 'movie with rating stars (no remove button — rating value 0)',
        specs: [
            ...topRow(),
            { classes: ['user-rating-star', 'focusable'], label: 'star1', x: 0, y: 100, w: 30, h: 30 },
            { classes: ['user-rating-star', 'focusable'], label: 'star2', x: 35, y: 100, w: 30, h: 30 },
            { classes: ['user-rating-star', 'focusable'], label: 'star3', x: 70, y: 100, w: 30, h: 30 },
            { classes: ['user-rating-star', 'focusable'], label: 'star4', x: 105, y: 100, w: 30, h: 30 },
            { classes: ['user-rating-star', 'focusable'], label: 'star5', x: 140, y: 100, w: 30, h: 30 },
            { id: 'details-description', label: 'description', x: 0, y: 200, w: 800, h: 100 },
            { id: 'play-btn', classes: ['focusable', 'action-btn'], label: 'play', x: 0, y: 350, w: 100, h: 40 }
        ]
    },
    {
        name: 'movie with cast + similar rows below actions',
        specs: [
            ...topRow(),
            { id: 'details-description', label: 'description', x: 0, y: 200, w: 800, h: 100 },
            { id: 'play-btn', classes: ['focusable', 'action-btn'], label: 'play', x: 0, y: 350, w: 100, h: 40 },
            { id: 'mark-watched-btn', classes: ['focusable', 'action-btn'], label: 'mark-watched', x: 110, y: 350, w: 200, h: 40 },
            { classes: ['cast-card', 'focusable'], label: 'cast1', x: 0, y: 500, w: 120, h: 180 },
            { classes: ['cast-card', 'focusable'], label: 'cast2', x: 130, y: 500, w: 120, h: 180 },
            { classes: ['cast-card', 'focusable'], label: 'cast3', x: 260, y: 500, w: 120, h: 180 },
            { classes: ['tmdb-card', 'focusable'], label: 'similar1', x: 0, y: 720, w: 120, h: 180 },
            { classes: ['tmdb-card', 'focusable'], label: 'similar2', x: 130, y: 720, w: 120, h: 180 },
            { classes: ['tmdb-card', 'focusable'], label: 'similar3', x: 260, y: 720, w: 120, h: 180 }
        ]
    },
    {
        name: 'series with seasons + episodes',
        specs: [
            ...topRow(),
            { id: 'details-description', label: 'description', x: 0, y: 200, w: 800, h: 100 },
            { id: 'play-btn', classes: ['focusable', 'action-btn'], label: 'play', x: 0, y: 350, w: 100, h: 40 },
            { classes: ['season-btn', 'focusable'], label: 'season1', x: 0, y: 450, w: 80, h: 40 },
            { classes: ['season-btn', 'focusable'], label: 'season2', x: 90, y: 450, w: 80, h: 40 },
            { classes: ['download-season-btn', 'focusable'], label: 'dl-season', x: 180, y: 450, w: 80, h: 40 },
            { classes: ['episode-item', 'focusable'], label: 'ep1', x: 0, y: 550, w: 200, h: 80 },
            { classes: ['episode-item', 'focusable'], label: 'ep2', x: 210, y: 550, w: 200, h: 80 },
            { classes: ['episode-item', 'focusable'], label: 'ep3', x: 420, y: 550, w: 200, h: 80 },
            { classes: ['episode-item', 'focusable'], label: 'ep4', x: 0, y: 640, w: 200, h: 80 },
            { classes: ['episode-item', 'focusable'], label: 'ep5', x: 210, y: 640, w: 200, h: 80 }
        ]
    }
];

function visualNeighborRight(focusables, idx) {
    const a = focusables[idx].getBoundingClientRect();
    let best = -1;
    let bestDx = Infinity;
    for (let i = 0; i < focusables.length; i++) {
        if (i === idx) continue;
        const b = focusables[i].getBoundingClientRect();
        if (Math.abs(b.top - a.top) > 15) continue;
        if (b.left <= a.right - 1) continue;
        const dx = b.left - a.right;
        if (dx < bestDx) { bestDx = dx; best = i; }
    }
    return best;
}

function visualNeighborLeft(focusables, idx) {
    const a = focusables[idx].getBoundingClientRect();
    let best = -1;
    let bestDx = Infinity;
    for (let i = 0; i < focusables.length; i++) {
        if (i === idx) continue;
        const b = focusables[i].getBoundingClientRect();
        if (Math.abs(b.top - a.top) > 15) continue;
        if (b.right >= a.left + 1) continue;
        const dx = a.left - b.right;
        if (dx < bestDx) { bestDx = dx; best = i; }
    }
    return best;
}

describe('Details screen — every focusable is reachable from every other (reachability invariant)', () => {
    scenarios.forEach((sc) => {
        it(sc.name, () => {
            const app = new IPTVApp();
            const focusables = sc.specs.map(makeBtn);
            const labels = focusables.map((f) => f._label);
            for (let start = 0; start < focusables.length; start++) {
                const reached = reachableFrom(app, focusables, start);
                if (reached.size !== focusables.length) {
                    const unreachable = [];
                    for (let i = 0; i < focusables.length; i++) {
                        if (!reached.has(i)) unreachable.push('#' + i + ' ' + labels[i]);
                    }
                    throw new Error(
                        'From [' + labels[start] + '] (idx ' + start + '), ' +
                        unreachable.length + ' focusable(s) unreachable: ' +
                        unreachable.join(', ') + '\nFull list: ' + labels.join(', ')
                    );
                }
            }
        });
    });
});

describe('Details screen — visual horizontal adjacency invariant (catches "I see it but can\'t reach it")', () => {
    scenarios.forEach((sc) => {
        it(sc.name + ' — RIGHT goes to next visual neighbor on same row', () => {
            const app = new IPTVApp();
            const focusables = sc.specs.map(makeBtn);
            const labels = focusables.map((f) => f._label);
            for (let i = 0; i < focusables.length; i++) {
                const expected = visualNeighborRight(focusables, i);
                if (expected === -1) continue;
                const actual = step(app, focusables, i, 'right');
                if (actual !== expected) {
                    throw new Error(
                        'RIGHT from [' + labels[i] + '] should reach [' + labels[expected] + '] ' +
                        '(visually adjacent on same row), got ' +
                        (actual === i ? 'no move' : '[' + labels[actual] + ']')
                    );
                }
            }
        });

        it(sc.name + ' — LEFT goes to previous visual neighbor on same row', () => {
            const app = new IPTVApp();
            const focusables = sc.specs.map(makeBtn);
            const labels = focusables.map((f) => f._label);
            for (let i = 0; i < focusables.length; i++) {
                const expected = visualNeighborLeft(focusables, i);
                if (expected === -1) continue;
                const actual = step(app, focusables, i, 'left');
                if (actual !== expected) {
                    throw new Error(
                        'LEFT from [' + labels[i] + '] should reach [' + labels[expected] + '] ' +
                        '(visually adjacent on same row), got ' +
                        (actual === i ? 'no move' : '[' + labels[actual] + ']')
                    );
                }
            }
        });
    });
});
