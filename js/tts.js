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
    if (this.settings.proxyEnabled) {
        this.warmupAudioPlayer();
    }
    window.log('TTS', 'Initialized (proxy=' + !!this.settings.proxyEnabled + ' url=' + (this.settings.proxyUrl || 'none') + ')');
};

IPTVApp.prototype.warmupAudioPlayer = function() {
    var self = this;
    this.ttsWarmedUp = false;
    try {
        var audio = new Audio();
        audio.volume = 0.01;
        audio.onended = function() {
            self.ttsWarmedUp = true;
            window.log('TTS', 'Audio player warmed up');
        };
        audio.onerror = function() {
            self.ttsWarmedUp = true;
        };
        audio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNAAAAAAAAAAAAAAAAAAAA//tQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//tQZB4P8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
        audio.play().catch(function() {
            self.ttsWarmedUp = true;
        });
    }
    catch (e) {
        this.ttsWarmedUp = true;
    }
};

IPTVApp.prototype.getTTSUrl = function() {
    if (this.settings.proxyEnabled && this.settings.proxyUrl) {
        return this.settings.proxyUrl.replace(/\/+$/, '');
    }
    return null;
};

IPTVApp.prototype.buildTTSUrl = function(ttsUrl, text, lang, engine) {
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
    return url;
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
    for (var j = 0; j < sentenceIndices.length; j++) {
        var span = spans[sentenceIndices[j]];
        if (span) {
            span.classList.add('tts-active');
            if (!firstSpan) firstSpan = span;
        }
    }
    if (firstSpan) {
        var elRect = firstSpan.getBoundingClientRect();
        var containerRect = descEl.getBoundingClientRect();
        if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
            firstSpan.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }
};

IPTVApp.prototype.clearTTSHighlight = function(descEl) {
    if (!descEl) return;
    if (this.ttsOriginalText) {
        descEl.textContent = this.ttsOriginalText;
        this.ttsOriginalText = null;
    }
    this.ttsSentenceMap = null;
};

IPTVApp.prototype.preloadTTS = function(text) {
    var self = this;
    var ttsUrl = this.getTTSUrl();
    if (!ttsUrl || !text || text === this.ttsPreloadedText) return;
    if (this.ttsPreloadedUrl) {
        URL.revokeObjectURL(this.ttsPreloadedUrl);
        this.ttsPreloadedUrl = null;
    }
    this.ttsPreloadedText = text;
    var chunks = this.splitTTSChunks(text);
    if (chunks.length === 1) {
        var url = this.buildTTSUrl(ttsUrl, text);
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';
        xhr.onload = function() {
            if (xhr.status === 200 && self.ttsPreloadedText === text) {
                var blob = xhr.response;
                self.ttsPreloadedUrl = URL.createObjectURL(blob);
                window.log('TTS', 'Preloaded ' + blob.size + ' bytes');
            }
        };
        xhr.send();
    }
    else {
        this.ttsPreloadedChunks = [];
        this.ttsPreloadedChunksTotal = chunks.length;
        this.ttsPreloadedChunksText = text;
        for (var i = 0; i < chunks.length; i++) {
            (function(idx, chunk) {
                var url = self.buildTTSUrl(ttsUrl, chunk);
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.responseType = 'blob';
                xhr.onload = function() {
                    if (xhr.status === 200 && self.ttsPreloadedChunksText === text) {
                        self.ttsPreloadedChunks[idx] = URL.createObjectURL(xhr.response);
                        window.log('TTS', 'Preloaded chunk ' + (idx + 1) + '/' + chunks.length);
                    }
                };
                xhr.send();
            })(i, chunks[i]);
        }
    }
};

IPTVApp.prototype.speakText = function(text, lang, engine) {
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
        var url = this.buildTTSUrl(ttsUrl, text, lang, engine);
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
            var url = self.buildTTSUrl(ttsUrl, chunk, lang, engine);
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
        if (this.ttsChunkIndex === 0) return;
        this.ttsChunkIndex++;
        this.playNextChunk(isPreloaded);
        return;
    }
    this.ttsLoading = false;
    if (descEl) descEl.classList.remove('loading');
    this.highlightTTSChunk(descEl, this.ttsChunkIndex);
    this.ttsAudio = new Audio();
    this.ttsAudio.onplay = function() {
        self.ttsSpeaking = true;
        if (descEl) descEl.classList.add('speaking');
    };
    this.ttsAudio.onended = function() {
        if (!isPreloaded) URL.revokeObjectURL(audioUrl);
        self.ttsChunkIndex++;
        if (self.ttsCancelled) return;
        if (self.ttsChunkIndex < self.ttsChunks.length) {
            self.playNextChunk(isPreloaded);
        }
        else {
            self.ttsSpeaking = false;
            self.ttsAudio = null;
            self.clearTTSHighlight(descEl);
            if (descEl) descEl.classList.remove('speaking');
            window.log('TTS', 'All chunks finished');
        }
    };
    this.ttsAudio.onerror = function() {
        if (!isPreloaded) URL.revokeObjectURL(audioUrl);
        self.ttsChunkIndex++;
        if (self.ttsCancelled) return;
        self.playNextChunk(isPreloaded);
    };
    this.ttsAudio.src = audioUrl;
    this.ttsAudio.play().then(function() {
        window.log('TTS', 'Playing chunk ' + (self.ttsChunkIndex + 1) + '/' + self.ttsChunks.length);
    }).catch(function(err) {
        window.log('TTS', 'Chunk play error: ' + err.message);
        self.ttsSpeaking = false;
        if (descEl) descEl.classList.remove('speaking');
    });
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
        this.ttsTargetEl = descEl;
        var engine = elementId === 'actor-bio' ? 'azure' : null;
        this.speakText(text, null, engine);
    }
};
