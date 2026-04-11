/**
 * Storage module - Data persistence methods
 * Handles localStorage operations for settings, progress, favorites, cache
 */

IPTVApp.prototype.getUniqueId = function(streamOrId, playlistId) {
    if (typeof streamOrId === 'object' && streamOrId !== null) {
        var id = streamOrId.stream_id || streamOrId.series_id || streamOrId.id || streamOrId.episodeId;
        var pId = streamOrId._playlistId || streamOrId.playlistId || playlistId || this.settings.activePlaylistId || '';
        return pId + '_' + id;
    }
    var pId = playlistId || this.settings.activePlaylistId || '';
    return pId + '_' + streamOrId;
};

IPTVApp.prototype.parseUniqueId = function(uniqueId) {
    if (!uniqueId || typeof uniqueId !== 'string') return { playlistId: null, id: uniqueId };
    var idx = uniqueId.indexOf('_');
    if (idx === -1) return { playlistId: null, id: uniqueId };
    return {
        playlistId: uniqueId.substring(0, idx),
        id: uniqueId.substring(idx + 1)
    };
};

IPTVApp.prototype.logMemory = function(label) {
    if (window.performance && performance.memory) {
        var m = performance.memory;
        var used = Math.round(m.usedJSHeapSize / 1048576);
        var total = Math.round(m.totalJSHeapSize / 1048576);
        var limit = Math.round(m.jsHeapSizeLimit / 1048576);
        window.log('MEM', label + ' | ' + used + '/' + total + 'MB (limit ' + limit + 'MB)');
    }
};

IPTVApp.prototype.checkMemoryPressure = function() {
    if (!window.performance || !performance.memory) return 0;
    var m = performance.memory;
    return Math.round((m.usedJSHeapSize / m.jsHeapSizeLimit) * 100);
};

IPTVApp.prototype.handleMemoryPressure = function(percent) {
    if (percent > 85) {
        window.log('MEM', 'Memory pressure ' + percent + '%, purging TMDB cache');
        this.tmdbCache = {};
        this.saveTMDBCache();
        if (this._imageLoadQueue) this._imageLoadQueue = [];
    }
    if (percent > 90) {
        window.log('MEM', 'CRITICAL memory pressure ' + percent + '%');
    }
};

IPTVApp.prototype.startMemoryMonitor = function() {
    var self = this;
    if (this._memoryMonitorTimer) return;
    this._memoryMonitorTimer = setInterval(function() {
        var percent = self.checkMemoryPressure();
        if (percent > 85) {
            self.logMemory('monitor');
            self.handleMemoryPressure(percent);
        }
    }, 30000);
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
    if (Premium.getState() === Premium.STATE_EXPIRED && this.watchHistory.length > Premium.getHistoryFreeLimit()) {
        this.watchHistory = this.watchHistory.slice(0, Premium.getHistoryFreeLimit());
    }
    try {
        localStorage.setItem('watchHistory', JSON.stringify(this.watchHistory));
    }
    catch (e) { /* storage error */ }
    this._rebuildHistoryIndex();
};

IPTVApp.prototype._rebuildHistoryIndex = function() {
    var idx = {};
    for (var i = 0; i < this.watchHistory.length; i++) {
        var item = this.watchHistory[i];
        var key = String(item.playlistId) + '_' + String(item.id);
        if (!idx[key]) {
            idx[key] = item;
        }
    }
    this._historyIdx = idx;
};

IPTVApp.prototype.getWatchHistoryItem = function(streamOrId, playlistId) {
    var targetId, targetPlaylistId;
    if (typeof streamOrId === 'object' && streamOrId !== null) {
        targetId = streamOrId.stream_id || streamOrId.series_id || streamOrId.id || streamOrId.episodeId;
        targetPlaylistId = streamOrId._playlistId || streamOrId.playlistId || playlistId;
    } else {
        targetId = streamOrId;
        targetPlaylistId = playlistId;
    }
    if (!targetPlaylistId) {
        targetPlaylistId = (this.currentPlayingStream && this.currentPlayingStream._playlistId) || this.settings.activePlaylistId;
    }
    if (this._historyIdx) {
        var key = String(targetPlaylistId) + '_' + String(targetId);
        var found = this._historyIdx[key];
        if (found) return found;
    }
    for (var i = 0; i < this.watchHistory.length; i++) {
        if (String(this.watchHistory[i].id) === String(targetId) && String(this.watchHistory[i].playlistId) === String(targetPlaylistId)) {
            return this.watchHistory[i];
        }
    }
    return null;
};

IPTVApp.prototype.updateWatchHistoryProgress = function(id, position, duration, playlistId, forceSync) {
    if (!id || !duration || duration <= 0) return;
    var percent = Math.round((position / duration) * 100);
    var minMs = (this.settings.minProgressMinutes || 2) * 60000;
    var threshold = this.settings.watchedThreshold || 90;
    if (position < minMs) return;
    var item = this.getWatchHistoryItem(id, playlistId);
    if (!item) return;
    item.position = position;
    item.duration = duration;
    item.percent = percent;
    item.date = Date.now();
    if (percent >= threshold) {
        item.watched = true;
    }
    var now = Date.now();
    if (forceSync || !this._lastHistorySave || (now - this._lastHistorySave) > 30000) {
        this._lastHistorySave = now;
        this.saveWatchHistory();
    }
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
    }
    catch (e) { /* storage error */ }
};

