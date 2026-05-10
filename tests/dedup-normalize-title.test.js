/**
 * Regression test for: same-movie variants whose titles only differ in
 * punctuation/accents/spacing weren't deduped together.
 *
 * Reported case (2026-05-10): searching "maman" returned two cards for
 * "Maman, j'ai raté l'avion !" — one variant titled with comma+exclamation
 * and one without (e.g. "FR| Maman j'ai raté l'avion (1990)" vs
 * "4K-UHD| Maman, j'ai raté l'avion ! (1990)"). After cleanTitle().toLowerCase()
 * the two cleanTitles still differed by punctuation, so _dedupCleanTitle
 * differed, _dedupKey differed, and the year-consolidation pass (added in
 * the previous fix) couldn't merge them either because it groups by
 * cleanTitle.
 *
 * Fix introduces _normalizeDedupTitle(title) that strips accents +
 * non-alphanumerics and collapses whitespace, used for the dedup key only
 * (the displayed title is unchanged).
 */

const fs = require('fs');
const vm = require('vm');

window.log = jest.fn();

function IPTVApp() {}

const browseCode = fs.readFileSync('./js/browse.js', 'utf8');
const detailsCode = fs.readFileSync('./js/details.js', 'utf8');
const slice = (src, name) => {
    const re = new RegExp('IPTVApp\\.prototype\\.' + name + '\\s*=\\s*function[\\s\\S]*?\\n\\};\\n');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract ' + name);
    return m[0];
};

// _normalizeDedupTitle calls this.cleanTitle internally, which lives in details.js.
// Pull just the cleanTitle slice (it depends on Regex / stripCategoryPrefix which we
// stub) to keep the harness minimal.
const ctx = vm.createContext({
    IPTVApp: IPTVApp,
    Regex: {
        removeYearEnd: /\s+(?:19|20)\d{2}\s*$/,
        qualityTags: /\s*\b(?:HD|UHD|4K|1080p|2160p|720p|HDR10\+?|HDR|HEVC|H[\.\s]?265|H[\.\s]?264|10[Bb]it|FHD|SD|480p)\b/gi,
        langTags: /\s*\b(?:VF|VO|MULTI|TRUEFRENCH|FRENCH|ENGLISH)\b/gi,
        vostfr: /\s*\bVOSTFR\b/gi,
        seasonEpisode: /\s*S\d{1,2}E\d{1,2}/gi,
        saison: /\s*\b(?:Saison|Season)\s+\d+/gi,
        part: /\s*\b(?:Partie|Part)\s+\d+/gi,
        trailingDash: /\s*-\s*$/,
        qualityPrefix: /^(?:4K|UHD|HD|FHD|SD|3D|4K-UHD|2160p|1080p|720p|HEVC)\|\s*/i,
        categoryPrefix: /^(?:FR|EN|VF|VOSTFR|VO|MULTI|EN-FR)\|\s*/i,
        streamPrefix: /^[A-Z]{2,3}\|\s*/
    }
});
vm.runInContext(slice(browseCode, '_normalizeDedupTitle'), ctx);
vm.runInContext(slice(browseCode, 'stripCategoryPrefix'), ctx);
vm.runInContext(slice(detailsCode, 'cleanTitle'), ctx);

