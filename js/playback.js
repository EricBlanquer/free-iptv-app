/**
 * Playback module - Video playback control for IPTVApp
 * Handles seeking, playback controls, track selection, external subtitles
 */

// Seek controls
IPTVApp.prototype.startSeek = function(direction) {
    var self = this;
    var hadPendingSeek = !!this.seekDebounceTimer;
    if (this.seekDebounceTimer) {
        clearTimeout(this.seekDebounceTimer);
        this.seekDebounceTimer = null;
    }
    var isLive = this.currentPlayingType === 'live';
    var hasContent = this.player.duration > 0;
    // No seeking for live streams
    if (isLive || !hasContent) {
        return;
    }
    if (this.seekDirection === direction && this.seekInterval) {
        return;
    }
    if (this.seekDirection !== 0 && this.seekDirection !== direction) {
        this.stopSeek();
    }
    if (!hadPendingSeek) {
        this.wasPlaying = this.player.isPlaying && !this.player.isPaused;
        if (this.wasPlaying) {
            this.player.pause();
        }
    }
    this.seekDirection = direction;
    this.seekStartTime = Date.now();
    // Detect if this is a new isolated seek session (> 1s since last seek action)
    var isNewSeekSession = (this.seekStartTime - this.lastSeekActionTime) > 1000;
    this.lastSeekActionTime = this.seekStartTime;
    this.isFirstBackwardTick = (direction === -1 && isNewSeekSession);
    // seekTargetPosition is already set: either from playStream start or from updatePlayerProgress
    this.updateSeekPreview();
    this.showPlayerOverlay();
    this.seekInterval = setInterval(function() {
        self.updateSeekPreview();
        self.showPlayerOverlay();
    }, 250);
};

IPTVApp.prototype.getSeekMultiplier = function() {
    var elapsed = Date.now() - this.seekStartTime;
    var index = 0;
    if (elapsed > 5000) index = 5;
    else if (elapsed > 4000) index = 4;
    else if (elapsed > 3000) index = 3;
    else if (elapsed > 2000) index = 2;
    else if (elapsed > 1000) index = 1;
    return this.seekMultipliers[index];
};

IPTVApp.prototype.updateSeekPreview = function() {
    var multiplier = this.getSeekMultiplier();
    // Use 5s only for the first tick of an isolated backward seek, otherwise 10s
    var baseJump = this.seekBaseJump;
    if (this.isFirstBackwardTick) {
        baseJump = this.seekFirstBackwardJump;
        this.isFirstBackwardTick = false;
    }
    var jumpMs = baseJump * multiplier * 1000 * this.seekDirection;
    var maxPosition = Math.max(0, this.player.duration - 5000);
    this.seekTargetPosition = Math.max(0, Math.min(maxPosition, this.seekTargetPosition + jumpMs));
    var percent = this.player.duration > 0 ? (this.seekTargetPosition / this.player.duration) * 100 : 0;
    document.getElementById('progress-bar').style.width = percent + '%';
    document.getElementById('player-time').textContent =
        this.player.formatTime(this.seekTargetPosition) + ' / ' + this.player.formatTime(this.player.duration);
    this.showSeekIndicator(multiplier);
};

IPTVApp.prototype.stopSeek = function() {
    if (this.seekInterval) {
        clearInterval(this.seekInterval);
        this.seekInterval = null;
    }
    if (this.seekDirection !== 0) {
        var self = this;
        var targetPos = this.seekTargetPosition;
        var wasPlaying = this.wasPlaying;
        if (this.seekDebounceTimer) {
            clearTimeout(this.seekDebounceTimer);
        }
        this.seekDebounceTimer = setTimeout(function() {
            self.seekDebounceTimer = null;
            if (self.seekDirection === 0) {
                self.player.seekTo(targetPos);
                self.lastSeekTime = Date.now();
                if (wasPlaying) {
                    self.player.resume();
                }
            }
        }, 150);
    }
    this.seekDirection = 0;
    this.hideSeekIndicator();
};

IPTVApp.prototype.showSeekIndicator = function(multiplier) {
    var indicator = document.getElementById('seek-indicator');
    var symbol = this.seekDirection > 0 ? '▶▶' : '◀◀';
    indicator.textContent = symbol + ' x' + multiplier;
    indicator.classList.add('visible');
};

IPTVApp.prototype.hideSeekIndicator = function() {
    var indicator = document.getElementById('seek-indicator');
    indicator.classList.remove('visible');
};


// Return to live (exit timeshift)
IPTVApp.prototype.returnToLive = function() {
    if (this.currentPlayingType !== 'live') return;
    // Reset timeshift state
    this.player.isInTimeshift = false;
    this.player.pauseStartTime = null;
    // Restart the stream to go back to live
    var stream = this.currentPlayingStream;
    var type = this.currentPlayingType;
    this.player.stop();
    this.playStream(stream.stream_id, type, stream);
};

IPTVApp.prototype.getVideoQuality = function() {
    try {
        var info = this.player.getVideoInfo();
        if (!info) return '';
        // Parse width x height from info string like "1920x1080 (16:9)"
        var match = info.match(Regex.resolution);
        if (!match) return '';
        var width = parseInt(match[1]);
        var height = parseInt(match[2]);
        // Determine quality label based on height
        var quality;
        if (height >= 2160) quality = '4K';
        else if (height >= 1440) quality = '1440p';
        else if (height >= 1080) quality = '1080p';
        else if (height >= 720) quality = '720p';
        else if (height >= 576) quality = '576p';
        else if (height >= 480) quality = '480p';
        else quality = height + 'p';
        // Add dimensions
        return quality + ' (' + width + 'x' + height + ')';
    }
    catch (ex) {
        return '';
    }
};

