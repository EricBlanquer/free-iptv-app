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
    const m3uCatchBlock = appCode.match(/playlist\.type === 'm3u'[\s\S]*?\}\)\;\s*\}/);

    test('catch block calls NetworkDiagnostic.runAndShow', () => {
        expect(m3uCatchBlock).not.toBeNull();
        expect(m3uCatchBlock[0]).toContain('NetworkDiagnostic.runAndShow');
    });

    test('diagnostic is gated by https?:// check (skips local bundled file)', () => {
        expect(m3uCatchBlock[0]).toMatch(/https\?:/);
    });
});

describe('playback.js distinguishes offline vs stream error for M3U', () => {
    const playbackCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'playback.js'), 'utf8');
    const retryBlock = playbackCode.match(/All retries exhausted[\s\S]*?stopPlayback\(\)[\s\S]*?\}\s*;\s*this\.player\.onBufferProgress/);

    test('retry-exhausted path probes internet via NetworkDiagnostic.checkInternet', () => {
        expect(retryBlock).not.toBeNull();
        expect(retryBlock[0]).toContain('NetworkDiagnostic.checkInternet');
        expect(retryBlock[0]).toContain('player.noInternet');
    });

    test('provider branch (apiToUse.getAccountInfo) is preserved unchanged', () => {
        expect(retryBlock[0]).toContain('apiToUse.getAccountInfo');
        expect(retryBlock[0]).toContain('connectionLimit');
    });

    test('provider errors do NOT trigger internet probe (only fallback for M3U)', () => {
        const providerBranch = retryBlock[0].match(/if\s*\(apiToUse[\s\S]*?else if[\s\S]*?else/);
        expect(providerBranch).not.toBeNull();
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
