/**
 * Settings module - Settings, playlists, and configuration
 * Handles app settings, playlist management, remote pairing
 */

// Settings screen
IPTVApp.prototype.showSettings = function() {
    var self = this;
    this.showScreen('settings');
    this.currentScreen = 'settings';
    this.focusArea = 'settings';
    this.initSettingsUI();
    this.focusIndex = 0;
    setTimeout(function() {
        self.updateFocus();
    }, 50);
};

IPTVApp.prototype.updateProxyUrlVisibility = function() {
    var show = this.settings.proxyEnabled;
    var ids = ['proxy-url-row', 'stream-proxy-row', 'tts-voice-row', 'tts-rate-row', 'tts-volume-row', 'tts-pitch-row'];
    for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (el) el.style.display = show ? '' : 'none';
    }
};

IPTVApp.prototype.updateDialogueBoostVisibility = function() {
    var dialogueBoostSetting = document.getElementById('dialogue-boost-setting');
    if (dialogueBoostSetting) {
        dialogueBoostSetting.style.display = this.settings.preferHtml5Player ? '' : 'none';
    }
};

IPTVApp.prototype.initTTSVoiceOptions = function() {
    var row = document.getElementById('tts-voice-row');
    var btn = document.getElementById('tts-voice-btn');
    if (!row || !btn) return;
    row.style.display = this.settings.proxyEnabled ? '' : 'none';
    if (!this.settings.proxyEnabled) return;
    this.updateTTSVoiceButton();
    this.updateTTSOptionsDisplay();
};

IPTVApp.prototype.updateTTSOptionsDisplay = function() {
    var rateEl = document.getElementById('tts-rate-value');
    var volumeEl = document.getElementById('tts-volume-value');
    var pitchEl = document.getElementById('tts-pitch-value');
    var rate = this.settings.ttsRate || 0;
    var volume = this.settings.ttsVolume || 0;
    var pitch = this.settings.ttsPitch || 0;
    if (rateEl) rateEl.textContent = (rate >= 0 ? '+' : '') + rate + '%';
    if (volumeEl) volumeEl.textContent = (volume >= 0 ? '+' : '') + volume + '%';
    if (pitchEl) pitchEl.textContent = (pitch >= 0 ? '+' : '') + pitch + 'Hz';
};

IPTVApp.prototype.adjustTTSOption = function(option, direction) {
    var step = option === 'ttsPitch' ? 5 : 10;
    var min = option === 'ttsPitch' ? -50 : -50;
    var max = option === 'ttsPitch' ? 50 : 100;
    var current = this.settings[option] || 0;
    var newVal = current + (direction * step);
    newVal = Math.max(min, Math.min(max, newVal));
    this.settings[option] = newVal;
    this.updateTTSOptionsDisplay();
    this.saveSettings();
};

IPTVApp.prototype.updateTTSVoiceButton = function() {
    var btn = document.getElementById('tts-voice-btn');
    if (!btn) return;
    var voiceId = this.settings.ttsVoice || '';
    if (voiceId) {
        var parts = voiceId.split('-');
        var name = parts[parts.length - 1].replace('Neural', '');
        btn.textContent = name;
    }
    else {
        btn.textContent = I18n.t('common.select', 'Select...');
    }
};

IPTVApp.prototype.showTTSVoiceModal = function() {
    var self = this;
    var modal = document.getElementById('tts-voice-modal');
    var list = document.getElementById('tts-voice-list');
    if (!modal || !list) return;
    list.innerHTML = '<div style="color: #888; padding: 20px;">' + I18n.t('common.loading', 'Loading...') + '</div>';
    this.setHidden(modal, false);
    this.ttsVoiceModalOpen = true;
    this.previousFocusArea = this.focusArea;
    this.focusArea = 'tts-voice-modal';
    var locale = I18n.getLocale();
    var lang = locale.split('-')[0];
    var proxyUrl = this.settings.proxyUrl;
    if (!proxyUrl) {
        list.innerHTML = '<div style="color: #ff5252; padding: 20px;">' + I18n.t('settings.proxyRequired', 'Proxy URL required') + '</div>';
        return;
    }
    var voicesUrl = proxyUrl.replace(/\/+$/, '') + '/voices?lang=' + lang + proxyDuidParam();
    var xhr = new XMLHttpRequest();
    xhr.open('GET', voicesUrl, true);
    xhr.timeout = 5000;
    xhr.onload = function() {
        if (xhr.status === 200) {
            try {
                var data = JSON.parse(xhr.responseText);
                self.renderTTSVoiceList(list, data.voices, data.countries);
            }
            catch (e) {
                list.innerHTML = '<div style="color: #ff5252; padding: 20px;">' + I18n.t('common.error', 'Error') + '</div>';
            }
        }
        else {
            list.innerHTML = '<div style="color: #ff5252; padding: 20px;">' + I18n.t('common.error', 'Error') + ': ' + xhr.status + '</div>';
        }
    };
    xhr.onerror = function() {
        list.innerHTML = '<div style="color: #ff5252; padding: 20px;">' + I18n.t('common.connectionError', 'Connection error') + '</div>';
    };
    xhr.send();
};

IPTVApp.prototype.renderTTSVoiceList = function(container, voices, countries) {
    var self = this;
    container.innerHTML = '';
    var currentVoice = this.settings.ttsVoice || '';
    var voicesByCountry = {};
    for (var i = 0; i < voices.length; i++) {
        var v = voices[i];
        var country = v.country || '??';
        if (!voicesByCountry[country]) voicesByCountry[country] = [];
        voicesByCountry[country].push(v);
    }
    var sortedCountries = Object.keys(voicesByCountry).sort();
    var firstFocusable = null;
    var selectedItem = null;
    for (var c = 0; c < sortedCountries.length; c++) {
        var country = sortedCountries[c];
        var countryVoices = voicesByCountry[country];
        var countryName = countries[country] || country;
        if (sortedCountries.length > 1) {
            var header = document.createElement('div');
            header.className = 'tts-voice-group-header';
            header.textContent = countryName;
            container.appendChild(header);
        }
        for (var j = 0; j < countryVoices.length; j++) {
            var voice = countryVoices[j];
            var item = document.createElement('div');
            item.className = 'tts-voice-item focusable';
            item.dataset.voiceId = voice.id;
            var isSelected = voice.id === currentVoice;
            if (isSelected) {
                item.classList.add('selected');
                selectedItem = item;
            }
            var label = voice.name + ' (' + voice.gender + ')';
            if (voice.styles && voice.styles.length > 0) {
                label += ' \u2605';
            }
            item.textContent = label;
            container.appendChild(item);
            if (!firstFocusable) firstFocusable = item;
        }
    }
    this.ttsVoiceItems = container.querySelectorAll('.tts-voice-item');
    this.ttsVoiceFocusIndex = 0;
    if (selectedItem) {
        for (var k = 0; k < this.ttsVoiceItems.length; k++) {
            if (this.ttsVoiceItems[k] === selectedItem) {
                this.ttsVoiceFocusIndex = k;
                break;
            }
        }
    }
    this.updateTTSVoiceFocus();
};

IPTVApp.prototype.updateTTSVoiceFocus = function() {
    if (!this.ttsVoiceItems) return;
    for (var i = 0; i < this.ttsVoiceItems.length; i++) {
        this.ttsVoiceItems[i].classList.toggle('focused', i === this.ttsVoiceFocusIndex);
    }
    if (this.ttsVoiceItems[this.ttsVoiceFocusIndex]) {
        this.ttsVoiceItems[this.ttsVoiceFocusIndex].scrollIntoView({ block: 'nearest' });
    }
};

IPTVApp.prototype.hideTTSVoiceModal = function() {
    var modal = document.getElementById('tts-voice-modal');
    if (modal) this.setHidden(modal, true);
    this.ttsVoiceModalOpen = false;
    this.ttsVoiceItems = null;
    this.focusArea = this.previousFocusArea || 'settings';
    this.updateFocus();
};

IPTVApp.prototype.selectTTSVoice = function() {
    if (!this.ttsVoiceItems || this.ttsVoiceFocusIndex < 0) return;
    var item = this.ttsVoiceItems[this.ttsVoiceFocusIndex];
    if (!item) return;
    var voiceId = item.dataset.voiceId;
    this.settings.ttsVoice = voiceId;
    this.saveSettings();
    for (var i = 0; i < this.ttsVoiceItems.length; i++) {
        this.ttsVoiceItems[i].classList.remove('selected');
    }
    item.classList.add('selected');
    this.updateTTSVoiceButton();
    this.hideTTSVoiceModal();
};

// Generate language options dynamically from I18nData
IPTVApp.prototype.initLanguageOptions = function() {
    var locales = I18n.getAvailableLocales();
    var currentLocale = this.settings.locale || I18n.getLocale();
    var currentProviderLang = this.settings.providerLanguage || 'ALL';
    // Interface language options
    var localeContainer = document.getElementById('locale-options');
    if (localeContainer) {
        localeContainer.innerHTML = '';
        locales.forEach(function(loc) {
            var opt = document.createElement('div');
            opt.className = 'settings-option focusable';
            if (loc === currentLocale) opt.classList.add('selected');
            opt.dataset.setting = 'locale';
            opt.dataset.value = loc;
            opt.textContent = I18n.getLocaleFlag(loc) + ' ' + I18n.getLocaleName(loc);
            localeContainer.appendChild(opt);
        });
    }
    // Provider language filter options (includes ALL and AUTO)
    var providerLangContainer = document.getElementById('provider-lang-options');
    if (providerLangContainer) {
        providerLangContainer.innerHTML = '';
        // Add ALL option
        var allOpt = document.createElement('div');
        allOpt.className = 'settings-option focusable';
        if (currentProviderLang === 'ALL') allOpt.classList.add('selected');
        allOpt.dataset.setting = 'providerLanguage';
        allOpt.dataset.value = 'ALL';
        allOpt.textContent = I18n.t('languages.ALL', 'All');
        providerLangContainer.appendChild(allOpt);
        // Add AUTO option
        var autoOpt = document.createElement('div');
        autoOpt.className = 'settings-option focusable';
        if (currentProviderLang === 'AUTO') autoOpt.classList.add('selected');
        autoOpt.dataset.setting = 'providerLanguage';
        autoOpt.dataset.value = 'AUTO';
        autoOpt.textContent = I18n.t('settings.providerAuto', 'Auto');
        providerLangContainer.appendChild(autoOpt);
        // Add language options
        locales.forEach(function(loc) {
            var code = I18n.getProviderLangCode(loc);
            var opt = document.createElement('div');
            opt.className = 'settings-option focusable';
            if (currentProviderLang === code) opt.classList.add('selected');
            opt.dataset.setting = 'providerLanguage';
            opt.dataset.value = code;
            opt.textContent = I18n.getLocaleFlag(loc) + ' ' + I18n.getLocaleName(loc);
            providerLangContainer.appendChild(opt);
        });
    }
};

