/**
 * Regression test for device-type detection (reported 2026-05-31).
 *
 * Bug: an NVIDIA SHIELD (Android TV) was treated as a mobile device, so the
 * circular touch "back" button (and the 'touch' body class) appeared on the
 * TV. Root cause: detection used /Android/ alone, which is true for Android
 * TV too. Fix: window.isMobileTouch requires the Android UA *and* the "Mobile"
 * token (present on phones, absent on Android TV / SHIELD / Fire TV / Tizen).
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

function detect(userAgent) {
    const expr = extractDetectionExpression();
    return Function('navigator', 'return (' + expr + ');')({ userAgent: userAgent });
}

const PHONE = 'Mozilla/5.0 (Linux; Android 13; SM-A525F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36';
const SHIELD = 'Mozilla/5.0 (Linux; Android 11; SHIELD Build/RQ3A.210705.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Safari/537.36';
const FIRE_TV = 'Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7233) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/70.0.3538.110 Safari/537.36';
const BRAVIA = 'Mozilla/5.0 (Linux; Android 10; BRAVIA 4K GB) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.120 Safari/537.36';
const TIZEN = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36';

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
