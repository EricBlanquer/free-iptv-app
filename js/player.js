/**
 * Samsung TV AVPlay Player Wrapper with HTML5 fallback
 */
class TVPlayer {
    constructor() {
        this.isPlaying = false;
        this.isPaused = false;
        this.duration = 0;
        this.currentTime = 0;
        this.onTimeUpdate = null;
        this.onStateChange = null;
        this.onError = null;
        this.onFrozen = null;
        this.useHtml5 = false;
        this.videoElement = null;
        this.currentUrl = null;
        this.lastCodecError = null;
        this.preferHtml5 = false;
        this.dialogueBoost = false;
        this.fallingBackToNative = false;
        this.pauseStartTime = null;
        this.isInTimeshift = false;
        this.audioContext = null;
        this.audioSource = null;
        this.compressor = null;
        // Freeze detection for live streams
        this.isLiveStream = false;
        this.freezeCheckInterval = null;
        this.lastCheckedTime = 0;
        this.freezeCheckCount = 0;
        // Playback speed
        this.playbackSpeed = 1;
        // Display mode: 'auto', 'letterbox', 'stretch', 'zoom'
        this.displayMode = 'auto';
        // Stream proxy URL
        this.proxyUrl = '';
    }

    setProxyUrl(url) {
        this.proxyUrl = (url || '').trim();
    }

    init() {
        try {
            // Register keys for TV remote
            if (typeof tizen !== 'undefined') {
                tizen.tvinputdevice.registerKey('MediaPlay');
                tizen.tvinputdevice.registerKey('MediaPause');
                tizen.tvinputdevice.registerKey('MediaStop');
                tizen.tvinputdevice.registerKey('MediaFastForward');
                tizen.tvinputdevice.registerKey('MediaRewind');
                tizen.tvinputdevice.registerKey('MediaPlayPause');
                tizen.tvinputdevice.registerKey('ChannelUp');
                tizen.tvinputdevice.registerKey('ChannelDown');
            }
            window.log('INIT', 'Player initialized');
            return true;
        } catch (ex) {
            window.log('ERROR', 'Player init: ' + (ex.message || ex));
            return false;
        }
    }

    setPreferHtml5(value) {
        this.preferHtml5 = value;
    }

    setDialogueBoost(value) {
        this.dialogueBoost = value;
        if (this.useHtml5 && this.videoElement) {
            this._updateDialogueBoost();
        }
    }