// Generate subtitle language options for playlist edit
IPTVApp.prototype.initSubtitleLangOptions = function(selectedLang) {
    var locales = I18n.getAvailableLocales();
    var container = document.getElementById('playlist-subtitle-lang-options');
    if (!container) return;
    container.innerHTML = '';
    // Add "disabled" option
    var noneOpt = document.createElement('div');
    noneOpt.className = 'settings-option focusable';
    if (!selectedLang) noneOpt.classList.add('selected');
    noneOpt.dataset.setting = 'defaultSubtitleLang';
    noneOpt.dataset.value = '';
    noneOpt.textContent = '-';
    container.appendChild(noneOpt);
    // Add language options
    locales.forEach(function(loc) {
        var code = loc.toUpperCase();
        var opt = document.createElement('div');
        opt.className = 'settings-option focusable';
        if (selectedLang === code) opt.classList.add('selected');
        opt.dataset.setting = 'defaultSubtitleLang';
        opt.dataset.value = code;
        opt.textContent = I18n.getLocaleFlag(loc) + ' ' + code;
        container.appendChild(opt);
    });
};

IPTVApp.prototype.initSettingsUI = function() {
    var self = this;
    if (this.settings.locale && this.settings.locale !== I18n.getLocale()) {
        I18n.setLocale(this.settings.locale);
    }
    // Generate language options dynamically
    this.initLanguageOptions();
    // Show player settings section only if Web Audio API is supported
    var playerSection = document.getElementById('player-settings-section');
    if (playerSection) {
        var hasWebAudio = !!(window.AudioContext || window.webkitAudioContext);
        if (hasWebAudio) {
            this.setHidden(playerSection, false);
        }
        else {
            this.setHidden(playerSection, true);
        }
    }
    var providerLangSection = document.getElementById('provider-language-section');
    var categoryPatternsSection = document.getElementById('category-patterns-section');
    var activePlaylist = this.getActivePlaylist();
    var isProvider = activePlaylist && activePlaylist.type === 'provider';
    var hasPlaylist = !!(activePlaylist && (activePlaylist.serverUrl || activePlaylist.m3uUrl));
    var remoteHeader = document.getElementById('remote-collapse-header');
    var remoteContent = document.getElementById('remote-content');
    var remoteArrow = document.getElementById('remote-collapse-arrow');
    if (remoteHeader && remoteContent) {
        if (hasPlaylist) {
            remoteHeader.classList.add('collapsed');
            remoteContent.classList.add('collapsed');
            if (remoteArrow) remoteArrow.classList.add('collapsed');
        }
        else {
            remoteHeader.classList.remove('collapsed');
            remoteContent.classList.remove('collapsed');
            if (remoteArrow) remoteArrow.classList.remove('collapsed');
        }
    }
    if (providerLangSection) {
        if (isProvider) {
            this.setHidden(providerLangSection, false);
        }
        else {
            this.setHidden(providerLangSection, true);
        }
    }
    if (categoryPatternsSection) {
        if (isProvider) {
            this.setHidden(categoryPatternsSection, false);
        }
        else {
            this.setHidden(categoryPatternsSection, true);
        }
    }
    this.updateCacheInfoDisplay();
    var toggles = document.querySelectorAll('.settings-toggle');
    for (var i = 0; i < toggles.length; i++) {
        var toggle = toggles[i];
        var setting = toggle.dataset.setting;
        if (setting) {
            var value = this.settings[setting];
            toggle.dataset.value = value ? 'true' : 'false';
            if (setting === 'freeboxBatchDownload') {
                toggle.textContent = value ? I18n.t('settings.freeboxBatchAll', 'All at once') : I18n.t('settings.freeboxBatchSeq', 'One by one');
            } else {
                toggle.textContent = value ? I18n.t('settings.yes', 'Yes') : I18n.t('settings.no', 'No');
            }
        }
    }
    this.updateProxyUrlVisibility();
    this.updateDialogueBoostVisibility();
    this.initTTSVoiceOptions();
    var numericSettings = ['minProgressMinutes', 'watchedThreshold', 'retentionWeeks', 'historyMaxItems'];
    for (var j = 0; j < numericSettings.length; j++) {
        var key = numericSettings[j];
        var el = document.getElementById('setting-' + key);
        if (el) {
            el.textContent = this.settings[key];
        }
    }
    var options = document.querySelectorAll('.settings-option');
    for (var k = 0; k < options.length; k++) {
        var opt = options[k];
        var optSetting = opt.dataset.setting;
        var optValue = opt.dataset.value;
        var settingValue = this.settings[optSetting];
        // Handle boolean settings (compare as strings)
        if (typeof settingValue === 'boolean') {
            settingValue = settingValue ? 'true' : 'false';
        }
        if (settingValue === optValue) {
            opt.classList.add('selected');
        }
        else {
            opt.classList.remove('selected');
        }
    }
    var textSettings = ['tmdbApiKey', 'openSubtitlesApiKey', 'subDLApiKey', 'proxyUrl', 'freeboxHost'];
    for (var m = 0; m < textSettings.length; m++) {
        var inputKey = textSettings[m];
        var inputEl = document.getElementById('setting-' + inputKey);
        if (inputEl) {
            inputEl.value = this.settings[inputKey] || '';
        }
    }
    this.bindSettingsInputs();
    var nameEl = document.getElementById('active-playlist-name');
    if (nameEl) {
        nameEl.textContent = activePlaylist ? (activePlaylist.name || I18n.t('settings.playlistDefault', 'Playlist ' + activePlaylist.id, { id: activePlaylist.id })) : '';
    }
    this.renderPatternCategories();
    this.updatePatternCounts();
    this.updateFreeboxVisibility();
    this.updateFreeboxStatus();
    this.initPairingCode();
    // Custom icon preview real-time update
    var customIconText = document.getElementById('custom-icon-text');
    if (customIconText) {
        customIconText.addEventListener('input', function() { self.updateCustomIconPreview(); });
    }
    // Pattern editor icon preview real-time update
    var patternIconText = document.getElementById('pattern-category-icon');
    if (patternIconText) {
        patternIconText.addEventListener('input', function() { self.updatePatternIconPreview(); });
    }
    // Hex color input listeners for add category modal
    var textColorHex = document.getElementById('text-color-hex');
    var bgColorHex = document.getElementById('bg-color-hex');
    if (textColorHex) {
        textColorHex.addEventListener('input', function() { self.updateCustomIconPreview(); });
    }
    if (bgColorHex) {
        bgColorHex.addEventListener('input', function() { self.updateCustomIconPreview(); });
    }
    // Hex color input listeners for pattern editor modal
    var patternTextColorHex = document.getElementById('pattern-text-color-hex');
    var patternBgColorHex = document.getElementById('pattern-bg-color-hex');
    if (patternTextColorHex) {
        patternTextColorHex.addEventListener('input', function() { self.updatePatternIconPreview(); });
    }
    if (patternBgColorHex) {
        patternBgColorHex.addEventListener('input', function() { self.updatePatternIconPreview(); });
    }
};

// Remote configuration pairing
IPTVApp.prototype.updatePairingQR = function() {
    var locale = this.settings.locale || 'fr';
    var configUrl = 'https://iptv.blanquer.org?l=' + locale;
    var qrContainer = document.getElementById('settings-qr-code');
    if (qrContainer) {
        var qrApiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=' + encodeURIComponent(configUrl);
        qrContainer.innerHTML = '<img src="' + qrApiUrl + '" alt="QR Code">';
    }
    var urlEl = document.getElementById('settings-config-url');
    if (urlEl) {
        urlEl.textContent = configUrl;
    }
};

IPTVApp.prototype.initPairingCode = function() {
    var self = this;
    var locale = this.settings.locale || 'fr';
    var configUrl = 'https://iptv.blanquer.org?l=' + locale;
    if (this.pairingCode && this.pairingInterval) {
        return;
    }
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    for (var i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.pairingCode = code;
    var qrContainer = document.getElementById('settings-qr-code');
    if (qrContainer) {
        var qrApiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=' + encodeURIComponent(configUrl);
        qrContainer.innerHTML = '<img src="' + qrApiUrl + '" alt="QR Code">';
    }
    var codeEl = document.getElementById('settings-pairing-code');
    if (codeEl) {
        codeEl.textContent = code;
    }
    var urlEl = document.getElementById('settings-config-url');
    if (urlEl) {
        urlEl.textContent = configUrl;
    }
    var statusEl = document.getElementById('settings-pairing-status');
    if (statusEl) {
        statusEl.textContent = I18n.t('settings.waitingConfig', 'Waiting for config...');
        statusEl.className = 'pairing-status';
    }
    this.startPairingPolling();
};

IPTVApp.prototype.startPairingPolling = function() {
    var self = this;
    if (this.pairingInterval) {
        clearInterval(this.pairingInterval);
    }
    this.pairingInterval = setInterval(function() {
        self.checkPairingConfig();
    }, 3000);
};

IPTVApp.prototype.stopPairingPolling = function() {
    if (this.pairingInterval) {
        clearInterval(this.pairingInterval);
        this.pairingInterval = null;
    }
    this.pairingCode = null;
};

IPTVApp.prototype.checkPairingConfig = function() {
    var self = this;
    if (!this.pairingCode || this.currentScreen !== 'settings') {
        return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://iptv-config.eric-blanquer.workers.dev/' + this.pairingCode, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var data = xhr.responseText;
            if (data && data !== 'null') {
                try {
                    var config = JSON.parse(data);
                    self.applyRemoteConfig(config);
                    self.deleteRemoteConfig();
                    self.onPairingSuccess();
                }
                catch (e) {
                    window.log('ERROR Pairing parse: ' + e.message);
                }
            }
        }
    };
    xhr.send();
};

IPTVApp.prototype.deleteRemoteConfig = function() {
    window.log('ACTION', 'deleteRemoteConfig');
    if (!this.pairingCode) return;
    var xhr = new XMLHttpRequest();
    xhr.open('DELETE', 'https://iptv-config.eric-blanquer.workers.dev/' + this.pairingCode, true);
    xhr.send();
};

IPTVApp.prototype.onPairingSuccess = function() {
    var self = this;
    this.stopPairingPolling();
    var statusEl = document.getElementById('settings-pairing-status');
    if (statusEl) {
        statusEl.textContent = I18n.t('settings.configReceived', 'Config received!');
        statusEl.className = 'pairing-status success';
    }
    setTimeout(function() {
        self.autoConnect();
        self.updateHomeMenuVisibility();
        self.showScreen('home');
        self.currentScreen = 'home';
        self.focusArea = 'home';
        self.focusIndex = 0;
        self.updateFocus();
    }, 1500);
};

