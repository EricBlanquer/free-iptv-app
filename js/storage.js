/**
 * Storage module - Data persistence methods
 * Handles localStorage operations for settings, progress, favorites, cache
 */

// Memory monitoring
IPTVApp.prototype.logMemory = function(label) {
    if (performance && performance.memory) {
        var used = Math.round(performance.memory.usedJSHeapSize / 1048576);
        var total = Math.round(performance.memory.totalJSHeapSize / 1048576);
        var limit = Math.round(performance.memory.jsHeapSizeLimit / 1048576);
        window.log('MEMORY ' + (label || '') + ': ' + used + 'MB / ' + total + 'MB (limit: ' + limit + 'MB)');
    }
};

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
        localStorage.setItem('watchHistory', JSON.stringify(this.watchHistory));
        if (typeof DevRemoteSync !== 'undefined' && DevRemoteSync.isDevDevice) {
            DevRemoteSync.save(DevRemoteSync.getAllData(this));
        }
    }
    catch (e) {}
};

IPTVApp.prototype.getWatchHistoryItem = function(id, playlistId) {
    // If playlistId provided, match both id and playlistId
    if (playlistId) {
        for (var i = 0; i < this.watchHistory.length; i++) {
            if (this.watchHistory[i].id == id && this.watchHistory[i].playlistId == playlistId) {
                return this.watchHistory[i];
            }
        }
    }
    // Try to match with current playing stream's playlistId
    var currentPlaylistId = this.currentPlayingStream && this.currentPlayingStream._playlistId;
    if (currentPlaylistId) {
        for (var i = 0; i < this.watchHistory.length; i++) {
            if (this.watchHistory[i].id == id && this.watchHistory[i].playlistId == currentPlaylistId) {
                return this.watchHistory[i];
            }
        }
    }
    // Fallback: match by id only (first match)
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
        if (!data) return {};
        var parsed = JSON.parse(data);
        // Clean sparse arrays (remove null values)
        var clean = {};
        for (var key in parsed) {
            if (parsed.hasOwnProperty(key) && parsed[key] != null) {
                clean[key] = parsed[key];
            }
        }
        return clean;
    }
    catch (e) {
        return {};
    }
};

IPTVApp.prototype.saveEpisodeProgress = function() {
    try {
        localStorage.setItem('episodeProgress', JSON.stringify(this.episodeProgress));
        if (typeof DevRemoteSync !== 'undefined' && DevRemoteSync.isDevDevice) {
            DevRemoteSync.save(DevRemoteSync.getAllData(this));
        }
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
        if (!data) return {};
        var parsed = JSON.parse(data);
        // Clean sparse arrays (remove null values)
        var clean = {};
        for (var key in parsed) {
            if (parsed.hasOwnProperty(key) && parsed[key] != null) {
                clean[key] = parsed[key];
            }
        }
        return clean;
    }
    catch (e) {
        return {};
    }
};

