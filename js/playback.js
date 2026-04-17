/**
 * Playback module - Video playback control for IPTVApp
 * Handles seeking, playback controls, track selection, external subtitles
 */

// Format duration as "1h30" or "45min" if less than 1h
IPTVApp.prototype.formatDuration = function(ms) {
    var totalMinutes = Math.floor(ms / 60000);
    var h = Math.floor(totalMinutes / 60);
    var m = totalMinutes % 60;
    if (h === 0) {
        return m + I18n.t('player.minShort', 'min');
    }
    var hourLabel = I18n.t('player.hourShort', 'h');
    var minStr = m > 0 ? (m < 10 ? '0' + m : m) : '';
    return h + hourLabel + minStr;
};

// Seek controls
IPTVApp.prototype.startSeek = function(direction) {
    window.log('ACTION startSeek: ' + (direction > 0 ? 'forward' : 'backward'));
    var self = this;
    var hadPendingSeek = !!this.seekDebounceTimer;
    this.clearTimer('seekDebounceTimer');
    var isLive = this.currentPlayingType === 'live';
    var isCatchup = this.currentPlayingType === 'catchup' && this.catchupParams;
    var hasContent = this.player.duration > 0 || isCatchup;
    // No seeking for live streams
    if (isLive || !hasContent) {
        return;
    }
    if (this.seekDirection === direction && this.seekInterval) {
        // Reset safety timeout on repeated keydown (key held)
        if (this.seekSafetyTimeout) {
            clearTimeout(this.seekSafetyTimeout);
        }
        this.seekSafetyTimeout = setTimeout(function() {
            self.stopSeek();
        }, 500);
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
    // For catchup: use program duration instead of player duration
    var isCatchup = this.currentPlayingType === 'catchup' && this.catchupParams;
    var duration = isCatchup ? (this.catchupParams.duration * 60 * 1000) : this.player.duration;
    var oldPosition = this.seekTargetPosition;
    this.seekTargetPosition = Math.max(0, Math.min(duration, this.seekTargetPosition + jumpMs));
    // For catchup: if at start and trying to go backward, load previous program
    if (isCatchup && this.seekDirection === -1 && oldPosition === 0 && this.seekTargetPosition === 0) {
        this.seekAtStartCount = (this.seekAtStartCount || 0) + 1;
        if (this.seekAtStartCount >= 3) {
            this.seekAtStartCount = 0;
            this.stopSeek();
            this.playPrevCatchup();
            return;
        }
    }
    else {
        this.seekAtStartCount = 0;
    }
    var percent = duration > 0 ? (this.seekTargetPosition / duration) * 100 : 0;
    this.setProgressBarWidth(Math.min(100, percent));
    var remaining = Math.max(0, duration - this.seekTargetPosition);
    document.getElementById('player-time').textContent = this.player.formatTime(this.seekTargetPosition);
    document.getElementById('player-remaining').textContent = this.player.formatTime(remaining);
    if (isCatchup) {
        var catchupIndicator = document.getElementById('catchup-time-indicator');
        if (catchupIndicator) {
            var replayTime = new Date((this.catchupParams.start * 1000) + this.seekTargetPosition);
            var locale = this.settings.locale || 'fr';
            catchupIndicator.textContent = replayTime.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
            catchupIndicator.style.left = Math.min(100, percent) + '%';
        }
    }
    this.showSeekIndicator(multiplier);
};

IPTVApp.prototype.stopSeek = function() {
    this.clearTimer('seekSafetyTimeout');
    if (this.seekInterval) {
        clearInterval(this.seekInterval);
        this.seekInterval = null;
    }
    if (this.seekDirection !== 0) {
        var self = this;
        var targetPos = this.seekTargetPosition;
        var wasPlaying = this.wasPlaying;
        var duration = this.player.duration;
        // If seeking past end, trigger completion instead of seeking
        if (duration > 0 && targetPos >= duration && !this._completionTriggered) {
            window.log('Seek past end: target=' + targetPos + ' duration=' + duration + ', triggering completion');
            this._completionTriggered = true;
            this.seekDirection = 0;
            this.hideSeekIndicator();
            this.onPlaybackCompleted();
            return;
        }
        if (this.seekDebounceTimer) {
            clearTimeout(this.seekDebounceTimer);
        }
        this.seekDebounceTimer = setTimeout(function() {
            self.seekDebounceTimer = null;
            if (self.seekDirection === 0) {
                var seekPos = self.seekTargetPosition;
                if (self.currentPlayingType === 'catchup') {
                    self._catchupSeekTarget = seekPos;
                    self._catchupSeekTime = Date.now();
                    window.log('Catchup seek: target relative=' + seekPos);
                }
                if (self.player.isBuffering) {
                    self._pendingSeekPosition = seekPos;
                    self._pendingSeekResume = wasPlaying;
                    window.log('Seek deferred (buffering): target=' + seekPos);
                }
                else {
                    self.player.seekTo(seekPos);
                    self.lastSeekTime = Date.now();
                    if (wasPlaying) {
                        self.player.resume();
                    }
                }
            }
        }, 500);
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
    window.log('ACTION', 'returnToLive');
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

IPTVApp.prototype.hasActiveDownloadsForProvider = function(playlistId) {
    var downloads = FreeboxAPI.getActiveDownloads();
    var providerMap = this._freeboxDownloadProviderMap || {};
    var keys = Object.keys(downloads);
    for (var i = 0; i < keys.length; i++) {
        if (downloads[keys[i]].status === 'downloading') {
            var dlPlaylistId = providerMap[downloads[keys[i]].id];
            if (!playlistId || !dlPlaylistId || this.sameId(dlPlaylistId, playlistId)) {
                return true;
            }
        }
    }
    return false;
};

IPTVApp.prototype.pauseProviderDownloads = function(playlistId) {
    var downloads = FreeboxAPI.getActiveDownloads();
    var providerMap = this._freeboxDownloadProviderMap || {};
    var keys = Object.keys(downloads);
    var promises = [];
    for (var i = 0; i < keys.length; i++) {
        if (downloads[keys[i]].status === 'downloading') {
            var dlPlaylistId = providerMap[downloads[keys[i]].id];
            if (!playlistId || !dlPlaylistId || this.sameId(dlPlaylistId, playlistId)) {
                promises.push(FreeboxAPI.pauseDownload(downloads[keys[i]].id));
            }
        }
    }
    return Promise.all(promises);
};

// Playback
IPTVApp.prototype.playStream = function(streamId, type, stream, startPosition) {
    var self = this;
    var playlistId = stream ? stream._playlistId : null;
    window.log('playStream: id=' + streamId + ' type=' + type + ' playlistId=' + playlistId + ' section=' + this.currentSection);
    if (this.settings.freeboxEnabled && FreeboxAPI.isConfigured() && FreeboxAPI.hasActiveDownloads()) {
        var hasProviderDownloads = this.hasActiveDownloadsForProvider(playlistId);
        if (hasProviderDownloads && this.getActiveStreamCount(playlistId) >= this.getMaxConnections(playlistId)) {
            this.pauseProviderDownloads(playlistId);
            window.log('Freebox: paused provider downloads before playback (playlistId=' + playlistId + ')');
        }
    }
    this.videoQuality = '';
    this._completionTriggered = false;
    this._errorRetryCount = 0;
    // Reset EPG info (only relevant for live, clear for VOD/series)
    this.currentEPG = null;
    document.getElementById('player-epg').textContent = '';
    // Reset subtitles for new stream
    this.currentSubtitleIndex = -1;
    this.externalSubtitles = null;
    this.lastExternalSubtitle = null;
    this._subtitleDebugLogged = false;
    this._subtitleShownLogged = false;
    this._audioAutoSelected = false;
    this._subtitleAutoSelected = false;
    this._subTooltipTriggered = false;
    this.currentAudioIndex = 0;
    if (this.player) {
        this.player.hideSubtitles();
        this.player.playbackSpeed = 1;
    }
    this.updateSpeedLabel();
    // Reset tmdbInfo and backdrop for content types without TMDB (live, sport)
    if (type === 'live' || type === 'sport') {
        this.tmdbInfo = null;
        this.currentTmdbBackdrop = null;
    }
    var url;
    var apiToUse = this.api;
    if (stream && stream.url) {
        url = stream.url;
    }
    else if (this.api) {
        // Use container_extension from stream data if available
        var ext = stream && stream.container_extension ? stream.container_extension : null;
        if (!ext && type !== 'live') {
            window.log('[WARN] No container_extension for type=' + type);
        }
        // Find the correct API based on stream's playlistId (for merge mode)
        if (stream && stream._playlistId && this.apis && this.apis.length > 1) {
            var streamPlaylistId = stream._playlistId;
            var found = false;
            for (var i = 0; i < this.apis.length; i++) {
                var apiPid = this.apis[i].playlistId;
                window.log('playStream: checking API[' + i + '] playlistId=' + apiPid + ' server=' + this.apis[i].server);
                if (this.sameId(apiPid, streamPlaylistId)) {
                    apiToUse = this.apis[i];
                    window.log('playStream: FOUND API for playlistId ' + streamPlaylistId + ' -> server=' + apiToUse.server);
                    found = true;
                    break;
                }
            }
            if (!found) {
                window.log('playStream: WARNING - no API found for playlistId ' + streamPlaylistId);
            }
        }
        window.log('playStream: using server=' + apiToUse.server + ' user=' + apiToUse.username);
        switch (type) {
            case 'live':
                if (!ext) {
                    var liveFormat = self.settings.liveFormat || 'ts';
                    var fallbackFormat = liveFormat === 'ts' ? 'm3u8' : 'ts';
                    url = apiToUse.getLiveStreamUrl(streamId, liveFormat);
                    self._liveHlsFallbackUrl = apiToUse.getLiveStreamUrl(streamId, fallbackFormat);
                }
                else {
                    url = apiToUse.getLiveStreamUrl(streamId, ext);
                    self._liveHlsFallbackUrl = null;
                }
                break;
            case 'vod':
                url = apiToUse.getVodStreamUrl(streamId, ext || 'mkv');
                break;
            case 'series':
            case 'episode':
                url = apiToUse.getSeriesStreamUrl(streamId, ext || 'mkv');
                break;
        }
    }
    else {
        window.log('ERROR', 'No API and no M3U URL for stream');
        return;
    }
    window.log('playStream URL: ' + url);
    // Save pending history entry - will be added only if playback succeeds
    this._pendingHistoryStream = (type !== 'live' && type !== 'episode' && stream) ? { stream: stream, type: type } : null;
    // Increment playback ID to ignore events from previous stream
    this.currentPlaybackId = (this.currentPlaybackId || 0) + 1;
    var playbackId = this.currentPlaybackId;
    this.streamReady = false;
    this.currentPlayingStream = stream;
    this.currentPlayingType = type;
    this.setHidden('catchup-time-indicator', true);
    this.seekTargetPosition = startPosition || 0;
    this._pendingSeekPosition = undefined;
    this._pendingSeekResume = undefined;
    this.lastSeekTime = 0;
    var initialPercent = 0;
    var initialTime = '0:00';
    var initialRemaining = '0:00';
    var initialDuration = '';
    if (startPosition > 0) {
        var playlistId = stream ? stream._playlistId : null;
        var savedProgress = (type === 'episode') ? this.getEpisodeProgress(streamId, playlistId) : this.getWatchHistoryItem(streamId, playlistId);
        if (savedProgress && savedProgress.duration > 0) {
            initialPercent = savedProgress.percent || 0;
            var remaining = Math.max(0, savedProgress.duration - startPosition);
            initialTime = this.player.formatTime(startPosition);
            initialRemaining = this.player.formatTime(remaining);
            initialDuration = this.formatDuration(savedProgress.duration);
        }
    }
    this.setProgressBarWidth(initialPercent);
    document.getElementById('player-time').textContent = initialTime;
    document.getElementById('player-remaining').textContent = initialRemaining;
    document.getElementById('player-duration').textContent = initialDuration;
    // Hide progress bar and time for live streams, but keep state indicator visible
    var isLive = type === 'live';
    document.getElementById('player-progress-row').style.display = isLive ? 'none' : '';
    document.getElementById('player-duration').style.display = isLive ? 'none' : '';
    var posterUrl = stream ? this.getStreamImage(stream) : null;
    this.showLoading(true, posterUrl, I18n.t('loading.playback', 'Starting playback...'));
    clearTimeout(this._detailsTooltipTimer);
    clearTimeout(this._seasonTooltipTimer);
    this.hideAllButtonTooltips();
    this.hideTTSTooltip();
    this.showScreen('player');
    this.currentScreen = 'player';
    this.focusArea = 'player';
    this.playerTracksFocused = false;
    var self = this;
    var subtitlesApplied = false;
    this.player.onStateChange = function(state) {
        if (state === 'buffering') {
            self.isBuffering = true;
            self.updatePlayerStateIndicator();
            self.showPlayerOverlay();
            // Re-check after 1.1s to display the small bottom-right indicator if still buffering
            if (self.streamReady) {
                setTimeout(function() {
                    if (self.isBuffering) self.updatePlayerStateIndicator();
                }, 1100);
            }
        }
        else if (state === 'playing') {
            self.streamReady = true;
            self.isBuffering = false;
            self.bufferPercent = undefined;
            self._errorRetryCount = 0;
            self._liveHlsFallbackUrl = null;
            // Add to history only after playback starts successfully
            if (self._pendingHistoryStream) {
                self.addToWatchHistory(self._pendingHistoryStream.stream, self._pendingHistoryStream.type, 0);
                self._pendingHistoryStream = null;
            }
            if (self._pendingSeekPosition !== undefined) {
                var pendingPos = self._pendingSeekPosition;
                var pendingResume = self._pendingSeekResume;
                self._pendingSeekPosition = undefined;
                self._pendingSeekResume = undefined;
                window.log('Applying deferred seek: target=' + pendingPos);
                if (self.currentPlayingType === 'catchup') {
                    self._catchupSeekTarget = pendingPos;
                    self._catchupSeekTime = Date.now();
                }
                self.player.seekTo(pendingPos);
                self.lastSeekTime = Date.now();
                if (!pendingResume) {
                    self.player.pause();
                }
            }
            if (self._forceSeekToZero) {
                self._forceSeekToZero = false;
                self.player.seekTo(0);
            }
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
            if (type === 'live') {
                self.focusPlayerTracks();
                if (self._catchupFromPlayer) {
                    var restoreDay = self._catchupRestoreDay || 0;
                    var restoreIndex = self._catchupRestoreIndex || 0;
                    self._catchupFromPlayer = false;
                    self._catchupRestoreDay = undefined;
                    self._catchupRestoreIndex = undefined;
                    self.returnToLiveAfterCatchup = true;
                    self._replayFromPlayer = true;
                    self.unfocusPlayerTracks(true);
                    self.showCatchupModal(stream, restoreDay, restoreIndex);
                }
            }
            // Seek is now done before play() in player.js to avoid double buffering
            if (!subtitlesApplied) {
                subtitlesApplied = true;
                setTimeout(function() {
                    self.reapplySubtitleTrack();
                    self.autoEnableForcedSubtitles();
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
        // Throttle bandwidth display update to ~1Hz
        var nowMs = Date.now();
        if (!self._lastBandwidthUpdate || nowMs - self._lastBandwidthUpdate > 1000) {
            self._lastBandwidthUpdate = nowMs;
            self.updateBandwidthDisplay();
        }
        if (stream && type !== 'live') {
            self.updateWatchPosition(stream, type, current);
            if (type === 'episode' || type === 'series') {
                self.updateEpisodeProgress(streamId, current, total);
            }
            else if (type === 'vod' || type === 'movie') {
                self.updateWatchHistoryProgress(streamId, current, total, stream._playlistId);
            }
        }
    };
    this.player.onError = function(error) {
        // Clear pending history on error - don't add failed streams to history
        self._pendingHistoryStream = null;
        // HTTP error (stream not available)
        if (error && error.type === 'HTTP_ERROR') {
            // HLS m3u8 not supported by provider - fallback to .ts (if auto-switch enabled)
            if (self._liveHlsFallbackUrl && self.settings.liveAutoFormatSwitch !== false) {
                window.log('PLAYER', 'HLS m3u8 failed, falling back to .ts');
                var fallbackUrl = self._liveHlsFallbackUrl;
                self._liveHlsFallbackUrl = null;
                url = fallbackUrl;
                self.player.stop();
                setTimeout(function() {
                    self.player.play(fallbackUrl, true);
                }, 100);
                return;
            }
            self.showLoading(false);
            if (apiToUse && apiToUse.getAccountInfo) {
                apiToUse.getAccountInfo().then(function(info) {
                    var msg;
                    if (info && info.max_connections && parseInt(info.active_cons) >= parseInt(info.max_connections)) {
                        msg = I18n.t('player.connectionLimit', 'Connection limit reached', { active: info.active_cons, max: info.max_connections });
                    }
                    else {
                        msg = I18n.t('player.streamUnavailable', 'Stream unavailable');
                        if (error.status) msg += ' (HTTP ' + error.status + ')';
                    }
                    self.showToast(msg);
                    setTimeout(function() { self.stopPlayback(); }, 100);
                });
            }
            else {
                var msg = I18n.t('player.streamUnavailable', 'Stream unavailable');
                if (error.status) msg += ' (HTTP ' + error.status + ')';
                self.showToast(msg);
                setTimeout(function() { self.stopPlayback(); }, 100);
            }
            return;
        }
        // If HTML5 player also failed, show error and go back to details
        if (error && error.html5Error) {
            self.showLoading(false);
            // Show codec error if available, otherwise generic error
            if (error.unsupportedCodec && error.codecName) {
                var resolution = '';
                if (error.width > 0 && error.height > 0) {
                    resolution = ' (' + error.width + 'x' + error.height + ')';
                }
                var msg = I18n.t('player.unsupportedCodec', 'Codec not supported', { codec: error.codecName + resolution });
                if (msg === 'player.unsupportedCodec') {
                    msg = 'Codec ' + error.codecName + resolution + ' not supported by this TV';
                }
                self.showToast(msg);
            }
            else {
                self.showToast(I18n.t('player.playbackError', 'Playback error'));
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
            window.log('ERROR', 'Unsupported codec: ' + error.codecName + resolution + ' - trying HTML5 fallback');
            self.showToast(I18n.t('player.tryingHtml5', 'Trying alternative player...'));
            // Try HTML5 fallback
            setTimeout(function() {
                self.player.playHtml5();
            }, 100);
            return;
        }
        // Check for HTML5 error - try native fallback if AVPlay available
        if (error && error.html5Error && typeof webapis !== 'undefined' && webapis.avplay) {
            window.log('ERROR', 'HTML5 player failed - trying native AVPlay fallback');
            self.showToast(I18n.t('player.tryingNative', 'Trying native player...'));
            // Try native fallback
            setTimeout(function() {
                self.player.playNative();
            }, 100);
            return;
        }
        // HLS m3u8 not supported - fallback to .ts before retrying (if auto-switch enabled)
        if (self._liveHlsFallbackUrl && self.settings.liveAutoFormatSwitch !== false) {
            window.log('PLAYER', 'HLS m3u8 failed, falling back to .ts');
            var fallbackUrl = self._liveHlsFallbackUrl;
            self._liveHlsFallbackUrl = null;
            url = fallbackUrl;
            self.player.stop();
            setTimeout(function() {
                self.player.play(fallbackUrl, true);
            }, 100);
            return;
        }
        // Generic error - auto-retry up to 3 times before giving up
        var maxRetries = 3;
        if (self._errorRetryCount < maxRetries) {
            self._errorRetryCount++;
            var retryDelay = Math.pow(2, self._errorRetryCount) * 1000;
            var resumePosition = (type !== 'live') ? (self.player.currentTime || 0) : 0;
            window.log('PLAYER', 'Playback error, retry ' + self._errorRetryCount + '/' + maxRetries + ' in ' + retryDelay + 'ms at position ' + resumePosition);
            self.showLoading(false);
            self.showToast(I18n.t('player.reconnecting', 'Reconnecting...') + ' (' + self._errorRetryCount + '/' + maxRetries + ')', 3000, false, 'discreet');
            self.player.stop();
            setTimeout(function() {
                self.player.play(url, type === 'live', resumePosition);
            }, retryDelay);
            return;
        }
        // All retries exhausted - check connection limit before showing generic message
        self._errorRetryCount = 0;
        self.showLoading(false);
        if (apiToUse && apiToUse.getAccountInfo) {
            apiToUse.getAccountInfo().then(function(info) {
                var msg;
                if (info && info.max_connections && parseInt(info.active_cons) >= parseInt(info.max_connections)) {
                    msg = I18n.t('player.connectionLimit', 'Connection limit reached', { active: info.active_cons, max: info.max_connections });
                }
                else {
                    msg = I18n.t('player.playbackError', 'Playback error');
                }
                self.showToast(msg);
                setTimeout(function() { self.stopPlayback(); }, 100);
            });
        }
        else {
            self.showToast(I18n.t('player.playbackError', 'Playback error'));
            setTimeout(function() { self.stopPlayback(); }, 100);
        }
    };
    this.player.onBufferProgress = function(percent) {
        self.bufferPercent = percent;
        self.updatePlayerStateIndicator();
    };
    // Compute lower-quality variants for live channel (used as freeze fallback)
    if (type === 'live' && stream) {
        self._liveVariants = self.findLiveVariants(stream);
        window.log('PLAYER', 'Live variants for ' + self.getStreamTitle(stream) + ': ' + self._liveVariants.length);
    }
    else {
        self._liveVariants = [];
    }
    if (this.player.setBufferConfig) {
        this.player.setBufferConfig(this.getBufferConfig());
    }
    // Auto-restart on freeze for live streams (try lower-quality variant first)
    this.player.onFrozen = function() {
        if (type !== 'live') return;
        window.log('PLAYER', 'Live stream frozen');
        if (self._liveVariants && self._liveVariants.length > 0) {
            var nextVariant = self._liveVariants.shift();
            var variantName = self.getStreamTitle(nextVariant);
            var ext = nextVariant.container_extension || self.settings.liveFormat || 'ts';
            var newUrl = apiToUse.getLiveStreamUrl(nextVariant.stream_id, ext);
            window.log('PLAYER', 'Switching to lower-quality variant: ' + variantName + ' -> ' + newUrl);
            self.showToast(I18n.t('player.switchingQuality', 'Switching quality') + ': ' + variantName);
            self.currentPlayingStream = nextVariant;
            url = newUrl;
            var titleTextEl = document.getElementById('player-title-text');
            if (titleTextEl) titleTextEl.textContent = variantName;
            self.player.stop();
            setTimeout(function() {
                self.player.play(newUrl, true);
            }, 300);
            return;
        }
        window.log('PLAYER', 'No variants left, restarting same stream');
        self.showToast(I18n.t('player.reconnecting', 'Reconnecting...'), 3000, false, 'discreet');
        self.player.stop();
        setTimeout(function() {
            self.player.play(url, true);
        }, 300);
    };
    this.player.play(url, type === 'live', startPosition || 0);
    // Load EPG for live streams
    if (type === 'live') {
        this.loadEPG(streamId);
    }
};

IPTVApp.prototype.loadEPG = function(streamId) {
    var self = this;
    this.currentEPG = null;
    document.getElementById('player-epg').textContent = '';
    if (!this.api || !this.api.getEPG) return;
    this.api.getEPG(streamId).then(function(data) {
        if (!data || !data.epg_listings || data.epg_listings.length === 0) {
            return;
        }
        var now = Math.floor(Date.now() / 1000);
        var currentProgram = null;
        for (var i = 0; i < data.epg_listings.length; i++) {
            var prog = data.epg_listings[i];
            var start = parseInt(prog.start_timestamp, 10);
            var end = parseInt(prog.stop_timestamp, 10);
            if (now >= start && now < end) {
                currentProgram = prog;
                break;
            }
        }
        if (currentProgram) {
            try {
                // Decode base64 with UTF-8 support
                var title = decodeURIComponent(escape(atob(currentProgram.title)));
                self.currentEPG = {
                    title: title,
                    start: currentProgram.start,
                    end: currentProgram.end
                };
                document.getElementById('player-epg').textContent = title;
            }
            catch (e) {
                window.log('ERROR', 'EPG decode: ' + e);
            }
        }
    }).catch(function(e) {
        window.log('ERROR', 'EPG load: ' + e);
    });
};

IPTVApp.prototype.updateWatchPosition = function(stream, type, position, force) {
    var streamId = this.getStreamId(stream);
    var playlistId = stream._playlistId || (this.currentPlayingStream && this.currentPlayingStream._playlistId) || this.settings.activePlaylistId;
    for (var i = 0; i < this.watchHistory.length; i++) {
        if (this.watchHistory[i].id == streamId && this.watchHistory[i].playlistId == playlistId) {
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
    this.clearTimer('overlayTimer');
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
                var playlistId = this.currentPlayingStream._playlistId || this.settings.activePlaylistId;
                this.updateWatchHistoryProgress(streamId, currentPos, duration, playlistId);
            }
        }
    }
    this.currentPlayingStream = null;
    this.currentPlayingType = null;
    this.isBuffering = false;
    this.bufferPercent = undefined;
    this.setHidden('buffer-indicator', true);
    this.player.stop();
    this.resumePausedDownloads();
    // Show details for series/VOD (even if launched from history)
    var showDetails = this.selectedStream && (isSeries || this.selectedStream.type === 'vod');
    if (showDetails) {
        // If from history, need to prepare details screen first
        if (wasHistory && this.selectedStream.isFromHistory) {
            this.prepareDetailsFromHistory();
        }
        this.showScreen('details');
        this.currentScreen = 'details';
        this.focusArea = 'details';
        var selfTip = this;
        this._detailsTooltipTimer = setTimeout(function() {
            if (selfTip.currentScreen !== 'details') return;
            selfTip.showButtonTooltip('favorite-btn', 'favoriteTooltipShown', I18n.t('tips.favoriteHint', 'Add to your list'), 'bottom');
            var dlBtn = document.getElementById('download-btn');
            if (dlBtn && !dlBtn.classList.contains('hidden')) {
                selfTip.showButtonTooltip('download-btn', 'downloadTooltipShown', I18n.t('tips.downloadHint', 'Download to Freebox'), 'top');
            }
            var dlSeasonBtn = document.getElementById('download-season-btn');
            if (dlSeasonBtn) {
                selfTip.showButtonTooltip('download-season-btn', 'downloadSeasonTooltipShown', I18n.t('tips.downloadSeasonHint', 'Download season to Freebox'), 'top');
            }
        }, 1000);
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
            this.showHistoryScreen();
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
    var isCatchup = this.currentPlayingType === 'catchup';
    // Handle catchup: play next program
    if (isCatchup) {
        window.log('PLAYER', 'onPlaybackCompleted: catchup, calling playNextCatchup');
        this.playNextCatchup();
        return;
    }
    if (this.currentPlayingStream && !isSeries) {
        var completedPlaylistId = this.currentPlayingStream._playlistId || this.settings.activePlaylistId;
        this.markVodAsCompleted(this.getStreamId(this.currentPlayingStream), completedPlaylistId);
    }
    if (isSeries && this.currentEpisodeId) {
        this.markEpisodeAsCompleted(this.currentEpisodeId);
    }
    this.currentPlayingStream = null;
    this.currentPlayingType = null;
    this.isBuffering = false;
    this.bufferPercent = undefined;
    this.setHidden('buffer-indicator', true);
    this.player.stop();
    this.resumePausedDownloads();
    if (isSeries) {
        // Wait for series info if still loading (from history playback)
        window.log('onPlaybackCompleted: isSeries=true pendingPromise=' + !!this.pendingSeriesInfoPromise + ' hasSeriesInfo=' + !!this.currentSeriesInfo);
        if (this.pendingSeriesInfoPromise && !this.currentSeriesInfo) {
            window.log('PLAYER', 'onPlaybackCompleted: waiting for series info...');
            this.pendingSeriesInfoPromise.then(function() {
                window.log('PLAYER', 'onPlaybackCompleted: series info loaded, proceeding');
                self.proceedWithNextEpisode();
            }).catch(function(err) {
                window.log('ERROR', 'onPlaybackCompleted: series info failed: ' + err);
                self.proceedWithNextEpisode();
            });
        }
        else {
            this.proceedWithNextEpisode();
        }
    }
    else {
        var isVod = this.selectedStream && (this.selectedStream.type === 'vod' || this.selectedStream.type === 'movie');
        if (isVod) {
            this.showScreen('details');
            this.currentScreen = 'details';
            this.focusArea = 'details';
            this.updateVodButtons();
            this.focusIndex = this.getDetailsPlayIndex();
            this.updateFocus();
        }
        else {
            this.showScreen('browse');
            this.currentScreen = 'browse';
            this.setFocus('grid', 0);
        }
    }
};

IPTVApp.prototype.proceedWithNextEpisode = function() {
    var self = this;
    window.log('proceedWithNextEpisode: currentSeason=' + this.currentSeason + ' currentEpisodeNum=' + this.currentEpisodeNum + ' hasSeriesInfo=' + !!this.currentSeriesInfo);
    var next = this.getNextEpisode();
    window.log('proceedWithNextEpisode: next=' + JSON.stringify(next ? {season: next.season, ep: next.episode.episode_num} : null));
    if (next) {
        if (next.season !== this.currentSeason) {
            this.currentSeason = next.season;
        }
        setTimeout(function() {
            self.playNextEpisode(next.episode);
        }, 500);
        return;
    }
    // No more episodes, show details screen
    if (this.selectedStream && this.selectedStream.isFromHistory) {
        this.prepareDetailsFromHistory();
    }
    this.showScreen('details');
    this.currentScreen = 'details';
    this.focusArea = 'details';
    if (this.currentSeason) {
        this.selectSeason(this.currentSeason);
    }
    if (this.currentSeriesInfo) {
        this.updateSeriesContinueButton(this.currentSeriesInfo);
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
};

IPTVApp.prototype.playNextEpisode = function(episode) {
    this.currentEpisodeId = episode.id;
    this.currentEpisodeNum = parseInt(episode.episode_num) || 0;
    var historyPlaylistId = this.selectedStream._playlistId;
    var seriesId = this.selectedStream.seriesId;
    var stream = {
        stream_id: episode.id,
        series_id: seriesId,
        name: this.selectedStream.data.name,
        cover: this.selectedStream.data.cover || this.selectedStream.data.stream_icon,
        season: this.currentSeason,
        episode: episode.episode_num,
        episodeTitle: episode.title || (I18n.t('details.episode', 'Episode') + ' ' + episode.episode_num),
        container_extension: episode.container_extension,
        _playlistId: historyPlaylistId
    };
    // If from different playlist, build direct URL
    if (historyPlaylistId && historyPlaylistId !== this.settings.activePlaylistId) {
        var playlist = this.getPlaylistById(historyPlaylistId);
        if (playlist) {
            stream.url = this.buildStreamUrl(playlist, episode.id, 'episode');
            window.log('playNextEpisode: using direct URL for playlist ' + historyPlaylistId);
        }
    }
    this.addToWatchHistory(stream, 'series', 0);
    this._forceSeekToZero = true;
    this.playStream(episode.id, 'episode', stream, 0);
};

// Player UI
IPTVApp.prototype.setProgressBarWidth = function(percent) {
    document.getElementById('progress-bar').style.width = percent + '%';
};

IPTVApp.prototype.updatePlayerProgress = function(current, total) {
    if (this.seekDirection !== 0 || this.seekDebounceTimer || this._pendingSeekPosition !== undefined) {
        return;
    }
    // Don't update progress for live in timeshift - handled by updatePlayerStateIndicator
    if (this.currentPlayingType === 'live' && this.player.isInTimeshift) {
        return;
    }
    // For catchup: use program duration instead of player duration (which can be wrong)
    if (this.currentPlayingType === 'catchup' && this.catchupParams) {
        var programDuration = this.catchupParams.duration * 60 * 1000;
        if (this._catchupSeekTarget !== undefined && current > 0) {
            this._catchupBasePosition = current - this._catchupSeekTarget;
            window.log('Catchup base recalibrated after seek: current=' + current + ' target=' + this._catchupSeekTarget + ' newBase=' + this._catchupBasePosition);
            this._catchupSeekTarget = undefined;
        }
        else if (this._catchupBasePosition === null && current > 0) {
            this._catchupBasePosition = current;
            window.log('Catchup base position set: ' + current);
        }
        var relativePosition = this._catchupBasePosition !== null ? current - this._catchupBasePosition : current;
        relativePosition = Math.max(0, relativePosition);
        var isAberrant = relativePosition > programDuration + 10000;
        if (isAberrant) {
            if (this._catchupSeekTarget !== undefined && this._catchupSeekTime) {
                var elapsed = Date.now() - this._catchupSeekTime;
                relativePosition = this._catchupSeekTarget + elapsed;
                relativePosition = Math.min(relativePosition, programDuration);
            }
            else if (this._lastValidRelativePosition !== undefined) {
                relativePosition = this._lastValidRelativePosition;
            }
            else {
                return;
            }
        }
        else {
            this._lastValidRelativePosition = relativePosition;
            this._catchupSeekTarget = undefined;
            this._catchupSeekTime = undefined;
        }
        if (!this._catchupLogDone) {
            this._catchupLogDone = true;
            window.log('Catchup progress: current=' + current + ' base=' + this._catchupBasePosition + ' relative=' + relativePosition + ' programDuration=' + programDuration);
        }
        if (this.streamReady && !isAberrant) {
            this.seekTargetPosition = relativePosition;
        }
        var percent = programDuration > 0 ? (relativePosition / programDuration) * 100 : 0;
        percent = Math.min(100, percent);
        this.setProgressBarWidth(percent);
        var remaining = Math.max(0, programDuration - relativePosition);
        document.getElementById('player-time').textContent = this.player.formatTime(relativePosition);
        document.getElementById('player-remaining').textContent = this.player.formatTime(remaining);
        var catchupIndicator = document.getElementById('catchup-time-indicator');
        if (catchupIndicator) {
            var replayTime = new Date((this.catchupParams.start * 1000) + relativePosition);
            var locale = this.settings.locale || 'fr';
            catchupIndicator.textContent = replayTime.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
            catchupIndicator.style.left = percent + '%';
            this.setHidden(catchupIndicator, false);
        }
        var durationEl = document.getElementById('player-duration');
        if (durationEl && !durationEl.textContent) {
            durationEl.textContent = this.formatDuration(programDuration);
        }
        var timeSinceStart = Date.now() - (this._catchupStartTime || 0);
        if (!isAberrant && relativePosition > 0 && (programDuration - relativePosition) < 5000 && !this._completionTriggered && timeSinceStart > 5000) {
            window.log('Catchup near end: relative=' + relativePosition + ' duration=' + programDuration + ', playing next');
            this._completionTriggered = true;
            this.playNextCatchup();
        }
        return;
    }
    // Update seek position only when stream is ready (avoid stale values from previous stream)
    if (this.streamReady) {
        this.seekTargetPosition = current;
    }
    var percent = total > 0 ? (current / total) * 100 : 0;
    this.setProgressBarWidth(percent);
    var remaining = Math.max(0, total - current);
    document.getElementById('player-time').textContent = this.player.formatTime(current);
    document.getElementById('player-remaining').textContent = this.player.formatTime(remaining);
    // Update duration in title if not set yet
    var durationEl = document.getElementById('player-duration');
    if (durationEl && total > 0 && !durationEl.textContent) {
        durationEl.textContent = this.formatDuration(total);
    }
    // Detect near-end after seek: if within 2 seconds of end, trigger completion
    // This handles the case where seek overshoots and player freezes
    // Skip for live streams (transcoded fragments have short durations)
    var isLive = this.currentPlayingType === 'live';
    if (!isLive && total > 0 && current > 0 && (total - current) < 2000 && !this._completionTriggered) {
        window.log('Near end detected: current=' + current + ' total=' + total + ', triggering completion');
        this._completionTriggered = true;
        this.onPlaybackCompleted();
    }
};

IPTVApp.prototype.updatePlayerStateIndicator = function() {
    var self = this;
    var stateEl = document.getElementById('player-state');
    var bufferEl = document.getElementById('buffer-indicator');
    var liveBufferEl = document.getElementById('player-buffer');
    if (!stateEl) return;
    // Buffer indicator:
    //  - Initial load (before first playback): centered, large (default style)
    //  - Mid-playback rebuffer (>1s frozen): small at bottom-right
    //  - Otherwise: hidden
    var isSpeedUp = this.player && this.player.playbackSpeed > 1;
    var hasStarted = !!this.streamReady;
    var compactBR = false;
    var showBuffer = false;
    if (!hasStarted) {
        showBuffer = (this.bufferPercent !== undefined && this.bufferPercent < 100) || this.isBuffering;
    }
    else if (this.isBuffering) {
        if (!this._rebufferStartTime) {
            this._rebufferStartTime = Date.now();
        }
        if (Date.now() - this._rebufferStartTime >= 1000) {
            showBuffer = true;
            compactBR = true;
        }
    }
    else {
        this._rebufferStartTime = 0;
    }
    bufferEl.classList.toggle('compact', isSpeedUp && !compactBR);
    bufferEl.classList.toggle('compact-br', compactBR);
    if (showBuffer) {
        // Preserve hourglass span to avoid resetting CSS animation
        var hourglassSpan = bufferEl.querySelector('.hourglass');
        if (!hourglassSpan) {
            hourglassSpan = document.createElement('span');
            hourglassSpan.className = 'hourglass';
            hourglassSpan.textContent = '\u23F3';
            while (bufferEl.firstChild) bufferEl.removeChild(bufferEl.firstChild);
            bufferEl.appendChild(hourglassSpan);
        }
        // Update percentage text without recreating hourglass
        var percentText = '';
        if (this.bufferPercent !== undefined && this.bufferPercent < 100 && !isSpeedUp) {
            percentText = ' ' + this.bufferPercent + '%';
        }
        // Only update if changed to avoid unnecessary DOM manipulation
        var percentSpan = bufferEl.querySelector('.buffer-percent');
        if (percentText) {
            if (!percentSpan) {
                percentSpan = document.createElement('span');
                percentSpan.className = 'buffer-percent';
                bufferEl.appendChild(percentSpan);
            }
            if (percentSpan.textContent !== percentText) {
                percentSpan.textContent = percentText;
            }
        }
        else if (percentSpan) {
            percentSpan.remove();
        }
        this.setHidden(bufferEl, false);
    }
    else {
        this.setHidden(bufferEl, true);
    }
    // Live status button and pause duration
    var isLive = this.currentPlayingType === 'live' || (this.selectedStream && this.selectedStream.type === 'live');
    var statusBtn = document.getElementById('player-status-btn');
    var statusIcon = document.getElementById('player-status-icon');
    var statusLabel = document.getElementById('player-status-label');
    var liveBtnEl = document.getElementById('player-live-btn');
    var formatBtnEl = document.getElementById('player-format-btn');
    var formatLabelEl = document.getElementById('player-format-label');
    var autoFormatBtnEl = document.getElementById('player-auto-format-btn');
    var autoFormatIconEl = document.getElementById('player-auto-format-icon');
    var durationEl = document.getElementById('player-duration');
    if (formatBtnEl) this.setHidden(formatBtnEl, !isLive);
    if (formatLabelEl) formatLabelEl.textContent = (this.settings.liveFormat || 'ts').toUpperCase();
    if (autoFormatBtnEl) this.setHidden(autoFormatBtnEl, !isLive);
    if (autoFormatIconEl) {
        var autoOn = this.settings.liveAutoFormatSwitch !== false;
        autoFormatIconEl.textContent = autoOn ? 'sync' : 'sync_disabled';
        if (autoFormatBtnEl) autoFormatBtnEl.classList.toggle('disabled-state', !autoOn);
    }
    this.updateLiveVariantButton();
    if (isLive) {
        // Hide progress row for live (status shown in tracks)
        var progressRowEl = document.getElementById('player-progress-row');
        if (progressRowEl) progressRowEl.style.display = 'none';
        if (durationEl) durationEl.style.display = 'none';
        // Update status button
        if (statusBtn) {
            this.setHidden(statusBtn, false);
            if (this.player.isPaused) {
                statusBtn.className = 'player-track-btn focusable status-paused';
                statusIcon.textContent = 'pause';
                var pauseText = I18n.t('player.pauseDuration', 'Pause');
                if (this.player.isInTimeshift) {
                    var bufferInfo = this.player.getBufferInfo();
                    if (bufferInfo.available && bufferInfo.seconds > 0) {
                        var colon = I18n.getLocale() === 'fr' ? '\u00A0: ' : ': ';
                        pauseText += colon + this.player.formatTime(bufferInfo.seconds * 1000);
                    }
                }
                statusLabel.textContent = pauseText;
                if (liveBtnEl) this.setHidden(liveBtnEl, false);
            }
            else if (this.player.isInTimeshift) {
                statusBtn.className = 'player-track-btn focusable status-playing';
                statusIcon.textContent = 'play_arrow';
                var bufferInfo = this.player.getBufferInfo();
                var timeshiftText = I18n.t('player.live', 'En direct');
                if (bufferInfo.available && bufferInfo.seconds > 0) {
                    var colon = I18n.getLocale() === 'fr' ? '\u00A0: ' : ': ';
                    timeshiftText = I18n.t('player.timeshift', 'Diff\u00e9r\u00e9') + colon + this.player.formatTime(bufferInfo.seconds * 1000);
                }
                statusLabel.textContent = timeshiftText;
                if (liveBtnEl) this.setHidden(liveBtnEl, false);
            }
            else {
                statusBtn.className = 'player-track-btn focusable status-playing';
                statusIcon.textContent = 'play_arrow';
                statusLabel.textContent = I18n.t('player.live', 'En direct');
                if (liveBtnEl) this.setHidden(liveBtnEl, true);
            }
        }
        // Hide old buffer element for live
        if (liveBufferEl) this.setHidden(liveBufferEl, true);
    }
    else {
        if (statusBtn) this.setHidden(statusBtn, true);
        if (liveBtnEl) this.setHidden(liveBtnEl, true);
        if (liveBufferEl) this.setHidden(liveBufferEl, true);
    }
    // Playback state indicator (in overlay, for non-live)
    if (this.seekDirection !== 0 || this.seekDebounceTimer) {
        stateEl.textContent = this.wasPlaying ? '\u25B6' : '\u275A\u275A';
    }
    else if (this.player.isPaused) {
        stateEl.textContent = '\u275A\u275A';
    }
    else {
        stateEl.textContent = '\u25B6';
        this.bufferPercent = undefined;
    }
};

IPTVApp.prototype.showPlayerOverlay = function(extendedDelay) {
    var self = this;
    var hideDelay = extendedDelay ? 8000 : 5000;
    var overlay = document.getElementById('player-overlay');
    var titleEl = document.getElementById('player-title');
    var topRightEl = document.getElementById('player-top-right');
    var qualityEl = document.getElementById('player-quality');
    var progressRowEl = document.getElementById('player-progress-row');
    var durationEl = document.getElementById('player-duration');
    // Use currentPlayingType to check for live (catchup has progress bar)
    var isLive = this.currentPlayingType === 'live';
    this.setHidden(overlay, false);
    if (topRightEl) this.setHidden(topRightEl, false);
    this.setHidden(titleEl, false);
    var backBtn = document.getElementById('android-back-btn');
    if (backBtn) backBtn.style.display = 'flex';
    // Hide progress row for live streams (status is shown via status-btn in tracks)
    if (progressRowEl) progressRowEl.style.display = isLive ? 'none' : '';
    if (durationEl) durationEl.style.display = isLive ? 'none' : '';
    var streamData = this.currentPlayingStream || (this.selectedStream && this.selectedStream.data);
    if (streamData) {
        var title = streamData.name || streamData.title || '';
        var displayTitle = title;
        // For catchup, show program title instead of channel name
        if (this.currentPlayingType === 'catchup' && this.catchupPlaylist && this.catchupPlaylistIndex !== undefined) {
            var program = this.catchupPlaylist[this.catchupPlaylistIndex];
            if (program && program.title) {
                try {
                    var programTitle = decodeURIComponent(escape(atob(program.title)));
                    var channelName = this.stripCategoryPrefix(streamData.name || '');
                    var locale = this.settings.locale || 'fr';
                    var startTime = new Date(parseInt(program.start_timestamp, 10) * 1000);
                    var endTime = new Date(parseInt(program.stop_timestamp, 10) * 1000);
                    var timeRange = startTime.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) +
                        ' - ' + endTime.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
                    displayTitle = programTitle + ' (' + timeRange + ') - ' + channelName;
                }
                catch (e) {
                    displayTitle = this.cleanTitle(title);
                }
            }
        }
        else {
            var year = this.extractYear(title);
            if (!year && this.tmdbInfo) {
                var dateStr = this.tmdbInfo.release_date || this.tmdbInfo.first_air_date;
                if (dateStr) {
                    year = dateStr.substring(0, 4);
                }
            }
            displayTitle = this.cleanTitle(title);
            if (year && displayTitle.indexOf('(' + year + ')') === -1) {
                displayTitle += ' (' + year + ')';
            }
            // Add season/episode info for series
            if (streamData.season && streamData.episode) {
                var s = streamData.season < 10 ? '0' + streamData.season : streamData.season;
                var e = streamData.episode < 10 ? '0' + streamData.episode : streamData.episode;
                displayTitle += ' - S' + s + 'E' + e;
            }
        }
        document.getElementById('player-title-text').textContent = displayTitle;
        // Show duration next to title for non-live streams
        var durationEl = document.getElementById('player-duration');
        if (durationEl && !isLive && this.player.duration > 0) {
            durationEl.textContent = this.formatDuration(this.player.duration);
        }
        else if (durationEl) {
            durationEl.textContent = '';
        }
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
    if (this.overlayTimer) {
        clearTimeout(this.overlayTimer);
    }
    var self = this;
    var isBuffering = this.isBuffering || (this.bufferPercent !== undefined && this.bufferPercent < 100);
    var isInTracksModal = this.focusArea === 'tracks' || this.focusArea === 'sub-options';
    if (!isBuffering && !isInTracksModal) {
        this.overlayTimer = setTimeout(function() {
            self.hideSubtitleTooltip();
            self.hideQualityTooltip();
            self.setHidden(overlay, true);
            self.setHidden(titleEl, true);
            if (topRightEl) self.setHidden(topRightEl, true);
            var backBtn = document.getElementById('android-back-btn');
            if (backBtn && self.currentScreen === 'player') backBtn.style.display = 'none';
            self.playerTracksFocused = false;
            var btns = document.querySelectorAll('.player-track-btn');
            for (var i = 0; i < btns.length; i++) {
                btns[i].classList.remove('focused');
            }
        }, hideDelay);
    }
};

// Track selection
IPTVApp.prototype.updatePlayerTracks = function() {
    if (!this.player.isPlaying) return;
    var tracks = this.player.getTracks();
    var tracksDiv = document.getElementById('player-tracks');
    var audioBtn = document.getElementById('player-audio-btn');
    var subtitleBtn = document.getElementById('player-subtitle-btn');
    var optionsBtn = document.getElementById('player-sub-options-btn');
    var replayBtn = document.getElementById('player-replay-btn');
    // Auto-select audio track matching interface language (only first time)
    if (!this._audioAutoSelected && tracks.audio.length > 1) {
        this.autoSelectAudioTrack(tracks.audio);
        this._audioAutoSelected = true;
    }
    // Auto-select subtitle track matching provider language (only first time, if enabled)
    if (!this._subtitleAutoSelected && tracks.subtitle.length > 0) {
        if (this.autoSelectSubtitleTrack(tracks.subtitle)) {
            this._subtitleAutoSelected = true;
        }
    }
    this.availableTracks = tracks;
    var isCatchup = this.currentPlayingType === 'catchup';
    var visibleButtons = 0;
    if (tracks.audio.length > 1) {
        this.setHidden(audioBtn, false);
        visibleButtons++;
        var audioLabel = tracks.audio[this.currentAudioIndex || 0];
        document.getElementById('player-audio-label').textContent = audioLabel ? audioLabel.language : 'Audio';
    }
    else {
        this.setHidden(audioBtn, true);
    }
    if (tracks.subtitle.length > 0) {
        this.setHidden(subtitleBtn, false);
        visibleButtons++;
        var subIdx = this.currentSubtitleIndex;
        var subLabel = subIdx === -1 ? I18n.t('player.disabled', 'Disabled') : (subIdx === -2 ? I18n.t('player.external', 'External') : (tracks.subtitle[subIdx] ? tracks.subtitle[subIdx].language : I18n.t('player.subtitlesLabel', 'Subtitles')));
        document.getElementById('player-subtitle-label').textContent = subLabel;
        if (this._subtitleAutoSelected && !this._subTooltipTriggered) {
            this._subTooltipTriggered = true;
            var self2 = this;
            setTimeout(function() { self2.showSubtitleTooltip(); }, 1000);
        }
    }
    else {
        this.setHidden(subtitleBtn, true);
    }
    if (this.currentSubtitleIndex === -2) {
        this.setHidden(optionsBtn, false);
        visibleButtons++;
    }
    else {
        this.setHidden(optionsBtn, true);
    }
    // Show replay button only for live streams with tv_archive enabled
    var stream = this.currentPlayingStream;
    var isLive = this.currentPlayingType === 'live';
    var hasReplay = stream && stream.tv_archive === 1;
    if (isLive && hasReplay && replayBtn) {
        this.setHidden(replayBtn, false);
        visibleButtons++;
    }
    else if (replayBtn) {
        this.setHidden(replayBtn, true);
    }
    // Status btn and Direct btn are managed by updatePlayerStateIndicator
    // Count them as visible for live
    if (isLive) {
        visibleButtons++;
    }
    // Hide speed button for live streams (speed control doesn't work on live)
    var speedBtn = document.getElementById('player-speed-btn');
    if (speedBtn) {
        this.setHidden(speedBtn, isLive);
        if (!isLive) visibleButtons++;
    }
    var displayBtn = document.getElementById('player-display-btn');
    if (displayBtn) {
        var displayUseful = this.player.isDisplayModeUseful();
        this.setHidden(displayBtn, !displayUseful);
        if (displayUseful) visibleButtons++;
    }
    if (visibleButtons === 0) {
        this.setHidden(tracksDiv, true);
    }
    else {
        this.setHidden(tracksDiv, false);
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

// Auto-select audio track matching interface language (prefer most channels)
IPTVApp.prototype.autoSelectAudioTrack = function(audioTracks) {
    if (!audioTracks || audioTracks.length <= 1) return;
    var locale = this.settings.locale || 'en';
    var langCodes = I18n.getIso639Codes(locale);
    window.log('autoSelectAudioTrack: locale=' + locale + ' codes=' + langCodes.join(',') + ' tracks=' + audioTracks.length);
    var self = this;
    var selectBestFromCandidates = function(candidates) {
        if (candidates.length === 0) return false;
        candidates.sort(function(a, b) {
            return (parseInt(b.track.channels) || 2) - (parseInt(a.track.channels) || 2);
        });
        var best = candidates[0];
        window.log('autoSelectAudioTrack: selected index ' + best.i + ' lang=' + (best.track.lang || best.track.language) + ' channels=' + (best.track.channels || '?'));
        if (best.i !== (self.currentAudioIndex || 0)) {
            self.currentAudioIndex = best.i;
            self.player.setAudioTrack(best.track.index);
        }
        return true;
    };
    // First pass: exact match on lang code
    var candidates = [];
    for (var i = 0; i < audioTracks.length; i++) {
        var trackLang = (audioTracks[i].lang || '').toLowerCase();
        for (var j = 0; j < langCodes.length; j++) {
            if (trackLang === langCodes[j].toLowerCase()) {
                candidates.push({ i: i, track: audioTracks[i] });
                break;
            }
        }
    }
    if (selectBestFromCandidates(candidates)) return;
    // Second pass: partial match (lang code starts with or contains)
    candidates = [];
    for (var i = 0; i < audioTracks.length; i++) {
        var trackLang = (audioTracks[i].lang || '').toLowerCase();
        for (var j = 0; j < langCodes.length; j++) {
            var code = langCodes[j].toLowerCase();
            if (trackLang.indexOf(code) !== -1 || code.indexOf(trackLang) !== -1) {
                candidates.push({ i: i, track: audioTracks[i] });
                break;
            }
        }
    }
    if (selectBestFromCandidates(candidates)) return;
    // Third pass: match on formatted language label
    var targetLabels = langCodes.map(function(c) { return c.toLowerCase(); });
    candidates = [];
    for (var i = 0; i < audioTracks.length; i++) {
        var label = (audioTracks[i].language || '').toLowerCase();
        for (var j = 0; j < targetLabels.length; j++) {
            if (label.indexOf(targetLabels[j]) !== -1) {
                candidates.push({ i: i, track: audioTracks[i] });
                break;
            }
        }
    }
    if (selectBestFromCandidates(candidates)) return;
    // No language match: select track with most channels
    window.log('PLAYER', 'autoSelectAudioTrack: no lang match, selecting best channels');
    var allCandidates = audioTracks.map(function(t, idx) { return { i: idx, track: t }; });
    selectBestFromCandidates(allCandidates);
};

IPTVApp.prototype.getSubtitleLangCodes = function(locale) {
    return I18n.getIso639Codes(locale);
};

IPTVApp.prototype.autoEnableForcedSubtitles = function() {
    // Only auto-enable if no subtitle was manually selected
    if (this.currentSubtitleIndex !== undefined && this.currentSubtitleIndex !== -1) {
        return;
    }
    var tracks = this.player.getTracks();
    if (!tracks.subtitle || tracks.subtitle.length === 0) {
        return;
    }
    var appLocale = (this.settings.locale || I18n.getLocale() || 'en').toLowerCase();
    var targetLangs = this.getSubtitleLangCodes(appLocale);
    // Find forced subtitle matching app language
    for (var i = 0; i < tracks.subtitle.length; i++) {
        var track = tracks.subtitle[i];
        if (!track.forced) {
            continue;
        }
        var trackLang = (track.lang || '').toLowerCase();
        for (var j = 0; j < targetLangs.length; j++) {
            if (trackLang.indexOf(targetLangs[j]) !== -1) {
                window.log('Auto-enabling forced subtitle: ' + track.lang + ' (index ' + i + ')');
                this.currentSubtitleIndex = i;
                this.player.setSubtitleTrack(track.index);
                this.player.showSubtitles();
                return;
            }
        }
    }
};

// Auto-select first subtitle matching playlist's default language (if configured)
IPTVApp.prototype.getSeriesSubtitlePref = function() {
    var stream = this.currentPlayingStream;
    if (!stream) return null;
    var contentId = stream.series_id || stream.stream_id;
    if (!contentId) return null;
    var key = 'subPref_' + (stream._playlistId || this.settings.activePlaylistId) + '_' + contentId;
    var val = localStorage.getItem(key);
    if (!val) return null;
    try {
        return JSON.parse(val);
    }
    catch (ex) {
        return null;
    }
};

IPTVApp.prototype.saveSeriesSubtitlePref = function(lang) {
    var stream = this.currentPlayingStream;
    if (!stream) return;
    var contentId = stream.series_id || stream.stream_id;
    if (!contentId) return;
    var key = 'subPref_' + (stream._playlistId || this.settings.activePlaylistId) + '_' + contentId;
    localStorage.setItem(key, JSON.stringify({ lang: lang }));
    window.log('SUBTITLE', 'saved pref: ' + lang + ' for ' + contentId);
};

IPTVApp.prototype.autoSelectSubtitleTrack = function(subtitleTracks) {
    var seriesPref = this.getSeriesSubtitlePref();
    if (seriesPref) {
        if (seriesPref.lang === 'disabled') {
            window.log('autoSelectSubtitleTrack: pref is disabled');
            this.currentSubtitleIndex = -1;
            this._subtitleManuallySelected = false;
            return true;
        }
        if (subtitleTracks && subtitleTracks.length > 0) {
            for (var i = 0; i < subtitleTracks.length; i++) {
                var trackLang = (subtitleTracks[i].lang || '').toLowerCase();
                if (trackLang.indexOf(seriesPref.lang) !== -1) {
                    window.log('autoSelectSubtitleTrack: series pref match at index ' + i + ' lang=' + trackLang);
                    this.currentSubtitleIndex = i;
                    this._subtitleManuallySelected = false;
                    this.player.setSubtitleTrack(subtitleTracks[i].index);
                    this.player.showSubtitles();
                    return true;
                }
            }
        }
        window.log('autoSelectSubtitleTrack: series pref lang=' + seriesPref.lang + ' not found in tracks');
    }
    // Get default subtitle language from active playlist
    var activePlaylist = this.getActivePlaylist();
    var defaultLang = activePlaylist ? activePlaylist.defaultSubtitleLang : '';
    if (!defaultLang) {
        return false;
    }
    // Only auto-select if no subtitle was already selected
    if (this.currentSubtitleIndex !== undefined && this.currentSubtitleIndex !== -1) {
        return false;
    }
    if (!subtitleTracks || subtitleTracks.length === 0) {
        return false;
    }
    var targetLangs = this.getSubtitleLangCodes(defaultLang.toLowerCase());
    for (var i = 0; i < subtitleTracks.length; i++) {
        var track = subtitleTracks[i];
        if (track.forced) continue;
        var trackLang = (track.lang || '').toLowerCase();
        for (var j = 0; j < targetLangs.length; j++) {
            if (trackLang.indexOf(targetLangs[j]) !== -1) {
                window.log('autoSelectSubtitleTrack: found match at index ' + i + ' lang=' + trackLang);
                this.currentSubtitleIndex = i;
                this._subtitleManuallySelected = false;
                this.player.setSubtitleTrack(track.index);
                this.player.showSubtitles();
                return true;
            }
        }
    }
    window.log('PLAYER', 'autoSelectSubtitleTrack: no match found');
    return false;
};

IPTVApp.prototype.focusPlayerTracks = function() {
    this.playerTracksFocused = true;
    this.playerTrackIndex = 0;
    this.updatePlayerTracksFocus();
};

IPTVApp.prototype.showSubtitleTooltip = function() {
    try {
        if (localStorage.getItem('subTooltipShown')) return;
    }
    catch (ex) { return; }
    var subBtn = document.getElementById('player-subtitle-btn');
    if (!subBtn) return;
    this.hideSubtitleTooltip();
    var tooltip = document.createElement('div');
    tooltip.className = 'tts-tooltip';
    tooltip.id = 'subtitle-tooltip';
    tooltip.textContent = I18n.t('tips.subtitleHint', 'Click to disable, click again to change');
    var rect = subBtn.getBoundingClientRect();
    tooltip.style.position = 'fixed';
    tooltip.style.top = (rect.top - 55) + 'px';
    tooltip.style.left = (rect.left + rect.width / 2) + 'px';
    tooltip.style.transform = 'translateX(-50%)';
    document.body.appendChild(tooltip);
    this._subTooltip = tooltip;
    setTimeout(function() { tooltip.classList.add('visible'); }, 300);
};

IPTVApp.prototype.hideSubtitleTooltip = function() {
    if (this._subTooltip) {
        this._subTooltip.remove();
        this._subTooltip = null;
        try { localStorage.setItem('subTooltipShown', '1'); }
        catch (ex) { /* ignore */ }
    }
};

IPTVApp.prototype.showQualityTooltip = function() {
    try {
        if (localStorage.getItem('qualityTooltipShown')) {
            window.log('TIP', 'qualityTooltip skipped (already shown)');
            return;
        }
    }
    catch (ex) { return; }
    var qBtn = document.getElementById('player-quality-btn');
    if (!qBtn || qBtn.classList.contains('hidden')) {
        window.log('TIP', 'qualityTooltip skipped (btn hidden=' + (qBtn ? qBtn.classList.contains('hidden') : 'noBtn') + ')');
        return;
    }
    this.hideQualityTooltip();
    var tooltip = document.createElement('div');
    tooltip.className = 'tts-tooltip';
    tooltip.id = 'quality-tooltip';
    tooltip.textContent = I18n.t('tips.qualityHint', 'Click to switch resolution');
    tooltip.style.position = 'fixed';
    document.body.appendChild(tooltip);
    this._qualityTooltip = tooltip;
    var ARROW_OFFSET_FROM_RIGHT = 30;
    var updatePos = function() {
        var b = document.getElementById('player-quality-btn');
        if (!b || b.classList.contains('hidden')) return;
        var rect = b.getBoundingClientRect();
        tooltip.style.top = (rect.top - 55) + 'px';
        tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth + ARROW_OFFSET_FROM_RIGHT) + 'px';
    };
    updatePos();
    this._qualityTooltipPosTimer = setInterval(updatePos, 100);
    window.log('TIP', 'qualityTooltip shown');
    setTimeout(function() { tooltip.classList.add('visible'); }, 300);
};

IPTVApp.prototype.hideQualityTooltip = function(persistDismissed) {
    if (this._qualityTooltipPosTimer) {
        clearInterval(this._qualityTooltipPosTimer);
        this._qualityTooltipPosTimer = null;
    }
    if (this._qualityTooltip) {
        this._qualityTooltip.remove();
        this._qualityTooltip = null;
    }
    if (persistDismissed) {
        try { localStorage.setItem('qualityTooltipShown', '1'); }
        catch (ex) { /* ignore */ }
    }
};

IPTVApp.MAX_TOOLTIP_AUTO_SHOWS = 3;

IPTVApp.prototype.showButtonTooltip = function(buttonId, storageKey, message, placement) {
    var stored;
    try {
        stored = localStorage.getItem(storageKey);
    }
    catch (ex) { return; }
    if (stored === '1' || stored === 'done') return;
    var shownCount = 0;
    if (stored && stored.indexOf('shown:') === 0) {
        shownCount = parseInt(stored.substring(6), 10) || 0;
    }
    if (shownCount >= IPTVApp.MAX_TOOLTIP_AUTO_SHOWS) {
        try { localStorage.setItem(storageKey, 'done'); }
        catch (ex) { /* ignore */ }
        return;
    }
    var btn = document.getElementById(buttonId);
    if (!btn || btn.classList.contains('hidden')) return;
    try { localStorage.setItem(storageKey, 'shown:' + (shownCount + 1)); }
    catch (ex) { /* ignore */ }
    if (!this._buttonTooltipStorageKeys) this._buttonTooltipStorageKeys = {};
    this._buttonTooltipStorageKeys[buttonId] = storageKey;
    this.hideButtonTooltip(buttonId);
    var below = placement === 'bottom';
    var tooltip = document.createElement('div');
    tooltip.className = 'tts-tooltip' + (below ? ' below' : '');
    tooltip.textContent = message;
    tooltip.style.position = 'fixed';
    document.body.appendChild(tooltip);
    if (!this._buttonTooltips) this._buttonTooltips = {};
    // Arrow tip is at right:30px + 10px (offset from element edge to triangle apex)
    var ARROW_CENTER_FROM_RIGHT = 40;
    var MIN_TOP = 10;
    var updatePos = function() {
        var b = document.getElementById(buttonId);
        if (!b || b.classList.contains('hidden')) return;
        var r = b.getBoundingClientRect();
        var top;
        if (below) {
            top = r.bottom + 15;
        }
        else {
            top = r.top - tooltip.offsetHeight - 15;
            if (top < MIN_TOP) top = MIN_TOP;
        }
        tooltip.style.top = top + 'px';
        tooltip.style.left = (r.left + r.width / 2 - tooltip.offsetWidth + ARROW_CENTER_FROM_RIGHT) + 'px';
    };
    updatePos();
    var posTimer = setInterval(updatePos, 100);
    this._buttonTooltips[buttonId] = { el: tooltip, posTimer: posTimer, storageKey: storageKey, below: below };
    setTimeout(function() { tooltip.classList.add('visible'); }, 300);
};

IPTVApp.prototype.hideButtonTooltip = function(buttonId, persistDismissed) {
    var t = this._buttonTooltips && this._buttonTooltips[buttonId];
    if (t) {
        if (t.posTimer) clearInterval(t.posTimer);
        if (t.el) t.el.remove();
        delete this._buttonTooltips[buttonId];
    }
    if (persistDismissed) {
        var key = this._buttonTooltipStorageKeys && this._buttonTooltipStorageKeys[buttonId];
        if (key) {
            try { localStorage.setItem(key, 'done'); }
            catch (ex) { /* ignore */ }
        }
    }
};

IPTVApp.prototype.hideAllButtonTooltips = function() {
    if (!this._buttonTooltips) return;
    var keys = Object.keys(this._buttonTooltips);
    for (var i = 0; i < keys.length; i++) {
        this.hideButtonTooltip(keys[i]);
    }
};

IPTVApp.prototype.unfocusPlayerTracks = function(hideOverlay) {
    this.playerTracksFocused = false;
    document.querySelectorAll('.player-track-btn').forEach(function(el) {
        el.classList.remove('focused');
    });
    if (hideOverlay) {
        this.hideSubtitleTooltip();
        var overlay = document.getElementById('player-overlay');
        var titleEl = document.getElementById('player-title');
        var topRightEl = document.getElementById('player-top-right');
        if (overlay) this.setHidden(overlay, true);
        if (titleEl) this.setHidden(titleEl, true);
        if (topRightEl) this.setHidden(topRightEl, true);
    } else {
        // Restart overlay hide timer
        this.showPlayerOverlay();
    }
};

IPTVApp.prototype.updatePlayerTracksFocus = function() {
    var btns = document.querySelectorAll('#player-tracks .player-track-btn.focusable:not(.hidden)');
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
            document.getElementById('player-subtitle-label').textContent = I18n.t('player.disabled', 'Disabled');
        }
        else {
            this.player.setSubtitleTrack(tracks.subtitle[this.currentSubtitleIndex].index);
            this.player.showSubtitles();
            document.getElementById('player-subtitle-label').textContent = tracks.subtitle[this.currentSubtitleIndex].language;
        }
    }
};

IPTVApp.prototype.toggleSubtitles = function() {
    if (this.player.subtitlesEnabled) {
        this._subtitleIndexBeforeDisable = this.currentSubtitleIndex;
        this.player.hideSubtitles();
        this.currentSubtitleIndex = -1;
        this.saveSeriesSubtitlePref('disabled');
        document.getElementById('player-subtitle-label').textContent = I18n.t('player.disabled', 'Disabled');
    }
    else {
        var restoreIdx = this._subtitleIndexBeforeDisable;
        var tracks = this.availableTracks;
        if (restoreIdx !== undefined && restoreIdx >= 0 && tracks && tracks.subtitle[restoreIdx]) {
            this.currentSubtitleIndex = restoreIdx;
            this.player.setSubtitleTrack(tracks.subtitle[restoreIdx].index);
            this.player.showSubtitles();
            document.getElementById('player-subtitle-label').textContent = tracks.subtitle[restoreIdx].language;
        }
        else if (restoreIdx === -2 && this.externalSubtitles) {
            this.currentSubtitleIndex = -2;
            this.player.showSubtitles();
            document.getElementById('player-subtitle-label').textContent = I18n.t('player.external', 'External');
        }
        else if (tracks && tracks.subtitle.length > 0) {
            this.currentSubtitleIndex = 0;
            this.player.setSubtitleTrack(tracks.subtitle[0].index);
            this.player.showSubtitles();
            document.getElementById('player-subtitle-label').textContent = tracks.subtitle[0].language;
        }
    }
    this.showPlayerOverlay();
};
IPTVApp.prototype.handlePlayerDown = function() {
    this.showPlayerOverlay();
    var tracksDiv = document.getElementById('player-tracks');
    if (!tracksDiv.classList.contains('hidden')) {
        this.focusPlayerTracks();
    }
};

IPTVApp.prototype.navigatePlayerTracks = function(direction) {
    var btns = document.querySelectorAll('#player-tracks .player-track-btn.focusable:not(.hidden)');
    if (btns.length === 0) return;
    var newIndex = this.playerTrackIndex + direction;
    var isLive = this.currentPlayingType === 'live';
    if (newIndex < 0) {
        if (!isLive) this.startSeek(-1);
        return;
    }
    if (newIndex >= btns.length) {
        if (!isLive) this.startSeek(1);
        return;
    }
    this.playerTrackIndex = newIndex;
    this.updatePlayerTracksFocus();
    this.showPlayerOverlay();
};

IPTVApp.prototype.selectPlayerTrack = function() {
    var btns = document.querySelectorAll('#player-tracks .player-track-btn.focusable:not(.hidden)');
    if (!btns[this.playerTrackIndex]) return;
    var btn = btns[this.playerTrackIndex];
    if (btn.id === 'player-status-btn') {
        this.player.togglePlayPause();
    }
    else if (btn.id === 'player-audio-btn') {
        this.showTrackSelectionModal('audio');
    }
    else if (btn.id === 'player-subtitle-btn') {
        this.hideSubtitleTooltip();
        if (this.player.subtitlesEnabled && !this._subtitleManuallySelected) {
            this.toggleSubtitles();
        } else {
            this.showTrackSelectionModal('subtitle');
        }
    }
    else if (btn.id === 'player-sub-options-btn') {
        this.showSubtitleOptionsModal();
    }
    else if (btn.id === 'player-replay-btn') {
        this.openReplayFromPlayer();
    }
    else if (btn.id === 'player-live-btn') {
        this.returnToLive();
    }
    else if (btn.id === 'player-format-btn') {
        this.toggleLiveFormat();
    }
    else if (btn.id === 'player-auto-format-btn') {
        this.toggleLiveAutoFormatSwitch();
    }
    else if (btn.id === 'player-quality-btn') {
        this.hideQualityTooltip(true);
        this.cycleLiveVariant();
    }
    else if (btn.id === 'player-speed-btn') {
        this.cyclePlaybackSpeed();
    }
    else if (btn.id === 'player-display-btn') {
        this.cycleDisplayMode();
    }
    this.showPlayerOverlay();
};

IPTVApp.prototype.openReplayFromPlayer = function() {
    window.log('ACTION', 'openReplayFromPlayer');
    var stream = this.currentPlayingStream;
    if (!stream || this.currentPlayingType !== 'live') return;
    this.returnToLiveAfterCatchup = true;
    this._replayFromPlayer = true;
    this.unfocusPlayerTracks(true);
    this.showCatchupModal(stream);
};

// Playback speed cycling
// AVPlay: 1, 2, 4, 8 (negative for rewind not useful for normal use)
// HTML5: 0.5, 0.75, 1, 1.25, 1.5, 2
IPTVApp.prototype.cyclePlaybackSpeed = function() {
    var speeds = this.player.useHtml5 ? [0.5, 0.75, 1, 1.25, 1.5, 2] : [1, 2, 4, 8];
    var current = this.player.getSpeed();
    var idx = speeds.indexOf(current);
    var next = speeds[(idx + 1) % speeds.length];
    window.log('ACTION cyclePlaybackSpeed: ' + current + ' -> ' + next);
    this.player.setSpeed(next);
    this.updateSpeedLabel();
};

IPTVApp.prototype.updateSpeedLabel = function() {
    var label = document.getElementById('player-speed-label');
    if (label) {
        var speed = this.player.getSpeed();
        label.textContent = '×' + speed;
    }
};

IPTVApp.prototype.cycleLiveVariant = function() {
    var stream = this.currentPlayingStream;
    if (!stream) return;
    var variants = this._variantsCache && this._variantsCacheKey === (stream.stream_id + '_' + (stream._playlistId || ''))
        ? this._variantsCache
        : this.findAllLiveVariants(stream);
    if (variants.length <= 1) return;
    var currentIdx = -1;
    for (var i = 0; i < variants.length; i++) {
        if (variants[i].stream_id === stream.stream_id && variants[i]._playlistId === stream._playlistId) {
            currentIdx = i;
            break;
        }
    }
    var nextIdx = (currentIdx + 1) % variants.length;
    var next = variants[nextIdx];
    var nextName = this.getStreamTitle(next);
    window.log('ACTION', 'cycleLiveVariant: ' + this.getStreamTitle(stream) + ' -> ' + nextName);
    this.showToast(nextName, 2000);
    this.playStream(next.stream_id, 'live', next);
    var self = this;
    setTimeout(function() {
        if (self.currentScreen === 'player') self.showPlayerOverlay();
    }, 500);
};

IPTVApp.prototype.updateBandwidthDisplay = function() {
    var el = document.getElementById('player-bandwidth');
    if (!el) return;
    if (!this.player || !this.player.getBandwidth) {
        el.textContent = '';
        return;
    }
    var bps = this.player.getBandwidth();
    if (!bps || bps <= 0) {
        el.textContent = '';
        return;
    }
    var label;
    if (bps >= 1000000) {
        label = (bps / 1000000).toFixed(1) + ' Mbps';
    }
    else {
        label = Math.round(bps / 1000) + ' kbps';
    }
    el.textContent = label;
};

IPTVApp.prototype.updateLiveVariantButton = function() {
    var btn = document.getElementById('player-quality-btn');
    var label = document.getElementById('player-quality-label');
    if (!btn || !label) return;
    var stream = this.currentPlayingStream;
    var isLive = this.currentPlayingType === 'live';
    if (!isLive || !stream) {
        this.setHidden(btn, true);
        return;
    }
    var cacheKey = stream.stream_id + '_' + (stream._playlistId || '');
    if (this._variantsCacheKey !== cacheKey) {
        this._variantsCacheKey = cacheKey;
        this._variantsCache = this.findAllLiveVariants(stream);
    }
    if (!this._variantsCache || this._variantsCache.length <= 1) {
        this.setHidden(btn, true);
        return;
    }
    this.setHidden(btn, false);
    var tag = this.getLiveQualityTag(this.getStreamTitle(stream));
    label.textContent = tag || 'AUTO';
    if (!this._qualityTooltipTriggered) {
        this._qualityTooltipTriggered = true;
        var self = this;
        setTimeout(function() { self.showQualityTooltip(); }, 1000);
    }
};

// Display mode cycling: auto -> letterbox -> stretch -> zoom
IPTVApp.prototype.toggleLiveFormat = function() {
    var current = this.settings.liveFormat || 'ts';
    var next = current === 'ts' ? 'm3u8' : 'ts';
    window.log('ACTION', 'toggleLiveFormat: ' + current + ' -> ' + next);
    this.settings.liveFormat = next;
    this.saveSettings();
    var label = document.getElementById('player-format-label');
    if (label) label.textContent = next.toUpperCase();
    var stream = this.currentPlayingStream;
    var streamId = stream ? (stream.stream_id || stream.vod_id) : null;
    if (streamId) {
        this.showToast(next.toUpperCase(), 2000);
        this.playStream(streamId, 'live', stream);
        var self = this;
        setTimeout(function() {
            if (self.currentScreen === 'player') self.showPlayerOverlay();
        }, 500);
    }
};

IPTVApp.prototype.toggleLiveAutoFormatSwitch = function() {
    var next = this.settings.liveAutoFormatSwitch === false ? true : false;
    this.settings.liveAutoFormatSwitch = next;
    this.saveSettings();
    window.log('ACTION', 'toggleLiveAutoFormatSwitch: ' + next);
    var iconEl = document.getElementById('player-auto-format-icon');
    if (iconEl) iconEl.textContent = next ? 'sync' : 'sync_disabled';
    var btnEl = document.getElementById('player-auto-format-btn');
    if (btnEl) btnEl.classList.toggle('disabled-state', !next);
    this.showToast(I18n.t('settings.liveAutoFormatSwitch', 'Auto-switch live format on timeout') + ': ' + (next ? I18n.t('settings.yes', 'Yes') : I18n.t('settings.no', 'No')), 2000);
};

IPTVApp.prototype.cycleDisplayMode = function() {
    var modes = ['auto', 'letterbox', 'stretch', 'zoom'];
    var current = this.player.getDisplayMode();
    var idx = modes.indexOf(current);
    var next = modes[(idx + 1) % modes.length];
    window.log('ACTION cycleDisplayMode: ' + current + ' -> ' + next);
    this.player.setDisplayMode(next);
    this.updateDisplayLabel();
};

IPTVApp.prototype.updateDisplayLabel = function() {
    var label = document.getElementById('player-display-label');
    if (label) {
        var mode = this.player.getDisplayMode();
        var labels = {
            'auto': I18n.t('player.displayAuto', 'Auto'),
            'letterbox': I18n.t('player.displayLetterbox', 'Letterbox'),
            'stretch': I18n.t('player.displayStretch', 'Stretch'),
            'zoom': I18n.t('player.displayZoom', 'Zoom')
        };
        label.textContent = labels[mode] || mode;
    }
};

IPTVApp.prototype.showTrackSelectionModal = function(type) {
    window.log('TRACK showModal type=' + type);
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
        this.setHidden(audioSection, false);
        this.setHidden(subtitleSection, true);
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
        this.setHidden(audioSection, true);
        this.setHidden(subtitleSection, false);
        var noSubItem = document.createElement('div');
        noSubItem.className = 'track-item focusable';
        noSubItem.dataset.type = 'subtitle';
        noSubItem.dataset.index = '-1';
        noSubItem.textContent = I18n.t('player.disabled', 'Disabled');
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
            var sdIcon = document.createElement('span');
            sdIcon.className = 'material-symbols-outlined';
            sdIcon.textContent = 'search';
            sdItem.appendChild(sdIcon);
            sdItem.appendChild(document.createTextNode(' ' + I18n.t('subtitleSearch.searchSubDL', 'Search SubDL...')));
            subtitleList.appendChild(sdItem);
            this.trackModalItems.push(sdItem);
        }
        if (typeof OpenSubtitles !== 'undefined' && OpenSubtitles.isEnabled()) {
            var osItem = document.createElement('div');
            osItem.className = 'track-item focusable opensubtitles-item';
            osItem.dataset.type = 'opensubtitles';
            var osIcon = document.createElement('span');
            osIcon.className = 'material-symbols-outlined';
            osIcon.textContent = 'search';
            osItem.appendChild(osIcon);
            osItem.appendChild(document.createTextNode(' ' + I18n.t('subtitleSearch.searchOpenSubtitles', 'Search OpenSubtitles...')));
            subtitleList.appendChild(osItem);
            this.trackModalItems.push(osItem);
        }
    }
    this.setHidden('tracks-modal', false);
    this.previousFocusArea = this.focusArea;
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
    window.log('TRACK select type=' + type + ' index=' + index + ' idx=' + idx + ' text=' + item.textContent);
    if (type === 'audio') {
        this.currentAudioIndex = idx;
        this.player.setAudioTrack(index);
        document.getElementById('player-audio-label').textContent = item.textContent;
    }
    else if (type === 'subtitle') {
        if (index === -1) {
            this.currentSubtitleIndex = -1;
            this._subtitleManuallySelected = false;
            this.externalSubtitles = null;
            this.lastExternalSubtitle = null;
            this.player.hideSubtitles();
            this.saveSeriesSubtitlePref('disabled');
            document.getElementById('player-subtitle-label').textContent = I18n.t('player.disabled', 'Disabled');
        }
        else {
            this.currentSubtitleIndex = idx;
            this._subtitleManuallySelected = true;
            this.player.setSubtitleTrack(index);
            this.player.showSubtitles();
            var tracks = this.availableTracks;
            var trackLang = (tracks && tracks.subtitle[idx] && tracks.subtitle[idx].lang) || '';
            this.saveSeriesSubtitlePref(trackLang.toLowerCase());
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
    this.showPlayerOverlay(true);
};

// Subtitle search
IPTVApp.prototype.searchOpenSubtitles = function() {
    var self = this;
    window.log('searchOpenSubtitles tmdbInfo=' + (this.tmdbInfo ? 'yes' : 'no') + ' enabled=' + OpenSubtitles.isEnabled());
    if (!this.tmdbInfo || !OpenSubtitles.isEnabled()) {
        window.log('SUBTITLE', 'searchOpenSubtitles aborted');
        return;
    }
    this.showLoading(true, I18n.t('loading.searchSubtitles', 'Searching subtitles...'));
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
    window.log('OpenSubtitles.search params=' + JSON.stringify(params));
    OpenSubtitles.search(params, function(err, results) {
        window.log('OpenSubtitles.search result err=' + err + ' count=' + (results ? results.length : 0));
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
    window.log('searchSubDL tmdbInfo=' + (this.tmdbInfo ? 'yes' : 'no') + ' enabled=' + SubDL.isEnabled());
    if (!this.tmdbInfo || !SubDL.isEnabled()) {
        window.log('SUBTITLE', 'searchSubDL aborted');
        return;
    }
    this.showLoading(true, I18n.t('loading.searchSubtitles', 'Searching subtitles...'));
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
    window.log('SubDL.search params=' + JSON.stringify(params));
    SubDL.search(params, function(err, results) {
        window.log('SubDL.search result err=' + err + ' count=' + (results ? results.length : 0));
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
    backItem.textContent = '← ' + I18n.t('subtitleSearch.back', 'Back');
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
    var sub = this.subDLResults ? this.subDLResults[idx] : null;
    window.log('SUBTITLE SubDL download idx=' + idx + ' sub=' + (sub ? 'found' : 'null'));
    if (!sub) return;
    window.log('SUBTITLE SubDL url=' + sub.download_url);
    this.showLoading(true, I18n.t('loading.downloadSubtitle', 'Downloading subtitle...'));
    SubDL.downloadZip(sub.download_url, function(err, zipResult) {
        if (err) {
            window.log('ERROR', 'SUBTITLE SubDL download: ' + (err.error || err));
            self.showLoading(false);
            return;
        }
        window.log('SUBTITLE', 'SubDL zip ok, extracting...');
        SubDL.extractSrtFromZip(zipResult.data, function(err, srtContent) {
            if (err) {
                window.log('ERROR', 'SUBTITLE SubDL extract: ' + (err.error || err));
                self.showLoading(false);
                return;
            }
            window.log('SUBTITLE SubDL SRT length=' + srtContent.length);
            self.externalSubtitleContent = srtContent;
            self.parseAndLoadSubtitle(srtContent);
            self.currentSubtitleIndex = -2;
            self._subtitleIndexBeforeDisable = -2;
            self._subtitleManuallySelected = true;
            // Disable embedded subtitles when using external
            self.player.hideSubtitles();
            self.showLoading(false);
            self.hideTracksModal();
            self.showPlayerOverlay(true);
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
    backItem.textContent = '← ' + I18n.t('subtitleSearch.back', 'Back');
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
    window.log('OpenSubtitles download idx=' + idx + ' file_id=' + sub.file_id);
    this.showLoading(true, I18n.t('loading.downloadSubtitle', 'Downloading subtitle...'));
    OpenSubtitles.getDownloadLink(sub.file_id, function(err, download) {
        if (err) {
            window.log('ERROR', 'OpenSubtitles getDownloadLink: ' + (err.error || err));
            self.showLoading(false);
            return;
        }
        window.log('OpenSubtitles downloading from: ' + download.link);
        OpenSubtitles.downloadContent(download.link, function(err, content) {
            if (err) {
                window.log('ERROR', 'OpenSubtitles download: ' + (err.error || err));
                self.showLoading(false);
                return;
            }
            window.log('OpenSubtitles content downloaded, length=' + content.length);
            self.externalSubtitleContent = content;
            self.parseAndLoadSubtitle(content);
            self.currentSubtitleIndex = -2;
            self._subtitleIndexBeforeDisable = -2;
            self._subtitleManuallySelected = true;
            // Disable embedded subtitles when using external
            self.player.hideSubtitles();
            self.showLoading(false);
            self.hideTracksModal();
            self.showPlayerOverlay(true);
            document.getElementById('player-subtitle-label').textContent = sub.language.toUpperCase();
        });
    });
};

IPTVApp.prototype.parseAndLoadSubtitle = function(srtContent) {
    var self = this;
    this.externalSubtitles = [];
    // Normalize line endings (handle Windows \r\n and Mac \r)
    var normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var blocks = normalized.trim().split(/\n\n+/);
    window.log('SUBTITLE parsing blocks=' + blocks.length);
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
                textLines = textLines.filter(function(l) { return l.trim() && !l.match(Regex.srtArrow); });
                var text = textLines.join('<br>');
                var parsed = self.parseAssaTags(text);
                if (parsed.text.trim()) {
                    self.externalSubtitles.push({
                        start: startMs,
                        end: endMs,
                        text: parsed.text,
                        align: parsed.align,
                        pos: parsed.pos
                    });
                }
            }
        }
    }
    this.player.subtitlesEnabled = true;
    this.currentSubtitleIndex = -2;
    this.subtitleOffset = 0;
    window.log('SUBTITLE parsed count=' + this.externalSubtitles.length);
    if (this.externalSubtitles.length > 0) {
        var first = this.externalSubtitles[0];
        window.log('SUBTITLE first: start=' + first.start + 'ms end=' + first.end + 'ms text=' + first.text.substring(0, 30));
    }
};

// Parse ASS/SSA tags and convert to HTML
IPTVApp.prototype.parseAssaTags = function(text) {
    var align = null;
    var pos = null;
    // Extract alignment {\an1-9}
    var anMatch = text.match(/\{\\an(\d)\}/);
    if (anMatch) {
        align = parseInt(anMatch[1]);
    }
    // Extract position {\pos(x,y)}
    var posMatch = text.match(/\{\\pos\((\d+),(\d+)\)\}/);
    if (posMatch) {
        pos = { x: parseInt(posMatch[1]), y: parseInt(posMatch[2]) };
    }
    // Convert formatting tags to HTML
    text = text
        // Bold
        .replace(/\{\\b1\}/g, '<b>').replace(/\{\\b0\}/g, '</b>')
        // Italic
        .replace(/\{\\i1\}/g, '<i>').replace(/\{\\i0\}/g, '</i>')
        // Underline
        .replace(/\{\\u1\}/g, '<u>').replace(/\{\\u0\}/g, '</u>')
        // Color {\c&HBBGGRR&} or {\1c&HBBGGRR&}
        .replace(/\{\\1?c&H([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})&\}/g, function(m, b, g, r) {
            return '<span style="color:#' + r + g + b + '">';
        })
        // Font size {\fsNN}
        .replace(/\{\\fs(\d+)\}/g, '<span style="font-size:$1px">')
        // Remove remaining ASS tags
        .replace(/\{\\[^}]*\}/g, '');
    // Clean up multiple <br> in a row
    text = text.replace(/(<br>\s*)+/g, '<br>').replace(/^<br>|<br>$/g, '');
    return { text: text, align: align, pos: pos };
};

// Subtitle options
IPTVApp.prototype.adjustSubtitleOffset = function(deltaMs) {
    this.subtitleOffset = (this.subtitleOffset || 0) + deltaMs;
    this.updateSubtitleOffsetDisplay();
    // Apply native subtitle sync for embedded subtitles (not external SRT)
    if (this.currentSubtitleIndex >= 0 && this.player) {
        this.player.setSubtitleSync(this.subtitleOffset);
    }
};

IPTVApp.prototype.updateSubtitleOffsetDisplay = function() {
    var display = document.getElementById('sub-offset-display');
    if (display) {
        var sign = this.subtitleOffset >= 0 ? '+' : '';
        display.textContent = sign + (this.subtitleOffset / 1000).toFixed(1) + 's';
    }
};

IPTVApp.prototype.showSubtitleOptionsModal = function() {
    window.log('ACTION', 'showSubtitleOptionsModal');
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
    this.setHidden(modal, false);
    this.focusArea = 'sub-options';
    this.subOptionsItems = Array.from(modal.querySelectorAll('.sub-option-btn.focusable'));
    this.focusIndex = this.subOptionsItems.length - 1;
    this.updateFocus();
};

IPTVApp.prototype.hideSubtitleOptionsModal = function() {
    this.setHidden('sub-options-modal', true);
    this.focusArea = '';
    this.unfocusPlayerTracks();
    this.showPlayerOverlay(true);
};

IPTVApp.prototype.handleSubtitleOption = function() {
    if (!this.subOptionsItems || this.focusIndex >= this.subOptionsItems.length) return;
    var btn = this.subOptionsItems[this.focusIndex];
    var action = btn.dataset.action;
    var value = btn.dataset.value;
    window.log('ACTION subtitleOption: ' + action + '=' + value);
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
            if (!this._subtitleShownLogged) {
                window.log('SUBTITLE showing: time=' + adjustedTime + 'ms text=' + found.text.substring(0, 30));
                this._subtitleShownLogged = true;
            }
            this.applySubtitlePosition(subtitleEl, found.align, found.pos);
            window.displaySubtitle(subtitleEl, found.text);
            this.lastExternalSubtitle = found.text;
        }
    }
    else {
        if (this.lastExternalSubtitle) {
            window.displaySubtitle(subtitleEl, '');
            this.lastExternalSubtitle = null;
            this.resetSubtitlePosition(subtitleEl);
        }
    }
};

// Apply ASS/SSA alignment and position to subtitle element
IPTVApp.prototype.applySubtitlePosition = function(el, align, pos) {
    // Reset to default first
    el.style.top = '';
    el.style.bottom = '100px';
    el.style.left = '50%';
    el.style.right = '';
    el.style.transform = 'translateX(-50%)';
    el.style.textAlign = 'center';
    if (pos) {
        // Absolute positioning
        el.style.left = pos.x + 'px';
        el.style.top = pos.y + 'px';
        el.style.bottom = '';
        el.style.transform = '';
    }
    else if (align) {
        // Numpad-style alignment (1-9)
        // Vertical: 1-3 = bottom, 4-6 = middle, 7-9 = top
        // Horizontal: 1,4,7 = left, 2,5,8 = center, 3,6,9 = right
        var row = Math.ceil(align / 3); // 1=bottom, 2=middle, 3=top
        var col = ((align - 1) % 3) + 1; // 1=left, 2=center, 3=right
        // Vertical
        if (row === 3) {
            el.style.top = '50px';
            el.style.bottom = '';
        }
        else if (row === 2) {
            el.style.top = '50%';
            el.style.bottom = '';
            el.style.transform = col === 2 ? 'translate(-50%, -50%)' : 'translateY(-50%)';
        }
        // row === 1 uses default bottom
        // Horizontal
        if (col === 1) {
            el.style.left = '50px';
            el.style.transform = row === 2 ? 'translateY(-50%)' : '';
            el.style.textAlign = 'left';
        }
        else if (col === 3) {
            el.style.left = '';
            el.style.right = '50px';
            el.style.transform = row === 2 ? 'translateY(-50%)' : '';
            el.style.textAlign = 'right';
        }
    }
};

// Reset subtitle position to default
IPTVApp.prototype.resetSubtitlePosition = function(el) {
    el.style.top = '';
    el.style.bottom = '100px';
    el.style.left = '50%';
    el.style.right = '';
    el.style.transform = 'translateX(-50%)';
    el.style.textAlign = 'center';
};

// Catchup/Replay Modal
IPTVApp.prototype.showCatchupModal = function(stream, restoreDay, restoreIndex) {
    var self = this;
    this.catchupStream = stream;
    this.catchupSelectedDay = restoreDay || 0;
    this.catchupFocusArea = restoreIndex ? 'programs' : 'days';
    this.catchupFocusIndex = restoreIndex || 0;
    this._catchupRestoreProgramIndex = restoreIndex;
    this.catchupPrograms = [];
    var archiveDuration = parseInt(stream.tv_archive_duration, 10) || 5;
    var modal = document.getElementById('catchup-modal');
    var channelName = document.getElementById('catchup-channel-name');
    var daysSelector = document.getElementById('catchup-days-selector');
    var loading = document.getElementById('catchup-loading');
    var programsList = document.getElementById('catchup-programs-list');
    channelName.textContent = '';
    var replayIcon = document.createElement('span');
    replayIcon.className = 'material-symbols-outlined';
    replayIcon.textContent = 'replay';
    channelName.appendChild(replayIcon);
    channelName.appendChild(document.createTextNode(' ' + this.stripCategoryPrefix(this.getStreamTitle(stream))));
    daysSelector.innerHTML = '';
    var locale = this.settings.locale || I18n.getLocale() || 'en';
    var dayLabels = [I18n.t('catchup.today', 'Today'), I18n.t('catchup.yesterday', 'Yesterday')];
    for (var i = 2; i < archiveDuration; i++) {
        var d = new Date();
        d.setDate(d.getDate() - i);
        dayLabels.push(d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' }));
    }
    for (var i = 0; i < Math.min(archiveDuration, dayLabels.length); i++) {
        var btn = document.createElement('div');
        btn.className = 'catchup-day-btn focusable' + (i === this.catchupSelectedDay ? ' selected' : '');
        btn.dataset.day = i;
        btn.textContent = dayLabels[i];
        daysSelector.appendChild(btn);
    }
    programsList.innerHTML = '';
    this.setHidden(loading, false);
    this.setHidden(modal, false);
    this.currentScreen = 'catchup-modal';
    this.focusArea = 'catchup-modal';
    this.loadCatchupPrograms(stream.stream_id, this.catchupSelectedDay);
};

IPTVApp.prototype.loadCatchupPrograms = function(streamId, daysAgo) {
    var self = this;
    var loading = document.getElementById('catchup-loading');
    var programsList = document.getElementById('catchup-programs-list');
    this.setHidden(loading, false);
    programsList.innerHTML = '';
    if (!this.api || !this.api.getEPG) {
        loading.textContent = I18n.t('errors.noData', 'No EPG data');
        return;
    }
    var locale = this.settings.locale || I18n.getLocale() || 'en';
    this.api.getEPG(streamId).then(function(data) {
        self.setHidden(loading, true);
        if (!data || !data.epg_listings || data.epg_listings.length === 0) {
            programsList.innerHTML = '<div style="color:#888;padding:20px;">' + I18n.t('errors.noData', 'No programs') + '</div>';
            return;
        }
        var now = Math.floor(Date.now() / 1000);
        var targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - daysAgo);
        var targetDayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime() / 1000;
        var targetDayEnd = targetDayStart + 86400;
        var filteredPrograms = data.epg_listings.filter(function(prog) {
            var start = parseInt(prog.start_timestamp, 10);
            var end = parseInt(prog.stop_timestamp, 10);
            // Only show programs from target day that are finished (not future)
            return start >= targetDayStart && start < targetDayEnd && end <= now;
        });
        filteredPrograms.sort(function(a, b) {
            return parseInt(a.start_timestamp, 10) - parseInt(b.start_timestamp, 10);
        });
        self.catchupPrograms = filteredPrograms;
        if (filteredPrograms.length === 0) {
            // If today is empty, automatically try yesterday
            if (daysAgo === 0) {
                self.catchupSelectedDay = 1;
                self.catchupFocusIndex = 1;
                document.querySelectorAll('.catchup-day-btn').forEach(function(btn, idx) {
                    btn.classList.toggle('selected', idx === 1);
                });
                self.loadCatchupPrograms(streamId, 1);
                return;
            }
            programsList.innerHTML = '<div style="color:#888;padding:20px;">' + I18n.t('errors.noData', 'No programs') + '</div>';
            return;
        }
        filteredPrograms.forEach(function(prog, idx) {
            var start = parseInt(prog.start_timestamp, 10);
            var end = parseInt(prog.stop_timestamp, 10);
            var duration = Math.round((end - start) / 60);
            var isLive = now >= start && now < end;
            var isPast = now >= end;
            var startTime = new Date(start * 1000);
            var timeStr = startTime.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
            var title = prog.title;
            try {
                title = decodeURIComponent(escape(atob(prog.title)));
            }
            catch (e) { /* keep original title */ }
            var item = document.createElement('div');
            item.className = 'catchup-program focusable' + (isLive ? ' live' : '') + (idx === 0 ? ' focused' : '');
            item.dataset.index = idx;
            item.dataset.start = start;
            item.dataset.end = end;
            item.dataset.isPast = isPast ? '1' : '0';
            var durationStr = self.formatDuration(duration * 60000);
            item.innerHTML = '<div class="catchup-program-time">' + timeStr + '</div>' +
                '<div class="catchup-program-title">' + title + (isLive ? ' <span style="color:#e50914;">●</span>' : '') + '</div>' +
                '<div class="catchup-program-duration">' + durationStr + '</div>';
            programsList.appendChild(item);
        });
        self.catchupFocusArea = 'programs';
        if (self._catchupRestoreProgramIndex !== undefined && self._catchupRestoreProgramIndex < filteredPrograms.length) {
            self.catchupFocusIndex = self._catchupRestoreProgramIndex;
        }
        else {
            self.catchupFocusIndex = 0;
        }
        self._catchupRestoreProgramIndex = undefined;
        self.updateCatchupFocus();
    }).catch(function(e) {
        self.setHidden(loading, true);
        programsList.innerHTML = '<div style="color:#ff6b6b;padding:20px;">Error: ' + e + '</div>';
    });
};

IPTVApp.prototype.hideCatchupModal = function() {
    this.setHidden('catchup-modal', true);
    var stream = this.catchupStream;
    var returnToLive = this.returnToLiveAfterCatchup;
    var fromPlayer = this._replayFromPlayer;
    this.catchupStream = null;
    this.catchupPrograms = [];
    this.returnToLiveAfterCatchup = false;
    this._replayFromPlayer = false;
    // If opened from player overlay, return to player
    if (fromPlayer) {
        this.currentScreen = 'player';
        this.focusArea = 'player';
        this.playerTracksFocused = false;
        this.showPlayerOverlay();
        return;
    }
    // Return to live playback if we came from catchup
    if (returnToLive && stream) {
        this.playStream(stream.stream_id, 'live', stream);
        return;
    }
    this.currentScreen = 'browse';
    this.focusArea = 'grid';
    this.updateFocus();
};

IPTVApp.prototype.updateCatchupFocus = function() {
    var days = document.querySelectorAll('#catchup-days-selector .catchup-day-btn');
    var programs = document.querySelectorAll('#catchup-programs-list .catchup-program');
    days.forEach(function(d, i) {
        d.classList.toggle('focused', this.catchupFocusArea === 'days' && i === this.catchupFocusIndex);
    }, this);
    programs.forEach(function(p, i) {
        p.classList.toggle('focused', this.catchupFocusArea === 'programs' && i === this.catchupFocusIndex);
    }, this);
    if (this.catchupFocusArea === 'programs' && programs[this.catchupFocusIndex]) {
        programs[this.catchupFocusIndex].scrollIntoView({ block: 'nearest' });
    }
};

IPTVApp.prototype.navigateCatchupModal = function(direction) {
    var days = document.querySelectorAll('#catchup-days-selector .catchup-day-btn');
    var programs = document.querySelectorAll('#catchup-programs-list .catchup-program');
    if (this.catchupFocusArea === 'days') {
        if (direction === 'left' && this.catchupFocusIndex > 0) {
            this.catchupFocusIndex--;
        }
        else if (direction === 'right' && this.catchupFocusIndex < days.length - 1) {
            this.catchupFocusIndex++;
        }
        else if (direction === 'down' && programs.length > 0) {
            this.catchupFocusArea = 'programs';
            this.catchupFocusIndex = 0;
        }
    }
    else if (this.catchupFocusArea === 'programs') {
        if (direction === 'up') {
            if (this.catchupFocusIndex > 0) {
                this.catchupFocusIndex--;
            }
            else {
                this.catchupFocusArea = 'days';
                this.catchupFocusIndex = this.catchupSelectedDay;
            }
        }
        else if (direction === 'down' && this.catchupFocusIndex < programs.length - 1) {
            this.catchupFocusIndex++;
        }
    }
    this.updateCatchupFocus();
};

IPTVApp.prototype.selectCatchupItem = function() {
    if (this.catchupFocusArea === 'days') {
        var days = document.querySelectorAll('#catchup-days-selector .catchup-day-btn');
        days.forEach(function(d) { d.classList.remove('selected'); });
        if (days[this.catchupFocusIndex]) {
            days[this.catchupFocusIndex].classList.add('selected');
            this.catchupSelectedDay = this.catchupFocusIndex;
            this.loadCatchupPrograms(this.catchupStream.stream_id, this.catchupFocusIndex);
        }
    }
    else if (this.catchupFocusArea === 'programs') {
        var prog = this.catchupPrograms[this.catchupFocusIndex];
        if (!prog) {
            window.log('selectCatchupItem: no program at index ' + this.catchupFocusIndex);
            return;
        }
        var start = parseInt(prog.start_timestamp, 10);
        var end = parseInt(prog.stop_timestamp, 10);
        var duration = Math.round((end - start) / 60);
        window.log('selectCatchupItem: program start=' + start + ' end=' + end + ' duration=' + duration + 'min');
        // Save stream and programs before hiding modal (hideCatchupModal clears them)
        var stream = this.catchupStream;
        var programs = this.catchupPrograms.slice();
        var programIndex = this.catchupFocusIndex;
        if (!stream) {
            window.log('ERROR', 'selectCatchupItem: no stream!');
            return;
        }
        window.log('selectCatchupItem: stream=' + stream.stream_id + ' ' + stream.name);
        // Stop live player if replay was opened from player overlay
        if (this._replayFromPlayer) {
            this.player.stop();
            this._replayFromPlayer = false;
            this._catchupFromPlayer = true;
        }
        // Just hide the modal visually, don't reset focus (playCatchup will set it)
        this.setHidden('catchup-modal', true);
        var daysAgo = this.catchupSelectedDay || 0;
        this.catchupStream = null;
        this.catchupPrograms = [];
        this.playCatchup(stream, start, duration, 'm3u8', null, null, programs, programIndex, daysAgo);
    }
};

IPTVApp.prototype.playCatchup = function(stream, startTimestamp, durationMinutes, extension, formatIndex, triedFormats, programs, programIndex, daysAgo) {
    extension = extension || 'ts';
    triedFormats = triedFormats || [];
    if (daysAgo === undefined) daysAgo = 0;
    // Stop any ongoing seek before starting new catchup
    this.stopSeek();
    // Reset debug flag for progress logging
    this._catchupLogDone = false;
    // Use saved format if available and no format specified
    if (formatIndex === undefined || formatIndex === null) {
        formatIndex = this.settings.catchupFormat || 0;
    }
    triedFormats.push(formatIndex);
    var streamId = stream.stream_id;
    var url = this.api.getCatchupUrl(streamId, startTimestamp, durationMinutes, extension, formatIndex);
    window.log('Playing catchup format ' + formatIndex + ': ' + url);
    clearTimeout(this._detailsTooltipTimer);
    clearTimeout(this._seasonTooltipTimer);
    this.hideAllButtonTooltips();
    this.hideTTSTooltip();
    this.showScreen('player');
    this.currentScreen = 'player';
    this.focusArea = 'player';
    this.playerTracksFocused = false;
    this.streamReady = false;
    this._completionTriggered = false;
    this._catchupStartTime = Date.now();
    this._catchupBasePosition = null;
    this._catchupSeekTarget = undefined;
    this._catchupLogDone = false;
    this._lastValidRelativePosition = undefined;
    this.currentPlayingStream = stream;
    this.currentPlayingType = 'catchup';
    this.seekTargetPosition = 0;
    this.lastSeekTime = 0;
    // Store programs list and current index for next/prev navigation
    if (programs) {
        this.catchupPlaylist = programs;
        this.catchupPlaylistIndex = programIndex;
    }
    this.catchupParams = { stream: stream, start: startTimestamp, duration: durationMinutes, extension: extension, format: formatIndex, daysAgo: daysAgo };
    var posterUrl = stream ? this.getStreamImage(stream) : null;
    this.showLoading(true, posterUrl, I18n.t('loading.playback', 'Starting playback...'));
    var self = this;
    this.player.onStateChange = function(state) {
        if (state === 'playing') {
            self.streamReady = true;
            self.isBuffering = false;
            self.updatePlayerStateIndicator();
            self.showLoading(false);
            self.showPlayerOverlay();
            // Save working format
            self.settings.catchupFormat = formatIndex;
            self.saveSettings();
        }
        else if (state === 'buffering') {
            self.isBuffering = true;
            self.updatePlayerStateIndicator();
        }
        else if (state === 'completed') {
            self.playNextCatchup();
        }
    };
    this.player.onTimeUpdate = function(current, total) {
        self.updatePlayerProgress(current, total);
    };
    this.player.onError = function(error) {
        var errorMsg = error ? (error.type || JSON.stringify(error)) : 'unknown';
        window.log('ERROR', 'Catchup format ' + formatIndex + ' failed: ' + errorMsg);
        // Find next format to try (0-3 that hasn't been tried yet)
        var nextFormat = -1;
        for (var i = 0; i < 4; i++) {
            if (triedFormats.indexOf(i) === -1) {
                nextFormat = i;
                break;
            }
        }
        if (nextFormat >= 0) {
            window.log('Trying catchup format ' + nextFormat + '...');
            self.playCatchup(stream, startTimestamp, durationMinutes, extension, nextFormat, triedFormats);
        }
        else {
            window.log('ERROR', 'All catchup formats failed');
            self.showLoading(false);
            self.showToast(I18n.t('player.playbackError', 'Playback error'));
            setTimeout(function() {
                self.stopPlayback();
            }, 100);
        }
    };
    this.player.play(url, false);
    var title = document.getElementById('player-title-text');
    var progTitle = '';
    var prog = this.catchupPlaylist ? this.catchupPlaylist[this.catchupPlaylistIndex] : null;
    if (prog && prog.title) {
        try {
            progTitle = decodeURIComponent(escape(atob(prog.title)));
        }
        catch (e) {
            progTitle = prog.title;
        }
    }
    title.textContent = this.stripCategoryPrefix(stream.name) + (progTitle ? ' - ' + progTitle : '');
    document.getElementById('player-epg').textContent = '';
};

// Fetch catchup programs for a specific day (async)
IPTVApp.prototype.fetchCatchupPrograms = function(streamId, daysAgo) {
    var self = this;
    return new Promise(function(resolve, reject) {
        if (!self.api || !self.api.getEPG) {
            resolve([]);
            return;
        }
        self.api.getEPG(streamId).then(function(data) {
            if (!data || !data.epg_listings || data.epg_listings.length === 0) {
                resolve([]);
                return;
            }
            var now = Math.floor(Date.now() / 1000);
            var targetDate = new Date();
            targetDate.setDate(targetDate.getDate() - daysAgo);
            var targetDayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime() / 1000;
            var targetDayEnd = targetDayStart + 86400;
            var filteredPrograms = data.epg_listings.filter(function(prog) {
                var start = parseInt(prog.start_timestamp, 10);
                var end = parseInt(prog.stop_timestamp, 10);
                return start >= targetDayStart && start < targetDayEnd && end <= now;
            });
            filteredPrograms.sort(function(a, b) {
                return parseInt(a.start_timestamp, 10) - parseInt(b.start_timestamp, 10);
            });
            resolve(filteredPrograms);
        }).catch(function() {
            resolve([]);
        });
    });
};

// Play next catchup program in playlist
IPTVApp.prototype.playNextCatchup = function() {
    var self = this;
    if (!this.catchupPlaylist || !this.catchupParams) {
        this.stopPlayback();
        return;
    }
    var nextIndex = this.catchupPlaylistIndex + 1;
    if (nextIndex >= this.catchupPlaylist.length) {
        // Try to load next day (daysAgo - 1)
        var currentDaysAgo = this.catchupParams.daysAgo || 0;
        if (currentDaysAgo > 0) {
            var newDaysAgo = currentDaysAgo - 1;
            window.log('Catchup: end of day, loading daysAgo=' + newDaysAgo);
            this.fetchCatchupPrograms(this.catchupParams.stream.stream_id, newDaysAgo).then(function(programs) {
                if (programs.length > 0) {
                    var prog = programs[0];
                    var start = parseInt(prog.start_timestamp, 10);
                    var end = parseInt(prog.stop_timestamp, 10);
                    var duration = Math.round((end - start) / 60);
                    window.log('Catchup: playing first program of daysAgo=' + newDaysAgo);
                    self.catchupPlaylist = programs;
                    self.catchupPlaylistIndex = 0;
                    self.player.stop();
                    self.playCatchup(self.catchupParams.stream, start, duration, self.catchupParams.extension, null, null, programs, 0, newDaysAgo);
                }
                else {
                    window.log('Catchup: no programs for daysAgo=' + newDaysAgo + ', stopping');
                    self.stopPlayback();
                }
            });
            return;
        }
        window.log('PLAYER', 'Catchup: end of playlist, stopping');
        this.stopPlayback();
        return;
    }
    var prog = this.catchupPlaylist[nextIndex];
    if (!prog) {
        this.stopPlayback();
        return;
    }
    var start = parseInt(prog.start_timestamp, 10);
    var end = parseInt(prog.stop_timestamp, 10);
    var duration = Math.round((end - start) / 60);
    window.log('Catchup: playing next program index=' + nextIndex + ' daysAgo=' + this.catchupParams.daysAgo);
    this.catchupPlaylistIndex = nextIndex;
    this.player.stop();
    this.playCatchup(this.catchupParams.stream, start, duration, this.catchupParams.extension, null, null, this.catchupPlaylist, nextIndex, this.catchupParams.daysAgo);
};

// Play previous catchup program in playlist
IPTVApp.prototype.playPrevCatchup = function() {
    var self = this;
    if (!this.catchupPlaylist || !this.catchupParams) {
        return false;
    }
    var prevIndex = this.catchupPlaylistIndex - 1;
    if (prevIndex < 0) {
        // Try to load previous day (daysAgo + 1)
        var currentDaysAgo = this.catchupParams.daysAgo || 0;
        var newDaysAgo = currentDaysAgo + 1;
        window.log('Catchup: at first program, loading daysAgo=' + newDaysAgo);
        this.fetchCatchupPrograms(this.catchupParams.stream.stream_id, newDaysAgo).then(function(programs) {
            if (programs.length > 0) {
                var lastIndex = programs.length - 1;
                var prog = programs[lastIndex];
                var start = parseInt(prog.start_timestamp, 10);
                var end = parseInt(prog.stop_timestamp, 10);
                var duration = Math.round((end - start) / 60);
                window.log('Catchup: playing last program of daysAgo=' + newDaysAgo + ' (index=' + lastIndex + ')');
                self.catchupPlaylist = programs;
                self.catchupPlaylistIndex = lastIndex;
                self.player.stop();
                self.playCatchup(self.catchupParams.stream, start, duration, self.catchupParams.extension, null, null, programs, lastIndex, newDaysAgo);
            }
            else {
                window.log('Catchup: no programs for daysAgo=' + newDaysAgo);
            }
        });
        return false;
    }
    var prog = this.catchupPlaylist[prevIndex];
    if (!prog) {
        return false;
    }
    var start = parseInt(prog.start_timestamp, 10);
    var end = parseInt(prog.stop_timestamp, 10);
    var duration = Math.round((end - start) / 60);
    window.log('Catchup: playing previous program index=' + prevIndex + ' daysAgo=' + this.catchupParams.daysAgo);
    this.catchupPlaylistIndex = prevIndex;
    this.player.stop();
    this.playCatchup(this.catchupParams.stream, start, duration, this.catchupParams.extension, null, null, this.catchupPlaylist, prevIndex, this.catchupParams.daysAgo);
    return true;
};
