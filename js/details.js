/**
 * Details module - Content details, TMDB integration, actors
 * Handles VOD/Series info, TMDB metadata, cast display, filmography
 */

// Details display
IPTVApp.prototype.showDetails = function(item) {
    var streamId = item.dataset.streamId;
    var streamType = item.dataset.streamType;
    window.log('ACTION showDetails id=' + streamId + ' type=' + streamType);
    var imageUrl = item.dataset.imageUrl || '';
    // Use dataset.streamTitle to avoid including the genre suffix span
    var title = item.dataset.streamTitle || item.querySelector('.grid-item-title').textContent;
    this.previousScreen = 'browse';
    var streamData = this.currentStreams.find(function(s) {
        return (s.stream_id || s.series_id) == streamId;
    });
    // Direct play for sections without TMDB
    if (this.currentSection === 'sport') {
        // Clear selectedStream so back returns to grid, not details
        this.selectedStream = null;
        // Sport streams are VOD, use 'vod' type for correct URL (/movie/ instead of /live/)
        this.playStream(streamId, 'vod', streamData, 0);
        return;
    }
    var isFromHistory = streamData && streamData._isHistory;
    var historyPosition = 0;
    var actualType = streamType;
    if (isFromHistory) {
        actualType = streamData._historyType || streamData._type || streamType;
        historyPosition = streamData._historyPosition || 0;
    }
    // For series from history, preserve the seriesId
    var seriesId = streamData ? (streamData.seriesId || streamData.series_id || streamData._seriesId) : null;
    this.selectedStream = {
        id: streamId,
        type: actualType,
        data: streamData,
        historyPosition: historyPosition,
        isFromHistory: isFromHistory,
        seriesId: seriesId || (actualType === 'series' ? streamId : null),
        _playlistId: streamData ? streamData._playlistId : null
    };
    document.getElementById('details-backdrop').style.backgroundImage = cssUrl(imageUrl);
    document.getElementById('details-poster').style.backgroundImage = cssUrl(imageUrl);
    var cleanDisplayTitle = title.replace(Regex.categoryPrefix, '');
    var isStreamSD = title.toUpperCase().startsWith('SD|');
    var detailsTitle = document.getElementById('details-title');
    detailsTitle.textContent = cleanDisplayTitle;
    if (isStreamSD) {
        var sdTag = document.createElement('span');
        sdTag.className = 'sd-tag';
        sdTag.style.fontSize = '24px';
        sdTag.style.marginLeft = '15px';
        sdTag.textContent = '(SD)';
        detailsTitle.appendChild(sdTag);
    }
    document.getElementById('details-meta').textContent = '';
    document.getElementById('details-description').textContent = '';
    document.getElementById('details-genres').innerHTML = '';
    document.getElementById('details-cast-grid').innerHTML = '';
    document.getElementById('details-director-section').classList.add('hidden');
    document.getElementById('details-director-grid').innerHTML = '';
    document.getElementById('details-episodes-section').classList.add('hidden');
    document.getElementById('details-season-selector').innerHTML = '';
    document.getElementById('details-episodes-grid').innerHTML = '';
    document.getElementById('series-status').classList.add('hidden');
    this.currentSeriesInfo = null;
    var playBtn = document.getElementById('play-btn');
    var continueBtn = document.getElementById('continue-btn');
    var markWatchedBtn = document.getElementById('mark-watched-btn');
    playBtn.classList.remove('hidden');
    this.updateFavoriteButton();
    var episodeLabel = '';
    if (isFromHistory && streamData._season && streamData._episode) {
        var s = streamData._season < 10 ? '0' + streamData._season : streamData._season;
        var e = streamData._episode < 10 ? '0' + streamData._episode : streamData._episode;
        episodeLabel = 'S' + s + 'E' + e;
    }
    var minMs = (this.settings.minProgressMinutes || 2) * 60000;
    if (isFromHistory && historyPosition >= minMs) {
        if (episodeLabel) {
            playBtn.textContent = episodeLabel + ' ' + I18n.t('player.fromStart', 'from start').toLowerCase();
            continueBtn.textContent = episodeLabel + ' ' + this.formatPosition(historyPosition);
        }
        else {
            playBtn.textContent = I18n.t('player.play', 'Play') + ' ' + I18n.t('player.fromStart', 'from start').toLowerCase();
            continueBtn.textContent = I18n.t('player.continueAt', 'Continue at') + ' ' + this.formatPosition(historyPosition);
        }
        continueBtn.classList.remove('hidden');
        markWatchedBtn.classList.remove('hidden');
    }
    else if (isFromHistory) {
        playBtn.textContent = episodeLabel ? episodeLabel + ' - ' + I18n.t('player.play', 'Play') : I18n.t('player.play', 'Play');
        continueBtn.classList.add('hidden');
        markWatchedBtn.classList.remove('hidden');
    }
    else {
        var vodProg = this.getWatchHistoryItem(streamId);
        var progressBar = document.getElementById('details-progress-bar');
        var progressFill = document.getElementById('details-progress-fill');
        if (vodProg && vodProg.position >= minMs && !vodProg.watched) {
            playBtn.textContent = I18n.t('player.play', 'Play') + ' ' + I18n.t('player.fromStart', 'from start').toLowerCase();
            continueBtn.textContent = I18n.t('player.continueAt', 'Continue at') + ' ' + this.formatPosition(vodProg.position);
            continueBtn.classList.remove('hidden');
            markWatchedBtn.classList.remove('hidden');
            this.selectedStream.historyPosition = vodProg.position;
            progressBar.classList.remove('hidden');
            progressFill.style.width = vodProg.percent + '%';
        }
        else {
            playBtn.textContent = I18n.t('player.play', 'Play');
            continueBtn.classList.add('hidden');
            markWatchedBtn.classList.add('hidden');
            progressBar.classList.add('hidden');
        }
        playBtn.style.opacity = '1';
    }
    // Direct play for live streams (from favorites, history, etc.)
    if (actualType === 'live' || streamType === 'live' || actualType === 'sport' || streamType === 'sport') {
        this.selectedStream = {
            id: streamId,
            type: 'live',
            data: streamData
        };
        this.playStream(streamId, 'live', streamData, 0);
        return;
    }
    if (actualType === 'vod' || streamType === 'vod') {
        if (TMDB.isEnabled()) {
            this.loadVodInfo(streamId);
        }
        else {
            this.loadVodInfoFromProvider(streamId, streamData);
        }
    }
    else if (actualType === 'series' || streamType === 'series') {
        // Only hide buttons if not coming from history with a specific episode
        var hasEpisodeFromHistory = isFromHistory && streamData && streamData._episodeId;
        if (!hasEpisodeFromHistory) {
            playBtn.classList.add('hidden');
            continueBtn.classList.add('hidden');
            markWatchedBtn.classList.add('hidden');
            document.getElementById('details-progress-bar').classList.add('hidden');
        }
        var seriesIdToLoad = (streamData && streamData.series_id) ? streamData.series_id : streamId;
        if (streamData && streamData.series_id) {
            this.selectedStream.seriesId = streamData.series_id;
        }
        this.loadSeriesInfo(seriesIdToLoad);
    }
    this.showScreen('details');
    this.focusArea = 'details';
    this.focusIndex = this.getDetailsPlayIndex();
    this.updateFocus();
};

// Prepare details screen when returning from history playback
IPTVApp.prototype.prepareDetailsFromHistory = function() {
    if (!this.selectedStream || !this.selectedStream.data) return;
    var streamData = this.selectedStream.data;
    var isSeries = this.selectedStream.type === 'series';
    var imageUrl = streamData.cover || streamData.stream_icon || '';
    var title = streamData.name || '';
    document.getElementById('details-backdrop').style.backgroundImage = cssUrl(imageUrl);
    document.getElementById('details-poster').style.backgroundImage = cssUrl(imageUrl);
    var cleanDisplayTitle = title.replace(Regex.categoryPrefix, '');
    document.getElementById('details-title').textContent = cleanDisplayTitle;
    document.getElementById('details-meta').textContent = '';
    document.getElementById('details-description').textContent = '';
    document.getElementById('details-genres').innerHTML = '';
    document.getElementById('details-cast-grid').innerHTML = '';
    document.getElementById('details-director-section').classList.add('hidden');
    document.getElementById('details-director-grid').innerHTML = '';
    document.getElementById('series-status').classList.add('hidden');
    this.updateFavoriteButton();
    if (isSeries) {
        var seriesId = this.selectedStream.seriesId || this.selectedStream.id;
        document.getElementById('details-episodes-section').classList.remove('hidden');
        if (this.currentSeriesInfo && this.currentSeriesInfo.episodes) {
            this.renderSeasons(this.currentSeriesInfo);
            if (this.currentSeason && this.currentSeriesInfo.episodes[this.currentSeason]) {
                this.renderEpisodes(this.currentSeriesInfo.episodes[this.currentSeason]);
            }
        }
        else if (seriesId) {
            var self = this;
            // Use correct API based on playlist
            var historyPlaylistId = this.selectedStream._playlistId;
            var apiToUse = this.api;
            if (historyPlaylistId && historyPlaylistId !== this.settings.activePlaylistId) {
                var playlist = this.getPlaylistById(historyPlaylistId);
                if (playlist) {
                    apiToUse = new ProviderAPI(playlist.serverUrl, playlist.username, playlist.password, this.settings.proxyUrl);
                    window.log('prepareDetailsFromHistory: using API for playlist ' + historyPlaylistId);
                }
            }
            if (apiToUse) {
                apiToUse.getSeriesInfo(seriesId).then(function(data) {
                    self.currentSeriesInfo = data;
                    self.renderSeasons(data);
                    if (self.currentSeason && data.episodes[self.currentSeason]) {
                        self.renderEpisodes(data.episodes[self.currentSeason]);
                    }
                    self.updateSeriesContinueButton(data);
                });
            }
        }
        this.fetchTMDBInfo(cleanDisplayTitle, 'tv');
    }
    else {
        document.getElementById('details-episodes-section').classList.add('hidden');
        document.getElementById('details-season-selector').innerHTML = '';
        document.getElementById('details-episodes-grid').innerHTML = '';
        this.fetchTMDBInfo(cleanDisplayTitle, 'movie');
    }
};

