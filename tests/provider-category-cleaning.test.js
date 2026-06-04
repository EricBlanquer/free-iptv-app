/**
 * Regression test: every TV / VOD / Series category, once run through the real
 * display pipeline (parseCategoryName -> displayName), must come out with no
 * leftover region/language prefix AND no separator left dangling at the start.
 *
 * The dangling separator matters: "FR: FILMS - Action" loses "FR:" (prefix) then
 * "FILMS" (content-type word), which used to leave "- Action" on screen.
 *
 * Credentials live in tests/fixtures/providers.local.json — a git-ignored file
 * that is NEVER committed. When it is absent (CI) the live part is skipped; the
 * deterministic part always runs. When a provider is unreachable its check is
 * skipped with a warning (a down server is not a cleaning bug).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const vm = require('vm');

const UA = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36';
const ACTIONS = ['get_live_categories', 'get_vod_categories', 'get_series_categories'];
const PROVIDERS_FILE = path.join(__dirname, 'fixtures', 'providers.local.json');

// --- Wire up the REAL display pipeline (parseCategoryName) -------------------
function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}
const browseCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'browse.js'), 'utf8');
function IPTVApp() {}
const ctx = vm.createContext({ IPTVApp: IPTVApp, console: console, getFlag: function() { return ''; } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n-data.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'regex.js'), 'utf8'), ctx);
vm.runInContext('Regex.init && Regex.init();', ctx);
['stripCategoryPrefix', 'formatDisplayTitle', 'parseCategoryName', '_normalizeGenre'].forEach(function(fn) {
    vm.runInContext(slice(browseCode, fn), ctx);
});
const app = new ctx.IPTVApp();
app.settings = { providerLanguage: 'FR' };
app.langAliases = {};
app._preserveCaseRegexes = [];

function displayName(categoryName) {
    return app.parseCategoryName(categoryName).displayName;
}

// Mirror the genre-mode extraction (renderCategories useGenre path): the
// category name is prefix-stripped, parenthetical qualifiers are dropped, then
// it is split into individual genres and each is normalised.
function genreNames(rawCategory) {
    const cat = app.stripCategoryPrefix(rawCategory).replace(/&amp;/g, '&').replace(/\([^)]*\)/g, ' ');
    return cat.split(/[\/,&]/).map(function(p) { return app._normalizeGenre(p); }).filter(Boolean);
}

function genreResidual(name) {
    if (/[()]/.test(name)) return 'paren';        // "Tn)", "(Multi"
    if (/^[\s–—:|-]/.test(name)) return 'separator';
    return residual(name);
}

// --- What counts as "not cleaned" in the final display name -----------------
const KNOWN_PREFIX = /^(?:24\/7|EU|AF|AS|AM|AR|NA|SA|OC|VIP|BAB|EXYU|EX-?YU|INT|EST|LA|MA|MULTI-?LANG|MULTI|VOSTFR|VOST|VFF|FR|EN|DE|ES|IT|PT|NL|PL|RU|TR|ZH|JA|KO|HI|TH|VI|ID|MS|SV|NO|DA|FI|CS|SK|HU|RO|BG|HR|SR|SL|SI|UK|EL|GR|HE|FA|UR|BN|TA|TE|MR|GU|KN|ML|PA|NE|MY|SC|SW|ZU|XH|CA|GL|CY|GA|GD|MT|IS|LB|MK|SQ|BS|ET|LV|LT|AZ|KK|UZ|TG|KY|TK|PS|SD|KU|EO|US|GB|IE|AU|NZ|BR|MX|CL|CO|PE|VE|IN|PK|BD|LK|NP|IR|IL|JP|CN|TW|HK|SG|PH|KR|GE|SE|DK|ZA|NG|KE|GH|EG|DZ|TN|SA|AE|QA|KW|IQ|SY|JO|YE|RS|BA|ME|CZ|BY|KZ|CH)$/i;

function residual(name) {
    if (/^[\s–—:|-]/.test(name)) return 'separator';
    const bracket = name.match(/^\s*\[\s*([^\]\s]+)\s*\]/);
    if (bracket && KNOWN_PREFIX.test(bracket[1])) return 'bracket';
    const pipe = name.match(/^\s*([A-Za-z0-9/-]{2,9})\s*\|/);
    if (pipe && KNOWN_PREFIX.test(pipe[1])) return 'pipe';
    return null;
}

// --- Deterministic cases (always run, no network) ---------------------------
describe('parseCategoryName: no separator/prefix left at the start of the display name', function() {
    const cases = [
        ['FR: FILMS - Action,  Aventure', 'Action'],
        ['FR: FILMS -  Science-Fiction', 'Science'],
        ['FR: FILMS - MCU', 'MCU'],
        ['24/7 | ENGLISH', 'English'],
        [' AF | LOCAL', 'Local']
    ];
    cases.forEach(function(pair) {
        it('"' + pair[0] + '" has a clean display name', function() {
            const out = displayName(pair[0]);
            expect(residual(out)).toBeNull();
            expect(out.toLowerCase().startsWith(pair[1].toLowerCase())).toBe(true);
        });
    });
});

describe('genre extraction: no orphan parenthesis or separator in genre names', function() {
    const cases = [
        ['FILMS MAGHRÈBINS (DZ/MA/TN)', ['maghrèbins']],
        ['FR: FILMS - Action,  Aventure', ['action', 'aventure']],
        ['ACTION ( NETFLIX| PRIME | HBO )', ['action']],
        ['MÉDIÉVALE (MOYEN AGE)', ['médiévale']]
    ];
    cases.forEach(function(pair) {
        it('"' + pair[0] + '" yields clean genres', function() {
            const genres = genreNames(pair[0]);
            genres.forEach(function(g) { expect(genreResidual(g)).toBeNull(); });
            expect(genres.map(function(g) { return g.toLowerCase(); })).toEqual(pair[1]);
        });
    });
});

// --- Live catalogs ----------------------------------------------------------
function getJson(url, redirectsLeft) {
    return new Promise(function(resolve, reject) {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, { headers: { 'User-Agent': UA }, timeout: 20000 }, function(res) {
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

// The live catalogs (one provider — Pure IPTV/700730 — answers in ~20s/request)
// make the default suite slow, so they only run when explicitly requested:
//   RUN_LIVE_PROVIDER_TESTS=1 npx jest provider-category-cleaning
// The deterministic cases above always run.
const liveSuite = (providers.length && process.env.RUN_LIVE_PROVIDER_TESTS) ? describe : describe.skip;

liveSuite('Provider category cleaning (live catalogs)', function() {
    providers.forEach(function(p) {
        ACTIONS.forEach(function(action) {
            it(p.name + ' / ' + action + ': every display name is cleaned', async function() {
                const url = p.server + '/player_api.php?username=' + encodeURIComponent(p.username) +
                    '&password=' + encodeURIComponent(p.password) + '&action=' + action;
                let cats;
                try { cats = await getJson(url, 2); }
                catch (e) { console.warn('SKIP ' + p.name + '/' + action + ' (unreachable): ' + e.message); return; }
                if (!Array.isArray(cats)) { console.warn('SKIP ' + p.name + '/' + action + ': not a category array'); return; }

                const offenders = [];
                cats.forEach(function(c) {
                    const raw = (c && c.category_name) || '';
                    const kind = residual(displayName(raw));
                    if (kind) offenders.push('[display:' + kind + '] ' + JSON.stringify(raw) + ' => ' + JSON.stringify(displayName(raw)));
                    genreNames(raw).forEach(function(g) {
                        const gkind = genreResidual(g);
                        if (gkind) offenders.push('[genre:' + gkind + '] ' + JSON.stringify(raw) + ' => ' + JSON.stringify(g));
                    });
                });

                if (offenders.length) {
                    throw new Error(offenders.length + ' name(s) not cleaned in ' +
                        p.name + '/' + action + ':\n  ' + offenders.slice(0, 50).join('\n  '));
                }
                expect(offenders).toEqual([]);
            }, 40000);
        });
    });
});