IPTVApp.prototype.updateEpisodeProgress = function(episodeId, position, duration, playlistId, forceSync) {
    if (!episodeId || !duration || duration <= 0) return;
    var pId = playlistId || (this.currentPlayingStream && this.currentPlayingStream._playlistId) || this.settings.activePlaylistId || '';
    var key = pId + '_' + episodeId;
    var percent = Math.round((position / duration) * 100);
    this.episodeProgress[key] = {
        position: position,
        duration: duration,
        percent: percent,
        watched: percent > 90,
        timestamp: Date.now(),
        episodeId: episodeId,
        playlistId: pId
    };
    var now = Date.now();
    if (forceSync || !this._lastEpisodeSave || (now - this._lastEpisodeSave) > 30000) {
        this._lastEpisodeSave = now;
        this.saveEpisodeProgress();
    }
    if (this.currentPlayingStream && this.currentPlayingStream.series_id) {
        var seriesId = this.currentPlayingStream.series_id;
        var season = this.currentPlayingStream.season || this.currentSeason;
        var episode = this.currentPlayingStream.episode || this.currentEpisodeNum;
        if (season && episode) {
            this.updateSeriesProgress(seriesId, season, episode, episodeId, pId);
        }
    }
};

IPTVApp.prototype.getEpisodeProgress = function(episodeId, playlistId) {
    var pId = playlistId || (this.currentPlayingStream && this.currentPlayingStream._playlistId) || this.settings.activePlaylistId || '';
    var key = pId + '_' + episodeId;
    return this.episodeProgress[key] || null;
};

IPTVApp.prototype.markEpisodeAsCompleted = function(episodeId, playlistId) {
    var pId = playlistId || (this.currentPlayingStream && this.currentPlayingStream._playlistId) || this.settings.activePlaylistId || '';
    var key = pId + '_' + episodeId;
    var epProgress = this.episodeProgress[key];
    if (epProgress) {
        epProgress.watched = true;
        epProgress.position = 0;
        this.saveEpisodeProgress();
    }
};

IPTVApp.prototype.markVodAsCompleted = function(streamId, playlistId) {
    var historyItem = this.getWatchHistoryItem(streamId, playlistId);
    if (historyItem) {
        historyItem.watched = true;
        historyItem.position = 0;
        this.saveWatchHistory();
    }
};

IPTVApp.prototype.forceSaveProgress = function() {
    this.saveWatchHistory();
    this.saveEpisodeProgress();
    this.saveSeriesProgress();
    window.log('Progress force saved (app going to background)');
};
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
    }
    catch (e) { /* storage error */ }
};

IPTVApp.prototype.getSeriesProgress = function(seriesId, playlistId) {
    var pId = playlistId || (this.currentPlayingStream && this.currentPlayingStream._playlistId) || this.settings.activePlaylistId || '';
    var key = pId + '_' + seriesId;
    return this.seriesProgress[key] || null;
};

IPTVApp.prototype.updateSeriesProgress = function(seriesId, season, episode, episodeId, playlistId) {
    if (!seriesId) return;
    var pId = playlistId || (this.currentPlayingStream && this.currentPlayingStream._playlistId) || this.settings.activePlaylistId || '';
    var key = pId + '_' + seriesId;
    var current = this.seriesProgress[key];
    var seasonNum = parseInt(season);
    var episodeNum = parseInt(episode);
    if (!current || seasonNum > current.season ||
        (seasonNum === current.season && episodeNum >= current.episode)) {
        this.seriesProgress[key] = {
            season: seasonNum,
            episode: episodeNum,
            episodeId: episodeId,
            seriesId: seriesId,
            playlistId: pId,
            timestamp: Date.now()
        };
        this.saveSeriesProgress();
    }
};

IPTVApp.prototype._loadVersionPrefs = function(storageKey) {
    try {
        var data = localStorage.getItem(storageKey);
        return data ? JSON.parse(data) : {};
    }
    catch (e) {
        return {};
    }
};

IPTVApp.prototype._saveVersionPrefs = function(storageKey, prefs, cleanTitle, versionTag, maxEntries) {
    if (!cleanTitle) return;
    prefs[cleanTitle] = { tag: versionTag, ts: Date.now() };
    var keys = Object.keys(prefs);
    if (keys.length > maxEntries) {
        var sorted = keys.sort(function(a, b) {
            var tsA = prefs[a].ts || 0;
            var tsB = prefs[b].ts || 0;
            return tsA - tsB;
        });
        for (var i = 0; i < keys.length - maxEntries; i++) {
            delete prefs[sorted[i]];
        }
    }
    try {
        localStorage.setItem(storageKey, JSON.stringify(prefs));
    }
    catch (e) { }
};

IPTVApp.prototype._getVersionPref = function(prefs, cleanTitle) {
    var pref = prefs[cleanTitle];
    if (!pref) return null;
    if (typeof pref === 'string') return pref;
    return pref.tag || null;
};

IPTVApp.prototype.loadSeriesVersionPrefs = function() {
    return this._loadVersionPrefs('seriesVersionPrefs');
};

IPTVApp.prototype.saveSeriesVersionPref = function(cleanTitle, versionTag) {
    this._saveVersionPrefs('seriesVersionPrefs', this.seriesVersionPrefs, cleanTitle, versionTag, 100);
};

IPTVApp.prototype.getSeriesVersionPref = function(cleanTitle) {
    return this._getVersionPref(this.seriesVersionPrefs, cleanTitle);
};

IPTVApp.prototype.loadMovieVersionPrefs = function() {
    return this._loadVersionPrefs('movieVersionPrefs');
};

IPTVApp.prototype.saveMovieVersionPref = function(cleanTitle, versionTag) {
    this._saveVersionPrefs('movieVersionPrefs', this.movieVersionPrefs, cleanTitle, versionTag, 100);
};

IPTVApp.prototype.getMovieVersionPref = function(cleanTitle) {
    return this._getVersionPref(this.movieVersionPrefs, cleanTitle);
};

