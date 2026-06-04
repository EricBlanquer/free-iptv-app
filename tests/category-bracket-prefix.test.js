/**
 * Regression test for cleaning bracketed language prefixes from category /
 * stream display names.
 *
 * Bug reported 2026-06-04: with the zunoxide provider (nhibhvmk.zunoxide.net),
 * VOD and series categories use a `[LANG]` bracket prefix (`[FR] NETFLIX`,
 * `[EN] ACTION/WAR`, `[MULTI-LANG] TOP 2026 MOVIES`). stripCategoryPrefix only
 * handled the pipe style (`FR| ...`, `EU | ...`), so bracketed prefixes were
 * left untouched and the user saw `[FR] mon film` instead of `mon film`.
 *
 * Fix: strip a leading `[<token>]` where the token is an allow-listed language
 * code (same philosophy as streamPrefix) so real titles like `[REC]` are never
 * eaten.
 */

const fs = require('fs');
const vm = require('vm');

const regexCode = fs.readFileSync('./js/regex.js', 'utf8');
const browseCode = fs.readFileSync('./js/browse.js', 'utf8');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function buildApp() {
    function IPTVApp() {}
    const ctx = vm.createContext({ IPTVApp: IPTVApp, console: console });
    vm.runInContext(regexCode, ctx);
    vm.runInContext(slice(browseCode, 'stripCategoryPrefix'), ctx);
    return new ctx.IPTVApp();
}

describe('stripCategoryPrefix: bracketed language prefixes', () => {
    let app;
    beforeAll(() => { app = buildApp(); });

    describe('strips allow-listed [LANG] bracket prefixes', () => {
        const cases = [
            ['[FR] NETFLIX', 'NETFLIX'],
            ['[fr] mon film', 'mon film'],
            ['[EN] ACTION/WAR', 'ACTION/WAR'],
            ['[AR] SHAHID', 'SHAHID'],
            ['[ES] TV', 'TV'],
            ['[IT] FANTASIA / SCI', 'FANTASIA / SCI'],
            ['[PT] FILMES', 'FILMES'],
            ['[MULTI-LANG] TOP 2026 MOVIES', 'TOP 2026 MOVIES'],
            ['[MULTI-LANG] NETFLIX', 'NETFLIX'],
            ['[ FR ] NETFLIX', 'NETFLIX'],
            ['[BR] FILMES', 'FILMES'],
            ['[BR] BRAZIL SERIES', 'BRAZIL SERIES'],
            ['[PT-BR] SERIES SUB PT-BR', 'SERIES SUB PT-BR'],
            ['[EXYU] DOMACI FILMOVI', 'DOMACI FILMOVI'],
            ['[ALB] FILMET', 'FILMET'],
            ['[IN] BOLLYWOOD', 'BOLLYWOOD'],
            ['[SC] NORDIC MOVIES', 'NORDIC MOVIES'],
            ['[DK] DANISH MOVIES', 'DANISH MOVIES'],
            ['[GR] OLD MOVIES', 'OLD MOVIES'],
            ['[JP] JAPAN', 'JAPAN'],
            ['[IR] IRANIAN SUB', 'IRANIAN SUB']
        ];
        cases.forEach(([input, expected]) => {
            it(`"${input}" -> "${expected}"`, () => {
                expect(app.stripCategoryPrefix(input)).toBe(expected);
            });
        });
    });

    describe('removes parenthetical resolution noise but keeps distinguishing suffixes', () => {
        const cases = [
            ['[MULTI-LANG] MOVIES SINCE 2019 (4K&1080P)', 'MOVIES SINCE 2019'],
            ['EU | PORTUGAL FHD', 'PORTUGAL FHD'],
            ['EU | PORTUGAL HEVC', 'PORTUGAL HEVC'],
            ['EU | ROMANIA HD', 'ROMANIA HD'],
            ['SOME MOVIES (2019)', 'SOME MOVIES (2019)']
        ];
        cases.forEach(([input, expected]) => {
            it(`"${input}" -> "${expected}"`, () => {
                expect(app.stripCategoryPrefix(input)).toBe(expected);
            });
        });
    });

    describe('does NOT eat real titles that start with a bracket', () => {
        const untouched = [
            '[REC]',
            '[REC] 2',
            '[Rec] 3 Genesis',
            '[Adult Swim] Rick and Morty'
        ];
        untouched.forEach((input) => {
            it(`keeps "${input}"`, () => {
                expect(app.stripCategoryPrefix(input)).toBe(input);
            });
        });
    });

    describe('still strips the existing pipe-style prefixes (no regression)', () => {
        const cases = [
            ['AR | BEIN SPORTS', 'BEIN SPORTS'],
            ['EU | FRANCE GENERALE', 'FRANCE GENERALE'],
            ['AM | USA GENERAL', 'USA GENERAL']
        ];
        cases.forEach(([input, expected]) => {
            it(`"${input}" -> "${expected}"`, () => {
                expect(app.stripCategoryPrefix(input)).toBe(expected);
            });
        });
    });
});
