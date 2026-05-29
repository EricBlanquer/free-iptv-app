/**
 * Text-to-Speech Module
 * Uses Edge-TTS via proxy server for high-quality Microsoft voices
 * Requires proxy to be enabled
 */

IPTVApp.prototype.initTTS = function() {
    this.ttsSupported = true;
    this.ttsSpeaking = false;
    this.ttsLoading = false;
    this.ttsAudio = null;
    this.ttsPreloadedUrl = null;
    this.ttsPreloadedText = null;
    this.ttsChunks = [];
    this.ttsChunkIndex = 0;
    this.ttsCancelled = false;
    this.ttsSentenceMap = null;
    this.ttsOriginalText = null;
    this.ttsWarmedUp = false;
    // Tizen 5 AVPlay cold-start: the first new Audio().play() of a session takes
    // ~466ms to wake the decoder + speaker driver, eating the first word. The
    // server's `pad=N` parameter prepends real ffmpeg-encoded silence to the
    // chunk; AVPlay decodes it during cold-start and the actual voice arrives
    // in a warm pipeline. _ttsSessionNeedsPad stays true until a chunk has
    // actually been played (audio onplay event), not just URL-built — so a
    // preload that consumes a padded URL but never plays (e.g. user clicks
    // Play before preload completes, triggering a fresh fetch) doesn't strand
    // the actual playback with an unpadded chunk-1.
    this._ttsSessionNeedsPad = true;
    window.log('TTS', 'Initialized (proxy=' + !!this.settings.proxyEnabled + ' url=' + (this.settings.proxyUrl || 'none') + ')');
    var self = this;
    setTimeout(function() { self._warmupAudioPipeline(); }, 0);
};

IPTVApp.prototype._warmupAudioPipeline = function() {
    var self = this;
    window.log('TTS', 'Audio pipeline warmup at app startup');
    this._playAudioPrimer(function(ready) {
        self.ttsWarmedUp = !!ready;
        if (!ready) window.log('TTS', 'Startup warmup failed — first speak will fall back to on-demand primer');
    });
};

IPTVApp.prototype.markTTSPipelineCold = function() {
    // End of video playback (player.stop → webapis.avplay.close) puts the audio
    // decoder + speaker driver back to sleep, so the next new Audio().play() is
    // a cold-start again — exactly like at app launch. Re-arm the first-chunk
    // pad, drop any preload built while the pipeline was warm (it carries no
    // pad), and replay the warmup primer so the next spoken description keeps
    // its first word.
    if (this.ttsSpeaking || this.ttsLoading) return;
    if (this._ttsSessionNeedsPad) return;
    this._ttsSessionNeedsPad = true;
    this.clearTTSPreload();
    this._warmupAudioPipeline();
    window.log('TTS', 'pipeline marked cold after playback — pad re-armed');
};

IPTVApp.prototype.getTTSUrl = function() {
    if (this.settings.proxyEnabled) {
        var url = this.settings.proxyUrl || 'https://tts.blanquer.org';
        return url.replace(/\/+$/, '');
    }
    return null;
};

IPTVApp.prototype._getTTSPadForChunk = function(chunkIndex) {
    return (this._ttsSessionNeedsPad && chunkIndex === 0) ? 600 : 0;
};

IPTVApp.prototype.buildTTSUrl = function(ttsUrl, text, lang, engine, padMs) {
    var url = ttsUrl + '/tts?lang=' + encodeURIComponent(lang || I18n.getLocale()) + '&text=' + encodeURIComponent(text) + proxyDuidParam();
    if (engine) {
        url += '&engine=' + encodeURIComponent(engine);
    }
    if (this.settings.ttsVoice) {
        url += '&voice=' + encodeURIComponent(this.settings.ttsVoice);
    }
    if (this.settings.ttsRate) {
        url += '&rate=' + encodeURIComponent((this.settings.ttsRate >= 0 ? '+' : '') + this.settings.ttsRate + '%');
    }
    if (this.settings.ttsVolume) {
        url += '&volume=' + encodeURIComponent((this.settings.ttsVolume >= 0 ? '+' : '') + this.settings.ttsVolume + '%');
    }
    if (this.settings.ttsPitch) {
        url += '&pitch=' + encodeURIComponent((this.settings.ttsPitch >= 0 ? '+' : '') + this.settings.ttsPitch + 'Hz');
    }
    if (padMs && padMs > 0) {
        url += '&pad=' + padMs;
    }
    return url;
};

