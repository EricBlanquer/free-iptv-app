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
    this.detailsStack = [];
    this.detailsReturnActorId = null;
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
    // Only use streamId as seriesId if NOT from history (from history, streamId could be episodeId)
    if (!seriesId && actualType === 'series' && !isFromHistory) {
        seriesId = streamId;
    }
    this.selectedStream = {
        id: streamId,
        type: actualType,
        data: streamData,
        historyPosition: historyPosition,
        isFromHistory: isFromHistory,
        seriesId: seriesId,
        _playlistId: streamData ? streamData._playlistId : null
    };
    this.setBackgroundImage('details-backdrop', imageUrl);
    document.getElementById('details-backdrop').classList.remove('tmdb-backdrop');
    this.currentTmdbBackdrop = null;
    this.tmdbEpisodes = null;
    this.setBackgroundImage('details-poster', imageUrl);
    var cleanDisplayTitle = this.cleanTitle(title);
    var year = this.extractYear(title);
    if (year && cleanDisplayTitle.indexOf('(' + year + ')') === -1) {
        cleanDisplayTitle += ' (' + year + ')';
    }
    var detailsTitle = document.getElementById('details-title');
    detailsTitle.textContent = cleanDisplayTitle;
    if (streamData && streamData._duplicateTag && !streamData._duplicateVersions) {
        var titleWords = cleanDisplayTitle.split(/[\s\-()]+/).filter(Boolean);
        var tagWords = streamData._duplicateTag.split(/\s+/).filter(function(w) {
            if (/^\d+$/.test(w)) return true;
            if (titleWords.some(function(tw) { return tw.toLowerCase() === w.toLowerCase(); })) return false;
            return true;
        });
        var filteredTag = tagWords.join(' ').trim();
        if (filteredTag) {
            var formatTag = document.createElement('span');
            formatTag.className = 'details-format-tag';
            formatTag.textContent = filteredTag;
            detailsTitle.appendChild(formatTag);
        }
    }
    document.getElementById('details-meta').textContent = '';
    document.getElementById('details-description').textContent = '';
    this.clearElement('details-genres');
    this.setHidden('details-cast-section', true);
    this.clearElement('details-cast-grid');
    this.setHidden('details-director-section', true);
    this.clearElement('details-director-grid');
    this.setHidden('details-episodes-section', true);
    this.clearElement('details-season-selector');
    this.clearElement('details-episodes-grid');
    this.setHidden('series-status', true);
    this.setHidden('details-duplicates', true);
    this.currentSeriesInfo = null;
    this.showDuplicatesInfo(streamData);
    var actionsEl = document.getElementById('details-actions');
    var oldVersionBtns = actionsEl.querySelectorAll('.version-btn');
    for (var vi = 0; vi < oldVersionBtns.length; vi++) {
        oldVersionBtns[vi].parentNode.removeChild(oldVersionBtns[vi]);
    }
    var oldVersionSelector = document.getElementById('version-selector');
    if (oldVersionSelector) oldVersionSelector.parentNode.removeChild(oldVersionSelector);
    var playBtn = document.getElementById('play-btn');
    var continueBtn = document.getElementById('continue-btn');
    var markWatchedBtn = document.getElementById('mark-watched-btn');
    var isSeries = actualType === 'series' || seriesId;
    window.log('showDetails: isSeries=' + isSeries + ' hasDuplicateVersions=' + !!(streamData && streamData._duplicateVersions) + ' count=' + (streamData && streamData._duplicateVersions ? streamData._duplicateVersions.length : 0));
    if (streamData && streamData._duplicateVersions && streamData._duplicateVersions.length > 1) {
        var cleanTitleForPref = this.cleanTitle(this.getStreamTitle(streamData)).toLowerCase();
        var savedPref = isSeries ? this.getSeriesVersionPref(cleanTitleForPref) : this.getMovieVersionPref(cleanTitleForPref);
        window.log('showDetails: cleanTitle=' + cleanTitleForPref + ' savedPref=' + savedPref);
        var preferredIdx = 0;
        if (savedPref !== null) {
            for (var pi = 0; pi < streamData._duplicateVersions.length; pi++) {
                if (streamData._duplicateVersions[pi].tag === savedPref) {
                    preferredIdx = pi;
                    break;
                }
            }
        } else {
            var bestScore = -1;
            for (var qi = 0; qi < streamData._duplicateVersions.length; qi++) {
                var tag = (streamData._duplicateVersions[qi].tag || '').toUpperCase();
                var score = 0;
                if (tag.indexOf('8K') !== -1 || tag.indexOf('4320') !== -1) {
                    score = 5;
                } else if (tag.indexOf('4K') !== -1 || tag.indexOf('UHD') !== -1 || tag.indexOf('2160') !== -1) {
                    score = 4;
                } else if (tag.indexOf('FHD') !== -1 || tag.indexOf('1080') !== -1) {
                    score = 3;
                } else if (tag.indexOf('HD') !== -1 || tag.indexOf('720') !== -1) {
                    score = 2;
                } else if (tag.indexOf('SD') !== -1 || tag.indexOf('480') !== -1) {
                    score = 1;
                }
                if (score > bestScore) {
                    bestScore = score;
                    preferredIdx = qi;
                }
            }
            window.log('showDetails: auto-selected best quality idx=' + preferredIdx + ' tag=' + (streamData._duplicateVersions[preferredIdx].tag || 'default'));
        }
        var versionSelector = document.createElement('div');
        versionSelector.id = 'version-selector';
        versionSelector.className = 'version-selector';
        var self = this;
        streamData._duplicateVersions.forEach(function(version, idx) {
            var btn = document.createElement('button');
            btn.className = 'version-btn focusable' + (idx === preferredIdx ? ' selected' : '');
            btn.dataset.versionId = version.id;
            btn.dataset.versionIndex = idx;
            btn.textContent = version.tag || I18n.t('details.defaultVersion', 'Standard');
            versionSelector.appendChild(btn);
        });
        var detailsInfo = document.getElementById('details-info');
        var genresEl = document.getElementById('details-genres');
        if (genresEl && genresEl.nextSibling) {
            detailsInfo.insertBefore(versionSelector, genresEl.nextSibling);
        } else {
            detailsInfo.appendChild(versionSelector);
        }
        if (preferredIdx > 0) {
            var preferredVersion = streamData._duplicateVersions[preferredIdx];
            var newData = preferredVersion.data;
            newData._duplicateVersions = streamData._duplicateVersions;
            this.selectedStream = {
                id: preferredVersion.id,
                type: isSeries ? 'series' : 'vod',
                data: newData,
                seriesId: isSeries ? preferredVersion.id : undefined,
                _playlistId: newData._playlistId || streamData._playlistId
            };
            if (isSeries) seriesId = preferredVersion.id;
        }
        this.setHidden(playBtn, false);
    }
    else {
        this.setHidden(playBtn, false);
    }
    this.updateFavoriteButton();
    this.updateDownloadButton();
    var episodeLabel = '';
    if (isFromHistory && streamData._season && streamData._episode) {
        var s = streamData._season < 10 ? '0' + streamData._season : streamData._season;
        var e = streamData._episode < 10 ? '0' + streamData._episode : streamData._episode;
        episodeLabel = 'S' + s + 'E' + e;
    }
    var minMs = (this.settings.minProgressMinutes || 2) * 60000;
    var threshold = this.settings.watchedThreshold || 90;
    var isCompleted = streamData._percent && streamData._percent >= threshold;
    if (isFromHistory && historyPosition >= minMs && !isCompleted) {
        if (episodeLabel) {
            playBtn.textContent = episodeLabel + ' ' + I18n.t('player.fromStart', 'from start').toLowerCase();
            continueBtn.textContent = episodeLabel + ' ' + this.formatPosition(historyPosition);
        }
        else {
            playBtn.textContent = I18n.t('player.play', 'Play') + ' ' + I18n.t('player.fromStart', 'from start').toLowerCase();
            continueBtn.textContent = I18n.t('player.continueAt', 'Continue at') + ' ' + this.formatPosition(historyPosition);
        }
        this.setHidden(continueBtn, false);
        this.setHidden(markWatchedBtn, false);
    }
    else if (isFromHistory) {
        playBtn.textContent = episodeLabel ? episodeLabel + ' - ' + I18n.t('player.play', 'Play') : I18n.t('player.play', 'Play');
        this.setHidden(continueBtn, true);
        this.setHidden(markWatchedBtn, false);
    }
    else {
        var vodProg = this.getWatchHistoryItem(streamId);
        if (vodProg && vodProg.position >= minMs && !vodProg.watched) {
            playBtn.textContent = I18n.t('player.play', 'Play') + ' ' + I18n.t('player.fromStart', 'from start').toLowerCase();
            continueBtn.textContent = I18n.t('player.continueAt', 'Continue at') + ' ' + this.formatPosition(vodProg.position);
            this.setHidden(continueBtn, false);
            this.setHidden(markWatchedBtn, false);
            this.selectedStream.historyPosition = vodProg.position;
        }
        else {
            playBtn.textContent = I18n.t('player.play', 'Play');
            this.setHidden(continueBtn, true);
            this.setHidden(markWatchedBtn, true);
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
            this.setHidden(playBtn, true);
            this.setHidden(continueBtn, true);
            this.setHidden(markWatchedBtn, true);
        }
        var seriesIdToLoad = seriesId || (streamData && streamData.series_id) || streamId;
        if (this.selectedStream) {
            this.selectedStream.seriesId = seriesIdToLoad;
        }
        this.loadSeriesInfo(seriesIdToLoad);
    }
    this.goToScreen('details', 'details', this.getDetailsPlayIndex());
};

