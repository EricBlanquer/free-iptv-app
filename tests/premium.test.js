/**
 * Tests for js/premium.js
 * Regression tests for clock-tamper false-positive on devices with unstable clocks
 * (e.g. Freebox Pop with NTP not synced at boot).
 */

window.log = jest.fn();

var fs = require('fs');
var premiumCode = fs.readFileSync('./js/premium.js', 'utf8');

var mockLocalStorage = {
    store: {},
    getItem: function(key) { return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null; },
    setItem: function(key, value) { this.store[key] = String(value); },
    removeItem: function(key) { delete this.store[key]; },
    clear: function() { this.store = {}; }
};
Object.defineProperty(global, 'localStorage', { value: mockLocalStorage, writable: true, configurable: true });

global.I18n = {
    t: function(key, defaultText) { return defaultText; }
};

var xhrInstances = [];
function MockXHR() {
    this.headers = {};
    this.method = null;
    this.url = null;
    this.timeout = 0;
    this.responseText = '';
    this.status = 200;
    this.onload = null;
    this.onerror = null;
    this.sentData = null;
    xhrInstances.push(this);
}
MockXHR.prototype.open = function(method, url) { this.method = method; this.url = url; };
MockXHR.prototype.setRequestHeader = function(k, v) { this.headers[k] = v; };
MockXHR.prototype.send = function(data) { this.sentData = data; };
global.XMLHttpRequest = MockXHR;

var vm = require('vm');
function loadPremium() {
    var sandbox = {
        window: { log: function() {} },
        localStorage: mockLocalStorage,
        XMLHttpRequest: global.XMLHttpRequest,
        I18n: global.I18n,
        Date: Date,
        parseInt: parseInt,
        Math: Math,
        JSON: JSON,
        Premium: null
    };
    vm.createContext(sandbox);
    vm.runInContext(premiumCode + '\nthis.Premium = Premium;', sandbox);
    return sandbox.Premium;
}

var DAY = 86400000;

describe('Premium', function() {
    beforeEach(function() {
        mockLocalStorage.clear();
        xhrInstances = [];
    });

    describe('clock tamper false-positive (Freebox Pop unstable clock)', function() {
        it('should NOT jump from TRIAL to EXPIRED when device clock was wrongly in the future before reboot', function() {
            var now = Date.now();
            var threeDaysAgo = now - 3 * DAY;
            var futureLastSeen = now + 90 * DAY;

            mockLocalStorage.setItem('premiumInstallDate', String(threeDaysAgo));
            mockLocalStorage.setItem('premiumLastSeen', String(futureLastSeen));

            var P = loadPremium();
            P.init('test-device-1');

            expect(P.getState()).not.toBe(P.STATE_EXPIRED);
            expect(P.getState()).toBe(P.STATE_TRIAL);
            expect(P.getTrialDaysLeft()).toBeGreaterThan(20);
        });

        it('should adopt server installDate as authoritative when local was corrupted', function() {
            var now = Date.now();
            var threeDaysAgo = now - 3 * DAY;
            var corruptedLocalInstall = now - 100 * DAY;

            mockLocalStorage.setItem('premiumInstallDate', String(corruptedLocalInstall));
            mockLocalStorage.setItem('premiumLastSeen', String(now - DAY));

            var P = loadPremium();
            P.init('test-device-2');

            expect(xhrInstances.length).toBeGreaterThanOrEqual(1);
            var getXhr = xhrInstances[0];
            getXhr.responseText = JSON.stringify({ installDate: threeDaysAgo, licenseCode: '' });
            getXhr.status = 200;
            getXhr.onload();

            expect(P.getState()).toBe(P.STATE_TRIAL);
            expect(P.getTrialDaysLeft()).toBeGreaterThan(20);
        });
    });

    describe('basic state computation', function() {
        it('should be TRIAL on fresh install', function() {
            var P = loadPremium();
            P.init('fresh-device');
            expect(P.getState()).toBe(P.STATE_TRIAL);
            expect(P.getTrialDaysLeft()).toBe(30);
        });

        it('should be GRACE between day 31 and 60', function() {
            var now = Date.now();
            mockLocalStorage.setItem('premiumInstallDate', String(now - 45 * DAY));
            mockLocalStorage.setItem('premiumLastSeen', String(now - DAY));
            var P = loadPremium();
            P.init('grace-device');
            expect(P.getState()).toBe(P.STATE_GRACE);
        });

        it('should be EXPIRED after day 60', function() {
            var now = Date.now();
            mockLocalStorage.setItem('premiumInstallDate', String(now - 70 * DAY));
            mockLocalStorage.setItem('premiumLastSeen', String(now - DAY));
            var P = loadPremium();
            P.init('expired-device');
            expect(P.getState()).toBe(P.STATE_EXPIRED);
        });

        it('should be LICENSED when license code is present', function() {
            mockLocalStorage.setItem('premiumLicenseCode', 'ABCDEF');
            var P = loadPremium();
            P.init('licensed-device');
            expect(P.getState()).toBe(P.STATE_LICENSED);
        });
    });
});