IPTVApp.prototype._getOrCreateAudioContext = function() {
    if (this._audioCtx) return this._audioCtx;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
        this._audioCtx = new Ctor();
    }
    catch (ex) {
        window.log('TTS', 'AudioContext create failed: ' + (ex && ex.message ? ex.message : ex));
        return null;
    }
    return this._audioCtx;
};

IPTVApp.prototype._playAudioPrimer = function(onReady) {
    var self = this;
    if (this._audioPrimer) {
        var existing = this._audioPrimer;
        if (existing._primerSettled) {
            if (onReady) onReady(existing._primerReady);
        }
        else if (onReady) {
            var prev = existing._primerOnReady;
            existing._primerOnReady = function(r) {
                if (prev) prev(r);
                onReady(r);
            };
        }
        return;
    }
    // Web Audio API instead of HTMLAudioElement: Tizen Chromium 63 rejects
    // synthetic WAV/MP3 blobs (MEDIA_ELEMENT_ERROR code=4 "no supported source"
    // — Layer III side-info too lenient for its decoder). Web Audio takes raw
    // PCM samples — no decode step — and is universally accepted.
    var ctx = this._getOrCreateAudioContext();
    var primer = { _primerSettled: false, _primerReady: false, _primerOnReady: onReady || null, _ctx: ctx };
    var settle = function(reason, ready) {
        if (primer._primerSettled) return;
        primer._primerSettled = true;
        primer._primerReady = !!ready;
        window.log('TTS', 'Primer ' + (ready ? 'ready' : 'failed') + ' (' + reason + ')');
        if (!ready && self._audioPrimer === primer) self._audioPrimer = null;
        var cb = primer._primerOnReady;
        primer._primerOnReady = null;
        if (cb) cb(ready);
    };
    if (!ctx) {
        setTimeout(function() { settle('no-audio-context', false); }, 0);
        this._audioPrimer = primer;
        return;
    }
    var startSource = function() {
        try {
            // 200ms silent buffer, looped = continuous silent samples until we stop.
            // Samples are zero-filled (real PCM silence); a GainNode at 0 is added
            // as defense-in-depth so any future non-zero buffer stays inaudible.
            var sampleRate = ctx.sampleRate || 44100;
            var buf = ctx.createBuffer(1, Math.floor(sampleRate * 0.2), sampleRate);
            var src = ctx.createBufferSource();
            src.buffer = buf;
            src.loop = true;
            var gain = ctx.createGain();
            gain.gain.value = 0;
            src.connect(gain);
            gain.connect(ctx.destination);
            src.start();
            primer._src = src;
            primer._gain = gain;
            settle('bufferSource started', true);
        }
        catch (ex) {
            window.log('TTS', 'BufferSource start failed: ' + (ex && ex.message ? ex.message : ex));
            settle('start exception', false);
        }
    };
    if (ctx.state === 'suspended' && ctx.resume) {
        ctx.resume().then(startSource).catch(function(err) {
            window.log('TTS', 'AudioContext resume rejected: ' + (err && err.message ? err.message : err));
            settle('resume rejected', false);
        });
    }
    else {
        startSource();
    }
    primer._safety = setTimeout(function() { settle('safety 600ms', false); }, 600);
    this._audioPrimer = primer;
};

IPTVApp.prototype._stopAudioPrimer = function() {
    if (!this._audioPrimer) return;
    var primer = this._audioPrimer;
    this._audioPrimer = null;
    if (primer._safety) clearTimeout(primer._safety);
    try {
        if (primer._src) {
            primer._src.stop();
            primer._src.disconnect();
        }
        if (primer._gain) primer._gain.disconnect();
    }
    catch (ex) {}
};

