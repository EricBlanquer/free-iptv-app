/**
 * Regression test for the "settings left-menu not clickable with the mouse"
 * bug (reported 2026-06-15 on the Android emulator / touch devices).
 *
 * The left-menu entries (Langue, Affichage, Lecteur, Données...) live in
 * #settings-menu and belong to the 'settings-menu' focus area
 * (selector: '#settings-header-right .focusable, #settings-menu
 * .settings-menu-item'). The global click handler in focus.js maps the
 * clicked DOM container to a focus area via the `containerToArea` table, then
 * looks the clicked element up among that area's focusables.
 *
 * Bug: the table only mapped #settings-screen -> 'settings'. A click on a
 * left-menu item (nested inside #settings-screen) therefore resolved to the
 * 'settings' area, whose focusables do NOT include the menu items, so the
 * click was dropped (clickedIndex === -1 -> early return).
 *
 * Fix: map #settings-menu and #settings-header-right to the 'settings-menu'
 * area, BEFORE the #settings-screen entry (first container that contains the
 * target wins, and both are nested inside #settings-screen).
 */

const fs = require('fs');

const focusSource = fs.readFileSync('./js/core/focus.js', 'utf8');

function clickContainerOrder() {
    const block = focusSource.match(/var containerToArea = \[([\s\S]*?)\];/);
    if (!block) throw new Error('Could not find containerToArea table');
    const entries = [];
    const re = /\{\s*id:\s*'([^']+)',\s*area:\s*'([^']+)'\s*\}/g;
    let m;
    while ((m = re.exec(block[1])) !== null) {
        entries.push({ id: m[1], area: m[2] });
    }
    return entries;
}

describe('settings left-menu is reachable by mouse/touch clicks', () => {
    const entries = clickContainerOrder();
    const indexOf = (id) => entries.findIndex((e) => e.id === id);

    it('maps #settings-menu to the settings-menu focus area', () => {
        const e = entries.find((x) => x.id === 'settings-menu');
        expect(e).toBeDefined();
        expect(e.area).toBe('settings-menu');
    });

    it('maps #settings-header-right to the settings-menu focus area', () => {
        const e = entries.find((x) => x.id === 'settings-header-right');
        expect(e).toBeDefined();
        expect(e.area).toBe('settings-menu');
    });

    it('resolves #settings-menu BEFORE #settings-screen (nested-container order)', () => {
        const menu = indexOf('settings-menu');
        const screen = indexOf('settings-screen');
        expect(menu).toBeGreaterThanOrEqual(0);
        expect(screen).toBeGreaterThanOrEqual(0);
        expect(menu).toBeLessThan(screen);
    });

    it('resolves #settings-header-right BEFORE #settings-screen', () => {
        expect(indexOf('settings-header-right')).toBeLessThan(indexOf('settings-screen'));
    });

    it('still maps #settings-screen to the settings (body) area', () => {
        const e = entries.find((x) => x.id === 'settings-screen');
        expect(e).toBeDefined();
        expect(e.area).toBe('settings');
    });
});