// TMDB Cache - Using IndexedDB for larger capacity
var TMDB_CACHE_DB_NAME = 'IPTVTMDBCache';
var TMDB_CACHE_STORE_NAME = 'tmdb';
var TMDB_CACHE_DB_VERSION = 1;
IPTVApp.prototype.initTMDBCacheDB = function() {
    var self = this;
    if (this._tmdbCacheDB) {
        return Promise.resolve(this._tmdbCacheDB);
    }
    if (this._tmdbCacheDBPromise) {
        return this._tmdbCacheDBPromise;
    }
    this._tmdbCacheDBPromise = new Promise(function(resolve) {
        if (!window.indexedDB) {
            window.log('CACHE', 'IndexedDB not supported for TMDB cache');
            resolve(null);
            return;
        }
        var request = indexedDB.open(TMDB_CACHE_DB_NAME, TMDB_CACHE_DB_VERSION);
        request.onerror = function() {
            resolve(null);
        };
        request.onsuccess = function(event) {
            self._tmdbCacheDB = event.target.result;
            resolve(self._tmdbCacheDB);
        };
        request.onupgradeneeded = function(event) {
            var db = event.target.result;
            if (!db.objectStoreNames.contains(TMDB_CACHE_STORE_NAME)) {
                db.createObjectStore(TMDB_CACHE_STORE_NAME, { keyPath: 'id' });
            }
        };
    });
    return this._tmdbCacheDBPromise;
};
IPTVApp.prototype.loadTMDBCache = function() {
    return {};
};
IPTVApp.prototype.loadTMDBCacheAsync = function() {
    var self = this;
    var TMDB_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
    return this.initTMDBCacheDB().then(function(db) {
        if (!db) {
            return;
        }
        return new Promise(function(resolve) {
            try {
                var transaction = db.transaction([TMDB_CACHE_STORE_NAME], 'readonly');
                var store = transaction.objectStore(TMDB_CACHE_STORE_NAME);
                var request = store.get('tmdbCache');
                request.onsuccess = function(event) {
                    var result = event.target.result;
                    if (result && result.data) {
                        var now = Date.now();
                        var pruned = {};
                        var total = 0;
                        var removed = 0;
                        var keys = Object.keys(result.data);
                        for (var i = 0; i < keys.length; i++) {
                            total++;
                            var entry = result.data[keys[i]];
                            if (entry && entry._cachedAt && (now - entry._cachedAt) > TMDB_CACHE_MAX_AGE) {
                                removed++;
                            }
                            else {
                                pruned[keys[i]] = entry;
                            }
                        }
                        self.tmdbCache = pruned;
                        window.log('CACHE', 'TMDB cache loaded from IndexedDB: ' + (total - removed) + ' entries (pruned ' + removed + ' older than 30d)');
                        if (removed > 0) {
                            self.saveTMDBCache();
                        }
                    }
                    resolve();
                };
                request.onerror = function() {
                    resolve();
                };
            }
            catch (e) {
                resolve();
            }
        });
    });
};
IPTVApp.prototype.saveTMDBCache = function() {
    var self = this;
    if (this._saveTMDBCacheTimer) {
        clearTimeout(this._saveTMDBCacheTimer);
    }
    this._saveTMDBCacheTimer = setTimeout(function() {
        self._saveTMDBCacheTimer = null;
        self.initTMDBCacheDB().then(function(db) {
            if (!db) return;
            try {
                var transaction = db.transaction([TMDB_CACHE_STORE_NAME], 'readwrite');
                var store = transaction.objectStore(TMDB_CACHE_STORE_NAME);
                store.put({ id: 'tmdbCache', data: self.tmdbCache });
            }
            catch (ex) {
                window.log('ERROR', 'saveTMDBCache: ' + ex.message);
            }
        });
    }, 2000);
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
            window.log('CACHE', 'IndexedDB not supported, falling back to memory cache');
            resolve(null);
            return;
        }
        var request = indexedDB.open(PROVIDER_CACHE_DB_NAME, PROVIDER_CACHE_DB_VERSION);
        request.onerror = function(event) {
            window.log('ERROR', 'IndexedDB open: ' + event.target.error);
            resolve(null);
        };
        request.onsuccess = function(event) {
            self._providerCacheDB = event.target.result;
            window.log('CACHE', 'IndexedDB opened successfully');
            resolve(self._providerCacheDB);
        };
        request.onupgradeneeded = function(event) {
            var db = event.target.result;
            if (!db.objectStoreNames.contains(PROVIDER_CACHE_STORE_NAME)) {
                db.createObjectStore(PROVIDER_CACHE_STORE_NAME, { keyPath: 'playlistId' });
                window.log('CACHE', 'IndexedDB store created');
            }
        };
    });
    return this._providerCacheDBPromise;
};

IPTVApp.prototype.getProviderCacheKey = function(playlistId) {
    return playlistId || 'default';
};

IPTVApp.prototype.loadProviderCache = function(playlistId) {
    if (playlistId === 'merged') {
        return this.loadMergedProviderCache();
    }
    return this.loadProviderCacheLocal(playlistId);
};