IPTVApp.prototype.splitTTSSentences = function(text) {
    var sentences = text.match(/.*?[a-zà-öù-ü0-9)»"]{2}[.!?]+(?=\s+[A-ZÀ-ÖÙ-Ü0-9«"]|$)/g);
    if (!sentences) return { sentences: [text], chunks: [text], chunkToSentences: [[0]] };
    var trimmed = [];
    for (var i = 0; i < sentences.length; i++) {
        trimmed.push(sentences[i].trim());
    }
    var lastSentence = trimmed[trimmed.length - 1];
    var lastPos = text.lastIndexOf(lastSentence);
    var tail = text.substring(lastPos + lastSentence.length).trim();
    if (tail) trimmed.push(tail);
    var chunks = [];
    var chunkToSentences = [];
    var current = '';
    var currentSentences = [];
    for (var j = 0; j < trimmed.length; j++) {
        if (current.length + trimmed[j].length > 200 && current.length > 0) {
            chunks.push(current.trim());
            chunkToSentences.push(currentSentences);
            current = trimmed[j];
            currentSentences = [j];
        }
        else {
            current += (current ? ' ' : '') + trimmed[j];
            currentSentences.push(j);
        }
    }
    if (current.trim()) {
        chunks.push(current.trim());
        chunkToSentences.push(currentSentences);
    }
    return { sentences: trimmed, chunks: chunks, chunkToSentences: chunkToSentences };
};

IPTVApp.prototype.splitTTSChunks = function(text) {
    return this.splitTTSSentences(text).chunks;
};

IPTVApp.prototype.prepareTTSHighlight = function(descEl, text) {
    var data = this.splitTTSSentences(text);
    this.ttsOriginalText = text;
    descEl.textContent = '';
    for (var i = 0; i < data.sentences.length; i++) {
        var span = document.createElement('span');
        span.className = 'tts-sentence';
        span.dataset.index = i;
        span.textContent = data.sentences[i];
        descEl.appendChild(span);
        if (i < data.sentences.length - 1) {
            descEl.appendChild(document.createTextNode(' '));
        }
    }
    return data.chunkToSentences;
};

IPTVApp.prototype.highlightTTSChunk = function(descEl, chunkIndex) {
    if (!this.ttsSentenceMap || !descEl) return;
    var spans = descEl.querySelectorAll('.tts-sentence');
    for (var i = 0; i < spans.length; i++) {
        spans[i].classList.remove('tts-active');
    }
    var sentenceIndices = this.ttsSentenceMap[chunkIndex];
    if (!sentenceIndices) return;
    var firstSpan = null;
    var lastSpan = null;
    for (var j = 0; j < sentenceIndices.length; j++) {
        var span = spans[sentenceIndices[j]];
        if (span) {
            span.classList.add('tts-active');
            if (!firstSpan) firstSpan = span;
            lastSpan = span;
        }
    }
    if (firstSpan) {
        var containerRect = descEl.getBoundingClientRect();
        var lastRect = lastSpan.getBoundingClientRect();
        var firstRect = firstSpan.getBoundingClientRect();
        if (lastRect.bottom > containerRect.bottom) {
            descEl.scrollTop += lastRect.bottom - containerRect.bottom + 10;
        }
        else if (firstRect.top < containerRect.top) {
            descEl.scrollTop -= containerRect.top - firstRect.top + 10;
        }
    }
};

IPTVApp.prototype.clearTTSHighlight = function(descEl) {
    if (!descEl) return;
    if (this.ttsOriginalText) {
        descEl.textContent = this.ttsOriginalText;
        this.ttsOriginalText = null;
    }
    descEl.scrollTop = 0;
    this.ttsSentenceMap = null;
};

