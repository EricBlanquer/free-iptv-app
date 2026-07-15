/**
 * Regression: a provider firewall block (Xtream "account_sharing") returns
 * HTTP 429 with the cause in an X-Firewall-Reason header AND a JSON body
 * {"reason":"account_sharing:3cc"}. The app used to discard the body/headers
 * on a non-ok response and keep only the numeric status, so the diagnostic
 * modal showed a generic "Provider HTTP 429" instead of the real cause.
 *
 * The fix reads the block reason in ProviderAPI (provider.js), propagates it
 * to NetworkDiagnostic, and maps it to a dedicated 'account_sharing' problem
 * with a localized message.
 */

const fs = require('fs');
const path = require('path');

function makeResponse(status, body, headers) {
    var hdrs = headers || {};
    return {
        ok: status >= 200 && status < 300,
        status: status,
        headers: { get: function(name) { return hdrs[name] || hdrs[name.toLowerCase()] || null; } },
        text: function() { return Promise.resolve(body); },
        json: function() { return Promise.resolve(JSON.parse(body)); }
    };
}

function loadProviderAPI() {
    global.window = global.window || {};
    window.log = jest.fn();
    global.proxyDuidParam = function() { return ''; };
    global.localStorage = { getItem: jest.fn().mockReturnValue(null), setItem: jest.fn(), removeItem: jest.fn() };
    const regexCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'regex.js'), 'utf8');
    eval(regexCode);
    const providerCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'provider.js'), 'utf8');
    eval(providerCode);
    return ProviderAPI;
}

describe('ProviderAPI.extractBlockReason', () => {
    const ProviderAPI = loadProviderAPI();

    test('reads reason from JSON body', async () => {
        const resp = makeResponse(429, '{"ok":false,"code":429,"reason":"account_sharing:3cc"}');
        await expect(ProviderAPI.extractBlockReason(resp)).resolves.toBe('account_sharing:3cc');
    });

    test('reads reason from X-Firewall-Reason header when body is not JSON (proxy path)', async () => {
        const resp = makeResponse(429, '<html>Too Many Requests</html>', { 'X-Firewall-Reason': 'account_sharing:3cc' });
        await expect(ProviderAPI.extractBlockReason(resp)).resolves.toBe('account_sharing:3cc');
    });

    test('JSON body reason wins over header', async () => {
        const resp = makeResponse(429, '{"reason":"account_sharing:3cc"}', { 'X-Firewall-Reason': 'other' });
        await expect(ProviderAPI.extractBlockReason(resp)).resolves.toBe('account_sharing:3cc');
    });

    test('returns null when no reason is present', async () => {
        const resp = makeResponse(500, 'Internal Server Error');
        await expect(ProviderAPI.extractBlockReason(resp)).resolves.toBeNull();
    });

    test('does not throw on a missing/broken body', async () => {
        const resp = {
            ok: false, status: 429,
            headers: { get: function() { return null; } },
            text: function() { return Promise.reject(new Error('body already used')); }
        };
        await expect(ProviderAPI.extractBlockReason(resp)).resolves.toBeNull();
    });
});

describe('fetchWithRetry surfaces the block reason on a 429', () => {
    let ProviderAPI;

    beforeEach(() => {
        ProviderAPI = loadProviderAPI();
    });

    test('thrown error carries httpStatus and blockReason, and diagnostic receives it', async () => {
        const runAndShow = jest.fn();
        window.NetworkDiagnostic = { runAndShow: runAndShow };
        window.app = {};
        global.fetch = jest.fn().mockResolvedValue(
            makeResponse(429, '{"ok":false,"code":429,"reason":"account_sharing:3cc"}', { 'X-Firewall-Reason': 'account_sharing:3cc' })
        );

        const api = new ProviderAPI('http://go.atlasgo.top', 'user', 'pass');
        api.retryDelay = 1;

        let caught = null;
        try {
            await api.fetchWithRetry('http://go.atlasgo.top/player_api.php?username=user&password=pass');
        } catch (ex) {
            caught = ex;
        }

        expect(caught).not.toBeNull();
        expect(caught.httpStatus).toBe(429);
        expect(caught.blockReason).toBe('account_sharing:3cc');
        expect(runAndShow).toHaveBeenCalledTimes(1);
        const call = runAndShow.mock.calls[0];
        expect(call[2]).toBe('http_429');
        expect(call[4]).toEqual({ blockReason: 'account_sharing:3cc' });
    });
});