IPTVApp.prototype.saveSeriesProgress = function() {
    try {
        localStorage.setItem('seriesProgress', JSON.stringify(this.seriesProgress));
        if (typeof DevRemoteSync !== 'undefined' && DevRemoteSync.isDevDevice) {
            DevRemoteSync.save(DevRemoteSync.getAllData(this));
        }
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

// Provider Data Cache (12h expiration) - Using IndexedDB for larger capacity
var PROVIDER_CACHE_TTL = 12 * 60 * 60 * 1000;
var PROVIDER_CACHE_DB_NAME = 'IPTVProviderCache';
var PROVIDER_CACHE_STORE_NAME = 'cache';
var PROVIDER_CACHE_DB_VERSION = 1;

// Initialize IndexedDB for provider cache
IPTVApp.prototype.initProviderCacheDB = function() {
    var self = this;
    if (this._providerCacheDB) {
        return Promise.resolve(this._providerCacheDB);
    }
    if (this._providerCacheDBPromise) {
        return this._providerCacheDBPromise;
    }
    this._providerCacheDBPromise = new Promise(function(resolve, reject) {
        if (!window.indexedDB) {
            window.log('IndexedDB not supported, falling back to memory cache');
            resolve(null);
            return;
        }
        var request = indexedDB.open(PROVIDER_CACHE_DB_NAME, PROVIDER_CACHE_DB_VERSION);
        request.onerror = function(event) {
            window.log('IndexedDB open error: ' + event.target.error);
            resolve(null);
        };
        request.onsuccess = function(event) {
            self._providerCacheDB = event.target.result;
            window.log('IndexedDB opened successfully');
            resolve(self._providerCacheDB);
        };
        request.onupgradeneeded = function(event) {
            var db = event.target.result;
            if (!db.objectStoreNames.contains(PROVIDER_CACHE_STORE_NAME)) {
                db.createObjectStore(PROVIDER_CACHE_STORE_NAME, { keyPath: 'playlistId' });
                window.log('IndexedDB store created');
            }
        };
    });
    return this._providerCacheDBPromise;
};

IPTVApp.prototype.getProviderCacheKey = function(playlistId) {
    return playlistId || 'default';
};

IPTVApp.prototype.loadProviderCache = function(playlistId) {
    var self = this;
    // For merged mode, load individual provider caches and merge them in memory
    if (playlistId === 'merged') {
        return this.loadMergedProviderCache();
    }
    // Try local IndexedDB first (fastest)
    return this.loadProviderCacheLocal(playlistId).then(function(localData) {
        if (localData) {
            return localData;
        }
        window.log('Provider cache LOCAL miss for ' + playlistId + ', trying remote...');
        // Try remote cache if local not available
        if (typeof DevRemoteSync !== 'undefined' && DevRemoteSync.isDevDevice) {
            return DevRemoteSync.loadProviderCache(playlistId).then(function(remoteCache) {
                if (remoteCache && remoteCache.timestamp && Date.now() - remoteCache.timestamp < PROVIDER_CACHE_TTL) {
                    window.log('Provider cache hit from REMOTE for ' + playlistId + ' (age: ' + Math.round((Date.now() - remoteCache.timestamp) / 60000) + 'min)');
                    // Save to local IndexedDB for faster access next time
                    self.saveProviderCacheLocal(playlistId, remoteCache.data, remoteCache.timestamp);
                    return remoteCache.data;
                }
                return null;
            });
        }
        return null;
    });
};

// Load and merge caches from all individual providers (no separate merged cache)
IPTVApp.prototype.loadMergedProviderCache = function() {
    var self = this;
    var playlists = this.settings.playlists || [];
    if (playlists.length === 0) {
        return Promise.resolve(null);
    }
    window.log('loadMergedProviderCache: loading ' + playlists.length + ' individual caches...');
    var promises = playlists.map(function(playlist) {
        var id = playlist.id || playlist.name;
        // Load individual cache (will try local then remote)
        return self.loadProviderCacheLocal(id).then(function(localData) {
            if (localData) {
                return { playlistId: id, cache: localData };
            }
            // Try remote for this provider
            if (typeof DevRemoteSync !== 'undefined' && DevRemoteSync.isDevDevice) {
                return DevRemoteSync.loadProviderCache(id).then(function(remoteCache) {
                    if (remoteCache && remoteCache.timestamp && Date.now() - remoteCache.timestamp < PROVIDER_CACHE_TTL) {
                        window.log('loadMergedProviderCache: got remote cache for ' + id);
                        self.saveProviderCacheLocal(id, remoteCache.data, remoteCache.timestamp);
                        return { playlistId: id, cache: remoteCache.data };
                    }
                    return { playlistId: id, cache: null };
                });
            }
            return { playlistId: id, cache: null };
        });
    });
    return Promise.all(promises).then(function(results) {
        var merged = {};
        var foundAny = false;
        var stats = { live: 0, vod: 0, series: 0 };
        var needsRefreshIds = [];
        results.forEach(function(result) {
            if (!result.cache) return;
            foundAny = true;
            // Track which providers need background refresh
            if (result.cache._needsRefresh) {
                needsRefreshIds.push(result.playlistId);
            }
            ['live', 'vod', 'series'].forEach(function(section) {
                var sectionData = result.cache[section];
                if (!sectionData) return;
                if (!merged[section]) {
                    merged[section] = { categories: [], streams: [] };
                }
                var cats = sectionData.categories || [];
                var streams = sectionData.streams || [];
                // Add playlistId to each item for tracking source
                cats.forEach(function(c) { c._playlistId = result.playlistId; });
                streams.forEach(function(s) { s._playlistId = result.playlistId; });
                merged[section].categories = merged[section].categories.concat(cats);
                merged[section].streams = merged[section].streams.concat(streams);
                stats[section] += streams.length;
            });
        });
        if (foundAny) {
            var loadedCount = results.filter(function(r) { return r.cache; }).length;
            window.log('loadMergedProviderCache: merged ' + loadedCount + '/' + playlists.length + ' providers - live:' + stats.live + ' vod:' + stats.vod + ' series:' + stats.series);
            // Pass list of providers needing refresh
            if (needsRefreshIds.length > 0) {
                merged._needsRefreshIds = needsRefreshIds;
            }
            return merged;
        }
        window.log('loadMergedProviderCache: no caches found');
        return null;
    });
};

IPTVApp.prototype.loadProviderCacheLocal = function(playlistId) {
    var self = this;
    var key = this.getProviderCacheKey(playlistId);
    return this.initProviderCacheDB().then(function(db) {
        if (!db) {
            return null;
        }
        return new Promise(function(resolve) {
            try {
                var transaction = db.transaction([PROVIDER_CACHE_STORE_NAME], 'readonly');
                var store = transaction.objectStore(PROVIDER_CACHE_STORE_NAME);
                var request = store.get(key);
                request.onsuccess = function(event) {
                    var cache = event.target.result;
                    if (!cache) {
                        resolve(null);
                        return;
                    }
                    var ageMinutes = cache.timestamp ? Math.round((Date.now() - cache.timestamp) / 60000) : 0;
                    var needsRefresh = !cache.timestamp || Date.now() - cache.timestamp > PROVIDER_CACHE_TTL;
                    if (needsRefresh) {
                        window.log('Provider cache stale for ' + playlistId + ' (age: ' + ageMinutes + 'min), will refresh in background');
                        // Mark data as needing background refresh
                        cache.data._needsRefresh = true;
                        cache.data._playlistId = playlistId;
                    }
                    else {
                        window.log('Provider cache hit from LOCAL for ' + playlistId + ' (age: ' + ageMinutes + 'min)');
                    }
                    resolve(cache.data);
                };
                request.onerror = function() {
                    resolve(null);
                };
            }
            catch (e) {
                window.log('loadProviderCacheLocal error: ' + e.message);
                resolve(null);
            }
        });
    });
};

IPTVApp.prototype.saveProviderCache = function(playlistId, data) {
    var key = this.getProviderCacheKey(playlistId);
    var timestamp = Date.now();
    // Also save to remote (debounced)
    if (typeof DevRemoteSync !== 'undefined' && DevRemoteSync.isDevDevice) {
        DevRemoteSync.saveProviderCache(playlistId, { data: data, timestamp: timestamp });
    }
    return this.initProviderCacheDB().then(function(db) {
        if (!db) {
            window.log('Provider cache save skipped (no IndexedDB)');
            return;
        }
        return new Promise(function(resolve) {
            try {
                var transaction = db.transaction([PROVIDER_CACHE_STORE_NAME], 'readwrite');
                var store = transaction.objectStore(PROVIDER_CACHE_STORE_NAME);
                var cache = {
                    playlistId: key,
                    timestamp: timestamp,
                    data: data
                };
                var request = store.put(cache);
                request.onsuccess = function() {
                    window.log('Provider cache saved for ' + playlistId);
                    resolve(true);
                };
                request.onerror = function(event) {
                    window.log('Provider cache save failed: ' + event.target.error);
                    resolve(false);
                };
            }
            catch (e) {
                window.log('saveProviderCache error: ' + e.message);
                resolve(false);
            }
        });
    });
};

// Save to local IndexedDB only (no remote sync - used when copying from remote to local)
IPTVApp.prototype.saveProviderCacheLocal = function(playlistId, data, timestamp) {
    var key = this.getProviderCacheKey(playlistId);
    return this.initProviderCacheDB().then(function(db) {
        if (!db) return;
        return new Promise(function(resolve) {
            try {
                var transaction = db.transaction([PROVIDER_CACHE_STORE_NAME], 'readwrite');
                var store = transaction.objectStore(PROVIDER_CACHE_STORE_NAME);
                var cache = {
                    playlistId: key,
                    timestamp: timestamp || Date.now(),
                    data: data
                };
                var request = store.put(cache);
                request.onerror = function(e) {
                    window.log('Provider cache LOCAL save error for ' + playlistId + ': ' + (e.target.error || 'unknown'));
                    resolve(false);
                };
                transaction.oncomplete = function() {
                    window.log('Provider cache saved locally for ' + playlistId);
                    resolve(true);
                };
                transaction.onerror = function(e) {
                    window.log('Provider cache LOCAL transaction error for ' + playlistId + ': ' + (e.target.error || 'unknown'));
                    resolve(false);
                };
            }
            catch (e) {
                window.log('Provider cache LOCAL exception for ' + playlistId + ': ' + e.message);
                resolve(false);
            }
        });
    });
};

// Refresh provider cache in background (non-blocking)
IPTVApp.prototype.refreshProviderCacheBackground = function(playlistId) {
    var self = this;
    // Prevent multiple concurrent refreshes for the same playlist
    if (!this._backgroundRefreshInProgress) {
        this._backgroundRefreshInProgress = {};
    }
    if (this._backgroundRefreshInProgress[playlistId]) {
        window.log('Background refresh already in progress for ' + playlistId);
        return;
    }
    this._backgroundRefreshInProgress[playlistId] = true;
    window.log('Starting background refresh for provider ' + playlistId);
    // Find the playlist config
    var playlist = (this.settings.playlists || []).find(function(p) {
        return p.id === playlistId || p.name === playlistId;
    });
    if (!playlist || playlist.type !== 'provider') {
        window.log('Background refresh: playlist not found or not a provider');
        delete this._backgroundRefreshInProgress[playlistId];
        return;
    }
    // Create a temporary API instance for background refresh
    var api = new ProviderAPI(playlist.serverUrl, playlist.username, playlist.password, this.settings.proxyUrl);
    api.playlistId = playlist.id;
    api.authenticate().then(function() {
        window.log('Background refresh: authenticated for ' + playlistId);
        return api.preloadCachePromise();
    }).then(function() {
        window.log('Background refresh: cache loaded for ' + playlistId);
        // Filter by language
        api.filterCacheByLanguage(function(catName) {
            return self.matchesLanguage(catName);
        });
        // Build cache data
        var cacheData = {
            vod: {
                categories: api.cache.vodCategories,
                streams: api.cache.vodStreams['_all']
            },
            series: {
                categories: api.cache.seriesCategories,
                streams: api.cache.series['_all']
            },
            live: {
                categories: api.cache.liveCategories,
                streams: api.cache.liveStreams['_all']
            }
        };
        return self.saveProviderCache(playlistId, cacheData);
    }).then(function() {
        window.log('Background refresh complete for ' + playlistId);
        delete self._backgroundRefreshInProgress[playlistId];
    }).catch(function(err) {
        window.log('Background refresh failed for ' + playlistId + ': ' + (err ? err.message || err : 'unknown'));
        delete self._backgroundRefreshInProgress[playlistId];
    });
};

IPTVApp.prototype.clearProviderCache = function(playlistId) {
    var self = this;
    return this.initProviderCacheDB().then(function(db) {
        if (!db) {
            return;
        }
        return new Promise(function(resolve) {
            try {
                var transaction = db.transaction([PROVIDER_CACHE_STORE_NAME], 'readwrite');
                var store = transaction.objectStore(PROVIDER_CACHE_STORE_NAME);
                if (playlistId) {
                    var key = self.getProviderCacheKey(playlistId);
                    store.delete(key);
                }
                else {
                    store.clear();
                }
                transaction.oncomplete = function() {
                    window.log('Provider cache cleared' + (playlistId ? ' for ' + playlistId : ''));
                    resolve();
                };
                transaction.onerror = function() {
                    resolve();
                };
            }
            catch (e) {
                window.log('clearProviderCache error: ' + e.message);
                resolve();
            }
        });
    });
};

IPTVApp.prototype.cacheProviderData = function(playlistId, section, categories, streams) {
    var self = this;
    // Don't save merged cache - it's built from individual caches on demand
    if (playlistId === 'merged') {
        window.log('cacheProviderData: skipping merged cache (built from individual caches)');
        return Promise.resolve();
    }
    var key = this.getProviderCacheKey(playlistId);
    return this.loadProviderCache(playlistId).then(function(existingData) {
        var cache = existingData || {};
        // Cache both categories and streams (IndexedDB has much larger capacity)
        cache[section] = {
            categories: categories,
            streams: streams
        };
        return self.saveProviderCache(playlistId, cache);
    }).catch(function(e) {
        window.log('cacheProviderData error: ' + e.message);
    });
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
        proxyUrl: '',
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
        providerLanguage: 'ALL',
        viewMode: {},
        preferHtml5Player: false,
        dialogueBoost: false,
        historyMaxItems: 50,
        focusOnCategories: false,
        categoryPatterns: null,
        textSize: 'medium'
    };
    try {
        var data = localStorage.getItem('settings');
        var settings;
        var hasSavedSettings = !!data;
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
            // API keys are always used as fallback (not editable by user)
            if (dev.tmdbApiKey && !settings.tmdbApiKey) {
                settings.tmdbApiKey = dev.tmdbApiKey;
            }
            if (dev.openSubtitlesApiKey && !settings.openSubtitlesApiKey) {
                settings.openSubtitlesApiKey = dev.openSubtitlesApiKey;
            }
            if (dev.subdlApiKey && !settings.subDLApiKey) {
                settings.subDLApiKey = dev.subdlApiKey;
            }
            if (dev.proxyUrl && !settings.proxyUrl) {
                settings.proxyUrl = dev.proxyUrl;
            }
            // Other DEV_CONFIG values only apply if no saved settings exist
            if (!hasSavedSettings) {
                if (dev.providerLanguage) {
                    settings.providerLanguage = dev.providerLanguage;
                }
                if (dev.categoryPatterns) {
                    settings.categoryPatterns = dev.categoryPatterns;
                }
                if (dev.customCategories) {
                    settings.customCategories = dev.customCategories;
                }
                if (dev.playlists && dev.playlists.length > 0) {
                    settings.playlists = dev.playlists;
                    settings.activePlaylistId = dev.activePlaylistId || dev.playlists[0].id;
                }
            }
        }
        window.log('Settings loaded, customCategories: ' + (settings.customCategories ? settings.customCategories.length : 0));
        return settings;
    }
    catch (e) {
        window.log('Error loading settings: ' + e.message);
        return defaults;
    }
};