IPTVApp.prototype.formatPosition = function(ms) {
    var seconds = Math.floor(ms / 1000);
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    if (h > 0) {
        return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }
    return m + ':' + (s < 10 ? '0' : '') + s;
};

// VOD info
IPTVApp.prototype.loadVodInfo = function(vodId) {
    var self = this;
    var title = document.getElementById('details-title').textContent;
    var streamData = this.selectedStream ? this.selectedStream.data : null;
    // Hide series-status for movies
    var statusEl = document.getElementById('series-status');
    if (statusEl) statusEl.classList.add('hidden');
    this.displayBasicMetadata(streamData, title);
    this.fetchTMDBInfo(title, 'movie');
};

IPTVApp.prototype.loadVodInfoFromProvider = function(vodId, streamData) {
    var self = this;
    var title = document.getElementById('details-title').textContent;
    // Hide series-status for movies
    var statusEl = document.getElementById('series-status');
    if (statusEl) statusEl.classList.add('hidden');
    // Check if streamData has useful info (plot is the main indicator)
    var hasUsefulData = streamData && (streamData.plot || streamData.cast || streamData.director);
    if (!hasUsefulData) {
        window.log('loadVodInfoFromProvider: no useful data in streamData, calling getVodInfo API');
        if (this.api) {
            this.api.getVodInfo(vodId).then(function(data) {
                if (data && data.info) {
                    window.log('loadVodInfoFromProvider: got data from getVodInfo API');
                    self.renderVodInfoFromProvider(data.info);
                }
            }).catch(function(err) {
                window.log('loadVodInfoFromProvider: getVodInfo API failed: ' + err);
            });
        }
        return;
    }
    window.log('loadVodInfoFromProvider: using streamData for ' + (streamData.name || vodId));
    this.renderVodInfoFromProvider(streamData);
};

IPTVApp.prototype.renderVodInfoFromProvider = function(data) {
    // Update backdrop if available
    if (data.backdrop_path && data.backdrop_path.length > 0) {
        var backdrop = Array.isArray(data.backdrop_path) ? data.backdrop_path[0] : data.backdrop_path;
        document.getElementById('details-backdrop').style.backgroundImage = cssUrl(backdrop);
    }
    // Display description
    if (data.plot) {
        document.getElementById('details-description').textContent = data.plot;
    }
    // Display metadata (year, duration, rating)
    var metaEl = document.getElementById('details-meta');
    metaEl.textContent = '';
    var metaParts = [];
    var releaseDate = data.releaseDate || data.release_date || data.releasedate;
    if (releaseDate) {
        var year = releaseDate.substring(0, 4);
        if (year) metaParts.push(year);
    }
    if (data.episode_run_time || data.duration) {
        var duration = data.episode_run_time || data.duration;
        metaParts.push(duration + ' min');
    }
    if (metaParts.length > 0) {
        metaEl.textContent = metaParts.join(' · ');
    }
    if (data.rating) {
        var rating = parseFloat(data.rating) || 0;
        if (rating > 0) {
            var starCount = Math.round(rating / 2);
            var emptyCount = 5 - starCount;
            if (metaParts.length > 0) metaEl.appendChild(document.createTextNode(' · '));
            var starsSpan = document.createElement('span');
            starsSpan.className = 'details-stars';
            starsSpan.innerHTML = '★'.repeat(starCount) + (emptyCount > 0 ? '<span class="empty-stars">' + '☆'.repeat(emptyCount) + '</span>' : '');
            metaEl.appendChild(starsSpan);
            metaEl.appendChild(document.createTextNode(' ' + rating.toFixed(1)));
        }
    }
    // Display genres
    if (data.genre) {
        var genresEl = document.getElementById('details-genres');
        genresEl.innerHTML = '';
        var genres = data.genre.split('/').map(function(g) { return g.trim(); }).filter(function(g) { return g; });
        genres.forEach(function(genre) {
            var tag = document.createElement('span');
            tag.className = 'genre-tag';
            tag.textContent = genre;
            genresEl.appendChild(tag);
        });
    }
    // Display cast
    if (data.cast) {
        var castGrid = document.getElementById('details-cast-grid');
        castGrid.innerHTML = '';
        var castList = data.cast.split(',').map(function(c) { return c.trim(); }).filter(function(c) { return c; });
        castList.slice(0, 10).forEach(function(actorName) {
            var card = document.createElement('div');
            card.className = 'cast-card';
            var photo = document.createElement('div');
            photo.className = 'cast-photo';
            card.appendChild(photo);
            var name = document.createElement('div');
            name.className = 'cast-name';
            name.textContent = actorName;
            card.appendChild(name);
            castGrid.appendChild(card);
        });
    }
    // Display director
    if (data.director) {
        var directorSection = document.getElementById('details-director-section');
        var directorGrid = document.getElementById('details-director-grid');
        directorSection.classList.remove('hidden');
        directorGrid.innerHTML = '';
        var directors = data.director.split(',').map(function(d) { return d.trim(); }).filter(function(d) { return d; });
        directors.forEach(function(directorName) {
            var card = document.createElement('div');
            card.className = 'cast-card';
            var photo = document.createElement('div');
            photo.className = 'cast-photo';
            card.appendChild(photo);
            var name = document.createElement('div');
            name.className = 'cast-name';
            name.textContent = directorName;
            card.appendChild(name);
            directorGrid.appendChild(card);
        });
    }
};

IPTVApp.prototype.displayBasicMetadata = function(streamData, title) {
    var metaEl = document.getElementById('details-meta');
    metaEl.textContent = '';
    var year = this.extractYear(title);
    if (year) {
        metaEl.appendChild(document.createTextNode(year));
    }
    if (streamData) {
        var rating = parseFloat(streamData.rating) || 0;
        if (rating > 0) {
            var starCount = Math.round(rating / 2);
            var emptyCount = 5 - starCount;
            if (year) metaEl.appendChild(document.createTextNode(' · '));
            var starsSpan = document.createElement('span');
            starsSpan.className = 'details-stars';
            starsSpan.innerHTML = '★'.repeat(starCount) + (emptyCount > 0 ? '<span class="empty-stars">' + '☆'.repeat(emptyCount) + '</span>' : '');
            metaEl.appendChild(starsSpan);
            metaEl.appendChild(document.createTextNode(' ' + rating.toFixed(1)));
        }
    }
};

// TMDB integration
IPTVApp.prototype.fetchTMDBCast = function(title, type) {
    var self = this;
    var year = this.extractYear(title);
    var cleanTitle = this.cleanTitle(title);
    var searchFn = type === 'movie' ? TMDB.searchMovie : TMDB.searchTV;
    searchFn.call(TMDB, cleanTitle, year, function(result) {
        if (result) {
            var cast = TMDB.getCast(result);
            self.renderCast(cast);
        }
    });
};

IPTVApp.prototype.createCastCard = function(person, showCharacter) {
    var card = document.createElement('div');
    card.className = 'cast-card focusable';
    card.dataset.actorId = person.id;
    var photo = document.createElement('div');
    photo.className = 'cast-photo';
    if (person.photo) photo.style.backgroundImage = cssUrl(person.photo);
    card.appendChild(photo);
    var name = document.createElement('div');
    name.className = 'cast-name';
    name.textContent = person.name || '';
    card.appendChild(name);
    if (showCharacter) {
        var character = document.createElement('div');
        character.className = 'cast-character';
        character.textContent = person.character || '';
        card.appendChild(character);
    }
    return card;
};

IPTVApp.prototype.renderCast = function(cast) {
    var castGrid = document.getElementById('details-cast-grid');
    castGrid.innerHTML = '';
    var self = this;
    cast.forEach(function(actor) {
        castGrid.appendChild(self.createCastCard(actor, true));
    });
};

// Series info
IPTVApp.prototype.loadSeriesInfo = function(seriesId) {
    window.log('loadSeriesInfo: seriesId=' + seriesId + ' hasApi=' + !!this.api);
    var self = this;
    var title = document.getElementById('details-title').textContent;
    var streamData = this.selectedStream ? this.selectedStream.data : null;
    this.displayBasicMetadata(streamData, title);
    // Use correct API based on playlist
    var historyPlaylistId = this.selectedStream ? this.selectedStream._playlistId : null;
    var apiToUse = this.api;
    if (historyPlaylistId && historyPlaylistId !== this.settings.activePlaylistId) {
        var playlist = this.getPlaylistById(historyPlaylistId);
        if (playlist) {
            apiToUse = new ProviderAPI(playlist.serverUrl, playlist.username, playlist.password, this.settings.proxyUrl);
            window.log('loadSeriesInfo: using API for playlist ' + historyPlaylistId);
        }
    }
    if (!apiToUse) {
        window.log('loadSeriesInfo: no API, returning');
        return;
    }
    apiToUse.getSeriesInfo(seriesId).then(function(data) {
        self.currentSeriesInfo = data;
        self.currentSeason = 1;
        var episodesSection = document.getElementById('details-episodes-section');
        episodesSection.classList.remove('hidden');
        self.renderSeasons(data);
        if (data.episodes) {
            var firstSeason = Object.keys(data.episodes).sort(function(a, b) {
                return parseInt(a) - parseInt(b);
            })[0];
            if (firstSeason) {
                self.currentSeason = parseInt(firstSeason);
                self.renderEpisodes(data.episodes[firstSeason]);
            }
            self.updateSeriesContinueButton(data);
            // Update focus to continue button if visible
            self.focusIndex = self.getDetailsPlayIndex();
            self.updateFocus();
        }
    }).catch(function(err) {
        window.log('Error loading series info:', err);
    });
    this.fetchTMDBInfo(title, 'tv');
};

