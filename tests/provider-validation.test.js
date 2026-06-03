/**
 * Regression tests for two "OK provider looks broken" bugs:
 *
 *  1) The playlist status badge showed a red cross for a provider that actually
 *     works, because validateProviderPlaylist required user_info.auth === 1
 *     (strict), while the real connection only requires user_info to exist. Some
 *     Xtream panels return auth as the string "1", so the strict check failed.
 *
 *  2) Switching to a working provider popped the "connection problem" modal:
 *     auth + categories succeeded, but a later heavy preloadCache request
 *     (get_vod_streams / get_series) timed out and triggered the diagnostic.
 *     preloadCache must run silently — auth already proved reachability.
 */

const fs = require('fs');

describe('validateProviderPlaylist matches the real connection (no false red cross)', () => {
    const settingsCode = fs.readFileSync('./js/settings.js', 'utf8');
    const fn = settingsCode.match(/validateProviderPlaylist = function[\s\S]*?\n\};/);

    test('extracted', () => { expect(fn).not.toBeNull(); });

    test('does not require a strict numeric auth === 1', () => {
        expect(fn[0]).not.toMatch(/auth === 1/);
    });

    test('accepts any auth that is not explicitly "0" (handles string "1", undefined)', () => {
        expect(fn[0]).toMatch(/String\(data\.user_info\.auth\) !== '0'/);
    });

    // Regression: validation must take the same network path as the real connection
    // (getStreamProxyUrl, which honours streamProxy), not its own proxyEnabled check.
    // Otherwise a provider that connects directly (streamProxy off) gets validated
    // through the proxy/VPN and can return 403 -> a false red cross.
    test('uses getStreamProxyUrl (same proxy decision as the connection)', () => {
        expect(fn[0]).toMatch(/getStreamProxyUrl\(\)/);
        expect(fn[0]).not.toMatch(/settings\.proxyEnabled\s*&&\s*self\.settings\.proxyUrl/);
    });
});

describe('preloadCache does not pop the diagnostic on a heavy-list timeout', () => {
    const providerCode = fs.readFileSync('./js/provider.js', 'utf8');
    const fn = providerCode.match(/async preloadCache\([\s\S]*?\n    \}/);

    test('extracted', () => { expect(fn).not.toBeNull(); });

    test('silences provider fetches during bulk preload', () => {
        expect(fn[0]).toMatch(/this\.silent = true/);
    });

    test('restores the previous silent state in a finally block', () => {
        expect(fn[0]).toMatch(/finally\s*\{[\s\S]*this\.silent = prevSilent/);
    });
});