    _setupAudioProcessing() {
        if (!this.videoElement) return;
        if (/Android/.test(navigator.userAgent)) return;
        try {
            if (!this.audioContext) {
                var AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) {
                    window.log('PLAYER', 'Web Audio API not supported');
                    return;
                }
                this.audioContext = new AudioContext();
            }
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            if (!this.audioSource) {
                this.audioSource = this.audioContext.createMediaElementSource(this.videoElement);
            }
            if (!this.compressor) {
                this.compressor = this.audioContext.createDynamicsCompressor();
                // Settings optimized for dialogue boost
                // Reduce dynamic range to make quiet sounds (dialogue) louder
                this.compressor.threshold.setValueAtTime(-24, this.audioContext.currentTime);
                this.compressor.knee.setValueAtTime(30, this.audioContext.currentTime);
                this.compressor.ratio.setValueAtTime(12, this.audioContext.currentTime);
                this.compressor.attack.setValueAtTime(0.003, this.audioContext.currentTime);
                this.compressor.release.setValueAtTime(0.25, this.audioContext.currentTime);
            }
            this._updateDialogueBoost();
        }
        catch (ex) {
            window.log('ERROR', 'Audio processing setup: ' + ex.message);
        }
    }

    _updateDialogueBoost() {
        if (!this.audioContext || !this.audioSource) return;
        try {
            this.audioSource.disconnect();
            if (this.dialogueBoost && this.compressor) {
                this.audioSource.connect(this.compressor);
                this.compressor.connect(this.audioContext.destination);
                window.log('PLAYER', 'Dialogue boost enabled');
            }
            else {
                this.audioSource.connect(this.audioContext.destination);
                window.log('PLAYER', 'Dialogue boost disabled');
            }
        }
        catch (ex) {
            window.log('ERROR', 'Update dialogue boost: ' + ex.message);
        }
    }

    _cleanupAudioProcessing() {
        try {
            if (this.audioSource) {
                this.audioSource.disconnect();
            }
            if (this.compressor) {
                this.compressor.disconnect();
            }
        }
        catch (ex) { /* cleanup - ignore errors */ }
    }

    _startFreezeDetection() {
        var self = this;
        this._stopFreezeDetection();
        if (!this.isLiveStream) return;
        this.lastCheckedTime = this.currentTime;
        this.freezeCheckCount = 0;
        // Check every 2 seconds if currentTime is advancing
        this.freezeCheckInterval = setInterval(function() {
            if (!self.isPlaying || self.isPaused) {
                self.lastCheckedTime = self.currentTime;
                self.freezeCheckCount = 0;
                return;
            }
            var currentTime = self.currentTime;
            // For AVPlay, get current time directly
            if (!self.useHtml5 && typeof webapis !== 'undefined' && webapis.avplay) {
                try {
                    currentTime = webapis.avplay.getCurrentTime();
                }
                catch (ex) { /* player may not be ready */ }
            }
            // Check if time has advanced (at least 500ms in 2 seconds)
            var timeDiff = Math.abs(currentTime - self.lastCheckedTime);
            if (timeDiff < 500) {
                self.freezeCheckCount++;
                window.log('PLAYER', 'Freeze check: time not advancing (' + self.freezeCheckCount + '/3)');
                // After 3 consecutive checks (6 seconds), consider frozen
                if (self.freezeCheckCount >= 3) {
                    window.log('ERROR', 'Player frozen detected, triggering recovery');
                    self.freezeCheckCount = 0;
                    if (self.onFrozen) {
                        self.onFrozen();
                    }
                }
            }
            else {
                self.freezeCheckCount = 0;
            }
            self.lastCheckedTime = currentTime;
        }, 2000);
    }

    _stopFreezeDetection() {
        if (this.freezeCheckInterval) {
            clearInterval(this.freezeCheckInterval);
            this.freezeCheckInterval = null;
        }
        this.freezeCheckCount = 0;
    }

    _updatePlayerTypeIndicator() {
        var indicator = document.getElementById('player-type');
        if (!indicator) return;
        indicator.classList.remove('hidden', 'html5', 'native');
        if (this.useHtml5) {
            indicator.textContent = 'HTML5';
            indicator.classList.add('html5');
        }
        else {
            indicator.textContent = 'AVPlay';
            indicator.classList.add('native');
        }
    }

    _hidePlayerTypeIndicator() {
        var indicator = document.getElementById('player-type');
        if (indicator) {
            indicator.classList.add('hidden');
        }
    }

    // Resolve redirect and play
    _resolveAndPlay(url) {
        var self = this;
        this.resolveRedirects(url, function(finalUrl) {
            self.currentUrl = finalUrl;
            self._playDirect(finalUrl);
        }, function(error) {
            if (self.onError) self.onError(error);
        });
    }

    // Resolve HTTP redirects to get final URL
    resolveRedirects(url, callback, onError) {
        window.log('HTTP', 'Resolving redirects for: ' + url.substring(url.lastIndexOf('/') + 1));
        var done = false;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.timeout = 5000;
        xhr.onreadystatechange = function() {
            if (!done && xhr.readyState >= 2) {
                if (xhr.status >= 400) {
                    done = true;
                    xhr.abort();
                    window.log('ERROR', 'HTTP ' + xhr.status + ' for stream');
                    if (onError) {
                        onError({ type: 'HTTP_ERROR', status: xhr.status });
                    }
                    return;
                }
                if (xhr.responseURL) {
                    done = true;
                    var finalUrl = xhr.responseURL;
                    xhr.abort();
                    if (finalUrl !== url) {
                        window.log('HTTP', 'Redirect: ' + finalUrl);
                    }
                    callback(finalUrl);
                }
            }
        };
        xhr.onerror = function() {
            if (!done) {
                done = true;
                window.log('ERROR', 'XHR error, using original URL');
                callback(url);
            }
        };
        xhr.ontimeout = function() {
            if (!done) {
                done = true;
                window.log('HTTP', 'XHR timeout, using original URL');
                callback(url);
            }
        };
        try {
            xhr.send();
        }
        catch (e) {
            if (!done) {
                done = true;
                window.log('HTTP', 'XHR exception: ' + e.message);
                callback(url);
            }
        }
    }

    _needsTranscode(url) {
        if (!url.includes('.ts') && !url.includes('/live/')) {
            return false;
        }
        // Real Tizen TV (not emulator) - AVPlay supports MPEG-TS natively
        // Emulator runs in Chrome which doesn't support MPEG-TS
        if (typeof tizen !== 'undefined' && navigator.userAgent.indexOf('Chrome') === -1) {
            return false;
        }
        if (typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported) {
            return !MediaSource.isTypeSupported('video/mp2t');
        }
        return true;
    }

    play(url, isLive = false, startPosition = 0) {
        window.log('PLAYER', 'play ' + (isLive ? 'LIVE ' : '') + url + (startPosition > 0 ? ' at ' + formatMs(startPosition) : ''));
        var self = this;
        this.currentUrl = url;
        this.startPosition = startPosition;
        this.useHtml5 = false;
        this.fallingBackToNative = false;
        this.isInTimeshift = false;
        this.pauseStartTime = null;
        this.isLiveStream = isLive;
        this._cleanupAudioProcessing();
        this._stopFreezeDetection();
        // Use streaming proxy if configured (bypasses geo-restrictions and handles redirects)
        if (this.proxyUrl) {
            var baseUrl = this.proxyUrl.replace(/\/+$/, '');
            var proxiedUrl = baseUrl + '/?url=' + encodeURIComponent(url) + proxyDuidParam();
            // Transcode live .ts streams to mp4 for emulator (doesn't support MPEG-TS)
            if (isLive && this._needsTranscode(url)) {
                proxiedUrl += '&transcode=mp4';
                window.log('HTTP', 'Proxy ' + baseUrl + ' -> ' + url + ' (transcode)');
            }
            else {
                window.log('HTTP', 'Proxy ' + baseUrl + ' -> ' + url);
            }
            this._playDirect(proxiedUrl);
            return;
        }
        this._playDirect(url);
    }

    _playDirect(url, retryCount = 0) {
        var self = this;
        try {
            // Use HTML5 if preferred or if AVPlay is not available
            if (this.preferHtml5 || typeof webapis === 'undefined' || !webapis.avplay) {
                this.playHtml5(url);
                return;
            }
            try {
                webapis.avplay.stop();
                webapis.avplay.close();
            } catch (e) { /* no previous session */ }
            window.log('PLAYER', 'AVPlay.open');
            webapis.avplay.open(url);
            webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
            webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
            webapis.avplay.setTimeoutForBuffering(30000);
            webapis.avplay.setListener(this._getListeners());
            window.log('PLAYER', 'AVPlay.prepareAsync...');
            webapis.avplay.prepareAsync(() => {
                window.log('PLAYER', 'prepareAsync done, will seek to ' + formatMs(this.startPosition) + ' after play');
                webapis.avplay.play();
                this.isPlaying = true;
                this.isPaused = false;
                this.duration = webapis.avplay.getDuration();
                try { webapis.avplay.seekTo(this.startPosition); } catch (e) { /* emulator */ }
                this._updatePlayerTypeIndicator();
                this._startFreezeDetection();
                if (this.onStateChange) this.onStateChange('playing');
            }, (error) => {
                window.log('ERROR', 'prepareAsync failed: ' + (error ? (error.message || error.name || JSON.stringify(error)) : 'unknown'));
                // Emulator InvalidStateError - retry once after delay
                if (error && error.name === 'InvalidStateError' && retryCount < 1) {
                    window.log('PLAYER', 'InvalidStateError on prepareAsync, retrying...');
                    setTimeout(function() { self._playDirect(url, retryCount + 1); }, 100);
                    return;
                }
                if (this.onError) this.onError(error);
            });
        } catch (e) {
            window.log('ERROR', '_playDirect exception: ' + (e ? (e.message || e.name || JSON.stringify(e)) : 'unknown'));
            // Emulator InvalidStateError - retry once after delay
            if (e && e.name === 'InvalidStateError' && retryCount < 1) {
                window.log('PLAYER', 'InvalidStateError caught, retrying...');
                setTimeout(function() { self._playDirect(url, retryCount + 1); }, 100);
                return;
            }
            if (this.onError) this.onError(e);
        }
    }

    playNative(url) {
        var self = this;
        this.useHtml5 = false;
        this.currentUrl = url || this.currentUrl;
        window.log('PLAYER', 'Trying native AVPlay for: ' + this.currentUrl);
        // Stop HTML5 if running
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.src = '';
            this.videoElement.style.display = 'none';
        }
        this._cleanupAudioProcessing();
        try {
            if (typeof webapis === 'undefined' || !webapis.avplay) {
                window.log('PLAYER', 'AVPlay not available');
                if (this.onError) this.onError({ type: 'NO_AVPLAY', message: 'AVPlay not available' });
                return;
            }
            webapis.avplay.open(this.currentUrl);
            webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
            webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
            webapis.avplay.setTimeoutForBuffering(30000);
            webapis.avplay.setListener(this._getListeners());
            webapis.avplay.prepareAsync(() => {
                window.log('PLAYER', 'playNative prepareAsync done, will seek to ' + formatMs(this.startPosition) + ' after play');
                webapis.avplay.play();
                this.isPlaying = true;
                this.isPaused = false;
                this.duration = webapis.avplay.getDuration();
                try { webapis.avplay.seekTo(this.startPosition); } catch (e) { /* emulator */ }
                this._updatePlayerTypeIndicator();
                this._startFreezeDetection();
                if (this.onStateChange) this.onStateChange('playing');
            }, (error) => {
                if (this.onError) this.onError(error);
            });
        }
        catch (e) {
            if (this.onError) this.onError(e);
        }
    }

    playHtml5(url) {
        var self = this;
        this.useHtml5 = true;
        this.currentUrl = url || this.currentUrl;
        window.log('PLAYER', 'Trying HTML5 player for: ' + this.currentUrl);
        // Stop AVPlay if running
        try {
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                webapis.avplay.stop();
                webapis.avplay.close();
            }
        } catch (e) { /* cleanup AVPlay before HTML5 */ }
        if (!this.videoElement) {
            this.videoElement = document.getElementById('html5-video');
        }
        this.videoElement.pause();
        this.videoElement.removeAttribute('src');
        this.videoElement.load();
        this.videoElement.style.display = 'block';
        this.videoElement.src = this.currentUrl;
        this.videoElement.onloadedmetadata = function() {
            self.duration = self.videoElement.duration * 1000;
            window.log('PLAYER', 'HTML5 onloadedmetadata, startPosition=' + self.startPosition);
        };
        if (this.startPosition > 0) {
            this.videoElement.oncanplay = function() {
                if (self.startPosition > 0) {
                    window.log('PLAYER', 'HTML5 oncanplay, seeking to: ' + formatMs(self.startPosition));
                    self.videoElement.oncanplay = null;
                    self.videoElement.currentTime = self.startPosition / 1000;
                    self.startPosition = 0;
                }
            };
        }
        this.videoElement.ontimeupdate = function() {
            self.currentTime = self.videoElement.currentTime * 1000;
            if (self.onTimeUpdate) {
                self.onTimeUpdate(self.currentTime, self.duration);
            }
        };
        this.videoElement.onplay = function() {
            self.isPlaying = true;
            self.isPaused = false;
            self._setupAudioProcessing();
            self._updatePlayerTypeIndicator();
            self._startFreezeDetection();
            if (self.onStateChange) self.onStateChange('playing');
        };
        this.videoElement.onpause = function() {
            self.isPaused = true;
            if (self.onStateChange) self.onStateChange('paused');
        };
        this.videoElement.onwaiting = function() {
            if (self.onStateChange) self.onStateChange('buffering');
            if (!self._bufferTimer) {
                self._bufferStart = Date.now();
                self._bufferTimer = setInterval(function() {
                    var elapsed = (Date.now() - self._bufferStart) / 1000;
                    var percent = Math.min(95, Math.round((1 - Math.exp(-elapsed / 8)) * 100));
                    if (self.onBufferProgress) self.onBufferProgress(percent);
                }, 500);
            }
        };
        this.videoElement.onplaying = function() {
            if (self._bufferTimer) {
                clearInterval(self._bufferTimer);
                self._bufferTimer = null;
            }
            if (self.onBufferProgress) self.onBufferProgress(100);
            if (self.onStateChange) self.onStateChange('playing');
        };
        this.videoElement.onended = function() {
            self.isPlaying = false;
            if (self.onStateChange) self.onStateChange('completed');
        };
        this.videoElement.onerror = function(e) {
            window.log('ERROR', 'HTML5 player: ' + (self.videoElement.error ? self.videoElement.error.message : 'Unknown'));
            // Prevent loop when clearing src during fallback
            if (self.fallingBackToNative) {
                return;
            }
            // Fallback to native player if HTML5 fails and AVPlay is available
            if (self.preferHtml5 && typeof webapis !== 'undefined' && webapis.avplay) {
                window.log('ERROR', 'HTML5 failed, falling back to native AVPlay');
                self.fallingBackToNative = true;
                self.playNative(self.currentUrl);
                return;
            }
            if (self.onError) {
                var errorInfo = {
                    type: 'HTML5_ERROR',
                    html5Error: true,
                    message: self.videoElement.error ? self.videoElement.error.message : 'Unknown error'
                };
                // Include codec info from AVPlay error if available
                if (self.lastCodecError) {
                    errorInfo.unsupportedCodec = true;
                    errorInfo.codecName = self.lastCodecError.codecName;
                    errorInfo.width = self.lastCodecError.width;
                    errorInfo.height = self.lastCodecError.height;
                }
                self.onError(errorInfo);
            }
        };
        this.videoElement.play().catch(function(e) {
            window.log('ERROR', 'HTML5 play(): ' + e.message);
            if (self.fallingBackToNative) {
                return;
            }
            if (self.preferHtml5 && typeof webapis !== 'undefined' && webapis.avplay) {
                window.log('PLAYER', 'HTML5 play() failed, falling back to native AVPlay');
                self.fallingBackToNative = true;
                self.playNative(self.currentUrl);
                return;
            }
            if (self.onError) {
                var errorInfo = {
                    type: 'HTML5_PLAY_ERROR',
                    html5Error: true,
                    message: e.message
                };
                if (self.lastCodecError) {
                    errorInfo.unsupportedCodec = true;
                    errorInfo.codecName = self.lastCodecError.codecName;
                    errorInfo.width = self.lastCodecError.width;
                    errorInfo.height = self.lastCodecError.height;
                }
                self.onError(errorInfo);
            }
        });
    }

    pause() {
        window.log('PLAYER', 'pause');
        try {
            if (this.subtitleClearTimer) {
                clearTimeout(this.subtitleClearTimer);
                this.subtitleClearTimer = null;
                var elapsed = Date.now() - this.subtitleStartTime;
                this.subtitleRemainingTime = Math.max(0, this.subtitleDuration - elapsed);
            }
            if (this.useHtml5 && this.videoElement) {
                this.videoElement.pause();
                this.isPaused = true;
                if (!this.isInTimeshift) {
                    this.pauseStartTime = Date.now();
                    this.isInTimeshift = true;
                }
                if (this.onStateChange) this.onStateChange('paused');
            } else if (typeof webapis !== 'undefined' && webapis.avplay) {
                var state = webapis.avplay.getState();
                if (state === 'PLAYING') {
                    webapis.avplay.pause();
                    this.isPaused = true;
                    if (!this.isInTimeshift) {
                        this.pauseStartTime = Date.now();
                        this.isInTimeshift = true;
                    }
                    if (this.onStateChange) this.onStateChange('paused');
                }
            }
        } catch (ex) {
            var msg = ex.message || String(ex);
            if (msg.indexOf('INVALID_OPERATION') === -1) {
                window.log('ERROR', 'Pause: ' + msg);
            }
        }
    }

    resume() {
        window.log('PLAYER', 'resume');
        try {
            if (this.subtitleRemainingTime > 0) {
                var self = this;
                var subtitleEl = document.getElementById('subtitle-display');
                this.subtitleClearTimer = setTimeout(function() {
                    window.displaySubtitle(subtitleEl, '');
                    self.subtitleDuration = 0;
                    self.subtitleRemainingTime = 0;
                    if (window.app && window.app.resetSubtitlePosition) {
                        window.app.resetSubtitlePosition(subtitleEl);
                    }
                }, this.subtitleRemainingTime);
                this.subtitleRemainingTime = 0;
            }
            if (this.useHtml5 && this.videoElement) {
                var self = this;
                var p = this.videoElement.play();
                if (p && p.catch) {
                    p.catch(function(ex) {
                        window.log('ERROR', 'HTML5 play() rejected: ' + ex.message);
                        setTimeout(function() { self.videoElement.play(); }, 200);
                    });
                }
                this.isPaused = false;
                if (this.onStateChange) this.onStateChange('playing');
            } else if (typeof webapis !== 'undefined' && webapis.avplay) {
                var state = webapis.avplay.getState();
                if (state === 'PAUSED') {
                    webapis.avplay.play();
                    this.isPaused = false;
                    if (this.onStateChange) this.onStateChange('playing');
                }
            }
        } catch (ex) {
            window.log('ERROR', 'Resume: ' + (ex.message || ex));
        }
    }

    togglePlayPause() {
        window.log('ACTION', 'togglePlayPause: ' + (this.isPaused ? 'resume' : 'pause'));
        if (this.isPaused) {
            this.resume();
        } else {
            this.pause();
        }
    }

    stop() {
        try {
            this._stopFreezeDetection();
            this._cleanupAudioProcessing();
            this._hidePlayerTypeIndicator();
            if (this.useHtml5 && this.videoElement) {
                this.videoElement.pause();
                this.videoElement.onerror = null;
                this.videoElement.removeAttribute('src');
                this.videoElement.load();
                this.videoElement.style.display = 'none';
            }
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                webapis.avplay.stop();
                webapis.avplay.close();
            }
            this.isPlaying = false;
            this.isPaused = false;
            this.useHtml5 = false;
            if (this.onStateChange) this.onStateChange('stopped');
        } catch (ex) {
            window.log('ERROR', 'Stop: ' + (ex.message || ex));
        }
    }

    seek(seconds) {
        window.log('PLAYER', 'seek ' + seconds + 's');
        try {
            var maxPos = Math.max(0, this.duration - 5000);
            var newTime = Math.max(0, Math.min(this.currentTime + (seconds * 1000), maxPos));
            if (this.useHtml5 && this.videoElement) {
                this.videoElement.currentTime = newTime / 1000;
            } else if (typeof webapis !== 'undefined' && webapis.avplay) {
                webapis.avplay.seekTo(newTime);
            }
        } catch (ex) {
            window.log('ERROR', 'Seek: ' + (ex.message || ex));
        }
    }

    getBufferInfo() {
        try {
            if (this.useHtml5 && this.videoElement) {
                var buffered = this.videoElement.buffered;
                if (buffered.length > 0) {
                    var currentTime = this.videoElement.currentTime;
                    // Find buffer range that contains current time
                    for (var i = 0; i < buffered.length; i++) {
                        if (currentTime >= buffered.start(i) && currentTime <= buffered.end(i)) {
                            var bufferEnd = buffered.end(i);
                            var bufferAhead = bufferEnd - currentTime;
                            return {
                                available: true,
                                seconds: Math.round(bufferAhead),
                                start: buffered.start(i),
                                end: bufferEnd
                            };
                        }
                    }
                }
            }
            // AVPlay doesn't expose buffer info directly, use pause duration instead
            if (this.pauseStartTime) {
                var pauseDuration = Math.round((Date.now() - this.pauseStartTime) / 1000);
                return { available: true, seconds: pauseDuration, isPauseDuration: true };
            }
            return { available: false, seconds: 0 };
        }
        catch (e) {
            return { available: false, seconds: 0 };
        }
    }

    seekTo(milliseconds) {
        try {
            var maxPos = Math.max(0, this.duration - 5000);
            var safePos = Math.min(milliseconds, maxPos);
            window.log('PLAYER', 'seekTo: requested=' + milliseconds + ' duration=' + this.duration + ' safePos=' + safePos);
            if (this.useHtml5 && this.videoElement) {
                this.videoElement.currentTime = safePos / 1000;
            } else if (typeof webapis !== 'undefined' && webapis.avplay) {
                try {
                    webapis.avplay.seekTo(safePos);
                } catch (avEx) {
                    var vid = document.getElementById('samsung_tizen_web_videoplayer');
                    if (vid) vid.currentTime = safePos / 1000;
                }
            }
        } catch (ex) {
            window.log('ERROR', 'SeekTo: ' + (ex.message || ex));
        }
    }

    _getListeners() {
        return {
            onbufferingstart: () => {
                var pos = 0;
                try { pos = webapis.avplay.getCurrentTime(); } catch (e) {}
                window.log('PLAYER', 'Buffering started at ' + formatMs(pos));
                if (this.onStateChange) this.onStateChange('buffering');
            },
            onbufferingprogress: (percent) => {
                if (this.onBufferProgress) this.onBufferProgress(percent);
            },
            onbufferingcomplete: () => {
                window.log('PLAYER', 'Buffering complete');
                if (this.onStateChange) this.onStateChange('playing');
            },
            oncurrentplaytime: (time) => {
                this.currentTime = time;
                if (this.onTimeUpdate) this.onTimeUpdate(time, this.duration);
            },
            onevent: (eventType, eventData) => {
                window.log('PLAYER', 'Event: ' + eventType + ' ' + eventData);
            },
            onerror: (errorType) => {
                var errorMsg = errorType || 'Unknown error';
                if (typeof errorType === 'object') {
                    errorMsg = JSON.stringify(errorType);
                }
                window.log('ERROR', 'Player: ' + errorMsg);
                // Analyze stream info for codec issues
                var errorInfo = {
                    type: errorType,
                    codec: null,
                    width: 0,
                    height: 0,
                    unsupportedCodec: false
                };
                try {
                    var streamInfo = webapis.avplay.getCurrentStreamInfo();
                    for (var i = 0; i < streamInfo.length; i++) {
                        var info = streamInfo[i];
                        if (info.type === 'VIDEO' && info.extra_info) {
                            window.log('PLAYER', 'Video stream: ' + info.extra_info);
                            try {
                                var extra = JSON.parse(info.extra_info);
                                errorInfo.codec = extra.fourCC || extra.codec || null;
                                errorInfo.width = parseInt(extra.Width || extra.width) || 0;
                                errorInfo.height = parseInt(extra.Height || extra.height) || 0;
                            } catch (parseEx) {
                                // Extract from string like "fourCC h265 width 3840 height 2160"
                                var fourccMatch = info.extra_info.match(/fourCC[:\s]+(\w+)/i);
                                if (fourccMatch) {
                                    errorInfo.codec = fourccMatch[1];
                                }
                                var widthMatch = info.extra_info.match(/width[:\s]+(\d+)/i);
                                if (widthMatch) {
                                    errorInfo.width = parseInt(widthMatch[1]) || 0;
                                }
                                var heightMatch = info.extra_info.match(/height[:\s]+(\d+)/i);
                                if (heightMatch) {
                                    errorInfo.height = parseInt(heightMatch[1]) || 0;
                                }
                            }
                            // Check for unsupported codecs
                            if (errorInfo.codec) {
                                var codec = errorInfo.codec.toLowerCase();
                                if (codec === 'h265' || codec === 'hevc' || codec === 'hvc1' || codec === 'hev1') {
                                    errorInfo.unsupportedCodec = true;
                                    errorInfo.codecName = 'HEVC/H.265';
                                }
                                else if (codec === 'av1' || codec === 'av01') {
                                    errorInfo.unsupportedCodec = true;
                                    errorInfo.codecName = 'AV1';
                                }
                                else if (codec === 'vp9') {
                                    errorInfo.unsupportedCodec = true;
                                    errorInfo.codecName = 'VP9';
                                }
                            }
                        }
                    }
                } catch (ex) { /* best effort codec detection */ }
                // Store codec info for HTML5 fallback error
                if (errorInfo.unsupportedCodec) {
                    this.lastCodecError = errorInfo;
                }
                if (this.onError) this.onError(errorInfo);
            },
            onsubtitlechange: (duration, text, data3, data4) => {
                var subtitleText = text || data3 || data4 || '';
                var subtitleEl = document.getElementById('subtitle-display');
                if (subtitleEl && this.subtitlesEnabled && subtitleText) {
                    // Clear previous subtitle timer
                    if (this.subtitleClearTimer) {
                        clearTimeout(this.subtitleClearTimer);
                    }
                    // Parse ASS/SSA tags if app is available
                    var align = null, pos = null;
                    if (window.app && window.app.parseAssaTags) {
                        var parsed = window.app.parseAssaTags(subtitleText);
                        subtitleText = parsed.text;
                        align = parsed.align;
                        pos = parsed.pos;
                        window.app.applySubtitlePosition(subtitleEl, align, pos);
                    }
                    // Also clean \n and \r for embedded subtitles
                    subtitleText = subtitleText.replace(/\r\n|\r|\n/g, '<br>').replace(/(<br>\s*)+/g, '<br>').replace(/^<br>|<br>$/g, '');
                    window.displaySubtitle(subtitleEl, subtitleText);
                    if (duration > 0) {
                        var self = this;
                        this.subtitleStartTime = Date.now();
                        this.subtitleDuration = duration;
                        this.subtitleClearTimer = setTimeout(function() {
                            window.displaySubtitle(subtitleEl, '');
                            self.subtitleDuration = 0;
                            if (window.app && window.app.resetSubtitlePosition) {
                                window.app.resetSubtitlePosition(subtitleEl);
                            }
                        }, duration);
                    }
                }
            },
            ondrmevent: (drmEvent, drmData) => {
                window.log('PLAYER', 'DRM event: ' + drmEvent);
            },
            onstreamcompleted: () => {
                window.log('PLAYER', 'Stream completed');
                this.stop();
                if (this.onStateChange) this.onStateChange('completed');
            }
        };
    }

    getVideoInfo() {
        try {
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                var width = 0;
                var height = 0;
                try {
                    var streamInfo = webapis.avplay.getCurrentStreamInfo();
                    for (var i = 0; i < streamInfo.length; i++) {
                        var info = streamInfo[i];
                        if (info.type === 'VIDEO' && info.extra_info) {
                            var extra = JSON.parse(info.extra_info);
                            width = extra.Width || extra.width || 0;
                            height = extra.Height || extra.height || 0;
                            if (width && height) break;
                        }
                    }
                }
                catch (ex) {
                    window.log('ERROR', 'getCurrentStreamInfo: ' + ex);
                }
                // Fallback to getTotalTrackInfo
                if (!width || !height) {
                    try {
                        var tracks = webapis.avplay.getTotalTrackInfo();
                        for (var j = 0; j < tracks.length; j++) {
                            var track = tracks[j];
                            if (track.type === 'VIDEO' && track.extra_info) {
                                var jsonMatch = track.extra_info.match(/\{[^}]+\}/);
                                if (jsonMatch) {
                                    var trackExtra = JSON.parse(jsonMatch[0]);
                                    width = trackExtra.Width || trackExtra.width || 0;
                                    height = trackExtra.Height || trackExtra.height || 0;
                                    if (width && height) break;
                                }
                            }
                        }
                    }
                    catch (ex2) { /* emulator may return non-JSON */ }
                }
                if (width && height) {
                    var ratio = width / height;
                    var format = '';
                    if (ratio > 2.3) format = '21:9';
                    else if (ratio > 1.7) format = '16:9';
                    else if (ratio > 1.5) format = '16:10';
                    else if (ratio > 1.2) format = '4:3';
                    else format = '1:1';
                    return width + 'x' + height + ' (' + format + ')';
                }
            }
        }
        catch (e) {
            window.log('ERROR', 'getVideoInfo: ' + e);
        }
        return '';
    }

    getTracks() {
        var self = this;
        var result = { audio: [], subtitle: [] };
        try {
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                var tracks = webapis.avplay.getTotalTrackInfo();
                for (var i = 0; i < tracks.length; i++) {
                    var track = tracks[i];
                    var info = track.extra_info ? this._parseTrackInfo(track.extra_info) : {};
                    if (track.type === 'AUDIO') {
                        result.audio.push({
                            index: track.index,
                            lang: info.lang || '',
                            title: info.title || '',
                            codec: info.codec || '',
                            channels: info.channels || '',
                            hearingImpaired: info.hearingImpaired || false,
                            visualImpaired: info.visualImpaired || false,
                            commentary: info.commentary || false,
                            extra: track.extra_info || ''
                        });
                    }
                    else if (track.type === 'TEXT') {
                        result.subtitle.push({
                            index: track.index,
                            lang: info.lang || '',
                            title: info.title || '',
                            codec: info.codec || '',
                            hearingImpaired: info.hearingImpaired || false,
                            forced: info.forced || false,
                            extra: track.extra_info || ''
                        });
                    }
                }
                result.audio = this._addTrackLabels(result.audio, I18n.t('player.audio', 'Audio'));
                result.subtitle = this._addTrackLabels(result.subtitle, I18n.t('player.subtitlesLabel', 'Subtitles'));
            }
        } catch (ex) {
            var msg = ex.message || String(ex);
            if (msg.indexOf('INVALID_STATE') === -1) {
                window.log('ERROR', 'getTracks: ' + msg);
            }
        }
        return result;
    }

    _parseTrackInfo(extraInfo) {
        var info = {};
        try {
            var jsonMatch = extraInfo.match(/\{[^}]+\}/);
            if (jsonMatch) {
                var json = JSON.parse(jsonMatch[0]);
                info.lang = json.language || json.lang || '';
                info.title = json.title || json.name || '';
                info.codec = json.codec || json.fourCC || '';
                info.channels = json.channels || json.channel || '';
                info.hearingImpaired = json.hearing_impaired || json.hearingImpaired || json.deaf || json.sdh || false;
                info.visualImpaired = json.visual_impaired || json.visualImpaired || json.blind || json.ad || false;
                info.commentary = json.commentary || json.comment || false;
                info.forced = json.forced || false;
                info.default = json.default || false;
            }
            var parts = extraInfo.split(',');
            for (var i = 0; i < parts.length; i++) {
                var kv = parts[i].split('=');
                if (kv.length === 2) {
                    var key = kv[0].trim().toLowerCase();
                    var val = kv[1].trim();
                    if (key === 'language' || key === 'lang') info.lang = info.lang || val;
                    if (key === 'title' || key === 'name') info.title = info.title || val;
                    if (key === 'codec' || key === 'fourcc') info.codec = info.codec || val;
                    if (key === 'channels' || key === 'channel') info.channels = info.channels || val;
                    if (key === 'hearing_impaired' || key === 'deaf' || key === 'sdh') info.hearingImpaired = val === 'true' || val === '1';
                    if (key === 'visual_impaired' || key === 'blind' || key === 'ad') info.visualImpaired = val === 'true' || val === '1';
                    if (key === 'commentary') info.commentary = val === 'true' || val === '1';
                    if (key === 'forced') info.forced = val === 'true' || val === '1';
                }
            }
            var lowerExtra = extraInfo.toLowerCase();
            if (!info.hearingImpaired && (lowerExtra.indexOf('sdh') !== -1 || lowerExtra.indexOf('sourd') !== -1 || lowerExtra.indexOf('malentendant') !== -1 || lowerExtra.indexOf('hearing') !== -1)) {
                info.hearingImpaired = true;
            }
            if (!info.visualImpaired && (lowerExtra.indexOf('audiodesc') !== -1 || lowerExtra.indexOf('audio desc') !== -1 || lowerExtra.indexOf('visual') !== -1 || lowerExtra.indexOf('aveugle') !== -1)) {
                info.visualImpaired = true;
            }
            if (!info.commentary && (lowerExtra.indexOf('comment') !== -1 || lowerExtra.indexOf('director') !== -1)) {
                info.commentary = true;
            }
            if (!info.forced && lowerExtra.indexOf('forced') !== -1) {
                info.forced = true;
            }
        } catch (e) { /* best effort parsing */ }
        return info;
    }

    _addTrackLabels(tracks, defaultPrefix) {
        var self = this;
        var langCounts = {};
        var langIndex = {};
        for (var i = 0; i < tracks.length; i++) {
            var t = tracks[i];
            var trimmedLang = (t.lang || '').trim();
            var trimmedCodec = (t.codec || '').trim();
            if ((!trimmedLang || trimmedLang === 'und' || trimmedLang === 'unknown') && trimmedCodec && Regex.shortLangCode.test(trimmedCodec)) {
                t.lang = trimmedCodec.toLowerCase();
                t.codec = '';
            }
        }
        for (var i = 0; i < tracks.length; i++) {
            var lang = tracks[i].lang || 'Unknown';
            langCounts[lang] = (langCounts[lang] || 0) + 1;
        }
        for (var j = 0; j < tracks.length; j++) {
            var t = tracks[j];
            var lang = t.lang || 'Unknown';
            var label = this._formatLang(lang);
            if (t.title) {
                label += ' - ' + t.title;
            } else if (langCounts[lang] > 1) {
                langIndex[lang] = (langIndex[lang] || 0) + 1;
                label += ' #' + langIndex[lang];
            }
            var tags = [];
            if (t.hearingImpaired) tags.push('🦻 ' + I18n.t('player.hearingImpaired', 'HI'));
            if (t.visualImpaired) tags.push('👁️ ' + I18n.t('player.audioDescription', 'AD'));
            if (t.commentary) tags.push('🎬 ' + I18n.t('player.commentary', 'Commentary'));
            if (t.forced) tags.push('⚡ ' + I18n.t('player.forced', 'Forced'));
            if (tags.length > 0) {
                label += ' [' + tags.join(', ') + ']';
            }
            if (t.codec && !Regex.shortLangCode.test(t.codec)) {
                label += ' (' + t.codec.toUpperCase() + ')';
            }
            if (t.channels) {
                label += ' ' + t.channels + 'ch';
            }
            t.language = label || (defaultPrefix + ' ' + (j + 1));
        }
        return tracks;
    }

    _formatLang(code) {
        var langs = {
            'fr': 'Français', 'fre': 'Français', 'fra': 'Français',
            'en': 'English', 'eng': 'English',
            'de': 'Deutsch', 'ger': 'Deutsch', 'deu': 'Deutsch',
            'es': 'Español', 'spa': 'Español',
            'it': 'Italiano', 'ita': 'Italiano',
            'pt': 'Português', 'por': 'Português',
            'ru': 'Русский', 'rus': 'Русский',
            'ja': '日本語', 'jpn': '日本語',
            'ko': '한국어', 'kor': '한국어',
            'zh': '中文', 'chi': '中文', 'zho': '中文',
            'ar': 'العربية', 'ara': 'العربية'
        };
        var lower = (code || '').toLowerCase();
        if (lower === 'und') return I18n.t('player.undetermined', 'Undetermined');
        if (lower === 'unknown') return I18n.t('player.unknown', 'Unknown');
        return langs[lower] || code.toUpperCase();
    }

    setAudioTrack(index) {
        try {
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                webapis.avplay.setSelectTrack('AUDIO', index);
                return true;
            }
        } catch (ex) {
            window.log('ERROR', 'setAudioTrack: ' + (ex.message || ex));
        }
        return false;
    }

    setSubtitleTrack(index) {
        try {
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                // Clear current subtitle display
                var subtitleEl = document.getElementById('subtitle-display');
                if (subtitleEl) subtitleEl.innerHTML = '';
                webapis.avplay.setSelectTrack('TEXT', index);
                // Micro-seek to force subtitle refresh
                var currentPos = this.currentTime;
                if (currentPos > 100) {
                    webapis.avplay.seekTo(currentPos - 100);
                    setTimeout(function() {
                        webapis.avplay.seekTo(currentPos);
                    }, 50);
                }
                return true;
            }
        } catch (e) {
        }
        return false;
    }

    hideSubtitles() {
        this.subtitlesEnabled = false;
        var subtitleEl = document.getElementById('subtitle-display');
        if (subtitleEl) subtitleEl.textContent = '';
        try {
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                webapis.avplay.setSilentSubtitle(true);
            }
        } catch (e) { /* player may not be ready */ }
        return true;
    }

    showSubtitles() {
        this.subtitlesEnabled = true;
        try {
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                webapis.avplay.setSilentSubtitle(false);
            }
        } catch (e) { /* player may not be ready */ }
        return true;
    }

    // Playback speed control
    // AVPlay supports: -16, -8, -4, -2, 1, 2, 4, 8, 16
    // HTML5 supports: 0.25 to 16 (continuous)
    setSpeed(speed) {
        window.log('PLAYER', 'setSpeed: ' + speed);
        this.playbackSpeed = speed;
        try {
            if (this.useHtml5 && this.videoElement) {
                this.videoElement.playbackRate = speed;
                return true;
            }
            else if (typeof webapis !== 'undefined' && webapis.avplay) {
                webapis.avplay.setSpeed(speed);
                return true;
            }
        }
        catch (e) {
            window.log('ERROR', 'setSpeed: ' + e.message);
        }
        return false;
    }

    getSpeed() {
        return this.playbackSpeed;
    }

    // Native subtitle sync (ms offset, positive = delay, negative = advance)
    setSubtitleSync(offsetMs) {
        window.log('PLAYER', 'setSubtitleSync: ' + offsetMs + 'ms');
        try {
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                webapis.avplay.setSubtitlePosition(offsetMs);
                return true;
            }
        }
        catch (e) {
            window.log('ERROR', 'setSubtitleSync: ' + e.message);
        }
        return false;
    }

    // Display mode: 'auto', 'letterbox', 'stretch', 'zoom'
    // AVPlay PLAYER_DISPLAY_MODE: PLAYER_DISPLAY_MODE_LETTER_BOX, PLAYER_DISPLAY_MODE_FULL_SCREEN,
    // PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO
    setDisplayMode(mode) {
        window.log('PLAYER', 'setDisplayMode: ' + mode);
        this.displayMode = mode;
        try {
            if (this.useHtml5 && this.videoElement) {
                // HTML5: use object-fit CSS
                switch (mode) {
                    case 'letterbox':
                        this.videoElement.style.objectFit = 'contain';
                        break;
                    case 'stretch':
                        this.videoElement.style.objectFit = 'fill';
                        break;
                    case 'zoom':
                        this.videoElement.style.objectFit = 'cover';
                        break;
                    default: // auto
                        this.videoElement.style.objectFit = 'contain';
                }
                return true;
            }
            else if (typeof webapis !== 'undefined' && webapis.avplay) {
                var avMode;
                switch (mode) {
                    case 'letterbox':
                        avMode = 'PLAYER_DISPLAY_MODE_LETTER_BOX';
                        break;
                    case 'stretch':
                        avMode = 'PLAYER_DISPLAY_MODE_FULL_SCREEN';
                        break;
                    case 'zoom':
                        avMode = 'PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO';
                        break;
                    default:
                        avMode = 'PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO';
                }
                try { webapis.avplay.setDisplayMethod(avMode); } catch (avEx) { /* emulator */ }
                var vid = document.querySelector('video[src]');
                if (vid) {
                    var fitMap = { letterbox: 'contain', stretch: 'fill', zoom: 'cover', auto: 'contain' };
                    vid.style.objectFit = fitMap[mode] || 'contain';
                }
                return true;
            }
        }
        catch (e) {
            window.log('ERROR', 'setDisplayMode: ' + e.message);
        }
        return false;
    }

    getDisplayMode() {
        return this.displayMode;
    }

    isDisplayModeUseful() {
        try {
            var vid = this.useHtml5 ? this.videoElement : document.querySelector('video[src]');
            if (vid && vid.videoWidth && vid.videoHeight) {
                var ratio = vid.videoWidth / vid.videoHeight;
                return ratio < 1.7 || ratio > 1.8;
            }
            var info = this.getVideoInfo();
            if (info) {
                var match = info.match(/(\d+)x(\d+)/);
                if (match) {
                    var ratio = parseInt(match[1]) / parseInt(match[2]);
                    return ratio < 1.7 || ratio > 1.8;
                }
            }
        } catch (e) { /* */ }
        return false;
    }

    formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
}

window.TVPlayer = TVPlayer;