// Playback
IPTVApp.prototype.playStream = function(streamId, type, stream, startPosition) {
    window.log('playStream: id=' + streamId + ' type=' + type + ' section=' + this.currentSection);
    this.videoQuality = '';
    this.tmdbInfo = null;
    var url;
    if (stream && stream._m3u && stream.url) {
        url = stream.url;
    }
    else if (this.api) {
        // Use container_extension from stream data if available
        var ext = stream && stream.container_extension ? stream.container_extension : null;
        switch (type) {
            case 'live':
                url = this.api.getLiveStreamUrl(streamId, ext || 'ts');
                break;
            case 'vod':
                url = this.api.getVodStreamUrl(streamId, ext || 'mkv');
                break;
            case 'series':
            case 'episode':
                url = this.api.getSeriesStreamUrl(streamId, ext || 'mkv');
                break;
        }
    }
    else {
        window.log('No API and no M3U URL for stream');
        return;
    }
    window.log('playStream URL: ' + url);
    if (type !== 'live' && type !== 'episode' && stream) {
        this.addToWatchHistory(stream, type, 0);
    }
    // Increment playback ID to ignore events from previous stream
    this.currentPlaybackId = (this.currentPlaybackId || 0) + 1;
    var playbackId = this.currentPlaybackId;
    this.streamReady = false;
    this.currentPlayingStream = stream;
    this.currentPlayingType = type;
    this.seekTargetPosition = startPosition || 0;
    this.lastSeekTime = 0;
    var initialPercent = 0;
    var initialTime = '0:00 / 0:00';
    if (startPosition > 0) {
        var savedProgress = (type === 'episode') ? this.episodeProgress[streamId] : this.getWatchHistoryItem(streamId);
        if (savedProgress && savedProgress.duration > 0) {
            initialPercent = savedProgress.percent || 0;
            initialTime = this.player.formatTime(startPosition) + ' / ' + this.player.formatTime(savedProgress.duration);
        }
    }
    document.getElementById('progress-bar').style.width = initialPercent + '%';
    document.getElementById('player-time').textContent = initialTime;
    // Hide progress bar and time for live streams
    var isLive = type === 'live';
    document.getElementById('player-progress').style.display = isLive ? 'none' : '';
    document.getElementById('player-time').style.display = isLive ? 'none' : '';
    this.showLoading(true);
    this.showScreen('player');
    this.currentScreen = 'player';
    var self = this;
    var seekDone = false;
    var subtitlesApplied = false;
    this.player.onStateChange = function(state) {
        if (state === 'buffering') {
            self.isBuffering = true;
            self.updatePlayerStateIndicator();
            self.showPlayerOverlay();
        }
        else if (state === 'playing') {
            self.streamReady = true;
            self.isBuffering = false;
            self.bufferPercent = undefined;
            // Manage timeshift timer
            if (self.pauseCounterInterval) {
                clearInterval(self.pauseCounterInterval);
                self.pauseCounterInterval = null;
            }
            self.videoQuality = self.getVideoQuality();
            if (!self.videoQuality) {
                setTimeout(function() {
                    var quality = self.getVideoQuality();
                    if (quality && quality !== self.videoQuality) {
                        self.videoQuality = quality;
                        self.showPlayerOverlay();
                    }
                }, 1000);
            }
            self.updatePlayerStateIndicator();
            self.showLoading(false);
            self.showPlayerOverlay();
            if (startPosition > 0 && !seekDone) {
                seekDone = true;
                setTimeout(function() {
                    var userIsSeeking = self.seekDirection !== 0 ||
                                        self.seekDebounceTimer ||
                                        (self.lastSeekTime && Date.now() - self.lastSeekTime < 1000);
                    if (!userIsSeeking) {
                        self.player.seekTo(startPosition);
                    }
                }, 500);
            }
            if (!subtitlesApplied) {
                subtitlesApplied = true;
                setTimeout(function() {
                    self.reapplySubtitleTrack();
                }, 800);
            }
        }
        else if (state === 'paused') {
            self.updatePlayerStateIndicator();
            self.showPlayerOverlay();
            // Start pause counter update timer
            if (self.pauseCounterInterval) {
                clearInterval(self.pauseCounterInterval);
            }
            self.pauseCounterInterval = setInterval(function() {
                self.updatePlayerStateIndicator();
            }, 1000);
        }
        else if (state === 'error') {
            self.showLoading(false);
        }
        else if (state === 'completed') {
            self.onPlaybackCompleted();
        }
    };
    this.player.onTimeUpdate = function(current, total) {
        // Ignore events from previous stream
        if (playbackId !== self.currentPlaybackId) {
            return;
        }
        self.updatePlayerProgress(current, total);
        self.displayExternalSubtitle(current);
        if (stream && type !== 'live') {
            self.updateWatchPosition(stream, type, current);
            if (type === 'episode' || type === 'series') {
                self.updateEpisodeProgress(streamId, current, total);
            }
            else if (type === 'vod' || type === 'movie') {
                self.updateWatchHistoryProgress(streamId, current, total);
            }
        }
    };
    this.player.onError = function(error) {
        // If HTML5 player also failed, show error and go back to details
        if (error && error.html5Error) {
            self.showLoading(false);
            // Show codec error if available, otherwise generic error
            if (error.unsupportedCodec && error.codecName) {
                var resolution = '';
                if (error.width > 0 && error.height > 0) {
                    resolution = ' (' + error.width + 'x' + error.height + ')';
                }
                var msg = I18n.t('player.unsupportedCodec', { codec: error.codecName + resolution });
                if (msg === 'player.unsupportedCodec') {
                    msg = 'Codec ' + error.codecName + resolution + ' not supported by this TV';
                }
                self.showToast(msg);
            }
            else {
                self.showToast(I18n.t('player.playbackError'));
            }
            setTimeout(function() {
                self.stopPlayback();
            }, 100);
            return;
        }
        // Check for codec-specific error - try HTML5 fallback (from native)
        if (error && error.unsupportedCodec && error.codecName && !error.html5Error) {
            var resolution = '';
            if (error.width > 0 && error.height > 0) {
                resolution = ' (' + error.width + 'x' + error.height + ')';
            }
            window.log('Unsupported codec: ' + error.codecName + resolution + ' - trying HTML5 fallback');
            var tryingMsg = I18n.t('player.tryingHtml5');
            if (tryingMsg === 'player.tryingHtml5') {
                tryingMsg = 'Essai du lecteur alternatif...';
            }
            self.showToast(tryingMsg);
            // Try HTML5 fallback
            setTimeout(function() {
                self.player.playHtml5();
            }, 100);
            return;
        }
        // Check for HTML5 error - try native fallback if AVPlay available
        if (error && error.html5Error && typeof webapis !== 'undefined' && webapis.avplay) {
            window.log('HTML5 player failed - trying native AVPlay fallback');
            var tryingMsg = I18n.t('player.tryingNative');
            if (tryingMsg === 'player.tryingNative') {
                tryingMsg = 'Essai du lecteur natif...';
            }
            self.showToast(tryingMsg);
            // Try native fallback
            setTimeout(function() {
                self.player.playNative();
            }, 100);
            return;
        }
        // Generic error
        self.showLoading(false);
        self.showToast(I18n.t('player.playbackError'));
        setTimeout(function() {
            self.stopPlayback();
        }, 100);
    };
    this.player.onBufferProgress = function(percent) {
        self.bufferPercent = percent;
        self.updatePlayerStateIndicator();
    };
    this.player.play(url);
};

