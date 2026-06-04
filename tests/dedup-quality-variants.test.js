/**
 * Regression test for: same film listed once per quality/version is not deduped.
 *
 * Reported 2026-06-05 (Atlas Pro): "Marsupilami (2026) FHD", "Marsupilami (2026) HD"
 * and "Marsupilami (2026) 4K" showed as three separate cards. The real
 * Regex.qualityTags strips 4K/UHD/1080p/HDR but NOT FHD/HD/SD/HEVC, so
 * _normalizeDedupTitle produced "marsupilami fhd" / "marsupilami hd" /
 * "marsupilami" — three different dedup keys.
 *
 * Loads the REAL js/regex.js (not a stub) so the test reflects shipped behaviour.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function slice(src, name) {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
}

function IPTVApp() {}
const ctx = vm.createContext({ IPTVApp: IPTVApp, console: console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'regex.js'), 'utf8'), ctx);
const browseCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'browse.js'), 'utf8');
const detailsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'details.js'), 'utf8');
vm.runInContext(slice(browseCode, 'stripCategoryPrefix'), ctx);
vm.runInContext(slice(detailsCode, 'cleanTitle'), ctx);
vm.runInContext(slice(detailsCode, 'extractYear'), ctx);
vm.runInContext(slice(browseCode, '_normalizeDedupTitle'), ctx);

const app = new ctx.IPTVApp();
function dedupKey(name) {
    return 'title:' + app._normalizeDedupTitle(name) + '|' + (app.extractYear(name) || '');
}

describe('dedup key: quality/version variants of one film collapse together', () => {
    it('merges FHD / HD / 4K variants of "Marsupilami (2026)"', () => {
        const fhd = dedupKey('Marsupilami (2026) FHD');
        const hd = dedupKey('Marsupilami (2026) HD');
        const k4 = dedupKey('Marsupilami (2026) 4K');
        expect(fhd).toBe(hd);
        expect(hd).toBe(k4);
        expect(fhd).toBe('title:marsupilami|2026');
    });

    it('merges variants with multiple suffixes without gluing words (4K between two words)', () => {
        expect(dedupKey('Gourou (2026) FHD VOF')).toBe(dedupKey('Gourou (2026) 4K VOF'));
        expect(dedupKey('Gourou (2026) HD ')).toBe(dedupKey('Gourou (2026) 4K VOF'));
        expect(dedupKey('Ladies First (2026) FHD MULTI')).toBe(dedupKey('Ladies First (2026) 4K MULTI'));
        expect(dedupKey('Ladies First (2026) SUBT AR')).toBe(dedupKey('Ladies First (2026) FHD MULTI'));
    });

    it('does not strip "Sub"/"Submarine" as a subtitle marker', () => {
        expect(app._normalizeDedupTitle('Sub Zero')).toBe('sub zero');
        expect(app._normalizeDedupTitle('Submarine')).toBe('submarine');
    });

    it('strips HEVC / VF / VOSTFR / MULTI tokens from the dedup title', () => {
        expect(app._normalizeDedupTitle('Inception (2010) HEVC')).toBe(app._normalizeDedupTitle('Inception (2010)'));
        expect(app._normalizeDedupTitle('Inception (2010) MULTI VF')).toBe(app._normalizeDedupTitle('Inception (2010)'));
        expect(app._normalizeDedupTitle('Inception (2010) VOSTFR')).toBe(app._normalizeDedupTitle('Inception (2010)'));
    });

    it('does not mangle real titles that merely contain those letters', () => {
        expect(app._normalizeDedupTitle('Hard Candy')).toBe('hard candy');
        expect(app._normalizeDedupTitle('Sin City')).toBe('sin city');
    });

    // cleanTitle drives the per-variant version button label (title minus
    // cleanTitle). It must strip FHD/HD so the label is "FHD" and not the title.
    it('cleanTitle strips quality + version/subtitle tags but keeps real titles', () => {
        expect(app.cleanTitle('Marsupilami (2026) FHD')).toBe('Marsupilami');
        expect(app.cleanTitle('Inception (2010) HEVC')).toBe('Inception');
        // version/audio + subtitle markers must go so the version label is not the title
        expect(app.cleanTitle('Gourou (2026) 4K VOF')).toBe('Gourou');
        expect(app.cleanTitle('Ladies First (2026) SUBT AR')).toBe('Ladies First');
        expect(app.cleanTitle('Ladies First (2026) FHD MULTI')).toBe('Ladies First');
        // guards: real titles that contain those letters survive
        expect(app.cleanTitle('Hard Candy (2005)')).toBe('Hard Candy');
        expect(app.cleanTitle('Sub Way')).toBe('Sub Way');
        expect(app.cleanTitle('Sub Zero')).toBe('Sub Zero');
    });
});
