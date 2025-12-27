/**
 * Storage module - Data persistence methods
 * Handles localStorage operations for settings, progress, favorites, cache
 */

// Watch History
IPTVApp.prototype.loadWatchHistory = function() {
    try {
        var data = localStorage.getItem('watchHistory');
        return data ? JSON.parse(data) : [];
    }
    catch (e) {
        return [];
    }
};

IPTVApp.prototype.saveWatchHistory = function() {
    try {
        var minMs = (this.settings.minProgressMinutes || 2) * 60000;
        // Only save items that meet minimum progress threshold
        var filtered = this.watchHistory.filter(function(item) {
            return item.position >= minMs || item.watched;
        });
        localStorage.setItem('watchHistory', JSON.stringify(filtered));
    }
    catch (e) {}
};

IPTVApp.prototype.getWatchHistoryItem = function(id) {
    for (var i = 0; i < this.watchHistory.length; i++) {
        if (this.watchHistory[i].id == id) {
            return this.watchHistory[i];
        }
    }
    return null;
};

IPTVApp.prototype.updateWatchHistoryProgress = function(id, position, duration) {
    if (!id || !duration || duration <= 0) return;
    var percent = Math.round((position / duration) * 100);
    var minMs = (this.settings.minProgressMinutes || 2) * 60000;
    var threshold = this.settings.watchedThreshold || 90;
    // Don't save if below minimum threshold
    if (position < minMs) return;
    // Find item in watchHistory
    var item = this.getWatchHistoryItem(id);
    if (!item) return;
    // Update progress
    item.position = position;
    item.duration = duration;
    item.percent = percent;
    item.date = Date.now();
    // Mark as watched if threshold reached
    if (percent >= threshold) {
        item.watched = true;
    }
    this.saveWatchHistory();
};

// Episode Progress
IPTVApp.prototype.loadEpisodeProgress = function() {
    try {
        var data = localStorage.getItem('episodeProgress');
        return data ? JSON.parse(data) : {};
    }
    catch (e) {
        return {};
    }
};

IPTVApp.prototype.saveEpisodeProgress = function() {
    try {
        localStorage.setItem('episodeProgress', JSON.stringify(this.episodeProgress));
    }
    catch (e) {}
};

IPTVApp.prototype.updateEpisodeProgress = function(episodeId, position, duration) {
    if (!episodeId || !duration || duration <= 0) return;
    var percent = Math.round((position / duration) * 100);
    this.episodeProgress[episodeId] = {
        position: position,
        duration: duration,
        percent: percent,
        watched: percent > 90,
        timestamp: Date.now()
    };
    this.saveEpisodeProgress();
    // Update series progress (last watched episode)
    if (this.currentPlayingStream && this.currentPlayingStream.series_id) {
        var seriesId = this.currentPlayingStream.series_id;
        var season = this.currentPlayingStream.season || this.currentSeason;
        var episode = this.currentPlayingStream.episode || this.currentEpisodeNum;
        if (season && episode) {
            this.updateSeriesProgress(seriesId, season, episode, episodeId);
        }
    }
};

// Series Progress (last watched episode per series)
IPTVApp.prototype.loadSeriesProgress = function() {
    try {
        var data = localStorage.getItem('seriesProgress');
        return data ? JSON.parse(data) : {};
    }
    catch (e) {
        return {};
    }
};

IPTVApp.prototype.saveSeriesProgress = function() {
    try {
        localStorage.setItem('seriesProgress', JSON.stringify(this.seriesProgress));
    }
    catch (e) {}
};

IPTVApp.prototype.updateSeriesProgress = function(seriesId, season, episode, episodeId) {
    if (!seriesId) return;
    var current = this.seriesProgress[seriesId];
    var seasonNum = parseInt(season);
    var episodeNum = parseInt(episode);
    // Only update if this episode is >= last watched
    if (!current || seasonNum > current.season ||
        (seasonNum === current.season && episodeNum >= current.episode)) {
        this.seriesProgress[seriesId] = {
            season: seasonNum,
            episode: episodeNum,
            episodeId: episodeId,
            timestamp: Date.now()
        };
        this.saveSeriesProgress();
    }
};

// TMDB Cache
IPTVApp.prototype.loadTMDBCache = function() {
    try {
        var data = localStorage.getItem('tmdbCache');
        return data ? JSON.parse(data) : {};
    }
    catch (e) {
        return {};
    }
};

IPTVApp.prototype.saveTMDBCache = function() {
    try {
        localStorage.setItem('tmdbCache', JSON.stringify(this.tmdbCache));
    }
    catch (e) {}
};