IPTVApp.prototype.updateWatchPosition = function(stream, type, position, force) {
    var streamId = stream.stream_id || stream.series_id;
    for (var i = 0; i < this.watchHistory.length; i++) {
        if (this.watchHistory[i].id == streamId) {
            var diff = Math.abs(this.watchHistory[i].position - position);
            if (force || diff > 10000) {
                this.watchHistory[i].position = position;
                this.saveWatchHistory();
            }
            break;
        }
    }
};

IPTVApp.prototype.stopPlayback = function() {
    // Stop pause counter timer
    if (this.pauseCounterInterval) {
        clearInterval(this.pauseCounterInterval);
        this.pauseCounterInterval = null;
    }
    var wasHistory = (this.currentStreamType === 'history');
    var isSeries = this.selectedStream && this.selectedStream.type === 'series';
    if (this.currentPlayingStream && this.currentPlayingType !== 'live') {
        var currentPos = this.player.currentTime || 0;
        var duration = this.player.duration || 0;
        var streamId = this.currentPlayingStream.stream_id || this.currentPlayingStream.vod_id;
        if (currentPos > 0) {
            this.updateWatchPosition(this.currentPlayingStream, this.currentPlayingType, currentPos, true);
            if (this.currentPlayingType === 'vod' || this.currentPlayingType === 'movie') {
                this.updateWatchHistoryProgress(streamId, currentPos, duration);
            }
        }
    }
    this.currentPlayingStream = null;
    this.currentPlayingType = null;
    this.isBuffering = false;
    this.bufferPercent = undefined;
    document.getElementById('buffer-indicator').classList.add('hidden');
    this.player.stop();
    if (this.selectedStream && !wasHistory) {
        this.showScreen('details');
        this.currentScreen = 'details';
        this.focusArea = 'details';
        if (isSeries && this.currentSeason) {
            this.selectSeason(this.currentSeason);
        }
        if (isSeries && this.currentSeriesInfo) {
            this.updateSeriesContinueButton(this.currentSeriesInfo);
        }
        else if (!isSeries) {
            this.updateVodButtons();
        }
        this.updateContinueCounter();
        if (isSeries && this.launchedFromButton === 'continue') {
            // Return to continue button
            this.focusIndex = this.getDetailsPlayIndex();
            this.updateFocus();
            var wrapper = document.getElementById('details-wrapper');
            if (wrapper) wrapper.scrollTop = 0;
        }
        else if (isSeries && this.currentEpisodeId) {
            // Return to episode in list
            var self = this;
            setTimeout(function() {
                var focusables = self.getFocusables();
                self.focusIndex = 0;
                for (var i = 0; i < focusables.length; i++) {
                    if (focusables[i].dataset && focusables[i].dataset.episodeId == self.currentEpisodeId) {
                        self.focusIndex = i;
                        break;
                    }
                }
                self.updateFocus();
                // Scroll episode into view
                var episodeEl = document.querySelector('.episode-item[data-episode-id="' + self.currentEpisodeId + '"]');
                if (episodeEl) {
                    episodeEl.scrollIntoView({ block: 'center' });
                }
            }, 50);
        }
        else {
            this.focusIndex = this.getDetailsPlayIndex();
            this.updateFocus();
        }
    }
    else {
        this.showScreen('browse');
        this.currentScreen = 'browse';
        if (wasHistory) {
            this.showContinueInGrid();
        }
        this.updateContinueCounter();
        this.focusArea = 'grid';
        this.focusIndex = this.lastGridIndex || 0;
        this.updateFocus();
    }
};

IPTVApp.prototype.onPlaybackCompleted = function() {
    var self = this;
    var isSeries = this.selectedStream && this.selectedStream.type === 'series';
    if (this.currentPlayingStream && !isSeries) {
        var streamId = this.currentPlayingStream.stream_id || this.currentPlayingStream.series_id;
        // Mark as watched in watchHistory
        var historyItem = this.getWatchHistoryItem(streamId);
        if (historyItem) {
            historyItem.watched = true;
            this.saveWatchHistory();
        }
    }
    this.currentPlayingStream = null;
    this.currentPlayingType = null;
    this.isBuffering = false;
    this.bufferPercent = undefined;
    document.getElementById('buffer-indicator').classList.add('hidden');
    this.player.stop();
    if (isSeries) {
        var next = this.getNextEpisode();
        if (next) {
            if (next.season !== this.currentSeason) {
                this.currentSeason = next.season;
            }
            setTimeout(function() {
                self.playNextEpisode(next.episode);
            }, 500);
            return;
        }
        this.showScreen('details');
        this.currentScreen = 'details';
        this.focusArea = 'details';
        if (this.currentSeason) {
            this.selectSeason(this.currentSeason);
        }
        this.focusIndex = 0;
        if (this.currentEpisodeId) {
            var focusables = this.getFocusables();
            for (var i = 0; i < focusables.length; i++) {
                if (focusables[i].dataset.episodeId == this.currentEpisodeId) {
                    this.focusIndex = i;
                    break;
                }
            }
        }
        this.updateFocus();
    }
    else {
        this.showScreen('browse');
        this.currentScreen = 'browse';
        this.focusArea = 'grid';
        this.focusIndex = 0;
        this.updateFocus();
    }
};

