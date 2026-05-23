/**
 * Regression test: modifying category filters (add/delete/hide) must
 * invalidate the preprocess cache so VOD/series sections recalculate
 * their categories.
 *
 * Bug: confirmDeleteCategory and hideDefaultCategory did not call
 * _invalidatePreprocessCache(), so deleting or hiding a category filter
 * left stale category assignments in VOD/series sections until app restart.
 */

const fs = require('fs');
const vm = require('vm');

const settingsCode = fs.readFileSync('./js/settings.js', 'utf8');
const storageCode = fs.readFileSync('./js/storage.js', 'utf8');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function buildApp() {
    let invalidateCalled = 0;
    let homeMenuUpdated = 0;

    function IPTVApp() {
        this.settings = {
            customCategories: [
                { id: 'custom_123', name: 'Doc', icon: '📄', isDefault: false },
            ],
            categoryPatterns: {
                sport: ['Football'],
                custom_123: ['Documentaire'],
            },
            hiddenDefaultCategories: [],
        };
        this.data = {
            vod: { _dedupGroups: {} },
            series: { _dedupGroups: {} },
        };
    }

    IPTVApp.prototype._invalidatePreprocessCache = function(cb) {
        invalidateCalled++;
        if (cb) cb();
    };
    IPTVApp.prototype.renderPatternCategories = function() {};
    IPTVApp.prototype.updateHomeMenuVisibility = function() { homeMenuUpdated++; };
    IPTVApp.prototype.updatePatternCounts = function() {};
    IPTVApp.prototype.saveSettings = function() {};
    IPTVApp.prototype.showConfirmModal = function(msg, cb) { cb(); };
    IPTVApp.prototype.getAllCategories = function() {
        var defaults = [
            { id: 'sport', name: 'Sport', isDefault: true },
            { id: 'entertainment', name: 'Entertainment', isDefault: true },
        ];
        return defaults.concat(this.settings.customCategories || []);
    };

    const ctx = vm.createContext({
        IPTVApp: IPTVApp,
        console: console,
        window: { log: function() {} },
        I18n: { t: function(k, fb) { return fb || k; } },
    });

    vm.runInContext(slice(storageCode, 'hideDefaultCategory'), ctx);
    vm.runInContext(slice(storageCode, 'removeCustomCategory'), ctx);
    vm.runInContext(slice(settingsCode, 'confirmDeleteCategory'), ctx);

    const app = new (ctx.IPTVApp)();
    return { app, getInvalidateCount: () => invalidateCalled, getHomeMenuCount: () => homeMenuUpdated };
}

describe('confirmDeleteCategory invalidates preprocess cache', () => {
    it('calls _invalidatePreprocessCache when deleting a custom category', () => {
        const { app, getInvalidateCount } = buildApp();
        app.confirmDeleteCategory('custom_123');
        expect(getInvalidateCount()).toBe(1);
    });

    it('calls _invalidatePreprocessCache when hiding a default category', () => {
        const { app, getInvalidateCount } = buildApp();
        app.confirmDeleteCategory('sport');
        expect(getInvalidateCount()).toBe(1);
    });

    it('removes the custom category from settings before invalidating', () => {
        const { app } = buildApp();
        app.confirmDeleteCategory('custom_123');
        expect(app.settings.customCategories.find(c => c.id === 'custom_123')).toBeUndefined();
        expect(app.settings.categoryPatterns.custom_123).toBeUndefined();
    });

    it('hides the default category in settings before invalidating', () => {
        const { app } = buildApp();
        app.confirmDeleteCategory('sport');
        expect(app.settings.hiddenDefaultCategories).toContain('sport');
    });
});
