/**
 * Feature test: origin country on the movie/series details meta line.
 *
 * TMDB details include `production_countries` ([{iso_3166_1, name}]) and/or
 * `origin_country` ([iso codes]). `_formatOriginCountry` turns them into a
 * flag + localized name string (max 2 countries) shown in the details meta row.
 * Localized names come from CountryNames/getCountryName (flags.js) in the
 * current UI locale, falling back to the TMDB name (English) for unlisted codes.
 *
 * Regression guards:
 *  - production_countries is preferred and rendered as "flag localized-name"
 *  - the name is localized to the active UI locale (fr, ...)
 *  - origin_country is used as fallback when production_countries is absent
 *  - unlisted code falls back to the TMDB name; unknown flag falls back to name
 *  - empty/absent data yields '' (no meta part added)
 */

const fs = require('fs');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0].replace('IPTVApp.prototype.', 'TestApp.prototype.');
}

const flagsSrc = fs.readFileSync('./js/flags.js', 'utf8');
eval(flagsSrc);

const detailsSrc = fs.readFileSync('./js/details.js', 'utf8');

let currentLocale = 'en';
global.I18n = { getLocale: () => currentLocale };

function TestApp() {}
eval(slice(detailsSrc, '_formatOriginCountry'));

const app = new TestApp();

beforeEach(() => { currentLocale = 'en'; });

test('production_countries renders flag + localized name (en)', () => {
    const out = app._formatOriginCountry({
        production_countries: [{ iso_3166_1: 'KR', name: 'Korea' }]
    });
    expect(out).toBe(getFlag('KR') + ' South Korea');
});

test('name is localized to the active UI locale (fr)', () => {
    currentLocale = 'fr';
    const out = app._formatOriginCountry({
        production_countries: [{ iso_3166_1: 'KR', name: 'Korea' }]
    });
    expect(out).toBe(getFlag('KR') + ' Corée du Sud');
});

test('production_countries limited to 2, joined by comma', () => {
    currentLocale = 'fr';
    const out = app._formatOriginCountry({
        production_countries: [
            { iso_3166_1: 'US', name: 'United States of America' },
            { iso_3166_1: 'GB', name: 'United Kingdom' },
            { iso_3166_1: 'FR', name: 'France' }
        ]
    });
    expect(out).toBe(getFlag('US') + ' États-Unis, ' + getFlag('GB') + ' Royaume-Uni');
});

test('origin_country used as fallback (flag + localized name)', () => {
    const out = app._formatOriginCountry({ origin_country: ['JP'] });
    expect(out).toBe(getFlag('JP') + ' Japan');
});

test('production_countries preferred over origin_country', () => {
    const out = app._formatOriginCountry({
        production_countries: [{ iso_3166_1: 'FR', name: 'France' }],
        origin_country: ['US']
    });
    expect(out).toBe(getFlag('FR') + ' France');
});

test('unlisted code falls back to the TMDB name', () => {
    const out = app._formatOriginCountry({
        production_countries: [{ iso_3166_1: 'ZZ', name: 'Nowhere' }]
    });
    expect(getCountryName('ZZ', 'en')).toBeNull();
    expect(getFlag('ZZ')).toBeNull();
    expect(out).toBe('Nowhere');
});

test('every listed country has all 11 languages', () => {
    const langs = ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ar', 'tr'];
    Object.keys(CountryNames).forEach((code) => {
        langs.forEach((lang) => {
            expect(typeof CountryNames[code][lang]).toBe('string');
            expect(CountryNames[code][lang].length).toBeGreaterThan(0);
        });
    });
});

test('empty or missing data yields empty string', () => {
    expect(app._formatOriginCountry(null)).toBe('');
    expect(app._formatOriginCountry({})).toBe('');
    expect(app._formatOriginCountry({ production_countries: [] })).toBe('');
});
