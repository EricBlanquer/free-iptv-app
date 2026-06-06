/**
 * Language-filter leak test across ALL configured providers.
 *
 * Mirrors tests/provider-category-cleaning.test.js: a deterministic part that
 * always runs, plus a live part (gated by RUN_LIVE_PROVIDER_TESTS=1, credentials
 * from tests/fixtures/providers.local.json) that hits every provider's live/vod/
 * series category lists.
 *
 * The leak it hunts: a category tagged for ONE specific language (e.g.
 * "[GE] SERIES", "PT| SERIES") whose language code is NOT in
 * _buildLangTokenMap -> matchesLanguage() returns the "language-agnostic"
 * fallback (true) -> the category is shown to EVERY language. Reported by the
 * user on the Smater Tvpro provider: "[GE]" and "[SC] NORDIC" 1923 leaking into
 * the French view.
 *
 * Detection rule (no false positives on multi-language or truly agnostic
 * categories): take only categories that contain EXACTLY ONE reference language
 * code. Such a category must match its own language and must NOT match a
 * clearly different one. If it matches both -> the filter leaks.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const vm = require('vm');

const UA = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36';
const ACTIONS = ['get_live_categories', 'get_vod_categories', 'get_series_categories'];
const PROVIDERS_FILE = path.join(__dirname, 'fixtures', 'providers.local.json');

// --- Wire up the REAL language filter ---------------------------------------
function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}
const browseCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'browse.js'), 'utf8');

function buildApp() {
    function IPTVApp() {}
    const ctx = vm.createContext({ IPTVApp: IPTVApp, console: console });
    vm.runInContext(slice(browseCode, 'matchesLanguage'), ctx);
    vm.runInContext(slice(browseCode, '_buildLangTokenMap'), ctx);
    vm.runInContext(slice(browseCode, 'getEffectiveProviderLanguage'), ctx);
    const app = new ctx.IPTVApp();
    app.settings = { providerLanguage: 'ALL' };
    return app;
}
function matches(app, lang, name) {
    app.settings.providerLanguage = lang;
    return app.matchesLanguage(name);
}

// Reference: unambiguous single-language codes that providers use as a
// bracket/pipe/leading tag. Each MUST be filtered to exactly its language.
// (Superset of the app's own map — codes the app is missing are exactly the
// leaks this test exists to find.)
const REF_LANG = {
    FR: 'FR', FRA: 'FR', FRENCH: 'FR', VFF: 'FR', VOSTFR: 'FR',
    EN: 'EN', ENG: 'EN', ENGLISH: 'EN', GB: 'EN', US: 'EN',
    DE: 'DE', GE: 'DE', GER: 'DE', GERMAN: 'DE', DEU: 'DE',
    SC: 'SV', NORDIC: 'SV', SCANDINAVIAN: 'SV',
    DZ: 'AR', AFG: 'FA', VFSTFR: 'FR', QUEBECOISE: 'FR', INDE: 'HI',
    ES: 'ES', SPA: 'ES', SPANISH: 'ES',
    IT: 'IT', ITA: 'IT', ITALIAN: 'IT',
    PT: 'PT', POR: 'PT', PORTUGUESE: 'PT',
    NL: 'NL', DUTCH: 'NL',
    PL: 'PL', POL: 'PL', POLISH: 'PL',
    RU: 'RU', RUS: 'RU', RUSSIAN: 'RU',
    TR: 'TR', TUR: 'TR', TURKISH: 'TR',
    AR: 'AR', ARA: 'AR', ARABIC: 'AR',
    SV: 'SV', SWE: 'SV', SWEDISH: 'SV',
    DA: 'DA', DAN: 'DA', DANISH: 'DA',
    FI: 'FI', FIN: 'FI', FINNISH: 'FI',
    CS: 'CS', CZE: 'CS', CZECH: 'CS',
    SK: 'SK', SLK: 'SK', SLOVAK: 'SK',
    HU: 'HU', HUN: 'HU', HUNGARIAN: 'HU',
    RO: 'RO', ROM: 'RO', ROMANIAN: 'RO',
    BG: 'BG', BUL: 'BG', BULGARIAN: 'BG',
    HR: 'HR', CRO: 'HR', CROATIAN: 'HR',
    SR: 'SR', SRP: 'SR', SERBIAN: 'SR',
    JA: 'JA', JAP: 'JA', JAPANESE: 'JA',
    KO: 'KO', KOR: 'KO', KOREAN: 'KO',
    ZH: 'ZH', CHI: 'ZH', CHINESE: 'ZH'
};
// A different language to probe against, never equal to the category's own.
function otherLang(lang) { return lang === 'FR' ? 'EN' : 'FR'; }

// Neutral probe languages: a category only matches these if it carries an
// explicit primary token for them. A single-language category that ALSO matches
// every neutral language is matching via the "no token recognized -> show to
// all" fallback => its own code is unmapped => it leaks into every language.
// (This excludes legitimate multi-token cases like "FR| WWE", where WWE maps to
// EN by design: such a category matches FR/EN but NOT ZH/KO/RU.)
const NEUTRALS = ['ZH', 'KO', 'RU', 'JA'];
function isAgnosticLeak(app, name, own) {
    if (!matches(app, own, name)) return false;
    return NEUTRALS.every(function(p) { return p === own || matches(app, p, name); });
}

// Extract the reference language codes that appear as a standalone token
// (bracketed, piped, or boundary-delimited) in a category name.
function refCodesIn(name) {
    const up = (name || '').toUpperCase();
    const found = {};
    Object.keys(REF_LANG).forEach(function(code) {
        const re = new RegExp('(^|[\\[\\(\\s|/_-])' + code + '([\\]\\)\\s|/_:-]|$)');
        if (re.test(up)) found[REF_LANG[code]] = true;
    });
    return Object.keys(found);
}

// --- Deterministic cases (always run, no network) ---------------------------
describe('matchesLanguage: known single-language tags are filtered, not leaked', function() {
    let app;
    beforeAll(function() { app = buildApp(); });

    const mapped = [
        ['FR| FRANCE FHD', 'FR'],
        ['[EN] SERIES', 'EN'],
        ['[AR] FILMS', 'AR'],
        ['PT| SERIES', 'PT'],
        ['[ES] SERIES', 'ES']
    ];
    mapped.forEach(function(pair) {
        const name = pair[0];
        const lang = pair[1];
        it('"' + name + '" shows for ' + lang + ' and is hidden from ' + otherLang(lang), function() {
            expect(matches(app, lang, name)).toBe(true);
            expect(matches(app, otherLang(lang), name)).toBe(false);
        });
    });

    it('language-agnostic categories (no language token) show for everyone', function() {
        ['VIP PPV', 'MULTI-LANG SERIES', '24/7 CHANNELS'].forEach(function(name) {
            expect(matches(app, 'FR', name)).toBe(true);
            expect(matches(app, 'EN', name)).toBe(true);
        });
    });

    it('the helper detects a single reference code (sanity)', function() {
        expect(refCodesIn('[GE] SERIES')).toEqual(['DE']);
        expect(refCodesIn('FR| NETFLIX EN VOSTFR')).toEqual(['FR', 'EN']); // multi -> skipped live
        expect(refCodesIn('VIP SPORTS')).toEqual([]);
    });

    it('isAgnosticLeak flags a catch-all category but not a properly filtered one', function() {
        // Agnostic (no recognized token) -> matches every language.
        expect(isAgnosticLeak(app, 'VIP SPORTS', 'FR')).toBe(true);
        // Mapped single language -> only its own, not the neutral probes.
        expect(isAgnosticLeak(app, '[EN] SERIES', 'EN')).toBe(false);
        // Intentional multi-token (FR + sports league mapped to EN): matches
        // FR/EN but NOT ZH/KO/RU -> not a leak.
        expect(isAgnosticLeak(app, 'FR| WWE UFC FIGHT', 'FR')).toBe(false);
    });
});

// --- Live catalogs (opt-in) -------------------------------------------------
function getJson(url, redirectsLeft) {
    return new Promise(function(resolve, reject) {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { headers: { 'User-Agent': UA }, timeout: 25000 }, function(res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
                res.resume();
                return resolve(getJson(new URL(res.headers.location, url).toString(), redirectsLeft - 1));
            }
            if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
            let data = '';
            res.setEncoding('utf8');
            res.on('data', function(c) { data += c; });
            res.on('end', function() {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('non-JSON response')); }
            });
        });
        req.on('error', reject);
        req.on('timeout', function() { req.destroy(new Error('timeout')); });
    });
}

let providers = [];
try { providers = (JSON.parse(fs.readFileSync(PROVIDERS_FILE, 'utf8')).providers) || []; }
catch (e) { /* file absent -> live suite skipped */ }

