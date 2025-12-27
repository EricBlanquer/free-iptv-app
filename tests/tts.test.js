window.log = jest.fn();

var fs = require('fs');

var xhrInstances = [];

function MockXHR() {
    this.headers = {};
    this.method = null;
    this.url = null;
    this.timeout = 0;
    this.responseText = '';
    this.responseType = '';
    this.response = null;
    this.status = 200;
    this.readyState = 0;
    this.onload = null;
    this.onerror = null;
    this.sentData = null;
    xhrInstances.push(this);
}
MockXHR.prototype.open = function(method, url) {
    this.method = method;
    this.url = url;
};
MockXHR.prototype.setRequestHeader = function(key, value) {
    this.headers[key] = value;
};
MockXHR.prototype.send = function(data) {
    this.sentData = data;
};
MockXHR.prototype.abort = jest.fn();

global.XMLHttpRequest = MockXHR;

var mockAudioInstances = [];
var mockPlayPromise = Promise.resolve();

global.Audio = function() {
    var audio = {
        src: '',
        preload: '',
        onplay: null,
        onended: null,
        onerror: null,
        oncanplaythrough: null,
        pause: jest.fn(),
        play: jest.fn(function() { return mockPlayPromise; })
    };
    mockAudioInstances.push(audio);
    return audio;
};

global.URL = {
    createObjectURL: jest.fn(function() { return 'blob:mock-url-' + Math.random(); }),
    revokeObjectURL: jest.fn()
};

global.AudioContext = jest.fn(function() {
    return { state: 'running', resume: jest.fn() };
});

var I18n = { getLocale: function() { return 'fr'; } };
global.I18n = I18n;

function proxyDuidParam() { return '&duid=test123'; }
global.proxyDuidParam = proxyDuidParam;

function IPTVApp() {
    this.settings = {
        proxyEnabled: true,
        proxyUrl: 'http://proxy.example.com',
        ttsVoice: '',
        ttsRate: 0,
        ttsVolume: 0,
        ttsPitch: 0
    };
    this.ttsTargetEl = null;
    this._audioCtx = null;
    this._ttsPadFirstChunk = false;
}
global.IPTVApp = IPTVApp;

var ttsCode = fs.readFileSync('./js/tts.js', 'utf8');
eval(ttsCode);

function createMockDescEl() {
    var el = document.createElement('div');
    el.id = 'details-description';
    el.textContent = 'Some description text.';
    el.scrollTop = 0;
    el.getBoundingClientRect = function() { return { top: 0, bottom: 500 }; };
    return el;
}

function tick() {
    return new Promise(function(r) { setTimeout(r, 10); });
}