IPTVApp.prototype.showTTSTooltip = function(elementId) {
    try {
        if (localStorage.getItem('ttsUsed')) return;
    }
    catch (ex) { return; }
    this.hideTTSTooltip();
    var self = this;
    var targetId = elementId || 'details-description';
    window.log('TTS', 'showTTSTooltip: targetId=' + targetId);
    this.scheduleTooltipShow('tts', function() {
        window.log('TTS', 'tooltip timer fired: screen=' + self.currentScreen + ' targetId=' + targetId);
        if (self.currentScreen !== 'details' && self.currentScreen !== 'actor') return;
        var descEl = document.getElementById(targetId);
        if (!descEl) { window.log('TTS', 'tooltip: element not found'); return; }
        var rect = descEl.getBoundingClientRect();
        window.log('TTS', 'tooltip: rect.height=' + rect.height + ' rect.top=' + rect.top + ' text="' + (descEl.textContent || '').substring(0, 30) + '"');
        if (!rect.height) return;
        var text = descEl.textContent || '';
        if (!text || text === I18n.t('details.noDescription', 'No description') || text === I18n.t('details.noBiography', 'No biography')) return;
        var tooltip = document.createElement('div');
        tooltip.className = 'tts-tooltip below';
        tooltip.id = 'tts-tooltip';
        tooltip.textContent = I18n.t('tips.clickToListen', 'Click to listen');
        tooltip.style.position = 'fixed';
        tooltip.style.top = (rect.bottom + 15) + 'px';
        tooltip.style.right = (window.innerWidth - rect.right + 10) + 'px';
        document.body.appendChild(tooltip);
        setTimeout(function() { tooltip.classList.add('visible'); }, 100);
    }, 1000);
};

IPTVApp.prototype.hideTTSTooltip = function() {
    this.cancelTooltipShow('tts');
    var existing = document.getElementById('tts-tooltip');
    if (existing) existing.remove();
};

IPTVApp.prototype.dismissTTSTooltip = function() {
    this.hideTTSTooltip();
    try { localStorage.setItem('ttsUsed', '1'); }
    catch (ex) { /* ignore */ }
};

IPTVApp.prototype.preloadTTS = function(text) {
    var self = this;
    var ttsUrl = this.getTTSUrl();
    if (!text) return;
    if (!ttsUrl || text === this.ttsPreloadedText) return;
    this.clearTTSPreload();
    this.ttsPreloadedText = text;
    this.ttsPreloadXhrs = [];
    var chunks = this.splitTTSChunks(text);
    window.log('TTS', 'preload start: ' + chunks.length + ' chunk(s) for "' + text.substring(0, 40) + '..."');
    if (chunks.length === 1) {
        var url = this.buildTTSUrl(ttsUrl, text, null, null, this._getTTSPadForChunk(0));
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';
        xhr.onload = function() {
            if (xhr.status === 200 && self.ttsPreloadedText === text) {
                var blob = xhr.response;
                self.ttsPreloadedUrl = URL.createObjectURL(blob);
                window.log('TTS', 'Preloaded ' + blob.size + ' bytes');
            }
            else if (self.ttsPreloadedText !== text) {
                window.log('TTS', 'preload xhr discarded (text changed)');
            }
        };
        this.ttsPreloadXhrs.push(xhr);
        xhr.send();
    }
    else {
        this.ttsPreloadedChunks = [];
        this.ttsPreloadedChunksTotal = chunks.length;
        this.ttsPreloadedChunksText = text;
        for (var i = 0; i < chunks.length; i++) {
            (function(idx, chunk) {
                var url = self.buildTTSUrl(ttsUrl, chunk, null, null, self._getTTSPadForChunk(idx));
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.responseType = 'blob';
                xhr.onload = function() {
                    if (xhr.status === 200 && self.ttsPreloadedChunksText === text) {
                        self.ttsPreloadedChunks[idx] = URL.createObjectURL(xhr.response);
                        window.log('TTS', 'Preloaded chunk ' + (idx + 1) + '/' + chunks.length);
                    }
                    else if (self.ttsPreloadedChunksText !== text) {
                        window.log('TTS', 'preload chunk ' + (idx + 1) + ' discarded (text changed)');
                    }
                };
                self.ttsPreloadXhrs.push(xhr);
                xhr.send();
            })(i, chunks[i]);
        }
    }
};