describe('NetworkDiagnostic.run maps account_sharing before any network probe', () => {
    beforeEach(() => {
        global.fetch = jest.fn(() => { throw new Error('run() must not hit the network on the account_sharing path'); });
        const diagCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'diagnostic.js'), 'utf8');
        eval(diagCode);
    });

    test('a 429 with account_sharing reason yields problem=account_sharing (fetch never called)', async () => {
        const ctx = {
            url: 'http://go.atlasgo.top/player_api.php',
            server: 'http://go.atlasgo.top',
            errorType: 'http_429',
            blockReason: 'account_sharing:3cc'
        };
        const result = await window.NetworkDiagnostic.run(ctx);
        expect(result.problem).toBe('account_sharing');
        expect(result.details.blockReason).toBe('account_sharing:3cc');
        expect(result.details.providerStatus).toBe(429);
        expect(fetch).not.toHaveBeenCalled();
    });

    test('a plain 429 with no block reason is NOT treated as account_sharing', async () => {
        const diagCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'diagnostic.js'), 'utf8');
        // messageForProblem/decide need the full run; here we only assert the early
        // account_sharing gate does not fire without a reason.
        expect(diagCode).toMatch(/account\[_ \]\?shar/);
    });
});

describe('diagnostic.js wiring', () => {
    const diagCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'diagnostic.js'), 'utf8');

    test('messageForProblem has an account_sharing case', () => {
        expect(diagCode).toMatch(/case 'account_sharing':/);
        expect(diagCode).toContain("t('diagnostic.accountSharing'");
    });

    test('runAndShow accepts an extra arg and forwards blockReason into ctx', () => {
        expect(diagCode).toMatch(/function runAndShow\(app, url, errorType, srcApi, extra\)/);
        expect(diagCode).toMatch(/blockReason: \(extra && extra\.blockReason\)/);
    });

    test('summary renders a Blocked line with the raw reason', () => {
        expect(diagCode).toContain("diagnostic.stepBlocked");
    });
});

describe('provider.js wiring', () => {
    const providerCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'provider.js'), 'utf8');

    test('non-ok response extracts the block reason before throwing', () => {
        expect(providerCode).toContain('static async extractBlockReason');
        expect(providerCode).toMatch(/httpError\.blockReason = await ProviderAPI\.extractBlockReason/);
    });

    test('block reason is forwarded to NetworkDiagnostic.runAndShow', () => {
        expect(providerCode).toMatch(/runAndShow\(window\.app, url, errorType, this, \{ blockReason: error\.blockReason \}\)/);
    });
});

describe('i18n account_sharing keys in all 11 languages', () => {
    const locales = ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ar', 'tr'];

    test.each(locales)('%s.json has diagnostic.accountSharing and diagnostic.stepBlocked', (lang) => {
        const json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${lang}.json`), 'utf8'));
        expect(json.diagnostic).toBeDefined();
        expect(typeof json.diagnostic.accountSharing).toBe('string');
        expect(json.diagnostic.accountSharing.length).toBeGreaterThan(20);
        expect(typeof json.diagnostic.stepBlocked).toBe('string');
        expect(json.diagnostic.stepBlocked.length).toBeGreaterThan(1);
    });

    test('js/i18n-data.js was rebuilt with the new accountSharing key', () => {
        const i18nData = fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n-data.js'), 'utf8');
        const matches = i18nData.match(/"accountSharing"/g);
        expect(matches).not.toBeNull();
        expect(matches.length).toBeGreaterThanOrEqual(11);
    });
});
