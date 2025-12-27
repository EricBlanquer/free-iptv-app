/**
 * Remote Sync module
 * Syncs settings, history, favorites, and progress to remote server.
 * Only enabled for dev device (defined by DEV_DUID in config.local.js).
 */

var DevRemoteSync = {
    baseUrl: 'https://iptv.blanquer.org/sync.php',
    enabled: false,
    devDeviceId: null,
    pendingSave: null,
    saveDebounceMs: 2000,

    /**
     * Initialize remote sync (only enabled for dev device)
     */
    init: function() {
        this.isDevDevice = window.isDevDevice && window.isDevDevice();
        this.devDeviceId = this.isDevDevice ? window.DEV_DUID : null;
        window.log('SYNC', 'DevRemoteSync.init: enabled=' + this.isDevDevice + ' deviceId=' + window.deviceId);
    },

    /**
     * Load all data from remote server
     * @returns {Promise<Object|null>} Remote data or null if not available
     */
    load: function() {
        var self = this;
        if (!this.isDevDevice) {
            return Promise.resolve(null);
        }
        return new Promise(function(resolve) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', self.baseUrl + '?device=' + encodeURIComponent(self.devDeviceId), true);
            xhr.timeout = 5000;
            xhr.onload = function() {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        window.log('SYNC', 'DevRemoteSync.load: success, keys=' + Object.keys(data).join(','));
                        resolve(data);
                    }
                    catch (ex) {
                        window.log('ERROR', 'DevRemoteSync.load parse: ' + ex.message);
                        resolve(null);
                    }
                }
                else {
                    window.log('SYNC', 'DevRemoteSync.load: status=' + xhr.status);
                    resolve(null);
                }
            };
            xhr.onerror = function() {
                window.log('ERROR', 'DevRemoteSync.load: network error');
                resolve(null);
            };
            xhr.ontimeout = function() {
                window.log('HTTP', 'DevRemoteSync.load: timeout');
                resolve(null);
            };
            xhr.send();
        });
    },

    /**
     * Save all data to remote server (debounced)
     * @param {Object} data - Data to save
     */
    save: function(data) {
        if (!this.isDevDevice) return;
        var self = this;
        // Debounce saves to avoid too many requests
        if (this.pendingSave) {
            clearTimeout(this.pendingSave);
        }
        this.pendingSave = setTimeout(function() {
            self.pendingSave = null;
            self.doSave(data);
        }, this.saveDebounceMs);
    },

    /**
     * Immediately save data to remote server
     * @param {Object} data - Data to save
     */
    doSave: function(data) {
        if (!this.isDevDevice) return;
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', this.baseUrl, true);
            xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
            xhr.send(JSON.stringify({
                device: this.devDeviceId,
                data: data
            }));
            window.log('SYNC', 'DevRemoteSync.save: sent');
        }
        catch (ex) {
            window.log('ERROR', 'DevRemoteSync.save: ' + ex.message);
        }
    },

    /**
     * Clean sparse array/object by removing null values and converting to plain object
     * @param {Object|Array} data - Data to clean
     * @returns {Object} Clean object with only valid entries
     */
    cleanSparseData: function(data) {
        if (!data) return {};
        var clean = {};
        for (var key in data) {
            if (data.hasOwnProperty(key) && data[key] != null) {
                clean[key] = data[key];
            }
        }
        return clean;
    },

    /**
     * Get all syncable data from app (excludes sensitive playlist credentials)
     * @param {IPTVApp} app - The app instance
     * @returns {Object} Data object with settings, history, favorites, progress
     */
    getAllData: function(app) {
        // Filter out sensitive playlist data from settings
        var safeSettings = {};
        var sensitiveKeys = ['playlistUrl', 'username', 'password', 'playlists', 'activePlaylistId', 'playlist-name'];
        for (var key in app.settings) {
            if (app.settings.hasOwnProperty(key) && sensitiveKeys.indexOf(key) === -1) {
                safeSettings[key] = app.settings[key];
            }
        }
        // Extract non-sensitive playlist preferences (subtitle language, etc.)
        var playlistPrefs = {};
        if (app.settings.playlists && app.settings.playlists.length > 0) {
            app.settings.playlists.forEach(function(p) {
                if (p.id && p.defaultSubtitleLang) {
                    playlistPrefs[p.id] = {
                        defaultSubtitleLang: p.defaultSubtitleLang
                    };
                }
            });
        }
        return {
            settings: safeSettings,
            watchHistory: app.watchHistory,
            favorites: app.favorites,
            episodeProgress: this.cleanSparseData(app.episodeProgress),
            seriesProgress: this.cleanSparseData(app.seriesProgress),
            playlistPrefs: playlistPrefs,
            timestamp: Date.now()
        };
    },

    /**
     * Apply remote data to app
     * @param {IPTVApp} app - The app instance
     * @param {Object} remoteData - Remote data object
     * @returns {boolean} True if data was applied
     */
    applyData: function(app, remoteData) {
        if (!remoteData) return false;
        var applied = false;
        var localSettingsTime = 0;
        try {
            var localData = localStorage.getItem('settings');
            if (localData) {
                var parsed = JSON.parse(localData);
                localSettingsTime = parsed._syncTime || 0;
            }
        }
        catch (ex) { /* no local settings */ }
        var remoteTime = remoteData.timestamp || 0;
        if (remoteTime > localSettingsTime || localSettingsTime === 0) {
            window.log('SYNC', 'DevRemoteSync.applyData: applying remote data (remote=' + remoteTime + ' local=' + localSettingsTime + ')');
            if (remoteData.settings) {
                var sensitiveKeys = ['playlistUrl', 'username', 'password', 'playlists', 'activePlaylistId', 'playlist-name'];
                var localCredentials = {};
                sensitiveKeys.forEach(function(key) {
                    if (app.settings.hasOwnProperty(key)) {
                        localCredentials[key] = app.settings[key];
                    }
                });
                app.settings = remoteData.settings;
                for (var key in localCredentials) {
                    app.settings[key] = localCredentials[key];
                }
                app.settings._syncTime = remoteTime;
                try {
                    localStorage.setItem('settings', JSON.stringify(app.settings));
                }
                catch (ex) { /* storage may be full */ }
                applied = true;
            }
            if (remoteData.watchHistory) {
                app.watchHistory = remoteData.watchHistory;
                try {
                    localStorage.setItem('watchHistory', JSON.stringify(app.watchHistory));
                }
                catch (ex) { /* storage may be full */ }
                applied = true;
            }
            if (remoteData.favorites) {
                app.favorites = remoteData.favorites;
                try {
                    localStorage.setItem('favorites', JSON.stringify(app.favorites));
                }
                catch (ex) { /* storage may be full */ }
                applied = true;
            }
            if (remoteData.episodeProgress) {
                app.episodeProgress = this.cleanSparseData(remoteData.episodeProgress);
                try {
                    localStorage.setItem('episodeProgress', JSON.stringify(app.episodeProgress));
                }
                catch (ex) { /* storage may be full */ }
                applied = true;
            }
            if (remoteData.seriesProgress) {
                app.seriesProgress = this.cleanSparseData(remoteData.seriesProgress);
                try {
                    localStorage.setItem('seriesProgress', JSON.stringify(app.seriesProgress));
                }
                catch (ex) { /* storage may be full */ }
                applied = true;
            }
            if (remoteData.playlistPrefs && app.settings.playlists) {
                var prefsApplied = false;
                app.settings.playlists.forEach(function(p) {
                    var prefs = remoteData.playlistPrefs[p.id];
                    if (prefs) {
                        if (prefs.defaultSubtitleLang !== undefined) {
                            p.defaultSubtitleLang = prefs.defaultSubtitleLang;
                            prefsApplied = true;
                        }
                    }
                });
                if (prefsApplied) {
                    try {
                        localStorage.setItem('settings', JSON.stringify(app.settings));
                    }
                    catch (ex) { /* storage may be full */ }
                    applied = true;
                }
            }
        }
        else {
            window.log('SYNC', 'DevRemoteSync.applyData: local is newer, not applying');
        }
        return applied;
    }
};
