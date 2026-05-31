/**
 * Regression test for the Aurora wallpaper showing through on all navigation
 * screens (reported 2026-05-31: the playlists / add-playlist screens, then
 * details/actor/guide, hid the wallpaper behind an opaque background).
 *
 * In Aurora mode the wallpaper lives on <body>; screens must be transparent to
 * reveal it. The player screen must stay opaque (black) for video playback.
 */

const fs = require('fs');

const homeCss = fs.readFileSync('./css/home.css', 'utf8');

function transparentRuleSelectors() {
    // Grab the selector list of the aurora "background: transparent" rule.
    const m = homeCss.match(/((?:body\[data-home-theme="aurora"\][^{]*,?\s*)+)\{\s*background:\s*transparent;\s*\}/);
    return m ? m[1] : '';
}

describe('Aurora wallpaper is revealed on navigation screens', () => {
    const sel = transparentRuleSelectors();

    ['#genre-screen', '#continue-screen', '#settings-screen', '#playlists-screen',
     '#playlist-edit-screen', '#details-screen', '#actor-screen', '#guide-screen'
    ].forEach(function(screen) {
        it(screen + ' is transparent in Aurora (wallpaper visible)', () => {
            expect(sel).toContain(screen);
        });
    });

    it('the player screen is NOT made transparent (stays black for video)', () => {
        expect(sel).not.toContain('#player-screen');
    });
});