IPTVApp.prototype._warmupAndSpeak = function(text, lang, engine) {
    var self = this;
    this.ttsWarmedUp = true;
    window.log('TTS', 'First TTS: warming audio pipeline before fetch');
    this._playAudioPrimer(function() {
        self._doSpeakText(text, lang, engine);
    });
};

IPTVApp.prototype.speakText = function(text, lang, engine) {
    if (!Premium.isPremium()) return;
    var self = this;
    var descEl = this.ttsTargetEl || document.getElementById('details-description');
    this.stopTTS();
    this.ttsTargetEl = descEl;
    if (!this._audioCtx && (window.AudioContext || window.webkitAudioContext)) {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._audioCtx && this._audioCtx.state === 'suspended') {
        this._audioCtx.resume();
    }
    if (!this.ttsWarmedUp) {
        this._warmupAndSpeak(text, lang, engine);
        return true;
    }
    return this._doSpeakText(text, lang, engine);
};

IPTVApp.prototype._doSpeakText = function(text, lang, engine) {
    var self = this;
    var descEl = this.ttsTargetEl || document.getElementById('details-description');
    var ttsUrl = this.getTTSUrl();
    if (!ttsUrl) return false;
    window.log('TTS', 'Using ' + (engine || 'edge') + '-TTS: ' + ttsUrl);
    if (this.ttsPreloadedUrl && this.ttsPreloadedText === text) {
        window.log('TTS', 'Using preloaded audio');
        var preloadedUrl = this.ttsPreloadedUrl;
        this.ttsPreloadedUrl = null;
        this.ttsPreloadedText = null;
        this.ttsSentenceMap = this.prepareTTSHighlight(descEl, text);
        this.playTTSAudio(preloadedUrl, descEl, false);
        return true;
    }
    if (this.ttsPreloadedChunks && this.ttsPreloadedChunksText === text) {
        var allReady = this.ttsPreloadedChunks.length === this.ttsPreloadedChunksTotal;
        if (allReady) {
            for (var pi = 0; pi < this.ttsPreloadedChunks.length; pi++) {
                if (!this.ttsPreloadedChunks[pi]) { allReady = false; break; }
            }
        }
        if (allReady) {
            window.log('TTS', 'Using preloaded chunks');
            this.ttsChunks = this.ttsPreloadedChunks;
            this.ttsPreloadedChunks = null;
            this.ttsPreloadedChunksText = null;
            this.ttsChunkIndex = 0;
            this.ttsCancelled = false;
            this.ttsChunkDescEl = descEl;
            this.ttsSentenceMap = this.prepareTTSHighlight(descEl, text);
            this.playNextChunk(false);
            return true;
        }
        window.log('TTS', 'Preloaded chunks incomplete, fetching normally');
        this.clearTTSPreload();
    }
    var chunks = this.splitTTSChunks(text);
    if (chunks.length === 1) {
        var url = this.buildTTSUrl(ttsUrl, text, lang, engine, this._getTTSPadForChunk(0));
        this.ttsLoading = true;
        if (descEl) {
            descEl.classList.remove('speaking');
            descEl.classList.add('loading');
        }
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';
        xhr.onload = function() {
            self.ttsLoading = false;
            if (descEl) descEl.classList.remove('loading');
            if (xhr.status === 200) {
                var audioUrl = URL.createObjectURL(xhr.response);
                self.ttsSentenceMap = self.prepareTTSHighlight(descEl, text);
                self.playTTSAudio(audioUrl, descEl, false);
            }
            else {
                window.log('TTS', 'HTTP error: ' + xhr.status);
            }
        };
        xhr.onerror = function() {
            window.log('TTS', 'XHR error');
            self.ttsLoading = false;
            if (descEl) descEl.classList.remove('loading');
        };
        xhr.send();
        return true;
    }
    window.log('TTS', 'Splitting into ' + chunks.length + ' chunks');
    this.ttsChunks = new Array(chunks.length);
    this.ttsChunkIndex = 0;
    this.ttsCancelled = false;
    this.ttsChunkDescEl = descEl;
    this.ttsChunkXhrs = [];
    this.ttsLoading = true;
    this.ttsSentenceMap = this.prepareTTSHighlight(descEl, text);
    if (descEl) {
        descEl.classList.remove('speaking');
        descEl.classList.add('loading');
    }
    for (var i = 0; i < chunks.length; i++) {
        (function(idx, chunk) {
            var url = self.buildTTSUrl(ttsUrl, chunk, lang, engine, self._getTTSPadForChunk(i));
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'blob';
            xhr.onload = function() {
                if (self.ttsCancelled) return;
                if (xhr.status === 200) {
                    self.ttsChunks[idx] = URL.createObjectURL(xhr.response);
                    window.log('TTS', 'Chunk ' + (idx + 1) + '/' + chunks.length + ' ready');
                    if (idx === self.ttsChunkIndex) {
                        self.playNextChunk(false);
                    }
                }
            };
            xhr.onerror = function() {
                if (self.ttsCancelled) return;
                window.log('TTS', 'Chunk ' + (idx + 1) + ' error');
                self.ttsChunks[idx] = null;
                if (idx === self.ttsChunkIndex) {
                    self.playNextChunk(false);
                }
            };
            self.ttsChunkXhrs.push(xhr);
            xhr.send();
        })(i, chunks[i]);
    }
    return true;
};