IPTVApp.prototype.updateVodButtons = function() {
    if (!this.selectedStream) return;
    var streamId = this.selectedStream.id;
    if (!streamId) return;
    var playBtn = document.getElementById('play-btn');
    var continueBtn = document.getElementById('continue-btn');
    var markWatchedBtn = document.getElementById('mark-watched-btn');
    var progressBar = document.getElementById('details-progress-bar');
    var progressFill = document.getElementById('details-progress-fill');
    var minMs = (this.settings.minProgressMinutes || 2) * 60000;
    var vodProg = this.getWatchHistoryItem(streamId);
    if (vodProg && vodProg.position >= minMs && !vodProg.watched) {
        playBtn.textContent = I18n.t('player.play', 'Play') + ' ' + I18n.t('player.fromStart', 'from start').toLowerCase();
        continueBtn.textContent = I18n.t('player.continueAt', 'Continue at') + ' ' + this.formatPosition(vodProg.position);
        continueBtn.classList.remove('hidden');
        markWatchedBtn.classList.remove('hidden');
        this.selectedStream.historyPosition = vodProg.position;
        progressBar.classList.remove('hidden');
        progressFill.style.width = vodProg.percent + '%';
    }
    else {
        playBtn.textContent = I18n.t('player.play', 'Play');
        continueBtn.classList.add('hidden');
        markWatchedBtn.classList.add('hidden');
        progressBar.classList.add('hidden');
    }
};

IPTVApp.prototype.updateSeriesContinueButton = function(seriesData) {
    var self = this;
    var continueBtn = document.getElementById('continue-btn');
    var playBtn = document.getElementById('play-btn');
    var statusEl = document.getElementById('series-status');
    var minMs = (this.settings.minProgressMinutes || 2) * 60000;
    var inProgressEpisode = null;
    var inProgressSeason = 0;
    var inProgressNum = 0;
    var inProgressProgress = null;
    // Find episode in progress (not finished) - most recent by season/episode number
    if (seriesData.episodes) {
        Object.keys(seriesData.episodes).forEach(function(seasonNum) {
            var episodes = seriesData.episodes[seasonNum];
            episodes.forEach(function(ep) {
                var progress = self.episodeProgress[ep.id];
                if (progress && progress.position > 0 && !progress.watched) {
                    var sNum = parseInt(seasonNum);
                    var eNum = parseInt(ep.episode_num);
                    if (sNum > inProgressSeason || (sNum === inProgressSeason && eNum > inProgressNum)) {
                        inProgressSeason = sNum;
                        inProgressNum = eNum;
                        inProgressProgress = progress;
                        inProgressEpisode = ep;
                    }
                }
            });
        });
    }
    // Case 1: Episode in progress
    if (inProgressEpisode && inProgressProgress) {
        var s = inProgressSeason < 10 ? '0' + inProgressSeason : inProgressSeason;
        var e = inProgressNum < 10 ? '0' + inProgressNum : inProgressNum;
        continueBtn.textContent = I18n.t('player.continueAt', 'Continue at') + ' S' + s + 'E' + e + ' ' + this.formatPosition(inProgressProgress.position);
        continueBtn.classList.remove('hidden');
        playBtn.textContent = 'S' + s + 'E' + e + ' ' + I18n.t('player.fromStart', 'from start').toLowerCase();
        playBtn.classList.remove('hidden');
        this.seriesContinueEpisode = {
            id: inProgressEpisode.id,
            season: inProgressSeason,
            episode: inProgressNum,
            position: inProgressProgress.position
        };
        statusEl.classList.add('hidden');
        return;
    }
    // Case 2: No episode in progress, check for next episode after last watched
    var seriesId = this.selectedStream ? this.selectedStream.id : null;
    var lastWatched = seriesId ? this.seriesProgress[seriesId] : null;
    if (lastWatched && seriesData.episodes) {
        var newEpisodesCount = this.countNewEpisodes(seriesData, lastWatched.season, lastWatched.episode);
        var lastS = lastWatched.season < 10 ? '0' + lastWatched.season : lastWatched.season;
        var lastE = lastWatched.episode < 10 ? '0' + lastWatched.episode : lastWatched.episode;
        var lastEpLabel = 'S' + lastS + 'E' + lastE;
        if (newEpisodesCount > 0) {
            var nextEpisode = this.findNextEpisodeAfter(seriesData, lastWatched.season, lastWatched.episode);
            if (nextEpisode) {
                var s = nextEpisode.season < 10 ? '0' + nextEpisode.season : nextEpisode.season;
                var e = nextEpisode.episode < 10 ? '0' + nextEpisode.episode : nextEpisode.episode;
                continueBtn.textContent = I18n.t('player.play', 'Play') + ' S' + s + 'E' + e;
                continueBtn.classList.remove('hidden');
                playBtn.textContent = I18n.t('player.play', 'Play');
                playBtn.classList.remove('hidden');
                this.seriesContinueEpisode = {
                    id: nextEpisode.id,
                    season: nextEpisode.season,
                    episode: nextEpisode.episode,
                    position: 0
                };
            }
            // Status: X new episode(s)
            var statusText = I18n.t('series.lastWatched', 'Last watched:') + ' ' + lastEpLabel + ', ';
            if (newEpisodesCount === 1) {
                statusText += '1 ' + I18n.t('series.newEpisode', 'new episode available');
            } else {
                statusText += newEpisodesCount + ' ' + I18n.t('series.newEpisodes', 'new episodes available');
            }
            statusEl.textContent = statusText;
            statusEl.classList.remove('hidden');
            return;
        } else {
            // No new episodes - still show play button for first episode
            continueBtn.classList.add('hidden');
            var firstEp = this.findFirstEpisode(seriesData);
            if (firstEp) {
                var fs = firstEp.season < 10 ? '0' + firstEp.season : firstEp.season;
                var fe = firstEp.episode < 10 ? '0' + firstEp.episode : firstEp.episode;
                playBtn.textContent = I18n.t('player.play', 'Play') + ' S' + fs + 'E' + fe;
                playBtn.classList.remove('hidden');
                this.seriesContinueEpisode = { id: firstEp.id, season: firstEp.season, episode: firstEp.episode, position: 0 };
            }
            statusEl.textContent = I18n.t('series.lastWatched', 'Last watched:') + ' ' + lastEpLabel + ', ' + I18n.t('series.noNewEpisode', 'no new episode');
            statusEl.classList.remove('hidden');
            return;
        }
    }
    // Case 3: Never watched this series - show Play button for first episode
    continueBtn.classList.add('hidden');
    var firstEpisode = this.findFirstEpisode(seriesData);
    if (firstEpisode) {
        var s = firstEpisode.season < 10 ? '0' + firstEpisode.season : firstEpisode.season;
        var e = firstEpisode.episode < 10 ? '0' + firstEpisode.episode : firstEpisode.episode;
        playBtn.textContent = I18n.t('player.play', 'Play') + ' S' + s + 'E' + e;
        playBtn.classList.remove('hidden');
        this.seriesContinueEpisode = {
            id: firstEpisode.id,
            season: firstEpisode.season,
            episode: firstEpisode.episode,
            position: 0
        };
    }
    else {
        playBtn.textContent = I18n.t('player.play', 'Play');
        this.seriesContinueEpisode = null;
    }
    statusEl.classList.add('hidden');
};

IPTVApp.prototype.countNewEpisodes = function(seriesData, lastSeason, lastEpisode) {
    if (!seriesData.episodes) return 0;
    var count = 0;
    Object.keys(seriesData.episodes).forEach(function(seasonNum) {
        var sNum = parseInt(seasonNum);
        var episodes = seriesData.episodes[seasonNum];
        episodes.forEach(function(ep) {
            var eNum = parseInt(ep.episode_num);
            if (sNum > lastSeason || (sNum === lastSeason && eNum > lastEpisode)) {
                count++;
            }
        });
    });
    return count;
};

IPTVApp.prototype.findNextEpisodeAfter = function(seriesData, lastSeason, lastEpisode) {
    if (!seriesData.episodes) return null;
    var allEpisodes = [];
    Object.keys(seriesData.episodes).forEach(function(seasonNum) {
        var episodes = seriesData.episodes[seasonNum];
        episodes.forEach(function(ep) {
            allEpisodes.push({
                id: ep.id,
                season: parseInt(seasonNum),
                episode: parseInt(ep.episode_num)
            });
        });
    });
    // Sort by season then episode
    allEpisodes.sort(function(a, b) {
        if (a.season !== b.season) return a.season - b.season;
        return a.episode - b.episode;
    });
    // Find first episode after lastSeason/lastEpisode
    for (var i = 0; i < allEpisodes.length; i++) {
        var ep = allEpisodes[i];
        if (ep.season > lastSeason || (ep.season === lastSeason && ep.episode > lastEpisode)) {
            return ep;
        }
    }
    return null;
};

