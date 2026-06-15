/**
 * Regression test for device-type detection (reported 2026-05-31).
 *
 * Bug: an NVIDIA SHIELD (Android TV) was treated as a mobile device, so the
 * circular touch "back" button (and the 'touch' body class) appeared on the
 * TV. Root cause: detection used /Android/ alone, which is true for Android
 * TV too. Fix: window.isMobileTouch requires the Android UA *and* the "Mobile"
 * token (present on phones, absent on Android TV / SHIELD / Fire TV / Tizen).
 *
 * Follow-up (reported 2026-06-15, Freebox Pop): an Android WebView ALWAYS
 * carries the "Mobile Safari" token in its user agent regardless of form
 * factor (confirmed by Google's "User-Agent Reduction on Android WebView").
 * So UA sniffing alone misdetects an Android TV box (e.g. Freebox Pop) whose
 * WebView UA contains "Mobile". The authoritative signal is now injected by
 * the native layer (MainActivity, via UiModeManager / leanback) as
 * window.__isAndroidTV; when true, the device is never treated as mobile.
 *
 * This test evaluates the actual expression assigned to window.isMobileTouch
 * in tizen-shim.js so it tracks the real source.
 */

const fs = require('fs');

const shimSource = fs.readFileSync('./tizen-shim.js', 'utf8');

function extractDetectionExpression() {
    const m = shimSource.match(/window\.isMobileTouch\s*=\s*([^;]+);/);
    if (!m) throw new Error('Could not find window.isMobileTouch assignment');
    return m[1].trim();
}

function detect(userAgent, isAndroidTV) {
    const expr = extractDetectionExpression();
    return Function('navigator', 'window', 'return (' + expr + ');')(
        { userAgent: userAgent },
        { __isAndroidTV: isAndroidTV === true }
    );
}

const PHONE = 'Mozilla/5.0 (Linux; Android 13; SM-A525F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36';
const SHIELD = 'Mozilla/5.0 (Linux; Android 11; SHIELD Build/RQ3A.210705.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Safari/537.36';
const FIRE_TV = 'Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7233) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/70.0.3538.110 Safari/537.36';
const BRAVIA = 'Mozilla/5.0 (Linux; Android 10; BRAVIA 4K GB) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.120 Safari/537.36';
const TIZEN = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36';
// Real Android WebView UA of the Freebox Pop: an Android TV box whose WebView
// nonetheless carries the "Mobile Safari" token (the "wv" + "Mobile" pattern).
const FREEBOX_POP_WEBVIEW = 'Mozilla/5.0 (Linux; Android 10; Freebox Player POP Build/QTG3.200305.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/83.0.4103.106 Mobile Safari/537.36';

describe('window.isMobileTouch distinguishes phones from TVs', () => {
    it('detects an Android phone as mobile touch', () => {
        expect(detect(PHONE)).toBe(true);
    });

    it('does NOT treat an NVIDIA SHIELD (Android TV) as mobile (the bug)', () => {
        expect(detect(SHIELD)).toBe(false);
    });

    it('does NOT treat a Fire TV as mobile', () => {
        expect(detect(FIRE_TV)).toBe(false);
    });

    it('does NOT treat a Sony BRAVIA Android TV as mobile', () => {
        expect(detect(BRAVIA)).toBe(false);
    });

    it('does NOT treat a Samsung Tizen TV as mobile', () => {
        expect(detect(TIZEN)).toBe(false);
    });
});

describe('window.__isAndroidTV overrides UA sniffing (Freebox Pop)', () => {
    it('demonstrates UA alone misdetects a Freebox Pop WebView as mobile', () => {
        // Without the native flag, the "Mobile" token in the WebView UA wins.
        expect(detect(FREEBOX_POP_WEBVIEW, false)).toBe(true);
    });

    it('does NOT treat a Freebox Pop as mobile when the native TV flag is set', () => {
        expect(detect(FREEBOX_POP_WEBVIEW, true)).toBe(false);
    });

    it('still treats a real Android phone as mobile when the TV flag is false', () => {
        expect(detect(PHONE, false)).toBe(true);
    });

    it('treats any device as non-mobile when the native TV flag is set', () => {
        expect(detect(PHONE, true)).toBe(false);
    });
});
