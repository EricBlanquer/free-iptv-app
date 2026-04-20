/**
 * Samsung IPTV Application for Tizen TV
 * @class IPTVApp
 * @description Main application class handling IPTV streaming, navigation, and user settings.
 * Supports M3U playlists and Provider API for content streaming.
 */
// Escape URL for safe use in CSS background-image
function cssUrl(url) {
    if (!url) return '';
    // Escape backslashes and double quotes for CSS
    return 'url("' + url.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '")';
}

var APP_VERSION = '';
(function() {
    try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'config.xml', false);
        xhr.send();
        if (xhr.status === 200 || xhr.status === 0) {
            var match = xhr.responseText.match(/<widget[^>]+version="([^"]+)"/);
            if (match) APP_VERSION = match[1];
        }
    } catch (e) {}
})();

class IPTVApp {
    /**
     * Initialize the IPTV application
     * @constructor
     */
    constructor() {
        this.api = null;
        this.player = new TVPlayer();
        this.deviceId = null; // Will be set in init()
        this.currentScreen = 'home';
        this.currentSection = null; // live, vod, series
        this.selectedCategoryBySection = this.loadSelectedCategories();
        this.categorySortBySection = this.loadCategorySort();
        this.focusIndex = 0;
        this.focusArea = 'home'; // langBtn, home, lang, sidebar, filters, grid, details, player
        this.currentSort = 'default';
        this.searchTitle = '';
        this.searchYear = '';
        this.searchActor = '';
        this.actorSearchResults = null;
        this.originalStreams = [];
        this.settings = this.loadSettings();
        this.hideSD = this.settings.hideSD;
        this.hide3D = this.settings.hide3D;
        this.hideSM = this.settings.hideHearingImpaired;
        this.subtitleSize = this.settings.subtitleSize;
        this.subtitleStyle = this.settings.subtitleStyle;
        this.secureSubtitles = this.settings.secureSubtitles === true || this.settings.secureSubtitles === 'true';
        this.watchHistory = this.loadWatchHistory();
        this._rebuildHistoryIndex();
        this.episodeProgress = this.loadEpisodeProgress();
        this.seriesProgress = this.loadSeriesProgress();
        this.seriesVersionPrefs = this.loadSeriesVersionPrefs();
        this.movieVersionPrefs = this.loadMovieVersionPrefs();
        this.favorites = this.loadFavorites();
        this._rebuildFavoritesIndex();
        this.tmdbCache = this.loadTMDBCache();
        this.data = {
            live: { categories: [], streams: [] },
            vod: { categories: [], streams: [] },
            series: { categories: [], streams: [] }
        };
        this.cacheLoading = false;
        this.gridColumns = 5;
        this.overlayTimer = null;
        this.selectedStream = null;
        this.currentStreams = [];
        this.currentStreamType = '';
        this.displayedCount = 0;
        this.itemsPerBatch = 15;
        this.lastNavTime = 0;
        this.navThrottle = 80;
        this.imageLoadTimer = null;
        this.scrollTimer = null;
        this.lastSidebarIndex = 0;
        this.lastHomeIndex = 0;
        this.lastGridIndex = 0;
        this.lastDetailsIndex = 0;
        this.previousScreen = null;
        this.currentActorId = null;
        this.detailsStack = [];
        this.detailsReturnActorId = null;
        this.availableLanguages = [];
        this.currentSeriesInfo = null;
        this.currentSeason = 1;
        this.seekDirection = 0;
        this.seekInterval = null;
        this.seekStartTime = 0;
        this.seekBaseJump = 10;
        this.seekFirstBackwardJump = 5;
        this.seekMultipliers = [1, 2, 3, 6, 12, 20];
        this.lastSeekActionTime = 0;
        this.isFirstBackwardTick = false;
        this.seekTargetPosition = 0;
        this.lastSeekTime = 0;
        this.wasPlaying = false;
        this.langAliases = {
            'SD': 'FR',
            'CA': 'FR',
            'VFSTFR': 'FR',
            'VO-VOSTFR': 'FR'
        };
    }

    /**
     * Get streams for a section, using API cache as fallback if this.data is not populated
     * @param {string} section - Section name: 'live', 'vod', or 'series'
     * @returns {Array} Streams array
     */
    getStreams(section) {
        // Try this.data first
        if (this.data[section] && this.data[section].streams && this.data[section].streams.length > 0) {
            return this.data[section].streams;
        }
        // Fallback to API cache
        if (!this.api || !this.api.cache) return [];
        if (section === 'live') {
            return this.api.cache.liveStreams && this.api.cache.liveStreams['_all'] || [];
        }
        if (section === 'vod') {
            return this.api.cache.vodStreams && this.api.cache.vodStreams['_all'] || [];
        }
        if (section === 'series') {
            return this.api.cache.series && this.api.cache.series['_all'] || [];
        }
        return [];
    }

    /**
     * Update cache loading status indicator
     * @param {number} step - Current step (1-based), 0 when done
     * @param {number} total - Total steps
     * @param {string} name - Name of current step
     */
    updateCacheStatus(step, total, name) {
        var el = document.getElementById('loading-status');
        var textEl = document.getElementById('loading-text');
        if (!el) return;
        if (step === 0 || !name) {
            el.textContent = '';
            this.setHidden(textEl, false);
        }
        else {
            el.textContent = I18n.t('home.cacheLoading', 'Loading...', { step: step, total: total, name: name });
            this.setHidden(textEl, true);
        }
    }