IPTVApp.prototype.playNextEpisode = function(episode) {
    this.currentEpisodeId = episode.id;
    this.currentEpisodeNum = parseInt(episode.episode_num) || 0;
    var stream = {
        stream_id: episode.id,
        series_id: this.selectedStream.id,
        name: this.selectedStream.data.name,
        cover: this.selectedStream.data.cover || this.selectedStream.data.stream_icon,
        season: this.currentSeason,
        episode: episode.episode_num,
        episodeTitle: episode.title || (I18n.t('details.episode') + ' ' + episode.episode_num)
    };
    this.addToWatchHistory(stream, 'series', 0);
    this.playStream(episode.id, 'episode', stream);
};

// Player UI
IPTVApp.prototype.updatePlayerProgress = function(current, total) {
    if (this.seekDirection !== 0 || this.seekDebounceTimer) {
        return;
    }
    // Don't update progress for live in timeshift - handled by updatePlayerStateIndicator
    if (this.currentPlayingType === 'live' && this.player.isInTimeshift) {
        return;
    }
    // Update seek position only when stream is ready (avoid stale values from previous stream)
    if (this.streamReady) {
        this.seekTargetPosition = current;
    }
    var percent = total > 0 ? (current / total) * 100 : 0;
    document.getElementById('progress-bar').style.width = percent + '%';
    document.getElementById('player-time').textContent =
        this.player.formatTime(current) + ' / ' + this.player.formatTime(total);
};

IPTVApp.prototype.updatePlayerStateIndicator = function() {
    var stateEl = document.getElementById('player-state');
    var bufferEl = document.getElementById('buffer-indicator');
    var liveBufferEl = document.getElementById('player-buffer');
    if (!stateEl) return;
    // Buffer indicator (centered on screen)
    if (this.bufferPercent !== undefined && this.bufferPercent < 100) {
        bufferEl.textContent = '⏳ ' + this.bufferPercent + '%';
        bufferEl.classList.remove('hidden');
    }
    else if (this.isBuffering) {
        bufferEl.textContent = '⏳';
        bufferEl.classList.remove('hidden');
    }
    else {
        bufferEl.classList.add('hidden');
    }
    // Live pause duration display
    var isLive = this.currentPlayingType === 'live' || (this.selectedStream && this.selectedStream.type === 'live');
    var progressEl = document.getElementById('player-progress');
    var timeEl = document.getElementById('player-time');
    if (isLive) {
        // Always hide progress bar for live
        if (progressEl) progressEl.style.display = 'none';
        if (timeEl) timeEl.style.display = 'none';
        // Show pause duration if in timeshift
        if (this.player.isInTimeshift && liveBufferEl) {
            var bufferInfo = this.player.getBufferInfo();
            if (bufferInfo.available && bufferInfo.seconds > 0) {
                liveBufferEl.textContent = I18n.t('player.pauseDuration') + ': ' + this.player.formatTime(bufferInfo.seconds * 1000) + ' (' + I18n.t('player.returnToLive') + ')';
                liveBufferEl.classList.remove('hidden');
            }
            else {
                liveBufferEl.classList.add('hidden');
            }
        }
        else if (liveBufferEl) {
            liveBufferEl.classList.add('hidden');
        }
    }
    else if (liveBufferEl) {
        liveBufferEl.classList.add('hidden');
    }
    // Playback state indicator (in overlay)
    if (this.seekDirection !== 0 || this.seekDebounceTimer) {
        stateEl.textContent = this.wasPlaying ? '▶' : '❚❚';
    }
    else if (this.player.isPaused) {
        stateEl.textContent = '❚❚';
    }
    else {
        stateEl.textContent = '▶';
        this.bufferPercent = undefined;
    }
};

IPTVApp.prototype.showPlayerOverlay = function() {
    var self = this;
    var overlay = document.getElementById('player-overlay');
    var titleEl = document.getElementById('player-title');
    var topRightEl = document.getElementById('player-top-right');
    var qualityEl = document.getElementById('player-quality');
    var progressEl = document.getElementById('player-progress');
    var timeEl = document.getElementById('player-time');
    var isLive = this.selectedStream && this.selectedStream.type === 'live';
    overlay.classList.remove('hidden');
    if (topRightEl) topRightEl.classList.remove('hidden');
    titleEl.classList.remove('hidden');
    // Hide progress bar and time for live streams
    if (progressEl) progressEl.style.display = isLive ? 'none' : '';
    if (timeEl) timeEl.style.display = isLive ? 'none' : '';
    var streamData = this.currentPlayingStream || (this.selectedStream && this.selectedStream.data);
    if (streamData) {
        var title = streamData.name || streamData.title || '';
        var displayTitle = title;
        var year = this.extractYear(title);
        if (!year && this.tmdbInfo) {
            var dateStr = this.tmdbInfo.release_date || this.tmdbInfo.first_air_date;
            if (dateStr) {
                year = dateStr.substring(0, 4);
            }
        }
        displayTitle = this.cleanTitle(title);
        if (year) {
            displayTitle += ' (' + year + ')';
        }
        // Add season/episode info for series
        if (streamData.season && streamData.episode) {
            var s = streamData.season < 10 ? '0' + streamData.season : streamData.season;
            var e = streamData.episode < 10 ? '0' + streamData.episode : streamData.episode;
            displayTitle += ' - S' + s + 'E' + e;
        }
        titleEl.textContent = displayTitle;
    }
    // Show quality on the right
    if (this.videoQuality && qualityEl) {
        qualityEl.textContent = this.videoQuality;
    }
    else if (qualityEl) {
        qualityEl.textContent = '';
    }
    this.updatePlayerStateIndicator();
    this.updatePlayerTracks();
    this.updatePlayerFavoriteIcon();
    if (this.overlayTimer) {
        clearTimeout(this.overlayTimer);
    }
    // Don't hide overlay while buffering
    var isBuffering = this.isBuffering || (this.bufferPercent !== undefined && this.bufferPercent < 100);
    if (!isBuffering) {
        this.overlayTimer = setTimeout(function() {
            if (self.playerTracksFocused) {
                self.unfocusPlayerTracks();
            }
            overlay.classList.add('hidden');
            titleEl.classList.add('hidden');
            if (topRightEl) topRightEl.classList.add('hidden');
        }, 5000);
    }
};

