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
        this.focusIndex = 0;
        this.focusArea = 'home'; // langBtn, home, lang, sidebar, filters, grid, details, player
        this.currentSort = 'default';
        this.searchTitle = '';
        this.searchYear = '';
        this.originalStreams = [];
        this.settings = this.loadSettings();
        this.hideSD = this.settings.hideSD;
        this.hideSM = this.settings.hideHearingImpaired;
        this.subtitleSize = this.settings.subtitleSize;
        this.subtitleStyle = this.settings.subtitleStyle;
        this.secureSubtitles = this.settings.secureSubtitles === true || this.settings.secureSubtitles === 'true';
        this.watchHistory = this.loadWatchHistory();
        this.episodeProgress = this.loadEpisodeProgress();
        this.seriesProgress = this.loadSeriesProgress();
        this.favorites = this.loadFavorites();
        this.tmdbCache = this.loadTMDBCache();
        this.data = {
            live: { categories: [], streams: [] },
            vod: { categories: [], streams: [] },
            series: { categories: [], streams: [] }
        };
        this.cacheLoading = false;
        this.gridColumns = 4;
        this.overlayTimer = null;
        this.selectedStream = null;
        this.currentStreams = [];
        this.currentStreamType = '';
        this.displayedCount = 0;
        this.itemsPerBatch = 12;
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
            if (textEl) textEl.classList.remove('hidden');
        }
        else {
            el.textContent = I18n.t('home.cacheLoading', 'Loading...', { step: step, total: total, name: name });
            if (textEl) textEl.classList.add('hidden');
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
        window.clearLogs();
        window.log('init deviceId=' + this.deviceId + ' isDevDevice=' + window.isDevDevice());
        this.logMemory('init');
        DevRemoteSync.init();
        if (DevRemoteSync.isDevDevice) {
            // Load remote data async and apply if newer
            DevRemoteSync.load().then(function(remoteData) {
                if (remoteData && DevRemoteSync.applyData(self, remoteData)) {
                    window.log('Remote data applied, refreshing UI');
                    // Refresh locale if changed
                    if (self.settings.locale) {
                        I18n.setLocale(self.settings.locale);
                    }
                    // Refresh other settings-dependent state
                    self.hideSD = self.settings.hideSD;
                    self.hideSM = self.settings.hideHearingImpaired;
                    self.subtitleSize = self.settings.subtitleSize;
                    self.subtitleStyle = self.settings.subtitleStyle;
                    self.secureSubtitles = self.settings.secureSubtitles === true || self.settings.secureSubtitles === 'true';
                    self.initAPIs();
                }
            });
        }
        I18n.init();
        if (this.settings.locale) {
            I18n.setLocale(this.settings.locale);
        }
        this.player.init();
        this.player.setPreferHtml5(this.settings.preferHtml5Player);
        this.player.setDialogueBoost(this.settings.dialogueBoost);
        this.applyTextSize(this.settings.textSize);
        this.preloadBackdropImages();
        this.initAPIs();
        this.resetScreens();
        this.bindKeys();
        this.initFilterEvents();
        this.updateHomeMenuVisibility();
        this.bindDisclaimerButton();
        // Check if disclaimer was accepted
        if (!this.isDisclaimerAccepted()) {
            this.showDisclaimer();
            return;
        }
        this.startApp();
        document.addEventListener('visibilitychange', function() {
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
     * @returns {boolean} True if disclaimer was accepted or if dev device
     */
    isDisclaimerAccepted() {
        // Skip disclaimer for dev device
        if (window.isDevDevice()) {
            return true;
        }
        try {
            return localStorage.getItem('disclaimerAccepted') === 'true';
        }
        catch (e) {
            return false;
        }
    }

    /**
     * Display the legal disclaimer modal and block all input until accepted
     * @returns {void}
     */
    showDisclaimer() {
        var self = this;
        document.getElementById('disclaimer-modal').classList.remove('hidden');
        var btn = document.getElementById('disclaimer-accept-btn');
        if (btn) {
            btn.classList.add('focused');
            btn.focus();
        }
        this.disclaimerKeyHandler = function(e) {
            if (e.keyCode === 13) {
                self.acceptDisclaimer();
            }
            e.preventDefault();
            e.stopPropagation();
        };
        document.addEventListener('keydown', this.disclaimerKeyHandler, true);
    }

    hideDisclaimer() {
        document.getElementById('disclaimer-modal').classList.add('hidden');
        if (this.disclaimerKeyHandler) {
            document.removeEventListener('keydown', this.disclaimerKeyHandler, true);
            this.disclaimerKeyHandler = null;
        }
    }

    bindDisclaimerButton() {
        var self = this;
        var btn = document.getElementById('disclaimer-accept-btn');
        if (btn) {
            btn.addEventListener('click', function() {
                self.acceptDisclaimer();
            });
        }
    }

    acceptDisclaimer() {
        try {
            localStorage.setItem('disclaimerAccepted', 'true');
        }
        catch (e) {}
        this.hideDisclaimer();
        this.startApp();
    }

    startApp() {
        if (!this.isIPTVConfigured()) {
            this.showSettings();
        }
        else {
            this.renderPlaylistSelector();
            this.setDefaultHomeFocus();
            this.updateFocus();
            this.autoConnect();
        }
    }

    renderPlaylistSelector() {
        var self = this;
        var container = document.getElementById('playlist-selector');
        var playlists = this.settings.playlists || [];
        if (playlists.length < 2) {
            container.classList.add('hidden');
            container.innerHTML = '';
            return;
        }
        container.classList.remove('hidden');
        container.innerHTML = '';
        var activeId = this.settings.activePlaylistId;
        playlists.forEach(function(p) {
            var tab = document.createElement('div');
            tab.className = 'playlist-tab focusable' + (String(p.id) === String(activeId) ? ' active' : '');
            tab.dataset.playlistId = p.id;
            tab.textContent = p.name || 'Playlist ' + p.id;
            container.appendChild(tab);
        });
        var mergeTab = document.createElement('div');
        mergeTab.className = 'playlist-tab playlist-tab-merge focusable' + (!activeId ? ' active' : '');
        mergeTab.dataset.playlistId = 'merge';
        mergeTab.textContent = '⚡ ' + I18n.t('settings.mergePlaylists', 'Merge all');
        container.appendChild(mergeTab);
    }

    switchPlaylist(playlistId) {
        if (playlistId === 'merge') {
            this.settings.activePlaylistId = null;
        }
        else {
            this.settings.activePlaylistId = playlistId;
        }
        this.saveSettings();
        this.data = {};
        this.renderPlaylistSelector();
        this.autoConnect();
    }

    resetScreens() {
        var screens = document.querySelectorAll('.screen');
        for (var i = 0; i < screens.length; i++) {
            screens[i].classList.remove('active');
        }
        document.getElementById('home-screen').classList.add('active');
        document.getElementById('player-title').classList.add('hidden');
        document.getElementById('player-top-right').classList.add('hidden');
        document.getElementById('player-overlay').classList.add('hidden');
        this.currentScreen = 'home';
    }

    initAPIs() {
        TMDB.setApiKey(this.settings.tmdbApiKey);
        if (typeof OpenSubtitles !== 'undefined') {
            OpenSubtitles.setApiKey(this.settings.openSubtitlesApiKey);
        }
        if (typeof SubDL !== 'undefined') {
            SubDL.setApiKey(this.settings.subDLApiKey);
        }
        window.log('initAPIs TMDB=' + TMDB.isEnabled() + ' OpenSub=' + (typeof OpenSubtitles !== 'undefined' && OpenSubtitles.isEnabled()) + ' SubDL=' + (typeof SubDL !== 'undefined' && SubDL.isEnabled()));
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
                if (String(this.settings.playlists[i].id) === String(this.settings.activePlaylistId)) {
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
            if (String(this.settings.playlists[i].id) === String(playlistId)) {
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

    updateHomeMenuVisibility() {
        var configured = this.isIPTVConfigured();
        var playlist = this.getActivePlaylist();
        var isM3U = playlist && playlist.type === 'm3u';
        var homeButtons = document.querySelectorAll('#home-grid > .home-btn');
        // Sections only available for Provider (not M3U)
        var providerOnlySections = ['vod', 'series', 'sport', 'manga', 'entertainment', 'history'];
        // Check if pattern-based sections have keywords
        var patterns = this.getCategoryPatterns();
        var hasPatterns = {
            sport: patterns.sport && patterns.sport.length > 0,
            manga: patterns.manga && patterns.manga.length > 0,
            entertainment: this.hasEntertainmentPatterns(patterns.entertainment)
        };
        // Check hidden default categories
        var hiddenCategories = this.settings.hiddenDefaultCategories || [];
        window.log('updateHomeMenuVisibility: hasPatterns=' + JSON.stringify(hasPatterns) + ' hidden=' + JSON.stringify(hiddenCategories));
        for (var i = 0; i < homeButtons.length; i++) {
            var btn = homeButtons[i];
            var section = btn.dataset.section;
            var isHidden = hiddenCategories.indexOf(section) !== -1;
            var noPatterns = hasPatterns.hasOwnProperty(section) && !hasPatterns[section];
            if (section === 'settings') {
                btn.style.display = '';
            } else if (!configured) {
                btn.style.display = 'none';
            } else if (isM3U && providerOnlySections.indexOf(section) !== -1) {
                btn.style.display = 'none';
            } else if (isHidden || noPatterns) {
                btn.style.display = 'none';
            } else {
                btn.style.display = '';
            }
        }
        // Render custom category buttons
        this.renderCustomCategoryButtons(configured, isM3U, patterns);
        this.updateHomeGridLayout();
        // Reset focus if on home screen and current focus is invalid
        if (this.focusArea === 'home') {
            this.clampHomeFocusIndex();
            this.updateFocus();
        }
    }

    renderCategoryIcon(iconData, container) {
        container.innerHTML = '';
        if (typeof iconData === 'object' && iconData.type === 'custom') {
            container.textContent = iconData.text || 'X';
            container.style.color = iconData.color || '#fff';
            container.style.background = iconData.bg || '#000';
            container.style.borderRadius = '16px';
            container.style.width = '80px';
            container.style.height = '80px';
            container.style.fontSize = '40px';
            container.style.fontWeight = 'bold';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
        }
        else {
            container.textContent = iconData || '📁';
            container.style.color = '';
            container.style.background = '';
            container.style.borderRadius = '';
            container.style.width = '';
            container.style.height = '';
            container.style.fontSize = '';
            container.style.fontWeight = '';
            container.style.display = '';
            container.style.alignItems = '';
            container.style.justifyContent = '';
        }
    }

    renderCustomCategoryButtons(configured, isM3U, patterns) {
        var self = this;
        var historyBtn = document.querySelector('#home-grid .home-btn[data-section="history"]');
        if (!historyBtn) return;
        // Remove existing custom buttons
        var existing = document.querySelectorAll('#home-grid .home-btn.custom-category');
        for (var j = 0; j < existing.length; j++) {
            existing[j].remove();
        }
        if (!configured || isM3U) return;
        var customCategories = this.settings.customCategories || [];
        for (var i = 0; i < customCategories.length; i++) {
            var cat = customCategories[i];
            var catPatterns = patterns[cat.id] || cat.keywords || [];
            if (catPatterns.length === 0) continue;
            var btn = document.createElement('div');
            btn.className = 'home-btn focusable custom-category';
            btn.dataset.section = cat.id;
            var icon = document.createElement('div');
            icon.className = 'home-icon';
            self.renderCategoryIcon(cat.icon, icon);
            btn.appendChild(icon);
            var name = document.createElement('span');
            name.textContent = cat.name;
            btn.appendChild(name);
            // Insert before history button (keep History, Settings last)
            historyBtn.parentNode.insertBefore(btn, historyBtn);
        }
    }

    hasEntertainmentPatterns(ent) {
        if (!ent) return false;
        var keys = ['concerts', 'theatre', 'spectacles', 'blindtest', 'karaoke'];
        for (var i = 0; i < keys.length; i++) {
            if (ent[keys[i]] && ent[keys[i]].length > 0) return true;
        }
        return false;
    }

    getHomeGridCols() {
        var visibleCount = document.querySelectorAll('#home-grid .home-btn:not([style*="display: none"])').length;
        if (visibleCount <= 4) return 2;
        if (visibleCount <= 9) return 3;
        if (visibleCount <= 16) return 4;
        if (visibleCount <= 25) return 5;
        if (visibleCount <= 36) return 6;
        if (visibleCount <= 49) return 7;
        return 8;
    }

    updateHomeGridLayout() {
        var grid = document.getElementById('home-grid');
        var cols = this.getHomeGridCols();
        grid.classList.remove('cols-2', 'cols-3', 'cols-4', 'cols-5', 'cols-6', 'cols-7', 'cols-8');
        grid.classList.add('cols-' + cols);
    }

    clampHomeFocusIndex() {
        var focusables = this.getFocusables();
        var totalCount = focusables.length;
        if (this.focusIndex >= totalCount) {
            this.focusIndex = Math.max(0, totalCount - 1);
        }
    }

    getHomeLiveButtonIndex() {
        var focusables = this.getFocusables();
        for (var i = 0; i < focusables.length; i++) {
            if (focusables[i].dataset && focusables[i].dataset.section === 'live') {
                return i;
            }
        }
        return 0;
    }

    setDefaultHomeFocus() {
        if (this.focusArea === 'home') {
            this.focusIndex = this.getHomeLiveButtonIndex();
        }
    }

    autoConnect() {
        var self = this;
        var playlists = this.settings.playlists || [];
        var isMergeMode = !this.settings.activePlaylistId && playlists.length >= 2;
        if (isMergeMode) {
            this.autoConnectMerge(playlists);
            return;
        }
        var playlist = this.getActivePlaylist();
        if (!playlist) {
            window.log('autoConnect: no playlist');
            this.updateHomeMenuVisibility();
            return;
        }
        window.log('autoConnect: ' + playlist.type + ' ' + (playlist.name || playlist.serverUrl || playlist.url));
        this.showLoadingBackdrop();
        this.showLoading(true);
        var loadingTimeout = setTimeout(function() {
            window.log('autoConnect: timeout');
            document.getElementById('home-grid').style.visibility = '';
            self.showLoading(false);
        }, 10000);
        var done = function() {
            clearTimeout(loadingTimeout);
            self.showLoading(false);
        };
        if (playlist.type === 'provider') {
            this.api = new ProviderAPI(playlist.serverUrl, playlist.username, playlist.password, this.settings.proxyUrl);
            this.loadProviderCache(playlist.id).then(function(providerCache) {
                if (providerCache && providerCache.vod && providerCache.vod.categories) {
                    window.log('autoConnect: using provider cache for ' + playlist.id);
                    // Restore cached data to API memory cache
                    if (providerCache.vod) {
                        self.api.cache.vodCategories = providerCache.vod.categories;
                        self.api.cache.vodStreams['_all'] = providerCache.vod.streams || [];
                    }
                    if (providerCache.series) {
                        self.api.cache.seriesCategories = providerCache.series.categories;
                        self.api.cache.series['_all'] = providerCache.series.streams || [];
                    }
                    if (providerCache.live) {
                        self.api.cache.liveCategories = providerCache.live.categories;
                        self.api.cache.liveStreams['_all'] = providerCache.live.streams || [];
                    }
                    // Skip authentication when using cache - data is already loaded
                    window.log('autoConnect: using cache, skipping auth');
                    self.detectLanguages(providerCache.vod.categories);
                    self.updateHomeMenuVisibility();
                    // Save backdrop images from cache data (for next launch)
                    self.saveBackdropImages();
                    clearTimeout(loadingTimeout);
                    document.getElementById('home-grid').style.visibility = '';
                    self.showLoading(false);
                    // Trigger background refresh if cache is stale
                    if (providerCache._needsRefresh) {
                        self.refreshProviderCacheBackground(playlist.id);
                    }
                }
                else {
                    self.api.authenticate().then(function() {
                        window.log('autoConnect: authenticated');
                        return self.api.getVodCategories();
                    }).then(function(categories) {
                        window.log('autoConnect: got ' + categories.length + ' categories');
                        self.detectLanguages(categories);
                        self.updateHomeMenuVisibility();
                        clearTimeout(loadingTimeout);
                        self.cacheLoading = true;
                        self.api.preloadCache(function(step, total, name) {
                            self.updateCacheStatus(step, total, name);
                            if (step === 0) {
                                // Filter cache by language setting
                                self.api.filterCacheByLanguage(function(catName) {
                                    return self.matchesLanguage(catName);
                                });
                                self.cacheLoading = false;
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
                                self.saveProviderCache(playlist.id, cacheData);
                                self.saveBackdropImages();
                                document.getElementById('home-grid').style.visibility = '';
                                self.showLoading(false);
                            }
                        });
                    }).catch(function(err) {
                        window.log('ERROR autoConnect provider: ' + (err ? err.message || err : 'unknown'));
                        self.updateHomeMenuVisibility();
                        document.getElementById('home-grid').style.visibility = '';
                        done();
                    });
                }
            });
        }
        else if (playlist.type === 'm3u') {
            this.loadM3UPlaylist(playlist.url).then(function() {
                window.log('autoConnect: M3U loaded');
                self.updateHomeMenuVisibility();
                document.getElementById('home-grid').style.visibility = '';
                done();
            }).catch(function(err) {
                var errMsg = err ? (err.message || err.toString()) : 'Unknown error';
                window.log('ERROR autoConnect M3U: ' + errMsg);
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
        window.log('autoConnectMerge: ' + playlists.length + ' playlists');
        this.showLoadingBackdrop();
        this.showLoading(true);
        this.apis = [];
        var providerPlaylists = playlists.filter(function(p) { return p.type === 'provider'; });
        // Check if we have cached data - if so, skip authentication
        this.loadProviderCache('merged').then(function(mergedCache) {
            if (mergedCache && mergedCache.vod && mergedCache.vod.categories) {
                window.log('autoConnectMerge: using cache, skipping auth for ' + providerPlaylists.length + ' providers');
                // Create APIs without authentication (for later use if needed)
                providerPlaylists.forEach(function(p) {
                    var api = new ProviderAPI(p.serverUrl, p.username, p.password, self.settings.proxyUrl);
                    api.playlistId = p.id;
                    self.apis.push(api);
                });
                if (self.apis.length > 0) {
                    self.api = self.apis[0];
                }
                self.updateHomeMenuVisibility();
                document.getElementById('home-grid').style.visibility = '';
                self.showLoading(false);
                // Trigger background refresh for stale providers
                if (mergedCache._needsRefreshIds && mergedCache._needsRefreshIds.length > 0) {
                    window.log('autoConnectMerge: triggering background refresh for ' + mergedCache._needsRefreshIds.length + ' providers');
                    mergedCache._needsRefreshIds.forEach(function(playlistId) {
                        self.refreshProviderCacheBackground(playlistId);
                    });
                }
            }
            else {
                // No cache - authenticate all providers
                var promises = providerPlaylists.map(function(p) {
                    var api = new ProviderAPI(p.serverUrl, p.username, p.password, self.settings.proxyUrl);
                    api.playlistId = p.id;
                    return api.authenticate().then(function() {
                        self.apis.push(api);
                        return api;
                    }).catch(function(err) {
                        window.log('autoConnectMerge: failed ' + p.name + ': ' + (err ? err.message : 'unknown'));
                        return null;
                    });
                });
                Promise.all(promises).then(function() {
                    window.log('autoConnectMerge: connected to ' + self.apis.length + ' providers');
                    if (self.apis.length > 0) {
                        self.api = self.apis[0];
                    }
                    self.updateHomeMenuVisibility();
                    document.getElementById('home-grid').style.visibility = '';
                    self.showLoading(false);
                });
            }
        });
    }


    bindKeys() {
        var self = this;

        document.addEventListener('keydown', function(e) {
            var key = e.keyCode;
            var keyNames = {37:'Left',38:'Up',39:'Right',40:'Down',13:'OK',10009:'Back',8:'Back',415:'Play',10252:'PlayPause',413:'Stop',417:'FF',412:'Rew',427:'Ch+',428:'Ch-'};
            var keyName = keyNames[key] || key;
            window.log('KEY ' + keyName + ' screen=' + self.currentScreen + ' focus=' + self.focusArea + '[' + self.focusIndex + ']');

            var activeEl = document.activeElement;
            var isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
            if (isInput) {
                // Up/Down/Back close the keyboard, but NOT Backspace (8) which should delete characters
                if (key === 38 || key === 40 || key === 10009) {
                    activeEl.blur();
                } else if (key === 13) {
                    return;
                } else {
                    // Let the input handle the key (including Backspace for deletion)
                    return;
                }
            }

            switch (key) {
                case 37: // Left
                    if (self.currentScreen === 'guide') {
                        self.navigateGuide('left');
                    } else if (self.currentScreen === 'catchup-modal') {
                        self.navigateCatchupModal('left');
                    } else if (self.focusArea === 'sub-options') {
                        self.navigate('left');
                    } else if (self.focusArea === 'tracks') {
                        self.navigate('left');
                    } else if (self.currentScreen === 'player') {
                        if (self.playerTracksFocused) {
                            self.navigatePlayerTracks(-1);
                        } else {
                            self.startSeek(-1);
                        }
                    } else {
                        self.navigate('left');
                    }
                    break;
                case 38: // Up
                    if (self.currentScreen === 'guide') {
                        self.navigateGuide('up');
                    } else if (self.currentScreen === 'catchup-modal') {
                        self.navigateCatchupModal('up');
                    } else if (self.focusArea === 'sub-options') {
                        self.navigate('up');
                    } else if (self.focusArea === 'tracks') {
                        self.navigate('up');
                    } else if (self.currentScreen === 'player') {
                        if (self.playerTracksFocused) {
                            self.unfocusPlayerTracks();
                        } else {
                            self.showPlayerOverlay();
                        }
                    } else {
                        self.navigate('up');
                    }
                    break;
                case 39: // Right
                    if (self.currentScreen === 'guide') {
                        self.navigateGuide('right');
                    } else if (self.currentScreen === 'catchup-modal') {
                        self.navigateCatchupModal('right');
                    } else if (self.focusArea === 'sub-options') {
                        self.navigate('right');
                    } else if (self.focusArea === 'tracks') {
                        self.navigate('right');
                    } else if (self.currentScreen === 'player') {
                        if (self.playerTracksFocused) {
                            self.navigatePlayerTracks(1);
                        } else if (self.currentPlayingType === 'live' && self.player.isInTimeshift) {
                            self.returnToLive();
                        } else {
                            self.startSeek(1);
                        }
                    } else {
                        self.navigate('right');
                    }
                    break;
                case 40: // Down
                    if (self.currentScreen === 'guide') {
                        self.navigateGuide('down');
                    } else if (self.currentScreen === 'catchup-modal') {
                        self.navigateCatchupModal('down');
                    } else if (self.focusArea === 'sub-options') {
                        self.navigate('down');
                    } else if (self.focusArea === 'tracks') {
                        self.navigate('down');
                    } else if (self.currentScreen === 'player') {
                        self.handlePlayerDown();
                    } else {
                        self.navigate('down');
                    }
                    break;
                case 13: // Enter/OK
                    if (self.currentScreen === 'guide') {
                        self.selectGuideProgram();
                    } else if (self.currentScreen === 'catchup-modal') {
                        self.selectCatchupItem();
                    } else if (self.focusArea === 'sub-options') {
                        self.handleSubtitleOption();
                    } else if (self.focusArea === 'tracks') {
                        self.confirmTrackSelection();
                    } else if (self.currentScreen === 'player') {
                        if (self.playerTracksFocused) {
                            self.selectPlayerTrack();
                        } else {
                            self.stopSeek();
                            self.player.togglePlayPause();
                            self.showPlayerOverlay();
                        }
                    } else {
                        self.select();
                    }
                    break;
                case 10009: // Back (Samsung)
                case 8: // Backspace
                    self.stopSeek();
                    self.goBack();
                    break;
                case 415: // Play
                case 10252: // MediaPlayPause
                    if (self.currentScreen === 'player') {
                        self.stopSeek();
                        self.player.togglePlayPause();
                        self.showPlayerOverlay();
                    }
                    break;
                case 413: // Stop
                    if (self.currentScreen === 'player') {
                        self.stopSeek();
                        self.stopPlayback();
                    }
                    break;
                case 417: // FastForward
                    if (self.currentScreen === 'player') {
                        self.startSeek(1);
                    }
                    break;
                case 412: // Rewind
                    if (self.currentScreen === 'player') {
                        self.startSeek(-1);
                    }
                    break;
                case 427: // ChannelUp
                    if (self.currentScreen === 'player' && self.currentPlayingType === 'live') {
                        self.changeChannel(1);
                    }
                    break;
                case 428: // ChannelDown
                    if (self.currentScreen === 'player' && self.currentPlayingType === 'live') {
                        self.changeChannel(-1);
                    }
                    break;
                case 458: // Guide
                    if (self.currentSection === 'live' || self.currentScreen === 'player') {
                        self.showTVGuide();
                    }
                    break;
            }
            e.preventDefault();
        });

        document.addEventListener('keyup', function(e) {
            var key = e.keyCode;
            if (key === 37 || key === 39 || key === 417 || key === 412) {
                if (self.currentScreen === 'player') {
                    self.stopSeek();
                }
            }
        });
    }


    navigate(direction) {
        var now = Date.now();
        if (now - this.lastNavTime < this.navThrottle) return;
        this.lastNavTime = now;

        var focusables = this.getFocusables();
        if (!focusables.length) return;

        var newIndex = this.focusIndex;
        var isListView = document.getElementById('content-grid').classList.contains('list-view');
        var cols = isListView ? 1 : this.gridColumns;

        if (this.focusArea === 'modal') {
            switch (direction) {
                case 'left':
                    if (this.focusIndex > 0) newIndex = 0;
                    break;
                case 'right':
                    if (this.focusIndex < 1) newIndex = 1;
                    break;
            }
        } else if (this.focusArea === 'sub-options') {
            // Rows: Offset(0-3), Size(4-6), Style(7-9), Close(10)
            var rows = [[0,1,2,3], [4,5,6], [7,8,9], [10]];
            var currentRow = 0;
            var posInRow = 0;
            for (var r = 0; r < rows.length; r++) {
                var idx = rows[r].indexOf(newIndex);
                if (idx !== -1) { currentRow = r; posInRow = idx; break; }
            }
            switch (direction) {
                case 'left':
                    if (posInRow > 0) newIndex = rows[currentRow][posInRow - 1];
                    break;
                case 'right':
                    if (posInRow < rows[currentRow].length - 1) newIndex = rows[currentRow][posInRow + 1];
                    break;
                case 'up':
                    if (currentRow > 0) {
                        var targetRow = rows[currentRow - 1];
                        newIndex = targetRow[Math.min(posInRow, targetRow.length - 1)];
                    }
                    break;
                case 'down':
                    if (currentRow < rows.length - 1) {
                        var targetRow = rows[currentRow + 1];
                        newIndex = targetRow[Math.min(posInRow, targetRow.length - 1)];
                    }
                    break;
            }
            this.focusIndex = newIndex;
            this.updateFocus();
            window.log('NAV result: ' + this.focusArea + '[' + this.focusIndex + ']');
            return;
        } else if (this.focusArea === 'tracks') {
            switch (direction) {
                case 'up':
                    if (newIndex > 0) newIndex--;
                    break;
                case 'down':
                    if (newIndex < focusables.length - 1) newIndex++;
                    break;
            }
        } else if (this.focusArea === 'home') {
            var homeCols = this.getHomeGridCols();
            var homeCount = focusables.length;
            switch (direction) {
                case 'left':
                    if (newIndex % homeCols > 0) newIndex--;
                    break;
                case 'right':
                    if (newIndex % homeCols < homeCols - 1 && newIndex < homeCount - 1) newIndex++;
                    break;
                case 'up':
                    if (newIndex >= homeCols) {
                        newIndex -= homeCols;
                    }
                    break;
                case 'down':
                    var currentRow = Math.floor(newIndex / homeCols);
                    var totalRows = Math.ceil(homeCount / homeCols);
                    if (currentRow < totalRows - 1) {
                        var targetIndex = newIndex + homeCols;
                        newIndex = targetIndex < homeCount ? targetIndex : homeCount - 1;
                    }
                    break;
            }
        } else if (this.focusArea === 'continue') {
            var contCols = 5;
            var contCount = focusables.length;
            switch (direction) {
                case 'left':
                    if (newIndex % contCols > 0) newIndex--;
                    break;
                case 'right':
                    if (newIndex % contCols < contCols - 1 && newIndex < contCount - 1) newIndex++;
                    break;
                case 'up':
                    if (newIndex >= contCols) newIndex -= contCols;
                    break;
                case 'down':
                    if (newIndex + contCols < contCount) newIndex += contCols;
                    break;
            }
        } else if (this.focusArea === 'sidebar') {
            switch (direction) {
                case 'up':
                    if (newIndex > 0) {
                        newIndex--;
                    } else {
                        // Move to filters when at top of sidebar
                        this.lastSidebarIndex = this.focusIndex;
                        this.focusArea = 'filters';
                        this.focusIndex = 0;
                        this.updateFocus();
                        window.log('NAV result: ' + this.focusArea + '[' + this.focusIndex + ']');
                        return;
                    }
                    break;
                case 'down':
                    newIndex = Math.min(focusables.length - 1, newIndex + 1);
                    break;
                case 'right':
                    this.lastSidebarIndex = this.focusIndex;
                    this.focusArea = 'grid';
                    this.focusIndex = 0;
                    this.updateFocus();
                    window.log('NAV result: ' + this.focusArea + '[' + this.focusIndex + ']');
                    return;
            }
        } else if (this.focusArea === 'filters') {
            var filterCount = focusables.length;
            var sidebarVisible = document.getElementById('sidebar').style.display !== 'none';
            switch (direction) {
                case 'left':
                    if (newIndex > 0) {
                        newIndex--;
                    } else if (sidebarVisible) {
                        this.focusArea = 'sidebar';
                        this.focusIndex = this.lastSidebarIndex !== null ? this.lastSidebarIndex : 0;
                        this.updateFocus();
                        window.log('NAV result: ' + this.focusArea + '[' + this.focusIndex + ']');
                        return;
                    }
                    break;
                case 'right':
                    if (newIndex < filterCount - 1) newIndex++;
                    break;
                case 'down':
                    var gridItems = document.querySelectorAll('#content-grid .grid-item');
                    if (gridItems.length > 0) {
                        this.focusArea = 'grid';
                        this.focusIndex = 0;
                        this.updateFocus();
                        window.log('NAV result: ' + this.focusArea + '[' + this.focusIndex + ']');
                    }
                    return;
            }
        } else if (this.focusArea === 'grid') {
            var sidebarVisible = document.getElementById('sidebar').style.display !== 'none';
            switch (direction) {
                case 'left':
                    // In favorites edit mode with item selected, move it
                    if (this.favoritesEditMode && this.movingFavoriteIndex >= 0) {
                        this.moveFavorite('left');
                        return;
                    }
                    if (newIndex % cols === 0) {
                        if (sidebarVisible) {
                            this.focusArea = 'sidebar';
                            this.focusIndex = this.lastSidebarIndex !== null ? this.lastSidebarIndex : 0;
                            this.updateFocus();
                            window.log('NAV result: ' + this.focusArea + '[' + this.focusIndex + ']');
                        }
                        return;
                    }
                    newIndex--;
                    break;
                case 'right':
                    // In favorites edit mode with item selected, move it
                    if (this.favoritesEditMode && this.movingFavoriteIndex >= 0) {
                        this.moveFavorite('right');
                        return;
                    }
                    // In list view, right toggles favorite (or removes from history)
                    if (isListView && !this.favoritesEditMode) {
                        if (this.currentSection === 'history') {
                            this.removeHistoryAtIndex(this.focusIndex);
                        }
                        else {
                            this.toggleFavoriteAtIndex(this.focusIndex);
                        }
                        return;
                    }
                    if ((newIndex + 1) % cols !== 0 && newIndex < focusables.length - 1) {
                        newIndex++;
                    }
                    break;
                case 'up':
                    // In favorites edit mode with item selected, move it
                    if (this.favoritesEditMode && this.movingFavoriteIndex >= 0) {
                        this.moveFavorite('up');
                        return;
                    }
                    if (newIndex < cols) {
                        // Go to filters
                        this.focusArea = 'filters';
                        var col = newIndex % cols;
                        // Columns 0-1: go to search (index 0)
                        // Columns 2-3: go to sort (index 4 = first sort button)
                        this.focusIndex = (col < 2) ? 0 : 4;
                        this.updateFocus();
                        window.log('NAV result: ' + this.focusArea + '[' + this.focusIndex + ']');
                        return;
                    }
                    newIndex -= cols;
                    break;
                case 'down':
                    // In favorites edit mode with item selected, move it
                    if (this.favoritesEditMode && this.movingFavoriteIndex >= 0) {
                        this.moveFavorite('down');
                        return;
                    }
                    if (newIndex + cols < focusables.length) {
                        newIndex += cols;
                    } else if (this.displayedCount < this.currentStreams.length) {
                        var oldCount = focusables.length;
                        if (this.loadMoreItems()) {
                            newIndex += cols;
                            if (newIndex >= oldCount + this.itemsPerBatch) {
                                newIndex = oldCount;
                            }
                        }
                    }
                    break;
            }
        } else if (this.focusArea === 'details') {
            var current = focusables[newIndex];
            var currentZone = this.getDetailsZone(current);
            var zones = this.getDetailsZones(focusables);
            switch (direction) {
                case 'left':
                    if (currentZone === 'episodes' && zones.episodes) {
                        if (newIndex === zones.episodes.start) {
                            newIndex = zones.episodes.end;
                        } else {
                            newIndex--;
                        }
                    } else if (newIndex > 0) {
                        var prev = focusables[newIndex - 1];
                        if (this.getDetailsZone(prev) === currentZone) {
                            newIndex--;
                        }
                    }
                    break;
                case 'right':
                    if (currentZone === 'episodes' && zones.episodes) {
                        if (newIndex === zones.episodes.end) {
                            newIndex = zones.episodes.start;
                        } else {
                            newIndex++;
                        }
                    } else if (newIndex < focusables.length - 1) {
                        var next = focusables[newIndex + 1];
                        if (this.getDetailsZone(next) === currentZone) {
                            newIndex++;
                        }
                    }
                    break;
                case 'up':
                    if (currentZone === 'episodes') {
                        var episodeCols = this.getEpisodeColumns();
                        var zoneStart = zones.episodes.start;
                        var posInZone = newIndex - zoneStart;
                        if (posInZone >= episodeCols) {
                            newIndex -= episodeCols;
                        } else {
                            var prevZone = this.getPrevDetailsZone(currentZone, zones);
                            if (prevZone) newIndex = zones[prevZone].start;
                        }
                    } else {
                        var prevZone = this.getPrevDetailsZone(currentZone, zones);
                        if (prevZone) {
                            newIndex = zones[prevZone].start;
                        } else {
                            // Only wrap to last zone if scroll is at top
                            var wrapper = document.getElementById('details-wrapper');
                            if (wrapper && wrapper.scrollTop > 0) {
                                // Scroll to top first, don't wrap
                                wrapper.scrollTop = 0;
                            } else {
                                // Wrap to last zone
                                var lastZone = zones._order[zones._order.length - 1];
                                newIndex = zones[lastZone].end;
                                if (wrapper) wrapper.scrollTop = wrapper.scrollHeight;
                            }
                        }
                    }
                    break;
                case 'down':
                    if (currentZone === 'episodes') {
                        var episodeCols = this.getEpisodeColumns();
                        var zoneStart = zones.episodes.start;
                        var zoneEnd = zones.episodes.end;
                        var posInZone = newIndex - zoneStart;
                        var totalEpisodes = zoneEnd - zoneStart + 1;
                        if (posInZone + episodeCols < totalEpisodes) {
                            newIndex += episodeCols;
                        } else {
                            var nextZone = this.getNextDetailsZone(currentZone, zones);
                            if (nextZone) newIndex = zones[nextZone].start;
                            else {
                                // Wrap to first zone
                                var firstZone = zones._order[0];
                                newIndex = zones[firstZone].start;
                                var wrapper = document.getElementById('details-wrapper');
                                if (wrapper) wrapper.scrollTop = 0;
                            }
                        }
                    } else {
                        var nextZone = this.getNextDetailsZone(currentZone, zones);
                        if (nextZone) {
                            newIndex = zones[nextZone].start;
                        } else {
                            // Wrap to first zone
                            var firstZone = zones._order[0];
                            newIndex = zones[firstZone].start;
                            var wrapper = document.getElementById('details-wrapper');
                            if (wrapper) wrapper.scrollTop = 0;
                        }
                    }
                    break;
            }
        } else if (this.focusArea === 'actor') {
            switch (direction) {
                case 'left':
                    if (newIndex > 0) newIndex--;
                    break;
                case 'right':
                    if (newIndex < focusables.length - 1) {
                        newIndex++;
                    }
                    break;
            }
        } else if (this.focusArea === 'settings' || this.focusArea === 'playlists' || this.focusArea === 'playlist-edit' || this.focusArea === 'confirm-modal' || this.focusArea === 'pattern-modal' || this.focusArea === 'add-category-modal') {
            newIndex = this.navigate2D(focusables, newIndex, direction);
        }

        this.focusIndex = newIndex;
        this.updateFocus();
        window.log('NAV result: ' + this.focusArea + '[' + this.focusIndex + ']');
    }

    navigate2D(focusables, currentIndex, direction) {
        if (focusables.length === 0) return currentIndex;
        var current = focusables[currentIndex];
        if (!current) return currentIndex;
        var currentRect = current.getBoundingClientRect();
        var currentCenterX = currentRect.left + currentRect.width / 2;
        var currentCenterY = currentRect.top + currentRect.height / 2;
        var bestIndex = currentIndex;
        var bestScore = Infinity;
        var rowTolerance = 15;
        for (var i = 0; i < focusables.length; i++) {
            if (i === currentIndex) continue;
            var el = focusables[i];
            var rect = el.getBoundingClientRect();
            var centerX = rect.left + rect.width / 2;
            var centerY = rect.top + rect.height / 2;
            var dx = centerX - currentCenterX;
            var dy = centerY - currentCenterY;
            var isValid = false;
            var score = Infinity;
            if (direction === 'up' && dy < -rowTolerance) {
                isValid = true;
                // Prefer leftmost element when moving between rows
                score = Math.abs(dy) + centerX * 0.01;
            }
            else if (direction === 'down' && dy > rowTolerance) {
                isValid = true;
                // Prefer leftmost element when moving between rows
                score = Math.abs(dy) + centerX * 0.01;
            }
            else if (direction === 'left' && dx < -10 && Math.abs(dy) < rowTolerance) {
                isValid = true;
                score = Math.abs(dx);
            }
            else if (direction === 'right' && dx > 10 && Math.abs(dy) < rowTolerance) {
                isValid = true;
                score = Math.abs(dx);
            }
            if (isValid && score < bestScore) {
                bestScore = score;
                bestIndex = i;
            }
        }
        return bestIndex;
    }

    getFocusables() {
        var selector = '';
        switch (this.focusArea) {
            case 'modal':
                selector = '#resume-modal .modal-btn';
                break;
            case 'home':
                selector = '#playlist-selector .focusable, #home-grid .focusable';
                break;
            case 'continue':
                selector = '#continue-grid .continue-item';
                break;
            case 'sidebar':
                selector = '#categories-list .category-item';
                break;
            case 'filters':
                selector = '#filters-bar .focusable';
                break;
            case 'grid':
                selector = '#content-grid .grid-item';
                break;
            case 'details':
                selector = '#details-screen .focusable';
                break;
            case 'actor':
                selector = '#actor-filmography-grid .filmography-item';
                break;
            case 'tracks':
                return this.trackModalItems || [];
            case 'sub-options':
                return this.subOptionsItems || [];
            case 'settings':
                selector = '#settings-screen .focusable';
                break;
            case 'playlists':
                selector = '#playlists-screen .focusable';
                break;
            case 'playlist-edit':
                selector = '#playlist-edit-screen .focusable';
                break;
            case 'pattern-modal':
                selector = '#pattern-modal .focusable';
                break;
            case 'add-category-modal':
                selector = '#add-category-modal .focusable';
                break;
            case 'confirm-modal':
                selector = '#confirm-modal .modal-btn';
                break;
        }
        var elements = document.querySelectorAll(selector);
        var visible = [];
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            if (!el.classList.contains('hidden') && el.offsetParent !== null) {
                visible.push(el);
            }
        }
        return visible;
    }

    getDetailsZone(element) {
        if (element.classList.contains('favorite-star')) return 'favorite';
        if (element.classList.contains('action-btn')) return 'actions';
        if (element.classList.contains('season-btn')) return 'seasons';
        if (element.classList.contains('episode-item')) return 'episodes';
        if (element.classList.contains('cast-card')) {
            if (element.parentElement && element.parentElement.id === 'details-director-grid') {
                return 'director';
            }
            return 'cast';
        }
        return 'actions';
    }

    getDetailsZones(focusables) {
        var zones = {};
        var zoneOrder = ['favorite', 'actions', 'seasons', 'episodes', 'director', 'cast'];
        for (var i = 0; i < focusables.length; i++) {
            var zone = this.getDetailsZone(focusables[i]);
            if (!zones[zone]) {
                zones[zone] = { start: i, end: i };
            } else {
                zones[zone].end = i;
            }
        }
        zones._order = [];
        for (var j = 0; j < zoneOrder.length; j++) {
            if (zones[zoneOrder[j]]) {
                zones._order.push(zoneOrder[j]);
            }
        }
        return zones;
    }

    getPrevDetailsZone(currentZone, zones) {
        var order = zones._order;
        var idx = order.indexOf(currentZone);
        if (idx > 0) {
            return order[idx - 1];
        }
        return null;
    }

    getNextDetailsZone(currentZone, zones) {
        var order = zones._order;
        var idx = order.indexOf(currentZone);
        if (idx < order.length - 1) {
            return order[idx + 1];
        }
        return null;
    }

    getDetailsPlayIndex() {
        var focusables = this.getFocusables();
        // First look for continue button (if visible)
        for (var i = 0; i < focusables.length; i++) {
            if (focusables[i].id === 'continue-btn') {
                return i;
            }
        }
        // Fallback to play button
        for (var i = 0; i < focusables.length; i++) {
            if (focusables[i].id === 'play-btn') {
                return i;
            }
        }
        return 0;
    }

    getEpisodeColumns() {
        var container = document.getElementById('details-episodes-grid');
        var items = container.querySelectorAll('.episode-item');
        if (items.length < 2) return 1;
        var firstTop = items[0].offsetTop;
        var cols = 1;
        for (var i = 1; i < items.length; i++) {
            if (items[i].offsetTop === firstTop) {
                cols++;
            } else {
                break;
            }
        }
        return cols;
    }

    updateFocus() {
        document.querySelectorAll('.focused').forEach(function(el) {
            el.classList.remove('focused');
            // Stop marquee animation
            var textSpan = el.querySelector('.category-text');
            if (textSpan) {
                textSpan.classList.remove('marquee');
            }
        });
        var focusables = this.getFocusables();
        // Clamp index to valid range
        if (focusables.length > 0) {
            if (this.focusIndex < 0) {
                this.focusIndex = 0;
            }
            else if (this.focusIndex >= focusables.length) {
                this.focusIndex = focusables.length - 1;
            }
        }
        if (focusables[this.focusIndex]) {
            var el = focusables[this.focusIndex];
            el.classList.add('focused');
            // Start marquee animation for overflowing category items
            if (el.classList.contains('category-item')) {
                var textSpan = el.querySelector('.category-text');
                if (textSpan) {
                    var overflow = textSpan.scrollWidth - el.clientWidth + 30;
                    if (overflow > 0) {
                        textSpan.style.setProperty('--marquee-distance', -overflow + 'px');
                        textSpan.classList.add('marquee');
                    }
                }
            }
            // Save last valid focus state
            this.lastValidFocus = {
                screen: this.currentScreen,
                area: this.focusArea,
                index: this.focusIndex
            };
            if (this.focusArea === 'settings') {
                this.scrollSettingsToElement(el);
            }
            else if (this.focusArea === 'details') {
                this.scrollDetailsToElement(el);
            }
            else {
                el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
            }
            if (this.focusArea === 'grid') {
                var self = this;
                clearTimeout(this.imageLoadTimer);
                this.imageLoadTimer = setTimeout(function() {
                    self.loadVisibleImages();
                    self.loadVisibleGenres();
                    self.loadVisibleEPG();
                }, 100);
            }
        }
        else if (focusables.length === 0 && this.lastValidFocus && !this.restoringFocus) {
            // No focusables in current area - restore last valid focus
            if (this.lastValidFocus.screen === this.currentScreen) {
                this.restoringFocus = true;
                this.focusArea = this.lastValidFocus.area;
                this.focusIndex = this.lastValidFocus.index;
                this.updateFocus();
                this.restoringFocus = false;
            }
        }
    }

    scrollSettingsToElement(el) {
        var container = document.getElementById('settings-screen');
        if (!container) return;
        var elRect = el.getBoundingClientRect();
        var containerRect = container.getBoundingClientRect();
        var marginTop = 215;
        var marginBottom = 150;
        if (elRect.top < containerRect.top + marginTop) {
            container.scrollTop -= (containerRect.top + marginTop - elRect.top);
        }
        else if (elRect.bottom > containerRect.bottom - marginBottom) {
            container.scrollTop += (elRect.bottom - containerRect.bottom + marginBottom);
        }
    }

    scrollDetailsToElement(el) {
        var container = document.getElementById('details-wrapper');
        if (!container) return;
        // Scroll to top when focusing on top zones (favorite, actions)
        var zone = this.getDetailsZone(el);
        if (zone === 'favorite' || zone === 'actions') {
            container.scrollTop = 0;
            return;
        }
        var elRect = el.getBoundingClientRect();
        var containerRect = container.getBoundingClientRect();
        var marginTop = 50;
        var marginBottom = 80;
        if (elRect.top < containerRect.top + marginTop) {
            container.scrollTop -= (containerRect.top + marginTop - elRect.top);
        }
        else if (elRect.bottom > containerRect.bottom - marginBottom) {
            container.scrollTop += (elRect.bottom - containerRect.bottom + marginBottom);
        }
    }


    select() {
        var focusables = this.getFocusables();
        var current = focusables[this.focusIndex];
        if (!current) return;
        var selectInfo = current.id || current.dataset.action || current.dataset.streamId || current.className.split(' ')[0];
        window.log('ACTION select ' + selectInfo);

        if (this.focusArea === 'modal') {
            this.confirmResume(this.focusIndex === 0);
            return;
        } else if (this.focusArea === 'tracks') {
            this.confirmTrackSelection();
            return;
        } else if (this.focusArea === 'pattern-modal') {
            if (current.id === 'pattern-save-btn') {
                window.log('ACTION pattern-save');
                this.closePatternEditor(true);
            } else if (current.id === 'pattern-cancel-btn') {
                window.log('ACTION pattern-cancel');
                this.closePatternEditor(false);
            } else if (current.id === 'pattern-add-btn') {
                var input = document.getElementById('pattern-add-input');
                window.log('ACTION pattern-add-keyword: ' + input.value);
                this.addPatternKeyword(input.value);
            } else if (current.id === 'pattern-add-input' || current.id === 'pattern-category-name' || current.id === 'pattern-category-icon') {
                window.log('ACTION open-keyboard: ' + current.id);
                this.openKeyboard(current.id);
            } else if (current.classList.contains('pattern-chip')) {
                var keyword = current.dataset.keyword;
                var subcategory = current.dataset.subcategory;
                window.log('ACTION pattern-remove-keyword: ' + keyword + ' subcat=' + subcategory);
                this.removePatternKeyword(keyword, subcategory);
            } else if (current.classList.contains('pattern-subcategory-tab')) {
                this.selectPatternSubcategory(current.dataset.subcategory);
            } else if (current.id === 'pattern-use-tmdb-toggle' || current.classList.contains('settings-toggle')) {
                // Toggle useTMDB
                var toggle = current.id === 'pattern-use-tmdb-toggle' ? current : current.closest('.settings-toggle');
                if (toggle) {
                    var newValue = toggle.dataset.value === 'yes' ? 'no' : 'yes';
                    toggle.dataset.value = newValue;
                    var toggleOpts = toggle.querySelectorAll('.toggle-option');
                    for (var ti = 0; ti < toggleOpts.length; ti++) {
                        if (toggleOpts[ti].dataset.value === newValue) {
                            toggleOpts[ti].classList.add('active');
                        }
                        else {
                            toggleOpts[ti].classList.remove('active');
                        }
                    }
                }
            } else if (current.classList.contains('icon-type-btn') && current.closest('#pattern-icon-type-toggle')) {
                // Toggle icon type in pattern editor
                this.handlePatternIconTypeToggle(current.dataset.type);
            } else if (current.classList.contains('icon-option') && current.closest('#pattern-icon-emoji-section')) {
                // Select emoji in pattern editor
                this.handlePatternEmojiSelect(current.dataset.icon);
            } else if (current.classList.contains('color-option')) {
                // Select color in pattern editor
                var palette = current.closest('#pattern-text-color-palette') ? 'text' : 'bg';
                this.handlePatternColorSelect(palette, current.dataset.color);
            }
            return;
        } else if (this.focusArea === 'add-category-modal') {
            this.handleAddCategorySelect();
            return;
        } else if (this.focusArea === 'confirm-modal') {
            if (current.id === 'confirm-yes-btn') {
                this.confirmModalAction(true);
            } else if (current.id === 'confirm-no-btn') {
                this.confirmModalAction(false);
            }
            return;
        } else if (this.focusArea === 'continue') {
            var itemId = current.dataset.itemId;
            var itemType = current.dataset.itemType;
            var itemName = current.dataset.itemName;
            this.playFromHistory(itemId, itemType, itemName);
        } else if (this.focusArea === 'home') {
            if (current.dataset.playlistId) {
                this.switchPlaylist(current.dataset.playlistId);
                return;
            }
            this.lastHomeIndex = this.focusIndex;
            var section = current.dataset.section;
            this.openSection(section);
        } else if (this.focusArea === 'sidebar') {
            this.lastSidebarIndex = this.focusIndex;
            var categoryId = current.dataset.categoryId;
            this.loadStreams(categoryId);
        } else if (this.focusArea === 'filters') {
            if (current.classList.contains('sort-btn')) {
                var sortType = current.dataset.sort;
                this.applySort(sortType);
            } else if (current.id === 'edit-favorites-btn') {
                this.toggleFavoritesEditMode();
            } else if (current.classList.contains('view-btn')) {
                var viewMode = current.dataset.view;
                this.setViewMode(viewMode);
            } else if (current.classList.contains('filter-input')) {
                this.openKeyboard(current.id);
            }
        } else if (this.focusArea === 'grid') {
            // In favorites edit mode, select/deselect item to move
            if (this.favoritesEditMode && (this.currentSection === 'favorites' || this.inFilteredFavorites)) {
                this.selectFavoriteToMove();
                return;
            }
            // Handle Guide TV card in TNT grid
            if (current.dataset.categoryId === 'guide') {
                this.showTVGuide();
                return;
            }
            this.lastGridIndex = this.focusIndex;
            var streamId = current.dataset.streamId;
            var streamType = current.dataset.streamType;

            if (streamType === 'live' || streamType === 'sport') {
                // Find stream object for direct play types
                var stream = this.findStreamById(streamId, streamType) || this.findFavoriteStream(streamId);
                // Clear selectedStream so back returns to grid, not previous details
                this.selectedStream = null;
                this.playStream(streamId, 'live', stream);
            } else if (this.currentSection === 'history' && streamType === 'series') {
                // Direct play series episode from history
                var streamData = this.currentStreams.find(function(s) {
                    return (s.stream_id || s.series_id) == streamId;
                });
                if (streamData && streamData._episodeId) {
                    this.playSeriesFromHistory(streamData);
                } else {
                    this.showDetails(current);
                }
            } else if (this.currentSection === 'history' && streamType === 'vod') {
                // Direct play VOD from history
                var streamData = this.currentStreams.find(function(s) {
                    return (s.stream_id || s.series_id) == streamId;
                });
                if (streamData) {
                    this.playVodFromHistory(streamData);
                } else {
                    this.showDetails(current);
                }
            } else {
                this.showDetails(current);
            }
        } else if (this.focusArea === 'details') {
            if (current.id === 'play-btn') {
                this.playCurrentStream(false);
            } else if (current.id === 'continue-btn') {
                this.playCurrentStream(true);
            } else if (current.id === 'mark-watched-btn') {
                this.markAsWatched();
            } else if (current.id === 'favorite-btn' || current.classList.contains('favorite-star')) {
                window.log('Favorite click: selectedStream=' + JSON.stringify(this.selectedStream ? {id: this.selectedStream.id, type: this.selectedStream.type, hasData: !!this.selectedStream.data} : null));
                this.toggleFavorite(this.selectedStream.data || this.selectedStream, this.selectedStream.type);
            } else if (current.classList.contains('cast-card')) {
                var actorId = current.dataset.actorId;
                this.lastDetailsIndex = this.focusIndex;
                this.showActor(actorId);
            } else if (current.classList.contains('season-btn')) {
                var season = parseInt(current.dataset.season);
                this.selectSeason(season);
            } else if (current.classList.contains('episode-item')) {
                var episodeId = current.dataset.episodeId;
                this.playEpisode(episodeId);
            }
        } else if (this.focusArea === 'actor') {
            if (current.classList.contains('filmography-item')) {
                this.lastActorIndex = this.focusIndex;
                this.showDetailsFromTMDB(current);
            }
        } else if (this.focusArea === 'settings') {
            this.handleSettingsSelect();
        } else if (this.focusArea === 'playlists') {
            this.handlePlaylistsSelect();
        } else if (this.focusArea === 'playlist-edit') {
            this.handlePlaylistEditSelect();
        }
    }


    updateFavoriteButton() {
        var favBtn = document.getElementById('favorite-btn');
        if (favBtn && this.selectedStream) {
            var isFav = this.isFavorite(this.selectedStream.id);
            favBtn.textContent = isFav ? '★' : '☆';
            favBtn.classList.toggle('is-favorite', isFav);
        }
    }

    playSeriesFromHistory(historyData) {
        var self = this;
        var episodeId = historyData._episodeId;
        var seriesId = historyData.series_id;
        var position = historyData._historyPosition || 0;
        var minMs = (this.settings.minProgressMinutes || 2) * 60000;
        this.currentSeason = parseInt(historyData._season) || 1;
        this.currentEpisodeId = episodeId;
        this.currentEpisodeNum = parseInt(historyData._episode) || 1;
        var historyPlaylistId = historyData._playlistId;
        var stream = {
            stream_id: episodeId,
            series_id: seriesId,
            name: historyData.name,
            cover: historyData.cover || historyData.stream_icon,
            season: historyData._season,
            episode: historyData._episode,
            _playlistId: historyPlaylistId
        };
        // If from different playlist, build direct URL and use temp API
        var apiToUse = this.api;
        if (historyPlaylistId && historyPlaylistId !== this.settings.activePlaylistId) {
            var playlist = this.getPlaylistById(historyPlaylistId);
            if (playlist) {
                stream.url = this.buildStreamUrl(playlist, episodeId, 'episode');
                window.log('playSeriesFromHistory: using direct URL for playlist ' + historyPlaylistId);
                // Create temp API for loading series info
                apiToUse = new ProviderAPI(playlist.serverUrl, playlist.username, playlist.password, this.settings.proxyUrl);
            }
        }
        this.selectedStream = {
            id: seriesId,
            type: 'series',
            data: historyData,
            seriesId: seriesId,
            isFromHistory: true,
            _playlistId: historyPlaylistId
        };
        // Load series info in background for episode chaining
        if (apiToUse && seriesId) {
            this.pendingSeriesInfoPromise = apiToUse.getSeriesInfo(seriesId).then(function(data) {
                self.currentSeriesInfo = data;
                self.pendingSeriesInfoPromise = null;
                window.log('playSeriesFromHistory: loaded series info, episodes=' + (data && data.episodes ? Object.keys(data.episodes).length : 0) + ' seasons');
                return data;
            }).catch(function(err) {
                self.pendingSeriesInfoPromise = null;
                window.log('playSeriesFromHistory: failed to load series info: ' + err);
            });
        }
        // Check if should show resume modal
        if (position >= minMs && !historyData._watched) {
            this.pendingEpisodeStream = stream;
            this.pendingEpisodePosition = position;
            this.showResumeModal(historyData._episode, position);
        }
        else {
            this.addToWatchHistory(stream, 'series', 0);
            this.playStream(episodeId, 'episode', stream, 0);
        }
    }

    playVodFromHistory(historyData) {
        var streamId = historyData.stream_id;
        var position = historyData._historyPosition || 0;
        var minMs = (this.settings.minProgressMinutes || 2) * 60000;
        var historyPlaylistId = historyData._playlistId;
        var stream = {
            stream_id: streamId,
            name: historyData.name,
            cover: historyData.cover || historyData.stream_icon,
            _playlistId: historyPlaylistId
        };
        // If from different playlist, build direct URL
        if (historyPlaylistId && historyPlaylistId !== this.settings.activePlaylistId) {
            var playlist = this.getPlaylistById(historyPlaylistId);
            if (playlist) {
                stream.url = this.buildStreamUrl(playlist, streamId, 'vod');
                window.log('playVodFromHistory: using direct URL for playlist ' + historyPlaylistId);
            }
        }
        this.selectedStream = {
            id: streamId,
            type: 'vod',
            data: historyData,
            isFromHistory: true
        };
        // Check if should show resume modal
        if (position >= minMs && !historyData._watched) {
            this.pendingVodStream = stream;
            this.pendingVodPosition = position;
            this.showVodResumeModal(position);
        }
        else {
            this.addToWatchHistory(stream, 'vod', 0);
            this.playStream(streamId, 'vod', stream, 0);
        }
    }

    addToWatchHistory(stream, type, position) {
        var genre = (stream.genre || stream.category_name || '').toLowerCase();
        if (genre.indexOf('adult') !== -1) {
            return;
        }
        var seriesId = stream.series_id || stream._seriesId;
        window.log('addToWatchHistory type=' + type + ' seriesId=' + seriesId + ' stream_id=' + stream.stream_id);
        var historyItem = {
            id: stream.stream_id || stream.series_id,
            name: stream.name || stream.title,
            cover: stream.stream_icon || stream.cover,
            type: type,
            position: position || 0,
            date: Date.now(),
            playlistId: stream._playlistId || this.settings.activePlaylistId || null
        };
        if (seriesId) {
            historyItem.seriesId = seriesId;
            historyItem.episodeId = stream.stream_id;
            historyItem.season = stream.season || stream._season;
            historyItem.episode = stream.episode || stream._episode;
            historyItem.episodeTitle = stream.episodeTitle || stream._episodeTitle;
        }
        // Remove existing entry with same ID and playlistId to avoid duplicates
        var itemId = historyItem.id;
        var itemPlaylistId = historyItem.playlistId;
        this.watchHistory = this.watchHistory.filter(function(item) {
            return item.id != itemId || item.playlistId != itemPlaylistId;
        });
        this.watchHistory.unshift(historyItem);
        this.saveWatchHistory();
    }

    removeFromWatchHistory(id) {
        this.watchHistory = this.watchHistory.filter(function(item) {
            return item.id != id;
        });
        this.saveWatchHistory();
        this.showHistoryScreen();
    }

    showContinueInGrid() {
        var container = document.getElementById('content-grid');
        container.innerHTML = '';
        var self = this;

        var filteredHistory = this.getFilteredContinueHistory();

        if (filteredHistory.length === 0) {
            container.innerHTML = '<div style="color:#888;font-size:24px;padding:40px;">' + I18n.t('home.noContinue', 'No content in progress') + '</div>';
            return;
        }

        var streams = filteredHistory.map(function(item) {
            return {
                stream_id: item.id,
                series_id: item.seriesId,
                name: item.name,
                stream_icon: item.cover,
                cover: item.cover,
                _historyType: item.type,
                _historyPosition: item.position || 0,
                _isHistory: true,
                _season: item.season,
                _episode: item.episode,
                _episodeTitle: item.episodeTitle,
                _playlistId: item.playlistId || null
            };
        });

        this.originalStreams = streams;
        this.currentStreams = streams;
        this.currentStreamType = 'history';
        this.displayedCount = 0;

        this.loadMoreItems();
        this.focusArea = 'grid';
        this.focusIndex = 0;
        this.updateFocus();
    }

    showFavoritesInGrid() {
        var container = document.getElementById('content-grid');
        container.innerHTML = '';
        var self = this;
        var section = this.currentSection;
        // Filter favorites by current section type and store indices
        this.filteredFavoriteIndices = [];
        var filteredFavorites = [];
        // Filter favorites by section (exact match for subsections/custom, type match for main sections)
        var vodSubsections = ['sport', 'entertainment', 'manga'];
        var isVodSubsection = vodSubsections.indexOf(section) !== -1;
        var isCustom = section.indexOf('custom_') === 0;
        this.favorites.forEach(function(fav, idx) {
            var favType = fav._type || 'vod';
            var favSection = fav._section || favType;
            var match = false;
            if (isVodSubsection || isCustom) {
                // For VOD subsections and custom sections, match by exact section
                match = favSection === section;
            }
            else if (section === 'live') match = favType === 'live';
            else if (section === 'vod') match = favType === 'vod' && vodSubsections.indexOf(favSection) === -1;
            else if (section === 'series') match = favType === 'series';
            else match = true;
            if (match) {
                filteredFavorites.push(fav);
                self.filteredFavoriteIndices.push(idx);
            }
        });
        // Show edit button
        var editBtn = document.getElementById('edit-favorites-btn');
        editBtn.classList.toggle('hidden', filteredFavorites.length === 0);
        editBtn.classList.remove('selected');
        this.favoritesEditMode = false;
        this.inFilteredFavorites = true;
        // Apply saved view mode for favorites (key: favorites_<section>, default: section's viewMode)
        var viewModes = this.settings.viewMode || {};
        var favKey = 'favorites_' + section;
        var listDefaultSections = ['live', 'sport', 'entertainment'];
        var sectionDefault = listDefaultSections.indexOf(section) !== -1 ? 'list' : 'grid';
        var defaultMode = (typeof viewModes === 'object' && viewModes[section]) ? viewModes[section] : sectionDefault;
        var viewMode = (typeof viewModes === 'object' && viewModes[favKey]) ? viewModes[favKey] : defaultMode;
        container.classList.toggle('list-view', viewMode === 'list');
        document.querySelectorAll('.view-btn').forEach(function(btn) {
            btn.classList.toggle('selected', btn.dataset.view === viewMode);
        });
        if (filteredFavorites.length === 0) {
            container.innerHTML = '<div style="color:#888;font-size:24px;padding:40px;">' + I18n.t('home.noFavorites', 'No favorites') + '</div>';
            return;
        }
        this.originalStreams = filteredFavorites;
        this.currentStreams = filteredFavorites;
        this.currentStreamType = section === 'live' ? 'live' : (section === 'series' ? 'series' : 'vod');
        // Save live channel list for channel switching
        if (section === 'live') {
            this.liveChannelList = filteredFavorites;
        }
        this.displayedCount = 0;
        this.loadMoreItems();
        this.focusArea = 'grid';
        this.focusIndex = 0;
        this.updateFocus();
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
        var viewModes = this.settings.viewMode || {};
        var viewMode = (typeof viewModes === 'object' && viewModes['tnt']) ? viewModes['tnt'] : 'list';
        container.classList.toggle('list-view', viewMode === 'list');
        document.querySelectorAll('.view-btn').forEach(function(btn) {
            btn.classList.toggle('selected', btn.dataset.view === viewMode);
        });
        if (tntStreams.length === 0) {
            container.innerHTML = '<div style="color:#888;font-size:24px;padding:40px;">' + I18n.t('errors.noData', 'No data') + '</div>';
            return;
        }
        // Add TV Guide card as first item
        var guideCard = document.createElement('div');
        guideCard.className = 'grid-item guide-card';
        guideCard.dataset.categoryId = 'guide';
        guideCard.innerHTML = '<div class="guide-icon">📅</div><div class="grid-title">' + I18n.t('home.tvGuide', 'TV Guide') + '</div>';
        container.appendChild(guideCard);
        this.originalStreams = tntStreams;
        this.currentStreams = tntStreams;
        this.currentStreamType = 'live';
        // Save for channel switching
        this.liveChannelList = tntStreams;
        this.displayedCount = 0;
        this.loadMoreItems();
        this.focusArea = 'grid';
        this.focusIndex = 0;
        this.updateFocus();
    }

    showTVGuide() {
        var self = this;
        this.showScreen('guide');
        this.currentScreen = 'guide';
        // Initialize guide state
        this.guideChannels = [];
        this.guideEpgData = {};
        this.guideRowIndex = 0;
        this.guideProgramIndex = 0;
        // Get TNT channels first, then fill with other channels
        var allStreams = this.getStreams('live');
        var tntChannels = I18n.getTntChannels();
        var tntStreams = this.getTntStreams(allStreams, tntChannels);
        // Add more channels if needed (up to 15)
        var otherStreams = allStreams.filter(function(s) {
            return tntStreams.indexOf(s) === -1;
        });
        this.guideChannels = tntStreams.concat(otherStreams).slice(0, 15);
        // Render time bar
        this.renderGuideTimeBar();
        // Load EPG data and render
        this.loadGuideEPG();
    }

    renderGuideTimeBar() {
        var container = document.getElementById('guide-time-bar');
        var now = new Date();
        var html = '';
        // Show 12 hours starting from current hour
        for (var i = 0; i < 12; i++) {
            var hour = (now.getHours() + i) % 24;
            var timeStr = (hour < 10 ? '0' : '') + hour + 'h00';
            var isCurrent = (i === 0);
            html += '<div class="guide-time-slot' + (isCurrent ? ' current' : '') + '">' + timeStr + '</div>';
        }
        container.innerHTML = html;
    }

    loadGuideEPG() {
        var self = this;
        this.showLoading(true);
        // Load EPG for each channel
        var loaded = 0;
        this.guideChannels.forEach(function(ch, idx) {
            self.api.getShortEPG(ch.stream_id, 999).then(function(data) {
                self.guideEpgData[ch.stream_id] = data.epg_listings || [];
                loaded++;
                if (loaded === self.guideChannels.length) {
                    self.showLoading(false);
                    self.renderGuideGrid();
                }
            }).catch(function(err) {
                self.guideEpgData[ch.stream_id] = [];
                loaded++;
                if (loaded === self.guideChannels.length) {
                    self.showLoading(false);
                    self.renderGuideGrid();
                }
            });
        });
    }

    renderGuideGrid() {
        var self = this;
        var logosContainer = document.getElementById('guide-logos');
        var gridContainer = document.getElementById('guide-grid');
        var logosHtml = '';
        var gridHtml = '';
        var now = Math.floor(Date.now() / 1000);
        // Calculate pixelsPerSecond so 1 hour fits exactly in visible area
        var scrollArea = document.getElementById('guide-scroll-area');
        var viewportWidth = scrollArea ? scrollArea.clientWidth : 1760;
        var pixelsPerSecond = viewportWidth / 3600;
        var nowDate = new Date();
        var viewStartTime = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), nowDate.getHours(), 0, 0).getTime() / 1000;
        this.guideViewStartTime = viewStartTime;
        this.guidePixelsPerSecond = pixelsPerSecond;
        var maxEndTime = viewStartTime + 18 * 3600;
        for (var i = 0; i < this.guideChannels.length; i++) {
            var epg = this.guideEpgData[this.guideChannels[i].stream_id] || [];
            for (var j = 0; j < epg.length; j++) {
                var endTs = parseInt(epg[j].stop_timestamp, 10);
                if (endTs > maxEndTime) maxEndTime = endTs;
            }
        }
        var totalHours = Math.ceil((maxEndTime - viewStartTime) / 3600);
        this.renderGuideTimeBarScaled(pixelsPerSecond, totalHours);
        for (var i = 0; i < this.guideChannels.length; i++) {
            var ch = this.guideChannels[i];
            var epg = this.guideEpgData[ch.stream_id] || [];
            logosHtml += '<div class="guide-channel-logo" data-row="' + i + '" style="background-image:url(\'' + (ch.stream_icon || '') + '\')"></div>';
            gridHtml += '<div class="guide-programs-row" data-row="' + i + '">';
            var mergedProgs = [];
            for (var j = 0; j < epg.length; j++) {
                var prog = epg[j];
                var progStart = parseInt(prog.start_timestamp, 10);
                var progEnd = parseInt(prog.stop_timestamp, 10);
                if (progEnd <= viewStartTime) continue;
                var title = prog.title || '';
                try {
                    title = decodeURIComponent(escape(atob(title)));
                    title = title.replace(/\\"/g, '"').replace(/\\'/g, "'");
                } catch (e) {}
                if (!title || !title.trim()) title = '---';
                var last = mergedProgs[mergedProgs.length - 1];
                if (last && last.title === title) {
                    last.progEnd = Math.max(last.progEnd, progEnd);
                }
                else if (last && progStart < last.progEnd) {
                    if (progEnd > last.progEnd) {
                        mergedProgs.push({ progStart: last.progEnd, progEnd: progEnd, title: title, desc: prog.description || '' });
                    }
                }
                else {
                    mergedProgs.push({ progStart: progStart, progEnd: progEnd, title: title, desc: prog.description || '' });
                }
            }
            var progIdx = 0;
            for (var j = 0; j < mergedProgs.length; j++) {
                var mp = mergedProgs[j];
                var isLive = (now >= mp.progStart && now < mp.progEnd);
                var startDate = new Date(mp.progStart * 1000);
                var endDate = new Date(mp.progEnd * 1000);
                var timePrefix = (mp.progStart < viewStartTime) ? '< ' : '';
                var timeStr = timePrefix + (startDate.getHours() < 10 ? '0' : '') + startDate.getHours() + 'h' +
                              (startDate.getMinutes() < 10 ? '0' : '') + startDate.getMinutes();
                var displayStart = Math.max(mp.progStart, viewStartTime);
                var leftPos = (displayStart - viewStartTime) * pixelsPerSecond;
                var duration = mp.progEnd - displayStart;
                var width = duration * pixelsPerSecond;
                gridHtml += '<div class="guide-program-card" data-row="' + i + '" data-prog="' + progIdx + '" ';
                gridHtml += 'style="position:absolute;left:' + leftPos + 'px;width:' + width + 'px;" ';
                gridHtml += 'data-start="' + mp.progStart + '" data-end="' + mp.progEnd + '" ';
                gridHtml += 'data-stream-id="' + ch.stream_id + '" ';
                gridHtml += 'data-title="' + mp.title.replace(/"/g, '&quot;') + '" ';
                gridHtml += 'data-desc="' + mp.desc.replace(/"/g, '&quot;') + '">';
                gridHtml += '<div class="guide-program-time">' + timeStr + '</div>';
                gridHtml += '<div class="guide-program-image">';
                gridHtml += '<span class="guide-program-title-inner">' + mp.title + '</span>';
                gridHtml += '</div>';
                gridHtml += '</div>';
                progIdx++;
            }
            if (progIdx === 0) {
                gridHtml += '<div style="padding:20px;color:#666;">' + I18n.t('guide.noProgram', 'No program') + '</div>';
            }
            gridHtml += '</div>';
        }
        logosContainer.innerHTML = logosHtml;
        gridContainer.innerHTML = gridHtml;
        var indicator = document.createElement('div');
        indicator.id = 'guide-time-indicator';
        var indicatorLabel = document.createElement('div');
        indicatorLabel.id = 'guide-time-indicator-label';
        indicator.appendChild(indicatorLabel);
        gridContainer.appendChild(indicator);
        this.updateGuideTimeIndicator();
        this.startGuideTimeIndicator();
        this.setupGuideScrollSync();
        // Reset scroll to current hour (position 0)
        if (scrollArea) {
            scrollArea.scrollLeft = 0;
            scrollArea.scrollTop = 0;
        }
        this.updateGuideDayIndicator();
        this.updateGuideFocus(true);
    }

    updateGuideTimeIndicator() {
        var indicator = document.getElementById('guide-time-indicator');
        if (!indicator) return;
        var scrollArea = document.getElementById('guide-scroll-area');
        var scrollLeft = scrollArea ? scrollArea.scrollLeft : 0;
        var viewWidth = scrollArea ? scrollArea.clientWidth : 1920;
        var now = Math.floor(Date.now() / 1000);
        var leftPos = (now - this.guideViewStartTime) * this.guidePixelsPerSecond;
        var visibleLeft = scrollLeft;
        var visibleRight = scrollLeft + viewWidth;
        if (leftPos < visibleLeft || leftPos > visibleRight) {
            indicator.style.display = 'none';
        }
        else {
            indicator.style.display = 'block';
            indicator.style.left = leftPos + 'px';
            // Update time label
            var label = document.getElementById('guide-time-indicator-label');
            if (label) {
                var nowDate = new Date();
                var h = nowDate.getHours();
                var m = nowDate.getMinutes();
                label.textContent = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
                // Check if label would overlap with first row program time display
                var firstRow = document.querySelector('.guide-programs-row[data-row="0"]');
                var showLabel = true;
                if (firstRow) {
                    var cards = firstRow.querySelectorAll('.guide-program-card');
                    for (var i = 0; i < cards.length; i++) {
                        var cardLeft = parseFloat(cards[i].style.left) || 0;
                        var cardWidth = parseFloat(cards[i].style.width) || 0;
                        // Time display is in first 55px of each card
                        var timeDisplayEnd = cardLeft + 55;
                        // Check if indicator position overlaps with time display area
                        if (leftPos >= cardLeft && leftPos <= timeDisplayEnd) {
                            showLabel = false;
                            break;
                        }
                    }
                }
                label.style.display = showLabel ? 'block' : 'none';
            }
        }
    }

    startGuideTimeIndicator() {
        var self = this;
        if (this.guideTimeIndicatorInterval) {
            clearInterval(this.guideTimeIndicatorInterval);
        }
        this.guideTimeIndicatorInterval = setInterval(function() {
            self.updateGuideTimeIndicator();
        }, 60000);
    }

    stopGuideTimeIndicator() {
        if (this.guideTimeIndicatorInterval) {
            clearInterval(this.guideTimeIndicatorInterval);
            this.guideTimeIndicatorInterval = null;
        }
    }

    renderGuideTimeBarScaled(pixelsPerSecond, totalHours) {
        var container = document.getElementById('guide-time-bar');
        var startTime = this.guideViewStartTime * 1000;
        var html = '';
        var hourWidth = 3600 * pixelsPerSecond;
        for (var i = 0; i < totalHours; i++) {
            var slotDate = new Date(startTime + i * 3600000);
            var hour = slotDate.getHours();
            var timeStr = (hour < 10 ? '0' : '') + hour + 'h00';
            var isCurrent = (i === 0);
            html += '<div class="guide-time-slot' + (isCurrent ? ' current' : '') + '" style="width:' + hourWidth + 'px;">' + timeStr + '</div>';
        }
        container.innerHTML = html;
        this.updateGuideDayIndicator();
    }

    updateGuideDayIndicator() {
        var indicator = document.getElementById('guide-day-indicator');
        if (!indicator) return;
        var scrollArea = document.getElementById('guide-scroll-area');
        var scrollLeft = scrollArea ? scrollArea.scrollLeft : 0;
        var now = new Date();
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        var currentTime = this.guideViewStartTime + (scrollLeft / this.guidePixelsPerSecond);
        var currentDate = new Date(currentTime * 1000);
        var currentDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()).getTime();
        var dayDiff = Math.floor((currentDay - today) / 86400000);
        var dayLabel = '';
        if (dayDiff === 0) {
            dayLabel = I18n.t('guide.today', 'Today');
        }
        else if (dayDiff === 1) {
            dayLabel = I18n.t('guide.tomorrow', 'Tomorrow');
        }
        else {
            var days = I18n.t('guide.days', ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
            dayLabel = days[currentDate.getDay()] + ' ' + currentDate.getDate();
        }
        var hour = currentDate.getHours();
        var timeStr = (hour < 10 ? '0' : '') + hour + 'h00';
        indicator.textContent = dayLabel + ' - ' + timeStr;
    }

    updateGuidePrefixes() {
        var scrollArea = document.getElementById('guide-scroll-area');
        if (!scrollArea) return;
        var scrollLeft = scrollArea.scrollLeft;
        var currentViewTime = this.guideViewStartTime + (scrollLeft / this.guidePixelsPerSecond);
        var cards = document.querySelectorAll('.guide-program-card');
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            var progStart = parseInt(card.dataset.start, 10);
            var timeDiv = card.querySelector('.guide-program-time');
            if (!timeDiv) continue;
            var startDate = new Date(progStart * 1000);
            var prefix = (progStart < currentViewTime) ? '< ' : '';
            var timeStr = prefix + (startDate.getHours() < 10 ? '0' : '') + startDate.getHours() + 'h' +
                          (startDate.getMinutes() < 10 ? '0' : '') + startDate.getMinutes();
            timeDiv.textContent = timeStr;
        }
    }

    setupGuideScrollSync() {
        var scrollArea = document.getElementById('guide-scroll-area');
        var logosContainer = document.getElementById('guide-logos');
        var self = this;
        scrollArea.onscroll = function() {
            logosContainer.scrollTop = scrollArea.scrollTop;
            self.updateStickyTitles();
            self.updateGuideDayIndicator();
        };
    }

    updateStickyTitles() {
        var scrollArea = document.getElementById('guide-scroll-area');
        var scrollLeft = scrollArea.scrollLeft;
        var cards = document.querySelectorAll('.guide-program-card');
        cards.forEach(function(card) {
            var cardLeft = card.offsetLeft;
            var cardWidth = card.offsetWidth;
            var titleInner = card.querySelector('.guide-program-title-inner');
            var timeDiv = card.querySelector('.guide-program-time');
            if (!titleInner) return;
            if (cardWidth < 150) {
                titleInner.style.transform = '';
                if (timeDiv) timeDiv.style.transform = '';
                return;
            }
            var cardRight = cardLeft + cardWidth;
            var visibleInCard = cardRight - scrollLeft;
            if (cardLeft < scrollLeft && visibleInCard > 100) {
                var offset = scrollLeft - cardLeft;
                var maxOffset = cardWidth - 150;
                offset = Math.min(offset, Math.max(0, maxOffset));
                titleInner.style.transform = 'translateX(' + offset + 'px)';
                if (timeDiv) timeDiv.style.transform = 'translateX(' + offset + 'px)';
            }
            else {
                titleInner.style.transform = '';
                if (timeDiv) timeDiv.style.transform = '';
            }
        });
    }

    updateGuideFocus(skipHorizontalScroll) {
        var cards = document.querySelectorAll('.guide-program-card');
        cards.forEach(function(c) { c.classList.remove('focused'); });
        var logos = document.querySelectorAll('.guide-channel-logo');
        logos.forEach(function(l) { l.classList.remove('focused'); });
        var rows = document.querySelectorAll('.guide-programs-row');
        rows.forEach(function(r) { r.classList.remove('focused'); });
        var row = document.querySelector('.guide-programs-row[data-row="' + this.guideRowIndex + '"]');
        window.log('updateGuideFocus: guideRowIndex=' + this.guideRowIndex + ', row found=' + !!row);
        if (row) {
            row.classList.add('focused');
            window.log('Added focused class to row, classes now: ' + row.className);
            var progs = row.querySelectorAll('.guide-program-card');
            if (progs.length > 0) {
                if (this.guideProgramIndex >= progs.length) {
                    this.guideProgramIndex = progs.length - 1;
                }
                if (this.guideProgramIndex < 0) {
                    this.guideProgramIndex = 0;
                }
                progs[this.guideProgramIndex].classList.add('focused');
            }
        }
        var focusedLogo = document.querySelector('.guide-channel-logo[data-row="' + this.guideRowIndex + '"]');
        if (focusedLogo) {
            focusedLogo.classList.add('focused');
        }
        var scrollArea = document.getElementById('guide-scroll-area');
        var focusedRow = document.querySelector('.guide-programs-row[data-row="' + this.guideRowIndex + '"]');
        if (focusedRow && scrollArea) {
            var rowTop = focusedRow.offsetTop;
            var rowHeight = focusedRow.offsetHeight;
            var scrollTop = scrollArea.scrollTop;
            var areaHeight = scrollArea.offsetHeight;
            if (rowTop < scrollTop + 50) {
                scrollArea.scrollTop = rowTop - 50;
            }
            if (rowTop + rowHeight > scrollTop + areaHeight - 50) {
                scrollArea.scrollTop = rowTop + rowHeight - areaHeight + 50;
            }
            if (!skipHorizontalScroll) {
                var focusedCard = focusedRow.querySelector('.guide-program-card.focused');
                if (focusedCard) {
                    scrollArea.scrollLeft = focusedCard.offsetLeft;
                }
            }
        }
        var focusedCard = document.querySelector('.guide-program-card.focused');
        var infoTime = document.getElementById('guide-info-time');
        var infoTitle = document.getElementById('guide-info-title');
        if (focusedCard && infoTime && infoTitle) {
            var startTs = parseInt(focusedCard.dataset.start, 10);
            var endTs = parseInt(focusedCard.dataset.end, 10);
            var startDate = new Date(startTs * 1000);
            var endDate = new Date(endTs * 1000);
            var timeStr = (startDate.getHours() < 10 ? '0' : '') + startDate.getHours() + 'h' +
                          (startDate.getMinutes() < 10 ? '0' : '') + startDate.getMinutes() + ' - ' +
                          (endDate.getHours() < 10 ? '0' : '') + endDate.getHours() + 'h' +
                          (endDate.getMinutes() < 10 ? '0' : '') + endDate.getMinutes();
            infoTime.textContent = timeStr;
            infoTitle.textContent = focusedCard.dataset.title || '';
            this.guideFocusedTime = startTs;
        }
    }

    findProgramAtTime() {
        var row = document.querySelector('.guide-programs-row[data-row="' + this.guideRowIndex + '"]');
        if (!row) return;
        var progs = row.querySelectorAll('.guide-program-card');
        if (progs.length === 0) return;
        var scrollArea = document.getElementById('guide-scroll-area');
        var scrollLeft = scrollArea ? scrollArea.scrollLeft : 0;
        var targetTime = this.guideViewStartTime + (scrollLeft / this.guidePixelsPerSecond);
        for (var i = 0; i < progs.length; i++) {
            var start = parseInt(progs[i].dataset.start, 10);
            var end = parseInt(progs[i].dataset.end, 10);
            if (targetTime >= start && targetTime < end) {
                this.guideProgramIndex = i;
                return;
            }
        }
        for (var i = 0; i < progs.length; i++) {
            var start = parseInt(progs[i].dataset.start, 10);
            if (start >= targetTime) {
                this.guideProgramIndex = i;
                return;
            }
        }
        this.guideProgramIndex = progs.length - 1;
    }

    navigateGuide(direction) {
        var scrollArea = document.getElementById('guide-scroll-area');
        var row = document.querySelector('.guide-programs-row[data-row="' + this.guideRowIndex + '"]');
        var progs = row ? row.querySelectorAll('.guide-program-card') : [];
        switch (direction) {
            case 'up':
                if (this.guideRowIndex > 0) {
                    this.guideRowIndex--;
                    this.findProgramAtTime();
                    this.updateGuideFocus(true);
                }
                break;
            case 'down':
                if (this.guideRowIndex < this.guideChannels.length - 1) {
                    this.guideRowIndex++;
                    this.findProgramAtTime();
                    this.updateGuideFocus(true);
                }
                break;
            case 'left':
                if (scrollArea && progs.length > 0) {
                    // Check if there's a previous program visible
                    var prevIndex = this.guideProgramIndex - 1;
                    if (prevIndex >= 0) {
                        var prevProg = progs[prevIndex];
                        var progLeft = parseFloat(prevProg.style.left) || 0;
                        var visibleLeft = scrollArea.scrollLeft;
                        // If previous program is at least partially visible, just move to it
                        var progRight = progLeft + (parseFloat(prevProg.style.width) || 0);
                        if (progRight > visibleLeft) {
                            this.guideProgramIndex = prevIndex;
                            this.updateGuideFocus(true);
                            return;
                        }
                    }
                    // Otherwise scroll by 1 hour
                    var hourPixels = 3600 * this.guidePixelsPerSecond;
                    var newScrollL = Math.max(0, scrollArea.scrollLeft - hourPixels);
                    scrollArea.scrollLeft = newScrollL;
                    this.findProgramAtTime();
                    this.updateGuideFocus(true);
                    this.updateGuidePrefixes();
                    this.updateGuideTimeIndicator();
                    this.updateGuideDayIndicator();
                }
                break;
            case 'right':
                if (scrollArea && progs.length > 0) {
                    // Check if there's a next program visible
                    var nextIndex = this.guideProgramIndex + 1;
                    if (nextIndex < progs.length) {
                        var nextProg = progs[nextIndex];
                        var progLeftR = parseFloat(nextProg.style.left) || 0;
                        var visibleRight = scrollArea.scrollLeft + scrollArea.clientWidth;
                        // If next program starts within visible area, just move to it
                        if (progLeftR < visibleRight) {
                            this.guideProgramIndex = nextIndex;
                            this.updateGuideFocus(true);
                            return;
                        }
                    }
                    // Otherwise scroll by 1 hour
                    var hourPixelsR = 3600 * this.guidePixelsPerSecond;
                    var maxScroll = scrollArea.scrollWidth - scrollArea.clientWidth;
                    var newScrollR = Math.min(maxScroll, scrollArea.scrollLeft + hourPixelsR);
                    scrollArea.scrollLeft = newScrollR;
                    this.findProgramAtTime();
                    this.updateGuideFocus(true);
                    this.updateGuidePrefixes();
                    this.updateGuideTimeIndicator();
                    this.updateGuideDayIndicator();
                }
                break;
        }
    }

    selectGuideProgram() {
        // Play selected program
        var focusedCard = document.querySelector('.guide-program-card.focused');
        if (!focusedCard) return;
        var streamId = focusedCard.dataset.streamId;
        var ch = this.guideChannels.find(function(c) { return String(c.stream_id) === String(streamId); });
        if (!ch) return;
        var now = Math.floor(Date.now() / 1000);
        var progStart = parseInt(focusedCard.dataset.start, 10);
        var progEnd = parseInt(focusedCard.dataset.end, 10);
        // If program is in the past and catchup is available, play catchup
        if (progEnd < now && (ch.tv_archive === 1 || ch.tv_archive === '1')) {
            var duration = Math.ceil((progEnd - progStart) / 60);
            this.playCatchup(ch, progStart, duration);
            return;
        }
        // Play live
        this.playStream(ch.stream_id, 'live', ch);
    }

    changeChannel(direction) {
        window.log('ACTION changeChannel: ' + (direction > 0 ? 'next' : 'prev'));
        // Find current stream in the list
        var currentStream = this.currentPlayingStream;
        if (!currentStream) {
            window.log('changeChannel: no currentPlayingStream');
            return;
        }
        var currentId = currentStream.stream_id || currentStream.vod_id || currentStream.series_id;
        window.log('changeChannel: currentId=' + currentId + ' type=' + typeof currentId);
        // Use saved live channel list, or current streams as fallback
        var streams = this.liveChannelList || this.currentStreams || [];
        window.log('changeChannel: liveChannelList=' + (this.liveChannelList ? this.liveChannelList.length : 'null') + ' currentStreams=' + (this.currentStreams ? this.currentStreams.length : 'null'));
        if (streams.length === 0) {
            window.log('changeChannel: no streams in list');
            return;
        }
        var currentIndex = -1;
        for (var i = 0; i < streams.length; i++) {
            var streamId = streams[i].stream_id || streams[i].vod_id || streams[i].series_id;
            if (String(streamId) === String(currentId)) {
                currentIndex = i;
                break;
            }
        }
        if (currentIndex === -1) {
            window.log('changeChannel: current stream not found in list (id=' + currentId + ', list=' + streams.length + ')');
            return;
        }
        // Calculate next index (wrap around)
        var nextIndex = currentIndex + direction;
        if (nextIndex < 0) nextIndex = streams.length - 1;
        if (nextIndex >= streams.length) nextIndex = 0;
        var nextStream = streams[nextIndex];
        var streamId = nextStream.stream_id || nextStream.vod_id || nextStream.series_id;
        var streamName = nextStream.name || nextStream.title || '';
        window.log('changeChannel: nextStream keys=' + Object.keys(nextStream).join(','));
        window.log('changeChannel: streamId=' + streamId + ' type=' + typeof streamId);
        window.log('Channel change: ' + direction + ', playing ' + streamName);
        this.playStream(streamId, 'live', nextStream);
    }

    showContinueScreen() {
        this.currentSection = 'continue';
        this.currentStreamType = 'continue';
        this.showScreen('browse');
        this.currentScreen = 'browse';
        document.getElementById('sidebar-title').textContent = I18n.t('home.continueWatching', 'Continue watching');
        document.getElementById('filters-bar').style.display = '';
        document.getElementById('search-filters').style.display = 'none';
        document.getElementById('sort-filters').style.display = 'none';
        document.getElementById('sidebar').style.display = 'none';
        var container = document.getElementById('categories-list');
        container.innerHTML = '';
        var self = this;
        var minMs = (this.settings.minProgressMinutes || 2) * 60000;
        // Get VOD items from watchHistory (now includes progress)
        var continueItems = [];
        for (var i = 0; i < this.watchHistory.length; i++) {
            var item = this.watchHistory[i];
            if ((item.type === 'vod' || item.type === 'movie') && !item.watched && item.position >= minMs) {
                continueItems.push({
                    id: item.id,
                    name: item.name,
                    cover: item.cover,
                    type: 'vod',
                    percent: item.percent || 0,
                    position: item.position || 0,
                    timestamp: item.date || 0
                });
            }
        }
        // Series episodes with progress - group by series
        var seriesMap = {};
        for (var epId in this.episodeProgress) {
            var epProg = this.episodeProgress[epId];
            if (epProg.position >= minMs && !epProg.watched) {
                // Find series info from watchHistory
                var epHistory = this.watchHistory.find(function(h) { return h.id == epId || h.seriesId; });
                var seriesId = epHistory ? epHistory.seriesId : null;
                if (seriesId) {
                    if (!seriesMap[seriesId] || seriesMap[seriesId].timestamp < (epHistory.date || 0)) {
                        seriesMap[seriesId] = {
                            id: seriesId,
                            episodeId: epId,
                            name: epHistory.name,
                            cover: epHistory.cover,
                            type: 'series',
                            percent: epProg.percent,
                            position: epProg.position,
                            timestamp: epHistory.date || 0,
                            season: epHistory.season,
                            episode: epHistory.episode
                        };
                    }
                }
            }
        }
        // Also add series from seriesProgress (last watched episode) if not already in map
        for (var seriesId in this.seriesProgress) {
            if (!seriesMap[seriesId]) {
                var sProg = this.seriesProgress[seriesId];
                // Find series info from watchHistory
                var sHistory = this.watchHistory.find(function(h) { return h.seriesId == seriesId; });
                if (sHistory) {
                    seriesMap[seriesId] = {
                        id: seriesId,
                        episodeId: sProg.episodeId,
                        name: sHistory.name,
                        cover: sHistory.cover,
                        type: 'series',
                        percent: 100,
                        position: 0,
                        timestamp: sProg.timestamp || 0,
                        season: sProg.season,
                        episode: sProg.episode
                    };
                }
            }
        }
        // Add series to continueItems
        for (var sId in seriesMap) {
            continueItems.push(seriesMap[sId]);
        }
        // Sort by most recent
        continueItems.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
        var streams = continueItems.map(function(item) {
            return {
                stream_id: item.id,
                series_id: item.type === 'series' ? item.id : null,
                name: item.name,
                stream_icon: item.cover,
                cover: item.cover,
                _type: item.type,
                _historyPosition: item.position,
                _percent: item.percent,
                _season: item.season,
                _episode: item.episode,
                _episodeId: item.episodeId,
                _isHistory: true
            };
        });
        if (streams.length === 0) {
            document.getElementById('content-grid').innerHTML = '<div style="color:#888;font-size:24px;padding:40px;">' + I18n.t('home.noContinue', 'No content in progress') + '</div>';
        }
        else {
            this.renderGrid(streams, 'continue');
        }
        this.focusArea = 'grid';
        this.focusIndex = 0;
        var self = this;
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                self.updateFocus();
            });
        });
    }

    showHistoryScreen() {
        this.currentSection = 'history';
        this.currentStreamType = 'history';
        this.showScreen('browse');
        this.currentScreen = 'browse';
        document.getElementById('sidebar-title').textContent = I18n.t('home.history', 'History');
        document.getElementById('filters-bar').style.display = '';
        document.getElementById('search-filters').style.display = 'none';
        document.getElementById('sort-filters').style.display = 'none';
        document.getElementById('sidebar').style.display = 'none';
        document.getElementById('edit-favorites-btn').classList.add('hidden');
        var container = document.getElementById('categories-list');
        container.innerHTML = '';
        // Build history items from watchHistory (deduplicate by item+playlist+day)
        var historyItems = [];
        var seen = {};
        for (var i = 0; i < this.watchHistory.length; i++) {
            var item = this.watchHistory[i];
            var dayKey = this.getHistoryDayKey(item.date || 0);
            var itemKey = (item.playlistId || '') + '_' + item.id + '_' + dayKey;
            if (seen[itemKey]) continue;
            seen[itemKey] = true;
            var isInProgress = !item.watched && item.position > 0;
            // Get duration: from watchHistory for VOD, from episodeProgress for episodes
            var duration = item.duration || 0;
            if (!duration && item.seriesId) {
                var epId = item.episodeId || item.id;
                var epProgress = this.episodeProgress[epId];
                if (epProgress && epProgress.duration) {
                    duration = epProgress.duration;
                }
            }
            historyItems.push({
                stream_id: item.id,
                series_id: item.seriesId || null,
                name: item.name,
                stream_icon: item.cover,
                cover: item.cover,
                _type: item.seriesId ? 'series' : 'vod',
                _historyPosition: item.position || 0,
                _percent: item.percent || (item.watched ? 100 : 0),
                _duration: duration,
                _season: item.season,
                _episode: item.episode,
                _episodeId: item.episodeId || (item.seriesId ? item.id : null),
                _isHistory: true,
                _watched: item.watched,
                _inProgress: isInProgress,
                _timestamp: item.date || 0,
                _historyIndex: i,
                _playlistId: item.playlistId || null
            });
        }
        // Already sorted by date (most recent first)
        if (historyItems.length === 0) {
            document.getElementById('content-grid').innerHTML = '<div style="color:#888;font-size:24px;padding:40px;">' + I18n.t('home.noHistory', 'No viewing history') + '</div>';
        }
        else {
            // Force list view for history
            var grid = document.getElementById('content-grid');
            grid.classList.add('list-view');
            document.querySelectorAll('.view-btn').forEach(function(btn) {
                btn.classList.toggle('selected', btn.dataset.view === 'list');
            });
            this.renderGrid(historyItems, 'history');
        }
        this.focusArea = 'grid';
        this.focusIndex = 0;
        var self = this;
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                self.updateFocus();
            });
        });
    }

    showFavoritesScreen() {
        this.currentSection = 'favorites';
        this.currentStreamType = 'favorites';
        this.favoritesEditMode = false;
        this.inFilteredFavorites = false;
        this.filteredFavoriteIndices = null;
        this.showScreen('browse');
        this.currentScreen = 'browse';
        document.getElementById('sidebar-title').textContent = I18n.t('home.favorites', 'Favorites');
        document.getElementById('filters-bar').style.display = '';
        document.getElementById('search-filters').style.display = 'none';
        document.getElementById('sort-filters').style.display = 'none';
        document.getElementById('sidebar').style.display = 'none';
        // Show edit button for favorites
        var editBtn = document.getElementById('edit-favorites-btn');
        editBtn.classList.toggle('hidden', this.favorites.length === 0);
        editBtn.classList.remove('selected');
        var container = document.getElementById('categories-list');
        container.innerHTML = '';
        if (this.favorites.length === 0) {
            document.getElementById('content-grid').innerHTML = '<div style="color:#888;font-size:24px;padding:40px;">' + I18n.t('home.noFavorites', 'No favorites') + '</div>';
        } else {
            this.renderGrid(this.favorites, 'favorites');
        }
        this.focusArea = 'grid';
        this.focusIndex = 0;
        var self = this;
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                self.updateFocus();
            });
        });
    }

    toggleFavoritesEditMode() {
        window.log('ACTION toggleFavoritesEditMode: ' + !this.favoritesEditMode);
        this.favoritesEditMode = !this.favoritesEditMode;
        this.movingFavoriteIndex = -1;
        var editBtn = document.getElementById('edit-favorites-btn');
        var grid = document.getElementById('content-grid');
        if (this.favoritesEditMode) {
            editBtn.classList.add('selected');
            grid.classList.add('edit-mode');
            this.focusArea = 'grid';
            this.updateFocus();
        }
        else {
            editBtn.classList.remove('selected');
            grid.classList.remove('edit-mode');
            // Remove moving class from all items
            document.querySelectorAll('#content-grid .grid-item.moving').forEach(function(el) {
                el.classList.remove('moving');
            });
            this.saveFavorites();
        }
    }

    selectFavoriteToMove() {
        if (!this.favoritesEditMode) return;
        if (this.currentSection !== 'favorites' && !this.inFilteredFavorites) return;
        window.log('ACTION selectFavoriteToMove: idx=' + this.focusIndex + ' moving=' + this.movingFavoriteIndex);
        var items = document.querySelectorAll('#content-grid .grid-item');
        if (this.movingFavoriteIndex >= 0) {
            // Already moving - confirm position
            items[this.movingFavoriteIndex].classList.remove('moving');
            this.movingFavoriteIndex = -1;
            this.saveFavorites();
        }
        else {
            // Start moving this item
            this.movingFavoriteIndex = this.focusIndex;
            if (items[this.focusIndex]) {
                items[this.focusIndex].classList.add('moving');
            }
        }
    }

    moveFavorite(direction) {
        if (!this.favoritesEditMode) return false;
        if (this.currentSection !== 'favorites' && !this.inFilteredFavorites) return false;
        if (this.movingFavoriteIndex < 0) return false;
        var isListView = document.getElementById('content-grid').classList.contains('list-view');
        var cols = isListView ? 1 : this.gridColumns;
        var currentIndex = this.movingFavoriteIndex;
        var newIndex;
        if (direction === 'up') {
            newIndex = currentIndex - cols;
        }
        else if (direction === 'down') {
            newIndex = currentIndex + cols;
        }
        else if (direction === 'left') {
            newIndex = currentIndex - 1;
        }
        else if (direction === 'right') {
            newIndex = currentIndex + 1;
        }
        // Check bounds based on filtered or full favorites
        var maxIndex = this.inFilteredFavorites ? this.filteredFavoriteIndices.length : this.favorites.length;
        if (newIndex < 0 || newIndex >= maxIndex) return false;
        // Swap in favorites array
        if (this.inFilteredFavorites && this.filteredFavoriteIndices) {
            // Use real indices from the main favorites array
            var realCurrentIdx = this.filteredFavoriteIndices[currentIndex];
            var realNewIdx = this.filteredFavoriteIndices[newIndex];
            var temp = this.favorites[realCurrentIdx];
            this.favorites[realCurrentIdx] = this.favorites[realNewIdx];
            this.favorites[realNewIdx] = temp;
            // Also swap the indices in filteredFavoriteIndices
            var tempIdx = this.filteredFavoriteIndices[currentIndex];
            this.filteredFavoriteIndices[currentIndex] = this.filteredFavoriteIndices[newIndex];
            this.filteredFavoriteIndices[newIndex] = tempIdx;
        }
        else {
            var temp = this.favorites[currentIndex];
            this.favorites[currentIndex] = this.favorites[newIndex];
            this.favorites[newIndex] = temp;
        }
        // Swap DOM elements
        var items = document.querySelectorAll('#content-grid .grid-item');
        var currentEl = items[currentIndex];
        var targetEl = items[newIndex];
        if (currentEl && targetEl) {
            var parent = currentEl.parentNode;
            // Remove moving class
            currentEl.classList.remove('moving');
            // Create placeholder to swap positions correctly
            var placeholder = document.createElement('div');
            parent.insertBefore(placeholder, currentEl);
            parent.insertBefore(currentEl, targetEl);
            parent.insertBefore(targetEl, placeholder);
            parent.removeChild(placeholder);
            // Re-add moving class to moved element
            currentEl.classList.add('moving');
        }
        // Update indices
        this.movingFavoriteIndex = newIndex;
        this.focusIndex = newIndex;
        this.updateFocus();
        return true;
    }


    // Playlist management


    // M3U Parser


    playFromHistory(itemId, itemType, itemName) {
        var url;
        var isLive = false;
        if (!this.api) {
            window.log('Cannot play from history without API');
            return;
        }
        if (itemType === 'vod' || itemType === 'movie') {
            url = this.api.getVodStreamUrl(itemId, 'mkv');
        } else if (itemType === 'series') {
            url = this.api.getSeriesStreamUrl(itemId, 'mkv');
        } else {
            url = this.api.getLiveStreamUrl(itemId, 'ts');
            isLive = true;
        }
        this.showScreen('player');
        this.currentScreen = 'player';
        this.player.play(url, isLive);
    }

    deleteCurrentContinueItem() {
        var focusables = this.getFocusables();
        if (focusables.length > 0 && this.focusIndex < focusables.length) {
            var current = focusables[this.focusIndex];
            var itemId = parseInt(current.dataset.itemId);
            this.removeFromWatchHistory(itemId);
        }
    }

    deleteCurrentHistoryItem() {
        var focusables = this.getFocusables();
        if (focusables.length > 0 && this.focusIndex < focusables.length) {
            var current = focusables[this.focusIndex];
            var itemId = parseInt(current.dataset.streamId);
            this.watchHistory = this.watchHistory.filter(function(item) {
                return item.id !== itemId;
            });
            this.saveWatchHistory();
            this.showContinueInGrid();
        }
    }


    goBack() {
        window.log('ACTION goBack screen=' + this.currentScreen);
        this.showLoading(false);
        if (this.currentScreen === 'catchup-modal') {
            this.hideCatchupModal();
            return;
        }
        if (this.focusArea === 'modal') {
            this.hideResumeModal();
            return;
        }
        if (this.focusArea === 'tracks') {
            this.hideTracksModal();
            return;
        }
        if (this.focusArea === 'sub-options') {
            this.hideSubtitleOptionsModal();
            return;
        }
        if (this.focusArea === 'pattern-modal') {
            this.closePatternEditor(false);
            return;
        }
        if (this.focusArea === 'add-category-modal') {
            this.closeAddCategoryModal(false);
            return;
        }
        if (this.focusArea === 'confirm-modal') {
            this.confirmModalAction(false);
            return;
        }
        if (this.currentScreen === 'player') {
            var overlay = document.getElementById('player-overlay');
            var overlayVisible = overlay && !overlay.classList.contains('hidden');
            if (overlayVisible) {
                // Overlay visible: hide it
                if (this.overlayTimer) {
                    clearTimeout(this.overlayTimer);
                    this.overlayTimer = null;
                }
                if (this.playerTracksFocused) {
                    this.unfocusPlayerTracks(true);
                } else {
                    overlay.classList.add('hidden');
                    var titleEl = document.getElementById('player-title');
                    var topRightEl = document.getElementById('player-top-right');
                    if (titleEl) titleEl.classList.add('hidden');
                    if (topRightEl) topRightEl.classList.add('hidden');
                }
                return;
            }
            // Catchup: show catchup modal instead of stopping
            if (this.currentPlayingType === 'catchup' && this.catchupParams && this.catchupParams.stream) {
                var stream = this.catchupParams.stream;
                this.returnToLiveAfterCatchup = true;
                this.player.stop();
                this.showScreen('browse');
                this.currentScreen = 'browse';
                this.showCatchupModal(stream);
                return;
            }
            // Overlay not visible: stop playback
            this.stopPlayback();
        } else if (this.currentScreen === 'lang') {
            this.showScreen('home');
            this.currentScreen = 'home';
            this.focusArea = 'langBtn';
            this.focusIndex = 0;
            this.updateFocus();
        } else if (this.currentScreen === 'continue') {
            this.showScreen('home');
            this.currentScreen = 'home';
            this.focusArea = 'home';
            this.focusIndex = this.lastHomeIndex;
            this.updateFocus();
        } else if (this.currentScreen === 'actor') {
            this.showScreen('details');
            this.currentScreen = 'details';
            this.focusArea = 'details';
            this.focusIndex = this.lastDetailsIndex;
            this.updateFocus();
        } else if (this.currentScreen === 'details') {
            if (this.previousScreen === 'actor' && this.currentActorId) {
                this.previousScreen = null;
                this.showActor(this.currentActorId);
            } else if (this.currentSection === 'history') {
                // Refresh history grid in case items were removed
                this.showHistoryScreen();
            } else {
                this.showScreen('browse');
                this.currentScreen = 'browse';
                this.focusArea = 'grid';
                this.focusIndex = this.lastGridIndex;
                this.updateGridProgress();
                this.updateFocus();
            }
        } else if (this.currentScreen === 'browse') {
            // Exit favorites edit mode if active
            if (this.favoritesEditMode) {
                this.favoritesEditMode = false;
                this.movingFavoriteIndex = -1;
                document.getElementById('content-grid').classList.remove('edit-mode');
                document.querySelectorAll('#content-grid .grid-item.moving').forEach(function(el) {
                    el.classList.remove('moving');
                });
                this.saveFavorites();
            }
            this.showScreen('home');
            this.currentScreen = 'home';
            this.focusArea = 'home';
            this.focusIndex = this.lastHomeIndex;
            this.updateFocus();
        } else if (this.currentScreen === 'settings') {
            this.showScreen('home');
            this.currentScreen = 'home';
            this.focusArea = 'home';
            this.updateHomeMenuVisibility();
            // Reconnect if IPTV settings changed
            if (this.isIPTVConfigured() && !this.api) {
                this.autoConnect();
            }
            this.focusIndex = this.isIPTVConfigured() ? this.lastHomeIndex : 0;
            this.clampHomeFocusIndex();
            this.updateFocus();
        } else if (this.currentScreen === 'playlists') {
            this.showSettings();
        } else if (this.currentScreen === 'playlist-edit') {
            this.showPlaylists();
        } else if (this.currentScreen === 'guide') {
            // Return to browse screen from guide
            this.stopGuideTimeIndicator();
            this.showScreen('browse');
            this.currentScreen = 'browse';
            this.focusArea = 'grid';
            // Find the Guide TV card in the grid and focus on it
            var guideIdx = 0;
            var gridItems = document.querySelectorAll('#content-grid .grid-item');
            gridItems.forEach(function(item, i) {
                if (item.dataset.categoryId === 'guide') guideIdx = i;
            });
            this.focusIndex = guideIdx;
            this.updateFocus();
        } else if (this.currentScreen === 'home') {
            window.log('ACTION exit');
            if (typeof tizen !== 'undefined') {
                tizen.application.getCurrentApplication().exit();
            }
        }
    }

    showScreen(screen) {
        window.log('SCREEN ' + screen);
        document.querySelectorAll('.screen').forEach(function(s) {
            s.classList.remove('active');
        });
        document.getElementById(screen + '-screen').classList.add('active');
        this.currentScreen = screen;
    }

    showLoading(show, posterUrl) {
        var backdrop = document.getElementById('loading-backdrop');
        var posterBg = backdrop.querySelector('.poster-bg');
        document.getElementById('loading').classList.toggle('hidden', !show);
        if (!show) {
            var imgDivs = document.querySelectorAll('#loading-backdrop .backdrop-img');
            for (var i = 0; i < imgDivs.length; i++) {
                imgDivs[i].style.backgroundImage = '';
            }
            backdrop.classList.remove('poster-mode');
            posterBg.style.backgroundImage = '';
        }
        else if (posterUrl) {
            backdrop.classList.add('poster-mode');
            posterBg.style.backgroundImage = cssUrl(posterUrl);
        }
        else {
            backdrop.classList.remove('poster-mode');
            posterBg.style.backgroundImage = '';
        }
    }

    showToast(message, duration) {
        duration = duration || 3000;
        var existing = document.getElementById('toast-message');
        if (existing) existing.remove();
        var toast = document.createElement('div');
        toast.id = 'toast-message';
        toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.9);color:#fff;padding:30px 50px;border-radius:12px;font-size:28px;z-index:10000;text-align:center;';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(function() {
            if (toast.parentNode) toast.remove();
        }, duration);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    window.app = new IPTVApp();
    window.app.init();
});