IPTVApp.prototype.bindSettingsInputs = function() {
    var self = this;
    var inputs = document.querySelectorAll('.settings-input');
    for (var i = 0; i < inputs.length; i++) {
        var input = inputs[i];
        if (!input.dataset.bound) {
            input.dataset.bound = 'true';
            input.addEventListener('change', function() {
                var id = this.id.replace('setting-', '');
                self.settings[id] = this.value.trim();
                if (id === 'proxyUrl' && self.player) {
                    self.player.setProxyUrl(self.getStreamProxyUrl());
                }
                self.saveSettings();
            });
            input.addEventListener('blur', function() {
                var id = this.id.replace('setting-', '');
                self.settings[id] = this.value.trim();
                this.value = self.settings[id];
                if (id === 'proxyUrl' && self.player) {
                    self.player.setProxyUrl(self.getStreamProxyUrl());
                }
                self.saveSettings();
            });
        }
    }
};

IPTVApp.prototype.toggleSettingsCollapse = function(section) {
    var header = document.querySelector('[data-collapse="' + section + '"]');
    var content = document.getElementById(section + '-content');
    if (!header || !content) return;
    var isCollapsed = content.classList.contains('collapsed');
    header.classList.toggle('collapsed', !isCollapsed);
    content.classList.toggle('collapsed', !isCollapsed);
    var arrow = header.querySelector('.collapse-arrow');
    if (arrow) arrow.classList.toggle('collapsed', !isCollapsed);
};

IPTVApp.prototype.handleSettingsSelect = function() {
    var focusables = this.getFocusables();
    var current = focusables[this.focusIndex];
    if (!current) return;
    window.log('handleSettingsSelect: ' + (current.id || current.className));
    if (current.dataset.collapse) {
        this.toggleSettingsCollapse(current.dataset.collapse);
        return;
    }
    if (current.id === 'tts-voice-btn') {
        this.showTTSVoiceModal();
        return;
    }
    if (current.classList.contains('settings-btn') && current.dataset.action) {
        var action = current.dataset.action;
        var dir = parseInt(current.dataset.dir) || 1;
        if (action === 'ttsRate' || action === 'ttsVolume' || action === 'ttsPitch') {
            this.adjustTTSOption(action, dir);
        }
        return;
    }
    if (current.classList.contains('settings-input') || current.tagName === 'INPUT') {
        this.openKeyboard(current.id);
        return;
    }
    if (current.classList.contains('settings-toggle')) {
        var setting = current.dataset.setting;
        // Handle toggle with toggle-options (yes/no) inside
        if (!setting && current.querySelector('.toggle-option')) {
            var currentVal = current.dataset.value;
            var newVal = currentVal === 'yes' ? 'no' : 'yes';
            current.dataset.value = newVal;
            var toggleOpts = current.querySelectorAll('.toggle-option');
            for (var ti = 0; ti < toggleOpts.length; ti++) {
                if (toggleOpts[ti].dataset.value === newVal) {
                    toggleOpts[ti].classList.add('active');
                }
                else {
                    toggleOpts[ti].classList.remove('active');
                }
            }
        }
        else if (setting) {
            this.settings[setting] = !this.settings[setting];
            current.dataset.value = this.settings[setting] ? 'true' : 'false';
            current.textContent = this.settings[setting] ? I18n.t('settings.yes', 'Yes') : I18n.t('settings.no', 'No');
            if (setting === 'preferHtml5Player') {
                if (this.player) {
                    this.player.setPreferHtml5(this.settings[setting]);
                }
                this.updateDialogueBoostVisibility();
            }
            if (setting === 'dialogueBoost' && this.player) {
                this.player.setDialogueBoost(this.settings[setting]);
            }
            if (setting === 'hideSD') {
                this.hideSD = this.settings.hideSD;
            }
            if (setting === 'hide3D') {
                this.hide3D = this.settings.hide3D;
            }
            if (setting === 'hideHearingImpaired') {
                this.hideSM = this.settings.hideHearingImpaired;
            }
            if (setting === 'proxyEnabled') {
                this.updateProxyUrlVisibility();
                this.initTTSVoiceOptions();
                if (this.player) {
                    this.player.setProxyUrl(this.getStreamProxyUrl());
                }
            }
            if (setting === 'streamProxy') {
                if (this.player) {
                    this.player.setProxyUrl(this.getStreamProxyUrl());
                }
            }
            if (setting === 'freeboxEnabled') {
                this.updateFreeboxVisibility();
                this.initFreebox();
            }
            if (setting === 'freeboxBatchDownload') {
                current.textContent = this.settings[setting] ? I18n.t('settings.freeboxBatchAll', 'All at once') : I18n.t('settings.freeboxBatchSeq', 'One by one');
            }
            this.saveSettings();
        }
    }
    else if (current.classList.contains('settings-btn')) {
        var btnSetting = current.dataset.setting;
        var action = current.dataset.action;
        var currentVal = this.settings[btnSetting];
        var limits = {
            minProgressMinutes: { min: 1, max: 10 },
            watchedThreshold: { min: 70, max: 99 },
            retentionWeeks: { min: 1, max: 12 },
            historyMaxItems: { min: 10, max: 200 }
        };
        var lim = limits[btnSetting] || { min: 1, max: 100 };
        if (action === 'increase' && currentVal < lim.max) {
            this.settings[btnSetting] = currentVal + 1;
        }
        else if (action === 'decrease' && currentVal > lim.min) {
            this.settings[btnSetting] = currentVal - 1;
        }
        document.getElementById('setting-' + btnSetting).textContent = this.settings[btnSetting];
        this.saveSettings();
    }
    else if (current.classList.contains('settings-option')) {
        var optSetting = current.dataset.setting;
        var optValue = current.dataset.value;
        this.settings[optSetting] = optValue;
        var allOpts = document.querySelectorAll('.settings-option[data-setting="' + optSetting + '"]');
        for (var i = 0; i < allOpts.length; i++) {
            allOpts[i].classList.remove('selected');
        }
        current.classList.add('selected');
        if (optSetting === 'locale') {
            I18n.setLocale(optValue);
            this.updatePairingQR();
        }
        if (optSetting === 'textSize') {
            this.applyTextSize(optValue);
        }
        if (optSetting === 'secureSubtitles') {
            this.secureSubtitles = optValue === 'true';
        }
        if (optSetting === 'providerLanguage') {
            // Clear API cache and provider cache when language filter changes
            if (this.api && this.api.clearCache) {
                this.api.clearCache();
            }
            this.clearProviderCache();
            this.data = {};
        }
        this.saveSettings();
    }
    else if (current.classList.contains('settings-action')) {
        var actionType = current.dataset.action;
        window.log('ACTION settings-action: ' + actionType);
        if (actionType === 'clearAllCaches') {
            // Clear TMDB cache
            this.tmdbCache = {};
            this.saveTMDBCache();
            // Clear API cache
            if (this.api && this.api.clearCache) {
                this.api.clearCache();
            }
            // Clear provider cache (local + remote)
            this.clearProviderCache();
            // Clear merged data
            this.data = {
                live: { categories: [], streams: [] },
                vod: { categories: [], streams: [] },
                series: { categories: [], streams: [] }
            };
            // Clear IndexedDB caches
            if (window.indexedDB) {
                indexedDB.deleteDatabase('IPTVProviderCache');
                indexedDB.deleteDatabase('IPTVTMDBCache');
                window.log('CACHE', 'IndexedDB caches cleared');
            }
            window.log('CACHE', 'All caches cleared');
        }
        else if (actionType === 'clearTMDBCache') {
            this.tmdbCache = {};
            if (window.indexedDB) {
                indexedDB.deleteDatabase('IPTVTMDBCache');
            }
            window.log('CACHE', 'TMDB cache cleared');
        }
        else if (actionType === 'clearProgress') {
            this.watchHistory = [];
            this.saveWatchHistory();
            this.episodeProgress = {};
            this.saveEpisodeProgress();
            this.seriesProgress = {};
            this.saveSeriesProgress();
            this.saveSettings();
        }
        else if (actionType === 'clearFavorites') {
            this.favorites = [];
            this.saveFavorites();
        }
        else if (actionType === 'managePlaylistsBtn') {
            this.showPlaylists();
        }
        else if (actionType === 'resetPatterns') {
            this.resetCategoryPatterns();
            this.renderPatternCategories();
        }
        else if (actionType === 'addCategory') {
            this.openAddCategoryModal();
        }
        else if (actionType === 'freeboxPair') {
            if (this.settings.freeboxAppToken) {
                this.unpairFreebox();
            }
            else {
                this.startFreeboxPairing();
            }
        }
    }
    else if (current.classList.contains('pattern-edit-btn')) {
        var section = current.dataset.pattern;
        window.log('ACTION pattern-edit: ' + section);
        if (section) {
            this.openPatternEditor(section);
        }
    }
    else if (current.classList.contains('pattern-delete-btn')) {
        var categoryId = current.dataset.deleteCategory;
        window.log('ACTION pattern-delete: ' + categoryId);
        if (categoryId) {
            this.confirmDeleteCategory(categoryId);
        }
    }
};

IPTVApp.prototype.applyRemoteConfig = function(config) {
    var self = this;
    if (config.playlists && config.playlists.length > 0) {
        config.playlists.forEach(function(newPlaylist) {
            var existingIndex = self.findSimilarPlaylist(newPlaylist);
            if (existingIndex >= 0) {
                var existingId = self.settings.playlists[existingIndex].id;
                newPlaylist.id = existingId;
                self.settings.playlists[existingIndex] = newPlaylist;
            }
            else {
                newPlaylist.id = Date.now() + Math.floor(Math.random() * 1000);
                self.settings.playlists.push(newPlaylist);
            }
        });
        if (!this.settings.activePlaylistId || !this.getActivePlaylist()) {
            this.settings.activePlaylistId = config.playlists[0].id;
        }
    }
    if (config.tmdbApiKey) {
        this.settings.tmdbApiKey = config.tmdbApiKey;
    }
    if (config.openSubtitlesApiKey) {
        this.settings.openSubtitlesApiKey = config.openSubtitlesApiKey;
    }
    if (config.subDLApiKey) {
        this.settings.subDLApiKey = config.subDLApiKey;
    }
    if (config.locale) {
        this.settings.locale = config.locale;
        I18n.setLocale(config.locale);
    }
    if (config.providerLanguage) {
        this.settings.providerLanguage = config.providerLanguage;
    }
    this.saveSettings();
};

IPTVApp.prototype.findSimilarPlaylist = function(newPlaylist) {
    for (var i = 0; i < this.settings.playlists.length; i++) {
        var existing = this.settings.playlists[i];
        if (existing.type !== newPlaylist.type) continue;
        if (newPlaylist.type === 'provider') {
            if (existing.serverUrl === newPlaylist.serverUrl && existing.username === newPlaylist.username) {
                return i;
            }
        }
        else if (newPlaylist.type === 'm3u') {
            if (existing.url === newPlaylist.url) {
                return i;
            }
        }
    }
    return -1;
};

IPTVApp.prototype.applyTextSize = function(size) {
    document.body.classList.remove('text-small', 'text-medium', 'text-large');
    if (size) {
        document.body.classList.add('text-' + size);
    }
};

