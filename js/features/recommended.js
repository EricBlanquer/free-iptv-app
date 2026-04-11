// Recommendations engine: builds a "Recommended for you" list from
// watchHistory + favorites, scored via TMDB recommendations/similar APIs,
// matched against the current provider catalog.

IPTVApp.prototype.RECOMMENDED_MAX_SEEDS = 20;
IPTVApp.prototype.RECOMMENDED_MAX_RESULTS = 60;

IPTVApp.prototype._ensureRecommendationsState = function() {
    if (!this._recommendationsCache) this._recommendationsCache = {};
    if (!this._recommendationsPending) this._recommendationsPending = {};
};

IPTVApp.prototype._hasRecommendations = function(section) {
    this._ensureRecommendationsState();
    var entry = this._recommendationsCache[section];
    return !!(entry && entry.streams && entry.streams.length > 0);
};

IPTVApp.prototype._invalidateRecommendations = function() {
    this._recommendationsCache = {};
    this._sidebarDirty = true;
    this._dynamicGridDirty = true;
};

IPTVApp.prototype.ensureRecommendationsComputed = function(section) {
    var self = this;
    this._ensureRecommendationsState();
    if (this._recommendationsCache[section]) return;
    if (this._recommendationsPending[section]) return;
    if (section !== 'vod' && section !== 'series') return;
    if (this._collectRecommendationSeeds(section).length === 0) {
        this._recommendationsCache[section] = { streams: [] };
        return;
    }
    this._recommendationsPending[section] = true;
    this.buildRecommendations(section).then(function(streams) {
        self._recommendationsPending[section] = false;
        self._recommendationsCache[section] = { streams: streams || [] };
        if (self.currentSection === section && self.currentScreen === 'browse' && streams && streams.length > 0) {
            var data = self.data[section];
            if (data && data.categories && data.streams) {
                self.renderCategories(data.categories, data.streams);
            }
        }
    }).catch(function(err) {
        self._recommendationsPending[section] = false;
        self._recommendationsCache[section] = { streams: [] };
        window.log('ERROR', 'ensureRecommendationsComputed: ' + (err && err.message || err));
    });
};

IPTVApp.prototype._recCacheKey = function(kind, type, id) {
    return kind + '_' + type + '_' + id;
};

IPTVApp.prototype._getRecommendationsCached = function(tmdbId, tmdbType) {
    var self = this;
    var key = this._recCacheKey('rec', tmdbType, tmdbId);
    var cached = this.tmdbCache[key];
    if (cached && cached.results) {
        return Promise.resolve(cached.results);
    }
    return TMDB.getRecommendations(tmdbId, tmdbType).then(function(results) {
        self.tmdbCache[key] = { results: results, _cachedAt: Date.now() };
        self.saveTMDBCache();
        return results;
    });
};

IPTVApp.prototype._getSimilarCached = function(tmdbId, tmdbType) {
    var self = this;
    var key = this._recCacheKey('sim', tmdbType, tmdbId);
    var cached = this.tmdbCache[key];
    if (cached && cached.results) {
        return Promise.resolve(cached.results);
    }
    return TMDB.getSimilar(tmdbId, tmdbType).then(function(results) {
        self.tmdbCache[key] = { results: results, _cachedAt: Date.now() };
        self.saveTMDBCache();
        return results;
    });
};