IPTVApp.prototype.findFirstEpisode = function(seriesData) {
    if (!seriesData.episodes) return null;
    var seasons = Object.keys(seriesData.episodes).sort(function(a, b) {
        return parseInt(a) - parseInt(b);
    });
    if (seasons.length === 0) return null;
    var firstSeason = seasons[0];
    var episodes = seriesData.episodes[firstSeason];
    if (!episodes || episodes.length === 0) return null;
    var firstEp = episodes.reduce(function(min, ep) {
        return parseInt(ep.episode_num) < parseInt(min.episode_num) ? ep : min;
    }, episodes[0]);
    return {
        id: firstEp.id,
        season: parseInt(firstSeason),
        episode: parseInt(firstEp.episode_num)
    };
};

// Seasons and episodes
IPTVApp.prototype.renderSeasons = function(seriesData) {
    var container = document.getElementById('details-season-selector');
    container.innerHTML = '';
    var self = this;
    if (!seriesData.episodes) return;
    var seasonNumbers = Object.keys(seriesData.episodes).sort(function(a, b) {
        return parseInt(a) - parseInt(b);
    });
    seasonNumbers.forEach(function(seasonNum) {
        var btn = document.createElement('button');
        btn.className = 'season-btn focusable' + (parseInt(seasonNum) === self.currentSeason ? ' selected' : '');
        btn.textContent = I18n.t('details.season', 'Season') + ' ' + seasonNum;
        btn.dataset.season = seasonNum;
        container.appendChild(btn);
    });
};

IPTVApp.prototype.renderEpisodes = function(episodes) {
    var container = document.getElementById('details-episodes-grid');
    container.innerHTML = '';
    var self = this;
    if (!episodes || episodes.length === 0) {
        container.innerHTML = '<div style="color:#888;">' + I18n.t('player.noEpisodes', 'No episodes') + '</div>';
        return;
    }
    episodes.sort(function(a, b) {
        return parseInt(a.episode_num) - parseInt(b.episode_num);
    });
    episodes.forEach(function(ep) {
        var item = document.createElement('div');
        item.className = 'episode-item focusable';
        item.dataset.episodeId = ep.id;
        item.dataset.episodeNum = ep.episode_num;
        item.dataset.episodeTitle = ep.title || (I18n.t('details.episode', 'Episode') + ' ' + ep.episode_num);
        if (ep.container_extension) item.dataset.containerExtension = ep.container_extension;
        var numDiv = document.createElement('div');
        numDiv.className = 'episode-number';
        numDiv.textContent = I18n.t('details.episode', 'Episode') + ' ' + ep.episode_num;
        var titleDiv = document.createElement('div');
        titleDiv.className = 'episode-title';
        titleDiv.textContent = ep.title || I18n.t('details.episode', 'Episode') + ' ' + ep.episode_num;
        var infoDiv = document.createElement('div');
        infoDiv.className = 'episode-info';
        var infoParts = [];
        if (ep.info && ep.info.duration) {
            infoParts.push(ep.info.duration);
        }
        if (ep.info && ep.info.rating) {
            infoParts.push('★ ' + ep.info.rating);
        }
        infoDiv.textContent = infoParts.join(' • ');
        item.appendChild(numDiv);
        item.appendChild(titleDiv);
        if (infoParts.length > 0) item.appendChild(infoDiv);
        var progress = self.episodeProgress[ep.id];
        if (progress) {
            var progressBar = document.createElement('div');
            progressBar.className = 'episode-progress-bar';
            var progressFill = document.createElement('div');
            progressFill.className = 'episode-progress-fill' + (progress.watched ? ' watched' : '');
            progressFill.style.width = progress.percent + '%';
            progressBar.appendChild(progressFill);
            item.appendChild(progressBar);
        }
        container.appendChild(item);
    });
};

IPTVApp.prototype.selectSeason = function(seasonNum) {
    this.currentSeason = parseInt(seasonNum);
    var selectedBtn = null;
    document.querySelectorAll('.season-btn').forEach(function(btn) {
        var isSelected = parseInt(btn.dataset.season) === parseInt(seasonNum);
        btn.classList.toggle('selected', isSelected);
        if (isSelected) selectedBtn = btn;
    });
    if (this.currentSeriesInfo && this.currentSeriesInfo.episodes) {
        var episodes = this.currentSeriesInfo.episodes[seasonNum];
        this.renderEpisodes(episodes || []);
    }
    // Scroll season button to top of details wrapper
    if (selectedBtn) {
        var detailsWrapper = document.getElementById('details-wrapper');
        if (detailsWrapper) {
            // Calculate button position relative to wrapper
            var btnRect = selectedBtn.getBoundingClientRect();
            var wrapperRect = detailsWrapper.getBoundingClientRect();
            var scrollOffset = detailsWrapper.scrollTop + (btnRect.top - wrapperRect.top) - 20;
            detailsWrapper.scrollTop = scrollOffset;
        }
    }
};

IPTVApp.prototype.playEpisode = function(episodeId, forceFromStart) {
    var self = this;
    var episodeItem = document.querySelector('.episode-item[data-episode-id="' + episodeId + '"]');
    var episodeNum = episodeItem ? episodeItem.dataset.episodeNum : '';
    var episodeTitle = episodeItem ? episodeItem.dataset.episodeTitle : '';
    var containerExt = episodeItem ? episodeItem.dataset.containerExtension : null;
    this.currentEpisodeId = episodeId;
    this.currentEpisodeNum = parseInt(episodeNum) || 0;
    this.launchedFromButton = null;
    var seriesId = this.selectedStream.seriesId ||
                   (this.selectedStream.data && this.selectedStream.data.series_id) ||
                   this.selectedStream.id;
    var historyPlaylistId = this.selectedStream._playlistId;
    var stream = {
        stream_id: episodeId,
        series_id: seriesId,
        name: this.selectedStream.data.name,
        cover: this.selectedStream.data.cover || this.selectedStream.data.stream_icon,
        season: this.currentSeason,
        episode: episodeNum,
        episodeTitle: episodeTitle,
        container_extension: containerExt,
        _playlistId: historyPlaylistId
    };
    // If from different playlist, build direct URL
    if (historyPlaylistId && historyPlaylistId !== this.settings.activePlaylistId) {
        var playlist = this.getPlaylistById(historyPlaylistId);
        if (playlist) {
            stream.url = this.buildStreamUrl(playlist, episodeId, 'episode');
            window.log('playEpisode: using direct URL for playlist ' + historyPlaylistId);
        }
    }
    var progress = this.episodeProgress[episodeId];
    var minMs = (this.settings.minProgressMinutes || 2) * 60000;
    if (progress && progress.position >= minMs && !progress.watched && !forceFromStart) {
        this.pendingEpisodeStream = stream;
        this.pendingEpisodePosition = progress.position;
        this.showResumeModal(episodeNum, progress.position);
        return;
    }
    this.addToWatchHistory(stream, 'series', 0);
    this.playStream(episodeId, 'episode', stream, forceFromStart ? 0 : 0);
};

// Resume modals
IPTVApp.prototype.showResumeModal = function(episodeNum, position) {
    var modal = document.getElementById('resume-modal');
    var title = document.getElementById('resume-modal-title');
    var s = this.currentSeason < 10 ? '0' + this.currentSeason : this.currentSeason;
    var e = episodeNum < 10 ? '0' + episodeNum : episodeNum;
    title.textContent = 'S' + s + 'E' + e + ' - ' + I18n.t('modal.resumeAt', 'Resume at') + ' ' + this.formatPosition(position) + ' ?';
    modal.classList.remove('hidden');
    this.previousFocusArea = this.focusArea;
    this.previousFocusIndex = this.focusIndex;
    this.focusArea = 'modal';
    this.focusIndex = 0;
    this.updateFocus();
};

IPTVApp.prototype.hideResumeModal = function() {
    document.getElementById('resume-modal').classList.add('hidden');
    this.focusArea = this.previousFocusArea || 'grid';
    this.focusIndex = this.previousFocusIndex || 0;
    this.updateFocus();
};

IPTVApp.prototype.showVodResumeModal = function(position) {
    var modal = document.getElementById('resume-modal');
    var title = document.getElementById('resume-modal-title');
    title.textContent = I18n.t('modal.resumeTitle', 'Resume playback?') + ' ' + this.formatPosition(position);
    modal.classList.remove('hidden');
    this.previousFocusArea = this.focusArea;
    this.previousFocusIndex = this.focusIndex;
    this.focusArea = 'modal';
    this.focusIndex = 0;
    this.updateFocus();
};

IPTVApp.prototype.confirmResume = function(continuePlayback) {
    var vodStream = this.pendingVodStream;
    var vodPosition = this.pendingVodPosition;
    var episodeStream = this.pendingEpisodeStream;
    var episodePosition = this.pendingEpisodePosition;
    this.hideResumeModal();
    if (vodStream) {
        var position = continuePlayback ? vodPosition : 0;
        this.playStream(vodStream.stream_id, 'vod', vodStream, position);
    }
    else if (episodeStream) {
        var position = continuePlayback ? episodePosition : 0;
        this.addToWatchHistory(episodeStream, 'series', position);
        this.playStream(episodeStream.stream_id, 'episode', episodeStream, position);
    }
    this.pendingVodStream = null;
    this.pendingVodPosition = 0;
    this.pendingEpisodeStream = null;
    this.pendingEpisodePosition = 0;
};

