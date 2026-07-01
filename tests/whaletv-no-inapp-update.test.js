/**
 * Regression test for the Whale TV certification blocker (reported 2026-06-25
 * by tech.support@whaletv.com).
 *
 * Symptom (Whale TV review): on launch, an in-app update prompt ("a new version
 * is available") was displayed. Selecting any option left the app on a Settings
 * screen, unresponsive — Back did nothing and the app could only be left with
 * the Home button.
 *
 * Whale TV policy: "In-app application updates are not permitted on our
 * platform." The in-app APK self-update (download app.apk from
 * iptv.blanquer.org and install it via FileProvider + REQUEST_INSTALL_PACKAGES)
 * must be removed entirely, on every Android build — not merely gated on Play
 * Store installs (Whale TV is a sideloaded APK, so the old
 * isInstalledFromPlayStore() guard never fired there).
 *
 * What stays: the SILENT web-assets refresh (version.json "build" +
 * web-assets.zip, signature-verified, reloaded in the WebView). It shows no
 * prompt, installs no package, and is the deploy channel for fixes.
 *
 * This test reads the sources and asserts the self-update is gone on both the
 * JS and the native side, and that the web-assets path is preserved.
 */

const fs = require('fs');

function read(p) {
    return fs.readFileSync(p, 'utf8');
}

const appJs = read('./js/app.js');
const utilsJs = read('./js/core/utils.js');
const settingsJs = read('./js/settings.js');
const mainActivity = read('./android/app/src/main/java/fr/blanquer/freeiptv/MainActivity.java');
const webUpdater = read('./android/app/src/main/java/fr/blanquer/freeiptv/WebUpdater.java');
const mainManifest = read('./android/app/src/main/AndroidManifest.xml');

describe('Whale TV: the in-app APK self-update is fully removed (JS side)', () => {
    const goneFromApp = [
        'checkPendingApkUpdate',
        'showApkUpdatePrompt',
        'startApkDownload',
        '_isInstalledFromPlayStore',
        '_apkUpdateAvailable',
        '_showApkUpdateUnavailable',
        'updateApkDownloadProgress',
        'onApkDownloadReady',
        'onApkDownloadError',
    ];
    goneFromApp.forEach(function(sym) {
        it('js/app.js no longer references ' + sym, () => {
            expect(appJs).not.toContain(sym);
        });
    });

    it('js/app.js init() does not trigger any update prompt', () => {
        expect(appJs).not.toMatch(/checkPendingApkUpdate\s*\(/);
    });

    it('js/core/utils.js onAppResumed no longer re-checks for an APK update', () => {
        expect(utilsJs).not.toContain('checkPendingApkUpdate');
    });

    it('js/settings.js has no in-app "Install update" action or button updater', () => {
        expect(settingsJs).not.toContain('installUpdate');
        expect(settingsJs).not.toContain('updateSettingsUpdateButton');
    });
});

describe('Whale TV: the in-app APK self-update is fully removed (native side)', () => {
    const goneFromMainActivity = [
        'downloadAndInstallApk',
        'getRemoteApkVersion',
        'canInstallPackages',
        'requestInstallPermission',
        'isInstalledFromPlayStore',
        'launchInstaller',
        'setApkUpdateListener',
        'FileProvider',
    ];
    goneFromMainActivity.forEach(function(sym) {
        it('MainActivity.java no longer references ' + sym, () => {
            expect(mainActivity).not.toContain(sym);
        });
    });

    const goneFromWebUpdater = [
        'downloadApk',
        'getRemoteApkVersion',
        'ApkUpdateListener',
        'ApkDownloadListener',
        'checkApkUpdate',
        'verifyApkSignature',
    ];
    goneFromWebUpdater.forEach(function(sym) {
        it('WebUpdater.java no longer references ' + sym, () => {
            expect(webUpdater).not.toContain(sym);
        });
    });
});

describe('Whale TV: no install-packages capability is shipped', () => {
    it('main manifest does not declare REQUEST_INSTALL_PACKAGES', () => {
        expect(mainManifest).not.toMatch(/REQUEST_INSTALL_PACKAGES/);
    });

    it('main manifest no longer declares the APK-install FileProvider', () => {
        expect(mainManifest).not.toMatch(/FileProvider/);
    });

    it('the debug-only manifest (carried only the install permission) is removed', () => {
        expect(fs.existsSync('./android/app/src/debug/AndroidManifest.xml')).toBe(false);
    });

    it('the FileProvider paths resource is removed', () => {
        expect(fs.existsSync('./android/app/src/main/res/xml/file_provider_paths.xml')).toBe(false);
    });
});

describe('Whale TV: the silent web-assets refresh is preserved', () => {
    it('js/app.js still applies a downloaded web bundle', () => {
        expect(appJs).toContain('showWebUpdateReady');
        expect(appJs).toContain('reloadWebAssets');
    });

    it('MainActivity.java still exposes the web-assets bridge', () => {
        expect(mainActivity).toContain('reloadWebAssets');
        expect(mainActivity).toContain('forceCheckUpdates');
        expect(mainActivity).toContain('markWebHealthy');
    });

    it('WebUpdater.java still checks and verifies the web bundle', () => {
        expect(webUpdater).toContain('checkAndUpdate');
        expect(webUpdater).toContain('verifySignature');
        expect(webUpdater).toContain('getLocalWebPath');
    });
});
