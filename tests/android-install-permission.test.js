/**
 * Regression test for the "impossible to update the APK" bug
 * (reported 2026-06-15).
 *
 * Symptom: the in-app APK auto-update always showed "Automatic update is not
 * available on this device" and could never install.
 *
 * Root cause: the app self-installs the downloaded APK via an ACTION_VIEW
 * intent (launchInstaller / FileProvider). On Android 8+ that requires the
 * REQUEST_INSTALL_PACKAGES permission to be DECLARED in the manifest —
 * otherwise canRequestPackageInstalls() stays false and the user cannot even
 * grant "install unknown apps" for the app. The manifest only declared
 * INTERNET, so self-update was impossible regardless of APK signing.
 *
 * Fix: declare android.permission.REQUEST_INSTALL_PACKAGES — but ONLY in the
 * debug build (the sideload distribution that self-updates). The Google Play
 * release must NOT carry it: Play handles updates, the in-app self-update is
 * gated off, and Play scrutinizes this permission. So it lives in
 * src/debug/AndroidManifest.xml, not the main manifest.
 */

const fs = require('fs');

const mainManifest = fs.readFileSync(
    './android/app/src/main/AndroidManifest.xml',
    'utf8'
);
const debugManifest = fs.readFileSync(
    './android/app/src/debug/AndroidManifest.xml',
    'utf8'
);

const REQUEST_INSTALL =
    /<uses-permission\s+android:name="android\.permission\.REQUEST_INSTALL_PACKAGES"\s*\/>/;

describe('REQUEST_INSTALL_PACKAGES is debug-only (sideload self-update)', () => {
    it('is declared in the debug manifest', () => {
        expect(debugManifest).toMatch(REQUEST_INSTALL);
    });

    it('is NOT declared in the main manifest (kept out of the Play release)', () => {
        expect(mainManifest).not.toMatch(REQUEST_INSTALL);
    });
});

describe('Main manifest keeps the baseline declarations', () => {
    it('keeps the INTERNET permission', () => {
        expect(mainManifest).toMatch(
            /<uses-permission\s+android:name="android\.permission\.INTERNET"\s*\/>/
        );
    });

    it('declares the FileProvider used to hand the APK to the installer', () => {
        expect(mainManifest).toMatch(/androidx\.core\.content\.FileProvider/);
    });
});