// Track selection
IPTVApp.prototype.updatePlayerTracks = function() {
    var tracks = this.player.getTracks();
    var tracksDiv = document.getElementById('player-tracks');
    var audioBtn = document.getElementById('player-audio-btn');
    var subtitleBtn = document.getElementById('player-subtitle-btn');
    var optionsBtn = document.getElementById('player-sub-options-btn');
    this.availableTracks = tracks;
    // Always show tracks div for favorite button
    tracksDiv.classList.remove('hidden');
    if (tracks.audio.length > 1) {
        audioBtn.classList.remove('hidden');
        var audioLabel = tracks.audio[this.currentAudioIndex || 0];
        document.getElementById('player-audio-label').textContent = audioLabel ? audioLabel.language : 'Audio';
    }
    else {
        audioBtn.classList.add('hidden');
    }
    if (tracks.subtitle.length > 0) {
        subtitleBtn.classList.remove('hidden');
        var subIdx = this.currentSubtitleIndex;
        var subLabel = subIdx === -1 ? 'Désactivé' : (subIdx === -2 ? 'Externe' : (tracks.subtitle[subIdx] ? tracks.subtitle[subIdx].language : 'Sous-titres'));
        document.getElementById('player-subtitle-label').textContent = subLabel;
    }
    else {
        subtitleBtn.classList.add('hidden');
    }
    if (this.currentSubtitleIndex === -2) {
        optionsBtn.classList.remove('hidden');
    }
    else {
        optionsBtn.classList.add('hidden');
    }
};

IPTVApp.prototype.reapplySubtitleTrack = function() {
    if (this.currentSubtitleIndex === undefined || this.currentSubtitleIndex === -1) {
        return;
    }
    var tracks = this.player.getTracks();
    if (this.currentSubtitleIndex === -2) {
        this.player.showSubtitles();
    }
    else if (this.currentSubtitleIndex >= 0 && tracks.subtitle[this.currentSubtitleIndex]) {
        var trackIndex = tracks.subtitle[this.currentSubtitleIndex].index;
        this.player.setSubtitleTrack(trackIndex);
        this.player.showSubtitles();
    }
};

IPTVApp.prototype.focusPlayerTracks = function() {
    this.playerTracksFocused = true;
    this.playerTrackIndex = 0;
    this.updatePlayerTracksFocus();
};

IPTVApp.prototype.unfocusPlayerTracks = function() {
    this.playerTracksFocused = false;
    document.querySelectorAll('.player-track-btn').forEach(function(el) {
        el.classList.remove('focused');
    });
};

IPTVApp.prototype.updatePlayerTracksFocus = function() {
    var btns = document.querySelectorAll('#player-tracks .player-track-btn:not(.hidden)');
    btns.forEach(function(el) { el.classList.remove('focused'); });
    if (btns[this.playerTrackIndex]) {
        btns[this.playerTrackIndex].classList.add('focused');
    }
};

IPTVApp.prototype.cycleTrack = function(type) {
    var tracks = this.availableTracks;
    if (!tracks) return;
    if (type === 'audio' && tracks.audio.length > 1) {
        this.currentAudioIndex = ((this.currentAudioIndex || 0) + 1) % tracks.audio.length;
        this.player.setAudioTrack(tracks.audio[this.currentAudioIndex].index);
        document.getElementById('player-audio-label').textContent = tracks.audio[this.currentAudioIndex].language;
    }
    else if (type === 'subtitle') {
        var totalSubs = tracks.subtitle.length + 1;
        this.currentSubtitleIndex = ((this.currentSubtitleIndex === undefined ? 0 : this.currentSubtitleIndex + 1) + 1) % totalSubs - 1;
        if (this.currentSubtitleIndex === -1) {
            this.player.hideSubtitles();
            document.getElementById('player-subtitle-label').textContent = I18n.t('player.disabled');
        }
        else {
            this.player.setSubtitleTrack(tracks.subtitle[this.currentSubtitleIndex].index);
            this.player.showSubtitles();
            document.getElementById('player-subtitle-label').textContent = tracks.subtitle[this.currentSubtitleIndex].language;
        }
    }
};

IPTVApp.prototype.handlePlayerDown = function() {
    this.showPlayerOverlay();
    var tracksDiv = document.getElementById('player-tracks');
    if (!tracksDiv.classList.contains('hidden')) {
        this.focusPlayerTracks();
    }
};

IPTVApp.prototype.navigatePlayerTracks = function(direction) {
    var btns = document.querySelectorAll('#player-tracks .player-track-btn:not(.hidden)');
    if (btns.length === 0) return;
    var newIndex = this.playerTrackIndex + direction;
    if (newIndex < 0) {
        this.startSeek(-1);
        return;
    }
    if (newIndex >= btns.length) {
        this.startSeek(1);
        return;
    }
    this.playerTrackIndex = newIndex;
    this.updatePlayerTracksFocus();
    this.showPlayerOverlay();
};

IPTVApp.prototype.selectPlayerTrack = function() {
    var btns = document.querySelectorAll('#player-tracks .player-track-btn:not(.hidden)');
    if (!btns[this.playerTrackIndex]) return;
    var btn = btns[this.playerTrackIndex];
    if (btn.id === 'player-audio-btn') {
        this.showTrackSelectionModal('audio');
    }
    else if (btn.id === 'player-subtitle-btn') {
        this.showTrackSelectionModal('subtitle');
    }
    else if (btn.id === 'player-sub-options-btn') {
        this.showSubtitleOptionsModal();
    }
    else if (btn.id === 'player-favorite-btn') {
        this.togglePlayerFavorite();
    }
};

