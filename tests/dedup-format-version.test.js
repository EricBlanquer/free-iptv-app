/**
 * Regression test for: cached streams from a previous deploy retain stale
 * _dedupKey / _dedupCleanTitle values, and the preprocess fast-path skips
 * recomputation. After we changed _dedupCleanTitle to be more aggressive
 * (strip everything before last `|`, drop punctuation/accents), the deploy
 * had no effect for users with a populated cache — they kept seeing the
 * old (un-merged) duplicates.
 *
 * Fix introduces _dedupFormatVersion stamped on each stream when its dedup
 * fields are computed. The bump-by-one rolling number invalidates old cache
 * entries: any stream lacking the current version is fully recomputed.
 *
 * The fast-path detector also gates on the version, so a wholesale-stale
 * cache routes through the slow path (which ends up calling computeFields
 * on every stream).
 */

const fs = require('fs');

const browseCode = fs.readFileSync('./js/browse.js', 'utf8');

describe('preprocessStreams source: dedup format version is checked', () => {
    let preprocessSrc;

    beforeAll(() => {
        const m = browseCode.match(/IPTVApp\.prototype\._preprocessStreams\s*=\s*function[\s\S]*?\n\};\n/);
        if (!m) throw new Error('Could not extract _preprocessStreams from js/browse.js');
        preprocessSrc = m[0];
    });

    it('declares a DEDUP_FORMAT_VERSION constant', () => {
        // Pin existence so a future refactor can't drop it silently.
        expect(preprocessSrc).toMatch(/DEDUP_FORMAT_VERSION\s*=\s*\d+/);
    });

    it('computeFields stamps the current version on each processed stream', () => {
        // Required so subsequent fast-path checks can detect stale entries.
        expect(preprocessSrc).toMatch(/_dedupFormatVersion\s*=\s*DEDUP_FORMAT_VERSION/);
    });

    it('computeFields early-return is gated on the current version', () => {
        // Old guard was `if (s._dedupKey !== undefined) return;` — that's exactly
        // what trapped stale cache entries. New guard must include version check.
        expect(preprocessSrc).toMatch(/s\._dedupFormatVersion\s*===\s*DEDUP_FORMAT_VERSION/);
        // The bare `_dedupKey !== undefined) return;` shortcut without version
        // gating must be gone.
        expect(preprocessSrc).not.toMatch(/if\s*\(\s*s\._dedupKey\s*!==\s*undefined\s*\)\s*return\s*;/);
    });

    it('hasPreprocessedData fast-path detector also checks the version', () => {
        // If the cached batch is from an older format, take the slow path so
        // computeFields runs on every stream.
        expect(preprocessSrc).toMatch(/streams\[0\]\._dedupFormatVersion\s*===\s*DEDUP_FORMAT_VERSION/);
    });
});