IPTVApp.prototype._collectRecommendationSeeds = function(section) {
    var seeds = [];
    var seenTmdbIds = {};
    var wantTv = section === 'series';
    var addItem = function(tmdbId, tmdbType, sourceName) {
        if (!tmdbId || !tmdbType) return;
        var k = tmdbType + ':' + tmdbId;
        if (seenTmdbIds[k]) return;
        seenTmdbIds[k] = true;
        seeds.push({ id: tmdbId, type: tmdbType, source: sourceName });
    };
    var historyItems = (this.watchHistory || []).filter(function(h) {
        if (!h.watched) return false;
        var isTv = h.type === 'series' || h.type === 'episode' || h.tmdbType === 'tv';
        return wantTv ? isTv : !isTv;
    });
    var favItems = (this.favorites || []).filter(function(f) {
        var isTv = (f._type || f.type) === 'series';
        return wantTv ? isTv : !isTv;
    });
    historyItems.sort(function(a, b) { return (b.date || 0) - (a.date || 0); });
    for (var hi = 0; hi < historyItems.length && seeds.length < this.RECOMMENDED_MAX_SEEDS; hi++) {
        addItem(historyItems[hi].tmdbId, historyItems[hi].tmdbType, 'history');
    }
    for (var fi = 0; fi < favItems.length && seeds.length < this.RECOMMENDED_MAX_SEEDS; fi++) {
        addItem(favItems[fi].tmdb_id || favItems[fi].tmdbId, favItems[fi]._tmdbType || favItems[fi].tmdbType, 'favorite');
    }
    return seeds;
};

IPTVApp.prototype._buildSeenSet = function(section) {
    var seen = {};
    var wantTv = section === 'series';
    var addStreamId = function(id, playlistId) {
        if (id == null) return;
        seen['s:' + (playlistId || '') + ':' + id] = true;
    };
    var addTmdb = function(tmdbId, tmdbType) {
        if (!tmdbId) return;
        var isTv = tmdbType === 'tv';
        if (wantTv === isTv) seen['t:' + tmdbType + ':' + tmdbId] = true;
    };
    var historyItems = this.watchHistory || [];
    for (var hi = 0; hi < historyItems.length; hi++) {
        var h = historyItems[hi];
        var isTv = h.type === 'series' || h.type === 'episode' || h.tmdbType === 'tv';
        if (wantTv !== isTv) continue;
        addStreamId(h.seriesId || h.id, h.playlistId);
        addTmdb(h.tmdbId, h.tmdbType);
    }
    var favs = this.favorites || [];
    for (var fi = 0; fi < favs.length; fi++) {
        var f = favs[fi];
        var fIsTv = (f._type || f.type) === 'series';
        if (wantTv !== fIsTv) continue;
        addStreamId(f.series_id || f.stream_id, f._playlistId || f.playlistId);
        addTmdb(f.tmdb_id || f.tmdbId, f._tmdbType || f.tmdbType);
    }
    return seen;
};

IPTVApp.prototype._buildProviderIndex = function(streams) {
    var byTmdb = {};
    var byCleanKey = {};
    for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        if (s.tmdb_id != null) {
            byTmdb[String(s.tmdb_id)] = s;
        }
        var key = s._dedupKey;
        if (!key) {
            var rawTitle = this.getStreamTitle ? this.getStreamTitle(s) : s.name;
            var clean = this.cleanTitle(rawTitle).toLowerCase();
            var year = this.extractYear(rawTitle);
            key = clean + '|' + (year || '');
        }
        if (!byCleanKey[key]) byCleanKey[key] = s;
    }
    return { byTmdb: byTmdb, byCleanKey: byCleanKey };
};

IPTVApp.prototype._matchTmdbToStream = function(tmdbResult, type, providerIndex) {
    var hit = providerIndex.byTmdb[String(tmdbResult.id)];
    if (hit) return hit;
    var rawTitle = type === 'tv' ? (tmdbResult.name || tmdbResult.original_name) : (tmdbResult.title || tmdbResult.original_title);
    if (!rawTitle) return null;
    var clean = this.cleanTitle(rawTitle).toLowerCase();
    var year = '';
    if (type === 'tv' && tmdbResult.first_air_date) year = tmdbResult.first_air_date.substring(0, 4);
    if (type !== 'tv' && tmdbResult.release_date) year = tmdbResult.release_date.substring(0, 4);
    var key = clean + '|' + year;
    if (providerIndex.byCleanKey[key]) return providerIndex.byCleanKey[key];
    var keyNoYear = clean + '|';
    if (providerIndex.byCleanKey[keyNoYear]) return providerIndex.byCleanKey[keyNoYear];
    return null;
};