IPTVApp.prototype.getTMDBCacheKey = function(title, year) {
    return (title + '_' + (year || '')).toLowerCase();
};

// Settings
IPTVApp.prototype.loadSettings = function() {
    // Detect system language for default
    var systemLang = navigator.language || navigator.userLanguage || 'en';
    var defaultLocale = systemLang.split('-')[0].toLowerCase();
    var supportedLocales = ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'tr', 'ar'];
    if (supportedLocales.indexOf(defaultLocale) === -1) {
        defaultLocale = 'en';
    }
    var defaults = {
        locale: defaultLocale,
        tmdbApiKey: '',
        openSubtitlesApiKey: '',
        subDLApiKey: '',
        hideSD: true,
        hideHearingImpaired: true,
        minProgressMinutes: 2,
        watchedThreshold: 90,
        retentionWeeks: 4,
        subtitleSize: 'medium',
        subtitleStyle: 'shadow',
        playlists: [],
        activePlaylistId: null,
        secureSubtitles: true,
        debugMode: false,
        providerLanguage: 'ALL',
        viewMode: {},
        preferHtml5Player: false,
        dialogueBoost: false,
        historyMaxItems: 50,
        focusOnCategories: true,
        categoryPatterns: null
    };
    try {
        var data = localStorage.getItem('settings');
        var settings;
        if (data) {
            settings = JSON.parse(data);
            for (var key in defaults) {
                if (settings[key] === undefined) {
                    settings[key] = defaults[key];
                }
            }
        }
        else {
            settings = defaults;
        }
        // Apply dev config values if defined
        if (window.DEV_CONFIG) {
            var dev = window.DEV_CONFIG;
            if (dev.tmdbApiKey && !settings.tmdbApiKey) {
                settings.tmdbApiKey = dev.tmdbApiKey;
            }
            if (dev.openSubtitlesApiKey && !settings.openSubtitlesApiKey) {
                settings.openSubtitlesApiKey = dev.openSubtitlesApiKey;
            }
            if (dev.subdlApiKey && !settings.subDLApiKey) {
                settings.subDLApiKey = dev.subdlApiKey;
            }
            if (dev.providerLanguage && settings.providerLanguage === 'ALL') {
                settings.providerLanguage = dev.providerLanguage;
            }
            if (dev.categoryPatterns) {
                settings.categoryPatterns = dev.categoryPatterns;
            }
            if (dev.customCategories && (!settings.customCategories || settings.customCategories.length === 0)) {
                settings.customCategories = dev.customCategories;
            }
            // Add dev playlists if no playlists exist
            if (dev.playlists && dev.playlists.length > 0 && settings.playlists.length === 0) {
                settings.playlists = dev.playlists;
                settings.activePlaylistId = dev.activePlaylistId || dev.playlists[0].id;
            }
        }
        settings.debugMode = false;
        return settings;
    }
    catch (e) {
        return defaults;
    }
};

IPTVApp.prototype.saveSettings = function() {
    try {
        var toSave = Object.assign({}, this.settings);
        delete toSave.debugMode;
        localStorage.setItem('settings', JSON.stringify(toSave));
        this.initAPIs();
    }
    catch (e) {}
};

// Default category patterns by locale (defined in category-patterns.js)
IPTVApp.prototype.getDefaultCategoryPatterns = function(locale) {
    return DEFAULT_CATEGORY_PATTERNS[locale] || DEFAULT_CATEGORY_PATTERNS.en;
};

// Get effective category patterns (user settings or defaults)
IPTVApp.prototype.getCategoryPatterns = function() {
    if (this.settings.categoryPatterns) {
        return this.settings.categoryPatterns;
    }
    return this.getDefaultCategoryPatterns(this.settings.locale);
};

// Get entertainment keywords organized for sorting
// Returns { order: [...keywords for priority], last: [...keywords for end] }
IPTVApp.prototype.getEntertainmentSortKeywords = function() {
    var patterns = this.getCategoryPatterns();
    var ent = patterns.entertainment || {};
    // Priority order: spectacles, theatre, concerts (first), then others
    var order = (ent.spectacles || [])
        .concat(ent.theatre || [])
        .concat(ent.concerts || []);
    // Last: blindtest, karaoke
    var last = (ent.blindtest || []).concat(ent.karaoke || []);
    return { order: order, last: last };
};

