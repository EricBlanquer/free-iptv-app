/**
 * Tests for js/core/diagnostic.js and demo playlist wiring.
 * Regression tests for Samsung TV rejection (2026-04-22):
 * Samsung test environment cannot reach iptv.blanquer.org, so demo M3U
 * must be bundled locally and stream playback errors must distinguish
 * offline from real stream failures.
 */

const fs = require('fs');
const path = require('path');

describe('assets/demo-playlist.m3u', () => {
    const m3uPath = path.join(__dirname, '..', 'assets', 'demo-playlist.m3u');

    test('file is bundled and readable', () => {
        expect(fs.existsSync(m3uPath)).toBe(true);
    });

    test('starts with #EXTM3U header', () => {
        const content = fs.readFileSync(m3uPath, 'utf8');
        expect(content.startsWith('#EXTM3U')).toBe(true);
    });

    test('contains only HTTPS streams on well-known public CDNs', () => {
        const content = fs.readFileSync(m3uPath, 'utf8');
        const urls = content.split('\n').filter(l => l.startsWith('http'));
        expect(urls.length).toBeGreaterThanOrEqual(5);
        urls.forEach(url => {
            expect(url).toMatch(/^https:\/\//);
            expect(url).toMatch(/akamaized\.net|akamaihd\.net|france24\.com|getaj\.net|amagi\.tv/);
        });
    });

    test('contains #EXTINF metadata for each stream', () => {
        const content = fs.readFileSync(m3uPath, 'utf8');
        const streams = content.split('\n').filter(l => l.startsWith('http'));
        const extinfs = content.split('\n').filter(l => l.startsWith('#EXTINF'));
        expect(extinfs.length).toBe(streams.length);
    });

    test('tvg-logo paths reference bundled local files (not hotlinked)', () => {
        const content = fs.readFileSync(m3uPath, 'utf8');
        const logoMatches = content.match(/tvg-logo="([^"]+)"/g);
        expect(logoMatches).not.toBeNull();
        logoMatches.forEach(match => {
            const logoPath = match.match(/tvg-logo="([^"]+)"/)[1];
            expect(logoPath).not.toMatch(/^https?:\/\//);
            expect(logoPath).toMatch(/^assets\/logos\//);
            const absPath = path.join(__dirname, '..', logoPath);
            expect(fs.existsSync(absPath)).toBe(true);
        });
    });

});

describe('js/core/utils.js proxyImageUrl', () => {
    const utilsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'utils.js'), 'utf8');

    test('skips proxy for relative URLs (local bundled assets)', () => {
        const proxyBlock = utilsCode.match(/proxyImageUrl\s*=\s*function[\s\S]*?\};/);
        expect(proxyBlock).not.toBeNull();
        expect(proxyBlock[0]).toMatch(/\/\^https\?:\\\/\\\//);
    });
});

