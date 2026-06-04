/**
 * Regression test for the language filter applied to provider category names.
 *
 * Bug reported 2026-05-12: with the drnexon provider (5f6.drnexon.net), 557
 * live categories were all shown to a French user because the categoryPrefix
 * regex (js/regex.js:10) requires a `|` separator after the language code —
 * which is the format Pure IPTV uses (`FR| FRANCE FHD HD`) but NOT what
 * drnexon uses (`EU- FR INFORMATION`, `24/7| FR PLUTO`, etc.). The regex
 * returned no match → matchesLanguage returned `true` (the fallback for
 * unrecognized prefixes) → no filtering.
 *
 * Fix: scan the category name for ALL alphabetic tokens (>=2 letters) and
 * check each against a comprehensive language-token map. If the user's
 * effective language is in the matched set, show; if the name has other
 * language tokens but not the user's, hide; if no recognized language
 * token at all, show (language-agnostic categories like "VIP PPV").
 *
 * Test against real category samples from both providers used by the user
 * on 2026-05-12.
 */

const fs = require('fs');
const vm = require('vm');

const browseCode = fs.readFileSync('./js/browse.js', 'utf8');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function buildApp(lang) {
    function IPTVApp() {}
    const ctx = vm.createContext({ IPTVApp: IPTVApp, console: console });
    vm.runInContext(slice(browseCode, 'matchesLanguage'), ctx);
    vm.runInContext(slice(browseCode, '_buildLangTokenMap'), ctx);
    vm.runInContext(slice(browseCode, 'getEffectiveProviderLanguage'), ctx);
    const app = new ctx.IPTVApp();
    app.settings = { providerLanguage: lang };
    return app;
}