// Playlist management
IPTVApp.prototype.showPlaylists = function() {
    var self = this;
    this.showScreen('playlists');
    this.currentScreen = 'playlists';
    this.focusArea = 'playlists';
    this.focusIndex = 0;
    this.renderPlaylistsList();
    this.validateAllPlaylists();
    setTimeout(function() {
        self.updateFocus();
    }, 50);
};

IPTVApp.prototype.renderPlaylistsList = function() {
    var container = document.getElementById('playlists-list');
    container.innerHTML = '';
    var playlists = this.settings.playlists || [];
    var activeId = this.settings.activePlaylistId;
    if (playlists.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'playlist-empty';
        empty.textContent = I18n.t('settings.noPlaylists', 'No playlists configured');
        container.appendChild(empty);
        return;
    }
    for (var i = 0; i < playlists.length; i++) {
        var p = playlists[i];
        var isActive = this.sameId(p.id, activeId);
        var row = document.createElement('div');
        row.className = 'playlist-row' + (isActive ? ' active' : '');
        var item = document.createElement('div');
        item.className = 'playlist-item focusable';
        item.dataset.playlistId = p.id;
        item.dataset.action = 'select';
        var iconEl = document.createElement('div');
        iconEl.className = 'playlist-icon';
        iconEl.textContent = p.type === 'provider' ? '📡' : '📋';
        item.appendChild(iconEl);
        var info = document.createElement('div');
        info.className = 'playlist-info';
        var nameEl = document.createElement('div');
        nameEl.className = 'playlist-name';
        nameEl.textContent = p.name || I18n.t('settings.playlistDefault', 'Playlist ' + p.id, { id: p.id });
        info.appendChild(nameEl);
        var typeEl = document.createElement('div');
        typeEl.className = 'playlist-type';
        typeEl.textContent = p.type === 'provider' ? I18n.t('settings.playlistTypeProvider', 'API Server') : I18n.t('settings.playlistTypeM3u', 'M3U');
        info.appendChild(typeEl);
        item.appendChild(info);
        // Add checking indicator (will be updated by validation)
        var statusEl = document.createElement('span');
        statusEl.className = 'playlist-status checking hourglass';
        statusEl.textContent = '⏳';
        item.appendChild(statusEl);
        if (isActive) {
            var badge = document.createElement('span');
            badge.className = 'playlist-active-badge';
            badge.textContent = I18n.t('settings.active', 'Active');
            item.appendChild(badge);
        }
        row.appendChild(item);
        var editBtn = document.createElement('div');
        editBtn.className = 'playlist-action-btn focusable';
        editBtn.dataset.playlistId = p.id;
        editBtn.dataset.action = 'edit';
        editBtn.textContent = '✏️';
        row.appendChild(editBtn);
        var visBtn = document.createElement('div');
        visBtn.className = 'playlist-action-btn visibility focusable' + (p.showOnHome === false ? ' hidden-playlist' : '');
        visBtn.dataset.playlistId = p.id;
        visBtn.dataset.action = 'toggleVisibility';
        visBtn.textContent = '👁';
        row.appendChild(visBtn);
        var deleteBtn = document.createElement('div');
        deleteBtn.className = 'playlist-action-btn delete focusable';
        deleteBtn.dataset.playlistId = p.id;
        deleteBtn.dataset.action = 'delete';
        deleteBtn.textContent = '🗑️';
        row.appendChild(deleteBtn);
        container.appendChild(row);
    }
};

IPTVApp.prototype.showPlaylistEdit = function(playlistId) {
    var self = this;
    this.editingPlaylistId = playlistId;
    var playlist = null;
    if (playlistId) {
        for (var i = 0; i < this.settings.playlists.length; i++) {
            if (this.sameId(this.settings.playlists[i].id, playlistId)) {
                playlist = this.settings.playlists[i];
                break;
            }
        }
    }
    this.showScreen('playlist-edit');
    this.currentScreen = 'playlist-edit';
    this.focusArea = 'playlist-edit';
    this.focusIndex = 0;
    var titleEl = document.getElementById('playlist-edit-title');
    titleEl.textContent = playlist ? I18n.t('settings.editPlaylist', 'Edit playlist') : I18n.t('settings.newPlaylist', 'New playlist');
    document.getElementById('playlist-name').value = playlist ? (playlist.name || '') : '';
    var type = playlist ? playlist.type : 'provider';
    this.setPlaylistType(type);
    document.getElementById('playlist-serverUrl').value = playlist ? (playlist.serverUrl || '') : '';
    document.getElementById('playlist-username').value = playlist ? (playlist.username || '') : '';
    document.getElementById('playlist-password').value = playlist ? (playlist.password || '') : '';
    document.getElementById('playlist-m3uUrl').value = playlist ? (playlist.url || '') : '';
    // Generate and set default subtitle language options
    var defaultSubLang = playlist ? (playlist.defaultSubtitleLang || '') : '';
    this.initSubtitleLangOptions(defaultSubLang);
    var deleteBtn = document.getElementById('playlist-delete-btn');
    if (playlist) {
        this.setHidden(deleteBtn, false);
    }
    else {
        this.setHidden(deleteBtn, true);
    }
    setTimeout(function() {
        self.updateFocus();
    }, 50);
};

IPTVApp.prototype.setPlaylistType = function(type) {
    var providerFields = document.getElementById('playlist-provider-fields');
    var m3uFields = document.getElementById('playlist-m3u-fields');
    var options = document.querySelectorAll('.settings-option[data-setting="playlistType"]');
    for (var i = 0; i < options.length; i++) {
        if (options[i].dataset.value === type) {
            options[i].classList.add('selected');
        }
        else {
            options[i].classList.remove('selected');
        }
    }
    this.setHidden(providerFields, type !== 'provider');
    this.setHidden(m3uFields, type === 'provider');
    this.currentPlaylistType = type;
};

IPTVApp.prototype.savePlaylist = function() {
    window.log('ACTION', 'savePlaylist');
    var name = document.getElementById('playlist-name').value.trim();
    var type = this.currentPlaylistType || 'provider';
    var playlist = {
        id: this.editingPlaylistId || this.getNextPlaylistId(),
        name: name,
        type: type
    };
    if (type === 'provider') {
        playlist.serverUrl = document.getElementById('playlist-serverUrl').value.trim();
        playlist.username = document.getElementById('playlist-username').value.trim();
        playlist.password = document.getElementById('playlist-password').value.trim();
        if (!playlist.serverUrl || !playlist.username || !playlist.password) {
            return;
        }
        // Get selected default subtitle language
        var selectedSubLang = document.querySelector('#playlist-subtitle-lang-options .settings-option.selected');
        playlist.defaultSubtitleLang = selectedSubLang ? selectedSubLang.dataset.value : '';
    }
    else {
        playlist.url = document.getElementById('playlist-m3uUrl').value.trim();
        if (!playlist.url) {
            return;
        }
    }
    var found = false;
    for (var i = 0; i < this.settings.playlists.length; i++) {
        if (this.sameId(this.settings.playlists[i].id, playlist.id)) {
            this.settings.playlists[i] = playlist;
            found = true;
            break;
        }
    }
    if (!found) {
        this.settings.playlists.push(playlist);
    }
    if (this.settings.playlists.length === 1) {
        this.settings.activePlaylistId = playlist.id;
    }
    this.saveSettings();
    this.showPlaylists();
};

IPTVApp.prototype.deletePlaylist = function() {
    window.log('ACTION deletePlaylist: ' + this.editingPlaylistId);
    if (!this.editingPlaylistId) return;
    var newPlaylists = [];
    for (var i = 0; i < this.settings.playlists.length; i++) {
        if (!this.sameId(this.settings.playlists[i].id, this.editingPlaylistId)) {
            newPlaylists.push(this.settings.playlists[i]);
        }
    }
    this.settings.playlists = newPlaylists;
    if (this.sameId(this.settings.activePlaylistId, this.editingPlaylistId)) {
        this.settings.activePlaylistId = newPlaylists.length > 0 ? newPlaylists[0].id : null;
    }
    this.saveSettings();
    this.showPlaylists();
};

IPTVApp.prototype.selectPlaylist = function(playlistId) {
    this.settings.activePlaylistId = playlistId;
    this.saveSettings();
    this.api = null;
    this.data = {
        live: { categories: [], streams: [] },
        vod: { categories: [], streams: [] },
        series: { categories: [], streams: [] }
    };
    this.autoConnect();
    this.showScreen('home');
    this.currentScreen = 'home';
    this.setFocus('home', 0);
};

IPTVApp.prototype.handlePlaylistsSelect = function() {
    var focusables = this.getFocusables();
    var current = focusables[this.focusIndex];
    if (!current) return;
    var playlistId = current.dataset.playlistId || null;
    var action = current.dataset.action;
    window.log('ACTION playlist: ' + action + ' id=' + playlistId);
    if (action === 'select') {
        this.selectPlaylist(playlistId);
    }
    else if (action === 'edit') {
        this.showPlaylistEdit(playlistId);
    }
    else if (action === 'toggleVisibility') {
        this.togglePlaylistVisibility(playlistId);
    }
    else if (action === 'delete') {
        this.editingPlaylistId = playlistId;
        this.showConfirmModal(I18n.t('settings.confirmDeletePlaylist', 'Delete this playlist?'), 'deletePlaylist');
    }
    else if (current.classList.contains('playlist-add-btn')) {
        this.showPlaylistEdit(null);
    }
};

IPTVApp.prototype.togglePlaylistVisibility = function(playlistId) {
    for (var i = 0; i < this.settings.playlists.length; i++) {
        if (this.sameId(this.settings.playlists[i].id, playlistId)) {
            this.settings.playlists[i].showOnHome = this.settings.playlists[i].showOnHome === false ? true : false;
            break;
        }
    }
    this.saveSettings();
    this.renderPlaylistsList();
    this.renderPlaylistSelector();
    this.updateFocus();
};

IPTVApp.prototype.handlePlaylistEditSelect = function() {
    var focusables = this.getFocusables();
    var current = focusables[this.focusIndex];
    if (!current) return;
    if (current.classList.contains('settings-input') || current.tagName === 'INPUT') {
        window.log('ACTION playlist-edit: open-keyboard ' + current.id);
        this.openKeyboard(current.id);
        return;
    }
    if (current.classList.contains('settings-option') && current.dataset.setting === 'playlistType') {
        window.log('ACTION playlist-edit: setType ' + current.dataset.value);
        this.setPlaylistType(current.dataset.value);
    }
    else if (current.classList.contains('settings-option') && current.dataset.setting === 'defaultSubtitleLang') {
        window.log('ACTION playlist-edit: setSubtitleLang ' + current.dataset.value);
        var options = document.querySelectorAll('#playlist-subtitle-lang-options .settings-option');
        for (var i = 0; i < options.length; i++) {
            options[i].classList.remove('selected');
        }
        current.classList.add('selected');
    }
    else if (current.classList.contains('settings-action')) {
        var action = current.dataset.action;
        window.log('ACTION playlist-edit: ' + action);
        if (action === 'savePlaylist') {
            this.savePlaylist();
        }
        else if (action === 'cancelPlaylist') {
            this.showPlaylists();
        }
        else if (action === 'deletePlaylist') {
            this.deletePlaylist();
        }
    }
};