IPTVApp.prototype.togglePlayerFavorite = function() {
    var stream = this.currentPlayingStream || (this.selectedStream && this.selectedStream.data);
    var type = this.currentPlayingType || (this.selectedStream && this.selectedStream.type) || 'vod';
    if (stream) {
        this.toggleFavorite(stream, type);
        this.updatePlayerFavoriteIcon();
    }
};

IPTVApp.prototype.updatePlayerFavoriteIcon = function() {
    var icon = document.getElementById('player-favorite-icon');
    if (!icon) return;
    var stream = this.currentPlayingStream || (this.selectedStream && this.selectedStream.data);
    if (stream) {
        var streamId = stream.stream_id || stream.series_id || stream.id;
        var isFav = this.isFavorite(streamId);
        icon.textContent = isFav ? '★' : '☆';
    }
};

IPTVApp.prototype.showTrackSelectionModal = function(type) {
    var self = this;
    var tracks = this.availableTracks;
    if (!tracks) return;
    var audioList = document.getElementById('audio-tracks-list');
    var subtitleList = document.getElementById('subtitle-tracks-list');
    var audioSection = audioList.parentElement;
    var subtitleSection = subtitleList.parentElement;
    audioList.innerHTML = '';
    subtitleList.innerHTML = '';
    this.trackModalItems = [];
    if (type === 'audio') {
        audioSection.classList.remove('hidden');
        subtitleSection.classList.add('hidden');
        for (var i = 0; i < tracks.audio.length; i++) {
            var item = document.createElement('div');
            item.className = 'track-item focusable';
            item.dataset.type = 'audio';
            item.dataset.index = tracks.audio[i].index;
            item.dataset.idx = i;
            item.textContent = tracks.audio[i].language;
            if (i === (this.currentAudioIndex || 0)) item.classList.add('selected');
            audioList.appendChild(item);
            this.trackModalItems.push(item);
        }
    }
    else {
        audioSection.classList.add('hidden');
        subtitleSection.classList.remove('hidden');
        var noSubItem = document.createElement('div');
        noSubItem.className = 'track-item focusable';
        noSubItem.dataset.type = 'subtitle';
        noSubItem.dataset.index = '-1';
        noSubItem.textContent = I18n.t('player.disabled');
        if (this.currentSubtitleIndex === -1 || this.currentSubtitleIndex === undefined) noSubItem.classList.add('selected');
        subtitleList.appendChild(noSubItem);
        this.trackModalItems.push(noSubItem);
        for (var j = 0; j < tracks.subtitle.length; j++) {
            var subItem = document.createElement('div');
            subItem.className = 'track-item focusable';
            subItem.dataset.type = 'subtitle';
            subItem.dataset.index = tracks.subtitle[j].index;
            subItem.dataset.idx = j;
            subItem.textContent = tracks.subtitle[j].language;
            if (j === this.currentSubtitleIndex) subItem.classList.add('selected');
            subtitleList.appendChild(subItem);
            this.trackModalItems.push(subItem);
        }
        if (typeof SubDL !== 'undefined' && SubDL.isEnabled()) {
            var sdItem = document.createElement('div');
            sdItem.className = 'track-item focusable';
            sdItem.dataset.type = 'subdl';
            sdItem.textContent = '🔍 ' + I18n.t('subtitleSearch.searchSubDL');
            subtitleList.appendChild(sdItem);
            this.trackModalItems.push(sdItem);
        }
        if (typeof OpenSubtitles !== 'undefined' && OpenSubtitles.isEnabled()) {
            var osItem = document.createElement('div');
            osItem.className = 'track-item focusable opensubtitles-item';
            osItem.dataset.type = 'opensubtitles';
            osItem.textContent = '🔍 ' + I18n.t('subtitleSearch.searchOpenSubtitles');
            subtitleList.appendChild(osItem);
            this.trackModalItems.push(osItem);
        }
    }
    document.getElementById('tracks-modal').classList.remove('hidden');
    this.focusArea = 'tracks';
    this.focusIndex = 0;
    for (var k = 0; k < this.trackModalItems.length; k++) {
        if (this.trackModalItems[k].classList.contains('selected')) {
            this.focusIndex = k;
            break;
        }
    }
    this.updateFocus();
};

IPTVApp.prototype.confirmTrackSelection = function() {
    if (!this.trackModalItems || this.focusIndex >= this.trackModalItems.length) return;
    var item = this.trackModalItems[this.focusIndex];
    var type = item.dataset.type;
    var index = parseInt(item.dataset.index);
    var idx = parseInt(item.dataset.idx);
    if (type === 'audio') {
        this.currentAudioIndex = idx;
        this.player.setAudioTrack(index);
        document.getElementById('player-audio-label').textContent = item.textContent;
    }
    else if (type === 'subtitle') {
        if (index === -1) {
            this.currentSubtitleIndex = -1;
            this.externalSubtitles = null;
            this.lastExternalSubtitle = null;
            this.player.hideSubtitles();
            document.getElementById('player-subtitle-label').textContent = I18n.t('player.disabled');
        }
        else {
            this.currentSubtitleIndex = idx;
            this.player.setSubtitleTrack(index);
            this.player.showSubtitles();
            document.getElementById('player-subtitle-label').textContent = item.textContent;
        }
    }
    else if (type === 'subdl') {
        this.searchSubDL();
        return;
    }
    else if (type === 'opensubtitles') {
        this.searchOpenSubtitles();
        return;
    }
    else if (type === 'sd-back' || type === 'os-back') {
        this.showTrackSelectionModal('subtitle');
        return;
    }
    else if (type === 'os-result') {
        this.downloadOpenSubtitle(idx);
        return;
    }
    else if (type === 'sd-result') {
        this.downloadSubDLSubtitle(idx);
        return;
    }
    this.hideTracksModal();
    this.showPlayerOverlay();
};

