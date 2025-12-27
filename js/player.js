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
            }
            window.log('Player initialized');
            return true;
        } catch (e) {
            window.log('Player init error:', e);
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
        try {
            if (!this.audioContext) {
                var AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) {
                    window.log('Web Audio API not supported');
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
            window.log('Audio processing setup error: ' + ex.message);
        }
    }

    _updateDialogueBoost() {
        if (!this.audioContext || !this.audioSource) return;
        try {
            this.audioSource.disconnect();
            if (this.dialogueBoost && this.compressor) {
                this.audioSource.connect(this.compressor);
                this.compressor.connect(this.audioContext.destination);
                window.log('Dialogue boost enabled');
            }
            else {
                this.audioSource.connect(this.audioContext.destination);
                window.log('Dialogue boost disabled');
            }
        }
        catch (ex) {
            window.log('Update dialogue boost error: ' + ex.message);
        }
    }

    _cleanupAudioProcessing() {
        try {
            if (this.audioSource) {
                this.audioSource.disconnect();
                this.audioSource = null;
            }
            if (this.compressor) {
                this.compressor.disconnect();
            }
        }
        catch (ex) {}
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

    play(url, title = '') {
        this.currentUrl = url;
        this.useHtml5 = false;
        this.fallingBackToNative = false;
        this.isInTimeshift = false;
        this.pauseStartTime = null;
        this._cleanupAudioProcessing();
        try {
            // Use HTML5 if preferred or if AVPlay is not available
            if (this.preferHtml5 || typeof webapis === 'undefined' || !webapis.avplay) {
                this.playHtml5(url);
                return;
            }
            webapis.avplay.open(url);
            webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
            webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
            webapis.avplay.setListener(this._getListeners());
            webapis.avplay.prepareAsync(() => {
                webapis.avplay.play();
                this.isPlaying = true;
                this.isPaused = false;
                this.duration = webapis.avplay.getDuration();
                this._updatePlayerTypeIndicator();
                if (this.onStateChange) this.onStateChange('playing');
            }, (error) => {
                if (this.onError) this.onError(error);
            });
        } catch (e) {
            if (this.onError) this.onError(e);
        }
    }

    playNative(url) {
        var self = this;
        this.useHtml5 = false;
        this.currentUrl = url || this.currentUrl;
        window.log('Trying native AVPlay for: ' + this.currentUrl);
        // Stop HTML5 if running
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.src = '';
            this.videoElement.style.display = 'none';
        }
        this._cleanupAudioProcessing();
        try {
            if (typeof webapis === 'undefined' || !webapis.avplay) {
                window.log('AVPlay not available');
                if (this.onError) this.onError({ type: 'NO_AVPLAY', message: 'AVPlay not available' });
                return;
            }
            webapis.avplay.open(this.currentUrl);
            webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
            webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
            webapis.avplay.setListener(this._getListeners());
            webapis.avplay.prepareAsync(() => {
                webapis.avplay.play();
                this.isPlaying = true;
                this.isPaused = false;
                this.duration = webapis.avplay.getDuration();
                this._updatePlayerTypeIndicator();
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
        window.log('Trying HTML5 player for: ' + this.currentUrl);
        // Stop AVPlay if running
        try {
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                webapis.avplay.stop();
                webapis.avplay.close();
            }
        } catch (e) {}
        // Get video element
        if (!this.videoElement) {
            this.videoElement = document.getElementById('html5-video');
        }
        this.videoElement.style.display = 'block';
        this.videoElement.src = this.currentUrl;
        this.videoElement.onloadedmetadata = function() {
            self.duration = self.videoElement.duration * 1000;
        };
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
            if (self.onStateChange) self.onStateChange('playing');
        };
        this.videoElement.onpause = function() {
            self.isPaused = true;
            if (self.onStateChange) self.onStateChange('paused');
        };
        this.videoElement.onwaiting = function() {
            if (self.onStateChange) self.onStateChange('buffering');
        };
        this.videoElement.onended = function() {
            self.isPlaying = false;
            if (self.onStateChange) self.onStateChange('completed');
        };
        this.videoElement.onerror = function(e) {
            window.log('HTML5 player error: ' + (self.videoElement.error ? self.videoElement.error.message : 'Unknown'));
            // Prevent loop when clearing src during fallback
            if (self.fallingBackToNative) {
                return;
            }
            // Fallback to native player if HTML5 fails and AVPlay is available
            if (self.preferHtml5 && typeof webapis !== 'undefined' && webapis.avplay) {
                window.log('HTML5 failed, falling back to native AVPlay');
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
            window.log('HTML5 play() error: ' + e.message);
            // Prevent loop when clearing src during fallback
            if (self.fallingBackToNative) {
                return;
            }
            // Fallback to native player if HTML5 fails and AVPlay is available
            if (self.preferHtml5 && typeof webapis !== 'undefined' && webapis.avplay) {
                window.log('HTML5 play() failed, falling back to native AVPlay');
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
                // Include codec info from AVPlay error if available
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
        try {
            if (this.useHtml5 && this.videoElement) {
                this.videoElement.pause();
                this.isPaused = true;
                // Only set pauseStartTime on first pause (entering timeshift)
                if (!this.isInTimeshift) {
                    this.pauseStartTime = Date.now();
                    this.isInTimeshift = true;
                }
                if (this.onStateChange) this.onStateChange('paused');
            } else if (typeof webapis !== 'undefined' && webapis.avplay) {
                if (this.isPlaying && !this.isPaused) {
                    webapis.avplay.pause();
                    this.isPaused = true;
                    // Only set pauseStartTime on first pause (entering timeshift)
                    if (!this.isInTimeshift) {
                        this.pauseStartTime = Date.now();
                        this.isInTimeshift = true;
                    }
                    if (this.onStateChange) this.onStateChange('paused');
                }
            }
        } catch (e) {
            window.log('Pause error:', e);
        }
    }

    resume() {
        try {
            // Never clear pauseStartTime here - keep tracking buffer duration
            // It's only cleared in returnToLive() or play()
            if (this.useHtml5 && this.videoElement) {
                this.videoElement.play();
                this.isPaused = false;
                if (this.onStateChange) this.onStateChange('playing');
            } else if (typeof webapis !== 'undefined' && webapis.avplay) {
                if (this.isPaused) {
                    webapis.avplay.play();
                    this.isPaused = false;
                    if (this.onStateChange) this.onStateChange('playing');
                }
            }
        } catch (e) {
            window.log('Resume error:', e);
        }
    }

    togglePlayPause() {
        if (this.isPaused) {
            this.resume();
        } else {
            this.pause();
        }
    }

    stop() {
        try {
            this._cleanupAudioProcessing();
            this._hidePlayerTypeIndicator();
            if (this.useHtml5 && this.videoElement) {
                this.videoElement.pause();
                this.videoElement.src = '';
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
        } catch (e) {
            window.log('Stop error:', e);
        }
    }

    seek(seconds) {
        try {
            var maxPos = Math.max(0, this.duration - 5000);
            var newTime = Math.max(0, Math.min(this.currentTime + (seconds * 1000), maxPos));
            if (this.useHtml5 && this.videoElement) {
                this.videoElement.currentTime = newTime / 1000;
            } else if (typeof webapis !== 'undefined' && webapis.avplay) {
                webapis.avplay.seekTo(newTime);
            }
        } catch (e) {
            window.log('Seek error:', e);
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
            if (this.useHtml5 && this.videoElement) {
                this.videoElement.currentTime = safePos / 1000;
            } else if (typeof webapis !== 'undefined' && webapis.avplay) {
                webapis.avplay.seekTo(safePos);
            }
        } catch (e) {
            window.log('SeekTo error:', e);
        }
    }

    _getListeners() {
        return {
            onbufferingstart: () => {
                window.log('Buffering started');
                if (this.onStateChange) this.onStateChange('buffering');
            },
            onbufferingprogress: (percent) => {
                if (percent !== undefined && percent !== null) {
                    window.log('Buffering: ' + percent + '%');
                }
                if (this.onBufferProgress) this.onBufferProgress(percent);
            },
            onbufferingcomplete: () => {
                window.log('Buffering complete');
                if (this.onStateChange) this.onStateChange('playing');
            },
            oncurrentplaytime: (time) => {
                this.currentTime = time;
                if (this.onTimeUpdate) this.onTimeUpdate(time, this.duration);
            },
            onevent: (eventType, eventData) => {
                window.log('Event:', eventType, eventData);
            },
            onerror: (errorType) => {
                var errorMsg = errorType || 'Unknown error';
                if (typeof errorType === 'object') {
                    errorMsg = JSON.stringify(errorType);
                }
                window.log('Player error: ' + errorMsg);
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
                            window.log('Video stream: ' + info.extra_info);
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
                } catch (ex) {}
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
                    // Display immediately (offset only works for external subtitles)
                    window.displaySubtitle(subtitleEl, subtitleText);
                    if (duration > 0) {
                        var self = this;
                        this.subtitleClearTimer = setTimeout(function() {
                            window.displaySubtitle(subtitleEl, '');
                        }, duration);
                    }
                }
            },
            ondrmevent: (drmEvent, drmData) => {
                window.log('DRM event:', drmEvent);
            },
            onstreamcompleted: () => {
                window.log('Stream completed');
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
                // Try getCurrentStreamInfo first (active stream)
                try {
                    var streamInfo = webapis.avplay.getCurrentStreamInfo();
                    window.log('getCurrentStreamInfo: ' + JSON.stringify(streamInfo));
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
                    window.log('getCurrentStreamInfo error: ' + ex);
                }
                // Fallback to getTotalTrackInfo
                if (!width || !height) {
                    try {
                        var tracks = webapis.avplay.getTotalTrackInfo();
                        window.log('getTotalTrackInfo: ' + JSON.stringify(tracks));
                        for (var j = 0; j < tracks.length; j++) {
                            var track = tracks[j];
                            if (track.type === 'VIDEO' && track.extra_info) {
                                var trackExtra = JSON.parse(track.extra_info);
                                width = trackExtra.Width || trackExtra.width || 0;
                                height = trackExtra.Height || trackExtra.height || 0;
                                if (width && height) break;
                            }
                        }
                    }
                    catch (ex2) {
                        window.log('getTotalTrackInfo error: ' + ex2);
                    }
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
            window.log('getVideoInfo error: ' + e);
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
                result.audio = this._addTrackLabels(result.audio, I18n.t('player.audio'));
                result.subtitle = this._addTrackLabels(result.subtitle, I18n.t('player.subtitlesLabel'));
            }
        } catch (e) {
            window.log('getTracks error:', e);
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
        } catch (e) {}
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
            if (t.hearingImpaired) tags.push('🦻 ' + I18n.t('player.hearingImpaired'));
            if (t.visualImpaired) tags.push('👁️ ' + I18n.t('player.audioDescription'));
            if (t.commentary) tags.push('🎬 ' + I18n.t('player.commentary'));
            if (t.forced) tags.push('⚡ ' + I18n.t('player.forced'));
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
        if (lower === 'und') return I18n.t('player.undetermined');
        if (lower === 'unknown') return I18n.t('player.unknown');
        return langs[lower] || code.toUpperCase();
    }

    setAudioTrack(index) {
        try {
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                webapis.avplay.setSelectTrack('AUDIO', index);
                return true;
            }
        } catch (e) {
            window.log('setAudioTrack error:', e);
        }
        return false;
    }

    setSubtitleTrack(index) {
        try {
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                webapis.avplay.setSelectTrack('TEXT', index);
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
        } catch (e) {}
        return true;
    }

    showSubtitles() {
        this.subtitlesEnabled = true;
        try {
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                webapis.avplay.setSilentSubtitle(false);
            }
        } catch (e) {}
        return true;
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
