/**
 * Tests for the "delete history entry" tooltip surfaced when entering the
 * history section, plus the swipe-right wiring on history grid items.
 *
 * Pins (source-level — defends the user-facing UX from silent drift):
 *
 *  1) js/features/history.js
 *     - showHistoryScreen schedules the tooltip after renderGrid runs
 *     - scheduleHistoryDeleteTooltip exists, anchors on the first .grid-item,
 *       and picks the Android or Tizen i18n key based on platform detection
 *
 *  2) js/browse.js
 *     - _createGridItem sets data-is-history="1" on items in the history
 *       section so the swipe handler can recognise them
 *
 *  3) js/core/screen.js
 *     - the touch handler now matches both data-is-download="1" AND
 *       data-is-history="1" items
 *     - the swipe-end branch dispatches to removeHistoryAtIndex for history
 *       items (and still to removeDownloadAtIndex for downloads), and
 *       dismisses the tooltip permanently once the user has used the gesture
 *
 *  4) js/core/focus.js
 *     - the Tizen right-arrow handler dismisses the tooltip permanently
 *       before invoking removeHistoryAtIndex
 *
 *  5) locales/*.json — every supported locale declares both
 *     tips.deleteHistoryHintAndroid and tips.deleteHistoryHintTizen
 */

const fs = require('fs');
const path = require('path');

const historyCode = fs.readFileSync('./js/features/history.js', 'utf8');
const browseCode = fs.readFileSync('./js/browse.js', 'utf8');
const screenCode = fs.readFileSync('./js/core/screen.js', 'utf8');
const focusCode = fs.readFileSync('./js/core/focus.js', 'utf8');

const LOCALE_DIR = './locales';
const LOCALES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'ru', 'tr'];