// Subtitle search
IPTVApp.prototype.searchOpenSubtitles = function() {
    var self = this;
    if (!this.tmdbInfo || !OpenSubtitles.isEnabled()) {
        return;
    }
    this.showLoading(true);
    var params = {
        languages: 'fr,en'
    };
    if (this.tmdbInfo.external_ids && this.tmdbInfo.external_ids.imdb_id) {
        params.imdb_id = this.tmdbInfo.external_ids.imdb_id;
    }
    else if (this.tmdbInfo.id) {
        params.tmdb_id = this.tmdbInfo.id;
    }
    if (this.selectedEpisode) {
        params.type = 'episode';
        params.season_number = this.selectedEpisode.season;
        params.episode_number = this.selectedEpisode.episode;
        if (this.tmdbInfo.id) {
            params.parent_tmdb_id = this.tmdbInfo.id;
        }
    }
    else if (this.tmdbInfo._type === 'tv') {
        params.type = 'tvshow';
    }
    else {
        params.type = 'movie';
    }
    OpenSubtitles.search(params, function(err, results) {
        if (err) {
            self.showLoading(false);
            return;
        }
        if (!results || results.length === 0) {
            self.showLoading(false);
            return;
        }
        self.showOpenSubtitlesResults(results);
    });
};

IPTVApp.prototype.searchSubDL = function() {
    var self = this;
    if (!this.tmdbInfo || !SubDL.isEnabled()) {
        return;
    }
    this.showLoading(true);
    var params = {
        languages: 'fr,en'
    };
    if (this.tmdbInfo.external_ids && this.tmdbInfo.external_ids.imdb_id) {
        params.imdb_id = this.tmdbInfo.external_ids.imdb_id;
    }
    else if (this.tmdbInfo.id) {
        params.tmdb_id = this.tmdbInfo.id;
    }
    params.type = this.tmdbInfo._type || 'movie';
    if (this.selectedEpisode) {
        params.season_number = this.selectedEpisode.season;
        params.episode_number = this.selectedEpisode.episode;
    }
    SubDL.search(params, function(err, results) {
        if (err) {
            self.showLoading(false);
            return;
        }
        if (!results || results.length === 0) {
            self.showLoading(false);
            return;
        }
        self.showSubDLResults(results);
    });
};

IPTVApp.prototype.showSubDLResults = function(results) {
    var self = this;
    this.showLoading(false);
    var subtitleList = document.getElementById('subtitle-tracks-list');
    subtitleList.innerHTML = '';
    this.trackModalItems = [];
    this.subDLResults = results;
    var backItem = document.createElement('div');
    backItem.className = 'track-item focusable';
    backItem.dataset.type = 'sd-back';
    backItem.textContent = '← ' + I18n.t('subtitleSearch.back');
    subtitleList.appendChild(backItem);
    this.trackModalItems.push(backItem);
    for (var i = 0; i < Math.min(results.length, 15); i++) {
        var sub = results[i];
        var item = document.createElement('div');
        item.className = 'track-item focusable';
        item.dataset.type = 'sd-result';
        item.dataset.idx = i;
        var label = (sub.language || 'Unknown').toUpperCase();
        if (sub.release) label += ' - ' + sub.release.substring(0, 40);
        if (sub.hearing_impaired) label += ' [SDH]';
        item.textContent = label;
        subtitleList.appendChild(item);
        this.trackModalItems.push(item);
    }
    this.focusIndex = 0;
    this.updateFocus();
};

IPTVApp.prototype.downloadSubDLSubtitle = function(idx) {
    var self = this;
    var sub = this.subDLResults[idx];
    if (!sub) return;
    this.showLoading(true);
    SubDL.downloadZip(sub.download_url, function(err, zipResult) {
        if (err) {
            self.showLoading(false);
            return;
        }
        SubDL.extractSrtFromZip(zipResult.data, function(err, srtContent) {
            if (err) {
                self.showLoading(false);
                return;
            }
            self.externalSubtitleContent = srtContent;
            self.parseAndLoadSubtitle(srtContent);
            self.showLoading(false);
            self.hideTracksModal();
            self.showPlayerOverlay();
            document.getElementById('player-subtitle-label').textContent = (sub.language || 'SUB').toUpperCase();
        });
    });
};

IPTVApp.prototype.showOpenSubtitlesResults = function(results) {
    var self = this;
    this.showLoading(false);
    var subtitleList = document.getElementById('subtitle-tracks-list');
    subtitleList.innerHTML = '';
    this.trackModalItems = [];
    this.openSubtitlesResults = results;
    var backItem = document.createElement('div');
    backItem.className = 'track-item focusable';
    backItem.dataset.type = 'os-back';
    backItem.textContent = '← ' + I18n.t('subtitleSearch.back');
    subtitleList.appendChild(backItem);
    this.trackModalItems.push(backItem);
    for (var i = 0; i < Math.min(results.length, 10); i++) {
        var sub = results[i];
        var item = document.createElement('div');
        item.className = 'track-item focusable';
        item.dataset.type = 'os-result';
        item.dataset.idx = i;
        var label = sub.language.toUpperCase();
        if (sub.release) label += ' - ' + sub.release;
        if (sub.hearing_impaired) label += ' [SDH]';
        if (sub.ai_translated) label += ' [AI]';
        item.textContent = label;
        subtitleList.appendChild(item);
        this.trackModalItems.push(item);
    }
    this.focusIndex = 0;
    this.updateFocus();
};

IPTVApp.prototype.downloadOpenSubtitle = function(idx) {
    var self = this;
    var sub = this.openSubtitlesResults[idx];
    if (!sub) return;
    this.showLoading(true);
    OpenSubtitles.getDownloadLink(sub.file_id, function(err, download) {
        if (err) {
            self.showLoading(false);
            return;
        }
        OpenSubtitles.downloadContent(download.link, function(err, content) {
            if (err) {
                self.showLoading(false);
                return;
            }
            self.externalSubtitleContent = content;
            self.parseAndLoadSubtitle(content);
            self.showLoading(false);
            self.hideTracksModal();
            self.showPlayerOverlay();
            document.getElementById('player-subtitle-label').textContent = sub.language.toUpperCase();
        });
    });
};

