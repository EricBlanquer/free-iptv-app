/**
 * Regression test: selecting a provider tab forces a real data refresh, even
 * for the already-active provider (reported 2026-05-31).
 *
 * Re-selecting a provider goes through switchPlaylist (sets _forceRefresh),
 * which makes autoConnect schedule refreshProviderCacheBackground. Previously
 * that refresh short-circuited on an unchanged fingerprint, so re-selecting the
 * active provider re-fetched but never re-applied the data. Now the user-driven
 * refresh is "hard": it passes force=true, bypassing the fingerprint guard.
 */

const fs = require('fs');

const appCode = fs.readFileSync('./js/app.js', 'utf8');
const storageCode = fs.readFileSync('./js/storage.js', 'utf8');

function methodBody(src, header) {
    const start = src.indexOf(header);
    if (start === -1) throw new Error('Not found: ' + header);
    return src.slice(start, start + 600);
}

describe('selecting a provider tab forces a hard refresh', () => {
    it('switchPlaylist marks a forced refresh', () => {
        const body = methodBody(appCode, 'switchPlaylist(playlistId) {');
        expect(body).toMatch(/this\._forceRefresh\s*=\s*true/);
        expect(body).toMatch(/this\.autoConnect\(\)/);
    });

    it('autoConnect propagates the forced flag to the background refresh', () => {
        expect(appCode).toMatch(/var hardRefresh = self\._forceRefresh/);
        expect(appCode).toMatch(/refreshProviderCacheBackground\(playlist\.id,\s*hardRefresh\)/);
    });

    it('refreshProviderCacheBackground bypasses the fingerprint guard when forced', () => {
        expect(storageCode).toMatch(/refreshProviderCacheBackground\s*=\s*function\(playlistId,\s*force\)/);
        expect(storageCode).toMatch(/if\s*\(!force\s*&&\s*oldFingerprint\s*&&\s*oldFingerprint === newFingerprint\)/);
    });

    it('the automatic refresh timer still calls the refresh without forcing', () => {
        expect(storageCode).toMatch(/self\.refreshProviderCacheBackground\(playlistId\);/);
        expect(storageCode).not.toMatch(/refreshProviderCacheBackground\(playlistId,\s*true\)/);
    });
});
