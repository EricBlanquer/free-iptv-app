/**
 * Regression test for: category sort buttons / list visibility once the
 * category panel auto-collapses (reported 2026-06-04, refined 2026-06-05).
 *
 * The category list (#sidebar) must stay open ONLY while a category sort button
 * (.cat-sort-btn, in #category-sort-bar) is focused — those buttons sort the
 * list. It must collapse for the grid, the search fields, the view-mode and the
 * grid-sort controls. Because collapsing hides the sort header (changing the
 * filters focusable set), updateCategoriesVisibility must also keep the same
 * control focused across the change.
 */

const fs = require('fs');

const focusSource = fs.readFileSync('./js/core/focus.js', 'utf8');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function IPTVApp() {}
// Evaluate the real function from focus.js (trusted project source) onto the
// stub prototype so the test exercises the shipped logic, not a copy.
// eslint-disable-next-line no-eval
eval(slice(focusSource, 'updateCategoriesVisibility'));

function el(tag, className) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    return e;
}

function buildApp(focusArea) {
    document.body.innerHTML =
        '<div id="browse-screen">' +
        '  <div id="sidebar"></div>' +
        '  <div id="content-grid"><div class="grid-item"></div></div>' +
        '</div>';
    const app = new IPTVApp();
    app.currentScreen = 'browse';
    app.focusArea = focusArea;
    app.focusIndex = 0;
    app._categoriesCollapsed = false;
    app.gridColumns = 0;
    app.gridColumnsWide = 6;
    app.gridColumnsNarrow = 5;
    app.updateCurrentCategoryLabel = function() {};
    app.invalidateFocusables = function() {};
    return app;
}

function isCollapsed() {
    return document.getElementById('browse-screen').classList.contains('categories-collapsed');
}

describe('updateCategoriesVisibility: list open only on the category sort buttons', () => {
    it('collapses while focus is on the grid', () => {
        const app = buildApp('grid');
        app.getFocusables = () => [];
        app.updateCategoriesVisibility();
        expect(isCollapsed()).toBe(true);
    });

    it('keeps the list open while a category sort button is focused', () => {
        const app = buildApp('filters');
        app.getFocusables = () => [el('button', 'cat-sort-btn')];
        app.updateCategoriesVisibility();
        expect(isCollapsed()).toBe(false);
    });

    it('collapses while a search field / view-mode control is focused', () => {
        const app = buildApp('filters');
        app.getFocusables = () => [el('input', 'focusable')];
        app.updateCategoriesVisibility();
        expect(isCollapsed()).toBe(true);
    });

    it('does not collapse while focus is on the sidebar', () => {
        const app = buildApp('sidebar');
        app.getFocusables = () => [];
        app.updateCategoriesVisibility();
        expect(isCollapsed()).toBe(false);
    });

    it('keeps the same control focused when collapsing shifts the focusable set', () => {
        const app = buildApp('filters');
        const sortAz = el('button', 'cat-sort-btn');
        const sortNum = el('button', 'cat-sort-btn');
        const sortEye = el('button', 'cat-sort-btn');
        const gridView = el('div', 'focusable');
        const titre = el('input', 'focusable');
        const expanded = [sortAz, sortNum, sortEye, gridView, titre];
        const collapsed = [gridView, titre];
        app.getFocusables = () => (app._categoriesCollapsed ? collapsed : expanded);
        // Focus is on the grid-view control (index 3 of the expanded set).
        app.focusIndex = 3;
        app.updateCategoriesVisibility();
        expect(isCollapsed()).toBe(true);
        // grid-view is index 0 once the three sort buttons are hidden.
        expect(app.focusIndex).toBe(0);
    });
});