// M3U Parser
IPTVApp.prototype.loadM3UPlaylist = function(url) {
    var self = this;
    window.log('loadM3UPlaylist: loading ' + url);
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                window.log('loadM3UPlaylist: status=' + xhr.status + ' length=' + (xhr.responseText ? xhr.responseText.length : 0));
                if (xhr.status === 200) {
                    try {
                        self.parseM3U(xhr.responseText);
                        window.log('loadM3UPlaylist: parsed successfully, categories=' + self.data.live.categories.length + ' streams=' + self.data.live.streams.length);
                        resolve();
                    }
                    catch (e) {
                        window.log('ERROR loadM3UPlaylist: parse: ' + e.message);
                        reject(e);
                    }
                }
                else {
                    reject(new Error('Failed to load M3U: ' + xhr.status));
                }
            }
        };
        xhr.onerror = function() {
            window.log('ERROR', 'loadM3UPlaylist: network error');
            reject(new Error('Network error loading M3U'));
        };
        xhr.send();
    });
};

IPTVApp.prototype.parseM3U = function(content) {
    var lines = content.split('\n');
    var categories = {};
    var streams = [];
    var currentInfo = null;
    var streamId = 1;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.startsWith('#EXTINF:')) {
            currentInfo = this.parseExtInf(line);
        }
        else if (line && !line.startsWith('#') && currentInfo) {
            var group = currentInfo.group || 'Uncategorized';
            if (!categories[group]) {
                categories[group] = {
                    category_id: Object.keys(categories).length + 1,
                    category_name: group,
                    parent_id: 0
                };
            }
            streams.push({
                stream_id: streamId++,
                name: currentInfo.name || 'Stream ' + streamId,
                stream_icon: currentInfo.logo || '',
                category_id: categories[group].category_id,
                url: line,
                _m3u: true
            });
            currentInfo = null;
        }
    }
    var categoryList = [];
    for (var g in categories) {
        if (categories.hasOwnProperty(g)) {
            categoryList.push(categories[g]);
        }
    }
    this.data.live = {
        categories: categoryList,
        streams: streams
    };
    this.availableLanguages = [];
};

IPTVApp.prototype.parseExtInf = function(line) {
    var info = { name: '', group: '', logo: '' };
    var tvgName = line.match(Regex.m3u.tvgName);
    var tvgLogo = line.match(Regex.m3u.tvgLogo);
    var groupTitle = line.match(Regex.m3u.groupTitle);
    var commaIdx = line.lastIndexOf(',');
    if (commaIdx !== -1) {
        info.name = line.substring(commaIdx + 1).trim();
    }
    if (tvgName && tvgName[1]) {
        info.name = info.name || tvgName[1];
    }
    if (tvgLogo && tvgLogo[1]) {
        info.logo = tvgLogo[1];
    }
    if (groupTitle && groupTitle[1]) {
        info.group = groupTitle[1];
    }
    return info;
};

// Playlist Validation
IPTVApp.prototype.playlistValidationCache = {};

IPTVApp.prototype.validatePlaylist = function(playlist) {
    var self = this;
    if (!playlist) {
        return Promise.resolve({ valid: false, error: 'No playlist' });
    }
    if (playlist.type === 'provider') {
        return this.validateProviderPlaylist(playlist);
    }
    else if (playlist.type === 'm3u') {
        return this.validateM3UPlaylist(playlist);
    }
    return Promise.resolve({ valid: false, error: 'Unknown type' });
};

IPTVApp.prototype.validateProviderPlaylist = function(playlist) {
    var self = this;
    return new Promise(function(resolve) {
        if (!playlist.serverUrl || !playlist.username || !playlist.password) {
            resolve({ valid: false, error: 'incomplete' });
            return;
        }
        var url = playlist.serverUrl.replace(Regex.trailingSlash, '');
        var authUrl = url + '/player_api.php?username=' + encodeURIComponent(playlist.username) +
            '&password=' + encodeURIComponent(playlist.password);
        if (self.settings.proxyEnabled && self.settings.proxyUrl) {
            var baseProxy = self.settings.proxyUrl.replace(/\/+$/, '');
            authUrl = baseProxy + '/?url=' + encodeURIComponent(authUrl) + proxyDuidParam();
        }
        var xhr = new XMLHttpRequest();
        xhr.open('GET', authUrl, true);
        xhr.timeout = 10000;
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        if (data.user_info && data.user_info.auth === 1) {
                            resolve({ valid: true, info: data.user_info });
                        }
                        else {
                            resolve({ valid: false, error: 'auth_failed' });
                        }
                    }
                    catch (e) {
                        resolve({ valid: false, error: 'parse_error' });
                    }
                }
                else {
                    resolve({ valid: false, error: 'http_' + xhr.status });
                }
            }
        };
        xhr.ontimeout = function() {
            resolve({ valid: false, error: 'timeout' });
        };
        xhr.onerror = function() {
            resolve({ valid: false, error: 'network' });
        };
        xhr.send();
    });
};

IPTVApp.prototype.validateM3UPlaylist = function(playlist) {
    return new Promise(function(resolve) {
        if (!playlist.url) {
            resolve({ valid: false, error: 'incomplete' });
            return;
        }
        var xhr = new XMLHttpRequest();
        xhr.open('GET', playlist.url, true);
        xhr.timeout = 10000;
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    var content = xhr.responseText || '';
                    if (content.indexOf('#EXTM3U') !== -1 || content.indexOf('#EXTINF') !== -1) {
                        var streamCount = (content.match(Regex.m3u.extinfCount) || []).length;
                        resolve({ valid: true, streamCount: streamCount });
                    }
                    else {
                        resolve({ valid: false, error: 'invalid_format' });
                    }
                }
                else {
                    resolve({ valid: false, error: 'http_' + xhr.status });
                }
            }
        };
        xhr.ontimeout = function() {
            resolve({ valid: false, error: 'timeout' });
        };
        xhr.onerror = function() {
            resolve({ valid: false, error: 'network' });
        };
        xhr.send();
    });
};

IPTVApp.prototype.validateAllPlaylists = function() {
    var self = this;
    var playlists = this.settings.playlists || [];
    this.playlistValidationCache = {};
    playlists.forEach(function(p) {
        self.validatePlaylist(p).then(function(result) {
            self.playlistValidationCache[p.id] = result;
            self.updatePlaylistValidationUI(p.id, result);
        });
    });
};

IPTVApp.prototype.updatePlaylistValidationUI = function(playlistId, result) {
    var items = document.querySelectorAll('.playlist-item');
    var item = null;
    for (var i = 0; i < items.length; i++) {
        if (this.sameId(items[i].dataset.playlistId, playlistId)) {
            item = items[i];
            break;
        }
    }
    if (!item) return;
    var existing = item.querySelector('.playlist-status');
    if (existing) existing.remove();
    var existingAccount = item.querySelector('.playlist-account-info');
    if (existingAccount) existingAccount.remove();
    var status = document.createElement('span');
    status.className = 'playlist-status';
    if (result.valid) {
        status.classList.add('valid');
        status.textContent = '✓';
        status.title = result.streamCount ? I18n.t('settings.streamCount', result.streamCount + ' streams', { count: result.streamCount }) : 'OK';
        // Add account info for provider playlists
        if (result.info) {
            var info = result.info;
            var infoDiv = document.createElement('div');
            infoDiv.className = 'playlist-account-info';
            var parts = [];
            if (info.exp_date) {
                var expDate = new Date(parseInt(info.exp_date, 10) * 1000);
                var now = new Date();
                var daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
                var locale = this.settings.locale || I18n.getLocale() || 'en';
                var dateStr = expDate.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
                if (daysLeft <= 0) {
                    parts.push('<span class="expired">' + I18n.t('settings.expired', 'Expired') + '</span>');
                }
                else if (daysLeft > 365) {
                    var years = Math.floor(daysLeft / 365);
                    var months = Math.floor((daysLeft % 365) / 30);
                    var duration = years + ' ' + (years > 1 ? I18n.t('time.yearsShort', 'yrs') : I18n.t('time.yearShort', 'yr'));
                    if (months > 0) duration += ' ' + months + ' ' + (months > 1 ? I18n.t('time.monthsShort', 'mo') : I18n.t('time.monthShort', 'mo'));
                    parts.push(dateStr + ' (' + duration + ')');
                }
                else if (daysLeft > 30) {
                    var months = Math.floor(daysLeft / 30);
                    var duration = months + ' ' + (months > 1 ? I18n.t('time.monthsShort', 'mo') : I18n.t('time.monthShort', 'mo'));
                    parts.push(dateStr + ' (' + duration + ')');
                }
                else {
                    var duration = daysLeft + ' ' + (daysLeft === 1 ? I18n.t('time.dayShort', 'day') : I18n.t('time.daysShort', 'days'));
                    parts.push(dateStr + ' (' + duration + ')');
                }
            }
            if (info.max_connections) {
                parts.push(I18n.t('settings.connectionMax', 'Conn: ' + info.max_connections, { count: info.max_connections }));
            }
            if (info.active_cons !== undefined) {
                parts[parts.length - 1] += ' ' + I18n.t('settings.connectionActive', '(' + info.active_cons + ' active)', { count: info.active_cons });
            }
            if (parts.length > 0) {
                infoDiv.innerHTML = parts.join(' | ');
                var infoContainer = item.querySelector('.playlist-info');
                if (infoContainer) {
                    infoContainer.appendChild(infoDiv);
                }
            }
        }
    }
    else {
        status.classList.add('invalid');
        status.textContent = '✗';
        status.title = I18n.t('settings.validation.' + result.error, result.error);
    }
    item.insertBefore(status, item.querySelector('.playlist-active-badge') || null);
};

// Category Patterns Editor
IPTVApp.prototype.patternEditorSection = null;
IPTVApp.prototype.patternEditorKeywords = null;
IPTVApp.prototype.patternEditorSubcategory = null;