IPTVApp.prototype.playNextChunk = function(isPreloaded) {
    var self = this;
    var descEl = this.ttsChunkDescEl;
    if (this.ttsCancelled) return;
    if (this.ttsChunkIndex >= this.ttsChunks.length) {
        this.ttsSpeaking = false;
        this.ttsLoading = false;
        this.ttsAudio = null;
        this.clearTTSHighlight(descEl);
        if (descEl) {
            descEl.classList.remove('speaking');
            descEl.classList.remove('loading');
        }
        window.log('TTS', 'All chunks finished');
        return;
    }
    var audioUrl = this.ttsChunks[this.ttsChunkIndex];
    if (!audioUrl) {
        return;
    }
    this.ttsLoading = false;
    if (descEl) descEl.classList.remove('loading');
    this.highlightTTSChunk(descEl, this.ttsChunkIndex);
    var chunkLabel = (this.ttsChunkIndex + 1) + '/' + this.ttsChunks.length;
    this.ttsAudio = new Audio();
    this.ttsAudio.preload = 'auto';
    var started = false;
    var fireStart = function() {
        if (started || !self.ttsAudio || self.ttsCancelled) return;
        started = true;
        self.ttsAudio.oncanplaythrough = null;
        self.ttsAudio.onloadeddata = null;
        var dur = self.ttsAudio.duration;
        window.log('TTS', 'chunk ' + chunkLabel + ' ready to play (duration=' + (isFinite(dur) ? dur.toFixed(2) + 's' : '?') + ')');
        self.ttsAudio.play().then(function() {
            window.log('TTS', 'Playing chunk ' + chunkLabel);
        }).catch(function(err) {
            window.log('TTS', 'Chunk play error: ' + err.message);
            self.ttsSpeaking = false;
            if (descEl) descEl.classList.remove('speaking');
        });
    };
    this.ttsAudio.onplay = function() {
        self.ttsSpeaking = true;
        if (self._ttsSessionNeedsPad && self.ttsChunkIndex === 0) {
            self._ttsSessionNeedsPad = false;
            window.log('TTS', 'pad consumed (first chunk played)');
        }
        self._stopAudioPrimer();
        if (descEl) descEl.classList.add('speaking');
    };
    this.ttsAudio.oncanplaythrough = fireStart;
    this.ttsAudio.onloadeddata = function() {
        window.log('TTS', 'chunk ' + chunkLabel + ' loadeddata (currentTime=' + self.ttsAudio.currentTime.toFixed(3) + ')');
    };
    this.ttsAudio.onended = function() {
        var played = self.ttsAudio ? self.ttsAudio.currentTime : 0;
        var dur = self.ttsAudio ? self.ttsAudio.duration : 0;
        window.log('TTS', 'chunk ' + chunkLabel + ' ended (played=' + played.toFixed(2) + 's / ' + (isFinite(dur) ? dur.toFixed(2) + 's' : '?') + ')');
        if (!isPreloaded) URL.revokeObjectURL(audioUrl);
        self.ttsChunkIndex++;
        if (self.ttsCancelled) return;
        if (self.ttsChunkIndex < self.ttsChunks.length) {
            self.playNextChunk(isPreloaded);
        }
        else {
            self.ttsSpeaking = false;
            self.clearTTSHighlight(descEl);
            if (descEl) descEl.classList.remove('speaking');
            window.log('TTS', 'All chunks finished');
        }
    };
    this.ttsAudio.onerror = function(e) {
        var code = (self.ttsAudio && self.ttsAudio.error) ? self.ttsAudio.error.code : '?';
        window.log('TTS', 'chunk ' + chunkLabel + ' error (mediaError=' + code + ')');
        if (!isPreloaded) URL.revokeObjectURL(audioUrl);
        self.ttsChunkIndex++;
        if (self.ttsCancelled) return;
        self.playNextChunk(isPreloaded);
    };
    window.log('TTS', 'chunk ' + chunkLabel + ' src set, waiting for canplaythrough');
    this.ttsAudio.src = audioUrl;
    setTimeout(function() {
        if (!started && self.ttsAudio && !self.ttsCancelled && self.ttsAudio.readyState >= 3) {
            window.log('TTS', 'chunk ' + chunkLabel + ' canplaythrough timeout fallback (readyState=' + self.ttsAudio.readyState + ')');
            fireStart();
        }
    }, 2000);
};