IPTVApp.prototype.parseAndLoadSubtitle = function(srtContent) {
    var self = this;
    this.externalSubtitles = [];
    var blocks = srtContent.trim().split(/\n\n+/);
    for (var i = 0; i < blocks.length; i++) {
        var lines = blocks[i].split('\n');
        if (lines.length >= 3) {
            var timeLine = lines[1] || lines[0];
            var timeMatch = timeLine.match(Regex.srtTiming);
            if (timeMatch) {
                var startMs = parseInt(timeMatch[1]) * 3600000 + parseInt(timeMatch[2]) * 60000 + parseInt(timeMatch[3]) * 1000 + parseInt(timeMatch[4]);
                var endMs = parseInt(timeMatch[5]) * 3600000 + parseInt(timeMatch[6]) * 60000 + parseInt(timeMatch[7]) * 1000 + parseInt(timeMatch[8]);
                var textLines = lines.slice(2);
                if (lines[0].match(Regex.srtIndex)) textLines = lines.slice(2);
                else textLines = lines.slice(1);
                textLines = textLines.filter(function(l) { return !l.match(Regex.srtArrow); });
                var text = textLines.join('<br>').replace(/<[^>]*>/g, function(tag) {
                    if (/<\/?[bi]>/i.test(tag)) return tag;
                    if (tag === '<br>') return tag;
                    return '';
                });
                if (text.trim()) {
                    self.externalSubtitles.push({
                        start: startMs,
                        end: endMs,
                        text: text
                    });
                }
            }
        }
    }
    this.player.subtitlesEnabled = true;
    this.currentSubtitleIndex = -2;
    this.subtitleOffset = 0;
};

// Subtitle options
IPTVApp.prototype.adjustSubtitleOffset = function(deltaMs) {
    this.subtitleOffset = (this.subtitleOffset || 0) + deltaMs;
    this.updateSubtitleOffsetDisplay();
};

IPTVApp.prototype.updateSubtitleOffsetDisplay = function() {
    var display = document.getElementById('sub-offset-display');
    if (display) {
        var sign = this.subtitleOffset >= 0 ? '+' : '';
        display.textContent = sign + (this.subtitleOffset / 1000).toFixed(1) + 's';
    }
};

IPTVApp.prototype.showSubtitleOptionsModal = function() {
    this.subtitleSize = this.subtitleSize || 'medium';
    this.subtitleStyle = this.subtitleStyle || 'shadow';
    this.subtitleOffset = this.subtitleOffset || 0;
    this.updateSubtitleOffsetDisplay();
    var modal = document.getElementById('sub-options-modal');
    modal.querySelectorAll('.sub-option-btn[data-action="size"]').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.value === this.subtitleSize);
    }.bind(this));
    modal.querySelectorAll('.sub-option-btn[data-action="style"]').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.value === this.subtitleStyle);
    }.bind(this));
    modal.classList.remove('hidden');
    this.focusArea = 'sub-options';
    this.subOptionsItems = Array.from(modal.querySelectorAll('.sub-option-btn.focusable'));
    this.focusIndex = this.subOptionsItems.length - 1;
    this.updateFocus();
};

IPTVApp.prototype.hideSubtitleOptionsModal = function() {
    document.getElementById('sub-options-modal').classList.add('hidden');
    this.focusArea = '';
    this.unfocusPlayerTracks();
    this.showPlayerOverlay();
};

IPTVApp.prototype.handleSubtitleOption = function() {
    if (!this.subOptionsItems || this.focusIndex >= this.subOptionsItems.length) return;
    var btn = this.subOptionsItems[this.focusIndex];
    var action = btn.dataset.action;
    var value = btn.dataset.value;
    if (action === 'offset') {
        this.adjustSubtitleOffset(parseInt(value));
    }
    else if (action === 'size') {
        this.subtitleSize = value;
        this.applySubtitleStyle();
        document.querySelectorAll('.sub-option-btn[data-action="size"]').forEach(function(b) {
            b.classList.toggle('selected', b.dataset.value === value);
        });
    }
    else if (action === 'style') {
        this.subtitleStyle = value;
        this.applySubtitleStyle();
        document.querySelectorAll('.sub-option-btn[data-action="style"]').forEach(function(b) {
            b.classList.toggle('selected', b.dataset.value === value);
        });
    }
    else if (action === 'close') {
        this.hideSubtitleOptionsModal();
    }
};

IPTVApp.prototype.applySubtitleStyle = function() {
    var el = document.getElementById('subtitle-display');
    if (!el) return;
    el.classList.remove('size-small', 'size-medium', 'size-large');
    el.classList.remove('style-shadow', 'style-background', 'style-none');
    el.classList.add('size-' + (this.subtitleSize || 'medium'));
    el.classList.add('style-' + (this.subtitleStyle || 'shadow'));
};

IPTVApp.prototype.displayExternalSubtitle = function(currentTimeMs) {
    var subtitleEl = document.getElementById('subtitle-display');
    if (!subtitleEl) return;
    if (this.currentSubtitleIndex !== -2 || !this.externalSubtitles || this.externalSubtitles.length === 0) {
        return;
    }
    var offset = this.subtitleOffset || 0;
    var adjustedTime = currentTimeMs - offset;
    var found = null;
    for (var i = 0; i < this.externalSubtitles.length; i++) {
        var sub = this.externalSubtitles[i];
        if (adjustedTime >= sub.start && adjustedTime <= sub.end) {
            found = sub;
            break;
        }
    }
    if (found) {
        if (this.lastExternalSubtitle !== found.text) {
            window.displaySubtitle(subtitleEl, found.text);
            this.lastExternalSubtitle = found.text;
        }
    }
    else {
        if (this.lastExternalSubtitle) {
            window.displaySubtitle(subtitleEl, '');
            this.lastExternalSubtitle = null;
        }
    }
};