// Render pattern categories list dynamically
IPTVApp.prototype.renderPatternCategories = function() {
    var self = this;
    var container = document.getElementById('pattern-categories-list');
    if (!container) return;
    container.innerHTML = '';
    var categories = this.getAllCategories();
    var patterns = this.getCategoryPatterns();
    for (var i = 0; i < categories.length; i++) {
        var cat = categories[i];
        var count = this.getPatternCount(cat.id, patterns);
        var row = document.createElement('div');
        row.className = 'pattern-category-row';
        // Label with icon and name
        var label = document.createElement('span');
        label.className = 'settings-label';
        var iconSpan = document.createElement('span');
        iconSpan.className = 'pattern-category-icon';
        if (typeof cat.icon === 'object' && cat.icon.type === 'custom') {
            iconSpan.classList.add('custom-icon');
            iconSpan.textContent = cat.icon.text || '';
            iconSpan.style.color = cat.icon.color || '#fff';
            iconSpan.style.background = cat.icon.bg || '#000';
        }
        else {
            iconSpan.textContent = cat.icon;
        }
        label.appendChild(iconSpan);
        var nameSpan = document.createElement('span');
        if (cat.nameKey) {
            nameSpan.setAttribute('data-i18n', cat.nameKey);
            nameSpan.textContent = I18n.t(cat.nameKey);
        }
        else {
            nameSpan.textContent = cat.name;
        }
        label.appendChild(nameSpan);
        row.appendChild(label);
        // Edit button
        var editBtn = document.createElement('div');
        editBtn.className = 'pattern-edit-btn focusable';
        editBtn.dataset.pattern = cat.id;
        var countSpan = document.createElement('span');
        countSpan.className = 'pattern-count';
        countSpan.id = 'pattern-count-' + cat.id;
        countSpan.textContent = count;
        editBtn.appendChild(countSpan);
        var editText = document.createElement('span');
        editText.setAttribute('data-i18n', 'settings.editKeywords');
        editText.textContent = I18n.t('settings.editKeywords', 'Edit');
        editBtn.appendChild(editText);
        row.appendChild(editBtn);
        // Delete button (for all categories)
        var delBtn = document.createElement('div');
        delBtn.className = 'pattern-delete-btn focusable';
        delBtn.dataset.deleteCategory = cat.id;
        delBtn.textContent = '✕';
        row.appendChild(delBtn);
        container.appendChild(row);
    }
};

// Get pattern count for a category
IPTVApp.prototype.getPatternCount = function(categoryId, patterns) {
    if (categoryId === 'entertainment') {
        var ent = patterns.entertainment || {};
        var count = 0;
        for (var key in ent) {
            if (ent.hasOwnProperty(key)) {
                count += (ent[key] || []).length;
            }
        }
        return count;
    }
    var keywords = patterns[categoryId] || [];
    // For custom categories, also check customCategories array
    if (keywords.length === 0 && categoryId.indexOf('custom_') === 0) {
        var customCats = this.settings.customCategories || [];
        for (var i = 0; i < customCats.length; i++) {
            if (customCats[i].id === categoryId) {
                keywords = customCats[i].keywords || [];
                break;
            }
        }
    }
    return keywords.length;
};

IPTVApp.prototype.updatePatternCounts = function() {
    var patterns = this.getCategoryPatterns();
    var categories = this.getAllCategories();
    for (var i = 0; i < categories.length; i++) {
        var cat = categories[i];
        var count = this.getPatternCount(cat.id, patterns);
        var el = document.getElementById('pattern-count-' + cat.id);
        if (el) el.textContent = count;
    }
};

IPTVApp.prototype.openPatternEditor = function(section) {
    var self = this;
    this.patternEditorSection = section;
    this.patternEditorPreviousFocusIndex = this.focusIndex;
    var patterns = this.getCategoryPatterns();
    var tabsContainer = document.getElementById('pattern-subcategory-tabs');
    if (section === 'entertainment') {
        this.patternEditorKeywords = JSON.parse(JSON.stringify(patterns.entertainment || {}));
        this.patternEditorSubcategory = 'concerts';
        // Create subcategory tabs
        var subcatLabels = {
            concerts: '🎵 ' + I18n.t('home.concerts', 'Concerts'),
            theatre: '🎭 ' + I18n.t('home.theatre', 'Theatre'),
            spectacles: '🎪 ' + I18n.t('home.spectacles', 'Shows'),
            blindtest: '🎯 ' + I18n.t('home.blindtest', 'Blind Test'),
            karaoke: '🎤 ' + I18n.t('home.karaoke', 'Karaoke')
        };
        tabsContainer.innerHTML = '';
        var subcats = ['concerts', 'theatre', 'spectacles', 'blindtest', 'karaoke'];
        subcats.forEach(function(subcat) {
            var tab = document.createElement('div');
            tab.className = 'pattern-subcategory-tab focusable' + (subcat === self.patternEditorSubcategory ? ' active' : '');
            tab.dataset.subcategory = subcat;
            tab.textContent = subcatLabels[subcat];
            tabsContainer.appendChild(tab);
        });
        this.setHidden(tabsContainer, false);
    }
    else {
        // For custom categories, get keywords from customCategories array
        var keywords = patterns[section] || [];
        if (keywords.length === 0 && section.indexOf('custom_') === 0) {
            var customCats = this.settings.customCategories || [];
            for (var ci = 0; ci < customCats.length; ci++) {
                if (customCats[ci].id === section) {
                    keywords = customCats[ci].keywords || [];
                    break;
                }
            }
        }
        this.patternEditorKeywords = keywords.slice();
        this.patternEditorSubcategory = null;
        this.setHidden(tabsContainer, true);
    }
    var modal = document.getElementById('pattern-modal');
    var titleEl = document.getElementById('pattern-modal-section');
    // Get category for title and edit fields
    var categories = this.getAllCategories();
    var cat = categories.find(function(c) { return c.id === section; });
    var catName = cat ? (cat.name || (cat.nameKey ? I18n.t(cat.nameKey) : section)) : section;
    titleEl.textContent = '(' + catName + ')';
    // Show/hide category edit fields for custom categories
    var editSection = document.getElementById('pattern-category-edit');
    var nameInput = document.getElementById('pattern-category-name');
    var iconInput = document.getElementById('pattern-category-icon');
    var tmdbToggle = document.getElementById('pattern-use-tmdb-toggle');
    var emojiSection = document.getElementById('pattern-icon-emoji-section');
    var customSection = document.getElementById('pattern-icon-custom-section');
    var iconTypeToggle = document.getElementById('pattern-icon-type-toggle');
    var iconTypeBtns = iconTypeToggle.querySelectorAll('.icon-type-btn');
    if (cat && !cat.isDefault) {
        this.setHidden(editSection, false);
        nameInput.value = cat.name || '';
        // Determine icon type and initialize
        var isCustomIcon = typeof cat.icon === 'object' && cat.icon.type === 'custom';
        // Set icon type toggle state
        for (var b = 0; b < iconTypeBtns.length; b++) {
            iconTypeBtns[b].classList.toggle('selected', iconTypeBtns[b].dataset.type === (isCustomIcon ? 'custom' : 'emoji'));
        }
        if (isCustomIcon) {
            this.setHidden(emojiSection, true);
            this.setHidden(customSection, false);
            iconInput.value = cat.icon.text || '';
            this.patternEditorIconColor = cat.icon.color || '#ffffff';
            this.patternEditorIconBg = cat.icon.bg || '#000000';
            this.updatePatternIconPalettes();
            this.updatePatternIconPreview();
        }
        else {
            this.setHidden(emojiSection, false);
            this.setHidden(customSection, true);
            // Select current emoji in picker
            var emojiOptions = emojiSection.querySelectorAll('.icon-option');
            for (var e = 0; e < emojiOptions.length; e++) {
                emojiOptions[e].classList.toggle('selected', emojiOptions[e].dataset.icon === cat.icon);
            }
            this.patternEditorSelectedEmoji = cat.icon;
        }
        this.patternEditorIconType = isCustomIcon ? 'custom' : 'emoji';
        // Set useTMDB toggle (default true)
        var useTMDB = cat.useTMDB !== false;
        var tmdbValue = useTMDB ? 'yes' : 'no';
        tmdbToggle.dataset.value = tmdbValue;
        var toggleOptions = tmdbToggle.querySelectorAll('.toggle-option');
        for (var to = 0; to < toggleOptions.length; to++) {
            if (toggleOptions[to].dataset.value === tmdbValue) {
                toggleOptions[to].classList.add('active');
            }
            else {
                toggleOptions[to].classList.remove('active');
            }
        }
        this.patternEditorCategory = cat;
    }
    else {
        this.setHidden(editSection, true);
        this.patternEditorCategory = null;
    }
    this.renderPatternChips();
    this.updatePatternPreview();
    this.setHidden(modal, false);
    this.previousFocusArea = this.focusArea;
    this.focusArea = 'pattern-modal';
    this.focusIndex = 0;
    setTimeout(function() {
        self.updateFocus();
    }, 50);
};

IPTVApp.prototype.closePatternEditor = function(save) {
    if (save && this.patternEditorSection) {
        if (!this.settings.categoryPatterns) {
            this.settings.categoryPatterns = JSON.parse(JSON.stringify(this.getCategoryPatterns()));
        }
        if (this.patternEditorSection === 'entertainment') {
            this.settings.categoryPatterns.entertainment = this.patternEditorKeywords;
        }
        else {
            this.settings.categoryPatterns[this.patternEditorSection] = this.patternEditorKeywords;
        }
        window.log('closePatternEditor: section=' + this.patternEditorSection + ' keywords=' + (this.patternEditorKeywords ? this.patternEditorKeywords.length : 'null'));
        // Save custom category name/icon/useTMDB changes
        if (this.patternEditorCategory) {
            var nameInput = document.getElementById('pattern-category-name');
            var iconInput = document.getElementById('pattern-category-icon');
            var tmdbToggle = document.getElementById('pattern-use-tmdb-toggle');
            var newName = nameInput.value.trim();
            if (newName && newName !== this.patternEditorCategory.name) {
                this.patternEditorCategory.name = newName;
            }
            // Save icon based on type
            if (this.patternEditorIconType === 'emoji') {
                this.patternEditorCategory.icon = this.patternEditorSelectedEmoji || '📁';
            }
            else {
                var newText = iconInput.value.trim();
                var textHexInput = document.getElementById('pattern-text-color-hex');
                var bgHexInput = document.getElementById('pattern-bg-color-hex');
                var textColor = this.patternEditorIconColor || '#ffffff';
                var bgColor = this.patternEditorIconBg || '#000000';
                if (textHexInput && this.isValidHexColor(textHexInput.value)) {
                    textColor = textHexInput.value;
                }
                if (bgHexInput && this.isValidHexColor(bgHexInput.value)) {
                    bgColor = bgHexInput.value;
                }
                this.patternEditorCategory.icon = {
                    type: 'custom',
                    text: newText,
                    color: textColor,
                    bg: bgColor
                };
            }
            // Save useTMDB setting
            this.patternEditorCategory.useTMDB = tmdbToggle.dataset.value === 'yes';
        }
        this.saveSettings();
        this.updatePatternCounts();
        this.updateHomeMenuVisibility();
        this.renderPatternCategories();
    }
    var modal = document.getElementById('pattern-modal');
    this.setHidden(modal, true);
    this.patternEditorSection = null;
    this.patternEditorKeywords = null;
    this.patternEditorCategory = null;
    this.focusArea = 'settings';
    this.focusIndex = this.patternEditorPreviousFocusIndex || 0;
    this.updateFocus();
};