IPTVApp.prototype.playTTSAudio = function(audioUrl, descEl, isPreloaded) {
    var self = this;
    this.ttsAudio = new Audio();
    this.ttsAudio.preload = 'auto';
    this.ttsAudio.oncanplaythrough = function() {
        self.ttsAudio.oncanplaythrough = null;
        setTimeout(function() {
            if (!self.ttsAudio) return;
            if (self.ttsSentenceMap) self.highlightTTSChunk(descEl, 0);
            self.ttsAudio.play().then(function() {
                window.log('TTS', 'Playing audio');
            }).catch(function(err) {
                window.log('TTS', 'Play error: ' + err.message);
                self.ttsSpeaking = false;
                if (descEl) descEl.classList.remove('speaking');
            });
        }, 300);
    };
    this.ttsAudio.onplay = function() {
        self.ttsSpeaking = true;
        if (self._ttsSessionNeedsPad) {
            self._ttsSessionNeedsPad = false;
            window.log('TTS', 'pad consumed (single-blob played)');
        }
        self._stopAudioPrimer();
        if (descEl) descEl.classList.add('speaking');
    };
    this.ttsAudio.onended = function() {
        self.ttsSpeaking = false;
        self.ttsAudio = null;
        self.clearTTSHighlight(descEl);
        if (descEl) descEl.classList.remove('speaking');
        if (!isPreloaded) URL.revokeObjectURL(audioUrl);
        window.log('TTS', 'Finished speaking');
    };
    this.ttsAudio.onerror = function() {
        self.ttsSpeaking = false;
        self.clearTTSHighlight(descEl);
        if (descEl) descEl.classList.remove('speaking');
        if (!isPreloaded) URL.revokeObjectURL(audioUrl);
        window.log('TTS', 'Audio playback error');
    };
    this.ttsAudio.src = audioUrl;
};