    /**
     * Initialize the application, setup event handlers, and start the app
     * @returns {void}
     */
    init() {
        var self = this;
        // Set deviceId early so logs have the correct device
        this.deviceId = this.getDeviceId();
        window.deviceId = this.deviceId;
        this.setupRemoteDebug();
        Premium.init(this.deviceId);
        window._sendCrashLogs();
        window.log('INIT', 'deviceId=' + this.deviceId);
        this.logMemory('init');
        I18n.init();
        if (this.settings.locale) {
            I18n.setLocale(this.settings.locale);
        }
        this.loadTMDBCacheAsync();
        this.startMemoryMonitor();
        this.player.init();
        this.player.setPreferHtml5(this.settings.preferHtml5Player);
        this.player.setDialogueBoost(this.settings.dialogueBoost);
        this.player.setProxyUrl(this.getStreamProxyUrl());
        if (!this.settings.textSize && document.body.classList.contains('touch')) {
            this.settings.textSize = 'xlarge';
        }
        this.applyTextSize(this.settings.textSize);
        this.preloadBackdropImages();
        this.initAPIs();
        this.initFreebox();
        this.resetScreens();
        this.bindKeys();
        this.bindTouchEvents();
        this.initTTS();
        this.initFilterEvents();
        this.initTitleEditor();
        this.initGridScrollLoader();
        this.updateHomeMenuVisibility();
        this.bindDisclaimerButton();
        // Check if disclaimer was accepted
        if (!this.isDisclaimerAccepted()) {
            this.showDisclaimer();
            this.markWebHealthy();
            return;
        }
        this.startApp();
        this.markWebHealthy();
        this.checkPendingApkUpdate();
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                self.forceSaveProgress();
            }
            if (self.currentScreen !== 'player') return;
            if (document.hidden) {
                self.player.stop();
            }
            else {
                self.resetScreens();
                self.focusArea = 'home';
                self.setDefaultHomeFocus();
                self.updateFocus();
            }
        });
    }

    /**
     * Check if user has accepted the legal disclaimer
     * @returns {boolean} True if disclaimer was accepted
     */
    markWebHealthy() {
        try {
            if (typeof Android !== 'undefined' && Android && typeof Android.markWebHealthy === 'function') {
                Android.markWebHealthy();
                window.log('INIT', 'web marked healthy');
            }
        }
        catch (ex) { /* ignore */ }
    }

    isDisclaimerAccepted() {
        try {
            return localStorage.getItem('disclaimerAccepted') === 'true';
        }
        catch (e) { return false; }
    }

    startApp() {
        var self = this;
        if (!this.isIPTVConfigured()) {
            this.showWelcomeDemo();
        }
        else {
            this._autoJumpPending = true;
            this.loadAllPlaylistCacheTimestamps().then(function() {
                self.renderPlaylistSelector();
                self.startPlaylistAgeTimer();
                self.setDefaultHomeFocus();
                self.autoConnect();
                if (Premium.shouldShowReminder()) {
                    setTimeout(function() {
                        Premium.showReminder();
                    }, 3000);
                }
            });
        }
    }

    startPlaylistAgeTimer() {
        var self = this;
        if (this._playlistAgeTimer) clearInterval(this._playlistAgeTimer);
        this._playlistAgeTimer = setInterval(function() {
            self.renderPlaylistSelector();
        }, 60000);
    }

    renderPlaylistSelector() {
        var self = this;
        var container = document.getElementById('playlist-selector');
        var playlists = this.settings.playlists || [];
        var visiblePlaylists = playlists.filter(function(p) { return p.showOnHome !== false; });
        var providerAgeEl = document.getElementById('home-provider-age');
        if (visiblePlaylists.length < 2) {
            this.setHidden(container, true);
            container.innerHTML = '';
            if (providerAgeEl && visiblePlaylists.length === 1) {
                var ts = (this.playlistCacheTimestamps || {})[visiblePlaylists[0].id];
                if (ts) {
                    while (providerAgeEl.firstChild) providerAgeEl.removeChild(providerAgeEl.firstChild);
                    var icon = document.createElement('span');
                    icon.className = 'material-symbols-outlined';
                    icon.textContent = 'schedule';
                    providerAgeEl.appendChild(icon);
                    providerAgeEl.appendChild(document.createTextNode(' ' + formatTimeAgo(ts)));
                    this.setHidden(providerAgeEl, false);
                } else {
                    this.setHidden(providerAgeEl, true);
                }
            } else if (providerAgeEl) {
                this.setHidden(providerAgeEl, true);
            }
            return;
        }
        if (providerAgeEl) {
            var activeTs = (this.playlistCacheTimestamps || {})[this.settings.activePlaylistId];
            if (activeTs) {
                while (providerAgeEl.firstChild) providerAgeEl.removeChild(providerAgeEl.firstChild);
                var ageIcon = document.createElement('span');
                ageIcon.className = 'material-symbols-outlined';
                ageIcon.textContent = 'schedule';
                providerAgeEl.appendChild(ageIcon);
                providerAgeEl.appendChild(document.createTextNode(' ' + formatTimeAgo(activeTs)));
                this.setHidden(providerAgeEl, false);
            } else {
                this.setHidden(providerAgeEl, true);
            }
        }
        this.setHidden(container, false);
        container.innerHTML = '';
        var activeId = this.settings.activePlaylistId;
        var timestamps = this.playlistCacheTimestamps || {};
        visiblePlaylists.forEach(function(p) {
            var tab = document.createElement('div');
            tab.className = 'playlist-tab focusable' + (self.sameId(p.id, activeId) ? ' active' : '');
            tab.dataset.playlistId = p.id;
            var nameSpan = document.createElement('span');
            nameSpan.className = 'playlist-name';
            nameSpan.textContent = p.name || I18n.t('settings.playlistDefault', 'Playlist ' + p.id, { id: p.id });
            tab.appendChild(nameSpan);
            container.appendChild(tab);
        });
        this.invalidateFocusables();
    }

    switchPlaylist(playlistId) {
        this.settings.activePlaylistId = playlistId;
        this.saveSettings();
        this.data = {
            live: { categories: [], streams: [] },
            vod: { categories: [], streams: [] },
            series: { categories: [], streams: [] }
        };
        this._forceRefresh = true;
        this.renderPlaylistSelector();
        this.autoConnect();
        this.focusArea = 'home';
        this.setDefaultHomeFocus();
        this.updateFocus();
    }

    initAPIs() {
        TMDB.setApiKey(this.settings.tmdbApiKey);
        if (typeof OpenSubtitles !== 'undefined') {
            OpenSubtitles.setApiKey(this.settings.openSubtitlesApiKey);
        }
        if (typeof SubDL !== 'undefined') {
            SubDL.setApiKey(this.settings.subDLApiKey);
        }
        window.log('INIT', 'APIs TMDB=' + TMDB.isEnabled() + ' OpenSub=' + (typeof OpenSubtitles !== 'undefined' && OpenSubtitles.isEnabled()) + ' SubDL=' + (typeof SubDL !== 'undefined' && SubDL.isEnabled()));
    }

    isIPTVConfigured() {
        return this.getActivePlaylist() !== null;
    }

    getActivePlaylist() {
        if (!this.settings.playlists || this.settings.playlists.length === 0) {
            return null;
        }
        if (this.settings.activePlaylistId) {
            for (var i = 0; i < this.settings.playlists.length; i++) {
                if (this.sameId(this.settings.playlists[i].id, this.settings.activePlaylistId)) {
                    return this.settings.playlists[i];
                }
            }
        }
        // Return first playlist if active not found
        return this.settings.playlists[0];
    }

    getPlaylistById(playlistId) {
        if (!playlistId || !this.settings.playlists) return null;
        for (var i = 0; i < this.settings.playlists.length; i++) {
            if (this.sameId(this.settings.playlists[i].id, playlistId)) {
                return this.settings.playlists[i];
            }
        }
        return null;
    }

    buildStreamUrl(playlist, streamId, type, extension) {
        if (!playlist || playlist.type !== 'provider') return null;
        var ext = extension || 'mkv';
        var server = playlist.serverUrl;
        var user = playlist.username;
        var pass = playlist.password;
        if (type === 'vod') {
            return server + '/movie/' + user + '/' + pass + '/' + streamId + '.' + ext;
        }
        else if (type === 'series' || type === 'episode') {
            return server + '/series/' + user + '/' + pass + '/' + streamId + '.' + ext;
        }
        else if (type === 'live') {
            return server + '/live/' + user + '/' + pass + '/' + streamId + '.' + (extension || 'ts');
        }
        return null;
    }

    getNextPlaylistId() {
        var maxId = 0;
        for (var i = 0; i < this.settings.playlists.length; i++) {
            if (this.settings.playlists[i].id > maxId) {
                maxId = this.settings.playlists[i].id;
            }
        }
        return maxId + 1;
    }

    showWelcomeDemo() {
        var self = this;
        this.showConfirmModal(I18n.t('welcome.demoMessage', 'Would you like to try a demo playlist adapted to your location?'), function() {
            self.addDemoPlaylist();
        }, {
            title: I18n.t('welcome.demoTitle', 'Welcome to Free IPTV'),
            yesLabel: I18n.t('welcome.demoYes', 'Yes, try demo'),
            noLabel: I18n.t('welcome.demoNo', 'No, configure manually'),
            focusYes: true,
            noAction: function() {
                self.showSettings();
            }
        });
    }

    addDemoPlaylist() {
        var playlist = {
            id: this.getNextPlaylistId(),
            name: I18n.t('welcome.demoName', 'Free IPTV Demo'),
            type: 'm3u',
            url: 'https://iptv.blanquer.org/playlist.m3u'
        };
        this.settings.playlists.push(playlist);
        this.settings.activePlaylistId = playlist.id;
        this.saveSettings();
        this.showScreen('home');
        this.currentScreen = 'home';
        this.focusArea = 'home';
        this.startApp();
    }

    autoConnect() {
        var self = this;
        var playlists = this.settings.playlists || [];
        var isMergeMode = !this.settings.activePlaylistId && playlists.length >= 2;
        if (isMergeMode) {
            this._connectingPlaylistId = 'merge';
            this.autoConnectMerge(playlists);
            return;
        }
        var playlist = this.getActivePlaylist();
        if (!playlist) {
            window.log('INIT', 'autoConnect: no playlist');
            this.updateHomeMenuVisibility();
            return;
        }
        this._connectingPlaylistId = playlist.id;
        window.log('INIT', 'autoConnect: ' + playlist.type + ' ' + (playlist.name || playlist.serverUrl || playlist.url));
        this.showLoadingBackdrop();
        this.showLoading(true, I18n.t('loading.connecting', 'Connecting...'));
        var loadingTimeout = setTimeout(function() {
            window.log('HTTP', 'autoConnect: timeout');
            document.getElementById('home-grid').style.visibility = '';
            self.showLoading(false);
        }, 10000);
        var done = function() {
            clearTimeout(loadingTimeout);
            self.showLoading(false);
        };
        if (playlist.type === 'provider') {
            this.api = new ProviderAPI(playlist.serverUrl, playlist.username, playlist.password, this.getStreamProxyUrl());
            this.api.playlistId = playlist.id;
            this.loadProviderCache(playlist.id).then(function(providerCache) {
                if (self._connectingPlaylistId !== playlist.id) {
                    window.log('CACHE', 'autoConnect: aborted, playlist changed');
                    return;
                }
                window.log('CACHE', 'loadProviderCache result: ' + (providerCache ? 'found, keys=' + Object.keys(providerCache).join(',') : 'null'));
                if (providerCache && providerCache.vod) {
                    window.log('CACHE', 'providerCache.vod.categories: ' + (providerCache.vod.categories ? providerCache.vod.categories.length : 'null'));
                }
                var hasValidCache = providerCache && providerCache.vod &&
                    providerCache.vod.categories && providerCache.vod.categories.length > 0 &&
                    providerCache.vod.streams && providerCache.vod.streams.length > 0;
                if (hasValidCache) {
                    window.log('CACHE', 'autoConnect: using provider cache for ' + playlist.id);
                    var cacheTs = providerCache._cacheTimestamp || Date.now();
                    self.providerCacheInfo = {
                        source: providerCache._cacheSource || 'cache',
                        timestamp: cacheTs
                    };
                    self.playlistCacheTimestamps = self.playlistCacheTimestamps || {};
                    self.playlistCacheTimestamps[playlist.id] = cacheTs;
                    // Restore cached data to API memory cache
                    var tagPlaylistId = function(arr) {
                        if (!arr) return;
                        for (var ti = 0; ti < arr.length; ti++) {
                            if (!arr[ti]._playlistId) arr[ti]._playlistId = playlist.id;
                        }
                    };
                    if (providerCache.vod) {
                        self.api.cache.vodCategories = providerCache.vod.categories;
                        tagPlaylistId(self.api.cache.vodCategories);
                        self.api.cache.vodStreams['_all'] = providerCache.vod.streams || [];
                        tagPlaylistId(self.api.cache.vodStreams['_all']);
                    }
                    if (providerCache.series) {
                        self.api.cache.seriesCategories = providerCache.series.categories;
                        tagPlaylistId(self.api.cache.seriesCategories);
                        self.api.cache.series['_all'] = providerCache.series.streams || [];
                        tagPlaylistId(self.api.cache.series['_all']);
                    }
                    if (providerCache.live) {
                        self.api.cache.liveCategories = providerCache.live.categories;
                        tagPlaylistId(self.api.cache.liveCategories);
                        self.api.cache.liveStreams['_all'] = providerCache.live.streams || [];
                        tagPlaylistId(self.api.cache.liveStreams['_all']);
                    }
                    self._cacheFingerprints = self._cacheFingerprints || {};
                    self._cacheFingerprints[playlist.id] = self._computeCacheFingerprint(self.api.cache);
                    window.log('CACHE', 'autoConnect: using cache, skipping auth');
                    self.detectLanguages(providerCache.vod.categories);
                    self.updateHomeMenuVisibility();
                    // Save backdrop images from cache data (for next launch)
                    self.saveBackdropImages();
                    clearTimeout(loadingTimeout);
                    document.getElementById('home-grid').style.visibility = '';
                    self.showLoading(false);
                    if (providerCache._needsRefresh || self._forceRefresh) {
                        self._forceRefresh = false;
                        setTimeout(function() {
                            self.refreshProviderCacheBackground(playlist.id);
                        }, 2000);
                    }
                    self.startCacheRefreshTimer(playlist.id);
                }
                else {
                    self.api.authenticate().then(function() {
                        window.log('INIT', 'autoConnect: authenticated');
                        return self.api.getVodCategories();
                    }).then(function(categories) {
                        window.log('INIT', 'autoConnect: got ' + categories.length + ' categories');
                        self.detectLanguages(categories);
                        self.updateHomeMenuVisibility();
                        clearTimeout(loadingTimeout);
                        self.cacheLoading = true;
                        self.api.preloadCache(function(step, total, name) {
                            self.updateCacheStatus(step, total, name);
                            if (step === -1) {
                                document.getElementById('home-grid').style.visibility = '';
                                self.showLoading(false);
                                var loadingText = I18n.t('home.cacheLoading', 'Loading {name}...', { step: '', total: '', name: name }).replace(/\s*\(\/\)/, '').replace('...', '');
                                self.showToast(I18n.t('app.timeout', 'Timeout') + ' ' + loadingText, 5000, true);
                            }
                            else if (step === 0) {
                                // Filter cache by language setting
                                self.api.filterCacheByLanguage(function(catName) {
                                    return self.matchesLanguage(catName);
                                });
                                self.cacheLoading = false;
                                var tagPlaylistId2 = function(arr) {
                                    if (!arr) return;
                                    for (var ti = 0; ti < arr.length; ti++) {
                                        if (!arr[ti]._playlistId) arr[ti]._playlistId = playlist.id;
                                    }
                                };
                                tagPlaylistId2(self.api.cache.vodCategories);
                                tagPlaylistId2(self.api.cache.seriesCategories);
                                tagPlaylistId2(self.api.cache.liveCategories);
                                tagPlaylistId2(self.api.cache.vodStreams['_all']);
                                tagPlaylistId2(self.api.cache.series['_all']);
                                tagPlaylistId2(self.api.cache.liveStreams['_all']);
                                // Save filtered data to IndexedDB cache
                                var cacheData = {
                                    vod: {
                                        categories: self.api.cache.vodCategories,
                                        streams: self.api.cache.vodStreams['_all']
                                    },
                                    series: {
                                        categories: self.api.cache.seriesCategories,
                                        streams: self.api.cache.series['_all']
                                    },
                                    live: {
                                        categories: self.api.cache.liveCategories,
                                        streams: self.api.cache.liveStreams['_all']
                                    }
                                };
                                self._cacheFingerprints = self._cacheFingerprints || {};
                                self._cacheFingerprints[playlist.id] = self._computeCacheFingerprint(self.api.cache);
                                var now = Date.now();
                                self.providerCacheInfo = {
                                    source: 'provider',
                                    timestamp: now
                                };
                                self.playlistCacheTimestamps = self.playlistCacheTimestamps || {};
                                self.playlistCacheTimestamps[playlist.id] = now;
                                var hasVodData = cacheData.vod.categories && cacheData.vod.categories.length > 0 &&
                                    cacheData.vod.streams && cacheData.vod.streams.length > 0;
                                if (hasVodData) {
                                    self.saveProviderCache(playlist.id, cacheData);
                                }
                                else {
                                    window.log('CACHE', 'not saving empty cache (categories=' + (cacheData.vod.categories ? cacheData.vod.categories.length : 0) + ', streams=' + (cacheData.vod.streams ? cacheData.vod.streams.length : 0) + ')');
                                }
                                self.saveBackdropImages();
                                document.getElementById('home-grid').style.visibility = '';
                                self.showLoading(false);
                                self.startCacheRefreshTimer(playlist.id);
                            }
                        });
                    }).catch(function(err) {
                        window.log('ERROR', 'autoConnect provider: ' + (err ? err.message || err : 'unknown'));
                        self.updateHomeMenuVisibility();
                        document.getElementById('home-grid').style.visibility = '';
                        done();
                    });
                }
            });
        }
        else if (playlist.type === 'm3u') {
            this.loadM3UPlaylist(playlist.url).then(function() {
                window.log('INIT', 'autoConnect: M3U loaded');
                self.updateHomeMenuVisibility();
                document.getElementById('home-grid').style.visibility = '';
                done();
            }).catch(function(err) {
                var errMsg = err ? (err.message || err.toString()) : 'Unknown error';
                window.log('ERROR', 'autoConnect M3U: ' + errMsg);
                self.updateHomeMenuVisibility();
                document.getElementById('home-grid').style.visibility = '';
                done();
            });
        }
        else {
            done();
        }
    }

    autoConnectMerge(playlists) {
        var self = this;
        window.log('INIT', 'autoConnectMerge: ' + playlists.length + ' playlists');
        this.showLoadingBackdrop();
        this.showLoading(true, I18n.t('loading.mergingPlaylists', 'Merging playlists...'));
        this.apis = [];
        var providerPlaylists = playlists.filter(function(p) { return p.type === 'provider'; });
        // Check if we have cached data - if so, skip authentication
        this.loadProviderCache('merged').then(function(mergedCache) {
            if (mergedCache && mergedCache.vod && mergedCache.vod.categories) {
                window.log('CACHE', 'autoConnectMerge: using cache, skipping auth for ' + providerPlaylists.length + ' providers');
                var cacheTs = mergedCache._cacheTimestamp || Date.now();
                self.providerCacheInfo = {
                    source: mergedCache._cacheSource || 'cache',
                    timestamp: cacheTs
                };
                self.playlistCacheTimestamps = self.playlistCacheTimestamps || {};
                providerPlaylists.forEach(function(p) {
                    self.playlistCacheTimestamps[p.id] = cacheTs;
                });
                // Create APIs without authentication (for later use if needed)
                providerPlaylists.forEach(function(p) {
                    var api = new ProviderAPI(p.serverUrl, p.username, p.password, self.getStreamProxyUrl());
                    api.playlistId = p.id;
                    self.apis.push(api);
                });
                if (self.apis.length > 0) {
                    self.api = self.apis[0];
                }
                self.updateHomeMenuVisibility();
                document.getElementById('home-grid').style.visibility = '';
                self.showLoading(false);
                // Trigger background refresh for stale providers (delayed to not block UI)
                if (mergedCache._needsRefreshIds && mergedCache._needsRefreshIds.length > 0) {
                    setTimeout(function() {
                        window.log('CACHE', 'autoConnectMerge: triggering background refresh for ' + mergedCache._needsRefreshIds.length + ' providers');
                        mergedCache._needsRefreshIds.forEach(function(playlistId) {
                            self.refreshProviderCacheBackground(playlistId);
                        });
                    }, 5000);
                }
                self.startCacheRefreshTimer(providerPlaylists);
            }
            else {
                // No cache - authenticate all providers
                var promises = providerPlaylists.map(function(p) {
                    var api = new ProviderAPI(p.serverUrl, p.username, p.password, self.getStreamProxyUrl());
                    api.playlistId = p.id;
                    return api.authenticate().then(function() {
                        self.apis.push(api);
                        return api;
                    }).catch(function(err) {
                        window.log('ERROR', 'autoConnectMerge: failed ' + p.name + ': ' + (err ? err.message : 'unknown'));
                        return null;
                    });
                });
                Promise.all(promises).then(function() {
                    window.log('INIT', 'autoConnectMerge: connected to ' + self.apis.length + ' providers');
                    if (self.apis.length > 0) {
                        self.api = self.apis[0];
                    }
                    var now = Date.now();
                    self.providerCacheInfo = {
                        source: 'provider',
                        timestamp: now
                    };
                    self.playlistCacheTimestamps = self.playlistCacheTimestamps || {};
                    providerPlaylists.forEach(function(p) {
                        self.playlistCacheTimestamps[p.id] = now;
                    });
                    self.updateHomeMenuVisibility();
                    document.getElementById('home-grid').style.visibility = '';
                    self.showLoading(false);
                    self.startCacheRefreshTimer(providerPlaylists);
                });
            }
        });
    }


    showTntInGrid() {
        var container = document.getElementById('content-grid');
        container.innerHTML = '';
        var section = this.currentSection;
        if (section !== 'live') return;
        var allStreams = this.getStreams('live');
        var tntChannels = I18n.getTntChannels();
        var tntStreams = this.getTntStreams(allStreams, tntChannels);
        // Update category selection
        document.querySelectorAll('.category-item').forEach(function(item) {
            item.classList.toggle('selected', item.dataset.categoryId === 'tnt');
        });
        // Apply saved view mode for TNT (default: list)
        var viewModes = this.settings.viewMode;
        if (!viewModes || Array.isArray(viewModes)) {
            viewModes = {};
            this.settings.viewMode = viewModes;
        }
        var viewMode = viewModes['tnt'] || 'list';
        container.classList.toggle('list-view', viewMode === 'list');
        document.querySelectorAll('.view-btn').forEach(function(btn) {
            btn.classList.toggle('selected', btn.dataset.view === viewMode);
        });
        if (tntStreams.length === 0) {
            this.showEmptyMessage(container, 'errors.noData', 'No data');
            return;
        }
        if (this.api && this.api.getEPG) {
            var guideCard = document.createElement('div');
            guideCard.className = 'grid-item guide-card';
            guideCard.dataset.categoryId = 'guide';
            var guideIcon = document.createElement('div');
            guideIcon.className = 'guide-icon';
            guideIcon.textContent = '\uD83D\uDCC5';
            var guideTitle = document.createElement('div');
            guideTitle.className = 'grid-title';
            guideTitle.textContent = I18n.t('home.tvGuide', 'TV Guide');
            guideCard.appendChild(guideIcon);
            guideCard.appendChild(guideTitle);
            container.appendChild(guideCard);
        }
        this.originalStreams = tntStreams;
        this.currentStreams = tntStreams;
        this.currentStreamType = 'live';
        // Save for channel switching
        this.liveChannelList = tntStreams;
        this.displayedCount = 0;
        this.loadMoreItems();
    }

    _startFreeboxPollingIfActive(downloads, label) {
        var active = downloads.filter(function(d) {
            return d.status === 'downloading' || d.status === 'queued' || d.status === 'stopped';
        });
        if (active.length > 0) {
            window.log('INIT', label + ': found ' + active.length + ' active downloads, starting polling');
            this.ensureFreeboxPolling();
        }
    }

    initFreebox() {
        this.loadFreeboxMaps();
        if (this.canAndroidLocalDownload && this.canAndroidLocalDownload()) {
            var androidCount = Object.keys(this._androidDownloadMap || {}).length;
            window.log('INIT', 'Android local download available, pending=' + androidCount);
            if (androidCount > 0) {
                this.ensureAndroidPolling();
                this.updateHomeDownloadButton();
            }
        }
        var viaVm = this.settings.freeboxDownloadViaProxy && this.settings.proxyEnabled && this.settings.proxyUrl;
        if (this.settings.freeboxEnabled && (viaVm || this.settings.freeboxAppToken)) {
            var self = this;
            if (!viaVm) {
                var host = this.settings.freeboxHost || 'mafreebox.freebox.fr';
                FreeboxAPI.setConfig(host, this.settings.freeboxAppToken);
            }
            window.log('INIT', 'Freebox configured: viaVm=' + viaVm + ' maps=' + Object.keys(this._freeboxDownloadMap || {}).length);
            if (viaVm) {
                var staleCount = Object.keys(this._freeboxDownloadMap || {}).length;
                if (staleCount > 0) {
                    this._freeboxDownloadMap = {};
                    this._freeboxDownloadProviderMap = {};
                    this._freeboxDownloadPosterMap = {};
                    this.saveFreeboxMaps();
                    window.log('INIT', 'VM mode: cleared ' + staleCount + ' dlMap entries pending /downloads check');
                }
                this.updateHomeDownloadButton();
                var baseProxy = this.settings.proxyUrl.replace(/\/+$/, '');
                var xhr = new XMLHttpRequest();
                xhr.open('GET', baseProxy + '/downloads' + '?' + proxyDuidParam().replace(/^&/, ''), true);
                xhr.timeout = 3000;
                xhr.onload = function() {
                    try {
                        var resp = JSON.parse(xhr.responseText);
                        var vmList = resp.success && resp.result || [];
                        window.log('INIT', 'VM /downloads response: ' + vmList.length + ' items');
                        self._startFreeboxPollingIfActive(vmList, 'VM');
                        self.updateHomeDownloadButton();
                    } catch (ex) {
                        window.log('INIT', 'VM /downloads parse error: ' + (ex.message || ex));
                    }
                };
                xhr.onerror = function() { window.log('INIT', 'VM /downloads network error'); };
                xhr.ontimeout = function() { window.log('INIT', 'VM /downloads timeout'); };
                xhr.send();
            }
            else {
                FreeboxAPI.getDownloads().then(function(downloads) {
                    var downloadsById = {};
                    for (var k = 0; k < downloads.length; k++) {
                        downloadsById[downloads[k].id] = downloads[k];
                    }
                    self.cleanupDownloadMap(downloadsById);
                    self._startFreeboxPollingIfActive(downloads, 'Freebox');
                    self.updateHomeDownloadButton();
                }).catch(function(err) {
                    window.log('INIT', 'Freebox: could not check downloads: ' + err.message);
                });
            }
        }
    }

    saveFreeboxMaps() {
        try {
            localStorage.setItem('freeboxDownloadMap', JSON.stringify(this._freeboxDownloadMap || {}));
            localStorage.setItem('freeboxProviderMap', JSON.stringify(this._freeboxDownloadProviderMap || {}));
            localStorage.setItem('freeboxDownloadQueue', JSON.stringify(this._freeboxDownloadQueue || []));
            localStorage.setItem('freeboxPosterMap', JSON.stringify(this._freeboxDownloadPosterMap || {}));
            localStorage.setItem('freeboxSeriesMap', JSON.stringify(this._freeboxDownloadSeriesMap || {}));
            localStorage.setItem('androidDownloadMap', JSON.stringify(this._androidDownloadMap || {}));
        } catch (ex) {}
    }

    loadFreeboxMaps() {
        try {
            var dlMap = localStorage.getItem('freeboxDownloadMap');
            var provMap = localStorage.getItem('freeboxProviderMap');
            var queue = localStorage.getItem('freeboxDownloadQueue');
            var posterMap = localStorage.getItem('freeboxPosterMap');
            var seriesMap = localStorage.getItem('freeboxSeriesMap');
            var androidMap = localStorage.getItem('androidDownloadMap');
            this._freeboxDownloadMap = dlMap ? JSON.parse(dlMap) : {};
            this._freeboxDownloadProviderMap = provMap ? JSON.parse(provMap) : {};
            this._freeboxDownloadQueue = queue ? JSON.parse(queue) : [];
            this._freeboxDownloadPosterMap = posterMap ? JSON.parse(posterMap) : {};
            this._freeboxDownloadSeriesMap = seriesMap ? JSON.parse(seriesMap) : {};
            this._androidDownloadMap = androidMap ? JSON.parse(androidMap) : {};
        } catch (ex) {
            this._freeboxDownloadMap = {};
            this._freeboxDownloadProviderMap = {};
            this._freeboxDownloadQueue = [];
            this._freeboxDownloadPosterMap = {};
            this._freeboxDownloadSeriesMap = {};
            this._androidDownloadMap = {};
        }
    }

    getMaxConnections(playlistId) {
        var api = this.api;
        if (playlistId && this.apis && this.apis.length > 1) {
            for (var i = 0; i < this.apis.length; i++) {
                if (this.sameId(this.apis[i].playlistId, playlistId)) {
                    api = this.apis[i];
                    break;
                }
            }
        }
        if (!api || !api.authData || !api.authData.user_info) return 1;
        return api.authData.user_info.max_connections || 1;
    }

    getActiveStreamCount(playlistId) {
        var count = 0;
        var downloads = FreeboxAPI.getActiveDownloads();
        var providerMap = this._freeboxDownloadProviderMap || {};
        var keys = Object.keys(downloads);
        for (var i = 0; i < keys.length; i++) {
            if (downloads[keys[i]].status === 'downloading' && (this._freeboxDownloadMap || {})[downloads[keys[i]].id]) {
                var dlPlaylistId = providerMap[downloads[keys[i]].id];
                if (!playlistId || !dlPlaylistId || this.sameId(dlPlaylistId, playlistId)) {
                    count++;
                }
            }
        }
        if (this.currentPlayingStream) {
            var streamPlaylistId = this.currentPlayingStream._playlistId || this.settings.activePlaylistId;
            if (!playlistId || !streamPlaylistId || this.sameId(streamPlaylistId, playlistId)) {
                count++;
            }
        }
        return count;
    }

    changeChannel(direction) {
        window.log('ACTION', 'changeChannel: ' + (direction > 0 ? 'next' : 'prev'));
        // Find current stream in the list
        var currentStream = this.currentPlayingStream;
        if (!currentStream) {
            window.log('PLAYER', 'changeChannel: no currentPlayingStream');
            return;
        }
        var currentId = this.getStreamId(currentStream);
        window.log('PLAYER', 'changeChannel: currentId=' + currentId + ' type=' + typeof currentId);
        // Use saved live channel list, or current streams as fallback
        var streams = this.liveChannelList || this.currentStreams || [];
        window.log('PLAYER', 'changeChannel: liveChannelList=' + (this.liveChannelList ? this.liveChannelList.length : 'null') + ' currentStreams=' + (this.currentStreams ? this.currentStreams.length : 'null'));
        if (streams.length === 0) {
            window.log('PLAYER', 'changeChannel: no streams in list');
            return;
        }
        var currentIndex = -1;
        for (var i = 0; i < streams.length; i++) {
            if (this.sameId(this.getStreamId(streams[i]), currentId)) {
                currentIndex = i;
                break;
            }
        }
        if (currentIndex === -1) {
            window.log('PLAYER', 'changeChannel: current stream not found in list (id=' + currentId + ', list=' + streams.length + ')');
            return;
        }
        // Calculate next index (wrap around)
        var nextIndex = currentIndex + direction;
        if (nextIndex < 0) nextIndex = streams.length - 1;
        if (nextIndex >= streams.length) nextIndex = 0;
        var nextStream = streams[nextIndex];
        var streamId = this.getStreamId(nextStream);
        var streamName = this.getStreamTitle(nextStream);
        window.log('PLAYER', 'Channel change: ' + direction + ', playing ' + streamName);
        this.playStream(streamId, 'live', nextStream);
    }


    showWebUpdateReady() {
        window.log('WebUpdate pending, will reload when safe');
        this._webUpdatePending = true;
        this._tryApplyWebUpdate();
    }

    onUpdateCheckStarted() {
        if (this._showToast) {
            this._showToast(I18n.t('webUpdate.checking', 'Checking for updates...'));
        }
    }

    onUpdateCheckFinished(hasUpdate) {
        if (hasUpdate) return;
        if (this._showToast) {
            this._showToast(I18n.t('webUpdate.upToDate', 'You are up to date'));
        }
    }

    _tryApplyWebUpdate() {
        if (!this._webUpdatePending) return;
        if (typeof Android === 'undefined' || !Android.reloadWebAssets) return;
        if (this.currentScreen === 'player') return;
        if (this.player && typeof this.player.isPlaying === 'function' && this.player.isPlaying()) return;
        window.log('WebUpdate applying now (screen=' + this.currentScreen + ')');
        this._webUpdatePending = false;
        try { Android.reloadWebAssets(); }
        catch (ex) { window.log('ERROR reloadWebAssets: ' + (ex.message || ex)); }
    }

    checkPendingApkUpdate() {
        if (typeof Android === 'undefined' || !Android || !Android.getRemoteApkVersion) return;
        var self = this;
        setTimeout(function() {
            try {
                var remoteVersion = Android.getRemoteApkVersion();
                if (remoteVersion > 0) {
                    var localVersion = 0;
                    try {
                        var v = Android.getAppVersion() || '';
                        var m = v.match(/\((\d+)\)/);
                        if (m) localVersion = parseInt(m[1], 10);
                    }
                    catch (ex) {}
                    if (remoteVersion > localVersion) {
                        self.showApkUpdatePrompt(remoteVersion);
                    }
                }
            }
            catch (ex) {}
        }, 3000);
    }

    showApkUpdatePrompt(remoteVersion) {
        this._apkUpdateAvailable = remoteVersion;
        this.updateSettingsUpdateButton();
        if (this._apkUpdatePromptShown) return;
        this._apkUpdatePromptShown = true;
        var existingToast = document.getElementById('toast-message');
        if (existingToast) existingToast.remove();
        var self = this;
        var currentVersion = 0;
        try {
            if (typeof Android !== 'undefined' && Android.getAppVersion) {
                var v = Android.getAppVersion() || '';
                var m = v.match(/\((\d+)\)/);
                if (m) currentVersion = parseInt(m[1], 10);
            }
        }
        catch (ex) {}
        var message = I18n.t('apkUpdate.message', 'A new version of the app is available. Install now?', {
            current: currentVersion,
            remote: remoteVersion
        });
        this.showConfirmModal(message, function() {
            self.startApkDownload();
        }, {
            title: I18n.t('apkUpdate.title', 'Update available'),
            yesLabel: I18n.t('apkUpdate.install', 'Install'),
            noLabel: I18n.t('apkUpdate.later', 'Later'),
            focusYes: true
        });
    }

    startApkDownload() {
        if (typeof Android === 'undefined' || !Android.downloadAndInstallApk) return;
        if (Android.canInstallPackages && !Android.canInstallPackages()) {
            var self = this;
            this.showConfirmModal(
                I18n.t('apkUpdate.permissionNeeded', 'Allow installation of unknown apps, then come back and try again.'),
                function() {
                    if (Android.requestInstallPermission) Android.requestInstallPermission();
                },
                {
                    title: I18n.t('apkUpdate.permissionTitle', 'Permission required'),
                    yesLabel: I18n.t('apkUpdate.openSettings', 'Open settings'),
                    noLabel: I18n.t('apkUpdate.later', 'Later'),
                    focusYes: true
                }
            );
            return;
        }
        this._showApkDownloadToast(0);
        try { Android.downloadAndInstallApk(); }
        catch (ex) { window.log('ERROR startApkDownload: ' + (ex.message || ex)); }
    }

    updateApkDownloadProgress(percent) {
        this._showApkDownloadToast(percent);
    }

    onApkDownloadReady() {
        this._hideApkDownloadToast();
    }

    onApkDownloadError(message) {
        this._hideApkDownloadToast();
        window.log('ERROR ApkDownload: ' + message);
        if (this._showToast) {
            this._showToast(I18n.t('apkUpdate.downloadError', 'Download failed: {msg}', { msg: message }));
        }
    }

    _showApkDownloadToast(percent) {
        var el = document.getElementById('apk-download-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'apk-download-toast';
            el.className = 'apk-download-toast';
            document.body.appendChild(el);
        }
        el.textContent = I18n.t('apkUpdate.downloading', 'Downloading update... {percent}%', { percent: percent });
        el.style.display = 'block';
    }

    _hideApkDownloadToast() {
        var el = document.getElementById('apk-download-toast');
        if (el) el.style.display = 'none';
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    window.app = new IPTVApp();
    window.app.init();
    window.focus();
    var resetScroll = function() {
        if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
        if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
    };
    document.addEventListener('scroll', resetScroll, true);
    window.addEventListener('scroll', resetScroll, true);
    var progress = document.getElementById('player-progress');
    if (progress) {
        progress.addEventListener('click', function(e) {
            if (!window.app || !window.app.player) return;
            if (window.app.currentPlayingType === 'live') return;
            var rect = progress.getBoundingClientRect();
            var percent = (e.clientX - rect.left) / rect.width;
            if (percent < 0) percent = 0;
            if (percent > 1) percent = 1;
            var duration = window.app.player.duration || 0;
            if (duration > 0) {
                var seekMs = Math.round(percent * duration);
                window.app.seekTargetPosition = seekMs;
                window.app.player.seekTo(seekMs);
                window.app.showPlayerOverlay();
            }
        });
    }
});
