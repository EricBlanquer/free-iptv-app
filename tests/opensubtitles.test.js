window.log = jest.fn();

var fs = require('fs');

var xhrInstances = [];

function MockXHR() {
    this.headers = {};
    this.method = null;
    this.url = null;
    this.timeout = 0;
    this.responseText = '';
    this.responseURL = '';
    this.status = 200;
    this.readyState = 0;
    this.onreadystatechange = null;
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
MockXHR.prototype.getResponseHeader = function() { return null; };

global.XMLHttpRequest = MockXHR;

var mockLocalStorage = {
    _data: {},
    getItem: function(key) { return this._data[key] || null; },
    setItem: function(key, val) { this._data[key] = val; },
    removeItem: function(key) { delete this._data[key]; }
};
global.localStorage = mockLocalStorage;

var opensubCode = fs.readFileSync('./js/opensubtitles.js', 'utf8');
eval(opensubCode);

function respondXHR(instance, responseData, status) {
    instance.responseText = JSON.stringify(responseData);
    instance.status = status || 200;
    instance.readyState = 4;
    if (instance.onreadystatechange) instance.onreadystatechange();
}

function respondXHRText(instance, text, status) {
    instance.responseText = text;
    instance.status = status || 200;
    instance.readyState = 4;
    if (instance.onreadystatechange) instance.onreadystatechange();
}

function tick() {
    return new Promise(function(r) { setTimeout(r, 10); });
}

describe('OpenSubtitles', function() {
    beforeEach(function() {
        xhrInstances = [];
        mockLocalStorage._data = {};
        OpenSubtitles.setApiKey('test-os-key');
    });

    describe('setApiKey / isEnabled / getApiKey', function() {
        it('should be enabled when API key is set', function() {
            OpenSubtitles.setApiKey('abc');
            expect(OpenSubtitles.isEnabled()).toBe(true);
            expect(OpenSubtitles.getApiKey()).toBe('abc');
        });

        it('should be disabled when API key is empty', function() {
            OpenSubtitles.setApiKey('');
            expect(OpenSubtitles.isEnabled()).toBe(false);
        });

        it('should fallback to localStorage when key not set', function() {
            OpenSubtitles.setApiKey('');
            localStorage.setItem('opensubtitles_api_key', 'from-storage');
            expect(OpenSubtitles.getApiKey()).toBe('from-storage');
            localStorage.removeItem('opensubtitles_api_key');
        });
    });

    describe('LANG_MAP', function() {
        it('should map common language codes', function() {
            expect(OpenSubtitles.LANG_MAP['fr']).toBe('fre');
            expect(OpenSubtitles.LANG_MAP['en']).toBe('eng');
            expect(OpenSubtitles.LANG_MAP['de']).toBe('ger');
            expect(OpenSubtitles.LANG_MAP['es']).toBe('spa');
        });
    });

    describe('search', function() {
        it('should construct correct URL with IMDB ID', function(done) {
            OpenSubtitles.search({ imdb_id: 'tt1375666', languages: 'fr,en' }, function(err, results) {
                expect(err).toBeNull();
                done();
            });

            expect(xhrInstances[0].method).toBe('GET');
            expect(xhrInstances[0].url).toContain('/subtitles?');
            expect(xhrInstances[0].url).toContain('imdb_id=1375666');
            expect(xhrInstances[0].url).toContain('languages=fr,en');
            expect(xhrInstances[0].headers['Api-Key']).toBe('test-os-key');
            expect(xhrInstances[0].headers['Content-Type']).toBe('application/json');

            respondXHR(xhrInstances[0], { data: [] });
        });

        it('should strip tt prefix from IMDB ID', function() {
            OpenSubtitles.search({ imdb_id: 'tt1375666' }, function() {});
            expect(xhrInstances[0].url).toContain('imdb_id=1375666');
            expect(xhrInstances[0].url).not.toContain('imdb_id=tt');
        });

        it('should include TMDB ID parameter', function() {
            OpenSubtitles.search({ tmdb_id: 27205 }, function() {});
            expect(xhrInstances[0].url).toContain('tmdb_id=27205');
        });

        it('should include query parameter', function() {
            OpenSubtitles.search({ query: 'Inception' }, function() {});
            expect(xhrInstances[0].url).toContain('query=Inception');
        });

        it('should include season and episode parameters', function() {
            OpenSubtitles.search({
                tmdb_id: 1396,
                season_number: 1,
                episode_number: 3,
                type: 'episode'
            }, function() {});
            expect(xhrInstances[0].url).toContain('season_number=1');
            expect(xhrInstances[0].url).toContain('episode_number=3');
            expect(xhrInstances[0].url).toContain('type=episode');
        });

        it('should parse search results correctly', function(done) {
            OpenSubtitles.search({ tmdb_id: 27205 }, function(err, results) {
                expect(err).toBeNull();
                expect(results.length).toBe(2);
                expect(results[0].file_id).toBe(12345);
                expect(results[0].language).toBe('fr');
                expect(results[0].release).toBe('Inception.2010.BluRay');
                expect(results[1].file_id).toBe(67890);
                done();
            });

            respondXHR(xhrInstances[0], {
                data: [
                    {
                        id: '1',
                        attributes: {
                            language: 'fr',
                            release: 'Inception.2010.BluRay',
                            fps: 23.976,
                            votes: 10,
                            download_count: 500,
                            hearing_impaired: false,
                            foreign_parts_only: false,
                            ai_translated: false,
                            machine_translated: false,
                            files: [{ file_id: 12345, file_name: 'inception.srt' }]
                        }
                    },
                    {
                        id: '2',
                        attributes: {
                            language: 'en',
                            release: 'Inception.2010.WEB',
                            files: [{ file_id: 67890, file_name: 'inception_en.srt' }]
                        }
                    }
                ]
            });
        });

        it('should skip entries without files', function(done) {
            OpenSubtitles.search({ tmdb_id: 27205 }, function(err, results) {
                expect(results.length).toBe(1);
                expect(results[0].file_id).toBe(12345);
                done();
            });

            respondXHR(xhrInstances[0], {
                data: [
                    { id: '1', attributes: { language: 'fr', files: [{ file_id: 12345 }] } },
                    { id: '2', attributes: { language: 'en', files: [] } }
                ]
            });
        });

        it('should return error when API key is not set', function(done) {
            OpenSubtitles.setApiKey('');
            mockLocalStorage._data = {};
            OpenSubtitles.search({ tmdb_id: 27205 }, function(err, results) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('API key not set');
                expect(results).toBeNull();
                done();
            });
        });

        it('should handle HTTP errors', function(done) {
            OpenSubtitles.search({ tmdb_id: 27205 }, function(err, results) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('HTTP 401');
                expect(results).toBeNull();
                done();
            });

            respondXHR(xhrInstances[0], { message: 'Unauthorized' }, 401);
        });

        it('should handle invalid JSON', function(done) {
            OpenSubtitles.search({ tmdb_id: 27205 }, function(err, results) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('Invalid JSON');
                done();
            });

            xhrInstances[0].responseText = 'not json {{{';
            xhrInstances[0].status = 200;
            xhrInstances[0].readyState = 4;
            if (xhrInstances[0].onreadystatechange) xhrInstances[0].onreadystatechange();
        });

        it('should handle network error', function(done) {
            OpenSubtitles.search({ tmdb_id: 27205 }, function(err, results) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('Network error');
                done();
            });

            if (xhrInstances[0].onerror) xhrInstances[0].onerror();
        });

        it('should use default languages when not specified', function() {
            OpenSubtitles.search({ tmdb_id: 27205 }, function() {});
            expect(xhrInstances[0].url).toContain('languages=fr,en');
        });
    });

    describe('getDownloadLink', function() {
        it('should POST to download endpoint with file_id', function(done) {
            OpenSubtitles.getDownloadLink(12345, function(err, result) {
                expect(err).toBeNull();
                expect(result.link).toBe('https://dl.opensubtitles.com/file/12345');
                expect(result.remaining).toBe(95);
                done();
            });

            expect(xhrInstances[0].method).toBe('POST');
            expect(xhrInstances[0].url).toContain('/download');
            var body = JSON.parse(xhrInstances[0].sentData);
            expect(body.file_id).toBe(12345);

            respondXHR(xhrInstances[0], {
                link: 'https://dl.opensubtitles.com/file/12345',
                file_name: 'inception.srt',
                remaining: 95
            });
        });

        it('should handle errors', function(done) {
            OpenSubtitles.getDownloadLink(99999, function(err, result) {
                expect(err).not.toBeNull();
                expect(result).toBeNull();
                done();
            });

            respondXHR(xhrInstances[0], { message: 'Not found' }, 404);
        });
    });

    describe('downloadContent', function() {
        it('should GET subtitle content from URL', function(done) {
            OpenSubtitles.downloadContent('https://dl.opensubtitles.com/file/12345', function(err, content) {
                expect(err).toBeNull();
                expect(content).toContain('1\n00:00:01');
                done();
            });

            var srtContent = '1\n00:00:01,000 --> 00:00:03,000\nHello World\n';
            respondXHRText(xhrInstances[0], srtContent);
        });

        it('should handle download failure', function(done) {
            OpenSubtitles.downloadContent('https://example.com/bad', function(err, content) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('Download failed');
                expect(content).toBeNull();
                done();
            });

            respondXHRText(xhrInstances[0], '', 500);
        });

        it('should handle network error', function(done) {
            OpenSubtitles.downloadContent('https://example.com/bad', function(err, content) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('network error');
                done();
            });

            if (xhrInstances[0].onerror) xhrInstances[0].onerror();
        });
    });

    describe('saveToFile', function() {
        it('should save to memory in browser environment', function(done) {
            window._subtitleFiles = {};
            OpenSubtitles.saveToFile('subtitle content', 'test.srt', function(err, filePath) {
                expect(err).toBeNull();
                expect(filePath).toContain('memory://test.srt');
                expect(window._subtitleFiles['test.srt']).toBe('subtitle content');
                done();
            });
        });
    });

    describe('searchAndDownload', function() {
        it('should chain search, download link, download content, and save', function(done) {
            OpenSubtitles.searchAndDownload({ tmdb_id: 27205, languages: 'fr' }, function(err, result) {
                expect(err).toBeNull();
                expect(result.content).toContain('Bonjour');
                expect(result.subtitle.file_id).toBe(12345);
                expect(result.filePath).toContain('memory://');
                done();
            });

            respondXHR(xhrInstances[0], {
                data: [{
                    id: '1',
                    attributes: {
                        language: 'fr',
                        files: [{ file_id: 12345, file_name: 'inception_fr.srt' }]
                    }
                }]
            });

            tick().then(function() {
                respondXHR(xhrInstances[1], {
                    link: 'https://dl.opensubtitles.com/file/12345',
                    file_name: 'inception_fr.srt',
                    remaining: 90
                });
                return tick();
            }).then(function() {
                respondXHRText(xhrInstances[2], '1\n00:00:01,000 --> 00:00:03,000\nBonjour\n');
            });
        });

        it('should return error when no subtitles found', function(done) {
            OpenSubtitles.searchAndDownload({ tmdb_id: 99999 }, function(err, result) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('No subtitles found');
                expect(result).toBeNull();
                done();
            });

            respondXHR(xhrInstances[0], { data: [] });
        });

        it('should propagate search error', function(done) {
            OpenSubtitles.searchAndDownload({ tmdb_id: 27205 }, function(err, result) {
                expect(err).not.toBeNull();
                expect(result).toBeNull();
                done();
            });

            respondXHR(xhrInstances[0], { error: 'Server error' }, 500);
        });
    });
});