IPTVApp.prototype.speakTextFallback = function(text, lang) {
    if (!('speechSynthesis' in window)) {
        window.log('TTS', 'No TTS available (no proxy, no Web Speech API)');
        return false;
    }
    var self = this;
    var descEl = this.ttsTargetEl || document.getElementById('details-description');
    var utterance = new SpeechSynthesisUtterance(text);
    var voices = speechSynthesis.getVoices();
    var langCode = lang || I18n.getLocale();
    for (var i = 0; i < voices.length; i++) {
        if (voices[i].lang.startsWith(langCode)) {
            utterance.voice = voices[i];
            break;
        }
    }
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onstart = function() {
        self.ttsSpeaking = true;
        if (descEl) descEl.classList.add('speaking');
        window.log('TTS', 'Fallback started');
    };
    utterance.onend = function() {
        self.ttsSpeaking = false;
        if (descEl) descEl.classList.remove('speaking');
        window.log('TTS', 'Fallback finished');
    };
    utterance.onerror = function(event) {
        self.ttsSpeaking = false;
        if (descEl) descEl.classList.remove('speaking');
        window.log('TTS', 'Fallback error: ' + event.error);
    };
    speechSynthesis.speak(utterance);
    return true;
};

IPTVApp.prototype.stopTTS = function() {
    this.ttsCancelled = true;
    if (this.ttsChunkXhrs) {
        for (var i = 0; i < this.ttsChunkXhrs.length; i++) {
            try { this.ttsChunkXhrs[i].abort(); } catch (e) {}
        }
        this.ttsChunkXhrs = [];
    }
    if (this.ttsAudio) {
        this.ttsAudio.pause();
        this.ttsAudio.onplay = null;
        this.ttsAudio.onended = null;
        this.ttsAudio.onerror = null;
        this.ttsAudio.oncanplaythrough = null;
        this.ttsAudio.onloadeddata = null;
        this.ttsAudio.src = '';
        this.ttsAudio = null;
    }
    if ('speechSynthesis' in window && speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
    if (this.ttsChunks) {
        for (var j = this.ttsChunkIndex; j < this.ttsChunks.length; j++) {
            if (this.ttsChunks[j]) URL.revokeObjectURL(this.ttsChunks[j]);
        }
    }
    this.ttsChunks = [];
    this.ttsChunkIndex = 0;
    this.ttsSpeaking = false;
    this.ttsLoading = false;
    var descEl = this.ttsTargetEl || document.getElementById('details-description');
    this.clearTTSHighlight(descEl);
    if (descEl) {
        descEl.classList.remove('speaking');
        descEl.classList.remove('loading');
    }
    this.ttsTargetEl = null;
};

IPTVApp.prototype.clearTTSPreload = function() {
    var aborted = 0;
    if (this.ttsPreloadXhrs && this.ttsPreloadXhrs.length) {
        for (var x = 0; x < this.ttsPreloadXhrs.length; x++) {
            try {
                if (this.ttsPreloadXhrs[x].readyState !== 4) {
                    this.ttsPreloadXhrs[x].abort();
                    aborted++;
                }
            }
            catch (e) {}
        }
        this.ttsPreloadXhrs = null;
    }
    if (this.ttsPreloadedUrl) {
        URL.revokeObjectURL(this.ttsPreloadedUrl);
        this.ttsPreloadedUrl = null;
        this.ttsPreloadedText = null;
    }
    if (this.ttsPreloadedChunks) {
        for (var i = 0; i < this.ttsPreloadedChunks.length; i++) {
            if (this.ttsPreloadedChunks[i]) URL.revokeObjectURL(this.ttsPreloadedChunks[i]);
        }
        this.ttsPreloadedChunks = null;
        this.ttsPreloadedChunksText = null;
    }
    if (aborted > 0) {
        window.log('TTS', 'preload cleared (aborted ' + aborted + ' in-flight XHR)');
    }
};

IPTVApp.prototype.toggleDescriptionTTS = function(elementId) {
    var descEl = document.getElementById(elementId || 'details-description');
    if (!descEl) return;
    var text = descEl.textContent.trim();
    if (!text) {
        window.log('TTS', 'No description to read');
        return;
    }
    if (this.ttsSpeaking || this.ttsLoading) {
        this.stopTTS();
    }
    else {
        this.dismissTTSTooltip();
        this.ttsTargetEl = descEl;
        var engine = elementId === 'actor-bio' ? 'azure' : null;
        this.speakText(text, null, engine);
    }
};
