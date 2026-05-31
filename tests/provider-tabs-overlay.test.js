/**
 * Regression test for the provider tabs overflowing the top on short mobile
 * landscape screens (reported 2026-05-31).
 *
 * Fix: under a limited CSS height (mobile landscape — width=1920 viewport puts
 * phones around 820-890px while a 16:9 TV stays at 1080px), and only on touch
 * devices (body.touch), #playlist-selector floats over the grid instead of
 * pushing it down. This test guards that CSS rule.
 */

const fs = require('fs');

const css = fs.readFileSync('./css/home.css', 'utf8');

function block(selectorOrAtRule) {
    const idx = css.indexOf(selectorOrAtRule);
    if (idx === -1) return null;
    const open = css.indexOf('{', idx);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') {
            depth--;
            if (depth === 0) return css.slice(idx, i + 1);
        }
    }
    return null;
}

describe('provider tabs float on short mobile-landscape screens', () => {
    it('has a max-height media query that does not trigger on a 1080p TV', () => {
        const m = css.match(/@media\s*\(max-height:\s*(\d+)px\)/);
        expect(m).not.toBeNull();
        const threshold = parseInt(m[1], 10);
        expect(threshold).toBeLessThan(1080);
        expect(threshold).toBeGreaterThanOrEqual(900);
    });

    it('floats the selector only on touch devices (body.touch)', () => {
        const media = block('@media (max-height: 1000px)');
        expect(media).not.toBeNull();
        expect(media).toMatch(/body\.touch\s+#home-screen\s+#playlist-selector/);
        expect(media).toMatch(/position:\s*absolute/);
        expect(media).toMatch(/margin-bottom:\s*0/);
    });
});
