/**
 * Regression test for the Android in-app APK update crashing silently.
 *
 * Bug captured 2026-05-31 in remote debug log (phone android-f2060842bcd8d970):
 *   ERR app.js Uncaught Error: Error invoking canInstallPackages: Java exception
 *     at IPTVApp.startApkDownload
 *
 * Root cause: the native canInstallPackages() calls
 * getPackageManager().canRequestPackageInstalls(), which throws a
 * SecurityException when REQUEST_INSTALL_PACKAGES is not declared (it was
 * removed for Google Play). The JS called Android.canInstallPackages()
 * OUTSIDE any try/catch, so tapping "Install" threw an uncaught error and
 * nothing happened.
 *
 * The repair wraps canInstallPackages() in try/catch: on throw it degrades to
 * _showApkUpdateUnavailable() (a toast pointing to the manual download) instead
 * of crashing. A clean `false` still shows the permission prompt; `true` still
 * proceeds to download+install.
 */

const fs = require('fs');
const vm = require('vm');

const appCode = fs.readFileSync('./js/app.js', 'utf8');

function methodBody(src, name) {
    const re = new RegExp('\\n    ' + name + '\\(\\)\\s*\\{\\n([\\s\\S]*?)\\n    \\}\\n');
    const m = src.match(re);
    if (!m) throw new Error('method not found: ' + name);
    return m[1];
}

function buildApp(android) {
    function IPTVApp() {
        this.calls = { toast: 0, confirmModal: 0, downloadToast: 0 };
    }
    IPTVApp.prototype._showToast = function() { this.calls.toast++; };
    IPTVApp.prototype.showConfirmModal = function() { this.calls.confirmModal++; };
    IPTVApp.prototype._showApkDownloadToast = function() { this.calls.downloadToast++; };

    const src =
        'IPTVApp.prototype.startApkDownload = function() {\n' + methodBody(appCode, 'startApkDownload') + '\n};\n' +
        'IPTVApp.prototype._showApkUpdateUnavailable = function() {\n' + methodBody(appCode, '_showApkUpdateUnavailable') + '\n};\n';

    const ctx = vm.createContext({
        IPTVApp: IPTVApp,
        Android: android,
        I18n: { t: function(k, fb) { return fb || k; } },
        window: { log: function() {} },
    });
    vm.runInContext(src, ctx);
    return new IPTVApp();
}

function call(app) {
    let threw = false;
    try { app.startApkDownload(); }
    catch (ex) { threw = true; }
    return threw;
}

describe('startApkDownload — canInstallPackages() throwing must not crash the install action', () => {
    it('does NOT propagate when canInstallPackages throws, and shows the unavailable fallback', () => {
        let downloadCalled = 0;
        const app = buildApp({
            downloadAndInstallApk: function() { downloadCalled++; },
            canInstallPackages: function() { throw new Error('Error invoking canInstallPackages: Java exception'); },
        });
        const threw = call(app);
        expect(threw).toBe(false);
        expect(downloadCalled).toBe(0);
        expect(app.calls.toast).toBe(1);
        expect(app.calls.confirmModal).toBe(0);
    });

    it('shows the permission prompt when canInstallPackages cleanly returns false', () => {
        let downloadCalled = 0;
        const app = buildApp({
            downloadAndInstallApk: function() { downloadCalled++; },
            canInstallPackages: function() { return false; },
        });
        const threw = call(app);
        expect(threw).toBe(false);
        expect(downloadCalled).toBe(0);
        expect(app.calls.confirmModal).toBe(1);
        expect(app.calls.toast).toBe(0);
    });

    it('proceeds to download+install when canInstallPackages returns true', () => {
        let downloadCalled = 0;
        const app = buildApp({
            downloadAndInstallApk: function() { downloadCalled++; },
            canInstallPackages: function() { return true; },
        });
        const threw = call(app);
        expect(threw).toBe(false);
        expect(downloadCalled).toBe(1);
        expect(app.calls.downloadToast).toBe(1);
        expect(app.calls.confirmModal).toBe(0);
    });

    it('falls back gracefully when downloadAndInstallApk itself throws', () => {
        const app = buildApp({
            downloadAndInstallApk: function() { throw new Error('boom'); },
            canInstallPackages: function() { return true; },
        });
        const threw = call(app);
        expect(threw).toBe(false);
        expect(app.calls.toast).toBe(1);
    });
});

describe('apkUpdate.unavailable string is localized in all 11 languages', () => {
    const langs = ['en', 'ar', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'ru', 'tr'];
    langs.forEach(function(l) {
        it('locale ' + l + ' has apkUpdate.unavailable', () => {
            const json = JSON.parse(fs.readFileSync('./locales/' + l + '.json', 'utf8'));
            expect(json.apkUpdate && typeof json.apkUpdate.unavailable).toBe('string');
            expect(json.apkUpdate.unavailable.length).toBeGreaterThan(0);
        });
    });
});
