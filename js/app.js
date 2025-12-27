/**
 * Samsung IPTV Application for Tizen TV
 * @class IPTVApp
 * @description Main application class handling IPTV streaming, navigation, and user settings.
 * Supports M3U playlists and Provider API for content streaming.
 */
var DEV_DUID = window.DEV_DUID || '';
var DEV_SYNC_CODE = window.DEV_SYNC_CODE || '';

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
        window.debugMode = this.settings.debugMode;
        this.hideSD = this.settings.hideSD;
        this.hideSM = this.settings.hideHearingImpaired;
        this.subtitleSize = this.settings.subtitleSize;
        this.subtitleStyle = this.settings.subtitleStyle;
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
        this.previousScreen = null;
        this.currentActorId = null;
        this.availableLanguages = [];
        this.localeToProviderLang = {
            'fr': 'FR',
            'en': 'UK',
            'es': 'ES',
            'de': 'DE',
            'it': 'IT',
            'pt': 'PT',
            'nl': 'NL',
            'pl': 'FR',
            'ru': 'FR',
            'tr': 'TR',
            'ar': 'AR'
        };
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
     * Initialize the application, setup event handlers, and start the app
     * @returns {void}
     */
    init() {
        var self = this;
        I18n.init();
        if (this.settings.locale) {
            I18n.setLocale(this.settings.locale);
        }
        this.player.init();
        this.player.setPreferHtml5(this.settings.preferHtml5Player);
        this.player.setDialogueBoost(this.settings.dialogueBoost);
        this.deviceId = this.getDeviceId();
        window.log('init deviceId=' + this.deviceId + ' isDevDevice=' + this.isDevDevice());
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
                self.focusIndex = 0;
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
        if (this.isDevDevice()) {
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
        // If no playlist configured, go directly to settings
        if (!this.isIPTVConfigured()) {
            this.showSettings();
        }
        else {
            if (this.favorites && this.favorites.length > 0) {
                this.focusIndex = 3;
            }
            this.updateFocus();
            this.autoConnect();
        }
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
                if (this.settings.playlists[i].id === this.settings.activePlaylistId) {
                    return this.settings.playlists[i];
                }
            }
        }
        // Return first playlist if active not found
        return this.settings.playlists[0];
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
        var providerOnlySections = ['vod', 'series', 'sport', 'manga', 'entertainment', 'continue', 'favorites'];
        // Check if pattern-based sections have keywords
        var patterns = this.getCategoryPatterns();
        var hasPatterns = {
            sport: patterns.sport && patterns.sport.length > 0,
            manga: patterns.manga && patterns.manga.length > 0,
            entertainment: this.hasEntertainmentPatterns(patterns.entertainment)
        };
        for (var i = 0; i < homeButtons.length; i++) {
            var btn = homeButtons[i];
            var section = btn.dataset.section;
            if (section === 'settings') {
                btn.style.display = '';
            } else if (!configured) {
                btn.style.display = 'none';
            } else if (isM3U && providerOnlySections.indexOf(section) !== -1) {
                btn.style.display = 'none';
            } else if (hasPatterns.hasOwnProperty(section) && !hasPatterns[section]) {
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
        var continueBtn = document.querySelector('#home-grid .home-btn[data-section="continue"]');
        if (!continueBtn) return;
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
            // Insert before continue button (keep Continue, Favorites, Settings last)
            continueBtn.parentNode.insertBefore(btn, continueBtn);
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
        return 4;
    }

    updateHomeGridLayout() {
        var grid = document.getElementById('home-grid');
        var cols = this.getHomeGridCols();
        grid.classList.remove('cols-2', 'cols-3', 'cols-4');
        grid.classList.add('cols-' + cols);
    }

    clampHomeFocusIndex() {
        var visibleCount = document.querySelectorAll('#home-grid .home-btn:not([style*="display: none"])').length;
        if (this.focusIndex >= visibleCount) {
            this.focusIndex = Math.max(0, visibleCount - 1);
        }
    }

    autoConnect() {
        var playlist = this.getActivePlaylist();
        if (!playlist) {
            window.log('autoConnect: no playlist');
            this.updateHomeMenuVisibility();
            return;
        }
        window.log('autoConnect: ' + playlist.type + ' ' + (playlist.name || playlist.serverUrl || playlist.url));
        this.showLoading(true);
        var self = this;
        // Safety timeout - hide loading after 10s if API doesn't respond
        var loadingTimeout = setTimeout(function() {
            window.log('autoConnect: timeout');
            self.showLoading(false);
        }, 10000);
        var done = function() {
            clearTimeout(loadingTimeout);
            self.showLoading(false);
        };
        if (playlist.type === 'provider') {
            this.api = new ProviderAPI(playlist.serverUrl, playlist.username, playlist.password);
            this.api.authenticate().then(function() {
                window.log('autoConnect: authenticated');
                return self.api.getVodCategories();
            }).then(function(categories) {
                window.log('autoConnect: got ' + categories.length + ' categories');
                self.detectLanguages(categories);
                self.updateHomeMenuVisibility();
                done();
            }).catch(function(err) {
                window.log('autoConnect provider error: ' + (err ? err.message || err : 'unknown'));
                self.updateHomeMenuVisibility();
                done();
            });
        }
        else if (playlist.type === 'm3u') {
            this.loadM3UPlaylist(playlist.url).then(function() {
                window.log('autoConnect: M3U loaded');
                self.updateHomeMenuVisibility();
                done();
            }).catch(function(err) {
                var errMsg = err ? (err.message || err.toString()) : 'Unknown error';
                window.log('autoConnect M3U error: ' + errMsg);
                self.updateHomeMenuVisibility();
                done();
            });
        }
        else {
            done();
        }
    }


    bindKeys() {
        var self = this;

        document.addEventListener('keydown', function(e) {
            var key = e.keyCode;

            var activeEl = document.activeElement;
            var isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
            if (isInput) {
                if (key === 38 || key === 40 || key === 10009 || key === 8) {
                    activeEl.blur();
                } else if (key === 13) {
                    return;
                } else {
                    return;
                }
            }

            switch (key) {
                case 37: // Left
                    if (self.focusArea === 'sub-options') {
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
                    if (self.focusArea === 'sub-options') {
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
                    if (self.focusArea === 'sub-options') {
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
                    if (self.focusArea === 'sub-options') {
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
                    if (self.focusArea === 'sub-options') {
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
                        this.focusIndex = this.lastSidebarIndex;
                        this.updateFocus();
                        return;
                    }
                    break;
                case 'right':
                    if (newIndex < filterCount - 1) newIndex++;
                    break;
                case 'down':
                    this.focusArea = 'grid';
                    this.focusIndex = 0;
                    this.updateFocus();
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
                            this.focusIndex = this.lastSidebarIndex;
                            this.updateFocus();
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
                    // In list view, right toggles favorite
                    if (isListView && !this.favoritesEditMode) {
                        this.toggleFavoriteAtIndex(this.focusIndex);
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
                selector = '#home-grid .focusable';
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
        var zoneOrder = ['favorite', 'actions', 'director', 'cast', 'seasons', 'episodes'];
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
        });

        var focusables = this.getFocusables();
        if (focusables[this.focusIndex]) {
            var el = focusables[this.focusIndex];
            el.classList.add('focused');
            if (this.focusArea === 'settings') {
                this.scrollSettingsToElement(el);
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
                }, 250);
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


    select() {
        var focusables = this.getFocusables();
        var current = focusables[this.focusIndex];
        if (!current) return;

        if (this.focusArea === 'modal') {
            this.confirmResume(this.focusIndex === 0);
            return;
        } else if (this.focusArea === 'tracks') {
            this.confirmTrackSelection();
            return;
        } else if (this.focusArea === 'pattern-modal') {
            if (current.id === 'pattern-save-btn') {
                this.closePatternEditor(true);
            } else if (current.id === 'pattern-cancel-btn') {
                this.closePatternEditor(false);
            } else if (current.id === 'pattern-add-btn') {
                var input = document.getElementById('pattern-add-input');
                this.addPatternKeyword(input.value);
            } else if (current.id === 'pattern-add-input' || current.id === 'pattern-category-name' || current.id === 'pattern-category-icon') {
                this.openKeyboard(current.id);
            } else if (current.classList.contains('pattern-chip')) {
                var keyword = current.dataset.keyword;
                var subcategory = current.dataset.subcategory;
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
            } else if (current.id === 'hide-sd-btn') {
                this.toggleHideSD();
            } else if (current.id === 'hide-sm-btn') {
                this.toggleHideSM();
            } else if (current.classList.contains('filter-input')) {
                this.openKeyboard(current.id);
            }
        } else if (this.focusArea === 'grid') {
            // In favorites edit mode, select/deselect item to move
            if (this.favoritesEditMode && (this.currentSection === 'favorites' || this.inFilteredFavorites)) {
                this.selectFavoriteToMove();
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

    addToWatchHistory(stream, type, position) {
        var self = this;
        var seriesId = stream.series_id || stream._seriesId;
        this.watchHistory = this.watchHistory.filter(function(item) {
            if (seriesId && item.seriesId) {
                return item.seriesId !== seriesId;
            }
            return item.id !== stream.stream_id && item.id !== stream.series_id;
        });
        var historyItem = {
            id: stream.stream_id || stream.series_id,
            name: stream.name || stream.title,
            cover: stream.stream_icon || stream.cover,
            type: type,
            position: position || 0,
            date: Date.now()
        };
        var seriesId = stream.series_id || stream._seriesId;
        if (seriesId) {
            historyItem.seriesId = seriesId;
            historyItem.season = stream.season || stream._season;
            historyItem.episode = stream.episode || stream._episode;
            historyItem.episodeTitle = stream.episodeTitle || stream._episodeTitle;
        }
        this.watchHistory.unshift(historyItem);

        var maxItems = this.settings.historyMaxItems || 50;
        if (this.watchHistory.length > maxItems) {
            this.watchHistory = this.watchHistory.slice(0, maxItems);
        }
        this.saveWatchHistory();
    }

    removeFromWatchHistory(id) {
        this.watchHistory = this.watchHistory.filter(function(item) {
            return item.id != id;
        });
        this.saveWatchHistory();
        this.showContinueScreen();
    }

    showContinueInGrid() {
        var container = document.getElementById('content-grid');
        container.innerHTML = '';
        var self = this;

        var filteredHistory = this.getFilteredContinueHistory();

        if (filteredHistory.length === 0) {
            container.innerHTML = '<div style="color:#888;font-size:24px;padding:40px;">' + I18n.t('home.noContinue') + '</div>';
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
                _episodeTitle: item.episodeTitle
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
            container.innerHTML = '<div style="color:#888;font-size:24px;padding:40px;">' + I18n.t('home.noFavorites') + '</div>';
            return;
        }
        this.originalStreams = filteredFavorites;
        this.currentStreams = filteredFavorites;
        this.currentStreamType = section === 'live' ? 'live' : (section === 'series' ? 'series' : 'vod');
        this.displayedCount = 0;
        this.loadMoreItems();
        this.focusArea = 'grid';
        this.focusIndex = 0;
        this.updateFocus();
    }

    showContinueScreen() {
        this.currentSection = 'continue';
        this.currentStreamType = 'continue';
        this.showScreen('browse');
        this.currentScreen = 'browse';
        document.getElementById('sidebar-title').textContent = I18n.t('home.continueWatching');
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
            document.getElementById('content-grid').innerHTML = '<div style="color:#888;font-size:24px;padding:40px;">' + I18n.t('home.noContinue') + '</div>';
        }
        else {
            this.renderGrid(streams, 'continue');
        }
        this.focusArea = 'grid';
        this.focusIndex = 0;
        this.updateFocus();
    }

    showFavoritesScreen() {
        this.currentSection = 'favorites';
        this.currentStreamType = 'favorites';
        this.favoritesEditMode = false;
        this.inFilteredFavorites = false;
        this.filteredFavoriteIndices = null;
        this.showScreen('browse');
        this.currentScreen = 'browse';
        document.getElementById('sidebar-title').textContent = I18n.t('home.favorites');
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
            document.getElementById('content-grid').innerHTML = '<div style="color:#888;font-size:24px;padding:40px;">' + I18n.t('home.noFavorites') + '</div>';
        } else {
            this.renderGrid(this.favorites, 'favorites');
        }
        this.focusArea = 'grid';
        this.focusIndex = 0;
        this.updateFocus();
    }

    toggleFavoritesEditMode() {
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
        }
        this.showScreen('player');
        this.currentScreen = 'player';
        this.player.play(url);
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
        this.showLoading(false);
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
            if (this.playerTracksFocused) {
                this.unfocusPlayerTracks();
                return;
            }
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
            this.focusIndex = this.getDetailsPlayIndex();
            this.updateFocus();
        } else if (this.currentScreen === 'details') {
            if (this.previousScreen === 'actor' && this.currentActorId) {
                this.previousScreen = null;
                this.showActor(this.currentActorId);
            } else if (this.currentSection === 'favorites') {
                // Refresh favorites grid in case items were removed
                this.showFavoritesScreen();
            } else if (this.currentSection === 'continue') {
                // Refresh continue grid in case items were removed
                this.showContinueScreen();
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
        } else if (this.currentScreen === 'home') {
            if (typeof tizen !== 'undefined') {
                tizen.application.getCurrentApplication().exit();
            }
        }
    }

    showScreen(screen) {
        document.querySelectorAll('.screen').forEach(function(s) {
            s.classList.remove('active');
        });
        document.getElementById(screen + '-screen').classList.add('active');
        this.currentScreen = screen;
    }

    showLoading(show) {
        document.getElementById('loading').classList.toggle('hidden', !show);
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