IPTVApp.prototype.loadMergedProviderCache = function() {
    var self = this;
    var playlists = this.settings.playlists || [];
    if (playlists.length === 0) {
        return Promise.resolve(null);
    }
    window.log('loadMergedProviderCache: loading ' + playlists.length + ' individual caches...');
    var promises = playlists.map(function(playlist) {
        var id = playlist.id || playlist.name;
        return self.loadProviderCacheLocal(id).then(function(localData) {
            return { playlistId: id, cache: localData };
        });
    });
    return Promise.all(promises).then(function(results) {
        var merged = {};
        var foundAny = false;
        var stats = { live: 0, vod: 0, series: 0 };
        var needsRefreshIds = [];
        var oldestTimestamp = null;
        results.forEach(function(result) {
            if (!result.cache) return;
            foundAny = true;
            if (result.cache._cacheTimestamp) {
                if (!oldestTimestamp || result.cache._cacheTimestamp < oldestTimestamp) {
                    oldestTimestamp = result.cache._cacheTimestamp;
                }
            }
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
            if (needsRefreshIds.length > 0) {
                merged._needsRefreshIds = needsRefreshIds;
            }
            merged._cacheTimestamp = oldestTimestamp;
            merged._cacheSource = 'cache';
            return merged;
        }
        window.log('CACHE', 'loadMergedProviderCache: no caches found');
        return null;
    });
};

IPTVApp.prototype.getCurrentFilterSettings = function() {
    return {
        hideSD: this.settings.hideSD,
        hide3D: this.settings.hide3D,
        hideSM: this.settings.hideHearingImpaired,
        providerLanguage: this.settings.providerLanguage
    };
};
IPTVApp.prototype.filtersMatch = function(cachedFilters) {
    if (!cachedFilters) return false;
    var current = this.getCurrentFilterSettings();
    return cachedFilters.hideSD === current.hideSD &&
           cachedFilters.hide3D === current.hide3D &&
           cachedFilters.hideSM === current.hideSM &&
           cachedFilters.providerLanguage === current.providerLanguage;
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
                        window.log('Provider cache LOCAL miss for ' + playlistId + ' (not in IndexedDB)');
                        resolve(null);
                        return;
                    }
                    if (!self.filtersMatch(cache.filters)) {
                        window.log('Provider cache INVALID for ' + playlistId + ' (filters changed)');
                        resolve(null);
                        return;
                    }
                    var ageMinutes = cache.timestamp ? Math.round((Date.now() - cache.timestamp) / 60000) : 0;
                    var needsRefresh = !cache.timestamp || Date.now() - cache.timestamp > PROVIDER_CACHE_TTL;
                    if (needsRefresh) {
                        window.log('Provider cache stale for ' + playlistId + ' (age: ' + ageMinutes + 'min), will refresh in background');
                        cache.data._needsRefresh = true;
                        cache.data._playlistId = playlistId;
                    }
                    else {
                        window.log('Provider cache hit from LOCAL for ' + playlistId + ' (age: ' + ageMinutes + 'min)');
                    }
                    cache.data._cacheTimestamp = cache.timestamp;
                    cache.data._cacheSource = 'cache';
                    resolve(cache.data);
                };
                request.onerror = function() {
                    resolve(null);
                };
            }
            catch (e) {
                window.log('ERROR', 'loadProviderCacheLocal: ' + e.message);
                resolve(null);
            }
        });
    });
};

IPTVApp.prototype._stripStreamsForCache = function(streams) {
    var stripFields = ['plot', 'cast', 'director', 'direct_source', 'custom_sid', 'backdrop_path', 'youtube_trailer', 'episode_run_time', 'tmdb'];
    return streams.map(function(s) {
        var stripped = {};
        for (var key in s) {
            if (stripFields.indexOf(key) === -1) {
                stripped[key] = s[key];
            }
        }
        return stripped;
    });
};

IPTVApp.prototype.saveProviderCache = function(playlistId, data) {
    var self = this;
    var key = this.getProviderCacheKey(playlistId);
    var timestamp = Date.now();
    var filters = this.getCurrentFilterSettings();
    var lightData = {};
    for (var section in data) {
        if (data[section] && data[section].streams) {
            lightData[section] = {
                categories: data[section].categories,
                streams: self._stripStreamsForCache(data[section].streams)
            };
        }
        else {
            lightData[section] = data[section];
        }
    }
    return this.initProviderCacheDB().then(function(db) {
        if (!db) {
            window.log('CACHE', 'Provider cache save skipped (no IndexedDB)');
            return;
        }
        return new Promise(function(resolve) {
            try {
                var dataSize = JSON.stringify(lightData).length;
                window.log('CACHE', 'saveProviderCache: writing ' + Math.round(dataSize / 1024) + 'KB for ' + playlistId);
                var transaction = db.transaction([PROVIDER_CACHE_STORE_NAME], 'readwrite');
                var store = transaction.objectStore(PROVIDER_CACHE_STORE_NAME);
                var cache = {
                    playlistId: key,
                    timestamp: timestamp,
                    data: lightData,
                    filters: filters
                };
                transaction.oncomplete = function() {
                    window.log('Provider cache saved for ' + playlistId + ' (filters: SD=' + filters.hideSD + ' 3D=' + filters.hide3D + ' SM=' + filters.hideSM + ')');
                    resolve(true);
                };
                transaction.onabort = function() {
                    window.log('ERROR', 'Provider cache save ABORTED for ' + playlistId + ': ' + (transaction.error ? transaction.error.message || transaction.error : 'unknown'));
                    self.clearProviderCache().then(function() {
                        window.log('CACHE', 'Cleared provider cache after quota error');
                    });
                    self.tmdbCache = {};
                    if (window.indexedDB) {
                        indexedDB.deleteDatabase('IPTVTMDBCache');
                        window.log('CACHE', 'Cleared TMDB cache after quota error');
                    }
                    resolve(false);
                };
                transaction.onerror = function(event) {
                    window.log('ERROR', 'Provider cache save transaction error: ' + (event.target.error ? event.target.error.message || event.target.error : 'unknown'));
                    resolve(false);
                };
                store.delete(key);
                store.put(cache);
            }
            catch (e) {
                window.log('ERROR', 'saveProviderCache: ' + e.message);
                resolve(false);
            }
        });
    });
};

IPTVApp.prototype.updateProviderCacheTimestamp = function(playlistId, timestamp) {
    var key = this.getProviderCacheKey(playlistId);
    this.initProviderCacheDB().then(function(db) {
        if (!db) return;
        var transaction = db.transaction([PROVIDER_CACHE_STORE_NAME], 'readwrite');
        var store = transaction.objectStore(PROVIDER_CACHE_STORE_NAME);
        var request = store.get(key);
        request.onsuccess = function(event) {
            var cache = event.target.result;
            if (!cache) return;
            cache.timestamp = timestamp;
            store.put(cache);
            window.log('CACHE', 'Updated timestamp for ' + playlistId);
        };
    });
};

