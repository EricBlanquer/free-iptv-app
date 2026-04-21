// Recommendations engine: builds a "Recommended for you" list from
// watchHistory + favorites, scored via TMDB recommendations/similar APIs,
// matched against the current provider catalog.

IPTVApp.prototype.RECOMMENDED_MAX_SEEDS = 20;
IPTVApp.prototype.RECOMMENDED_MAX_RESULTS = 60;

IPTVApp.prototype.loadRejectedRecommendations = function() {
    try {
        var data = localStorage.getItem('recommendedRejected');
        return data ? JSON.parse(data) : [];
    }
    catch (e) {
        return [];
    }
};

IPTVApp.prototype.saveRejectedRecommendations = function() {
    try {
        localStorage.setItem('recommendedRejected', JSON.stringify(this._rejectedRecs || []));
    }
    catch (e) { /* storage error */ }
};

IPTVApp.prototype.rejectRecommendation = function() {
    if (!this.selectedStream) return;
    var stream = this.selectedStream.data;
    if (!stream) return;
    if (!this._rejectedRecs) this._rejectedRecs = this.loadRejectedRecommendations();
    var tmdbId = stream.tmdb_id || stream._tmdbId || null;
    var tmdbType = this.selectedStream.type === 'series' ? 'tv' : 'movie';
    var streamKey = (stream._playlistId || '') + ':' + (stream.series_id || stream.stream_id || '');
    var entry = {
        tmdbId: tmdbId ? String(tmdbId) : null,
        tmdbType: tmdbType,
        streamKey: streamKey,
        date: Date.now()
    };
    var already = this._rejectedRecs.some(function(r) {
        if (entry.tmdbId && r.tmdbId === entry.tmdbId && r.tmdbType === entry.tmdbType) return true;
        if (r.streamKey && r.streamKey === entry.streamKey) return true;
        return false;
    });
    if (!already) {
        this._rejectedRecs.push(entry);
        this.saveRejectedRecommendations();
    }
    this._invalidateRecommendations();
    this.showToast(I18n.t('player.notForMeDone', 'Removed from recommendations'), 2000);
    this.goBack();
};

IPTVApp.prototype._getRejectedKeys = function() {
    if (!this._rejectedRecs) this._rejectedRecs = this.loadRejectedRecommendations();
    var keys = {};
    for (var i = 0; i < this._rejectedRecs.length; i++) {
        var r = this._rejectedRecs[i];
        if (r.tmdbId) keys['t:' + r.tmdbType + ':' + r.tmdbId] = true;
        if (r.streamKey) keys['k:' + r.streamKey] = true;
    }
    return keys;
};

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
        if (results !== null) {
            self.tmdbCache[key] = { results: results, _cachedAt: Date.now() };
            self.saveTMDBCache();
        }
        return results || [];
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
        if (results !== null) {
            self.tmdbCache[key] = { results: results, _cachedAt: Date.now() };
            self.saveTMDBCache();
        }
        return results || [];
    });
};

IPTVApp.prototype.RECOMMENDED_WEIGHT_MANUAL = 0.3;

IPTVApp.prototype._collectRecommendationSeeds = function(section) {
    var wantTv = section === 'series';
    var tmdbType = wantTv ? 'tv' : 'movie';
    var bucket = wantTv ? 'tv' : 'movies';
    var ratings = (this.myTMDBRatings && this.myTMDBRatings[bucket]) || {};
    var ratingIds = Object.keys(ratings);
    if (ratingIds.length > 0) {
        var ratingSeeds = [];
        for (var ri = 0; ri < ratingIds.length; ri++) {
            var tmdbId = ratingIds[ri];
            var entry = ratings[tmdbId];
            var value = typeof entry === 'number' ? entry : (entry && entry.value) || 0;
            if (value <= 0) continue;
            var weight = (value - 5) / 5;
            if (Math.abs(weight) < 0.2) continue;
            ratingSeeds.push({ id: tmdbId, type: tmdbType, weight: weight, source: 'rating' });
        }
        if (ratingSeeds.length > 0) {
            ratingSeeds.sort(function(a, b) { return Math.abs(b.weight) - Math.abs(a.weight); });
            window.log('RECO', 'using TMDB ratings as seeds: ' + ratingSeeds.length + ' (section=' + section + ')');
            return ratingSeeds.slice(0, this.RECOMMENDED_MAX_SEEDS);
        }
    }
    var seeds = [];
    var seenTmdbIds = {};
    var addItem = function(tmdbId, tmdbType, weight, sourceName) {
        if (!tmdbId || !tmdbType) return;
        var k = tmdbType + ':' + tmdbId;
        if (seenTmdbIds[k]) {
            for (var si = 0; si < seeds.length; si++) {
                if (seeds[si].id === tmdbId && seeds[si].type === tmdbType) {
                    if (weight > seeds[si].weight) seeds[si].weight = weight;
                    break;
                }
            }
            return;
        }
        seenTmdbIds[k] = true;
        seeds.push({ id: tmdbId, type: tmdbType, weight: weight, source: sourceName });
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
        var h = historyItems[hi];
        var weight = h._manuallyMarked ? this.RECOMMENDED_WEIGHT_MANUAL : 1;
        addItem(h.tmdbId, h.tmdbType, weight, 'history');
    }
    for (var fi = 0; fi < favItems.length && seeds.length < this.RECOMMENDED_MAX_SEEDS; fi++) {
        var f = favItems[fi];
        addItem(f.tmdb_id || f.tmdbId, f._tmdbType || f.tmdbType, 1, 'favorite');
    }
    window.log('RECO', 'using fallback seeds: history=' + historyItems.length + ' favorites=' + favItems.length + ' total=' + seeds.length);
    return seeds;
};