describe('matchesLanguage: handles both pipe-style and space-style provider prefixes', () => {
    describe('Pure IPTV format (FR| FRANCE FHD HD)', () => {
        let app;
        beforeAll(() => { app = buildApp('FR'); });

        it('matches "FR| FRANCE FHD HD" for FR user', () => {
            expect(app.matchesLanguage('FR| FRANCE FHD HD')).toBe(true);
        });
        it('matches "BE| BELGIQUE" for FR user (BE maps to FR)', () => {
            expect(app.matchesLanguage('BE| BELGIQUE')).toBe(true);
        });
        it('rejects "IT| ITALIA" for FR user', () => {
            expect(app.matchesLanguage('IT| ITALIA')).toBe(false);
        });
        it('rejects "GR| ΕΛΛΑΔΑ" for FR user (Greek)', () => {
            expect(app.matchesLanguage('GR| ΕΛΛΑΔΑ')).toBe(false);
        });
        it('accepts "INT| FOXX-MUSIC" for FR user (language-agnostic)', () => {
            expect(app.matchesLanguage('INT| FOXX-MUSIC')).toBe(true);
        });
    });

    describe('drnexon format (EU- FR INFORMATION)', () => {
        let appFr, appEn, appEs;
        beforeAll(() => {
            appFr = buildApp('FR');
            appEn = buildApp('EN');
            appEs = buildApp('ES');
        });

        it('matches "EU- FR INFORMATION" for FR user', () => {
            expect(appFr.matchesLanguage('EU- FR INFORMATION')).toBe(true);
        });
        it('matches "24/7| FR PLUTO" for FR user', () => {
            expect(appFr.matchesLanguage('24/7| FR PLUTO')).toBe(true);
        });
        it('matches "EU-FR L\'EQUIPE LIVE" for FR user (no space between EU- and FR)', () => {
            expect(appFr.matchesLanguage("EU-FR L'EQUIPE LIVE")).toBe(true);
        });
        it('rejects "EU- ES" for FR user', () => {
            expect(appFr.matchesLanguage('EU- ES NOTICIAS')).toBe(false);
        });
        it('matches "EU- ES NOTICIAS" for ES user', () => {
            expect(appEs.matchesLanguage('EU- ES NOTICIAS')).toBe(true);
        });
        it('matches "VIP US- News" for EN user', () => {
            expect(appEn.matchesLanguage('VIP US- News')).toBe(true);
        });
        it('rejects "VIP US-" for FR user', () => {
            expect(appFr.matchesLanguage('VIP US-')).toBe(false);
        });
        it('matches "AR- BEIN" for AR user', () => {
            expect(buildApp('AR').matchesLanguage('AR- BEIN')).toBe(true);
        });
        it('rejects "AR- BEIN" for FR user', () => {
            expect(appFr.matchesLanguage('AR- BEIN')).toBe(false);
        });
        it('matches "MA- MAROC" for FR user (Morocco French)', () => {
            expect(appFr.matchesLanguage('MA- MAROC')).toBe(true);
        });
        it('accepts "VIP PPV LIVE EVENT" for FR user (no language token)', () => {
            expect(appFr.matchesLanguage('VIP PPV LIVE EVENT')).toBe(true);
        });
    });

    describe('Belgian dual-language (BE| BELGIUM NL vs BE| BELGIQUE)', () => {
        it('"BE| BELGIUM NL" matches NL user (primary NL token wins)', () => {
            expect(buildApp('NL').matchesLanguage('BE| BELGIUM NL')).toBe(true);
        });
        it('"BE| BELGIUM NL" does NOT match FR user (primary NL token wins over BE secondary)', () => {
            expect(buildApp('FR').matchesLanguage('BE| BELGIUM NL')).toBe(false);
        });
        it('"BE| BELGIQUE" matches FR user (no primary, BELGIQUE secondary → FR)', () => {
            expect(buildApp('FR').matchesLanguage('BE| BELGIQUE')).toBe(true);
        });
        it('"BE| BELGIQUE" does NOT match NL user', () => {
            expect(buildApp('NL').matchesLanguage('BE| BELGIQUE')).toBe(false);
        });
        it('"EU- DE SWITZERLAND" matches DE user (primary DE wins)', () => {
            expect(buildApp('DE').matchesLanguage('EU- DE SWITZERLAND')).toBe(true);
        });
        it('"EU- DE SWITZERLAND" does NOT match FR user (DE primary, no FR)', () => {
            expect(buildApp('FR').matchesLanguage('EU- DE SWITZERLAND')).toBe(false);
        });
        it('"EU- PL CANAL+" matches PL user, not FR (primary PL wins)', () => {
            expect(buildApp('PL').matchesLanguage('EU- PL CANAL+')).toBe(true);
            expect(buildApp('FR').matchesLanguage('EU- PL CANAL+')).toBe(false);
        });
        it('"VIP CA- ENGLISH" matches EN user, not FR', () => {
            expect(buildApp('EN').matchesLanguage('VIP CA- ENGLISH')).toBe(true);
            expect(buildApp('FR').matchesLanguage('VIP CA- ENGLISH')).toBe(false);
        });
        it('"VIP CA- FRENCH" matches FR user', () => {
            expect(buildApp('FR').matchesLanguage('VIP CA- FRENCH')).toBe(true);
        });
        it('"VIP CA- SPORTS" (no primary, CA not mapped) → language-agnostic, shown to all', () => {
            expect(buildApp('FR').matchesLanguage('VIP CA- SPORTS')).toBe(true);
            expect(buildApp('EN').matchesLanguage('VIP CA- SPORTS')).toBe(true);
        });
    });

    describe('ALL language setting: passes everything', () => {
        it('matches everything for ALL', () => {
            var app = buildApp('ALL');
            expect(app.matchesLanguage('FR| FRANCE')).toBe(true);
            expect(app.matchesLanguage('EU- ES NOTICIAS')).toBe(true);
            expect(app.matchesLanguage('VIP US-')).toBe(true);
            expect(app.matchesLanguage('GR| ΕΛΛΑΔΑ')).toBe(true);
            expect(app.matchesLanguage('AR- ISLAM')).toBe(true);
        });
    });

    describe('Edge cases', () => {
        it('returns true on empty / null input (defensive)', () => {
            var app = buildApp('FR');
            expect(app.matchesLanguage('')).toBe(true);
            expect(app.matchesLanguage(null)).toBe(true);
        });
        it('does not match "PT" substring inside "OPTION" word', () => {
            // OPTION contains "PT" — must not match Portuguese. With the
            // [A-Z]{2,} token extractor, OPTION is one token, not "OP"+"TION"
            // or "OPT"+"ION", so the substring "PT" inside it is never
            // considered a standalone token.
            var app = buildApp('PT');
            expect(app.matchesLanguage('ANY OPTION HD')).toBe(true);
        });
        it('rejects Italian for a French user even with multiple tokens', () => {
            var app = buildApp('FR');
            expect(app.matchesLanguage('IT| INTRATTENIMENTO')).toBe(false);
        });
    });

    describe('zunoxide provider leaks (2026-06-04): non-FR region words now hidden for FR', () => {
        let app;
        beforeAll(() => { app = buildApp('FR'); });

        it('hides Turkish "EU | TURK SPOR"', () => {
            expect(app.matchesLanguage('EU | TURK SPOR')).toBe(false);
        });
        it('hides "EU | GEORGIA", "AS | KAZAKHSTAN", "AM | SURINAME", "AS | TAIWAN", "AS | CAMBODIA"', () => {
            expect(app.matchesLanguage('EU | GEORGIA')).toBe(false);
            expect(app.matchesLanguage('AS | KAZAKHSTAN')).toBe(false);
            expect(app.matchesLanguage('AM | SURINAME')).toBe(false);
            expect(app.matchesLanguage('AS | TAIWAN')).toBe(false);
            expect(app.matchesLanguage('AS | CAMBODIA')).toBe(false);
        });
        it('hides Brazilian "[BR] FILMES" and "EU | EZIDXAN"', () => {
            expect(app.matchesLanguage('[BR] FILMES')).toBe(false);
            expect(app.matchesLanguage('EU | EZIDXAN')).toBe(false);
        });
        it('still SHOWS francophone categories for a French user', () => {
            expect(app.matchesLanguage('AF | SENEGAL')).toBe(true);
            expect(app.matchesLanguage('AM | HAITI')).toBe(true);
            expect(app.matchesLanguage('AM | CANADA FRANCAIS CINEMA')).toBe(true);
        });
    });
});
