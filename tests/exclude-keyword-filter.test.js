/**
 * Regression tests for the category keyword filter in js/browse.js
 * (_getExcludeKeywordRegex / isExcludedCategoryName).
 *
 * Providers segregate low-quality "screener" content into dedicated, clearly
 * named categories (e.g. "Screener (qualite cinema)", "FR| FILMS AVANT SORTIE
 * CAM/TS/R5"). The filter hides categories whose name contains an enabled
 * keyword (whole word, case-insensitive). Defaults: Screener, CAM, TS, R5.
 *
 * Whole-word matching is required: short keywords like CAM/TS/R5 must NOT
 * false-match inside other words (WEBCAM, SPORTS, ...). These tests guard both
 * the real provider category names that MUST match and a clean provider's full
 * category list that must NOT match.
 */

global.IPTVApp = function() {};
global.cssUrl = function(url) { return 'url("' + url + '")'; };
window.log = jest.fn();
global.TMDB = { isEnabled: function() { return false; }, getGenres: function() { return []; } };
global.Regex = {
    escape: function(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); },
    titleCase: /\b\w/g
};

require('../js/browse.js');

// Real category names pulled from marylive.xyz (a clean provider, 48 cats) —
// none of these must be filtered by the Screener/CAM/TS/R5 defaults.
var CLEAN_PROVIDER_CATEGORIES = [
    'FILMS RÉCEMMENT AJOUTÉS', 'FILMS EN 4K (HDR) !', '100% DOLBY VISION HDR10',
    'UHD IMAX', 'OSCAR 2026 (NOUVELLE MISE À JOUR)', '3D (MULTI)',
    'BOX OFFICE (POPULAIRE EN CE MOMENT)', 'ANIMATION | FAMILIALE | ENFANTS',
    'ARTS MARTIAUX', 'BIOPIC', 'BRAQUAGE', 'COMEDIE MUSICAL', 'COMEDIE',
    'CATASTROPHE', 'CLASSIC', 'DANCE', 'DOCUMENTAIRES | EMISSION TV',
    'DRAME | HISTOIRE', 'ESPIONNAGE | POLITIQUE', 'FANTASTIQUE | AVENTURE',
    'FRANÇAIS', 'JURIDIQUE', 'MARITIME', 'MÉDIÉVALE (MOYEN AGE)', 'MAFIA | GANG',
    'MANGAS', 'MUSICAL', 'SC FICTION | HORREUR', 'SURVIVALS | FILMS DE SURVIE',
    'TÉLÉFILMS', 'THRILLER | DRAME | GUERRE', 'TUEUR EN SERIE',
    'POLICIER | ACTION | CRIME', 'ROMANCE', 'SPECTACLES | CONCERTS', 'VENGEANCE',
    'VOITURES | CARS', 'WESTERN | HISTORIQUE', 'WORKOUT | SPORTS',
    'FILMS MAGHRÈBINS (DZ/MA/TN)', 'VOST ARABIC | أفلام مترجمة'
];

describe('Category keyword filter (browse.isExcludedCategoryName)', () => {
    let app;

    beforeEach(() => {
        app = new IPTVApp();
        app.settings = {
            hideExcludeKeywords: true,
            excludeKeywords: ['Screener', 'CAM', 'TS', 'R5']
        };
    });

    it('matches the real screener categories from P1 and P2', () => {
        expect(app.isExcludedCategoryName('Screener (qualite cinema)')).toBe(true);
        expect(app.isExcludedCategoryName('FR| FILMS AVANT SORTIE CAM/TS/R5')).toBe(true);
    });

    it('is case-insensitive', () => {
        expect(app.isExcludedCategoryName('screener vf')).toBe(true);
        expect(app.isExcludedCategoryName('films cam 2026')).toBe(true);
    });

    it('matches whole words only (no false positives inside other words)', () => {
        expect(app.isExcludedCategoryName('WEBCAM LIVE')).toBe(false);
        expect(app.isExcludedCategoryName('WORKOUT | SPORTS')).toBe(false);
        expect(app.isExcludedCategoryName('ARTS MARTIAUX')).toBe(false);
    });

    it('does not filter ANY category of a clean provider', () => {
        var wrongly = CLEAN_PROVIDER_CATEGORIES.filter(function(name) {
            return app.isExcludedCategoryName(name);
        });
        expect(wrongly).toEqual([]);
    });

    it('returns false when the filter is disabled', () => {
        app.settings.hideExcludeKeywords = false;
        expect(app.isExcludedCategoryName('Screener (qualite cinema)')).toBe(false);
    });

    it('returns false when the keyword list is empty', () => {
        app.settings.excludeKeywords = [];
        expect(app.isExcludedCategoryName('Screener (qualite cinema)')).toBe(false);
    });

    it('reacts to live keyword changes (regex cache keyed on the list)', () => {
        expect(app.isExcludedCategoryName('FILMS HINDI')).toBe(false);
        app.settings.excludeKeywords = ['Screener', 'CAM', 'TS', 'R5', 'HINDI'];
        expect(app.isExcludedCategoryName('FILMS HINDI')).toBe(true);
    });
});