// Tracks modal
IPTVApp.prototype.showTracksModal = function() {
    var tracks = this.player.getTracks();
    var audioList = document.getElementById('audio-tracks-list');
    var subtitleList = document.getElementById('subtitle-tracks-list');
    audioList.innerHTML = '';
    subtitleList.innerHTML = '';
    this.currentTracks = tracks;
    this.tracksItems = [];
    for (var i = 0; i < tracks.audio.length; i++) {
        var item = document.createElement('div');
        item.className = 'track-item focusable';
        item.dataset.type = 'audio';
        item.dataset.index = tracks.audio[i].index;
        item.textContent = tracks.audio[i].language;
        if (i === 0) item.classList.add('selected');
        audioList.appendChild(item);
        this.tracksItems.push(item);
    }
    var noSubItem = document.createElement('div');
    noSubItem.className = 'track-item focusable selected';
    noSubItem.dataset.type = 'subtitle';
    noSubItem.dataset.index = '-1';
    noSubItem.textContent = I18n.t('player.disabled', 'Disabled');
    subtitleList.appendChild(noSubItem);
    this.tracksItems.push(noSubItem);
    for (var j = 0; j < tracks.subtitle.length; j++) {
        var subItem = document.createElement('div');
        subItem.className = 'track-item focusable';
        subItem.dataset.type = 'subtitle';
        subItem.dataset.index = tracks.subtitle[j].index;
        subItem.textContent = tracks.subtitle[j].language;
        subtitleList.appendChild(subItem);
        this.tracksItems.push(subItem);
    }
    if (this.tracksItems.length === 0) {
        audioList.innerHTML = '<div class="track-item">' + I18n.t('player.noTracks', 'No tracks') + '</div>';
        return;
    }
    document.getElementById('tracks-modal').classList.remove('hidden');
    this.previousFocusArea = this.focusArea;
    this.focusArea = 'tracks';
    this.focusIndex = 0;
    this.updateFocus();
};

IPTVApp.prototype.hideTracksModal = function() {
    document.getElementById('tracks-modal').classList.add('hidden');
    this.trackModalItems = [];
    if (this.currentScreen === 'player') {
        this.focusArea = 'details';
        this.playerTracksFocused = true;
        this.updatePlayerTracksFocus();
    }
    else {
        this.focusArea = this.previousFocusArea || 'details';
    }
};

// Next episode
IPTVApp.prototype.getNextEpisode = function() {
    if (!this.currentSeriesInfo || !this.currentSeriesInfo.episodes) return null;
    var currentSeason = this.currentSeason;
    var currentEpNum = this.currentEpisodeNum;
    var episodes = this.currentSeriesInfo.episodes[currentSeason];
    if (episodes) {
        for (var i = 0; i < episodes.length; i++) {
            if (parseInt(episodes[i].episode_num) === currentEpNum + 1) {
                return { episode: episodes[i], season: currentSeason };
            }
        }
    }
    var seasonNumbers = Object.keys(this.currentSeriesInfo.episodes).sort(function(a, b) {
        return parseInt(a) - parseInt(b);
    });
    var currentSeasonIdx = seasonNumbers.indexOf(String(currentSeason));
    if (currentSeasonIdx >= 0 && currentSeasonIdx < seasonNumbers.length - 1) {
        var nextSeason = seasonNumbers[currentSeasonIdx + 1];
        var nextEpisodes = this.currentSeriesInfo.episodes[nextSeason];
        if (nextEpisodes && nextEpisodes.length > 0) {
            nextEpisodes.sort(function(a, b) {
                return parseInt(a.episode_num) - parseInt(b.episode_num);
            });
            return { episode: nextEpisodes[0], season: parseInt(nextSeason) };
        }
    }
    return null;
};

// Title utilities
IPTVApp.prototype.extractYear = function(title) {
    var match = title.match(Regex.yearInParens) || title.match(Regex.yearAtEnd);
    return match ? match[1] : null;
};

IPTVApp.prototype.titleSimilarity = function(a, b) {
    // Normalize: remove accents, keep only alphanumeric (no spaces)
    a = a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    b = b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    if (a === b) return 100;
    if (a.length === 0 || b.length === 0) return 0;
    var longer = a.length > b.length ? a : b;
    var shorter = a.length > b.length ? b : a;
    if (longer.indexOf(shorter) !== -1) return Math.round((shorter.length / longer.length) * 100);
    var matches = 0;
    for (var i = 0; i < shorter.length; i++) {
        if (longer.indexOf(shorter[i]) !== -1) matches++;
    }
    return Math.round((matches / longer.length) * 100);
};

IPTVApp.prototype.cleanTitle = function(title) {
    var result = this.stripCategoryPrefix(title)
        .replace(Regex.removeYearParens, '')
        .replace(Regex.removeYearEnd, '')
        .replace(Regex.qualityTags, '');
    if (Regex.langTags) result = result.replace(Regex.langTags, '');
    result = result.replace(Regex.seasonEpisode, '');
    if (Regex.saison) result = result.replace(Regex.saison, '');
    if (Regex.part) result = result.replace(Regex.part, '');
    result = result.replace(Regex.trailingDash, '').trim();
    return result;
};

IPTVApp.prototype.fetchTMDBCached = function(rawTitle, type, callback, forceRefresh, tmdbId) {
    var self = this;
    var year = this.extractYear(rawTitle);
    var title = this.cleanTitle(rawTitle);
    var cacheKey = tmdbId ? ('id_' + tmdbId) : this.getTMDBCacheKey(title, year);
    var cached = this.tmdbCache[cacheKey];
    if (cached && !forceRefresh && cached.id && cached.genres && cached.overview && cached.credits) {
        callback(cached);
        return;
    }
    // Use tmdb_id directly if available
    if (tmdbId) {
        window.log('TMDB using tmdb_id=' + tmdbId + ' for type=' + type);
        var detailsFn = (type === 'series' || type === 'tv') ? TMDB.getTVDetails : TMDB.getMovieDetails;
        detailsFn.call(TMDB, tmdbId, function(result) {
            if (result) {
                result._type = (type === 'series' || type === 'tv') ? 'tv' : 'movie';
                self.tmdbCache[cacheKey] = result;
                self.saveTMDBCache();
            }
            callback(result);
        });
        return;
    }
    var searchFn = (type === 'series' || type === 'tv') ? TMDB.searchTV : TMDB.searchMovie;
    searchFn.call(TMDB, title, year, function(result) {
        if (result) {
            result._type = (type === 'series' || type === 'tv') ? 'tv' : 'movie';
            self.tmdbCache[cacheKey] = result;
            self.saveTMDBCache();
        }
        callback(result);
    });
};

// TMDB info display
IPTVApp.prototype.shouldSkipTMDB = function() {
    if (this.currentSection === 'sport') return true;
    // Check custom category useTMDB setting
    if (this.currentSection && this.currentSection.indexOf('custom_') === 0) {
        var customCats = this.settings.customCategories || [];
        for (var c = 0; c < customCats.length; c++) {
            if (customCats[c].id === this.currentSection) {
                if (customCats[c].useTMDB === false) {
                    return true;
                }
                break;
            }
        }
    }
    // Check category name for excluded categories (Blind Test, Karaokes)
    if (this.selectedStream && this.selectedStream.data) {
        var catId = this.selectedStream.data.category_id;
        var section = this.currentSection || 'vod';
        var categories = this.data[section] && this.data[section].categories || [];
        var patterns = this.getCategoryPatterns();
        var ent = patterns.entertainment || {};
        var skipKeywords = (ent.blindtest || []).concat(ent.karaoke || []);
        for (var i = 0; i < categories.length; i++) {
            if (categories[i].category_id == catId) {
                var catName = (categories[i].category_name || '').toLowerCase();
                for (var j = 0; j < skipKeywords.length; j++) {
                    if (catName.indexOf(skipKeywords[j].toLowerCase()) !== -1) {
                        return true;
                    }
                }
                break;
            }
        }
    }
    return false;
};