describe('History delete-entry tooltip — source pins', () => {
    describe('js/features/history.js', () => {
        it('declares scheduleHistoryDeleteTooltip as a prototype method', () => {
            expect(historyCode).toMatch(/IPTVApp\.prototype\.scheduleHistoryDeleteTooltip\s*=\s*function/);
        });

        it('showHistoryScreen calls scheduleHistoryDeleteTooltip after renderGrid', () => {
            const idxRender = historyCode.indexOf("renderGrid(historyItems, 'history')");
            const idxSchedule = historyCode.indexOf('scheduleHistoryDeleteTooltip');
            expect(idxRender).toBeGreaterThan(0);
            expect(idxSchedule).toBeGreaterThan(idxRender);
        });

        it('tooltip picks Android vs Tizen i18n key by platform', () => {
            const m = historyCode.match(/IPTVApp\.prototype\.scheduleHistoryDeleteTooltip[\s\S]*?\n\};/);
            expect(m).toBeTruthy();
            const body = m[0];
            expect(body).toMatch(/typeof Android !== ['"]undefined['"]/);
            expect(body).toMatch(/tips\.deleteHistoryHintAndroid/);
            expect(body).toMatch(/tips\.deleteHistoryHintTizen/);
            expect(body).toMatch(/showButtonTooltip\(/);
            expect(body).toMatch(/historyDeleteTooltipShown/);
        });

        it('tooltip anchors on the first .grid-item via a stable id', () => {
            const m = historyCode.match(/IPTVApp\.prototype\.scheduleHistoryDeleteTooltip[\s\S]*?\n\};/);
            const body = m[0];
            expect(body).toMatch(/querySelector\(['"]\.grid-item['"]\)/);
            expect(body).toMatch(/history-delete-tooltip-anchor/);
        });

        it('aborts the tooltip if the user has navigated away from history', () => {
            const m = historyCode.match(/IPTVApp\.prototype\.scheduleHistoryDeleteTooltip[\s\S]*?\n\};/);
            const body = m[0];
            expect(body).toMatch(/currentSection\s*!==\s*['"]history['"]/);
        });
    });

    describe('js/browse.js — _createGridItem tags history items', () => {
        it('sets data-is-history="1" when the section is history and stream._isHistory', () => {
            expect(browseCode).toMatch(
                /if\s*\(\s*stream\._isHistory\s*&&\s*this\.currentSection\s*===\s*['"]history['"]\s*\)\s*item\.dataset\.isHistory\s*=\s*['"]1['"]/
            );
        });

        it('keeps the original download tag untouched', () => {
            expect(browseCode).toMatch(/if\s*\(\s*stream\._isDownload\s*\)\s*item\.dataset\.isDownload\s*=\s*['"]1['"]/);
        });
    });

    describe('js/core/screen.js — swipe handler is generalised to history', () => {
        it('touchstart selector matches BOTH download and history items', () => {
            expect(screenCode).toMatch(/grid-item\[data-is-download="1"\][^'"]*grid-item\[data-is-history="1"\]/);
        });

        it('the swipe-end branch dispatches removeHistoryAtIndex when the item is from history', () => {
            expect(screenCode).toMatch(/state\.isHistory[\s\S]{0,200}removeHistoryAtIndex/);
        });

        it('the swipe-end branch still calls removeDownloadAtIndex for downloads', () => {
            expect(screenCode).toMatch(/removeDownloadAtIndex/);
        });

        it('dismisses the tooltip permanently once swipe deletes an entry', () => {
            expect(screenCode).toMatch(/hideButtonTooltip\(\s*['"]history-delete-tooltip-anchor['"]\s*,\s*true\s*\)[\s\S]{0,80}removeHistoryAtIndex/);
        });

        it('section guard rejects history items when not in history section (and vice versa)', () => {
            expect(screenCode).toMatch(/isHistoryItem\s*\?\s*self\.currentSection\s*===\s*['"]history['"]\s*:\s*self\.currentSection\s*===\s*['"]downloads['"]/);
        });
    });

    describe('js/core/focus.js — Tizen right-arrow dismisses tooltip permanently', () => {
        it('right-arrow branch hides+persists the tooltip before removeHistoryAtIndex', () => {
            const navGrid = focusCode.match(/IPTVApp\.prototype\._navigateGrid\s*=\s*function[\s\S]*?\n\};/);
            expect(navGrid).toBeTruthy();
            const rightBranch = navGrid[0].match(/case\s*['"]right['"][\s\S]*?\n\s*break;/);
            expect(rightBranch).toBeTruthy();
            const block = rightBranch[0];
            const persistCall = block.match(/hideButtonTooltip\(\s*['"]history-delete-tooltip-anchor['"]\s*,\s*true\s*\)/);
            expect(persistCall).toBeTruthy();
            const idxHide = block.indexOf(persistCall[0]);
            const idxRemove = block.indexOf('removeHistoryAtIndex');
            expect(idxRemove).toBeGreaterThan(idxHide);
        });

        it('_navigateGrid hides the tooltip on ANY direction in history (transient, not persisted)', () => {
            const m = focusCode.match(/IPTVApp\.prototype\._navigateGrid\s*=\s*function[\s\S]{0,800}/);
            expect(m).toBeTruthy();
            const head = m[0];
            expect(head).toMatch(/currentSection\s*===\s*['"]history['"]/);
            const callMatch = head.match(/hideButtonTooltip\(\s*['"]history-delete-tooltip-anchor['"][^)]*\)/);
            expect(callMatch).toBeTruthy();
            expect(callMatch[0]).not.toMatch(/,\s*true\s*\)/);
            expect(head).toMatch(/cancelTooltipShow\(\s*['"]historyDelete['"]\s*\)/);
        });
    });

    describe('js/browse.js — Android touch / wheel dismisses tooltip', () => {
        it('markUserScroll hides the history tooltip in addition to flagging userScrolling', () => {
            const browse = fs.readFileSync('./js/browse.js', 'utf8');
            const m = browse.match(/var markUserScroll\s*=\s*function[\s\S]{0,600}?\n\s*\};/);
            expect(m).toBeTruthy();
            const body = m[0];
            expect(body).toMatch(/currentSection\s*===\s*['"]history['"]/);
            expect(body).toMatch(/hideButtonTooltip\(\s*['"]history-delete-tooltip-anchor['"]\s*\)/);
            expect(body).toMatch(/cancelTooltipShow\(\s*['"]historyDelete['"]\s*\)/);
        });
    });

    describe('locales — every supported language defines both tooltip keys', () => {
        LOCALES.forEach(function(loc) {
            it(loc + '.json defines tips.deleteHistoryHintAndroid and tips.deleteHistoryHintTizen', () => {
                const data = JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, loc + '.json'), 'utf8'));
                expect(data.tips).toBeTruthy();
                expect(typeof data.tips.deleteHistoryHintAndroid).toBe('string');
                expect(typeof data.tips.deleteHistoryHintTizen).toBe('string');
                expect(data.tips.deleteHistoryHintAndroid.length).toBeGreaterThan(0);
                expect(data.tips.deleteHistoryHintTizen.length).toBeGreaterThan(0);
            });
        });
    });
});