// Prepare details screen when returning from history playback
IPTVApp.prototype.prepareDetailsFromHistory = function() {
    if (!this.selectedStream || !this.selectedStream.data) return;
    var streamData = this.selectedStream.data;
    var isSeries = this.selectedStream.type === 'series';
    var imageUrl = streamData.cover || streamData.stream_icon || '';
    var title = streamData.name || '';
    this.setBackgroundImage('details-backdrop', imageUrl);
    document.getElementById('details-backdrop').classList.remove('tmdb-backdrop');
    this.setBackgroundImage('details-poster', imageUrl);
    var cleanDisplayTitle = this.stripCategoryPrefix(title);
    document.getElementById('details-title').textContent = cleanDisplayTitle;
    document.getElementById('details-meta').textContent = '';
    document.getElementById('details-description').textContent = '';
    this.clearElement('details-genres');
    this.setHidden('details-cast-section', true);
    this.clearElement('details-cast-grid');
    this.setHidden('details-director-section', true);
    this.clearElement('details-director-grid');
    this.setHidden('series-status', true);
    this.updateFavoriteButton();
    if (isSeries) {
        var seriesId = this.selectedStream.seriesId;
        this.setHidden('details-episodes-section', false);
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
                    apiToUse = new ProviderAPI(playlist.serverUrl, playlist.username, playlist.password, this.getStreamProxyUrl());
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
        this.setHidden('details-episodes-section', true);
        this.clearElement('details-season-selector');
        this.clearElement('details-episodes-grid');
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
    var streamData = this.selectedStream ? this.selectedStream.data : null;
    var title = this.getCleanTitleForTMDB();
    var statusEl = document.getElementById('series-status');
    if (statusEl) this.setHidden(statusEl, true);
    this.displayBasicMetadata(streamData, title);
    this.fetchTMDBInfo(title, 'movie');
};

IPTVApp.prototype.loadVodInfoFromProvider = function(vodId, streamData) {
    var self = this;
    var statusEl = document.getElementById('series-status');
    if (statusEl) this.setHidden(statusEl, true);
    // Check if streamData has useful info (plot is the main indicator)
    var hasUsefulData = streamData && (streamData.plot || streamData.cast || streamData.director);
    if (!hasUsefulData) {
        window.log('HTTP', 'loadVodInfoFromProvider: no useful data in streamData, calling getVodInfo API');
        if (this.api) {
            this.api.getVodInfo(vodId).then(function(data) {
                if (data && data.info) {
                    window.log('HTTP', 'loadVodInfoFromProvider: got data from getVodInfo API');
                    self.renderVodInfoFromProvider(data.info);
                }
            }).catch(function(err) {
                window.log('ERROR', 'loadVodInfoFromProvider: getVodInfo API failed: ' + err);
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
        this.setBackgroundImage('details-backdrop', backdrop);
        document.getElementById('details-backdrop').classList.add('tmdb-backdrop');
    }
    // Display description
    if (data.plot) {
        document.getElementById('details-description').textContent = data.plot;
        this.preloadTTS(data.plot);
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
            if (metaParts.length > 0) metaEl.appendChild(document.createTextNode(' · '));
            var ratingContainer = document.createElement('span');
            ratingContainer.id = 'details-rating-container';
            ratingContainer.dataset.providerRating = rating;
            var starsSpan = document.createElement('span');
            starsSpan.className = 'details-stars';
            starsSpan.innerHTML = this.renderStarRating(rating);
            ratingContainer.appendChild(starsSpan);
            ratingContainer.appendChild(document.createTextNode(' ' + rating.toFixed(1)));
            metaEl.appendChild(ratingContainer);
        }
    }
    // Display genres
    if (data.genre) {
        var genresEl = document.getElementById('details-genres');
        this.clearElement(genresEl);
        var genres = this.parseDelimitedList(data.genre, '/');
        genres.forEach(function(genre) {
            var tag = document.createElement('span');
            tag.className = 'genre-tag';
            tag.textContent = genre;
            genresEl.appendChild(tag);
        });
    }
    // Display cast
    if (data.cast) {
        var castSection = document.getElementById('details-cast-section');
        var castGrid = document.getElementById('details-cast-grid');
        castGrid.innerHTML = '';
        var castList = this.parseDelimitedList(data.cast);
        if (castList.length > 0) {
            this.setHidden(castSection, false);
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
    }
    // Display director
    if (data.director) {
        var directorSection = document.getElementById('details-director-section');
        var directorGrid = document.getElementById('details-director-grid');
        this.setHidden(directorSection, false);
        directorGrid.innerHTML = '';
        var directors = this.parseDelimitedList(data.director);
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
            if (year) metaEl.appendChild(document.createTextNode(' · '));
            var ratingContainer = document.createElement('span');
            ratingContainer.id = 'details-rating-container';
            ratingContainer.dataset.providerRating = rating;
            var starsSpan = document.createElement('span');
            starsSpan.className = 'details-stars';
            starsSpan.innerHTML = this.renderStarRating(rating);
            ratingContainer.appendChild(starsSpan);
            ratingContainer.appendChild(document.createTextNode(' ' + rating.toFixed(1)));
            metaEl.appendChild(ratingContainer);
        }
    }
};

IPTVApp.prototype.displayDualRatings = function(metaEl, hasParts, providerRating, tmdbRating) {
    var providerStars = providerRating > 0 ? this.ratingToStars(providerRating) : 0;
    var tmdbStars = tmdbRating > 0 ? this.ratingToStars(tmdbRating) : 0;
    if (providerStars === 0 && tmdbStars === 0) return;
    if (hasParts) metaEl.appendChild(document.createTextNode(' · '));
    if (providerStars === tmdbStars) {
        var starsSpan = document.createElement('span');
        starsSpan.className = 'details-stars';
        starsSpan.innerHTML = this.renderStarRating(providerRating);
        metaEl.appendChild(starsSpan);
        metaEl.appendChild(document.createTextNode(' ' + providerRating.toFixed(1)));
    }
    else if (providerStars > 0 && tmdbStars === 0) {
        var starsSpan = document.createElement('span');
        starsSpan.className = 'details-stars';
        starsSpan.innerHTML = this.renderStarRating(providerRating);
        metaEl.appendChild(starsSpan);
        metaEl.appendChild(document.createTextNode(' ' + providerRating.toFixed(1)));
    }
    else if (providerStars === 0 && tmdbStars > 0) {
        var starsSpan = document.createElement('span');
        starsSpan.className = 'details-stars';
        starsSpan.innerHTML = this.renderStarRating(tmdbRating);
        metaEl.appendChild(starsSpan);
        metaEl.appendChild(document.createTextNode(' ' + tmdbRating.toFixed(1)));
    }
    else {
        var bestRating = providerStars >= tmdbStars ? providerRating : tmdbRating;
        var starsSpan = document.createElement('span');
        starsSpan.className = 'details-stars';
        starsSpan.innerHTML = this.renderStarRating(bestRating);
        metaEl.appendChild(starsSpan);
        metaEl.appendChild(document.createTextNode(' ' + bestRating.toFixed(1)));
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
    var info = document.createElement('div');
    info.className = 'cast-info';
    var name = document.createElement('div');
    name.className = 'cast-name';
    name.textContent = person.name || '';
    info.appendChild(name);
    if (showCharacter) {
        var character = document.createElement('div');
        character.className = 'cast-character';
        character.textContent = person.character || '';
        info.appendChild(character);
    }
    card.appendChild(info);
    return card;
};

IPTVApp.prototype.renderCast = function(cast) {
    var castSection = document.getElementById('details-cast-section');
    var castGrid = document.getElementById('details-cast-grid');
    castGrid.innerHTML = '';
    if (!cast || cast.length === 0) {
        this.setHidden(castSection, true);
        return;
    }
    this.setHidden(castSection, false);
    var self = this;
    cast.forEach(function(actor) {
        castGrid.appendChild(self.createCastCard(actor, true));
    });
};

// Series info
IPTVApp.prototype.loadSeriesInfo = function(seriesId) {
    window.log('loadSeriesInfo: seriesId=' + seriesId + ' hasApi=' + !!this.api);
    var self = this;
    var streamData = this.selectedStream ? this.selectedStream.data : null;
    var title = this.getCleanTitleForTMDB();
    this.displayBasicMetadata(streamData, title);
    // Use correct API based on playlist
    var historyPlaylistId = this.selectedStream ? this.selectedStream._playlistId : null;
    var apiToUse = this.api;
    if (historyPlaylistId && historyPlaylistId !== this.settings.activePlaylistId) {
        var playlist = this.getPlaylistById(historyPlaylistId);
        if (playlist) {
            apiToUse = new ProviderAPI(playlist.serverUrl, playlist.username, playlist.password, this.getStreamProxyUrl());
            window.log('loadSeriesInfo: using API for playlist ' + historyPlaylistId);
        }
    }
    if (!apiToUse) {
        window.log('ERROR', 'loadSeriesInfo: no API, returning');
        return;
    }
    apiToUse.getSeriesInfo(seriesId).then(function(data) {
        self.currentSeriesInfo = data;
        var episodesSection = document.getElementById('details-episodes-section');
        self.setHidden(episodesSection, false);
        self.renderSeasons(data);
        if (data.episodes && Object.keys(data.episodes).length > 0) {
            var sortedSeasons = Object.keys(data.episodes).sort(function(a, b) {
                return parseInt(a) - parseInt(b);
            });
            // Keep current season if it exists in the data, otherwise use first season
            var targetSeason = (self.currentSeason && data.episodes[self.currentSeason])
                ? self.currentSeason
                : parseInt(sortedSeasons[0]);
            self.currentSeason = targetSeason;
            self.renderEpisodes(data.episodes[targetSeason]);
            self.updateSeriesContinueButton(data);
            self.focusIndex = self.getDetailsPlayIndex();
            self.updateFocus();
        } else {
            document.getElementById('details-episodes-grid').innerHTML = '<div class="no-episodes">' + I18n.t('player.noEpisodes', 'No episodes') + '</div>';
            self.setHidden('play-btn', true);
            self.setHidden('continue-btn', true);
        }
    }).catch(function(err) {
        window.log('ERROR', 'Loading series info: ' + (err.message || err));
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
    var minMs = (this.settings.minProgressMinutes || 2) * 60000;
    var vodProg = this.getWatchHistoryItem(streamId);
    if (vodProg && vodProg.position >= minMs && !vodProg.watched) {
        playBtn.textContent = I18n.t('player.play', 'Play') + ' ' + I18n.t('player.fromStart', 'from start').toLowerCase();
        continueBtn.textContent = I18n.t('player.continueAt', 'Continue at') + ' ' + this.formatPosition(vodProg.position);
        this.setHidden(continueBtn, false);
        this.setHidden(markWatchedBtn, false);
        this.selectedStream.historyPosition = vodProg.position;
    }
    else {
        playBtn.textContent = I18n.t('player.play', 'Play');
        this.setHidden(continueBtn, true);
        this.setHidden(markWatchedBtn, true);
    }
};

IPTVApp.prototype.updateSeriesContinueButton = function(seriesData) {
    var self = this;
    var continueBtn = document.getElementById('continue-btn');
    var playBtn = document.getElementById('play-btn');
    var statusEl = document.getElementById('series-status');
    var minMs = (this.settings.minProgressMinutes || 2) * 60000;
    var currentPlaylistId = this.selectedStream ? this.selectedStream._playlistId : this.settings.activePlaylistId;
    var inProgressEpisode = null;
    var inProgressSeason = 0;
    var inProgressNum = 0;
    var inProgressProgress = null;
    // Find episode in progress (not finished) - most recent by season/episode number
    if (seriesData.episodes) {
        Object.keys(seriesData.episodes).forEach(function(seasonNum) {
            var episodes = seriesData.episodes[seasonNum];
            episodes.forEach(function(ep) {
                var progress = self.getEpisodeProgress(ep.id, currentPlaylistId);
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
        this.setHidden(continueBtn, false);
        playBtn.textContent = 'S' + s + 'E' + e + ' ' + I18n.t('player.fromStart', 'from start').toLowerCase();
        this.setHidden(playBtn, false);
        this.seriesContinueEpisode = {
            id: inProgressEpisode.id,
            season: inProgressSeason,
            episode: inProgressNum,
            position: inProgressProgress.position
        };
        this.setHidden(statusEl, true);
        return;
    }
    // Case 2: No episode in progress, check for next episode after last watched
    var seriesId = this.selectedStream ? this.selectedStream.seriesId : null;
    var playlistId = this.selectedStream ? this.selectedStream._playlistId : null;
    var lastWatched = seriesId ? this.getSeriesProgress(seriesId, playlistId) : null;
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
                this.setHidden(continueBtn, false);
                playBtn.textContent = I18n.t('player.play', 'Play');
                this.setHidden(playBtn, false);
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
            this.setHidden(statusEl, false);
            return;
        } else {
            // No new episodes - still show play button for first episode
            this.setHidden(continueBtn, true);
            var firstEp = this.findFirstEpisode(seriesData);
            if (firstEp) {
                var fs = firstEp.season < 10 ? '0' + firstEp.season : firstEp.season;
                var fe = firstEp.episode < 10 ? '0' + firstEp.episode : firstEp.episode;
                playBtn.textContent = I18n.t('player.play', 'Play') + ' S' + fs + 'E' + fe;
                this.setHidden(playBtn, false);
                this.seriesContinueEpisode = { id: firstEp.id, season: firstEp.season, episode: firstEp.episode, position: 0 };
            }
            statusEl.textContent = I18n.t('series.lastWatched', 'Last watched:') + ' ' + lastEpLabel + ', ' + I18n.t('series.noNewEpisode', 'no new episode');
            this.setHidden(statusEl, false);
            return;
        }
    }
    // Case 3: Never watched this series - show Play button for first episode
    this.setHidden(continueBtn, true);
    var firstEpisode = this.findFirstEpisode(seriesData);
    if (firstEpisode) {
        var s = firstEpisode.season < 10 ? '0' + firstEpisode.season : firstEpisode.season;
        var e = firstEpisode.episode < 10 ? '0' + firstEpisode.episode : firstEpisode.episode;
        playBtn.textContent = I18n.t('player.play', 'Play') + ' S' + s + 'E' + e;
        this.setHidden(playBtn, false);
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
    this.setHidden(statusEl, true);
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
    if (this.settings.freeboxEnabled && this.settings.freeboxAppToken && FreeboxAPI.isConfigured()) {
        var dlBtn = document.createElement('button');
        dlBtn.className = 'download-season-btn focusable';
        dlBtn.id = 'download-season-btn';
        container.appendChild(dlBtn);
    }
};

IPTVApp.prototype.formatLocalDate = function(dateStr) {
    if (!dateStr) return null;
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString(I18n.getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
};

IPTVApp.prototype.cleanEpisodeTitle = function(title, seriesName) {
    if (!title) return null;
    var clean = title;
    clean = clean.replace(/\.(mp4|mkv|avi|mov|wmv|flv|webm|ts)$/i, '');
    clean = clean.replace(/^.*?S\d+\s*E\d+\s*[-:]?\s*/i, '');
    clean = clean.replace(/^.*?\d+x\d+\s*[-:]?\s*/i, '');
    clean = clean.replace(/^[ÉEe]pisode\s*\d+\s*[-:]?\s*/i, '');
    clean = clean.replace(/\s*[-:]\s*[ÉEe]pisode\s*\d+\s*$/i, '');
    return clean.trim() || null;
};

IPTVApp.prototype.renderEpisodes = function(episodes) {
    var container = document.getElementById('details-episodes-grid');
    container.innerHTML = '';
    var self = this;
    var currentPlaylistId = this.selectedStream ? this.selectedStream._playlistId : this.settings.activePlaylistId;
    var seriesName = this.selectedStream && this.selectedStream.data ? this.getStreamTitle(this.selectedStream.data) : null;
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
        var cleanTitle = self.cleanEpisodeTitle(ep.title, seriesName);
        item.dataset.episodeTitle = cleanTitle || (I18n.t('details.episode', 'Episode') + ' ' + ep.episode_num);
        if (ep.container_extension) item.dataset.containerExtension = ep.container_extension;
        var numDiv = document.createElement('div');
        numDiv.className = 'episode-number';
        numDiv.textContent = I18n.t('details.episode', 'Episode') + ' ' + ep.episode_num;
        var titleDiv = document.createElement('div');
        titleDiv.className = 'episode-title';
        var tmdbEp = self.tmdbEpisodes && self.tmdbEpisodes[ep.episode_num];
        var displayTitle = tmdbEp && tmdbEp.name ? tmdbEp.name : cleanTitle;
        var rawDate = tmdbEp && tmdbEp.air_date ? tmdbEp.air_date : (ep.info && (ep.info.releasedate || ep.info.air_date) ? (ep.info.releasedate || ep.info.air_date) : null);
        var episodeDate = rawDate ? self.formatLocalDate(rawDate) : null;
        var isJustEpisodeNum = !displayTitle || /^[ÉEe]pisode\s*\d+$/i.test(displayTitle) || displayTitle === ep.episode_num.toString();
        if (isJustEpisodeNum && episodeDate) {
            titleDiv.textContent = episodeDate;
        }
        else if (!isJustEpisodeNum && episodeDate) {
            titleDiv.textContent = displayTitle + ' (' + episodeDate + ')';
        }
        else {
            titleDiv.textContent = isJustEpisodeNum ? '' : displayTitle;
        }
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
        if (titleDiv.textContent) item.appendChild(titleDiv);
        if (infoParts.length > 0) item.appendChild(infoDiv);
        var progress = self.getEpisodeProgress(ep.id, currentPlaylistId);
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
    if (this._episodeSelectMode) this.updateEpisodeSelectUI();
};

IPTVApp.prototype.selectSeason = function(seasonNum) {
    var self = this;
    if (this._episodeSelectMode) this.exitEpisodeSelectMode();
    this.currentSeason = parseInt(seasonNum);
    document.querySelectorAll('.season-btn').forEach(function(btn) {
        var isSelected = parseInt(btn.dataset.season) === parseInt(seasonNum);
        btn.classList.toggle('selected', isSelected);
    });
    if (this.currentSeriesInfo && this.currentSeriesInfo.episodes) {
        var episodes = this.currentSeriesInfo.episodes[seasonNum];
        this.renderEpisodes(episodes || []);
        if (this.tmdbInfo && this.tmdbInfo.id) {
            TMDB.getSeasonDetails(this.tmdbInfo.id, seasonNum, function(tmdbEpisodes) {
                if (tmdbEpisodes) {
                    self.tmdbEpisodes = tmdbEpisodes;
                    self.renderEpisodes(episodes || []);
                }
            });
        }
    }
    if (this.tmdbInfo && this.tmdbInfo.seasons) {
        var seasonInfo = this.tmdbInfo.seasons.find(function(s) {
            return s.season_number === parseInt(seasonNum);
        });
        if (seasonInfo && seasonInfo.overview) {
            document.getElementById('details-description').textContent = seasonInfo.overview;
            this.preloadTTS(seasonInfo.overview);
        }
        else if (this.tmdbInfo.overview) {
            document.getElementById('details-description').textContent = this.tmdbInfo.overview;
            this.preloadTTS(this.tmdbInfo.overview);
        }
    }
};

IPTVApp.prototype.selectSeriesVersion = function(versionId) {
    window.log('selectSeriesVersion: versionId=' + versionId + ' hasData=' + !!(this.selectedStream && this.selectedStream.data) + ' hasDuplicates=' + !!(this.selectedStream && this.selectedStream.data && this.selectedStream.data._duplicateVersions));
    if (!this.selectedStream || !this.selectedStream.data || !this.selectedStream.data._duplicateVersions) {
        return;
    }
    var versions = this.selectedStream.data._duplicateVersions;
    var isSeries = this.selectedStream.type === 'series';
    window.log('selectSeriesVersion: versions=' + versions.map(function(v) { return v.id + ':' + v.tag; }).join(',') + ' isSeries=' + isSeries);
    var selectedVersion = null;
    for (var i = 0; i < versions.length; i++) {
        if (versions[i].id == versionId) {
            selectedVersion = versions[i];
            break;
        }
    }
    if (!selectedVersion) return;
    document.querySelectorAll('.version-btn').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.versionId == versionId);
    });
    var newData = selectedVersion.data;
    var cleanTitle = this.cleanTitle(this.getStreamTitle(newData)).toLowerCase();
    if (isSeries) {
        this.saveSeriesVersionPref(cleanTitle, selectedVersion.tag);
    } else {
        this.saveMovieVersionPref(cleanTitle, selectedVersion.tag);
    }
    newData._duplicateVersions = versions;
    this.selectedStream = {
        id: versionId,
        type: isSeries ? 'series' : 'vod',
        data: newData,
        seriesId: isSeries ? versionId : undefined,
        _playlistId: newData._playlistId || this.selectedStream._playlistId
    };
    if (isSeries) {
        this.loadSeriesInfo(versionId);
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
                   (this.selectedStream.data && this.selectedStream.data.series_id);
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
    var progress = this.getEpisodeProgress(episodeId, historyPlaylistId);
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
    this.setHidden(modal, false);
    this.previousFocusArea = this.focusArea;
    this.previousFocusIndex = this.focusIndex;
    this.setFocus('modal', 0);
};

IPTVApp.prototype.hideResumeModal = function() {
    this.setHidden('resume-modal', true);
    this.focusArea = this.previousFocusArea || 'grid';
    this.focusIndex = this.previousFocusIndex || 0;
    this.updateFocus();
};

IPTVApp.prototype.showVodResumeModal = function(position) {
    var modal = document.getElementById('resume-modal');
    var title = document.getElementById('resume-modal-title');
    title.textContent = I18n.t('modal.resumeTitle', 'Resume playback?') + ' ' + this.formatPosition(position);
    this.setHidden(modal, false);
    this.previousFocusArea = this.focusArea;
    this.previousFocusIndex = this.focusIndex;
    this.setFocus('modal', 0);
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
    this.setHidden('tracks-modal', false);
    this.previousFocusArea = this.focusArea;
    this.setFocus('tracks', 0);
};

IPTVApp.prototype.hideTracksModal = function() {
    this.setHidden('tracks-modal', true);
    this.trackModalItems = [];
    if (this.currentScreen === 'player') {
        this.playerTracksFocused = true;
        this.updatePlayerTracksFocus();
    }
    this.focusArea = this.previousFocusArea || 'details';
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

IPTVApp.prototype.fixOverviewSpacing = function(text) {
    return text.replace(/([.!?])([A-ZÀ-ÖÙ-Ü])/g, '$1 $2');
};

IPTVApp.prototype.titleSimilarity = function(a, b) {
    a = a.replace(Regex.streamPrefix, '');
    b = b.replace(Regex.streamPrefix, '');
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
    var result = this.stripCategoryPrefix(title);
    result = result.replace(/\s*\([^)]*\)/g, '');
    result = result.replace(Regex.removeYearEnd, '');
    result = result.replace(Regex.qualityTags, '');
    if (Regex.langTags) result = result.replace(Regex.langTags, '');
    result = result.replace(Regex.vostfr, '');
    result = result.replace(Regex.seasonEpisode, '');
    if (Regex.saison) result = result.replace(Regex.saison, '');
    if (Regex.part) result = result.replace(Regex.part, '');
    result = result.replace(Regex.trailingDash, '').trim();
    return result;
};

IPTVApp.prototype.trimTMDBResult = function(data) {
    if (!data) return data;
    var trimmed = {
        id: data.id,
        title: data.title,
        name: data.name,
        overview: data.overview,
        poster_path: data.poster_path,
        backdrop_path: data.backdrop_path,
        release_date: data.release_date,
        first_air_date: data.first_air_date,
        runtime: data.runtime,
        vote_average: data.vote_average,
        number_of_seasons: data.number_of_seasons,
        _type: data._type
    };
    if (data.genres) {
        trimmed.genres = data.genres;
    }
    if (data.credits) {
        trimmed.credits = {};
        if (data.credits.cast) {
            trimmed.credits.cast = data.credits.cast.slice(0, 8).map(function(c) {
                return { id: c.id, name: c.name, character: c.character, profile_path: c.profile_path };
            });
        }
        if (data.credits.crew) {
            trimmed.credits.crew = data.credits.crew.filter(function(c) {
                return c.job === 'Director';
            }).map(function(c) {
                return { id: c.id, name: c.name, profile_path: c.profile_path, job: c.job };
            });
        }
    }
    if (data.external_ids) {
        trimmed.external_ids = { imdb_id: data.external_ids.imdb_id };
    }
    if (data.created_by && data.created_by.length > 0) {
        var first = data.created_by[0];
        trimmed.created_by = [{ id: first.id, name: first.name, profile_path: first.profile_path }];
    }
    if (data.seasons) {
        trimmed.seasons = data.seasons.map(function(s) {
            return { season_number: s.season_number, overview: s.overview };
        });
    }
    return trimmed;
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
    if (tmdbId) {
        window.log('TMDB using tmdb_id=' + tmdbId + ' for type=' + type);
        var detailsFn = (type === 'series' || type === 'tv') ? TMDB.getTVDetails : TMDB.getMovieDetails;
        detailsFn.call(TMDB, tmdbId, function(result) {
            if (result) {
                result._type = (type === 'series' || type === 'tv') ? 'tv' : 'movie';
                result = self.trimTMDBResult(result);
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
            result = self.trimTMDBResult(result);
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

IPTVApp.prototype.getCleanTitleForTMDB = function() {
    var streamData = this.selectedStream ? this.selectedStream.data : null;
    if (!streamData) {
        return document.getElementById('details-title').textContent;
    }
    var title = this.getStreamTitle(streamData);
    title = this.stripCategoryPrefix(title);
    title = title
        .replace(Regex.removeYearParens, '')
        .replace(Regex.removeYearEnd, '')
        .replace(Regex.trailingDash, '')
        .trim();
    return this.formatDisplayTitle(title);
};

IPTVApp.prototype.fetchTMDBInfo = function(title, type) {
    var self = this;
    var cleanTitle = this.cleanTitle(title);
    document.getElementById('details-genres').innerHTML = '';
    this.setHidden('details-cast-section', true);
    document.getElementById('details-cast-grid').innerHTML = '';
    this.setHidden('details-director-section', true);
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
            self.tmdbInfo._type = type;
            if (result.poster_path) {
                var posterEl = document.getElementById('details-poster');
                var currentBg = posterEl ? posterEl.style.backgroundImage : '';
                var isTmdbImage = currentBg.indexOf('image.tmdb.org') !== -1;
                if (!isTmdbImage) {
                    var tmdbPoster = 'https://image.tmdb.org/t/p/w500' + result.poster_path;
                    self.setBackgroundImage('details-poster', tmdbPoster);
                }
            }
            var tmdbTitle = type === 'movie' ? result.title : result.name;
            // Clean TMDB title for comparison: remove year
            var cleanTmdbTitle = (tmdbTitle || '')
                .replace(/\s*\([^)]*\)/g, '')
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
            var overview = result.overview ? self.fixOverviewSpacing(result.overview) : I18n.t('details.noDescription', 'No description');
            descEl.textContent = overview;
            if (similarity < 80 && tmdbTitle) {
                self._tmdbMatchText = 'TMDB: ' + tmdbTitle + ' (' + similarity + '%)';
                window.log('TMDB', 'similarity: "' + cleanTitle + '" vs "' + cleanTmdbTitle + '" = ' + similarity + '%');
            } else {
                self._tmdbMatchText = '';
            }
            if (result.overview) {
                self.preloadTTS(overview);
            }
            var metaEl = document.getElementById('details-meta');
            var providerRatingEl = document.getElementById('details-rating-container');
            var providerRating = providerRatingEl ? parseFloat(providerRatingEl.dataset.providerRating) : 0;
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
            self.displayDualRatings(metaEl, metaParts.length > 0, providerRating, result.vote_average);
            if (self._tmdbMatchText) {
                metaEl.appendChild(document.createTextNode(' · '));
                var matchSpan = document.createElement('span');
                matchSpan.className = 'tmdb-match-inline';
                matchSpan.textContent = self._tmdbMatchText;
                metaEl.appendChild(matchSpan);
            }
            var genres = TMDB.getGenres(result);
            var genresEl = document.getElementById('details-genres');
            self.clearElement(genresEl);
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
            self.fetchRandomBackdrop(result.id, type);
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
        this.setHidden(directorSection, false);
        directorTitle.textContent = label;
        directorGrid.appendChild(this.createCastCard(director, false));
    }
    else {
        this.setHidden(directorSection, true);
    }
};

IPTVApp.prototype.displayCast = function(cast) {
    var castSection = document.getElementById('details-cast-section');
    var castGrid = document.getElementById('details-cast-grid');
    castGrid.innerHTML = '';
    if (!cast || cast.length === 0) {
        this.setHidden(castSection, true);
        return;
    }
    this.setHidden(castSection, false);
    var self = this;
    cast.forEach(function(actor) {
        castGrid.appendChild(self.createCastCard(actor, true));
    });
};

IPTVApp.prototype.fetchRandomBackdrop = function(tmdbId, type) {
    var self = this;
    window.log('fetchRandomBackdrop: tmdbId=' + tmdbId + ' type=' + type);
    TMDB.getImages(tmdbId, type, function(backdrops) {
        window.log('fetchRandomBackdrop: got ' + (backdrops ? backdrops.length : 0) + ' backdrops');
        if (backdrops && backdrops.length > 0) {
            var randomIndex = Math.floor(Math.random() * backdrops.length);
            var backdropUrl = backdrops[randomIndex];
            self.setBackgroundImage('details-backdrop', backdropUrl);
            document.getElementById('details-backdrop').classList.add('tmdb-backdrop');
            self.currentTmdbBackdrop = backdropUrl;
        }
    });
};

// Playback controls
IPTVApp.prototype.playCurrentStream = function(continueFromPosition) {
    this.stopTTS();
    window.log('ACTION playCurrentStream continue=' + continueFromPosition + ' selectedStream=' + (this.selectedStream ? this.selectedStream.id + '/' + this.selectedStream.type : 'null'));
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
                series_id: this.selectedStream.seriesId,
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
                series_id: this.selectedStream.seriesId,
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

IPTVApp.prototype.playVersion = function(versionIndex) {
    if (!this.selectedStream || !this.selectedStream.data || !this.selectedStream.data._duplicateVersions) {
        window.log('ERROR', 'playVersion: no duplicate versions available');
        return;
    }
    var versions = this.selectedStream.data._duplicateVersions;
    if (versionIndex < 0 || versionIndex >= versions.length) {
        window.log('ERROR', 'playVersion: invalid version index ' + versionIndex);
        return;
    }
    var version = versions[versionIndex];
    window.log('ACTION', 'playVersion index=' + versionIndex + ' id=' + version.id + ' tag=' + version.tag);
    this.playStream(version.id, this.selectedStream.type, version.data, 0);
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
    document.getElementById('actor-filmography-title').textContent = I18n.t('details.filmography', 'Filmography');
    document.getElementById('actor-photo-large').style.backgroundImage = '';
    document.getElementById('actor-backdrop').style.backgroundImage = '';
    this.showScreen('actor');
    this.currentScreen = 'actor';
    this.focusArea = 'actor';
    this.restoreActorIndex = isSameActor ? (this.lastActorIndex || 0) : 1;
    this.lastActorIndex = null;
    this.focusIndex = 1;
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
                meta.push(I18n.t('details.age', age + ' years old', { count: age }));
            }
            if (person.place_of_birth) {
                meta.push(person.place_of_birth);
            }
            document.getElementById('actor-meta').textContent = meta.join(' · ');
            var bioText = person.biography || I18n.t('details.noBiography', 'No biography');
            document.getElementById('actor-bio').textContent = bioText.replace(/\*/g, '');
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
    // Update title with count
    var filmographyTitle = document.getElementById('actor-filmography-title');
    filmographyTitle.textContent = I18n.t('details.filmography', 'Filmography') + ' (' + this.filmographyData.length + ')';
    this.filmographyLoading = false;
    var neededItems = Math.max(16, (this.restoreActorIndex || 0) + 8);
    this.loadMoreFilmography(neededItems);
};

IPTVApp.prototype.loadMoreFilmography = function(count) {
    if (!this.filmographyData) return;
    if (this.filmographyOffset >= this.filmographyData.length) return;
    if (this.filmographyLoadPending) return;
    this.filmographyLoadPending = true;
    var start = this.filmographyOffset;
    var end = Math.min(start + count, this.filmographyData.length);
    this.filmographyOffset = end;
    var movies = this.filmographyData.slice(start, end);
    var self = this;
    requestAnimationFrame(function() {
        var grid = document.getElementById('actor-filmography-grid');
        var existingSkeletons = grid.querySelectorAll('.filmography-skeleton');
        var skeletonIndex = 0;
        movies.forEach(function(movie) {
            var item = document.createElement('div');
            item.className = 'filmography-item focusable';
            var title = movie.title || movie.name || '';
            var year = (movie.release_date || movie.first_air_date || '').substring(0, 4);
            var posterUrl = 'https://image.tmdb.org/t/p/w185' + movie.poster_path;
            var backdropUrl = movie.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + movie.backdrop_path : '';
            var mediaType = movie.media_type || 'movie';
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
            item.dataset.tmdbId = movie.id;
            item.dataset.tmdbType = mediaType;
            item.dataset.title = title;
            item.dataset.posterUrl = posterUrl;
            item.dataset.needsAvailCheck = '1';
            item.dataset.backdropUrl = backdropUrl;
            if (existingSkeletons[skeletonIndex]) {
                grid.replaceChild(item, existingSkeletons[skeletonIndex]);
                skeletonIndex++;
            }
            else {
                grid.appendChild(item);
            }
        });
        for (var i = skeletonIndex; i < existingSkeletons.length; i++) {
            existingSkeletons[i].remove();
        }
        var remaining = self.filmographyData.length - self.filmographyOffset;
        for (var i = 0; i < remaining; i++) {
            var skeleton = document.createElement('div');
            skeleton.className = 'filmography-item filmography-skeleton';
            var posterSkel = document.createElement('div');
            posterSkel.className = 'filmography-poster skeleton-shimmer';
            skeleton.appendChild(posterSkel);
            var titleSkel = document.createElement('div');
            titleSkel.className = 'filmography-title skeleton-text';
            skeleton.appendChild(titleSkel);
            grid.appendChild(skeleton);
        }
        self.filmographyLoadPending = false;
        self.checkFilmographyAvailability();
        if (self.restoreActorIndex > 1) {
            var items = grid.querySelectorAll('.filmography-item:not(.filmography-skeleton)');
            if (self.restoreActorIndex - 1 < items.length) {
                self.focusIndex = self.restoreActorIndex;
            }
            self.restoreActorIndex = 0;
        }
        self.updateFocus();
    });
};

IPTVApp.prototype.checkFilmographyAvailability = function() {
    var self = this;
    var grid = document.getElementById('actor-filmography-grid');
    var items = grid.querySelectorAll('.filmography-item[data-needs-avail-check="1"]');
    if (items.length === 0) return;
    var index = 0;
    function checkNext() {
        if (index >= items.length) return;
        var item = items[index];
        index++;
        var title = item.dataset.title;
        var mediaType = item.dataset.tmdbType;
        var available = self.findInPlaylist(title, mediaType);
        delete item.dataset.needsAvailCheck;
        if (available && !item.querySelector('.filmography-available')) {
            var availableEl = document.createElement('div');
            availableEl.className = 'filmography-available';
            availableEl.textContent = '▶';
            item.appendChild(availableEl);
        }
        setTimeout(checkNext, 10);
    }
    setTimeout(checkNext, 50);
};

// Details from TMDB
IPTVApp.prototype.showDetailsFromTMDB = function(filmItem) {
    this.detailsReturnActorId = this.currentActorId;
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
    this.setBackgroundImage('details-backdrop', backdropUrl || posterUrl);
    if (backdropUrl) {
        document.getElementById('details-backdrop').classList.add('tmdb-backdrop');
    }
    else {
        document.getElementById('details-backdrop').classList.remove('tmdb-backdrop');
    }
    this.setBackgroundImage('details-poster', posterUrl);
    document.getElementById('details-title').textContent = title;
    document.getElementById('details-meta').textContent = '';
    document.getElementById('details-description').textContent = I18n.t('app.loading', 'Loading...');
    document.getElementById('details-genres').innerHTML = '';
    this.setHidden('details-cast-section', true);
    document.getElementById('details-cast-grid').innerHTML = '';
    this.setHidden('details-director-section', true);
    document.getElementById('details-director-grid').innerHTML = '';
    this.setHidden('series-status', true);
    this.setHidden('details-episodes-section', true);
    // Reset buttons
    var playBtn = document.getElementById('play-btn');
    var continueBtn = document.getElementById('continue-btn');
    var markWatchedBtn = document.getElementById('mark-watched-btn');
    this.setHidden(continueBtn, true);
    this.setHidden(markWatchedBtn, true);
    var minMs = (this.settings.minProgressMinutes || 2) * 60000;
    if (available) {
        // Check progress for this movie
        if (available.type === 'vod') {
            var vodProg = this.getWatchHistoryItem(available.id);
            if (vodProg && vodProg.position >= minMs && !vodProg.watched) {
                playBtn.textContent = I18n.t('player.play', 'Play') + ' ' + I18n.t('player.fromStart', 'from start').toLowerCase();
                continueBtn.textContent = I18n.t('player.continueAt', 'Continue at') + ' ' + this.formatPosition(vodProg.position);
                this.setHidden(continueBtn, false);
                this.setHidden(markWatchedBtn, false);
                this.selectedStream.historyPosition = vodProg.position;
            } else {
                playBtn.textContent = I18n.t('player.play', 'Play');
            }
            playBtn.style.opacity = '1';
        } else {
            // Series: hide play buttons until episodes are loaded
            this.setHidden(playBtn, true);
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
    if (result.poster_path) {
        var posterEl = document.getElementById('details-poster');
        var currentBg = posterEl ? posterEl.style.backgroundImage : '';
        var isTmdbImage = currentBg.indexOf('image.tmdb.org') !== -1;
        if (!isTmdbImage) {
            var tmdbPoster = 'https://image.tmdb.org/t/p/w500' + result.poster_path;
            this.setBackgroundImage('details-poster', tmdbPoster);
        }
    }
    var descText = result.overview ? this.fixOverviewSpacing(result.overview) : I18n.t('details.noDescription', 'No description');
    document.getElementById('details-description').textContent = descText;
    if (result.overview) {
        this.preloadTTS(descText);
    }
    var metaEl = document.getElementById('details-meta');
    var providerRatingEl = document.getElementById('details-rating-container');
    var providerRating = providerRatingEl ? parseFloat(providerRatingEl.dataset.providerRating) : 0;
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
    this.displayDualRatings(metaEl, metaParts.length > 0, providerRating, result.vote_average);
    var genres = TMDB.getGenres(result);
    var genresEl = document.getElementById('details-genres');
    this.clearElement(genresEl);
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
    this.fetchRandomBackdrop(result.id, type);
};

IPTVApp.prototype.showDetailsFromFilmography = function(streamId, streamType, filmItem) {
    window.log('ACTION showDetailsFromFilmography id=' + streamId + ' type=' + streamType);
    var streams = this.getStreams(streamType === 'vod' ? 'vod' : 'series');
    window.log('showDetailsFromFilmography: searching in ' + streams.length + ' streams');
    var stream = null;
    for (var i = 0; i < streams.length; i++) {
        if (this.sameId(this.getStreamId(streams[i]), streamId)) {
            stream = streams[i];
            break;
        }
    }
    window.log('showDetailsFromFilmography: stream found=' + (stream ? 'yes' : 'no'));
    if (stream) {
        var title = this.getStreamTitle(stream);
        var imageUrl = this.getStreamImage(stream);
        this.selectedStream = { id: streamId, type: streamType, data: stream };
        this.setBackgroundImage('details-backdrop', imageUrl);
        document.getElementById('details-backdrop').classList.remove('tmdb-backdrop');
        this.setBackgroundImage('details-poster', imageUrl);
        var cleanDisplayTitle = this.stripCategoryPrefix(title);
        document.getElementById('details-title').textContent = cleanDisplayTitle;
        document.getElementById('details-meta').textContent = '';
        document.getElementById('details-description').textContent = '';
        document.getElementById('details-genres').innerHTML = '';
        document.getElementById('details-cast-grid').innerHTML = '';
        this.setHidden('details-director-section', true);
        document.getElementById('details-director-grid').innerHTML = '';
        this.setHidden('series-status', true);
        this.setHidden('details-episodes-section', true);
        // Reset buttons
        var playBtn = document.getElementById('play-btn');
        var continueBtn = document.getElementById('continue-btn');
        var markWatchedBtn = document.getElementById('mark-watched-btn');
        this.setHidden(playBtn, false);
        playBtn.style.opacity = '1';
        this.setHidden(continueBtn, true);
        this.setHidden(markWatchedBtn, true);
        var minMs = (this.settings.minProgressMinutes || 2) * 60000;
        // Check progress for this movie
        if (streamType === 'vod') {
            var vodProg = this.getWatchHistoryItem(streamId);
            if (vodProg && vodProg.position >= minMs && !vodProg.watched) {
                playBtn.textContent = I18n.t('player.play', 'Play') + ' ' + I18n.t('player.fromStart', 'from start').toLowerCase();
                continueBtn.textContent = I18n.t('player.continueAt', 'Continue at') + ' ' + this.formatPosition(vodProg.position);
                this.setHidden(continueBtn, false);
                this.setHidden(markWatchedBtn, false);
                this.selectedStream.historyPosition = vodProg.position;
            } else {
                playBtn.textContent = I18n.t('player.play', 'Play');
            }
            this.fetchTMDBInfo(title, 'movie');
        }
        else {
            // Series: hide play buttons until episodes are loaded
            this.setHidden(playBtn, true);
            this.setHidden(continueBtn, true);
            this.setHidden(markWatchedBtn, true);
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

IPTVApp.prototype.pushDetailsState = function() {
    var backdrop = document.getElementById('details-backdrop');
    this.detailsStack.push({
        wrapperHTML: document.getElementById('details-wrapper').innerHTML,
        wrapperScrollTop: document.getElementById('details-wrapper').scrollTop,
        backdropStyle: backdrop.style.cssText,
        backdropClass: backdrop.className,
        selectedStream: this.selectedStream,
        previousScreen: this.previousScreen,
        detailsReturnActorId: this.detailsReturnActorId,
        currentSeriesInfo: this.currentSeriesInfo,
        currentSeason: this.currentSeason
    });
};

IPTVApp.prototype.popDetailsState = function() {
    if (!this.detailsStack.length) return false;
    var state = this.detailsStack.pop();
    var wrapper = document.getElementById('details-wrapper');
    var backdrop = document.getElementById('details-backdrop');
    wrapper.innerHTML = state.wrapperHTML;
    wrapper.scrollTop = state.wrapperScrollTop;
    backdrop.style.cssText = state.backdropStyle;
    backdrop.className = state.backdropClass;
    this.selectedStream = state.selectedStream;
    this.previousScreen = state.previousScreen;
    this.detailsReturnActorId = state.detailsReturnActorId;
    this.currentSeriesInfo = state.currentSeriesInfo;
    this.currentSeason = state.currentSeason;
    return true;
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
        if (this.sameId(streams[i].stream_id, streamId)) {
            return streams[i];
        }
    }
    return null;
};

IPTVApp.prototype.findFavoriteStream = function(streamId) {
    for (var i = 0; i < this.favorites.length; i++) {
        var fav = this.favorites[i];
        if (this.sameId(this.getStreamId(fav), streamId)) {
            return fav;
        }
    }
    return null;
};

IPTVApp.prototype.showDuplicatesInfo = function(streamData) {
    var dupEl = document.getElementById('details-duplicates');
    if (!dupEl) return;
    dupEl.innerHTML = '';
    if (!streamData || !streamData._duplicateInfos) return;
    var self = this;
    var currentId = streamData.stream_id || streamData.series_id;
    var infos = streamData._duplicateInfos;
    if (infos.length <= 1) return;
    infos.forEach(function(info) {
        var span = document.createElement('span');
        span.className = 'dup-title';
        var isCurrent = self.sameId(info.id, currentId);
        if (isCurrent) span.classList.add('dup-current');
        span.textContent = '#' + info.num + ' [' + info.id + '] ' + info.name;
        dupEl.appendChild(span);
    });
    this.setHidden(dupEl, false);
};

IPTVApp.prototype.updateHomeDownloadButton = function() {
    var dlBtn = document.getElementById('home-downloads-btn');
    if (!dlBtn) return;
    var shouldShow = this.hasAppDownloads();
    if (dlBtn.style.display === 'none' && shouldShow) {
        dlBtn.style.display = '';
        this.updateHomeGridLayout();
    }
    else if (dlBtn.style.display !== 'none' && !shouldShow) {
        dlBtn.style.display = 'none';
        this.updateHomeGridLayout();
    }
};

IPTVApp.prototype.hasAppDownloads = function() {
    if (!this.settings.freeboxEnabled || !this.settings.freeboxAppToken) return false;
    if (this._freeboxDownloadQueue && this._freeboxDownloadQueue.length > 0) return true;
    var dlMap = this._freeboxDownloadMap || {};
    if (Object.keys(dlMap).length === 0) return false;
    var downloads = FreeboxAPI.getActiveDownloads();
    var keys = Object.keys(downloads);
    for (var i = 0; i < keys.length; i++) {
        var dl = downloads[keys[i]];
        if (dlMap[dl.id] && dl.status !== 'done') return true;
    }
    return false;
};

IPTVApp.prototype.updateDownloadButton = function() {
    var btn = document.getElementById('download-btn');
    if (!btn) return;
    if (!this.settings.freeboxEnabled || !this.settings.freeboxAppToken || !FreeboxAPI.isConfigured()) {
        this.setHidden(btn, true);
        return;
    }
    if (!this.selectedStream) {
        this.setHidden(btn, true);
        return;
    }
    var type = this.selectedStream.type;
    if (type === 'live' || type === 'sport' || type === 'series') {
        this.setHidden(btn, true);
        return;
    }
    this.setHidden(btn, false);
    var stream = this.selectedStream.data || this.selectedStream;
    var streamId = String(this.selectedStream.id || this.getStreamId(stream));
    var playlistId = this.selectedStream._playlistId || stream._playlistId || this.settings.activePlaylistId;
    var state = this.getStreamDownloadState(streamId, playlistId);
    btn.classList.toggle('is-downloading', state === 'downloading');
    btn.classList.toggle('is-queued', state === 'queued');
    btn.classList.toggle('is-paused', state === 'paused');
    if (state === 'downloading' || state === 'queued') btn.textContent = '✕';
    else if (state === 'paused') btn.textContent = '\u275A\u275A';
    else btn.textContent = '';
};

IPTVApp.prototype.getDownloadFilename = function(stream) {
    var title = this.getStreamTitle(stream) || 'download';
    var cleanName = this.cleanTitle(title).replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    var ext = stream.container_extension || 'mkv';
    return cleanName + '.' + ext;
};

IPTVApp.prototype.getStreamDownloadState = function(streamId, playlistId) {
    var dlMap = this._freeboxDownloadMap || {};
    var providerMap = this._freeboxDownloadProviderMap || {};
    var downloads = FreeboxAPI.getActiveDownloads();
    var dlKeys = Object.keys(dlMap);
    for (var k = 0; k < dlKeys.length; k++) {
        if (String(dlMap[dlKeys[k]]) === String(streamId) && this.sameId(providerMap[dlKeys[k]], playlistId)) {
            var keys = Object.keys(downloads);
            for (var i = 0; i < keys.length; i++) {
                if (String(downloads[keys[i]].id) === String(dlKeys[k])) {
                    if (downloads[keys[i]].status === 'stopped' || downloads[keys[i]].status === 'error') return 'paused';
                    break;
                }
            }
            return 'downloading';
        }
    }
    var queue = this._freeboxDownloadQueue || [];
    for (var j = 0; j < queue.length; j++) {
        if (String(queue[j].streamId) === String(streamId) && this.sameId(queue[j].playlistId, playlistId)) return 'queued';
    }
    return null;
};

IPTVApp.prototype.getDownloadUrl = function() {
    if (!this.selectedStream) return null;
    var stream = this.selectedStream.data || this.selectedStream;
    var streamId = this.selectedStream.id || stream.stream_id || stream.series_id;
    var type = this.selectedStream.type;
    var playlistId = stream._playlistId || this.settings.activePlaylistId;
    var playlist = this.getPlaylistById(playlistId) || this.getActivePlaylist();
    if (!playlist || playlist.type !== 'provider') return null;
    var ext = stream.container_extension || 'mkv';
    return this.buildStreamUrl(playlist, streamId, type, ext);
};

IPTVApp.prototype.triggerFreeboxDownload = function() {
    var self = this;
    if (!this.selectedStream) return;
    var stream = this.selectedStream.data || this.selectedStream;
    var streamId = String(this.selectedStream.id || this.getStreamId(stream));
    var playlistId = this.selectedStream._playlistId || stream._playlistId || this.settings.activePlaylistId;
    var state = this.getStreamDownloadState(streamId, playlistId);
    if (state === 'queued') {
        this.removeFromDownloadQueue(streamId, playlistId);
        this.showToast(I18n.t('freebox.downloadCancelled', 'Download cancelled'), 2000);
        this.updateDownloadButton();
        this.updateGlobalDownloadBar();
        return;
    }
    if (state === 'downloading') {
        this.cancelActiveDownload(streamId, playlistId);
        return;
    }
    var url = this.getDownloadUrl();
    if (!url) {
        window.log('Freebox download: no URL');
        return;
    }
    var playlistId = stream._playlistId || this.settings.activePlaylistId;
    var filename = this.getDownloadFilename(stream);
    var poster = (this.currentTMDB && this.currentTMDB.poster_path) ? 'https://image.tmdb.org/t/p/w300' + this.currentTMDB.poster_path : this.getStreamImage(stream);
    if (!this.settings.freeboxBatchDownload && this.getActiveStreamCount(playlistId) >= this.getMaxConnections(playlistId)) {
        if (!this._freeboxDownloadQueue) this._freeboxDownloadQueue = [];
        this._freeboxDownloadQueue.push({ url: url, filename: filename, streamId: streamId, playlistId: playlistId, poster: poster });
        this.saveFreeboxMaps();
        window.log('Freebox download queued: ' + filename + ' (queue size=' + this._freeboxDownloadQueue.length + ')');
        this.showToast(I18n.t('freebox.downloadQueued', 'Download queued. Will start automatically.'), 3000);
        this.updateDownloadButton();
        this.updateHomeDownloadButton();
        this.updateGlobalDownloadBar();
        this.ensureFreeboxPolling();
        return;
    }
    this.updateHomeDownloadButton();
    this.startFreeboxDownload(url, filename, streamId, playlistId, poster);
};

IPTVApp.prototype.triggerFreeboxSeasonDownload = function() {
    if (!this.currentSeriesInfo || !this.currentSeriesInfo.episodes) return;
    var episodes = this.currentSeriesInfo.episodes[this.currentSeason];
    if (!episodes || episodes.length === 0) return;
    if (this._episodeSelectMode) {
        if (this._selectedEpisodeIds && this._selectedEpisodeIds.length > 0) {
            this.downloadSelectedEpisodes();
        }
        else {
            this.showToast(I18n.t('freebox.noEpisodesSelected', 'No episodes selected, downloading all'), 3000);
            this.exitEpisodeSelectMode();
            this.downloadSeasonEpisodes(episodes);
        }
        return;
    }
    this.enterEpisodeSelectMode();
};

IPTVApp.prototype.downloadSeasonEpisodes = function(episodes) {
    var stream = this.selectedStream ? this.selectedStream.data : null;
    if (!stream) return;
    var playlistId = (this.selectedStream && this.selectedStream._playlistId) || stream._playlistId || this.settings.activePlaylistId;
    var playlist = this.getPlaylistById(playlistId) || this.getActivePlaylist();
    if (!playlist || playlist.type !== 'provider') return;
    var seriesName = this.getStreamTitle(stream) || 'series';
    var cleanSeriesName = this.cleanTitle(seriesName).replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    var sorted = episodes.slice().sort(function(a, b) {
        return parseInt(a.episode_num) - parseInt(b.episode_num);
    });
    var count = 0;
    var self = this;
    var seasonNum = this.currentSeason;
    var s = seasonNum < 10 ? '0' + seasonNum : String(seasonNum);
    var batchMode = this.settings.freeboxBatchDownload;
    var poster = (this.currentTMDB && this.currentTMDB.poster_path) ? 'https://image.tmdb.org/t/p/w300' + this.currentTMDB.poster_path : this.getStreamImage(stream);
    if (!batchMode) {
        if (!this._freeboxDownloadQueue) this._freeboxDownloadQueue = [];
    }
    sorted.forEach(function(ep) {
        var epId = String(ep.id);
        var state = self.getStreamDownloadState(epId, playlistId);
        if (state) return;
        var ext = ep.container_extension || 'mkv';
        var url = self.buildStreamUrl(playlist, ep.id, 'episode', ext);
        if (!url) return;
        var e = parseInt(ep.episode_num) < 10 ? '0' + ep.episode_num : String(ep.episode_num);
        var filename = cleanSeriesName + '_S' + s + 'E' + e + '.' + ext;
        if (batchMode) {
            self.startFreeboxDownload(url, filename, epId, playlistId, poster);
        } else {
            self._freeboxDownloadQueue.push({ url: url, filename: filename, streamId: epId, playlistId: playlistId, poster: poster });
        }
        count++;
    });
    if (count === 0) {
        this.showToast(I18n.t('freebox.allAlreadyQueued', 'All episodes already queued or downloading'), 3000);
        return;
    }
    if (!batchMode) {
        this.saveFreeboxMaps();
    }
    window.log('Freebox season download: ' + (batchMode ? 'sent' : 'queued') + ' ' + count + ' episodes for S' + s);
    this.showToast(I18n.t('freebox.seasonQueued', '{n} episodes queued').replace('{n}', count), 3000);
    this.updateHomeDownloadButton();
    this.updateGlobalDownloadBar();
    if (!batchMode) {
        this.ensureFreeboxPolling();
    }
};

IPTVApp.prototype.enterEpisodeSelectMode = function() {
    this._episodeSelectMode = true;
    this._selectedEpisodeIds = [];
    this.updateEpisodeSelectUI();
    this.updateDownloadSeasonButton();
    this.showToast(I18n.t('freebox.selectEpisodes', 'Select episodes, then press download'), 4000);
    var firstEp = document.querySelector('.episode-item');
    if (firstEp) {
        var focusables = this.getFocusables();
        for (var i = 0; i < focusables.length; i++) {
            if (focusables[i] === firstEp) {
                this.focusIndex = i;
                this.updateFocus();
                break;
            }
        }
    }
};

IPTVApp.prototype.exitEpisodeSelectMode = function() {
    this._episodeSelectMode = false;
    this._selectedEpisodeIds = [];
    this.updateEpisodeSelectUI();
    this.updateDownloadSeasonButton();
};

IPTVApp.prototype.toggleEpisodeSelection = function(epId) {
    if (!this._selectedEpisodeIds) this._selectedEpisodeIds = [];
    var idx = this._selectedEpisodeIds.indexOf(epId);
    if (idx === -1) {
        this._selectedEpisodeIds.push(epId);
    }
    else {
        this._selectedEpisodeIds.splice(idx, 1);
    }
    this.updateEpisodeSelectUI();
    this.updateDownloadSeasonButton();
};

IPTVApp.prototype.updateEpisodeSelectUI = function() {
    var items = document.querySelectorAll('.episode-item');
    var selectedIds = this._selectedEpisodeIds || [];
    var selectMode = this._episodeSelectMode;
    for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('select-mode', !!selectMode);
        items[i].classList.toggle('selected-for-download', selectMode && selectedIds.indexOf(items[i].dataset.episodeId) !== -1);
    }
};

IPTVApp.prototype.updateDownloadSeasonButton = function() {
    var btn = document.getElementById('download-season-btn');
    if (!btn) return;
    btn.classList.toggle('select-mode', !!this._episodeSelectMode);
    if (this._episodeSelectMode && this._selectedEpisodeIds && this._selectedEpisodeIds.length > 0) {
        btn.textContent = '(' + this._selectedEpisodeIds.length + ')';
    }
    else if (this._episodeSelectMode) {
        btn.textContent = I18n.t('freebox.downloadAll', 'All');
    }
    else {
        btn.textContent = '';
    }
};

IPTVApp.prototype.downloadSelectedEpisodes = function() {
    var selectedIds = this._selectedEpisodeIds ? this._selectedEpisodeIds.slice() : [];
    this.exitEpisodeSelectMode();
    if (!this.currentSeriesInfo || !this.currentSeriesInfo.episodes) return;
    var allEpisodes = this.currentSeriesInfo.episodes[this.currentSeason];
    if (!allEpisodes) return;
    var episodes = allEpisodes.filter(function(ep) {
        return selectedIds.indexOf(String(ep.id)) !== -1;
    });
    if (episodes.length === 0) return;
    this.downloadSeasonEpisodes(episodes);
};

IPTVApp.prototype.removeFromDownloadQueue = function(streamId, playlistId) {
    if (!this._freeboxDownloadQueue) return;
    var self = this;
    this._freeboxDownloadQueue = this._freeboxDownloadQueue.filter(function(q) {
        return !(String(q.streamId) === String(streamId) && self.sameId(q.playlistId, playlistId));
    });
    this.saveFreeboxMaps();
    window.log('Freebox queue: removed streamId=' + streamId + ' (queue size=' + this._freeboxDownloadQueue.length + ')');
};

IPTVApp.prototype.cancelActiveDownload = function(streamId, playlistId) {
    var self = this;
    var dlMap = this._freeboxDownloadMap || {};
    var providerMap = this._freeboxDownloadProviderMap || {};
    var downloadId = null;
    var keys = Object.keys(dlMap);
    for (var i = 0; i < keys.length; i++) {
        if (String(dlMap[keys[i]]) === String(streamId) && this.sameId(providerMap[keys[i]], playlistId)) {
            downloadId = keys[i];
            break;
        }
    }
    if (!downloadId) return;
    window.log('Freebox cancel download: id=' + downloadId + ' streamId=' + streamId);
    FreeboxAPI.deleteDownload(downloadId).then(function() {
        delete self._freeboxDownloadMap[downloadId];
        delete (self._freeboxDownloadProviderMap || {})[downloadId];
        self.saveFreeboxMaps();
        self.showToast(I18n.t('freebox.downloadCancelled', 'Download cancelled'), 2000);
        self.updateDownloadButton();
        self.updateGlobalDownloadBar();
    }).catch(function(err) {
        window.log('Freebox cancel error: ' + err.message);
        self.showToast(I18n.t('freebox.downloadError', 'Download error') + ': ' + err.message, 3000, true);
    });
};

IPTVApp.prototype.showDownloadsScreen = function() {
    this.initBrowseScreen('downloads', 'downloads', 'home.downloads', 'Downloads');
    this.setHidden('edit-favorites-btn', true);
    this.setHidden('search-filters', true);
    this.setHidden('rating-filters', true);
    this.setHidden('sort-filters', true);
    this.setHidden('view-mode-filters', true);
    var self = this;
    var queueSnapshot = (this._freeboxDownloadQueue || []).slice();
    window.log('Downloads screen: queue=' + queueSnapshot.length + ' dlMap=' + Object.keys(this._freeboxDownloadMap || {}).length);
    FreeboxAPI.getDownloads().then(function(freeboxDownloads) {
        window.log('Downloads screen: freebox returned ' + (freeboxDownloads || []).length + ' downloads, queue snapshot=' + queueSnapshot.length);
        self.renderDownloadsList(freeboxDownloads || [], queueSnapshot);
    }).catch(function(err) {
        window.log('Downloads screen: freebox fetch error: ' + err.message);
        self.renderDownloadsList([], queueSnapshot);
    });
};

IPTVApp.prototype.renderDownloadsList = function(freeboxDownloads, queueSnapshot) {
    var items = [];
    var dlMap = this._freeboxDownloadMap || {};
    var providerMap = this._freeboxDownloadProviderMap || {};
    var posterMap = this._freeboxDownloadPosterMap || {};
    var freeboxStreamIds = {};
    for (var i = 0; i < freeboxDownloads.length; i++) {
        var dl = freeboxDownloads[i];
        if (!dl.name && dl.size === 0) continue;
        if (dl.status === 'done') continue;
        if (!dlMap[dl.id]) continue;
        var pct = dl.size > 0 ? Math.round((dl.rx_bytes / dl.size) * 100) : 0;
        var streamId = dlMap[dl.id] || null;
        if (streamId) freeboxStreamIds[String(streamId)] = true;
        var statusLabel = dl.status === 'done' ? '✓' :
            dl.status === 'downloading' ? '⬇ ' + pct + '%' :
            (dl.status === 'stopped' || dl.status === 'error') ? '⏸' :
            dl.status === 'queued' ? '⏳' : dl.status;
        var dlStatus = dl.status === 'done' ? 'done' :
            dl.status === 'downloading' ? 'downloading' :
            (dl.status === 'stopped' || dl.status === 'error') ? 'paused' :
            dl.status === 'queued' ? 'queued' : dl.status;
        var dlName = (dl.name || String(dl.id)).replace(/\.\w{2,4}$/, '').replace(/_/g, ' ');
        var dlType = /[_.]S\d{1,2}E\d{1,2}/i.test(dl.name || '') ? 'series' : 'movie';
        items.push({
            stream_id: streamId || dl.id,
            name: dlName,
            stream_icon: posterMap[dl.id] || '',
            _isDownload: true,
            _dlStatus: dlStatus,
            _dlPercent: pct,
            _dlId: dl.id,
            _streamId: streamId ? String(streamId) : null,
            _playlistId: providerMap[dl.id] || null,
            _statusLabel: statusLabel,
            _type: dlType
        });
    }
    var queue = queueSnapshot || [];
    for (var j = 0; j < queue.length; j++) {
        var q = queue[j];
        if (freeboxStreamIds[String(q.streamId)]) continue;
        var qName = (q.filename || q.streamId).replace(/\.\w{2,4}$/, '').replace(/_/g, ' ');
        var qType = /[_.]S\d{1,2}E\d{1,2}/i.test(q.filename || '') ? 'series' : 'movie';
        items.push({
            stream_id: q.streamId,
            name: qName,
            stream_icon: q.poster || '',
            _isDownload: true,
            _dlStatus: 'queued',
            _dlPercent: 0,
            _dlId: null,
            _streamId: String(q.streamId),
            _playlistId: q.playlistId || null,
            _statusLabel: '⏳',
            _type: qType
        });
    }
    items.sort(function(a, b) {
        var order = { downloading: 0, queued: 1, paused: 2, done: 3 };
        return (order[a._dlStatus] || 9) - (order[b._dlStatus] || 9);
    });
    if (items.length === 0) {
        this.showEmptyMessage('content-grid', 'home.noDownloads', 'No downloads');
    }
    else {
        var grid = document.getElementById('content-grid');
        grid.classList.add('list-view');
        this.renderGrid(items, 'downloads');
    }
    this.focusArea = 'grid';
    this.focusIndex = 0;
    this.deferUpdateFocus();
};

IPTVApp.prototype.removeDownloadAtIndex = function(index) {
    var grid = document.getElementById('content-grid');
    var gridItems = grid.querySelectorAll('.grid-item');
    if (index >= gridItems.length) return;
    if (index >= this.currentStreams.length) return;
    var stream = this.currentStreams[index];
    var self = this;
    if (stream._dlStatus === 'queued' && !stream._dlId) {
        this.removeFromDownloadQueue(stream._streamId, stream._playlistId);
        this.showToast(I18n.t('freebox.downloadCancelled', 'Download cancelled'), 2000);
    }
    else if (stream._dlId) {
        var dlId = stream._dlId;
        FreeboxAPI.deleteDownload(dlId).then(function() {
            if (self._freeboxDownloadMap) delete self._freeboxDownloadMap[dlId];
            if (self._freeboxDownloadProviderMap) delete self._freeboxDownloadProviderMap[dlId];
            self.saveFreeboxMaps();
            self.showToast(I18n.t('freebox.downloadCancelled', 'Download cancelled'), 2000);
            self.updateGlobalDownloadBar();
        }).catch(function(err) {
            window.log('Freebox delete error: ' + err.message);
        });
    }
    else if (stream._streamId) {
        this.cancelActiveDownload(stream._streamId, stream._playlistId);
    }
    this.currentStreams.splice(index, 1);
    var item = gridItems[index];
    item.style.transition = 'opacity 0.2s, transform 0.2s';
    item.style.opacity = '0';
    item.style.transform = 'translateX(50px)';
    setTimeout(function() {
        item.remove();
        if (self.focusIndex >= self.currentStreams.length) {
            self.focusIndex = Math.max(0, self.currentStreams.length - 1);
        }
        self.updateFocus();
        self.updateGlobalDownloadBar();
        if (self.currentStreams.length === 0) {
            self.showEmptyMessage('content-grid', 'home.noDownloads', 'No downloads');
        }
    }, 200);
};

IPTVApp.prototype.removeCompletedDownloadsFromGrid = function(downloads) {
    if (this.currentSection !== 'downloads') return;
    var grid = document.getElementById('content-grid');
    if (!grid) return;
    var gridItems = grid.querySelectorAll('.grid-item');
    var dlMap = this._freeboxDownloadMap || {};
    var self = this;
    var toRemove = [];
    for (var i = 0; i < gridItems.length; i++) {
        if (i >= this.currentStreams.length) break;
        var stream = this.currentStreams[i];
        if (!stream._isDownload || !stream._dlId) continue;
        if (!dlMap[stream._dlId]) {
            toRemove.push(i);
        }
    }
    if (toRemove.length === 0) return;
    for (var j = 0; j < toRemove.length; j++) {
        var idx = toRemove[j];
        gridItems[idx].style.transition = 'opacity 0.3s, transform 0.3s';
        gridItems[idx].style.opacity = '0';
        gridItems[idx].style.transform = 'translateX(50px)';
    }
    setTimeout(function() {
        for (var k = toRemove.length - 1; k >= 0; k--) {
            var ri = toRemove[k];
            if (ri < self.currentStreams.length) {
                self.currentStreams.splice(ri, 1);
            }
            var items = grid.querySelectorAll('.grid-item');
            if (ri < items.length) {
                items[ri].remove();
            }
        }
        if (self.focusIndex >= self.currentStreams.length) {
            self.focusIndex = Math.max(0, self.currentStreams.length - 1);
        }
        self.updateFocus();
        if (self.currentStreams.length === 0) {
            self.showEmptyMessage('content-grid', 'home.noDownloads', 'No downloads');
        }
    }, 300);
};

IPTVApp.prototype.startFreeboxDownload = function(url, filename, streamId, playlistId, poster) {
    var self = this;
    window.log('Freebox download: ' + url + ' -> ' + filename + ' (streamId=' + streamId + ' playlistId=' + playlistId + ')');
    FreeboxAPI.addDownload(url, filename).then(function(result) {
        window.log('Freebox download started: id=' + result.id + ' streamId=' + streamId);
        if (!self._freeboxDownloadMap) self._freeboxDownloadMap = {};
        self._freeboxDownloadMap[result.id] = streamId;
        if (!self._freeboxDownloadProviderMap) self._freeboxDownloadProviderMap = {};
        self._freeboxDownloadProviderMap[result.id] = playlistId;
        if (poster) {
            if (!self._freeboxDownloadPosterMap) self._freeboxDownloadPosterMap = {};
            self._freeboxDownloadPosterMap[result.id] = poster;
        }
        self.saveFreeboxMaps();
        self.showToast(I18n.t('freebox.downloadStarted', 'Download started') + ': ' + filename, 3000);
        self.updateDownloadButton();
        self.ensureFreeboxPolling();
    }).catch(function(err) {
        window.log('Freebox download error: ' + err.message);
        if (err.message && err.message.indexOf('auth') !== -1) {
            self.showToast(I18n.t('freebox.sessionExpired', 'Session expired, reconnecting...'), 3000, true);
        }
        else {
            self.showToast(I18n.t('freebox.downloadError', 'Download error') + ': ' + err.message, 5000, true);
        }
    });
};

IPTVApp.prototype.resumePausedDownloads = function() {
    var downloads = FreeboxAPI.getActiveDownloads();
    var keys = Object.keys(downloads);
    var dlMap = this._freeboxDownloadMap || {};
    var hasToResume = false;
    for (var i = 0; i < keys.length; i++) {
        var dl = downloads[keys[i]];
        if ((dl.status === 'stopped' || dl.status === 'error') && dlMap[dl.id]) {
            hasToResume = true;
            break;
        }
    }
    if (!hasToResume) return;
    window.log('Freebox: will resume paused/errored downloads');
    if (!this._freeboxResumeRetries) this._freeboxResumeRetries = {};
    this._freeboxResumeScheduled = true;
    this.ensureFreeboxPolling();
};

IPTVApp.prototype.retryErroredDownloads = function(downloads) {
    if (this.currentPlayingStream) return;
    var dlMap = this._freeboxDownloadMap || {};
    var keys = Object.keys(downloads);
    var hasDownloading = false;
    for (var h = 0; h < keys.length; h++) {
        if (downloads[keys[h]].status === 'downloading' && dlMap[downloads[keys[h]].id]) { hasDownloading = true; break; }
    }
    if (hasDownloading) return;
    if (!this._freeboxResumeRetries) this._freeboxResumeRetries = {};
    if (!this._freeboxResumeSkipCycle) this._freeboxResumeSkipCycle = {};
    for (var i = 0; i < keys.length; i++) {
        var dl = downloads[keys[i]];
        if ((dl.status === 'stopped' || dl.status === 'error') && dlMap[dl.id]) {
            var retries = this._freeboxResumeRetries[dl.id] || 0;
            if (retries >= 12) continue;
            if (this._freeboxResumeSkipCycle[dl.id]) {
                this._freeboxResumeSkipCycle[dl.id] = false;
                continue;
            }
            this._freeboxResumeSkipCycle[dl.id] = true;
            this._freeboxResumeRetries[dl.id] = retries + 1;
            var action = dl.status === 'error' ? 'retry' : 'resume';
            window.log('Freebox: ' + action + ' attempt ' + (retries + 1) + '/12 for id=' + dl.id + ' status=' + dl.status);
            var apiCall = dl.status === 'error' ? FreeboxAPI.retryDownload(dl.id) : FreeboxAPI.resumeDownload(dl.id);
            apiCall.then(function() {
                window.log('Freebox: ' + action + ' sent for id=' + dl.id);
            }).catch(function(err) {
                window.log('Freebox: ' + action + ' API error: ' + err.message);
            });
        }
        else if (dl.status === 'downloading' && dlMap[dl.id]) {
            delete this._freeboxResumeRetries[dl.id];
            delete this._freeboxResumeSkipCycle[dl.id];
        }
    }
};

IPTVApp.prototype.cleanupDownloadMap = function(downloads) {
    var dlMap = this._freeboxDownloadMap;
    if (!dlMap) return;
    var activeIds = {};
    var keys = Object.keys(downloads);
    for (var i = 0; i < keys.length; i++) {
        activeIds[downloads[keys[i]].id] = downloads[keys[i]].status;
    }
    var dlKeys = Object.keys(dlMap);
    var changed = false;
    for (var j = 0; j < dlKeys.length; j++) {
        var status = activeIds[dlKeys[j]];
        if (status !== 'downloading' && status !== 'queued' && status !== 'stopped' && status !== 'error') {
            delete dlMap[dlKeys[j]];
            if (this._freeboxDownloadProviderMap) delete this._freeboxDownloadProviderMap[dlKeys[j]];
            if (this._freeboxDownloadPosterMap) delete this._freeboxDownloadPosterMap[dlKeys[j]];
            changed = true;
        }
    }
    if (changed) this.saveFreeboxMaps();
};

IPTVApp.prototype.ensureFreeboxPolling = function() {
    var self = this;
    if (this._freeboxPollingActive) return;
    this._freeboxPollingActive = true;
    FreeboxAPI.startPolling(function(downloads) {
        self.cleanupDownloadMap(downloads);
        self.removeCompletedDownloadsFromGrid(downloads);
        self.updateGridDownloadProgress(downloads);
        self.updateGlobalDownloadBar(downloads);
        self.updateDownloadButton();
        self.updateHomeDownloadButton();
        self.processDownloadQueue(downloads);
        self.retryErroredDownloads(downloads);
    });
};

IPTVApp.prototype.processDownloadQueue = function(downloads) {
    var dlMap = this._freeboxDownloadMap || {};
    var keys = Object.keys(downloads);
    var queue = this._freeboxDownloadQueue || [];
    if (queue.length > 0) {
        var next = queue[0];
        var providerActive = this.getActiveStreamCount(next.playlistId);
        var providerMap = this._freeboxDownloadProviderMap || {};
        for (var k = 0; k < keys.length; k++) {
            var dl = downloads[keys[k]];
            if ((dl.status === 'stopped' || dl.status === 'error') && dlMap[dl.id]) {
                var dlPlaylistId = providerMap[dl.id];
                if (!next.playlistId || !dlPlaylistId || this.sameId(dlPlaylistId, next.playlistId)) {
                    providerActive++;
                }
            }
        }
        var providerMax = this.getMaxConnections(next.playlistId);
        if (providerActive < providerMax) {
            queue.shift();
            this.saveFreeboxMaps();
            window.log('Freebox queue: launching ' + next.filename + ' (active=' + providerActive + ' max=' + providerMax + ')');
            this.startFreeboxDownload(next.url, next.filename, next.streamId, next.playlistId, next.poster);
            this.updateGlobalDownloadBar(downloads);
            return;
        }
    }
    var hasPausedOrActive = false;
    for (var j = 0; j < keys.length; j++) {
        var st = downloads[keys[j]].status;
        if ((st === 'downloading' || st === 'stopped' || st === 'error') && dlMap[downloads[keys[j]].id]) { hasPausedOrActive = true; break; }
    }
    if (!hasPausedOrActive && queue.length === 0) {
        this._freeboxPollingActive = false;
        FreeboxAPI.stopPolling();
        this.updateGlobalDownloadBar(downloads);
    }
};

IPTVApp.prototype.updateGlobalDownloadBar = function(downloads) {
    var bar = document.getElementById('global-download-bar');
    if (!bar) return;
    if (!downloads) downloads = FreeboxAPI.getActiveDownloads();
    var keys = Object.keys(downloads);
    var dlMap = this._freeboxDownloadMap || {};
    var activeDl = null;
    var pausedDl = null;
    var activeCount = 0;
    var pausedCount = 0;
    for (var i = 0; i < keys.length; i++) {
        var dl = downloads[keys[i]];
        if (!dlMap[dl.id]) continue;
        if (dl.status === 'downloading') {
            activeCount++;
            if (!activeDl) activeDl = dl;
        }
        else if (dl.status === 'stopped' || dl.status === 'error') {
            pausedCount++;
            if (!pausedDl) pausedDl = dl;
        }
    }
    var queueLen = this._freeboxDownloadQueue ? this._freeboxDownloadQueue.length : 0;
    var showDl = activeDl || pausedDl;
    if ((!showDl && queueLen === 0) || this.currentScreen === 'player') {
        this.setHidden(bar, true);
        return;
    }
    this.setHidden(bar, false);
    var nameEl = document.getElementById('global-download-name');
    var pctEl = document.getElementById('global-download-pct');
    var fillEl = document.getElementById('global-download-fill');
    var queueEl = document.getElementById('global-download-queue');
    if (activeDl) {
        var displayName = activeDl.name || '';
        if (displayName.length > 60) displayName = displayName.substring(0, 57) + '...';
        nameEl.textContent = displayName;
        pctEl.textContent = (activeDl.rx_pct || 0) + '%';
        fillEl.style.width = (activeDl.rx_pct || 0) + '%';
        fillEl.style.background = '#4CAF50';
        if (activeCount > 1) {
            nameEl.textContent = activeCount + ' ' + I18n.t('freebox.downloadsActive', 'downloads');
            var totalPct = 0;
            for (var j = 0; j < keys.length; j++) {
                if (downloads[keys[j]].status === 'downloading' && dlMap[downloads[keys[j]].id]) {
                    totalPct += (downloads[keys[j]].rx_pct || 0);
                }
            }
            pctEl.textContent = Math.round(totalPct / activeCount) + '%';
            fillEl.style.width = Math.round(totalPct / activeCount) + '%';
        }
    }
    else if (pausedDl) {
        var pausedName = pausedDl.name || '';
        if (pausedName.length > 50) pausedName = pausedName.substring(0, 47) + '...';
        nameEl.textContent = pausedName + ' - ' + I18n.t('freebox.paused', 'Paused');
        pctEl.textContent = (pausedDl.rx_pct || 0) + '%';
        fillEl.style.width = (pausedDl.rx_pct || 0) + '%';
        fillEl.style.background = '#ff9800';
    }
    else {
        nameEl.textContent = '';
        pctEl.textContent = '';
        fillEl.style.width = '0%';
    }
    if (queueLen > 0) {
        this.setHidden(queueEl, false);
        queueEl.textContent = queueLen + ' ' + I18n.t('freebox.inQueue', 'in queue');
    }
    else {
        this.setHidden(queueEl, true);
    }
};