IPTVApp.prototype.fetchTMDBInfo = function(title, type) {
    var self = this;
    var cleanTitle = this.cleanTitle(title);
    document.getElementById('details-genres').innerHTML = '';
    document.getElementById('details-cast-grid').innerHTML = '';
    document.getElementById('details-director-section').classList.add('hidden');
    document.getElementById('details-director-grid').innerHTML = '';
    // Skip TMDB for sections where it's not relevant
    if (this.shouldSkipTMDB()) {
        document.getElementById('details-description').textContent = '';
        return;
    }
    if (!TMDB.isEnabled()) {
        document.getElementById('details-description').textContent = I18n.t('details.configureTMDB', 'Configure TMDB API key in settings to view descriptions.');
        return;
    }
    document.getElementById('details-description').textContent = I18n.t('messages.searching', 'Searching...', { title: cleanTitle });
    // Get tmdb_id from stream data if available
    var tmdbId = null;
    if (this.selectedStream && this.selectedStream.data && this.selectedStream.data.tmdb_id) {
        tmdbId = this.selectedStream.data.tmdb_id;
    }
    this.fetchTMDBCached(title, type, function(result) {
        if (result) {
            self.tmdbInfo = result;
            var tmdbTitle = type === 'movie' ? result.title : result.name;
            // Clean TMDB title for comparison: remove year
            var cleanTmdbTitle = (tmdbTitle || '')
                .replace(/\s+\d{4}\b.*$/, '')
                .trim();
            // Try full comparison first, then without dashes if low match
            var similarity = self.titleSimilarity(cleanTitle, cleanTmdbTitle);
            if (similarity < 80) {
                var noDashLocal = cleanTitle.replace(/\s*-\s*/g, ' ').trim();
                var noDashTmdb = cleanTmdbTitle.replace(/\s*-\s*/g, ' ').trim();
                var similarityNoDash = self.titleSimilarity(noDashLocal, noDashTmdb);
                if (similarityNoDash > similarity) {
                    similarity = similarityNoDash;
                }
            }
            var descEl = document.getElementById('details-description');
            var overview = result.overview || 'Pas de description disponible';
            if (similarity < 80 && tmdbTitle) {
                descEl.textContent = '[TMDB: ' + tmdbTitle + ' - ' + similarity + '%] ' + overview;
            }
            else {
                descEl.textContent = overview;
            }
            var metaEl = document.getElementById('details-meta');
            metaEl.textContent = '';
            var metaParts = [];
            if (type === 'movie') {
                if (result.release_date) metaParts.push(result.release_date.substring(0, 4));
                if (result.runtime) metaParts.push(TMDB.formatRuntime(result.runtime));
            }
            else {
                if (result.first_air_date) metaParts.push(result.first_air_date.substring(0, 4));
                if (result.number_of_seasons) {
                    metaParts.push(result.number_of_seasons + ' saison' + (result.number_of_seasons > 1 ? 's' : ''));
                }
            }
            metaParts.forEach(function(part, idx) {
                if (idx > 0) metaEl.appendChild(document.createTextNode(' · '));
                metaEl.appendChild(document.createTextNode(part));
            });
            if (result.vote_average) {
                var r = result.vote_average;
                var sc = Math.round(r / 2);
                var ec = 5 - sc;
                if (metaParts.length > 0) metaEl.appendChild(document.createTextNode(' · '));
                var starsSpan = document.createElement('span');
                starsSpan.className = 'details-stars';
                starsSpan.innerHTML = '★'.repeat(sc) + (ec > 0 ? '<span class="empty-stars">' + '☆'.repeat(ec) + '</span>' : '');
                metaEl.appendChild(starsSpan);
                metaEl.appendChild(document.createTextNode(' ' + r.toFixed(1)));
            }
            var genres = TMDB.getGenres(result);
            var genresEl = document.getElementById('details-genres');
            genresEl.innerHTML = '';
            genres.forEach(function(g) {
                var span = document.createElement('span');
                span.textContent = g;
                genresEl.appendChild(span);
            });
            if (type === 'movie') {
                var director = TMDB.getDirector(result);
                self.displayDirector(director, I18n.t('details.director', 'Director'));
            }
            else {
                var creator = TMDB.getCreator(result);
                self.displayDirector(creator, I18n.t('details.creator', 'Creator'));
            }
            var cast = TMDB.getCast(result);
            self.displayCast(cast);
        }
        else {
            document.getElementById('details-description').textContent = I18n.t('details.noDescription', 'No description');
        }
    }, false, tmdbId);
};

IPTVApp.prototype.displayDirector = function(director, label) {
    var directorSection = document.getElementById('details-director-section');
    var directorGrid = document.getElementById('details-director-grid');
    var directorTitle = document.getElementById('details-director-title');
    directorGrid.innerHTML = '';
    if (director) {
        directorSection.classList.remove('hidden');
        directorTitle.textContent = label;
        directorGrid.appendChild(this.createCastCard(director, false));
    }
    else {
        directorSection.classList.add('hidden');
    }
};

IPTVApp.prototype.displayCast = function(cast) {
    var castGrid = document.getElementById('details-cast-grid');
    castGrid.innerHTML = '';
    var self = this;
    cast.forEach(function(actor) {
        castGrid.appendChild(self.createCastCard(actor, true));
    });
};

// Playback controls
IPTVApp.prototype.playCurrentStream = function(continueFromPosition) {
    window.log('ACTION playCurrentStream continue=' + continueFromPosition + ' selectedStream=' + JSON.stringify(this.selectedStream));
    if (this.selectedStream) {
        // Series from "Continue" screen with episode info
        if (this.selectedStream.type === 'series' && this.selectedStream.data && this.selectedStream.data._episodeId) {
            var data = this.selectedStream.data;
            var episodeId = data._episodeId;
            var position = continueFromPosition ? (data._historyPosition || 0) : 0;
            this.currentSeason = data._season;
            this.currentEpisodeId = episodeId;
            this.currentEpisodeNum = data._episode;
            this.launchedFromButton = continueFromPosition ? 'continue' : 'play';
            var historyPlaylistId = this.selectedStream._playlistId;
            var stream = {
                stream_id: episodeId,
                series_id: this.selectedStream.id,
                name: data.name,
                cover: data.cover || data.stream_icon,
                season: data._season,
                episode: data._episode,
                _playlistId: historyPlaylistId
            };
            // If from different playlist, build direct URL
            if (historyPlaylistId && historyPlaylistId !== this.settings.activePlaylistId) {
                var playlist = this.getPlaylistById(historyPlaylistId);
                if (playlist) {
                    stream.url = this.buildStreamUrl(playlist, episodeId, 'episode');
                    window.log('playCurrentStream: using direct URL for playlist ' + historyPlaylistId);
                }
            }
            this.addToWatchHistory(stream, 'series', position);
            this.playStream(episodeId, 'episode', stream, position);
            return;
        }
        // Series with continue episode from API data (for both Play and Continue buttons)
        if (this.seriesContinueEpisode && this.selectedStream.type === 'series') {
            var ep = this.seriesContinueEpisode;
            var position = continueFromPosition ? ep.position : 0;
            this.currentSeason = ep.season;
            this.selectSeason(ep.season);
            this.currentEpisodeId = ep.id;
            this.currentEpisodeNum = ep.episode;
            this.launchedFromButton = continueFromPosition ? 'continue' : 'play';
            var historyPlaylistId = this.selectedStream._playlistId;
            var stream = {
                stream_id: ep.id,
                series_id: this.selectedStream.id,
                name: this.selectedStream.data.name,
                cover: this.selectedStream.data.cover || this.selectedStream.data.stream_icon,
                season: ep.season,
                episode: ep.episode,
                _playlistId: historyPlaylistId
            };
            // If from different playlist, build direct URL
            if (historyPlaylistId && historyPlaylistId !== this.settings.activePlaylistId) {
                var playlist = this.getPlaylistById(historyPlaylistId);
                if (playlist) {
                    stream.url = this.buildStreamUrl(playlist, ep.id, 'episode');
                    window.log('playCurrentStream (API): using direct URL for playlist ' + historyPlaylistId);
                }
            }
            this.addToWatchHistory(stream, 'series', position);
            this.playStream(ep.id, 'episode', stream, position);
            return;
        }
        var startPosition = 0;
        if (continueFromPosition && this.selectedStream.historyPosition) {
            startPosition = this.selectedStream.historyPosition;
        }
        var streamData = this.selectedStream.data || {};
        // If from different playlist, build direct URL
        var historyPlaylistId = this.selectedStream._playlistId;
        if (historyPlaylistId && historyPlaylistId !== this.settings.activePlaylistId && !streamData.url) {
            var playlist = this.getPlaylistById(historyPlaylistId);
            if (playlist) {
                var urlType = this.selectedStream.type === 'series' ? 'episode' : 'vod';
                var ext = streamData.container_extension;
                streamData = Object.assign({}, streamData, {
                    url: this.buildStreamUrl(playlist, this.selectedStream.id, urlType, ext),
                    _playlistId: historyPlaylistId
                });
                window.log('playCurrentStream (fallback): using direct URL for playlist ' + historyPlaylistId + ' ext=' + ext);
            }
        }
        this.playStream(this.selectedStream.id, this.selectedStream.type, streamData, startPosition);
    }
};

IPTVApp.prototype.markAsWatched = function() {
    if (this.selectedStream) {
        var streamId = this.selectedStream.id;
        // Mark as watched in watchHistory
        var historyItem = this.getWatchHistoryItem(streamId);
        if (historyItem) {
            historyItem.watched = true;
            this.saveWatchHistory();
            this.updateContinueCounter();
        }
        if (this.currentStreamType === 'history') {
            this.showScreen('browse');
            this.currentScreen = 'browse';
            this.showContinueInGrid();
            var gridItems = document.querySelectorAll('#content-grid .grid-item');
            if (gridItems.length > 0) {
                this.focusArea = 'grid';
                this.focusIndex = Math.max(0, Math.min(this.lastGridIndex - 1, gridItems.length - 1));
            }
            else {
                this.focusArea = 'sidebar';
                this.focusIndex = 0;
            }
            this.updateFocus();
        }
        else {
            this.goBack();
        }
    }
};