const RUN_LIVE = process.env.RUN_LIVE_PROVIDER_TESTS === '1';
const describeLive = (RUN_LIVE && providers.length) ? describe : describe.skip;

describeLive('Live: no single-language category leaks across languages', function() {
    jest.setTimeout(120000);
    const app = buildApp();

    providers.forEach(function(prov) {
        it(prov.name + ': every single-language category is filtered to its own language', async function() {
            const base = prov.server.replace(/\/+$/, '');
            const leaks = [];
            let fetched = 0;
            for (let a = 0; a < ACTIONS.length; a++) {
                const url = base + '/player_api.php?username=' + encodeURIComponent(prov.username) +
                    '&password=' + encodeURIComponent(prov.password) + '&action=' + ACTIONS[a];
                let cats;
                try { cats = await getJson(url, 3); }
                catch (e) { continue; } // a down endpoint is not a filter bug
                if (!Array.isArray(cats)) continue;
                fetched++;
                cats.forEach(function(c) {
                    const name = c && c.category_name;
                    if (!name) return;
                    const codes = refCodesIn(name);
                    if (codes.length !== 1) return; // only unambiguous single-language tags
                    if (isAgnosticLeak(app, name, codes[0])) {
                        leaks.push(ACTIONS[a].replace('get_', '').replace('_categories', '') + ': ' + name);
                    }
                });
            }
            if (!fetched) {
                console.warn('  [skip] ' + prov.name + ' unreachable');
                return;
            }
            if (leaks.length) {
                const uniq = Array.from(new Set(leaks));
                throw new Error(prov.name + ' has ' + uniq.length + ' leaking categor(ies):\n  ' + uniq.join('\n  '));
            }
        });
    });
});