describe('js/core/diagnostic.js', () => {
    const diagCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'diagnostic.js'), 'utf8');

    test('exposes checkInternet on window.NetworkDiagnostic', () => {
        expect(diagCode).toMatch(/window\.NetworkDiagnostic\s*=\s*\{[\s\S]*checkInternet[\s\S]*\}/);
    });

    test('runAndShow accepts M3U playlists (uses playlist.url when no serverUrl)', () => {
        const runAndShowBlock = diagCode.match(/function runAndShow[\s\S]*?(?=\n    function |\n    window\.NetworkDiagnostic)/);
        expect(runAndShowBlock).not.toBeNull();
        expect(runAndShowBlock[0]).toContain('playlist.url');
        expect(runAndShowBlock[0]).not.toMatch(/if\s*\(\s*!playlist\s*\|\|\s*!playlist\.serverUrl\s*\)/);
    });

    // Regression: a "direct connection" that resolves only after the timeout
    // (abort does not interrupt the fetch on Tizen/Chromium 63) was scored ok:true,
    // producing a falsely reassuring "provider is reachable" verdict.
    describe('checkReachable does not over-report reachability on a slow response', () => {
        const checkReachableBlock = diagCode.match(/function checkReachable[\s\S]*?\n    \}/);

        test('ok is gated on elapsed < timeout, never unconditionally true', () => {
            expect(checkReachableBlock).not.toBeNull();
            expect(checkReachableBlock[0]).toMatch(/ok:\s*elapsed\s*<\s*timeout/);
            expect(checkReachableBlock[0]).not.toMatch(/return\s*\{\s*ok:\s*true/);
        });

        test('races the fetch against the timeout so a hung request cannot block the diagnostic', () => {
            expect(checkReachableBlock[0]).toContain('Promise.race');
            expect(checkReachableBlock[0]).toMatch(/ok:\s*false,\s*elapsed:\s*timeout,\s*timedOut:\s*true/);
        });
    });

    // Regression: the alternate-protocol probe still runs (decide() uses it for the
    // protocol auto-fix) but must not be shown as a diagnostic step — it gave the user
    // no actionable information and read as a false error.
    test('alternate-protocol probe is not rendered as a diagnostic step', () => {
        expect(diagCode).not.toMatch(/items\.push\([^\n]*stepSwapped/);
    });

    // Regression: the "without proxy" probe re-hit the exact same URL as the direct
    // probe (the diagnostic never routes through the CORS proxy), so its proxy_broken
    // verdict was unreachable dead code and it only added latency. Removed entirely.
    test('redundant "without proxy" probe and dead proxy_broken verdict are removed', () => {
        expect(diagCode).not.toContain("'proxy_broken'");
        expect(diagCode).not.toMatch(/checkReachable\(directNoProxy/);
        expect(diagCode).not.toMatch(/d\.noProxy/);
    });

    // The modal must open immediately and stream each probe result, so the
    // several-second wait on the network probes is visible instead of a blank gap.
    test('runAndShow opens the modal before the probes run and streams progress', () => {
        const block = diagCode.match(/function runAndShow[\s\S]*?(?=\n    var PROGRESS_STEP_LABELS)/);
        expect(block).not.toBeNull();
        expect(block[0]).toContain('showConfirmModal');
        expect(block[0]).toMatch(/run\(ctx,\s*function/);
        expect(block[0].indexOf('showConfirmModal')).toBeLessThan(block[0].indexOf('run(ctx'));
    });

    // Regression: re-opening the modal for the verdict captured 'confirm-modal' as its
    // OWN previous focus, trapping the user (Back kept re-triggering the modal, focus
    // lost). The verdict must update the already-open modal in place, and the modal must
    // be opened with a valid 'home' focus so Back restores to home.
    test('verdict updates the modal in place, not via a second showConfirmModal', () => {
        const finalizeBlock = diagCode.match(/function finalizeModal[\s\S]*?\n    \}/);
        expect(finalizeBlock).not.toBeNull();
        expect(finalizeBlock[0]).not.toContain('showConfirmModal');
        expect(finalizeBlock[0]).toContain('confirm-modal-message');
        expect((diagCode.match(/showConfirmModal/g) || []).length).toBe(1);
        expect(diagCode).toMatch(/app\.focusArea = 'home'/);
    });

    // Regression: a down provider fails many requests in a row; each called runAndShow
    // and, because the in-progress flag cleared as soon as run() resolved, stacked a new
    // modal ("double modal"). The flag must stay set until the user closes the modal,
    // plus a cooldown.
    test('diagnostic stays in progress until dismissed, with a cooldown', () => {
        const block = diagCode.match(/function runAndShow[\s\S]*?(?=\n    var PROGRESS_STEP_LABELS)/);
        expect(block).not.toBeNull();
        expect(block[0]).toContain('_diagnosticCooldownUntil');
        const thenBlock = block[0].match(/\.then\(function\(result\)[\s\S]*?\}\)\.catch/);
        expect(thenBlock).not.toBeNull();
        expect(thenBlock[0]).not.toContain('_diagnosticInProgress');
    });
});