IPTVApp.prototype.updatePatternIconPalettes = function() {
    var textPalette = document.getElementById('pattern-text-color-palette');
    var bgPalette = document.getElementById('pattern-bg-color-palette');
    var textHexInput = document.getElementById('pattern-text-color-hex');
    var bgHexInput = document.getElementById('pattern-bg-color-hex');
    var textColorInPalette = false;
    var bgColorInPalette = false;
    if (textPalette) {
        var textOptions = textPalette.querySelectorAll('.color-option');
        for (var i = 0; i < textOptions.length; i++) {
            var isSelected = textOptions[i].dataset.color === this.patternEditorIconColor;
            textOptions[i].classList.toggle('selected', isSelected);
            if (isSelected) textColorInPalette = true;
        }
    }
    if (bgPalette) {
        var bgOptions = bgPalette.querySelectorAll('.color-option');
        for (var j = 0; j < bgOptions.length; j++) {
            var isSelected = bgOptions[j].dataset.color === this.patternEditorIconBg;
            bgOptions[j].classList.toggle('selected', isSelected);
            if (isSelected) bgColorInPalette = true;
        }
    }
    // Fill hex input if color is not in palette
    if (textHexInput) {
        textHexInput.value = textColorInPalette ? '' : (this.patternEditorIconColor || '');
    }
    if (bgHexInput) {
        bgHexInput.value = bgColorInPalette ? '' : (this.patternEditorIconBg || '');
    }
};

IPTVApp.prototype.updatePatternIconPreview = function() {
    var input = document.getElementById('pattern-category-icon');
    if (!input) return;
    var textHexInput = document.getElementById('pattern-text-color-hex');
    var bgHexInput = document.getElementById('pattern-bg-color-hex');
    var color = this.patternEditorIconColor || '#ffffff';
    var bg = this.patternEditorIconBg || '#000000';
    if (textHexInput && this.isValidHexColor(textHexInput.value)) {
        color = textHexInput.value;
    }
    if (bgHexInput && this.isValidHexColor(bgHexInput.value)) {
        bg = bgHexInput.value;
    }
    input.style.color = color;
    input.style.background = bg;
};

IPTVApp.prototype.handlePatternIconTypeToggle = function(type) {
    var emojiSection = document.getElementById('pattern-icon-emoji-section');
    var customSection = document.getElementById('pattern-icon-custom-section');
    var iconTypeBtns = document.querySelectorAll('#pattern-icon-type-toggle .icon-type-btn');
    this.patternEditorIconType = type;
    for (var i = 0; i < iconTypeBtns.length; i++) {
        iconTypeBtns[i].classList.toggle('selected', iconTypeBtns[i].dataset.type === type);
    }
    this.setHidden(emojiSection, type !== 'emoji');
    this.setHidden(customSection, type === 'emoji');
    if (type !== 'emoji') {
        this.updatePatternIconPalettes();
        this.updatePatternIconPreview();
    }
};

IPTVApp.prototype.handlePatternEmojiSelect = function(emoji) {
    this.patternEditorSelectedEmoji = emoji;
    var emojiOptions = document.querySelectorAll('#pattern-icon-emoji-section .icon-option');
    for (var i = 0; i < emojiOptions.length; i++) {
        emojiOptions[i].classList.toggle('selected', emojiOptions[i].dataset.icon === emoji);
    }
};

IPTVApp.prototype.handlePatternColorSelect = function(palette, color) {
    if (palette === 'text') {
        this.patternEditorIconColor = color;
    }
    else {
        this.patternEditorIconBg = color;
    }
    this.updatePatternIconPalettes();
    this.updatePatternIconPreview();
};

IPTVApp.prototype.renderPatternChips = function() {
    var self = this;
    var container = document.getElementById('pattern-chips');
    container.innerHTML = '';
    if (this.patternEditorSection === 'entertainment') {
        // Show only the selected subcategory's keywords
        var subcat = this.patternEditorSubcategory || 'concerts';
        var keywords = this.patternEditorKeywords[subcat] || [];
        for (var i = 0; i < keywords.length; i++) {
            container.appendChild(this.createPatternChip(keywords[i], subcat));
        }
        if (keywords.length === 0) {
            container.innerHTML = '<div style="color:#666;font-size:18px;padding:10px;">' + I18n.t('settings.noKeywords', 'No keywords') + '</div>';
        }
    }
    else {
        var keywords = this.patternEditorKeywords || [];
        for (var j = 0; j < keywords.length; j++) {
            container.appendChild(this.createPatternChip(keywords[j], null));
        }
    }
};

IPTVApp.prototype.selectPatternSubcategory = function(subcat) {
    this.patternEditorSubcategory = subcat;
    // Update tab active states
    var tabs = document.querySelectorAll('.pattern-subcategory-tab');
    for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].dataset.subcategory === subcat) {
            tabs[i].classList.add('active');
        }
        else {
            tabs[i].classList.remove('active');
        }
    }
    this.renderPatternChips();
    this.updatePatternPreview();
};

IPTVApp.prototype.createPatternChip = function(keyword, subcategory) {
    var self = this;
    var chip = document.createElement('div');
    chip.className = 'pattern-chip focusable';
    chip.dataset.keyword = keyword;
    if (subcategory) {
        chip.dataset.subcategory = subcategory;
    }
    chip.innerHTML = '<span class="pattern-chip-text">' + keyword + '</span>' +
        '<span class="pattern-chip-remove">×</span>';
    return chip;
};

IPTVApp.prototype.removePatternKeyword = function(keyword, subcategory) {
    if (this.patternEditorSection === 'entertainment' && subcategory) {
        var arr = this.patternEditorKeywords[subcategory] || [];
        var idx = arr.indexOf(keyword);
        if (idx >= 0) {
            arr.splice(idx, 1);
            this.patternEditorKeywords[subcategory] = arr;
        }
    }
    else {
        var idx = this.patternEditorKeywords.indexOf(keyword);
        if (idx >= 0) {
            this.patternEditorKeywords.splice(idx, 1);
        }
    }
    this.renderPatternChips();
    this.updatePatternPreview();
};

IPTVApp.prototype.addPatternKeyword = function(keyword, subcategory) {
    if (!keyword || keyword.trim() === '') return;
    keyword = keyword.trim().toLowerCase();
    if (this.patternEditorSection === 'entertainment') {
        var targetSubcat = subcategory || this.patternEditorSubcategory || 'spectacles';
        if (!this.patternEditorKeywords[targetSubcat]) {
            this.patternEditorKeywords[targetSubcat] = [];
        }
        if (this.patternEditorKeywords[targetSubcat].indexOf(keyword) === -1) {
            this.patternEditorKeywords[targetSubcat].push(keyword);
        }
    }
    else {
        if (this.patternEditorKeywords.indexOf(keyword) === -1) {
            this.patternEditorKeywords.push(keyword);
        }
    }
    this.renderPatternChips();
    this.updatePatternPreview();
    document.getElementById('pattern-add-input').value = '';
};

IPTVApp.prototype.updatePatternPreview = function() {
    var self = this;
    var previewList = document.getElementById('pattern-preview-list');
    previewList.innerHTML = '<div class="pattern-preview-item" style="color:#666;">' + I18n.t('app.loading', 'Loading...') + '</div>';
    if (!this.api) {
        previewList.innerHTML = '<div class="pattern-preview-item" style="color:#666;">' + I18n.t('settings.noApiAvailable', 'No API available') + '</div>';
        return;
    }
    Promise.all([
        this.api.getVodCategories(),
        this.api.getSeriesCategories()
    ]).then(function(results) {
        var vodCategories = results[0] || [];
        var seriesCategories = results[1] || [];
        var allCategories = vodCategories.concat(seriesCategories);
        self.renderPatternPreview(allCategories);
    }).catch(function() {
        previewList.innerHTML = '<div class="pattern-preview-item" style="color:#666;">' + I18n.t('settings.failedToLoadCategories', 'Failed to load categories') + '</div>';
    });
};

IPTVApp.prototype.renderPatternPreview = function(categories) {
    var self = this;
    var previewList = document.getElementById('pattern-preview-list');
    previewList.innerHTML = '';
    // Don't filter by language in preview - show all matches
    var matchedCategories = [];
    var keywordsToPatterns = function(keywords) {
        return keywords.map(function(kw) {
            return Regex.keywordPattern(kw);
        });
    };
    var patterns = [];
    if (self.patternEditorSection === 'entertainment') {
        // Only show matches for the selected subcategory
        var subcat = self.patternEditorSubcategory || 'concerts';
        patterns = keywordsToPatterns(self.patternEditorKeywords[subcat] || []);
    }
    else {
        patterns = keywordsToPatterns(self.patternEditorKeywords || []);
    }
    categories.forEach(function(cat) {
        var name = cat.category_name || '';
        if (patterns.some(function(p) { return p.test(name); })) {
            matchedCategories.push(self.formatCategoryDisplayName(name));
        }
    });
    if (matchedCategories.length === 0) {
        previewList.innerHTML = '<div class="pattern-preview-item" style="color:#666;">' + I18n.t('settings.noMatchingCategories', 'No matching categories') + '</div>';
    }
    else {
        matchedCategories.slice(0, 10).forEach(function(name) {
            var item = document.createElement('div');
            item.className = 'pattern-preview-item';
            item.textContent = name;
            previewList.appendChild(item);
        });
        if (matchedCategories.length > 10) {
            var more = document.createElement('div');
            more.className = 'pattern-preview-item';
            more.style.color = '#666';
            more.textContent = I18n.t('settings.moreItems', '+ ' + (matchedCategories.length - 10) + ' more...', { count: matchedCategories.length - 10 });
            previewList.appendChild(more);
        }
    }
};

IPTVApp.prototype.resetCategoryPatterns = function() {
    window.log('ACTION', 'resetCategoryPatterns');
    this.settings.categoryPatterns = null;
    this.settings.customCategories = [];
    this.saveSettings();
    this.updatePatternCounts();
    this.updateHomeMenuVisibility();
};