describe('TTS', function() {
    var app;

    beforeEach(function() {
        xhrInstances = [];
        mockAudioInstances = [];
        mockPlayPromise = Promise.resolve();
        URL.createObjectURL.mockClear();
        URL.revokeObjectURL.mockClear();
        app = new IPTVApp();
        app.initTTS();
    });

    describe('initTTS', function() {
        it('should initialize TTS state', function() {
            expect(app.ttsSupported).toBe(true);
            expect(app.ttsSpeaking).toBe(false);
            expect(app.ttsLoading).toBe(false);
            expect(app.ttsAudio).toBeNull();
            expect(app.ttsPreloadedUrl).toBeNull();
            expect(app.ttsChunks).toEqual([]);
        });
    });

    describe('getTTSUrl', function() {
        it('should return proxy URL when proxy is enabled', function() {
            expect(app.getTTSUrl()).toBe('http://proxy.example.com');
        });

        it('should strip trailing slashes', function() {
            app.settings.proxyUrl = 'http://proxy.example.com///';
            expect(app.getTTSUrl()).toBe('http://proxy.example.com');
        });

        it('should return null when proxy is disabled', function() {
            app.settings.proxyEnabled = false;
            expect(app.getTTSUrl()).toBeNull();
        });

        it('should return null when proxy URL is empty', function() {
            app.settings.proxyUrl = '';
            expect(app.getTTSUrl()).toBeNull();
        });
    });

    describe('buildTTSUrl', function() {
        it('should construct URL with text and language', function() {
            var url = app.buildTTSUrl('http://proxy.example.com', 'Hello world', 'en');
            expect(url).toContain('/tts?');
            expect(url).toContain('lang=en');
            expect(url).toContain('text=' + encodeURIComponent('Hello world'));
            expect(url).toContain('duid=test123');
        });

        it('should use I18n locale when lang is not specified', function() {
            var url = app.buildTTSUrl('http://proxy.example.com', 'Bonjour');
            expect(url).toContain('lang=fr');
        });

        it('should include engine parameter', function() {
            var url = app.buildTTSUrl('http://proxy.example.com', 'test', 'en', 'azure');
            expect(url).toContain('engine=azure');
        });

        it('should include voice setting', function() {
            app.settings.ttsVoice = 'fr-FR-DeniseNeural';
            var url = app.buildTTSUrl('http://proxy.example.com', 'test');
            expect(url).toContain('voice=' + encodeURIComponent('fr-FR-DeniseNeural'));
        });

        it('should include rate with sign', function() {
            app.settings.ttsRate = 10;
            var url = app.buildTTSUrl('http://proxy.example.com', 'test');
            expect(url).toContain('rate=' + encodeURIComponent('+10%'));
        });

        it('should include negative rate', function() {
            app.settings.ttsRate = -20;
            var url = app.buildTTSUrl('http://proxy.example.com', 'test');
            expect(url).toContain('rate=' + encodeURIComponent('-20%'));
        });

        it('should add pad parameter on first chunk', function() {
            app._ttsPadFirstChunk = true;
            var url = app.buildTTSUrl('http://proxy.example.com', 'test');
            expect(url).toContain('pad=200');
            expect(app._ttsPadFirstChunk).toBe(false);
        });
    });

    describe('splitTTSChunks', function() {
        it('should return single chunk for short text', function() {
            var chunks = app.splitTTSChunks('Hello world.');
            expect(chunks.length).toBe(1);
            expect(chunks[0]).toBe('Hello world.');
        });

        it('should split long text into multiple chunks', function() {
            var longText = 'This is a first sentence. This is a second sentence that is quite long and detailed. ' +
                'Another sentence here to fill space. Yet another one to make it longer. ' +
                'And one more sentence to push it over the limit. Plus a final one for good measure.';
            var chunks = app.splitTTSChunks(longText);
            expect(chunks.length).toBeGreaterThan(1);
            chunks.forEach(function(chunk) {
                expect(chunk.length).toBeLessThanOrEqual(250);
            });
        });
    });

    describe('splitTTSSentences', function() {
        it('should split text into sentences', function() {
            var result = app.splitTTSSentences('First sentence. Second sentence. Third sentence.');
            expect(result.sentences.length).toBe(3);
            expect(result.sentences[0]).toBe('First sentence.');
            expect(result.sentences[1]).toBe('Second sentence.');
        });

        it('should return single sentence for text without sentence breaks', function() {
            var result = app.splitTTSSentences('no sentence break here');
            expect(result.sentences).toEqual(['no sentence break here']);
            expect(result.chunks).toEqual(['no sentence break here']);
        });

        it('should map chunks to sentence indices', function() {
            var result = app.splitTTSSentences('Short one. Another short one.');
            expect(result.chunkToSentences).toBeDefined();
            expect(result.chunkToSentences.length).toBeGreaterThan(0);
        });
    });

    describe('preloadTTS', function() {
        it('should make XHR request for single-chunk text', function() {
            app.preloadTTS('Short text.');
            expect(xhrInstances.length).toBe(1);
            expect(xhrInstances[0].responseType).toBe('blob');
            expect(xhrInstances[0].url).toContain('/tts?');
        });

        it('should not preload same text twice', function() {
            app.preloadTTS('Short text.');
            app.preloadTTS('Short text.');
            expect(xhrInstances.length).toBe(1);
        });

        it('should revoke old preloaded URL on new preload', function() {
            app.ttsPreloadedUrl = 'blob:old-url';
            app.preloadTTS('New text.');
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:old-url');
        });

        it('should store preloaded URL on success', function() {
            app.preloadTTS('Short text.');
            xhrInstances[0].status = 200;
            xhrInstances[0].response = new Blob(['audio-data'], { type: 'audio/mp3' });
            if (xhrInstances[0].onload) xhrInstances[0].onload();
            expect(app.ttsPreloadedUrl).not.toBeNull();
            expect(URL.createObjectURL).toHaveBeenCalled();
        });

        it('should make multiple XHR requests for multi-chunk text', function() {
            var longText = 'This is a first sentence that is moderately long. This is a second sentence with more content. ' +
                'A third sentence follows here. Then a fourth sentence adds length. ' +
                'A fifth sentence continues on. And a sixth one wraps it up nicely.';
            app.preloadTTS(longText);
            expect(xhrInstances.length).toBeGreaterThan(1);
        });

        it('should not preload when proxy is not configured', function() {
            app.settings.proxyEnabled = false;
            app.preloadTTS('Some text.');
            expect(xhrInstances.length).toBe(0);
        });

        it('should not preload empty text', function() {
            app.preloadTTS('');
            expect(xhrInstances.length).toBe(0);
        });
    });

    describe('stopTTS', function() {
        it('should set cancelled flag', function() {
            app.stopTTS();
            expect(app.ttsCancelled).toBe(true);
        });

        it('should pause and clear audio', function() {
            var mockAudio = { pause: jest.fn(), onplay: null, onended: null, onerror: null, oncanplaythrough: null, src: 'test' };
            app.ttsAudio = mockAudio;
            app.stopTTS();
            expect(mockAudio.pause).toHaveBeenCalled();
            expect(app.ttsAudio).toBeNull();
        });

        it('should abort pending XHRs', function() {
            var mockXhr1 = { abort: jest.fn() };
            var mockXhr2 = { abort: jest.fn() };
            app.ttsChunkXhrs = [mockXhr1, mockXhr2];
            app.stopTTS();
            expect(mockXhr1.abort).toHaveBeenCalled();
            expect(mockXhr2.abort).toHaveBeenCalled();
        });

        it('should revoke remaining chunk URLs', function() {
            app.ttsChunks = ['blob:url1', 'blob:url2', 'blob:url3'];
            app.ttsChunkIndex = 1;
            app.stopTTS();
            expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:url1');
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url2');
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url3');
        });

        it('should reset speaking and loading state', function() {
            app.ttsSpeaking = true;
            app.ttsLoading = true;
            app.stopTTS();
            expect(app.ttsSpeaking).toBe(false);
            expect(app.ttsLoading).toBe(false);
        });
    });

    describe('clearTTSPreload', function() {
        it('should revoke preloaded URL', function() {
            app.ttsPreloadedUrl = 'blob:preloaded';
            app.ttsPreloadedText = 'some text';
            app.clearTTSPreload();
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preloaded');
            expect(app.ttsPreloadedUrl).toBeNull();
            expect(app.ttsPreloadedText).toBeNull();
        });

        it('should revoke preloaded chunk URLs', function() {
            app.ttsPreloadedChunks = ['blob:c1', 'blob:c2', null];
            app.ttsPreloadedChunksText = 'text';
            app.clearTTSPreload();
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:c1');
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:c2');
            expect(app.ttsPreloadedChunks).toBeNull();
        });
    });

    describe('playTTSAudio', function() {
        it('should create Audio element and set src', function() {
            var descEl = createMockDescEl();
            app.playTTSAudio('blob:test-url', descEl, false);
            expect(mockAudioInstances.length).toBe(1);
            expect(mockAudioInstances[0].src).toBe('blob:test-url');
        });

        it('should set speaking state on play', function() {
            var descEl = createMockDescEl();
            app.playTTSAudio('blob:test-url', descEl, false);
            mockAudioInstances[0].onplay();
            expect(app.ttsSpeaking).toBe(true);
        });

        it('should clean up on ended', function() {
            var descEl = createMockDescEl();
            app.playTTSAudio('blob:test-url', descEl, false);
            mockAudioInstances[0].onended();
            expect(app.ttsSpeaking).toBe(false);
            expect(app.ttsAudio).toBeNull();
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
        });

        it('should not revoke URL for preloaded audio', function() {
            var descEl = createMockDescEl();
            app.playTTSAudio('blob:preloaded-url', descEl, true);
            mockAudioInstances[0].onended();
            expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:preloaded-url');
        });

        it('should clean up on error', function() {
            var descEl = createMockDescEl();
            app.playTTSAudio('blob:test-url', descEl, false);
            mockAudioInstances[0].onerror();
            expect(app.ttsSpeaking).toBe(false);
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
        });
    });

    describe('playNextChunk', function() {
        it('should stop when all chunks are played', function() {
            var descEl = createMockDescEl();
            app.ttsChunkDescEl = descEl;
            app.ttsChunks = ['blob:c1'];
            app.ttsChunkIndex = 1;
            app.ttsSpeaking = true;
            app.playNextChunk(false);
            expect(app.ttsSpeaking).toBe(false);
        });

        it('should skip null chunks (non-first)', function() {
            var descEl = createMockDescEl();
            app.ttsChunkDescEl = descEl;
            app.ttsChunks = ['blob:c1', null, 'blob:c3'];
            app.ttsChunkIndex = 1;
            app.ttsSentenceMap = [[0], [1], [2]];
            app.playNextChunk(false);
            expect(app.ttsChunkIndex).toBe(2);
        });

        it('should not play when cancelled', function() {
            app.ttsCancelled = true;
            app.ttsChunks = ['blob:c1'];
            app.ttsChunkIndex = 0;
            app.playNextChunk(false);
            expect(mockAudioInstances.length).toBe(0);
        });

        it('should create Audio and play current chunk', function() {
            var descEl = createMockDescEl();
            app.ttsChunkDescEl = descEl;
            app.ttsChunks = ['blob:c1', 'blob:c2'];
            app.ttsChunkIndex = 0;
            app.ttsSentenceMap = [[0], [1]];
            app.playNextChunk(false);
            expect(mockAudioInstances.length).toBe(1);
            expect(mockAudioInstances[0].src).toBe('blob:c1');
        });
    });

    describe('clearTTSHighlight', function() {
        it('should restore original text', function() {
            var descEl = createMockDescEl();
            app.ttsOriginalText = 'Original text here';
            app.clearTTSHighlight(descEl);
            expect(descEl.textContent).toBe('Original text here');
            expect(app.ttsOriginalText).toBeNull();
        });

        it('should reset scroll position', function() {
            var descEl = createMockDescEl();
            descEl.scrollTop = 100;
            app.clearTTSHighlight(descEl);
            expect(descEl.scrollTop).toBe(0);
        });

        it('should handle null element', function() {
            expect(function() { app.clearTTSHighlight(null); }).not.toThrow();
        });
    });

    describe('_doSpeakText', function() {
        it('should return false when proxy is not configured', function() {
            app.settings.proxyEnabled = false;
            var result = app._doSpeakText('Hello');
            expect(result).toBe(false);
        });
    });
});
