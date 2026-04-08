/**
 * Premium Module - Donationware monetization
 * Manages trial/grace/expired/licensed states
 * Server-side sync via PHP API (server installDate is authoritative)
 */
var Premium = (function() {
    var API_URL = 'https://iptv.blanquer.org/premium-api.php';
    var TRIAL_DAYS = 30;
    var GRACE_DAYS = 30;
    var STATE_TRIAL = 'TRIAL';
    var STATE_GRACE = 'GRACE';
    var STATE_EXPIRED = 'EXPIRED';
    var STATE_LICENSED = 'LICENSED';
    var HISTORY_FREE_LIMIT = 10;

    var _deviceId = null;
    var _state = STATE_TRIAL;
    var _installDate = null;
    var _lastSeenDate = null;
    var _licenseCode = null;
    var _reminderShownToday = false;

    function init(deviceId) {
        _deviceId = deviceId;
        _loadLocal();
        _syncServer();
        _computeState();
        window.log('PREMIUM', 'init state=' + _state + ' installDate=' + _installDate + ' deviceId=' + _deviceId);
    }

    function _loadLocal() {
        try {
            var stored = localStorage.getItem('premiumInstallDate');
            if (stored) {
                _installDate = parseInt(stored);
            }
            else {
                _installDate = Date.now();
                localStorage.setItem('premiumInstallDate', String(_installDate));
            }
            _lastSeenDate = parseInt(localStorage.getItem('premiumLastSeen')) || Date.now();
            _licenseCode = localStorage.getItem('premiumLicenseCode') || null;
            var reminderDate = localStorage.getItem('premiumReminderDate');
            if (reminderDate === _todayString()) {
                _reminderShownToday = true;
            }
        }
        catch (ex) {
            window.log('PREMIUM', 'loadLocal error: ' + ex);
        }
        try {
            localStorage.setItem('premiumLastSeen', String(Date.now()));
        }
        catch (ex) { /* ignore */ }
    }

    function _todayString() {
        var d = new Date();
        return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    }

    function _daysSinceInstall() {
        return Math.floor((Date.now() - _installDate) / 86400000);
    }

    function _computeState() {
        if (_licenseCode) {
            _state = STATE_LICENSED;
            return;
        }
        var days = _daysSinceInstall();
        if (days <= TRIAL_DAYS) {
            _state = STATE_TRIAL;
        }
        else if (days <= TRIAL_DAYS + GRACE_DAYS) {
            _state = STATE_GRACE;
        }
        else {
            _state = STATE_EXPIRED;
        }
    }

    function _syncServer() {
        if (!_deviceId) return;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', API_URL + '?action=premium-get&deviceId=' + encodeURIComponent(_deviceId), true);
        xhr.timeout = 5000;
        xhr.onload = function() {
            if (xhr.status !== 200) return;
            try {
                var data = JSON.parse(xhr.responseText);
                if (!data) {
                    _pushToServer();
                    return;
                }
                if (data.licenseCode) {
                    _licenseCode = data.licenseCode;
                    try {
                        localStorage.setItem('premiumLicenseCode', _licenseCode);
                    }
                    catch (ex) { /* ignore */ }
                }
                else if (_licenseCode) {
                    _licenseCode = null;
                    try {
                        localStorage.removeItem('premiumLicenseCode');
                    }
                    catch (ex) { /* ignore */ }
                }
                if (data.installDate) {
                    var serverInstall = parseInt(data.installDate);
                    if (serverInstall && serverInstall <= Date.now() && serverInstall !== _installDate) {
                        _installDate = serverInstall;
                        try {
                            localStorage.setItem('premiumInstallDate', String(_installDate));
                        }
                        catch (ex) { /* ignore */ }
                    }
                }
                var prevState = _state;
                _computeState();
                window.log('PREMIUM', 'sync done state=' + _state);
                if (_state !== prevState) {
                    if (window.app) window.app.updatePremiumStatus();
                    if (shouldShowReminder()) showReminder();
                }
            }
            catch (ex) {
                window.log('PREMIUM', 'sync parse error: ' + ex);
            }
        };
        xhr.onerror = function() {
            window.log('PREMIUM', 'sync error');
        };
        xhr.send();
    }

    function _pushToServer() {
        if (!_deviceId) return;
        var payload = JSON.stringify({
            installDate: _installDate,
            licenseCode: _licenseCode || ''
        });
        var xhr = new XMLHttpRequest();
        xhr.open('POST', API_URL + '?action=premium-put&deviceId=' + encodeURIComponent(_deviceId), true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.timeout = 5000;
        xhr.send(payload);
    }

    function getState() {
        return _state;
    }

    function isPremium() {
        return _state === STATE_TRIAL || _state === STATE_LICENSED;
    }

    function getTrialDaysLeft() {
        var days = TRIAL_DAYS - _daysSinceInstall();
        return days > 0 ? days : 0;
    }

    function getHistoryFreeLimit() {
        return HISTORY_FREE_LIMIT;
    }

    function validateCode(code, callback) {
        if (!code || code.length < 4) {
            callback(false, 'invalid');
            return;
        }
        var payload = JSON.stringify({
            code: code.toUpperCase().trim(),
            deviceId: _deviceId
        });
        var xhr = new XMLHttpRequest();
        xhr.open('POST', API_URL + '?action=license-validate', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.timeout = 10000;
        xhr.onload = function() {
            try {
                var data = JSON.parse(xhr.responseText);
                if (data.valid) {
                    _licenseCode = code.toUpperCase().trim();
                    _state = STATE_LICENSED;
                    try {
                        localStorage.setItem('premiumLicenseCode', _licenseCode);
                    }
                    catch (ex) { /* ignore */ }
                    _pushToServer();
                    callback(true);
                }
                else {
                    callback(false, data.error || 'invalid');
                }
            }
            catch (ex) {
                callback(false, 'error');
            }
        };
        xhr.onerror = function() {
            callback(false, 'network');
        };
        xhr.send(payload);
    }

    function shouldShowReminder() {
        if (_state === STATE_EXPIRED) return true;
        if (_state !== STATE_GRACE) return false;
        if (_reminderShownToday) return false;
        return true;
    }

    function markReminderShown() {
        _reminderShownToday = true;
        try {
            localStorage.setItem('premiumReminderDate', _todayString());
        }
        catch (ex) { /* ignore */ }
    }

    function showReminder() {
        if (!shouldShowReminder()) return;
        markReminderShown();
        _showModal();
    }

    function _showModal() {
        var modal = document.getElementById('premium-modal');
        if (!modal) return;
        var title = document.getElementById('premium-modal-title');
        var message = document.getElementById('premium-modal-message');
        var continueBtn = document.getElementById('premium-continue-btn');
        var laterBtn = document.getElementById('premium-later-btn');
        if (!title || !message) return;
        var daysLeft = TRIAL_DAYS + GRACE_DAYS - _daysSinceInstall();
        title.textContent = I18n.t('premium.reminderTitle', 'Support Free IPTV');
        message.textContent = I18n.t('premium.reminderMessage', 'Your trial has ended. Support the project to keep all features.', { days: daysLeft > 0 ? daysLeft : 0 });
        if (continueBtn) continueBtn.classList.add('hidden');
        if (laterBtn) laterBtn.classList.remove('hidden');
        modal.classList.remove('hidden');
        if (window.app) {
            window.app._premiumPreviousFocus = window.app.focusArea;
            window.app.focusArea = 'premium-modal';
            window.app.focusIndex = 0;
            window.app.invalidateFocusables();
            window.app.updateFocus();
        }
    }

    function hidePremiumOverlay() {
        var modal = document.getElementById('premium-modal');
        if (modal) modal.classList.add('hidden');
        if (window.app && window.app._premiumPreviousFocus) {
            window.app.focusArea = window.app._premiumPreviousFocus;
            window.app._premiumPreviousFocus = null;
            window.app.updateFocus();
        }
    }

    function getLicenseCode() {
        return _licenseCode;
    }

    function getInstallDate() {
        return _installDate;
    }

    return {
        init: init,
        getState: getState,
        isPremium: isPremium,
        validateCode: validateCode,
        shouldShowReminder: shouldShowReminder,
        showReminder: showReminder,
        hidePremiumOverlay: hidePremiumOverlay,
        getTrialDaysLeft: getTrialDaysLeft,
        getHistoryFreeLimit: getHistoryFreeLimit,
        getLicenseCode: getLicenseCode,
        getInstallDate: getInstallDate,
        markReminderShown: markReminderShown,
        STATE_TRIAL: STATE_TRIAL,
        STATE_GRACE: STATE_GRACE,
        STATE_EXPIRED: STATE_EXPIRED,
        STATE_LICENSED: STATE_LICENSED
    };
})();