describe('IPTVApp.prototype._normalizeDedupTitle', () => {
    let app;

    beforeEach(() => {
        app = new IPTVApp();
    });

    it('returns the same key for titles that differ only in punctuation', () => {
        // The bug case: variants with/without comma + exclamation.
        const a = app._normalizeDedupTitle("Maman, j'ai raté l'avion !");
        const b = app._normalizeDedupTitle("Maman j'ai raté l'avion");
        const c = app._normalizeDedupTitle("Maman, j'ai raté l'avion!");
        expect(a).toBe(b);
        expect(a).toBe(c);
    });

    it('strips accents (raté → rate, été → ete, naïve → naive)', () => {
        expect(app._normalizeDedupTitle('raté')).toBe(app._normalizeDedupTitle('rate'));
        expect(app._normalizeDedupTitle('été')).toBe(app._normalizeDedupTitle('ete'));
        expect(app._normalizeDedupTitle('naïve')).toBe(app._normalizeDedupTitle('naive'));
        expect(app._normalizeDedupTitle('Mémoires')).toBe(app._normalizeDedupTitle('memoires'));
    });

    it('collapses multiple spaces and trims', () => {
        expect(app._normalizeDedupTitle('  Foo   Bar  ')).toBe(app._normalizeDedupTitle('Foo Bar'));
    });

    it('treats curly vs straight apostrophes as the same character', () => {
        // U+2019 = curly apostrophe, U+0027 = straight apostrophe — providers
        // sometimes use one vs the other for the same movie title.
        expect(app._normalizeDedupTitle("L’avion")).toBe(app._normalizeDedupTitle("L'avion"));
    });

    it('produces the same key for "Maman j\'ai raté l\'avion !" vs "Maman, j\'ai raté l\'avion (1990)"', () => {
        // Real-world bug case. Year is stripped by cleanTitle, then normalize
        // strips comma/exclamation/apostrophe.
        const a = app._normalizeDedupTitle("Maman, j'ai raté l'avion ! (1990)");
        const b = app._normalizeDedupTitle("Maman j'ai raté l'avion");
        expect(a).toBe(b);
    });

    it('strips category/quality prefix via cleanTitle', () => {
        // cleanTitle already strips "4K-UHD| ", "FR| ", etc. via stripCategoryPrefix.
        const a = app._normalizeDedupTitle("4K-UHD| Maman j'ai raté l'avion");
        const b = app._normalizeDedupTitle("FR| Maman, j'ai raté l'avion ! (1990)");
        expect(a).toBe(b);
    });

    it('strips arbitrary-length prefix before "|" (NOEL|, DISNEY|, ...) — bug observed in production', () => {
        // stripCategoryPrefix's regex only accepts 2-3 letter alphabetic prefixes,
        // so "NOEL| ..." (4 letters) was passed through to the dedup key, splitting
        // the same movie into two groups. For dedup we strip everything up to the
        // last `|` because `|` is the universal category/quality separator in
        // every IPTV provider this app talks to.
        const a = app._normalizeDedupTitle("NOEL| Maman, j'ai raté l'avion !");
        const b = app._normalizeDedupTitle("FR| Maman, j'ai raté l'avion ! (1990)");
        expect(a).toBe(b);
        // Sanity: real production case from debug.log 2026-05-10.
        expect(a).toBe('maman j ai rate l avion');
    });

    it('strips multi-segment pipe prefixes ("CA|VFF|" etc.)', () => {
        const a = app._normalizeDedupTitle('CA|VFF| Avatar');
        const b = app._normalizeDedupTitle('FR| Avatar');
        expect(a).toBe(b);
    });

    it('does not mangle title that has no pipe prefix', () => {
        const a = app._normalizeDedupTitle('Avatar (2009)');
        expect(a).toBe('avatar');
    });

    it('returns empty string for empty/null/undefined input without throwing', () => {
        expect(app._normalizeDedupTitle('')).toBe('');
        expect(app._normalizeDedupTitle(null)).toBe('');
        expect(app._normalizeDedupTitle(undefined)).toBe('');
    });

    it('preserves digits as-is (so "1981" and "1981" still match)', () => {
        expect(app._normalizeDedupTitle('1981')).toBe('1981');
    });

    it('does NOT collide unrelated movies', () => {
        // Sanity: distinct movies must stay distinct.
        expect(app._normalizeDedupTitle('Avatar')).not.toBe(app._normalizeDedupTitle('Avengers'));
        expect(app._normalizeDedupTitle('Maman')).not.toBe(app._normalizeDedupTitle('Papa'));
    });
});

describe('preprocessStreams source: _normalizeDedupTitle is wired in', () => {
    it('_dedupCleanTitle is computed via _normalizeDedupTitle, not raw lowercase', () => {
        // Pin the wiring: a future refactor that goes back to plain
        // cleanTitle().toLowerCase() must trip this test.
        expect(browseCode).toMatch(/cleanTitle\s*=\s*self\._normalizeDedupTitle\s*\(\s*title\s*\)/);
        // And the legacy `clean.toLowerCase()` assignment for _dedupCleanTitle must be gone.
        expect(browseCode).not.toMatch(/_dedupCleanTitle\s*=\s*clean\.toLowerCase\(\)/);
    });

    it('the hideSD fallback at line ~1154/1160 uses the same normalization', () => {
        // Symmetric: when _dedupCleanTitle is missing on a stream we re-derive
        // it the same way, so the hideSD/HD lookup keeps matching the cached keys.
        const fallbackLines = browseCode.match(/_dedupCleanTitle\s*\|\|\s*self\._normalizeDedupTitle/g);
        expect(fallbackLines).not.toBeNull();
        expect(fallbackLines.length).toBeGreaterThanOrEqual(2);
    });
});