// Actor screen
IPTVApp.prototype.showActor = function(actorId) {
    window.log('ACTION showActor: ' + actorId);
    var self = this;
    // Only restore index if returning to the same actor
    var isSameActor = this.currentActorId === actorId;
    this.currentActorId = actorId;
    document.getElementById('actor-name').textContent = I18n.t('app.loading', 'Loading...');
    document.getElementById('actor-meta').textContent = '';
    document.getElementById('actor-bio').textContent = '';
    document.getElementById('actor-filmography-grid').innerHTML = '';
    document.getElementById('actor-photo-large').style.backgroundImage = '';
    document.getElementById('actor-backdrop').style.backgroundImage = '';
    this.showScreen('actor');
    this.currentScreen = 'actor';
    this.focusArea = 'actor';
    this.restoreActorIndex = isSameActor ? (this.lastActorIndex || 0) : 0;
    this.lastActorIndex = null;
    this.focusIndex = 0;
    TMDB.getPersonDetails(actorId, function(person) {
        if (person) {
            var photoUrl = person.profile_path ?
                'https://image.tmdb.org/t/p/w500' + person.profile_path : '';
            document.getElementById('actor-photo-large').style.backgroundImage =
                photoUrl ? 'url("' + photoUrl + '")' : '';
            document.getElementById('actor-backdrop').style.backgroundImage =
                photoUrl ? 'url("' + photoUrl + '")' : '';
            document.getElementById('actor-name').textContent = person.name || '';
            var meta = [];
            if (person.birthday) {
                var age = new Date().getFullYear() - parseInt(person.birthday.substring(0, 4));
                meta.push(age + ' ans');
            }
            if (person.place_of_birth) {
                meta.push(person.place_of_birth);
            }
            document.getElementById('actor-meta').textContent = meta.join(' · ');
            document.getElementById('actor-bio').textContent =
                person.biography || I18n.t('details.noBiography', 'No biography');
            self.renderFilmography(person.combined_credits);
        }
    });
};

IPTVApp.prototype.renderFilmography = function(credits) {
    var grid = document.getElementById('actor-filmography-grid');
    grid.innerHTML = '';
    if (!credits) return;
    var allWorks = [];
    if (credits.cast) {
        allWorks = allWorks.concat(credits.cast);
    }
    if (credits.crew) {
        var crewWorks = credits.crew.filter(function(c) {
            return c.job === 'Director' || c.job === 'Creator' || c.job === 'Writer';
        });
        allWorks = allWorks.concat(crewWorks);
    }
    var seen = {};
    var unique = [];
    for (var i = 0; i < allWorks.length; i++) {
        var work = allWorks[i];
        if (!seen[work.id] && work.poster_path) {
            seen[work.id] = true;
            unique.push(work);
        }
    }
    // Store full sorted list for pagination
    this.filmographyData = unique.sort(function(a, b) {
        var dateA = a.release_date || a.first_air_date || '0000';
        var dateB = b.release_date || b.first_air_date || '0000';
        return dateB.localeCompare(dateA);
    });
    this.filmographyOffset = 0;
    this.filmographyLoading = false;
    // Load enough items to restore saved focus index, minimum 6
    var neededItems = Math.max(6, (this.restoreActorIndex || 0) + 1);
    this.loadMoreFilmography(neededItems);
    // Restore saved focus index
    if (this.restoreActorIndex > 0) {
        var items = document.getElementById('actor-filmography-grid').querySelectorAll('.filmography-item');
        if (this.restoreActorIndex < items.length) {
            this.focusIndex = this.restoreActorIndex;
        }
        this.restoreActorIndex = 0;
    }
    this.updateFocus();
    // Then start background loading
    this.loadFilmographyBackground();
};

IPTVApp.prototype.loadFilmographyBackground = function() {
    var self = this;
    if (!this.filmographyData || this.filmographyOffset >= this.filmographyData.length) {
        return;
    }
    this.filmographyLoading = true;
    setTimeout(function() {
        if (self.filmographyData && self.filmographyOffset < self.filmographyData.length) {
            self.loadMoreFilmography(10);
            // Continue loading in background
            self.loadFilmographyBackground();
        } else {
            self.filmographyLoading = false;
        }
    }, 100);
};

IPTVApp.prototype.loadMoreFilmography = function(count) {
    if (!this.filmographyData) return;
    var grid = document.getElementById('actor-filmography-grid');
    // Remove existing "more" indicator
    var existingMore = grid.querySelector('.filmography-more');
    if (existingMore) existingMore.remove();
    var start = this.filmographyOffset;
    var end = Math.min(start + count, this.filmographyData.length);
    var movies = this.filmographyData.slice(start, end);
    this.filmographyOffset = end;
    var self = this;
    movies.forEach(function(movie) {
        var item = document.createElement('div');
        item.className = 'filmography-item focusable';
        var title = movie.title || movie.name || '';
        var year = (movie.release_date || movie.first_air_date || '').substring(0, 4);
        var posterUrl = 'https://image.tmdb.org/t/p/w185' + movie.poster_path;
        var backdropUrl = movie.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + movie.backdrop_path : '';
        var mediaType = movie.media_type || 'movie';
        var available = self.findInPlaylist(title, mediaType);
        var poster = document.createElement('div');
        poster.className = 'filmography-poster';
        poster.style.backgroundImage = cssUrl(posterUrl);
        item.appendChild(poster);
        var titleEl = document.createElement('div');
        titleEl.className = 'filmography-title';
        titleEl.textContent = title;
        item.appendChild(titleEl);
        var yearEl = document.createElement('div');
        yearEl.className = 'filmography-year';
        yearEl.textContent = year;
        item.appendChild(yearEl);
        if (available) {
            var availableEl = document.createElement('div');
            availableEl.className = 'filmography-available';
            availableEl.textContent = '▶';
            item.appendChild(availableEl);
        }
        item.dataset.tmdbId = movie.id;
        item.dataset.tmdbType = mediaType;
        item.dataset.title = title;
        item.dataset.posterUrl = posterUrl;
        item.dataset.backdropUrl = backdropUrl;
        grid.appendChild(item);
    });
    // Add "more" indicator if there are more items
    if (this.filmographyOffset < this.filmographyData.length) {
        var moreItem = document.createElement('div');
        moreItem.className = 'filmography-item filmography-more';
        var remaining = this.filmographyData.length - this.filmographyOffset;
        moreItem.innerHTML = '<div class="filmography-poster filmography-more-poster">...</div>' +
            '<div class="filmography-title">+' + remaining + '</div>';
        grid.appendChild(moreItem);
    }
};

// Details from TMDB
IPTVApp.prototype.showDetailsFromTMDB = function(filmItem) {
    var tmdbId = filmItem.dataset.tmdbId;
    var tmdbType = filmItem.dataset.tmdbType;
    var title = filmItem.dataset.title;
    var posterUrl = filmItem.dataset.posterUrl;
    var backdropUrl = filmItem.dataset.backdropUrl;
    this.previousScreen = 'actor';
    var available = this.findInPlaylist(title, tmdbType);
    if (available) {
        this.selectedStream = { id: available.id, type: available.type, data: available.stream };
    }
    else {
        this.selectedStream = null;
    }
    document.getElementById('details-backdrop').style.backgroundImage = cssUrl(backdropUrl) || cssUrl(posterUrl);
    document.getElementById('details-poster').style.backgroundImage = cssUrl(posterUrl);
    document.getElementById('details-title').textContent = title;
    document.getElementById('details-meta').textContent = '';
    document.getElementById('details-description').textContent = I18n.t('app.loading', 'Loading...');
    document.getElementById('details-genres').innerHTML = '';
    document.getElementById('details-cast-grid').innerHTML = '';
    document.getElementById('details-director-section').classList.add('hidden');
    document.getElementById('details-director-grid').innerHTML = '';
    document.getElementById('series-status').classList.add('hidden');
    document.getElementById('details-episodes-section').classList.add('hidden');
    // Reset buttons
    var playBtn = document.getElementById('play-btn');
    var continueBtn = document.getElementById('continue-btn');
    var markWatchedBtn = document.getElementById('mark-watched-btn');
    var progressBar = document.getElementById('details-progress-bar');
    continueBtn.classList.add('hidden');
    markWatchedBtn.classList.add('hidden');
    progressBar.classList.add('hidden');
    var minMs = (this.settings.minProgressMinutes || 2) * 60000;
    if (available) {
        // Check progress for this movie
        if (available.type === 'vod') {
            var vodProg = this.getWatchHistoryItem(available.id);
            if (vodProg && vodProg.position >= minMs && !vodProg.watched) {
                playBtn.textContent = I18n.t('player.play', 'Play') + ' ' + I18n.t('player.fromStart', 'from start').toLowerCase();
                continueBtn.textContent = I18n.t('player.continueAt', 'Continue at') + ' ' + this.formatPosition(vodProg.position);
                continueBtn.classList.remove('hidden');
                markWatchedBtn.classList.remove('hidden');
                this.selectedStream.historyPosition = vodProg.position;
                progressBar.classList.remove('hidden');
                document.getElementById('details-progress-fill').style.width = vodProg.percent + '%';
            } else {
                playBtn.textContent = I18n.t('player.play', 'Play');
            }
            playBtn.style.opacity = '1';
        } else {
            // Series: hide play buttons until episodes are loaded
            playBtn.classList.add('hidden');
            this.loadSeriesInfo(available.id);
        }
    }
    else {
        playBtn.textContent = I18n.t('player.unavailable', 'Unavailable');
        playBtn.style.opacity = '0.5';
    }
    var type = tmdbType === 'movie' ? 'movie' : 'tv';
    this.fetchTMDBDetailsById(tmdbId, type);
    this.updateFavoriteButton();
    this.showScreen('details');
    this.currentScreen = 'details';
    this.focusArea = 'details';
    this.focusIndex = this.getDetailsPlayIndex();
    this.updateFocus();
};

