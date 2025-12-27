/**
 * History Module
 * Handles watch history, continue watching, and playback from history
 */

IPTVApp.prototype.playSeriesFromHistory = function(historyData) {
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
    var apiToUse = this.api;
    if (historyPlaylistId && historyPlaylistId !== this.settings.activePlaylistId) {
        var playlist = this.getPlaylistById(historyPlaylistId);
        if (playlist) {
            stream.url = this.buildStreamUrl(playlist, episodeId, 'episode');
            window.log('PLAYER', 'playSeriesFromHistory: using direct URL for playlist ' + historyPlaylistId);
            apiToUse = new ProviderAPI(playlist.serverUrl, playlist.username, playlist.password, this.getStreamProxyUrl());
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
    if (apiToUse && seriesId) {
        this.pendingSeriesInfoPromise = apiToUse.getSeriesInfo(seriesId).then(function(data) {
            self.currentSeriesInfo = data;
            self.pendingSeriesInfoPromise = null;
            window.log('PLAYER', 'playSeriesFromHistory: loaded series info, episodes=' + (data && data.episodes ? Object.keys(data.episodes).length : 0) + ' seasons');
            return data;
        }).catch(function(err) {
            self.pendingSeriesInfoPromise = null;
            window.log('ERROR', 'playSeriesFromHistory: failed to load series info: ' + err);
        });
    }
    if (position >= minMs && !historyData._watched) {
        this.pendingEpisodeStream = stream;
        this.pendingEpisodePosition = position;
        this.showResumeModal(historyData._episode, position);
    }
    else {
        this.addToWatchHistory(stream, 'series', 0);
        this.playStream(episodeId, 'episode', stream, 0);
    }
};

IPTVApp.prototype.playVodFromHistory = function(historyData) {
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
    if (historyPlaylistId && historyPlaylistId !== this.settings.activePlaylistId) {
        var playlist = this.getPlaylistById(historyPlaylistId);
        if (playlist) {
            stream.url = this.buildStreamUrl(playlist, streamId, 'vod');
            window.log('PLAYER', 'playVodFromHistory: using direct URL for playlist ' + historyPlaylistId);
        }
    }
    this.selectedStream = {
        id: streamId,
        type: 'vod',
        data: historyData,
        isFromHistory: true
    };
    if (position >= minMs && !historyData._watched) {
        this.pendingVodStream = stream;
        this.pendingVodPosition = position;
        this.showVodResumeModal(position);
    }
    else {
        this.addToWatchHistory(stream, 'vod', 0);
        this.playStream(streamId, 'vod', stream, 0);
    }
};

IPTVApp.prototype.addToWatchHistory = function(stream, type, position) {
    var genre = (stream.genre || stream.category_name || '').toLowerCase();
    if (genre.indexOf('adult') !== -1) {
        return;
    }
    var seriesId = stream.series_id || stream._seriesId;
    window.log('HISTORY', 'addToWatchHistory type=' + type + ' seriesId=' + seriesId + ' stream_id=' + stream.stream_id);
    var historyItem = {
        id: stream.stream_id || stream.series_id,
        name: this.getStreamTitle(stream),
        cover: this.getStreamImage(stream),
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
    var itemId = historyItem.id;
    var itemPlaylistId = historyItem.playlistId;
    this.watchHistory = this.watchHistory.filter(function(item) {
        return item.id != itemId || item.playlistId != itemPlaylistId;
    });
    this.watchHistory.unshift(historyItem);
    this.saveWatchHistory();
};

IPTVApp.prototype.removeFromWatchHistory = function(id, playlistId) {
    this.watchHistory = this.watchHistory.filter(function(item) {
        if (playlistId) return item.id != id || item.playlistId != playlistId;
        return item.id != id;
    });
    this.saveWatchHistory();
    this.showHistoryScreen();
};

IPTVApp.prototype.showContinueInGrid = function() {
    var container = document.getElementById('content-grid');
    container.innerHTML = '';
    var self = this;
    var filteredHistory = this.getFilteredContinueHistory();
    if (filteredHistory.length === 0) {
        this.showEmptyMessage(container, 'home.noContinue', 'No content in progress');
        return;
    }
    var streams = filteredHistory.map(function(item) {
        var seriesId = item.seriesId;
        if (!seriesId && item.type === 'series') {
            var episodeId = item.episodeId || item.id;
            var itemPlaylistId = item.playlistId;
            for (var sKey in self.seriesProgress) {
                var sProg = self.seriesProgress[sKey];
                if (sProg.episodeId == episodeId && sProg.playlistId == itemPlaylistId) {
                    seriesId = sProg.seriesId;
                    break;
                }
            }
        }
        return {
            stream_id: item.id,
            series_id: seriesId,
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
    this.showStreamGrid(streams, 'history');
};

IPTVApp.prototype.showContinueScreen = function() {
    this.initBrowseScreen('continue', 'continue', 'home.continueWatching', 'Continue watching');
    var self = this;
    var minMs = (this.settings.minProgressMinutes || 2) * 60000;
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
                timestamp: item.date || 0,
                playlistId: item.playlistId
            });
        }
    }
    var seriesMap = {};
    for (var epKey in this.episodeProgress) {
        var epProg = this.episodeProgress[epKey];
        if (epProg.position >= minMs && !epProg.watched) {
            var epPlaylistId = epProg.playlistId;
            var epId = epProg.episodeId;
            var epHistory = this.watchHistory.find(function(h) {
                return (h.id == epId || h.episodeId == epId) && h.playlistId == epPlaylistId;
            });
            var seriesId = epHistory ? epHistory.seriesId : null;
            if (seriesId) {
                var seriesKey = epPlaylistId + '_' + seriesId;
                if (!seriesMap[seriesKey] || seriesMap[seriesKey].timestamp < (epHistory.date || 0)) {
                    seriesMap[seriesKey] = {
                        id: seriesId,
                        seriesId: seriesId,
                        episodeId: epId,
                        name: epHistory.name,
                        cover: epHistory.cover,
                        type: 'series',
                        percent: epProg.percent,
                        position: epProg.position,
                        timestamp: epHistory.date || 0,
                        season: epHistory.season,
                        episode: epHistory.episode,
                        playlistId: epPlaylistId
                    };
                }
            }
        }
    }
    for (var sKey in this.seriesProgress) {
        if (!seriesMap[sKey]) {
            var sProg = this.seriesProgress[sKey];
            var sPlaylistId = sProg.playlistId;
            var sSeriesId = sProg.seriesId;
            var sHistory = this.watchHistory.find(function(h) {
                return h.seriesId == sSeriesId && h.playlistId == sPlaylistId;
            });
            if (sHistory) {
                seriesMap[sKey] = {
                    id: sSeriesId,
                    seriesId: sSeriesId,
                    episodeId: sProg.episodeId,
                    name: sHistory.name,
                    cover: sHistory.cover,
                    type: 'series',
                    percent: 100,
                    position: 0,
                    timestamp: sProg.timestamp || 0,
                    season: sProg.season,
                    episode: sProg.episode,
                    playlistId: sPlaylistId
                };
            }
        }
    }
    for (var sId in seriesMap) {
        continueItems.push(seriesMap[sId]);
    }
    continueItems.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
    var streams = continueItems.map(function(item) {
        return {
            stream_id: item.id,
            series_id: item.type === 'series' ? (item.seriesId || item.id) : null,
            name: item.name,
            stream_icon: item.cover,
            cover: item.cover,
            _type: item.type,
            _historyPosition: item.position,
            _percent: item.percent,
            _season: item.season,
            _episode: item.episode,
            _episodeId: item.episodeId,
            _isHistory: true,
            _playlistId: item.playlistId || null
        };
    });
    if (streams.length === 0) {
        this.showEmptyMessage('content-grid', 'home.noContinue', 'No content in progress');
    }
    else {
        this.renderGrid(streams, 'continue');
    }
    this.focusArea = 'grid';
    this.focusIndex = 0;
    this.deferUpdateFocus();
};

IPTVApp.prototype.showHistoryScreen = function() {
    this.initBrowseScreen('history', 'history', 'home.history', 'History');
    this.setHidden('edit-favorites-btn', true);
    this.setHidden('search-filters', true);
    this.setHidden('rating-filters', true);
    this.setHidden('sort-filters', true);
    var historyItems = [];
    var seen = {};
    for (var i = 0; i < this.watchHistory.length; i++) {
        var item = this.watchHistory[i];
        var dayKey = this.getHistoryDayKey(item.date || 0);
        var itemKey = (item.playlistId || '') + '_' + item.id + '_' + dayKey;
        if (seen[itemKey]) continue;
        seen[itemKey] = true;
        var isInProgress = !item.watched && item.position > 0;
        var duration = item.duration || 0;
        if (!duration && item.seriesId) {
            var epId = item.episodeId || item.id;
            var epProgress = this.getEpisodeProgress(epId, item.playlistId);
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
    if (historyItems.length === 0) {
        this.showEmptyMessage('content-grid', 'home.noHistory', 'No viewing history');
    }
    else {
        var grid = document.getElementById('content-grid');
        grid.classList.add('list-view');
        document.querySelectorAll('.view-btn').forEach(function(btn) {
            btn.classList.toggle('selected', btn.dataset.view === 'list');
        });
        this.renderGrid(historyItems, 'history');
    }
    this.focusArea = 'grid';
    this.focusIndex = 0;
    this.deferUpdateFocus();
};

IPTVApp.prototype.playFromHistory = function(itemId, itemType, itemName, playlistId) {
    var apiToUse = this.api;
    if (playlistId && playlistId !== this.settings.activePlaylistId) {
        var playlist = this.getPlaylistById(playlistId);
        if (playlist) {
            apiToUse = new ProviderAPI(playlist.serverUrl, playlist.username, playlist.password, this.getStreamProxyUrl());
        }
    }
    if (!apiToUse) {
        window.log('ERROR', 'Cannot play from history without API');
        return;
    }
    var url;
    var isLive = false;
    if (itemType === 'vod' || itemType === 'movie') {
        url = apiToUse.getVodStreamUrl(itemId, 'mkv');
    }
    else if (itemType === 'series') {
        url = apiToUse.getSeriesStreamUrl(itemId, 'mkv');
    }
    else {
        url = apiToUse.getLiveStreamUrl(itemId, 'ts');
        isLive = true;
    }
    this.showScreen('player');
    this.currentScreen = 'player';
    this.player.play(url, isLive);
};

IPTVApp.prototype.deleteCurrentContinueItem = function() {
    var focusables = this.getFocusables();
    if (focusables.length > 0 && this.focusIndex < focusables.length) {
        var current = focusables[this.focusIndex];
        var itemId = parseInt(current.dataset.itemId || current.dataset.streamId);
        var playlistId = current.dataset.playlistId || null;
        this.removeFromWatchHistory(itemId, playlistId);
    }
};

IPTVApp.prototype.deleteCurrentHistoryItem = function() {
    var focusables = this.getFocusables();
    if (focusables.length > 0 && this.focusIndex < focusables.length) {
        var current = focusables[this.focusIndex];
        var itemId = parseInt(current.dataset.streamId);
        var playlistId = current.dataset.playlistId || null;
        this.watchHistory = this.watchHistory.filter(function(item) {
            if (playlistId) return item.id !== itemId || item.playlistId !== playlistId;
            return item.id !== itemId;
        });
        this.saveWatchHistory();
        this.showContinueInGrid();
    }
};