describe('addDemoPlaylist uses local bundled file', () => {
    const appCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

    test('references local assets/demo-playlist.m3u path', () => {
        const demoBlock = appCode.match(/addDemoPlaylist\(\)\s*\{[\s\S]*?this\.startApp\(\);/);
        expect(demoBlock).not.toBeNull();
        expect(demoBlock[0]).toContain('assets/demo-playlist.m3u');
    });

    test('no longer depends on iptv.blanquer.org for demo', () => {
        const demoBlock = appCode.match(/addDemoPlaylist\(\)\s*\{[\s\S]*?this\.startApp\(\);/);
        expect(demoBlock[0]).not.toContain('iptv.blanquer.org');
    });
});

describe('autoConnect M3U error path triggers diagnostic for remote URLs only', () => {
    const appCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    // The M3U error path lives in the onM3UError closure; match on that anchor
    // (the previous regex grabbed the loadingTimeoutMs ternary by accident).
    const m3uCatchBlock = appCode.match(/onM3UError\s*=\s*function\s*\(err\)\s*\{[\s\S]*?\n\s{8,}\};/);

    test('catch block calls NetworkDiagnostic.runAndShow', () => {
        expect(m3uCatchBlock).not.toBeNull();
        expect(m3uCatchBlock[0]).toContain('NetworkDiagnostic.runAndShow');
    });

    test('diagnostic is gated by https?:// check (skips local bundled file)', () => {
        expect(m3uCatchBlock[0]).toMatch(/https\?:/);
    });
});

describe('playback.js distinguishes offline vs stream error for M3U', () => {
    // v1.0.7 replaced the active checkInternet() probe with NetworkDiagnostic.isLikelyOffline()
    // (navigator.onLine + tizen connection-type), and the post-error decision now happens
    // in the probeThenShow fetch().catch — see commit 6ad6ada.
    const playbackCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'playback.js'), 'utf8');
    const retryBlock = playbackCode.match(/All retries exhausted[\s\S]*?probeThenShow[\s\S]*?this\.player\.onBufferProgress/);

    test('retry-exhausted path probes connectivity via NetworkDiagnostic.isLikelyOffline', () => {
        expect(retryBlock).not.toBeNull();
        expect(retryBlock[0]).toContain('NetworkDiagnostic.isLikelyOffline');
        expect(retryBlock[0]).toContain('player.noInternet');
    });

    test('provider branch (apiToUse.getAccountInfo) is preserved unchanged', () => {
        expect(retryBlock[0]).toContain('apiToUse.getAccountInfo');
        expect(retryBlock[0]).toContain('connectionLimit');
    });

    test('isLikelyOffline check sits inside the probeThenShow fetch().catch (only fires on probe failure)', () => {
        // The current structure: fetch(url).then(success).catch(check isLikelyOffline)
        // — the offline detection only runs when even the probe HTTP fetch couldn't reach the URL.
        const probeBlock = playbackCode.match(/var probeThenShow\s*=\s*function[\s\S]*?\};\s*\n\s+if \(apiToUse/);
        expect(probeBlock).not.toBeNull();
        expect(probeBlock[0]).toMatch(/fetch\([^)]*\)\.then[\s\S]*\.catch\([\s\S]*isLikelyOffline/);
    });
});

describe('i18n player.noInternet key in all 11 languages', () => {
    const locales = ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ar', 'tr'];

    test.each(locales)('%s.json has player.noInternet', (lang) => {
        const json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${lang}.json`), 'utf8'));
        expect(json.player).toBeDefined();
        expect(json.player.noInternet).toBeDefined();
        expect(typeof json.player.noInternet).toBe('string');
        expect(json.player.noInternet.length).toBeGreaterThan(5);
    });

    test('js/i18n-data.js includes the rebuilt noInternet player key', () => {
        const i18nData = fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n-data.js'), 'utf8');
        const matches = i18nData.match(/"noInternet"/g);
        expect(matches).not.toBeNull();
        expect(matches.length).toBeGreaterThanOrEqual(22);
    });
});