IPTVApp.prototype.fetchTMDBDetailsById = function(tmdbId, type) {
    var self = this;
    if (type === 'movie') {
        TMDB.getMovieDetails(tmdbId, function(result) {
            if (result) {
                self.displayTMDBDetails(result, 'movie');
            }
            else {
                TMDB.getTVDetails(tmdbId, function(tvResult) {
                    if (tvResult) {
                        self.displayTMDBDetails(tvResult, 'tv');
                    }
                    else {
                        document.getElementById('details-description').textContent = I18n.t('details.noDescription', 'No description');
                    }
                });
            }
        });
    }
    else {
        TMDB.getTVDetails(tmdbId, function(result) {
            if (result) {
                self.displayTMDBDetails(result, 'tv');
            }
            else {
                TMDB.getMovieDetails(tmdbId, function(movieResult) {
                    if (movieResult) {
                        self.displayTMDBDetails(movieResult, 'movie');
                    }
                    else {
                        document.getElementById('details-description').textContent = I18n.t('details.noDescription', 'No description');
                    }
                });
            }
        });
    }
};

IPTVApp.prototype.displayTMDBDetails = function(result, type) {
    this.tmdbInfo = result;
    this.tmdbInfo._type = type;
    document.getElementById('details-description').textContent =
        result.overview || 'Pas de description disponible';
    var metaEl = document.getElementById('details-meta');
    metaEl.textContent = '';
    var metaParts = [];
    if (type === 'movie') {
        if (result.release_date) metaParts.push(result.release_date.substring(0, 4));
        if (result.runtime) metaParts.push(TMDB.formatRuntime(result.runtime));
    }
    else {
        if (result.first_air_date) metaParts.push(result.first_air_date.substring(0, 4));
        if (result.number_of_seasons) {
            metaParts.push(result.number_of_seasons + ' saison' + (result.number_of_seasons > 1 ? 's' : ''));
        }
    }
    metaParts.forEach(function(part, idx) {
        if (idx > 0) metaEl.appendChild(document.createTextNode(' · '));
        metaEl.appendChild(document.createTextNode(part));
    });
    if (result.vote_average) {
        var rating = result.vote_average;
        var starCount = Math.round(rating / 2);
        var emptyCount = 5 - starCount;
        if (metaParts.length > 0) metaEl.appendChild(document.createTextNode(' · '));
        var starsSpan = document.createElement('span');
        starsSpan.className = 'details-stars';
        starsSpan.innerHTML = '★'.repeat(starCount) + (emptyCount > 0 ? '<span class="empty-stars">' + '☆'.repeat(emptyCount) + '</span>' : '');
        metaEl.appendChild(starsSpan);
        metaEl.appendChild(document.createTextNode(' ' + rating.toFixed(1)));
    }
    var genres = TMDB.getGenres(result);
    var genresEl = document.getElementById('details-genres');
    genresEl.innerHTML = '';
    genres.forEach(function(g) {
        var span = document.createElement('span');
        span.textContent = g;
        genresEl.appendChild(span);
    });
    if (type === 'movie') {
        var director = TMDB.getDirector(result);
        this.displayDirector(director, I18n.t('details.director', 'Director'));
    }
    else {
        var creator = TMDB.getCreator(result);
        this.displayDirector(creator, I18n.t('details.creator', 'Creator'));
    }
    var cast = TMDB.getCast(result);
    this.displayCast(cast);
};

IPTVApp.prototype.showDetailsFromFilmography = function(streamId, streamType, filmItem) {
    window.log('ACTION showDetailsFromFilmography id=' + streamId + ' type=' + streamType);
    var streams = this.getStreams(streamType === 'vod' ? 'vod' : 'series');
    window.log('showDetailsFromFilmography: searching in ' + streams.length + ' streams');
    var stream = null;
    for (var i = 0; i < streams.length; i++) {
        var id = streams[i].stream_id || streams[i].vod_id || streams[i].series_id;
        if (String(id) === String(streamId)) {
            stream = streams[i];
            break;
        }
    }
    window.log('showDetailsFromFilmography: stream found=' + (stream ? 'yes' : 'no'));
    if (stream) {
        var title = stream.name || stream.title || '';
        var imageUrl = stream.stream_icon || stream.cover || '';
        this.selectedStream = { id: streamId, type: streamType, data: stream };
        document.getElementById('details-backdrop').style.backgroundImage = cssUrl(imageUrl);
        document.getElementById('details-poster').style.backgroundImage = cssUrl(imageUrl);
        var cleanDisplayTitle = title.replace(Regex.categoryPrefix, '');
        document.getElementById('details-title').textContent = cleanDisplayTitle;
        document.getElementById('details-meta').textContent = '';
        document.getElementById('details-description').textContent = '';
        document.getElementById('details-genres').innerHTML = '';
        document.getElementById('details-cast-grid').innerHTML = '';
        document.getElementById('details-director-section').classList.add('hidden');
        document.getElementById('details-director-grid').innerHTML = '';
        document.getElementById('series-status').classList.add('hidden');
        document.getElementById('details-episodes-section').classList.add('hidden');
        // Reset buttons
        var playBtn = document.getElementById('play-btn');
        var continueBtn = document.getElementById('continue-btn');
        var markWatchedBtn = document.getElementById('mark-watched-btn');
        var progressBar = document.getElementById('details-progress-bar');
        playBtn.classList.remove('hidden');
        playBtn.style.opacity = '1';
        continueBtn.classList.add('hidden');
        markWatchedBtn.classList.add('hidden');
        progressBar.classList.add('hidden');
        var minMs = (this.settings.minProgressMinutes || 2) * 60000;
        // Check progress for this movie
        if (streamType === 'vod') {
            var vodProg = this.getWatchHistoryItem(streamId);
            if (vodProg && vodProg.position >= minMs && !vodProg.watched) {
                playBtn.textContent = I18n.t('player.play', 'Play') + ' ' + I18n.t('player.fromStart', 'from start').toLowerCase();
                continueBtn.textContent = I18n.t('player.continueAt', 'Continue at') + ' ' + this.formatPosition(vodProg.position);
                continueBtn.classList.remove('hidden');
                markWatchedBtn.classList.remove('hidden');
                this.selectedStream.historyPosition = vodProg.position;
                progressBar.classList.remove('hidden');
                document.getElementById('details-progress-fill').style.width = vodProg.percent + '%';
            } else {
                playBtn.textContent = I18n.t('player.play', 'Play');
            }
            this.fetchTMDBInfo(title, 'movie');
        }
        else {
            // Series: hide play buttons until episodes are loaded
            playBtn.classList.add('hidden');
            continueBtn.classList.add('hidden');
            markWatchedBtn.classList.add('hidden');
            progressBar.classList.add('hidden');
            // Load series info (episodes)
            this.loadSeriesInfo(streamId);
        }
        this.updateFavoriteButton();
        this.showScreen('details');
        this.currentScreen = 'details';
        this.focusArea = 'details';
        this.focusIndex = this.getDetailsPlayIndex();
        this.updateFocus();
    }
};

// Playlist search - searches in both VOD and series if needed
IPTVApp.prototype.findInPlaylist = function(title, mediaType) {
    var normalizedTitle = title.toLowerCase().replace(Regex.nonAlphanumeric, '');
    var vodStreams = this.getStreams('vod');
    var seriesStreams = this.getStreams('series');
    // Try primary section first
    var streams = [];
    var type = 'vod';
    if (mediaType === 'movie') {
        streams = vodStreams;
        type = 'vod';
    }
    else {
        streams = seriesStreams;
        type = 'series';
    }
    var result = this._searchInStreams(normalizedTitle, streams, type);
    if (result) return result;
    // If not found, try the other section
    if (mediaType === 'movie') {
        streams = seriesStreams;
        type = 'series';
    }
    else {
        streams = vodStreams;
        type = 'vod';
    }
    return this._searchInStreams(normalizedTitle, streams, type);
};

IPTVApp.prototype._searchInStreams = function(normalizedTitle, streams, type) {
    var bestMatch = null;
    var bestScore = 0;
    for (var i = 0; i < streams.length; i++) {
        var streamTitle = (streams[i].name || streams[i].title || '').toLowerCase();
        streamTitle = streamTitle.replace(Regex.categoryPrefix, '');
        streamTitle = streamTitle.replace(Regex.removeYearParens, '');
        streamTitle = streamTitle.replace(Regex.nonAlphanumeric, '');
        if (streamTitle === normalizedTitle) {
            return {
                id: streams[i].stream_id || streams[i].vod_id || streams[i].series_id,
                type: type,
                stream: streams[i]
            };
        }
        if (streamTitle.indexOf(normalizedTitle) !== -1) {
            var score = normalizedTitle.length / streamTitle.length;
            if (score > 0.7 && score > bestScore) {
                bestScore = score;
                bestMatch = {
                    id: streams[i].stream_id || streams[i].vod_id || streams[i].series_id,
                    type: type,
                    stream: streams[i]
                };
            }
        }
    }
    return bestMatch;
};

IPTVApp.prototype.findStreamById = function(streamId, type) {
    var section;
    if (type === 'live') {
        section = 'live';
    }
    else if (type === 'sport' || type === 'vod') {
        section = 'vod';
    }
    else {
        section = 'series';
    }
    var streams = this.getStreams(section);
    for (var i = 0; i < streams.length; i++) {
        if (String(streams[i].stream_id) === String(streamId)) {
            return streams[i];
        }
    }
    return null;
};

IPTVApp.prototype.findFavoriteStream = function(streamId) {
    for (var i = 0; i < this.favorites.length; i++) {
        var fav = this.favorites[i];
        var favId = fav.stream_id || fav.series_id;
        if (String(favId) === String(streamId)) {
            return fav;
        }
    }
    return null;
};