// Save to local IndexedDB only (no remote sync - used when copying from remote to local)
IPTVApp.prototype.saveProviderCacheLocal = function(playlistId, data, timestamp, filters) {
    var self = this;
    var key = this.getProviderCacheKey(playlistId);
    var lightData = {};
    for (var section in data) {
        if (data[section] && data[section].streams) {
            lightData[section] = {
                categories: data[section].categories,
                streams: self._stripStreamsForCache(data[section].streams)
            };
        }
        else {
            lightData[section] = data[section];
        }
    }
    return this.initProviderCacheDB().then(function(db) {
        if (!db) return;
        return new Promise(function(resolve) {
            try {
                var transaction = db.transaction([PROVIDER_CACHE_STORE_NAME], 'readwrite');
                var store = transaction.objectStore(PROVIDER_CACHE_STORE_NAME);
                var cache = {
                    playlistId: key,
                    timestamp: timestamp || Date.now(),
                    data: lightData,
                    filters: filters || self.getCurrentFilterSettings()
                };
                var request = store.put(cache);
                request.onerror = function(e) {
                    window.log('ERROR', 'Provider cache LOCAL save for ' + playlistId + ': ' + (e.target.error || 'unknown'));
                    resolve(false);
                };
                transaction.oncomplete = function() {
                    window.log('Provider cache saved locally for ' + playlistId);
                    resolve(true);
                };
                transaction.onerror = function(e) {
                    window.log('ERROR', 'Provider cache LOCAL transaction for ' + playlistId + ': ' + (e.target.error || 'unknown'));
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

// Apply quality filters (SD, 3D, SM) to categories and streams
IPTVApp.prototype.applyQualityFiltersToSection = function(categories, streams) {
    var self = this;
    var filteredCategories = categories.slice();
    var filteredStreams = streams.slice();
    if (this.settings.hideHearingImpaired) {
        filteredCategories = filteredCategories.filter(function(cat) {
            var name = (cat.category_name || '').toUpperCase();
            return name.indexOf('SOURD') === -1 && name.indexOf('MALENTENDANT') === -1 && !name.startsWith('SME|');
        });
    }
    var categoryIds = {};
    filteredCategories.forEach(function(c) { categoryIds[c.category_id] = true; });
    filteredStreams = filteredStreams.filter(function(s) {
        return categoryIds[s.category_id];
    });
    if (this.settings.hideSD) {
        var titleMap = {};
        filteredStreams.forEach(function(s) {
            var cleanTitle = self.cleanTitle(self.getStreamTitle(s)).toLowerCase();
            if (!titleMap[cleanTitle]) {
                titleMap[cleanTitle] = { sd: [], hd: [] };
            }
            if (self.isSD(s)) {
                titleMap[cleanTitle].sd.push(s);
            }
            else {
                titleMap[cleanTitle].hd.push(s);
            }
        });
        filteredStreams = filteredStreams.filter(function(s) {
            if (!self.isSD(s)) return true;
            var cleanTitle = self.cleanTitle(self.getStreamTitle(s)).toLowerCase();
            return titleMap[cleanTitle].hd.length === 0;
        });
        var streamCategoryIds = {};
        filteredStreams.forEach(function(s) { streamCategoryIds[s.category_id] = true; });
        filteredCategories = filteredCategories.filter(function(cat) {
            var name = (cat.category_name || '').toUpperCase();
            if (!name.startsWith('SD|')) return true;
            return streamCategoryIds[cat.category_id];
        });
    }
    if (this.settings.hide3D) {
        filteredStreams = filteredStreams.filter(function(s) {
            return !self.is3D(s);
        });
        var streamCategoryIds3D = {};
        filteredStreams.forEach(function(s) { streamCategoryIds3D[s.category_id] = true; });
        filteredCategories = filteredCategories.filter(function(cat) {
            var name = (cat.category_name || '').toUpperCase();
            if (name.indexOf('3D') === -1) return true;
            return streamCategoryIds3D[cat.category_id];
        });
    }
    return { categories: filteredCategories, streams: filteredStreams };
};
IPTVApp.prototype._computeCacheFingerprint = function(cache) {
    var parts = [];
    var sections = [
        { cats: cache.liveCategories, streams: cache.liveStreams && cache.liveStreams['_all'] },
        { cats: cache.vodCategories, streams: cache.vodStreams && cache.vodStreams['_all'] },
        { cats: cache.seriesCategories, streams: cache.series && cache.series['_all'] }
    ];
    for (var i = 0; i < sections.length; i++) {
        var cats = sections[i].cats || [];
        var streams = sections[i].streams || [];
        var len = streams.length;
        var first = len > 0 ? (streams[0].stream_id || streams[0].series_id || streams[0].id || '') : '';
        var last = len > 0 ? (streams[len - 1].stream_id || streams[len - 1].series_id || streams[len - 1].id || '') : '';
        parts.push(cats.length + ':' + len + ':' + first + ':' + last);
    }
    return parts.join('|');
};

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
    this.providerCacheInfo = this.providerCacheInfo || {};
    this.providerCacheInfo.refreshing = true;
    this.updateRefreshProgress(playlistId, 0, 3, '...');
    window.log('Starting background refresh for provider ' + playlistId);
    // Find the playlist config
    var playlist = (this.settings.playlists || []).find(function(p) {
        return p.id === playlistId || p.name === playlistId;
    });
    if (!playlist || playlist.type !== 'provider') {
        window.log('CACHE', 'Background refresh: playlist not found or not a provider');
        delete this._backgroundRefreshInProgress[playlistId];
        return;
    }
    // Create a temporary API instance for background refresh
    var api = new ProviderAPI(playlist.serverUrl, playlist.username, playlist.password, this.getStreamProxyUrl());
    api.playlistId = playlist.id;
    api.authenticate().then(function() {
        window.log('Background refresh: authenticated for ' + playlistId);
        return api.preloadCache(function(step, total, name) {
            self.updateRefreshProgress(playlistId, step, total, name);
        });
    }).then(function() {
        window.log('Background refresh: cache loaded for ' + playlistId);
        var newFingerprint = self._computeCacheFingerprint(api.cache);
        var oldFingerprint = self._cacheFingerprints && self._cacheFingerprints[playlistId];
        if (oldFingerprint && oldFingerprint === newFingerprint) {
            window.log('Background refresh: data unchanged for ' + playlistId + ' (fingerprint: ' + newFingerprint + ')');
            var now = Date.now();
            self.playlistCacheTimestamps = self.playlistCacheTimestamps || {};
            self.playlistCacheTimestamps[playlistId] = now;
            if (self.providerCacheInfo) {
                self.providerCacheInfo.timestamp = now;
                self.providerCacheInfo.refreshing = false;
            }
            self.updateProviderCacheTimestamp(playlistId, now);
            self.updateRefreshProgress(playlistId, 0, 0, null);
            self.renderPlaylistSelector();
            delete self._backgroundRefreshInProgress[playlistId];
            return null;
        }
        self._cacheFingerprints = self._cacheFingerprints || {};
        self._cacheFingerprints[playlistId] = newFingerprint;
        window.log('Background refresh: data changed for ' + playlistId + ' (fingerprint: ' + newFingerprint + ')');
        api.filterCacheByLanguage(function(catName) {
            return self.matchesLanguage(catName);
        });
        var vodFiltered = self.applyQualityFiltersToSection(
            api.cache.vodCategories || [],
            api.cache.vodStreams['_all'] || []
        );
        var seriesFiltered = self.applyQualityFiltersToSection(
            api.cache.seriesCategories || [],
            api.cache.series['_all'] || []
        );
        var liveFiltered = self.applyQualityFiltersToSection(
            api.cache.liveCategories || [],
            api.cache.liveStreams['_all'] || []
        );
        var cacheData = {
            vod: vodFiltered,
            series: seriesFiltered,
            live: liveFiltered
        };
        window.log('Background refresh: applied filters - vod:' + vodFiltered.streams.length + ' series:' + seriesFiltered.streams.length + ' live:' + liveFiltered.streams.length);
        return self.saveProviderCache(playlistId, cacheData).then(function() {
            return cacheData;
        });
    }).then(function(cacheData) {
        if (cacheData === null) return;
        window.log('Background refresh complete for ' + playlistId);
        var now = Date.now();
        self.providerCacheInfo = {
            source: 'provider',
            timestamp: now,
            refreshing: false
        };
        self.playlistCacheTimestamps = self.playlistCacheTimestamps || {};
        self.playlistCacheTimestamps[playlistId] = now;
        self.updateCacheInfoDisplay();
        self.renderPlaylistSelector();
        if (self.api && self.api.playlistId === playlistId) {
            var tagRefresh = function(arr) {
                if (!arr) return;
                for (var ti = 0; ti < arr.length; ti++) {
                    if (!arr[ti]._playlistId) arr[ti]._playlistId = playlistId;
                }
            };
            self.api.cache.vodCategories = cacheData.vod.categories;
            self.api.cache.vodStreams['_all'] = cacheData.vod.streams || [];
            tagRefresh(self.api.cache.vodStreams['_all']);
            self.api.cache.seriesCategories = cacheData.series.categories;
            self.api.cache.series['_all'] = cacheData.series.streams || [];
            tagRefresh(self.api.cache.series['_all']);
            self.api.cache.liveCategories = cacheData.live.categories;
            self.api.cache.liveStreams['_all'] = cacheData.live.streams || [];
            tagRefresh(self.api.cache.liveStreams['_all']);
            window.log('Background refresh: updated in-memory cache for ' + playlistId);
            var oldStreamIds = {};
            if (self.currentScreen === 'browse' && self.currentSection && self.currentStreams) {
                for (var si = 0; si < self.currentStreams.length; si++) {
                    var sid = self.currentStreams[si].stream_id || self.currentStreams[si].series_id;
                    if (sid) oldStreamIds[sid] = true;
                }
            }
            self._invalidatePreprocessCache(function() {
                if (self.currentScreen === 'home') {
                    self.preloadSectionPosters();
                }
                if (self.currentScreen === 'browse' && self.currentSection) {
                    var section = self.currentSection;
                    var sectionData = self.data[section];
                    if (sectionData && sectionData.streams && Object.keys(oldStreamIds).length > 0) {
                        var newCount = 0;
                        for (var ni = 0; ni < sectionData.streams.length; ni++) {
                            var id = sectionData.streams[ni].stream_id || sectionData.streams[ni].series_id;
                            if (id && !oldStreamIds[id]) newCount++;
                        }
                        if (newCount > 0) {
                            window.log('CACHE', 'Background refresh: ' + newCount + ' new streams in ' + section);
                            var vodSubs = ['sport', 'manga', 'entertainment'];
                            var gridType = vodSubs.indexOf(section) !== -1 || section.indexOf('custom_') === 0 ? 'vod' : section;
                            self.renderGrid(sectionData.streams, gridType, true);
                            self.showToast('+' + newCount + ' ' + I18n.t('home.' + (section === 'series' ? 'series' : 'vod'), section));
                        }
                    }
                }
            });
        }
        delete self._backgroundRefreshInProgress[playlistId];
    }).catch(function(err) {
        window.log('ERROR', 'Background refresh failed for ' + playlistId + ': ' + (err ? err.message || err : 'unknown'));
        if (self.providerCacheInfo) {
            self.providerCacheInfo.refreshing = false;
        }
        self.updateRefreshProgress(playlistId, 0, 0, null);
        delete self._backgroundRefreshInProgress[playlistId];
    });
};


IPTVApp.prototype.startCacheRefreshTimer = function(playlistsOrId) {
    var self = this;
    if (this._cacheRefreshTimer) {
        clearInterval(this._cacheRefreshTimer);
    }
    var playlistIds = Array.isArray(playlistsOrId)
        ? playlistsOrId.map(function(p) { return p.id || p.name; })
        : [playlistsOrId];
    this._cacheRefreshTimer = setInterval(function() {
        var cacheAge = self.providerCacheInfo && self.providerCacheInfo.timestamp
            ? Date.now() - self.providerCacheInfo.timestamp
            : Infinity;
        if (cacheAge > PROVIDER_CACHE_TTL) {
            window.log('CACHE', 'Timer: cache expired (age: ' + Math.round(cacheAge / 60000) + 'min), refreshing...');
            playlistIds.forEach(function(playlistId) {
                if (!self._backgroundRefreshInProgress || !self._backgroundRefreshInProgress[playlistId]) {
                    self.refreshProviderCacheBackground(playlistId);
                }
            });
        }
    }, 60000);
    window.log('CACHE', 'Refresh timer started (' + playlistIds.length + ' provider(s))');
};

IPTVApp.prototype.updateCacheInfoDisplay = function() {};

IPTVApp.prototype.updateRefreshProgress = function(playlistId, step, total, name) {
    var providerAgeEl = document.getElementById('home-provider-age');
    if (!providerAgeEl) return;
    var isActiveProvider = !this.settings.activePlaylistId || this.sameId(playlistId, this.settings.activePlaylistId);
    var playlists = this.settings.playlists || [];
    var isSingleProvider = playlists.filter(function(p) { return p.showOnHome !== false; }).length < 2;
    if (!isActiveProvider && !isSingleProvider) return;
    if (!name || (step === 0 && total === 0)) {
        var ts = (this.playlistCacheTimestamps || {})[playlistId];
        while (providerAgeEl.firstChild) providerAgeEl.removeChild(providerAgeEl.firstChild);
        var doneIcon = document.createElement('span');
        doneIcon.className = 'material-symbols-outlined';
        doneIcon.textContent = 'schedule';
        providerAgeEl.appendChild(doneIcon);
        providerAgeEl.appendChild(document.createTextNode(' ' + (ts ? formatTimeAgo(ts) : '')));
    } else {
        while (providerAgeEl.firstChild) providerAgeEl.removeChild(providerAgeEl.firstChild);
        var hg2 = document.createElement('span');
        hg2.className = 'hourglass';
        var hgIcon2 = document.createElement('span');
        hgIcon2.className = 'material-symbols-outlined';
        hgIcon2.textContent = 'hourglass_empty';
        hg2.appendChild(hgIcon2);
        providerAgeEl.appendChild(hg2);
        providerAgeEl.appendChild(document.createTextNode(' ' + step + '/' + total + ' ' + name));
        this.setHidden(providerAgeEl, false);
    }
};

IPTVApp.prototype.getPlaylistCacheTimestamp = function(playlistId) {
    var self = this;
    var key = this.getProviderCacheKey(playlistId);
    return this.initProviderCacheDB().then(function(db) {
        if (!db) return null;
        return new Promise(function(resolve) {
            try {
                var transaction = db.transaction([PROVIDER_CACHE_STORE_NAME], 'readonly');
                var store = transaction.objectStore(PROVIDER_CACHE_STORE_NAME);
                var request = store.get(key);
                request.onsuccess = function(event) {
                    var cache = event.target.result;
                    resolve(cache && cache.timestamp ? cache.timestamp : null);
                };
                request.onerror = function() { resolve(null); };
            }
            catch (e) { resolve(null); }
        });
    });
};

IPTVApp.prototype.loadAllPlaylistCacheTimestamps = function() {
    var self = this;
    var playlists = this.settings.playlists || [];
    if (playlists.length === 0) return Promise.resolve({});
    self.playlistCacheTimestamps = self.playlistCacheTimestamps || {};
    var promises = playlists.map(function(p) {
        return self.getPlaylistCacheTimestamp(p.id).then(function(ts) {
            if (ts) self.playlistCacheTimestamps[p.id] = ts;
        });
    });
    return Promise.all(promises).then(function() {
        return self.playlistCacheTimestamps;
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
                window.log('ERROR', 'clearProviderCache: ' + e.message);
                resolve();
            }
        });
    });
};

IPTVApp.prototype.cacheProviderData = function(playlistId, section, categories, streams) {
    var self = this;
    // Don't save merged cache - it's built from individual caches on demand
    if (playlistId === 'merged') {
        window.log('CACHE', 'cacheProviderData: skipping merged cache (built from individual caches)');
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
        window.log('ERROR', 'cacheProviderData: ' + e.message);
    });
};

IPTVApp.prototype.loadSelectedCategories = function() {
    try {
        var data = localStorage.getItem('selectedCategories');
        return data ? JSON.parse(data) : {};
    }
    catch (e) {
        return {};
    }
};

IPTVApp.prototype.saveSelectedCategories = function() {
    try {
        localStorage.setItem('selectedCategories', JSON.stringify(this.selectedCategoryBySection));
    }
    catch (e) {}
};

IPTVApp.prototype.loadCategorySort = function() {
    try {
        var data = localStorage.getItem('categorySort');
        return data ? JSON.parse(data) : {};
    }
    catch (e) {
        return {};
    }
};

IPTVApp.prototype.saveCategorySort = function() {
    try {
        localStorage.setItem('categorySort', JSON.stringify(this.categorySortBySection || {}));
    }
    catch (e) {}
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
        proxyEnabled: true,
        streamProxy: false,
        hideSD: true,
        hide3D: true,
        hideHearingImpaired: true,
        minProgressMinutes: 2,
        watchedThreshold: 90,
        retentionWeeks: 4,
        subtitleSize: 'medium',
        subtitleStyle: 'shadow',
        playlists: [],
        activePlaylistId: null,
        secureSubtitles: true,
        providerLanguage: 'AUTO',
        viewMode: {},
        preferHtml5Player: false,
        liveFormat: 'ts',
        dialogueBoost: false,
        historyMaxItems: 50,
        focusOnCategories: false,
        categoryPatterns: null,
        textSize: 'medium',
        freeboxEnabled: false,
        freeboxHost: 'mafreebox.freebox.fr',
        freeboxAppToken: '',
        freeboxBatchDownload: true,
        freeboxDownloadViaProxy: false,
        useGenreCategories: true,
        bufferPreset: 'standard',
        bufferPlay: 2,
        bufferRebuffer: 5,
        bufferMin: 30,
        bufferMax: 60
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
        window.log('Settings loaded, customCategories: ' + (settings.customCategories ? settings.customCategories.length : 0));
        return settings;
    }
    catch (e) {
        window.log('ERROR', 'Loading settings: ' + e.message);
        return defaults;
    }
};

IPTVApp.prototype.saveSettings = function() {
    try {
        localStorage.setItem('settings', JSON.stringify(this.settings));
        window.log('Settings saved, customCategories: ' + (this.settings.customCategories ? this.settings.customCategories.length : 0));
        this.initAPIs();
    }
    catch (e) {
        window.log('ERROR', 'Saving settings: ' + e.message);
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
    }
    catch (e) { /* storage error */ }
    this._rebuildFavoritesIndex();
};

IPTVApp.prototype._rebuildFavoritesIndex = function() {
    var idx = {};
    for (var i = 0; i < this.favorites.length; i++) {
        var f = this.favorites[i];
        var fId = f.series_id || f.stream_id;
        var fPlaylistId = f._playlistId || f.playlistId || this.settings.activePlaylistId;
        idx[fPlaylistId + '_' + fId] = true;
    }
    this._favoritesIdx = idx;
};

IPTVApp.prototype.isFavorite = function(streamOrId, playlistId) {
    var targetId, targetPlaylistId;
    if (typeof streamOrId === 'object' && streamOrId !== null) {
        targetId = streamOrId.stream_id || streamOrId.series_id || streamOrId.id;
        targetPlaylistId = streamOrId._playlistId || streamOrId.playlistId || playlistId || this.settings.activePlaylistId;
    } else {
        targetId = streamOrId;
        targetPlaylistId = playlistId || this.settings.activePlaylistId;
    }
    if (this._favoritesIdx) {
        return !!this._favoritesIdx[targetPlaylistId + '_' + targetId];
    }
    var self = this;
    return this.favorites.some(function(f) {
        var fId = f.stream_id || f.series_id;
        var fPlaylistId = f._playlistId || f.playlistId || self.settings.activePlaylistId;
        return fId == targetId && fPlaylistId == targetPlaylistId;
    });
};

IPTVApp.prototype.toggleFavorite = function(stream, type) {
    var self = this;
    var id = stream.series_id || stream.stream_id;
    var playlistId = stream._playlistId || stream.playlistId || this.settings.activePlaylistId;
    window.log('toggleFavorite: type=' + type + ' id=' + id + ' playlistId=' + playlistId);
    var idx = -1;
    for (var i = 0; i < this.favorites.length; i++) {
        var favId = this.favorites[i].series_id || this.favorites[i].stream_id;
        var favPlaylistId = this.favorites[i]._playlistId || this.favorites[i].playlistId || this.settings.activePlaylistId;
        if (favId == id && favPlaylistId == playlistId) {
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
        stream._playlistId = playlistId;
        this.favorites.push(stream);
    }
    this.saveFavorites();
    this.updateFavoriteButton();
    this.updateFavoritesCounter();
    this.updateGridFavoriteIcon(id, idx < 0, playlistId);
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
        this.showEmptyMessage(grid, 'home.noFavorites', 'No favorites');
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
};

// Remove item from history by ID and playlistId
IPTVApp.prototype.removeFromHistory = function(id, playlistId) {
    var targetPlaylistId = playlistId || this.settings.activePlaylistId;
    var idx = -1;
    for (var i = 0; i < this.watchHistory.length; i++) {
        if (String(this.watchHistory[i].id) === String(id) && String(this.watchHistory[i].playlistId) === String(targetPlaylistId)) {
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
    var playlistId = stream._playlistId || stream.playlistId;
    if (this.removeFromHistory(id, playlistId)) {
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
                self.showEmptyMessage(grid, 'home.noHistory', 'No viewing history');
            }
        }, 200);
    }
};

IPTVApp.prototype.updateGridFavoriteIcon = function(streamId, isFavorite, playlistId) {
    var grid = document.getElementById('content-grid');
    if (!grid) return;
    var selector = '.grid-item[data-stream-id="' + streamId + '"]';
    if (playlistId) {
        selector += '[data-playlist-id="' + playlistId + '"]';
    }
    var items = grid.querySelectorAll(selector);
    if (items.length === 0 && playlistId) {
        items = grid.querySelectorAll('.grid-item[data-stream-id="' + streamId + '"]');
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
    } catch (e) { /* storage error */ }
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
        } catch (e) { /* storage error */ }
    }
    return result || 'emulator';
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
    catch (e) { /* storage error */ }
};

