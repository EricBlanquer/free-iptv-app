/**
 * Tests for setupRemoteDebug expiry handling
 * Bug: remoteDebug auto-expiry was only checked at app init — if app stayed alive
 * (background) past 24h expiry, remote logging kept running forever.
 *
 * The wrapped window.log must also gate on the current settings.remoteDebug flag
 * so that runtime expiry actually stops the network sends (without app reload).
 *
 * Loads js/settings.js via vm.runInThisContext to avoid eval() (project security hook).
 */

const fs = require('fs');
const vm = require('vm');

function IPTVApp() {
    this.settings = {};
}
IPTVApp.prototype.saveSettings = jest.fn();

const settingsCode = fs.readFileSync('./js/settings.js', 'utf8');
const match = settingsCode.match(/IPTVApp\.prototype\.setupRemoteDebug\s*=\s*function[\s\S]*?\n\};\n/);
if (!match) throw new Error('Could not extract setupRemoteDebug from js/settings.js');
const ctx = vm.createContext({
    IPTVApp: IPTVApp,
    Date: Date,
    window: global.window,
    setInterval: setInterval,
    XMLHttpRequest: global.XMLHttpRequest
});
vm.runInContext(match[0], ctx);

describe('IPTVApp.prototype.setupRemoteDebug', () => {
    let originalLog;

    beforeEach(() => {
        originalLog = window.log;
        window.log = jest.fn();
        delete window._remoteDebugEnabled;
        window.deviceId = 'test-device';
        IPTVApp.prototype.saveSettings.mockClear();
    });

    afterEach(() => {
        window.log = originalLog;
        delete window._remoteDebugEnabled;
    });

    it('should clear remoteDebug + expiry when expiry has passed', () => {
        const app = new IPTVApp();
        app.settings.remoteDebug = true;
        app.settings.remoteDebugExpiry = Date.now() - 1000;
        app.setupRemoteDebug();
        expect(app.settings.remoteDebug).toBe(false);
        expect(app.settings.remoteDebugExpiry).toBeUndefined();
        expect(app.saveSettings).toHaveBeenCalledTimes(1);
    });

    it('should keep remoteDebug enabled when expiry is still in the future', () => {
        const app = new IPTVApp();
        app.settings.remoteDebug = true;
        app.settings.remoteDebugExpiry = Date.now() + 60000;
        app.setupRemoteDebug();
        expect(app.settings.remoteDebug).toBe(true);
        expect(app.settings.remoteDebugExpiry).toBeGreaterThan(Date.now());
    });

    it('should not throw or alter settings when remoteDebug is already off', () => {
        const app = new IPTVApp();
        app.settings.remoteDebug = false;
        expect(function() { app.setupRemoteDebug(); }).not.toThrow();
        expect(app.saveSettings).not.toHaveBeenCalled();
    });

    it('wrapped window.log source should gate remote send on current settings.remoteDebug', () => {
        // Bug 2 root-cause: once the wrapper was installed, it never re-checked the setting,
        // so when expiry flipped remoteDebug to false the network sends kept going.
        // The fix adds `if (!self.settings.remoteDebug) return;` inside the wrapper.
        const wrapperSource = match[0];
        expect(wrapperSource).toMatch(/var\s+self\s*=\s*this\s*;/);
        expect(wrapperSource).toMatch(/if\s*\(\s*!\s*self\.settings\.remoteDebug\s*\)\s*return\s*;/);
    });
});