IPTVApp.prototype.saveSettings = function() {
    try {
        var toSave = Object.assign({}, this.settings);
        toSave._syncTime = Date.now();
        localStorage.setItem('settings', JSON.stringify(toSave));
        window.log('Settings saved, customCategories: ' + (toSave.customCategories ? toSave.customCategories.length : 0));
        this.initAPIs();
        if (typeof DevRemoteSync !== 'undefined' && DevRemoteSync.isDevDevice) {
            DevRemoteSync.save(DevRemoteSync.getAllData(this));
        }
    }
    catch (e) {
        window.log('Error saving settings: ' + e.message);
    }
};

// Default category patterns by locale (from I18nData)
IPTVApp.prototype.getDefaultCategoryPatterns = function(locale) {
    var map = I18nData.categoryPatternsMap || {};
    return map[locale] || map.en || {};
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
        if (typeof DevRemoteSync !== 'undefined' && DevRemoteSync.isDevDevice) {
            DevRemoteSync.save(DevRemoteSync.getAllData(this));
        }
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
        grid.innerHTML = '<div style="color:#888;font-size:24px;padding:40px;">' + I18n.t('home.noFavorites', 'No favorites') + '</div>';
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
    window.log('ACTION toggleFavoriteAtIndex: ' + index);
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

// Remove item from history by ID
IPTVApp.prototype.removeFromHistory = function(id) {
    var idx = -1;
    for (var i = 0; i < this.watchHistory.length; i++) {
        if (this.watchHistory[i].id == id) {
            idx = i;
            break;
        }
    }
    if (idx >= 0) {
        this.watchHistory.splice(idx, 1);
        this.saveWatchHistory();
        return true;
    }
    return false;
};

// Remove history item at grid index (with confirmation)
IPTVApp.prototype.removeHistoryAtIndex = function(index) {
    var grid = document.getElementById('content-grid');
    var items = grid.querySelectorAll('.grid-item');
    if (index >= items.length) return;
    if (index >= this.currentStreams.length) return;
    var stream = this.currentStreams[index];
    var name = this.formatDisplayTitle(this.cleanTitle(stream.name || ''));
    var self = this;
    this.showConfirmModal(I18n.t('settings.confirmDeleteHistory', 'Delete history?', { name: name }), function() {
        self.doRemoveHistoryAtIndex(index);
    });
};

// Actually remove history item (after confirmation)
IPTVApp.prototype.doRemoveHistoryAtIndex = function(index) {
    var grid = document.getElementById('content-grid');
    var items = grid.querySelectorAll('.grid-item');
    if (index >= items.length) return;
    var item = items[index];
    if (index >= this.currentStreams.length) return;
    var stream = this.currentStreams[index];
    var id = stream.stream_id || stream.series_id;
    if (this.removeFromHistory(id)) {
        // Remove from currentStreams
        this.currentStreams.splice(index, 1);
        // Remove DOM element with animation
        item.style.transition = 'opacity 0.2s, transform 0.2s';
        item.style.opacity = '0';
        item.style.transform = 'translateX(50px)';
        var self = this;
        setTimeout(function() {
            item.remove();
            // Update focus
            if (self.focusIndex >= self.currentStreams.length) {
                self.focusIndex = Math.max(0, self.currentStreams.length - 1);
            }
            self.updateFocus();
            // Show empty message if no more items
            if (self.currentStreams.length === 0) {
                grid.innerHTML = '<div style="color:#888;font-size:24px;padding:40px;">' + I18n.t('home.noHistory', 'No viewing history') + '</div>';
            }
        }, 200);
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

// Loading backdrop images
IPTVApp.prototype.loadBackdropImages = function() {
    try {
        var data = localStorage.getItem('loadingBackdrops');
        return data ? JSON.parse(data) : [];
    }
    catch (e) {
        return [];
    }
};

IPTVApp.prototype.saveBackdropImages = function() {
    if (!this.api || !this.api.cache) return;
    var vodStreams = this.api.cache.vodStreams && this.api.cache.vodStreams['_all'] || [];
    var vodCategories = this.api.cache.vodCategories || [];
    var self = this;
    // Build exclusion patterns (same as VOD section in browse.js)
    var patterns = this.getCategoryPatterns();
    var hiddenCategories = this.settings.hiddenDefaultCategories || [];
    var keywordsToPatterns = function(keywords) {
        return keywords.map(function(kw) {
            return Regex.keywordPattern(kw);
        });
    };
    // Only exclude categories that are NOT hidden (hidden ones should appear in Films)
    var sportPatterns = hiddenCategories.indexOf('sport') === -1 ? keywordsToPatterns(patterns.sport || []) : [];
    var mangaPatterns = hiddenCategories.indexOf('manga') === -1 ? keywordsToPatterns(patterns.manga || []) : [];
    var ent = patterns.entertainment || {};
    var entertainmentPatterns = hiddenCategories.indexOf('entertainment') === -1 ? keywordsToPatterns(ent.concerts || [])
        .concat(keywordsToPatterns(ent.theatre || []))
        .concat(keywordsToPatterns(ent.spectacles || []))
        .concat(keywordsToPatterns(ent.blindtest || []))
        .concat(keywordsToPatterns(ent.karaoke || [])) : [];
    var allSpecialPatterns = sportPatterns.concat(entertainmentPatterns).concat(mangaPatterns);
    // Add custom category patterns
    var customCategories = this.settings.customCategories || [];
    customCategories.forEach(function(cat) {
        var kws = patterns[cat.id] || cat.keywords || [];
        allSpecialPatterns = allSpecialPatterns.concat(keywordsToPatterns(kws));
    });
    // Build category_id -> category_name map
    var catMap = {};
    vodCategories.forEach(function(c) {
        catMap[c.category_id] = c.category_name || '';
    });
    // Filter streams: language match + exclude special categories
    var filtered = vodStreams.filter(function(s) {
        var catName = catMap[s.category_id] || '';
        if (!self.matchesLanguage(catName)) return false;
        return !allSpecialPatterns.some(function(p) { return p.test(catName); });
    });
    // Sort by added date descending (most recent first)
    var sorted = filtered.sort(function(a, b) {
        var dateA = a.added || '0';
        var dateB = b.added || '0';
        return dateB.localeCompare(dateA);
    });
    // Get up to 20 unique images from most recent VOD
    var images = [];
    var seen = {};
    for (var i = 0; i < sorted.length && images.length < 20; i++) {
        var img = sorted[i].stream_icon || sorted[i].cover;
        if (img && img.length > 10 && !seen[img]) {
            seen[img] = true;
            images.push(img);
        }
    }
    try {
        localStorage.setItem('loadingBackdrops', JSON.stringify(images));
    }
    catch (e) {}
};

IPTVApp.prototype.preloadBackdropImages = function() {
    // Preload images into browser cache
    var images = this.loadBackdropImages();
    for (var i = 0; i < images.length; i++) {
        var img = new Image();
        img.src = images[i];
    }
};

IPTVApp.prototype.showLoadingBackdrop = function() {
    var images = this.loadBackdropImages();
    window.log('showLoadingBackdrop: ' + images.length + ' images in cache');
    if (images.length === 0) {
        return;
    }
    var backdrop = document.getElementById('loading-backdrop');
    if (!backdrop) return;
    var imgDivs = backdrop.querySelectorAll('.backdrop-img');
    // Fisher-Yates shuffle and pick 3 unique images
    var shuffled = images.slice();
    for (var i = shuffled.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = temp;
    }
    for (var i = 0; i < imgDivs.length && i < shuffled.length; i++) {
        (function(div, url) {
            var img = new Image();
            img.onload = function() {
                div.style.backgroundImage = cssUrl(url);
            };
            img.src = url;
        })(imgDivs[i], shuffled[i]);
    }
};