// Default categories metadata (built-in categories)
IPTVApp.prototype.getDefaultCategories = function() {
    return [
        { id: 'sport', icon: '⚽', nameKey: 'home.sport', isDefault: true },
        { id: 'entertainment', icon: '🎭', nameKey: 'home.entertainment', isDefault: true, hasSubcategories: true },
        { id: 'manga', icon: '🇯🇵', nameKey: 'home.manga', isDefault: true }
    ];
};

// Get all categories (default + custom, excluding hidden)
IPTVApp.prototype.getAllCategories = function() {
    var hidden = this.settings.hiddenDefaultCategories || [];
    var defaults = this.getDefaultCategories().filter(function(cat) {
        return hidden.indexOf(cat.id) === -1;
    });
    var custom = this.settings.customCategories || [];
    return defaults.concat(custom);
};

// Hide a default category
IPTVApp.prototype.hideDefaultCategory = function(categoryId) {
    if (!this.settings.hiddenDefaultCategories) {
        this.settings.hiddenDefaultCategories = [];
    }
    if (this.settings.hiddenDefaultCategories.indexOf(categoryId) === -1) {
        this.settings.hiddenDefaultCategories.push(categoryId);
    }
    this.saveSettings();
};

// Restore a hidden default category
IPTVApp.prototype.restoreDefaultCategory = function(categoryId) {
    if (!this.settings.hiddenDefaultCategories) return;
    this.settings.hiddenDefaultCategories = this.settings.hiddenDefaultCategories.filter(function(id) {
        return id !== categoryId;
    });
    this.saveSettings();
};

// Add custom category
IPTVApp.prototype.addCustomCategory = function(name, icon) {
    if (!this.settings.customCategories) {
        this.settings.customCategories = [];
    }
    var id = 'custom_' + Date.now();
    var category = { id: id, name: name, icon: icon, isDefault: false, useTMDB: true };
    this.settings.customCategories.push(category);
    // Initialize empty patterns
    if (!this.settings.categoryPatterns) {
        this.settings.categoryPatterns = JSON.parse(JSON.stringify(this.getCategoryPatterns()));
    }
    this.settings.categoryPatterns[id] = [];
    this.saveSettings();
    return category;
};

// Remove custom category
IPTVApp.prototype.removeCustomCategory = function(categoryId) {
    if (!this.settings.customCategories) return;
    this.settings.customCategories = this.settings.customCategories.filter(function(c) {
        return c.id !== categoryId;
    });
    // Remove patterns
    if (this.settings.categoryPatterns && this.settings.categoryPatterns[categoryId]) {
        delete this.settings.categoryPatterns[categoryId];
    }
    this.saveSettings();
};

// Check if category has patterns
IPTVApp.prototype.categoryHasPatterns = function(categoryId) {
    var patterns = this.getCategoryPatterns();
    if (categoryId === 'entertainment') {
        return this.hasEntertainmentPatterns(patterns.entertainment);
    }
    var catPatterns = patterns[categoryId];
    return catPatterns && catPatterns.length > 0;
};

// Favorites
IPTVApp.prototype.loadFavorites = function() {
    try {
        var data = localStorage.getItem('favorites');
        return data ? JSON.parse(data) : [];
    }
    catch (e) {
        return [];
    }
};

IPTVApp.prototype.saveFavorites = function() {
    try {
        localStorage.setItem('favorites', JSON.stringify(this.favorites));
    }
    catch (e) {}
};

IPTVApp.prototype.isFavorite = function(streamId) {
    return this.favorites.some(function(f) {
        return (f.stream_id || f.series_id) == streamId;
    });
};

IPTVApp.prototype.toggleFavorite = function(stream, type) {
    window.log('toggleFavorite: type=' + type + ' stream=' + JSON.stringify(stream ? {id: stream.stream_id || stream.series_id, name: stream.name} : null));
    var id = stream.stream_id || stream.series_id;
    var idx = -1;
    for (var i = 0; i < this.favorites.length; i++) {
        var favId = this.favorites[i].stream_id || this.favorites[i].series_id;
        if (favId == id) {
            idx = i;
            break;
        }
    }
    if (idx >= 0) {
        this.favorites.splice(idx, 1);
    }
    else {
        stream._type = type;
        stream._section = this.currentSection;
        this.favorites.push(stream);
    }
    this.saveFavorites();
    this.updateFavoriteButton();
    this.updateFavoritesCounter();
    this.updateGridFavoriteIcon(id, idx < 0);
};