// Add Category Modal
IPTVApp.prototype.openAddCategoryModal = function() {
    window.log('ACTION', 'openAddCategoryModal');
    var self = this;
    var modal = document.getElementById('add-category-modal');
    this.setHidden(modal, false);
    this.addCategoryPreviousFocusIndex = this.focusIndex;
    this.focusArea = 'add-category-modal';
    this.focusIndex = 0;
    this.selectedIcon = '⚽';
    this.iconType = 'emoji';
    // Reset input
    var input = document.getElementById('new-category-name');
    if (input) input.value = '';
    // Reset icon type toggle
    var typeBtns = document.querySelectorAll('.icon-type-btn');
    for (var j = 0; j < typeBtns.length; j++) {
        typeBtns[j].classList.toggle('selected', typeBtns[j].dataset.type === 'emoji');
    }
    this.setHidden('icon-emoji-section', false);
    this.setHidden('icon-custom-section', true);
    // Reset icon selection
    var icons = document.querySelectorAll('#icon-picker .icon-option');
    for (var i = 0; i < icons.length; i++) {
        icons[i].classList.remove('selected');
        if (icons[i].dataset.icon === this.selectedIcon) {
            icons[i].classList.add('selected');
        }
    }
    // Reset custom icon fields
    document.getElementById('custom-icon-text').value = '';
    // Reset color palette selections
    var textColors = document.querySelectorAll('#text-color-palette .color-option');
    for (var tc = 0; tc < textColors.length; tc++) {
        textColors[tc].classList.toggle('selected', textColors[tc].dataset.color === '#ffffff');
    }
    var bgColors = document.querySelectorAll('#bg-color-palette .color-option');
    for (var bc = 0; bc < bgColors.length; bc++) {
        bgColors[bc].classList.toggle('selected', bgColors[bc].dataset.color === '#1a1a1a');
    }
    // Reset hex color inputs
    var textHexInput = document.getElementById('text-color-hex');
    var bgHexInput = document.getElementById('bg-color-hex');
    if (textHexInput) textHexInput.value = '';
    if (bgHexInput) bgHexInput.value = '';
    this.updateCustomIconPreview();
    setTimeout(function() {
        self.updateFocus();
        self.openKeyboard('new-category-name');
    }, 50);
};

IPTVApp.prototype.closeAddCategoryModal = function(save) {
    window.log('ACTION closeAddCategoryModal: save=' + save);
    var modal = document.getElementById('add-category-modal');
    var newCategoryId = null;
    if (save) {
        var input = document.getElementById('new-category-name');
        var name = input ? input.value.trim() : '';
        if (name) {
            var iconData;
            if (this.iconType === 'custom') {
                var textColorEl = document.querySelector('#text-color-palette .color-option.selected');
                var bgColorEl = document.querySelector('#bg-color-palette .color-option.selected');
                var textHexInput = document.getElementById('text-color-hex');
                var bgHexInput = document.getElementById('bg-color-hex');
                var textColor = textColorEl ? textColorEl.dataset.color : '#ffffff';
                var bgColor = bgColorEl ? bgColorEl.dataset.color : '#1a1a1a';
                if (textHexInput && this.isValidHexColor(textHexInput.value)) {
                    textColor = textHexInput.value;
                }
                if (bgHexInput && this.isValidHexColor(bgHexInput.value)) {
                    bgColor = bgHexInput.value;
                }
                iconData = {
                    type: 'custom',
                    text: document.getElementById('custom-icon-text').value || '',
                    color: textColor,
                    bg: bgColor
                };
            }
            else {
                iconData = this.selectedIcon;
            }
            var cat = this.addCustomCategory(name, iconData);
            newCategoryId = cat.id;
            this.renderPatternCategories();
            this.updateHomeMenuVisibility();
        }
    }
    this.setHidden(modal, true);
    // Open pattern editor for new category
    if (newCategoryId) {
        this.openPatternEditor(newCategoryId);
    }
    else {
        this.focusArea = 'settings';
        this.focusIndex = this.addCategoryPreviousFocusIndex || 0;
        this.updateFocus();
    }
};

IPTVApp.prototype.handleAddCategorySelect = function() {
    var focusables = this.getFocusables();
    var current = focusables[this.focusIndex];
    if (!current) return;
    if (current.classList.contains('settings-input') || current.tagName === 'INPUT') {
        this.openKeyboard(current.id);
        return;
    }
    if (current.classList.contains('icon-type-btn')) {
        // Toggle icon type
        var type = current.dataset.type;
        this.iconType = type;
        var typeBtns = document.querySelectorAll('.icon-type-btn');
        for (var j = 0; j < typeBtns.length; j++) {
            typeBtns[j].classList.toggle('selected', typeBtns[j].dataset.type === type);
        }
        this.setHidden('icon-emoji-section', type !== 'emoji');
        this.setHidden('icon-custom-section', type !== 'custom');
    }
    else if (current.classList.contains('icon-option')) {
        // Select icon
        var icons = document.querySelectorAll('#icon-picker .icon-option');
        for (var i = 0; i < icons.length; i++) {
            icons[i].classList.remove('selected');
        }
        current.classList.add('selected');
        this.selectedIcon = current.dataset.icon;
    }
    else if (current.classList.contains('color-option')) {
        // Select color from palette
        var palette = current.parentElement;
        var options = palette.querySelectorAll('.color-option');
        for (var c = 0; c < options.length; c++) {
            options[c].classList.remove('selected');
        }
        current.classList.add('selected');
        // Clear hex input when selecting from palette
        if (palette.id === 'text-color-palette') {
            var textHex = document.getElementById('text-color-hex');
            if (textHex) textHex.value = '';
        }
        else if (palette.id === 'bg-color-palette') {
            var bgHex = document.getElementById('bg-color-hex');
            if (bgHex) bgHex.value = '';
        }
        this.updateCustomIconPreview();
    }
    else if (current.id === 'add-category-cancel-btn') {
        this.closeAddCategoryModal(false);
    }
    else if (current.id === 'add-category-save-btn') {
        this.closeAddCategoryModal(true);
    }
};

IPTVApp.prototype.updateCustomIconPreview = function() {
    var input = document.getElementById('custom-icon-text');
    if (!input) return;
    var textHexInput = document.getElementById('text-color-hex');
    var bgHexInput = document.getElementById('bg-color-hex');
    var textColorEl = document.querySelector('#text-color-palette .color-option.selected');
    var bgColorEl = document.querySelector('#bg-color-palette .color-option.selected');
    var color = textColorEl ? textColorEl.dataset.color : '#ffffff';
    var bg = bgColorEl ? bgColorEl.dataset.color : '#1a1a1a';
    if (textHexInput && this.isValidHexColor(textHexInput.value)) {
        color = textHexInput.value;
    }
    if (bgHexInput && this.isValidHexColor(bgHexInput.value)) {
        bg = bgHexInput.value;
    }
    input.style.color = color;
    input.style.background = bg;
};

IPTVApp.prototype.isValidHexColor = function(hex) {
    return /^#[0-9A-Fa-f]{6}$/.test(hex);
};

IPTVApp.prototype.confirmDeleteCategory = function(categoryId) {
    var self = this;
    var categories = this.getAllCategories();
    var cat = categories.find(function(c) { return c.id === categoryId; });
    var name = cat ? (cat.name || (cat.nameKey ? I18n.t(cat.nameKey) : categoryId)) : categoryId;
    this.showConfirmModal(I18n.t('settings.confirmDeleteCategory', 'Delete category?', { name: name }), function() {
        if (cat && cat.isDefault) {
            self.hideDefaultCategory(categoryId);
        }
        else {
            self.removeCustomCategory(categoryId);
        }
        self.renderPatternCategories();
        self.updateHomeMenuVisibility();
    });
};

// Confirm Modal
IPTVApp.prototype.showConfirmModal = function(message, action) {
    var self = this;
    this.confirmModalAction_ = action;
    this.confirmModalPreviousFocusArea = this.focusArea;
    this.confirmModalPreviousFocusIndex = this.focusIndex;
    var modal = document.getElementById('confirm-modal');
    var messageEl = document.getElementById('confirm-modal-message');
    messageEl.textContent = message;
    this.setHidden(modal, false);
    this.focusArea = 'confirm-modal';
    this.focusIndex = 0; // Focus on Cancel for safety
    setTimeout(function() {
        self.updateFocus();
    }, 50);
};

IPTVApp.prototype.hideConfirmModal = function() {
    var modal = document.getElementById('confirm-modal');
    this.setHidden(modal, true);
    this.focusArea = this.confirmModalPreviousFocusArea || 'playlists';
    this.focusIndex = this.confirmModalPreviousFocusIndex || 0;
    this.confirmModalAction_ = null;
    this.updateFocus();
};

IPTVApp.prototype.confirmModalAction = function(confirmed) {
    window.log('ACTION confirmModal: ' + (confirmed ? 'yes' : 'no'));
    var action = this.confirmModalAction_;
    this.hideConfirmModal();
    if (confirmed && action) {
        if (typeof action === 'function') {
            action();
        }
        else if (action === 'deletePlaylist') {
            this.deletePlaylist();
        }
    }
};

IPTVApp.prototype.updateFreeboxVisibility = function() {
    var show = this.settings.freeboxEnabled;
    var ids = ['freebox-host-row', 'freebox-batch-row', 'freebox-pair-row', 'freebox-desc-row'];
    for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (el) el.style.display = show ? '' : 'none';
    }
};

IPTVApp.prototype.updateFreeboxStatus = function() {
    var statusEl = document.getElementById('freebox-status-text');
    var pairBtn = document.getElementById('freebox-pair-btn');
    if (!statusEl || !pairBtn) return;
    if (this.settings.freeboxAppToken) {
        statusEl.textContent = I18n.t('settings.freeboxPaired', 'Paired');
        statusEl.style.color = '#4CAF50';
        pairBtn.textContent = I18n.t('settings.freeboxUnpair', 'Unpair');
    }
    else {
        statusEl.textContent = I18n.t('settings.freeboxNotPaired', 'Not paired');
        statusEl.style.color = '#ff5252';
        pairBtn.textContent = I18n.t('settings.freeboxPair', 'Pair');
    }
};

IPTVApp.prototype.startFreeboxPairing = function() {
    var self = this;
    var host = this.settings.freeboxHost || 'mafreebox.freebox.fr';
    FreeboxAPI.setConfig(host, '');
    this.showToast(I18n.t('freebox.pairingPending', 'Validate on your Freebox...'), 10000);
    FreeboxAPI.requestAuthorization().then(function(auth) {
        self._freeboxPairingTimer = FreeboxAPI.pollAuthorization(auth.trackId, auth.appToken, function(status) {
            self._freeboxPairingTimer = null;
            if (status === 'granted') {
                self.settings.freeboxAppToken = auth.appToken;
                self.saveSettings();
                self.initFreebox();
                self.updateFreeboxStatus();
                self.showToast(I18n.t('freebox.pairingGranted', 'Pairing successful!'), 3000);
            }
            else if (status === 'denied') {
                self.showToast(I18n.t('freebox.pairingDenied', 'Pairing denied'), 3000, true);
            }
            else {
                self.showToast(I18n.t('freebox.pairingTimeout', 'Pairing timeout'), 3000, true);
            }
        });
    }).catch(function(err) {
        window.log('Freebox pairing error: ' + err.message);
        self.showToast(I18n.t('freebox.downloadError', 'Download error') + ': ' + err.message, 5000, true);
    });
};

IPTVApp.prototype.unpairFreebox = function() {
    this.settings.freeboxAppToken = '';
    this.saveSettings();
    FreeboxAPI.setConfig(this.settings.freeboxHost, '');
    FreeboxAPI.stopPolling();
    this.updateFreeboxStatus();
};
