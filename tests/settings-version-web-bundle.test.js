/**
 * Regression test for the Settings version line showing the wrong version on Android.
 *
 * Reported 2026-05-31: the web bundle is 2.0.0 (config.xml in the bundle), but the
 * Settings header showed "v1.0.8" — the APK shell versionName. The web bundle is
 * what actually updates over-the-air and carries every feature/fix, so the
 * displayed version must reflect it (APP_VERSION, read from the bundle's
 * config.xml), not the native APK versionName from Android.getAppVersion().
 *
 * Root cause: settings.js initialised versionText from APP_VERSION (correct: the
 * web bundle version), then on Android OVERWROTE it with Android.getAppVersion().
 *
 * The repair drops that override and keeps the web build hash suffix for support.
 */

const fs = require('fs');
const settingsCode = fs.readFileSync('./js/settings.js', 'utf8');
const appCode = fs.readFileSync('./js/app.js', 'utf8');

describe('Settings version line reflects the web bundle version (APP_VERSION), not the APK shell', () => {
    const start = settingsCode.indexOf("var versionText = 'v' + APP_VERSION;");
    const region = settingsCode.substring(start, start + 700);

    it('initialises the version from APP_VERSION', () => {
        expect(start).toBeGreaterThan(0);
        expect(region).toMatch(/var versionText = 'v' \+ APP_VERSION;/);
    });

    it('does NOT overwrite the version with the native APK getAppVersion()', () => {
        expect(region).not.toMatch(/versionText\s*=\s*'v'\s*\+\s*nativeVersion/);
        expect(region).not.toMatch(/Android\.getAppVersion\(\)/);
    });

    it('still appends the web build hash on Android for support', () => {
        expect(region).toMatch(/Android\.getWebBuildHash/);
        expect(region).toMatch(/versionText \+= ' \[' \+ buildHash/);
    });

    it('APP_VERSION is read from the bundle config.xml (so it tracks the web bundle, not the APK)', () => {
        expect(appCode).toMatch(/xhr\.open\(\s*'GET',\s*'config\.xml'/);
        expect(appCode).toMatch(/APP_VERSION = match\[1\]/);
    });
});