IPTVApp.prototype._buildSeenSet = function(section) {
    var seen = this._getRejectedKeys();
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
    var ratedBucket = wantTv ? 'tv' : 'movies';
    var ratedMap = (this.myTMDBRatings && this.myTMDBRatings[ratedBucket]) || {};
    Object.keys(ratedMap).forEach(function(tmdbId) {
        addTmdb(tmdbId, wantTv ? 'tv' : 'movie');
    });
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
    var weightByPromiseIdx = [];
    seeds.forEach(function(seed) {
        fetchPromises.push(self._getRecommendationsCached(seed.id, seed.type));
        weightByPromiseIdx.push(seed.weight);
        fetchPromises.push(self._getSimilarCached(seed.id, seed.type));
        weightByPromiseIdx.push(seed.weight);
    });
    return Promise.all(fetchPromises).then(function(allResults) {
        var scoreById = {};
        var resultById = {};
        for (var i = 0; i < allResults.length; i++) {
            var list = allResults[i] || [];
            var weight = weightByPromiseIdx[i] || 1;
            for (var j = 0; j < list.length; j++) {
                var r = list[j];
                if (!r || !r.id) continue;
                var key = r.id;
                scoreById[key] = (scoreById[key] || 0) + weight;
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
            var rejectedKey = 'k:' + (stream._playlistId || '') + ':' + (stream.series_id || stream.stream_id);
            if (seen[rejectedKey]) return;
            var dateStr = tmdbType === 'tv' ? tmdbResult.first_air_date : tmdbResult.release_date;
            var year = dateStr ? parseInt(dateStr.substring(0, 4), 10) : 0;
            matched.push({
                stream: stream,
                score: scoreById[idKey],
                tmdbId: tmdbResult.id,
                tmdbType: tmdbType,
                year: year || 0,
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
        Object.keys(dedup).forEach(function(k) {
            if (dedup[k].score > 0) unique.push(dedup[k]);
        });
        unique.sort(function(a, b) {
            if (b.score !== a.score) return b.score - a.score;
            if (b.year !== a.year) return b.year - a.year;
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
    this._gridLoading = true;
    this._ensureRecommendationsState();
    var cached = this._recommendationsCache[section];
    var restoreGridFocus = function(count) {
        self.focusArea = 'grid';
        var target = Math.min(self.lastGridIndex || 0, count - 1);
        if (target < 0) target = 0;
        self.focusIndex = target;
        self.lastGridIndex = target;
        self.invalidateFocusables();
        self.updateFocus();
    };
    var renderResult = function(streams) {
        if (!streams || streams.length === 0) {
            self._gridLoading = false;
            self.showEmptyMessage('content-grid', 'home.noRecommendations', 'No recommendations yet — watch or favorite a few items first');
            return;
        }
        var gridType = section === 'series' ? 'series' : 'vod';
        self.renderGrid(streams, gridType);
        restoreGridFocus(streams.length);
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
        self._gridLoading = false;
        window.log('ERROR', 'buildRecommendations: ' + (err && err.message || err));
        self.showEmptyMessage('content-grid', 'home.noRecommendations', 'No recommendations');
    });
};