IPTVApp.prototype.preloadBackdropImages = function() {
    var self = this;
    var images = this.loadBackdropImages();
    var maxConcurrent = 3;
    var idx = 0;
    function loadNext() {
        if (idx >= images.length) return;
        var img = new Image();
        var currentIdx = idx;
        idx++;
        img.onload = img.onerror = function() {
            loadNext();
        };
        img.src = self.proxyImageUrl(images[currentIdx]);
    }
    for (var i = 0; i < Math.min(maxConcurrent, images.length); i++) {
        loadNext();
    }
};

IPTVApp.prototype.preloadSectionPosters = function() {
    var self = this;
    var sections = ['vod', 'series'];
    var count = 0;
    for (var si = 0; si < sections.length; si++) {
        var streams = this.getStreams(sections[si]);
        if (!streams || streams.length === 0) continue;
        var limit = Math.min(10, streams.length);
        for (var i = 0; i < limit; i++) {
            var url = this.getStreamImage(streams[i]);
            if (!url) continue;
            url = this.optimizeTmdbImageUrl(url, 'w300');
            var img = new Image();
            img.src = this.proxyImageUrl(url);
            count++;
        }
    }
    if (count > 0) {
        window.log('PRELOAD', 'Preloading ' + count + ' posters (vod+series)');
    }
};

IPTVApp.prototype.showLoadingBackdrop = function() {
    var self = this;
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
            var proxiedUrl = self.proxyImageUrl(url);
            var img = new Image();
            img.onload = function() {
                div.style.backgroundImage = cssUrl(proxiedUrl);
            };
            img.src = proxiedUrl;
        })(imgDivs[i], shuffled[i]);
    }
};