IPTVApp.prototype.removeFavoriteAtIndex = function(index) {
    if (index < 0 || index >= this.favorites.length) return;
    var grid = document.getElementById('content-grid');
    var items = grid.querySelectorAll('.grid-item');
    if (index >= items.length) return;
    // Remove from array
    this.favorites.splice(index, 1);
    // Remove DOM element
    items[index].remove();
    // Adjust focus
    if (this.favorites.length === 0) {
        // Show empty message
        grid.innerHTML = '<div style="color:#888;font-size:24px;padding:40px;">' + I18n.t('home.noFavorites') + '</div>';
        this.focusIndex = 0;
    }
    else if (this.focusIndex >= this.favorites.length) {
        this.focusIndex = this.favorites.length - 1;
    }
    this.saveFavorites();
    this.updateFavoritesCounter();
    this.updateFocus();
};

IPTVApp.prototype.toggleFavoriteAtIndex = function(index) {
    var grid = document.getElementById('content-grid');
    var items = grid.querySelectorAll('.grid-item');
    if (index >= items.length) return;
    var item = items[index];
    // In favorites section, remove
    if (this.currentSection === 'favorites') {
        this.removeFavoriteAtIndex(index);
        return;
    }
    // In other sections, toggle using currentStreams
    if (index >= this.currentStreams.length) return;
    var stream = this.currentStreams[index];
    var type = this.currentStreamType || this.currentSection;
    this.toggleFavorite(stream, type);
    // Update visual indicator on the item
    var isFav = this.isFavorite(stream.stream_id || stream.series_id);
    var favIcon = item.querySelector('.favorite-icon');
    if (isFav) {
        if (!favIcon) {
            favIcon = document.createElement('span');
            favIcon.className = 'favorite-icon';
            favIcon.textContent = '★';
            item.appendChild(favIcon);
        }
    }
    else {
        if (favIcon) favIcon.remove();
    }
};

IPTVApp.prototype.updateGridFavoriteIcon = function(streamId, isFavorite) {
    var grid = document.getElementById('content-grid');
    if (!grid) return;
    var item = grid.querySelector('.grid-item[data-stream-id="' + streamId + '"]');
    if (!item) return;
    var favIcon = item.querySelector('.favorite-icon');
    if (isFavorite) {
        if (!favIcon) {
            favIcon = document.createElement('span');
            favIcon.className = 'favorite-icon';
            favIcon.textContent = '★';
            item.appendChild(favIcon);
        }
    }
    else {
        if (favIcon) favIcon.remove();
    }
};

// Device ID
IPTVApp.prototype.getDeviceId = function() {
    // Try to get cached deviceId first
    try {
        var cached = localStorage.getItem('deviceId');
        if (cached) {
            return cached;
        }
    } catch (e) {}
    var result = '';
    var debug = [];
    debug.push('webapis:' + (typeof webapis !== 'undefined' ? 'yes' : 'no'));
    try {
        if (typeof webapis !== 'undefined' && webapis.network) {
            debug.push('net:yes');
            if (webapis.network.getMac) {
                var mac = webapis.network.getMac();
                debug.push('mac:' + (mac || 'null'));
                if (mac && !result) result = mac.replace(Regex.macColons, '').toLowerCase();
            }
            if (webapis.network.getWiFiMac) {
                var wifiMac = webapis.network.getWiFiMac();
                debug.push('wifi:' + (wifiMac || 'null'));
                if (wifiMac && !result) result = wifiMac.replace(Regex.macColons, '').toLowerCase();
            }
        }
        else {
            debug.push('net:no');
        }
    }
    catch (e) {
        debug.push('net-err:' + (e.message || e));
    }
    try {
        if (typeof webapis !== 'undefined' && webapis.productinfo) {
            debug.push('prod:yes');
            if (webapis.productinfo.getDuid) {
                var duid = webapis.productinfo.getDuid();
                debug.push('duid:' + (duid || 'null'));
                if (duid && !result) result = duid.toLowerCase();
            }
        }
        else {
            debug.push('prod:no');
        }
    }
    catch (e) {
        debug.push('prod-err:' + (e.message || e));
    }
    this.macDebug = debug.join(' | ');
    // Cache deviceId for future launches
    if (result) {
        try {
            localStorage.setItem('deviceId', result);
        } catch (e) {}
    }
    return result;
};

IPTVApp.prototype.isDevDevice = function() {
    if (!this.deviceId) {
        this.deviceId = this.getDeviceId();
    }
    return this.deviceId === DEV_DUID || this.deviceId === 'na';
};

IPTVApp.prototype.getDefaultSyncCode = function() {
    return this.isDevDevice() ? DEV_SYNC_CODE : '';
};
