/**
 * Regression test for the APK self-update on Google Play installs
 * (reported 2026-06-15).
 *
 * Context: the in-app APK self-update downloads app.apk from iptv.blanquer.org
 * (signed with the developer's release key) and installs it. On a Google Play
 * install, the app is re-signed with Google's Play App Signing key, so that
 * APK can NEVER be installed over it (signature mismatch) — and self-updating
 * a Play app violates Play policy anyway. The settings "Install update" button
 * therefore led nowhere on Play installs.
 *
 * Fix: MainActivity exposes isInstalledFromPlayStore() (installer ==
 * com.android.vending). When true, the app skips the in-app APK update
 * entirely (no prompt, no download) and lets Google Play handle updates.
 */

const fs = require('fs');
const vm = require('vm');

const appCode = fs.readFileSync('./js/app.js', 'utf8');

function sliceClassMethod(src, name) {
    const re = new RegExp('^    ' + name + '(\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n    \\})', 'm');
    const m = src.match(re);
    if (!m) throw new Error('Could not extract method ' + name);
    return 'IPTVApp.prototype.' + name + ' = function' + m[1] + ';';
}

function buildApp(androidOverrides) {
    function IPTVApp() {}
    const calls = { showApkUpdatePrompt: 0, downloadAndInstallApk: 0 };
    IPTVApp.prototype.showApkUpdatePrompt = function() { calls.showApkUpdatePrompt++; };
    IPTVApp.prototype._showApkDownloadToast = function() {};
    IPTVApp.prototype._showApkUpdateUnavailable = function() {};
    IPTVApp.prototype.showConfirmModal = function() {};

    const Android = Object.assign({
        getRemoteApkVersion: function() { return 999999; },
        getAppVersion: function() { return '2.0.0 (1)'; },
        downloadAndInstallApk: function() { calls.downloadAndInstallApk++; },
        canInstallPackages: function() { return true; },
        isInstalledFromPlayStore: function() { return false; },
    }, androidOverrides || {});

    const ctx = vm.createContext({
        IPTVApp: IPTVApp,
        Android: Android,
        window: { log: function() {} },
        setTimeout: function(fn) { fn(); },
        I18n: { t: function(k, d) { return d || k; } },
        Date: Date,
    });
    vm.runInContext(sliceClassMethod(appCode, '_isInstalledFromPlayStore'), ctx);
    vm.runInContext(sliceClassMethod(appCode, 'checkPendingApkUpdate'), ctx);
    vm.runInContext(sliceClassMethod(appCode, 'startApkDownload'), ctx);

    const app = new IPTVApp();
    return { app, calls };
}

describe('APK self-update is skipped on Google Play installs', () => {
    it('_isInstalledFromPlayStore reflects the native bridge', () => {
        expect(buildApp({ isInstalledFromPlayStore: () => true }).app._isInstalledFromPlayStore()).toBe(true);
        expect(buildApp({ isInstalledFromPlayStore: () => false }).app._isInstalledFromPlayStore()).toBe(false);
    });

    it('does NOT prompt for an APK update on a Play install (even if remote > local)', () => {
        const { app, calls } = buildApp({ isInstalledFromPlayStore: () => true });
        app.checkPendingApkUpdate();
        expect(calls.showApkUpdatePrompt).toBe(0);
    });

    it('DOES prompt for an APK update on a sideloaded install', () => {
        const { app, calls } = buildApp({ isInstalledFromPlayStore: () => false });
        app.checkPendingApkUpdate();
        expect(calls.showApkUpdatePrompt).toBe(1);
    });

    it('does NOT download/install the APK on a Play install', () => {
        const { app, calls } = buildApp({ isInstalledFromPlayStore: () => true });
        app.startApkDownload();
        expect(calls.downloadAndInstallApk).toBe(0);
    });

    it('DOES download/install the APK on a sideloaded install', () => {
        const { app, calls } = buildApp({ isInstalledFromPlayStore: () => false });
        app.startApkDownload();
        expect(calls.downloadAndInstallApk).toBe(1);
    });
});