IPTVApp.prototype.buildRecommendations = function(section) {
    var self = this;
    var seeds = this._collectRecommendationSeeds(section);
    if (seeds.length === 0) return Promise.resolve([]);
    var data = this.data[section];
    if (!data || !data.streams) return Promise.resolve([]);
    var providerIndex = this._buildProviderIndex(data.streams);
    var seen = this._buildSeenSet(section);
    var fetchPromises = [];
    seeds.forEach(function(seed) {
        fetchPromises.push(self._getRecommendationsCached(seed.id, seed.type));
        fetchPromises.push(self._getSimilarCached(seed.id, seed.type));
    });
    return Promise.all(fetchPromises).then(function(allResults) {
        var scoreById = {};
        var resultById = {};
        for (var i = 0; i < allResults.length; i++) {
            var list = allResults[i] || [];
            for (var j = 0; j < list.length; j++) {
                var r = list[j];
                if (!r || !r.id) continue;
                var key = r.id;
                scoreById[key] = (scoreById[key] || 0) + 1;
                if (!resultById[key]) resultById[key] = r;
            }
        }
        var wantTv = section === 'series';
        var matched = [];
        Object.keys(scoreById).forEach(function(idKey) {
            var tmdbResult = resultById[idKey];
            var tmdbType = wantTv ? 'tv' : 'movie';
            if (seen['t:' + tmdbType + ':' + tmdbResult.id]) return;
            var stream = self._matchTmdbToStream(tmdbResult, tmdbType, providerIndex);
            if (!stream) return;
            var streamSeenKey = 's:' + (stream._playlistId || '') + ':' + (stream.series_id || stream.stream_id);
            if (seen[streamSeenKey]) return;
            matched.push({
                stream: stream,
                score: scoreById[idKey],
                tmdbId: tmdbResult.id,
                tmdbType: tmdbType,
                vote: tmdbResult.vote_average || 0
            });
        });
        var dedup = {};
        matched.forEach(function(m) {
            var sid = (m.stream._playlistId || '') + ':' + (m.stream.series_id || m.stream.stream_id);
            if (dedup[sid]) {
                if (m.score > dedup[sid].score) dedup[sid] = m;
                return;
            }
            dedup[sid] = m;
        });
        var unique = [];
        Object.keys(dedup).forEach(function(k) { unique.push(dedup[k]); });
        unique.sort(function(a, b) {
            if (b.score !== a.score) return b.score - a.score;
            return b.vote - a.vote;
        });
        return unique.slice(0, self.RECOMMENDED_MAX_RESULTS).map(function(m) {
            var s = m.stream;
            if (m.tmdbId && !s.tmdb_id) s.tmdb_id = m.tmdbId;
            return s;
        });
    });
};

IPTVApp.prototype.showRecommendedInGrid = function() {
    var self = this;
    var section = this.currentSection;
    var container = document.getElementById('content-grid');
    container.textContent = '';
    this._ensureRecommendationsState();
    var cached = this._recommendationsCache[section];
    var renderResult = function(streams) {
        if (!streams || streams.length === 0) {
            self.showEmptyMessage('content-grid', 'home.noRecommendations', 'No recommendations yet — watch or favorite a few items first');
            return;
        }
        var gridType = section === 'series' ? 'series' : 'vod';
        self.renderGrid(streams, gridType);
    };
    if (cached) {
        renderResult(cached.streams);
        return;
    }
    this.showLoading(true, I18n.t('home.computingRecommendations', 'Computing recommendations...'));
    this.buildRecommendations(section).then(function(streams) {
        self.showLoading(false);
        self._recommendationsCache[section] = { streams: streams || [] };
        renderResult(streams);
    }).catch(function(err) {
        self.showLoading(false);
        window.log('ERROR', 'buildRecommendations: ' + (err && err.message || err));
        self.showEmptyMessage('content-grid', 'home.noRecommendations', 'No recommendations');
    });
};
