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
    try {
        localStorage.setItem('watchHistory', JSON.stringify(this.watchHistory));
    }
    catch (e) { /* storage error */ }
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
    for (var i = 0; i < this.watchHistory.length; i++) {
        if (this.watchHistory[i].id == targetId && this.watchHistory[i].playlistId == targetPlaylistId) {
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

// Series Version Preferences (with cleanup - max 100 entries)
IPTVApp.prototype.loadSeriesVersionPrefs = function() {
    try {
        var data = localStorage.getItem('seriesVersionPrefs');
        return data ? JSON.parse(data) : {};
    }
    catch (e) {
        return {};
    }
};

IPTVApp.prototype.saveSeriesVersionPref = function(cleanTitle, versionTag) {
    if (!cleanTitle) return;
    this.seriesVersionPrefs[cleanTitle] = { tag: versionTag, ts: Date.now() };
    var keys = Object.keys(this.seriesVersionPrefs);
    if (keys.length > 100) {
        var sorted = keys.sort(function(a, b) {
            var tsA = this.seriesVersionPrefs[a].ts || 0;
            var tsB = this.seriesVersionPrefs[b].ts || 0;
            return tsA - tsB;
        }.bind(this));
        for (var i = 0; i < keys.length - 100; i++) {
            delete this.seriesVersionPrefs[sorted[i]];
        }
    }
    try {
        localStorage.setItem('seriesVersionPrefs', JSON.stringify(this.seriesVersionPrefs));
    }
    catch (e) { /* storage error */ }
};

IPTVApp.prototype.getSeriesVersionPref = function(cleanTitle) {
    var pref = this.seriesVersionPrefs[cleanTitle];
    if (!pref) return null;
    if (typeof pref === 'string') return pref;
    return pref.tag || null;
};

IPTVApp.prototype.loadMovieVersionPrefs = function() {
    try {
        var data = localStorage.getItem('movieVersionPrefs');
        return data ? JSON.parse(data) : {};
    }
    catch (e) {
        return {};
    }
};

IPTVApp.prototype.saveMovieVersionPref = function(cleanTitle, versionTag) {
    if (!cleanTitle) return;
    this.movieVersionPrefs[cleanTitle] = { tag: versionTag, ts: Date.now() };
    var keys = Object.keys(this.movieVersionPrefs);
    if (keys.length > 100) {
        var sorted = keys.sort(function(a, b) {
            var tsA = this.movieVersionPrefs[a].ts || 0;
            var tsB = this.movieVersionPrefs[b].ts || 0;
            return tsA - tsB;
        }.bind(this));
        for (var i = 0; i < keys.length - 100; i++) {
            delete this.movieVersionPrefs[sorted[i]];
        }
    }
    try {
        localStorage.setItem('movieVersionPrefs', JSON.stringify(this.movieVersionPrefs));
    }
    catch (e) { /* storage error */ }
};

IPTVApp.prototype.getMovieVersionPref = function(cleanTitle) {
    var pref = this.movieVersionPrefs[cleanTitle];
    if (!pref) return null;
    if (typeof pref === 'string') return pref;
    return pref.tag || null;
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
                        self.tmdbCache = result.data;
                        var count = Object.keys(self.tmdbCache).length;
                        window.log('CACHE', 'TMDB cache loaded from IndexedDB: ' + count + ' entries');
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

IPTVApp.prototype.saveProviderCache = function(playlistId, data) {
    var self = this;
    var key = this.getProviderCacheKey(playlistId);
    var timestamp = Date.now();
    var filters = this.getCurrentFilterSettings();
    return this.initProviderCacheDB().then(function(db) {
        if (!db) {
            window.log('CACHE', 'Provider cache save skipped (no IndexedDB)');
            return;
        }
        return new Promise(function(resolve) {
            try {
                var transaction = db.transaction([PROVIDER_CACHE_STORE_NAME], 'readwrite');
                var store = transaction.objectStore(PROVIDER_CACHE_STORE_NAME);
                var cache = {
                    playlistId: key,
                    timestamp: timestamp,
                    data: data,
                    filters: filters
                };
                var request = store.put(cache);
                request.onsuccess = function() {
                    window.log('Provider cache saved for ' + playlistId + ' (filters: SD=' + filters.hideSD + ' 3D=' + filters.hide3D + ' SM=' + filters.hideSM + ')');
                    resolve(true);
                };
                request.onerror = function(event) {
                    window.log('ERROR', 'Provider cache save failed: ' + event.target.error);
                    resolve(false);
                };
            }
            catch (e) {
                window.log('ERROR', 'saveProviderCache: ' + e.message);
                resolve(false);
            }
        });
    });
};

// Save to local IndexedDB only (no remote sync - used when copying from remote to local)
IPTVApp.prototype.saveProviderCacheLocal = function(playlistId, data, timestamp, filters) {
    var self = this;
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
                    data: data,
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
        // Filter by language
        api.filterCacheByLanguage(function(catName) {
            return self.matchesLanguage(catName);
        });
        // Apply quality filters (SD, 3D, SM) to each section
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
        // Build cache data with filtered content
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
            self.api.cache.vodCategories = cacheData.vod.categories;
            self.api.cache.vodStreams['_all'] = cacheData.vod.streams || [];
            self.api.cache.seriesCategories = cacheData.series.categories;
            self.api.cache.series['_all'] = cacheData.series.streams || [];
            self.api.cache.liveCategories = cacheData.live.categories;
            self.api.cache.liveStreams['_all'] = cacheData.live.streams || [];
            window.log('Background refresh: updated in-memory cache for ' + playlistId);
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
    var tab = document.querySelector('.playlist-tab[data-playlist-id="' + playlistId + '"]');
    if (!tab) return;
    var existing = tab.querySelector('.playlist-progress');
    var ageSpan = tab.querySelector('.playlist-age');
    if (!name || step === 0 && total === 0) {
        if (existing) existing.remove();
        if (ageSpan) ageSpan.style.display = '';
        return;
    }
    if (ageSpan) ageSpan.style.display = 'none';
    if (!existing) {
        existing = document.createElement('span');
        existing.className = 'playlist-progress';
        tab.appendChild(existing);
    }
    while (existing.firstChild) existing.removeChild(existing.firstChild);
    var hg = document.createElement('span');
    hg.className = 'hourglass';
    hg.textContent = '⏳';
    existing.appendChild(hg);
    existing.appendChild(document.createTextNode(' ' + step + '/' + total + ' ' + name));
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
        proxyEnabled: false,
        streamProxy: true,
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
        providerLanguage: 'ALL',
        viewMode: {},
        preferHtml5Player: false,
        dialogueBoost: false,
        historyMaxItems: 50,
        focusOnCategories: false,
        categoryPatterns: null,
        textSize: 'medium',
        freeboxEnabled: false,
        freeboxHost: 'mafreebox.freebox.fr',
        freeboxAppToken: '',
        freeboxBatchDownload: true
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
};

IPTVApp.prototype.isFavorite = function(streamOrId, playlistId) {
    var self = this;
    var targetId, targetPlaylistId;
    if (typeof streamOrId === 'object' && streamOrId !== null) {
        targetId = streamOrId.stream_id || streamOrId.series_id || streamOrId.id;
        targetPlaylistId = streamOrId._playlistId || streamOrId.playlistId || playlistId || this.settings.activePlaylistId;
    } else {
        targetId = streamOrId;
        targetPlaylistId = playlistId || this.settings.activePlaylistId;
    }
    return this.favorites.some(function(f) {
        var fId = f.stream_id || f.series_id;
        var fPlaylistId = f._playlistId || f.playlistId || self.settings.activePlaylistId;
        return fId == targetId && fPlaylistId == targetPlaylistId;
    });
};

IPTVApp.prototype.toggleFavorite = function(stream, type) {
    var self = this;
    var id = stream.stream_id || stream.series_id;
    var playlistId = stream._playlistId || stream.playlistId || this.settings.activePlaylistId;
    window.log('toggleFavorite: type=' + type + ' id=' + id + ' playlistId=' + playlistId);
    var idx = -1;
    for (var i = 0; i < this.favorites.length; i++) {
        var favId = this.favorites[i].stream_id || this.favorites[i].series_id;
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
    var isFav = this.isFavorite(stream);
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

// Remove item from history by ID and playlistId
IPTVApp.prototype.removeFromHistory = function(id, playlistId) {
    var targetPlaylistId = playlistId || this.settings.activePlaylistId;
    var idx = -1;
    for (var i = 0; i < this.watchHistory.length; i++) {
        if (this.watchHistory[i].id == id && this.watchHistory[i].playlistId == targetPlaylistId) {
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
                grid.innerHTML = '<div style="color:#888;font-size:24px;padding:40px;">' + I18n.t('home.noHistory', 'No viewing history') + '</div>';
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
    items.forEach(function(item) {
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
    });
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
    var images = this.loadBackdropImages();
    for (var i = 0; i < images.length; i++) {
        var img = new Image();
        img.src = this.proxyImageUrl(images[i]);
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

