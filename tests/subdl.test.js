window.log = jest.fn();

var fs = require('fs');
var util = require('util');

global.TextEncoder = util.TextEncoder;
global.TextDecoder = util.TextDecoder;

var xhrInstances = [];

function MockXHR() {
    this.headers = {};
    this.method = null;
    this.url = null;
    this.timeout = 0;
    this.responseText = '';
    this.responseURL = '';
    this.responseType = '';
    this.response = null;
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
MockXHR.prototype.getResponseHeader = function() { return 'application/zip'; };

global.XMLHttpRequest = MockXHR;

var subdlCode = fs.readFileSync('./js/subdl.js', 'utf8');
eval(subdlCode);

function respondXHR(instance, responseData, status) {
    instance.responseText = JSON.stringify(responseData);
    instance.status = status || 200;
    instance.readyState = 4;
    if (instance.onreadystatechange) instance.onreadystatechange();
}

function tick() {
    return new Promise(function(r) { setTimeout(r, 10); });
}

/**
 * Build a minimal ZIP file containing a single stored (uncompressed) file.
 * Returns an ArrayBuffer.
 */
function buildZipWithStoredFile(fileName, content) {
    var encoder = new TextEncoder();
    var fileNameBytes = encoder.encode(fileName);
    var contentBytes = encoder.encode(content);
    var fnLen = fileNameBytes.length;
    var cLen = contentBytes.length;

    var localHeaderSize = 30 + fnLen;
    var centralHeaderSize = 46 + fnLen;
    var endSize = 22;
    var totalSize = localHeaderSize + cLen + centralHeaderSize + endSize;
    var buf = new ArrayBuffer(totalSize);
    var view = new DataView(buf);
    var arr = new Uint8Array(buf);
    var pos = 0;

    // Local file header
    view.setUint32(pos, 0x04034b50, true); pos += 4;
    view.setUint16(pos, 20, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;  // stored
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint32(pos, 0, true); pos += 4;
    view.setUint32(pos, cLen, true); pos += 4;
    view.setUint32(pos, cLen, true); pos += 4;
    view.setUint16(pos, fnLen, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    arr.set(fileNameBytes, pos); pos += fnLen;
    arr.set(contentBytes, pos); pos += cLen;

    // Central directory header
    var centralStart = pos;
    view.setUint32(pos, 0x02014b50, true); pos += 4;
    view.setUint16(pos, 20, true); pos += 2;
    view.setUint16(pos, 20, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint32(pos, 0, true); pos += 4;
    view.setUint32(pos, cLen, true); pos += 4;
    view.setUint32(pos, cLen, true); pos += 4;
    view.setUint16(pos, fnLen, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint32(pos, 0, true); pos += 4;
    view.setUint32(pos, 0, true); pos += 4;
    arr.set(fileNameBytes, pos); pos += fnLen;

    // End of central directory
    view.setUint32(pos, 0x06054b50, true); pos += 4;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2;
    view.setUint16(pos, 1, true); pos += 2;
    view.setUint16(pos, 1, true); pos += 2;
    view.setUint32(pos, centralHeaderSize, true); pos += 4;
    view.setUint32(pos, centralStart, true); pos += 4;
    view.setUint16(pos, 0, true);

    return buf;
}

describe('SubDL', function() {
    beforeEach(function() {
        xhrInstances = [];
        SubDL.setApiKey('test-subdl-key');
    });

    describe('setApiKey / isEnabled / getApiKey', function() {
        it('should be enabled when API key is set', function() {
            SubDL.setApiKey('abc');
            expect(SubDL.isEnabled()).toBe(true);
            expect(SubDL.getApiKey()).toBe('abc');
        });

        it('should be disabled when API key is empty', function() {
            SubDL.setApiKey('');
            expect(SubDL.isEnabled()).toBe(false);
        });

        it('should be disabled when API key is null', function() {
            SubDL.setApiKey(null);
            expect(SubDL.isEnabled()).toBe(false);
        });
    });

    describe('search', function() {
        it('should construct correct URL with API key', function() {
            SubDL.search({ tmdb_id: 27205 }, function() {});
            expect(xhrInstances[0].url).toContain('api_key=test-subdl-key');
            expect(xhrInstances[0].url).toContain('tmdb_id=27205');
            expect(xhrInstances[0].url).toContain('subs_per_page=30');
        });

        it('should include IMDB ID with tt prefix', function() {
            SubDL.search({ imdb_id: '1375666' }, function() {});
            expect(xhrInstances[0].url).toContain('imdb_id=tt1375666');
        });

        it('should keep existing tt prefix', function() {
            SubDL.search({ imdb_id: 'tt1375666' }, function() {});
            expect(xhrInstances[0].url).toContain('imdb_id=tt1375666');
            expect(xhrInstances[0].url).not.toContain('imdb_id=tttt');
        });

        it('should use film_name for query parameter', function() {
            SubDL.search({ query: 'Inception' }, function() {});
            expect(xhrInstances[0].url).toContain('film_name=Inception');
        });

        it('should include season and episode parameters', function() {
            SubDL.search({
                tmdb_id: 1396,
                season_number: 2,
                episode_number: 5,
                type: 'tv'
            }, function() {});
            expect(xhrInstances[0].url).toContain('season_number=2');
            expect(xhrInstances[0].url).toContain('episode_number=5');
            expect(xhrInstances[0].url).toContain('type=tv');
        });

        it('should use default languages when not specified', function() {
            SubDL.search({ tmdb_id: 27205 }, function() {});
            expect(xhrInstances[0].url).toContain('languages=fr,en');
        });

        it('should parse search results correctly', function(done) {
            SubDL.search({ tmdb_id: 27205 }, function(err, results) {
                expect(err).toBeNull();
                expect(results.length).toBe(2);
                expect(results[0].id).toBe(100);
                expect(results[0].language).toBe('french');
                expect(results[0].release).toBe('Inception.2010.BluRay');
                expect(results[0].download_url).toContain('https://dl.subdl.com');
                expect(results[0].download_url).toContain('/subtitles/inception-fr.zip');
                expect(results[1].language).toBe('english');
                done();
            });

            respondXHR(xhrInstances[0], {
                status: true,
                subtitles: [
                    {
                        sd_id: 100,
                        release_name: 'Inception.2010.BluRay',
                        lang: 'french',
                        author: 'testuser',
                        url: '/subtitles/inception-fr.zip',
                        hi: false
                    },
                    {
                        sd_id: 200,
                        release_name: 'Inception.2010.WEB',
                        lang: 'english',
                        author: 'user2',
                        url: '/subtitles/inception-en.zip',
                        hi: true
                    }
                ]
            });
        });

        it('should return error when API key is not set', function(done) {
            SubDL.setApiKey('');
            SubDL.search({ tmdb_id: 27205 }, function(err, results) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('API key not set');
                expect(results).toBeNull();
                done();
            });
        });

        it('should handle API error response', function(done) {
            SubDL.search({ tmdb_id: 27205 }, function(err, results) {
                expect(err).not.toBeNull();
                expect(err.error).toBe('Rate limit');
                expect(results).toBeNull();
                done();
            });

            respondXHR(xhrInstances[0], {
                status: false,
                error: 'Rate limit'
            });
        });

        it('should handle HTTP errors', function(done) {
            SubDL.search({ tmdb_id: 27205 }, function(err, results) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('HTTP 500');
                done();
            });

            respondXHR(xhrInstances[0], { message: 'Server error' }, 500);
        });

        it('should handle invalid JSON', function(done) {
            SubDL.search({ tmdb_id: 27205 }, function(err, results) {
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
            SubDL.search({ tmdb_id: 27205 }, function(err, results) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('Network error');
                done();
            });

            if (xhrInstances[0].onerror) xhrInstances[0].onerror();
        });

        it('should return empty results when no subtitles', function(done) {
            SubDL.search({ tmdb_id: 99999 }, function(err, results) {
                expect(err).toBeNull();
                expect(results).toEqual([]);
                done();
            });

            respondXHR(xhrInstances[0], { status: true, subtitles: [] });
        });
    });

    describe('downloadZip', function() {
        it('should request arraybuffer response', function() {
            SubDL.downloadZip('https://dl.subdl.com/subtitles/test.zip', function() {});
            expect(xhrInstances[0].responseType).toBe('arraybuffer');
            expect(xhrInstances[0].method).toBe('GET');
        });

        it('should return data on success', function(done) {
            SubDL.downloadZip('https://dl.subdl.com/subtitles/test.zip', function(err, result) {
                expect(err).toBeNull();
                expect(result.data).toBeDefined();
                done();
            });

            xhrInstances[0].response = new ArrayBuffer(100);
            xhrInstances[0].status = 200;
            xhrInstances[0].readyState = 4;
            if (xhrInstances[0].onreadystatechange) xhrInstances[0].onreadystatechange();
        });

        it('should handle HTTP error', function(done) {
            SubDL.downloadZip('https://dl.subdl.com/subtitles/bad.zip', function(err, result) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('Download failed');
                done();
            });

            xhrInstances[0].status = 404;
            xhrInstances[0].readyState = 4;
            if (xhrInstances[0].onreadystatechange) xhrInstances[0].onreadystatechange();
        });

        it('should handle network error', function(done) {
            SubDL.downloadZip('https://dl.subdl.com/subtitles/bad.zip', function(err, result) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('network error');
                done();
            });

            if (xhrInstances[0].onerror) xhrInstances[0].onerror();
        });
    });

    describe('extractSrtFromZip', function() {
        it('should extract stored SRT file from ZIP', function(done) {
            var srtContent = '1\n00:00:01,000 --> 00:00:03,000\nHello World\n';
            var zipData = buildZipWithStoredFile('subtitle.srt', srtContent);

            SubDL.extractSrtFromZip(zipData, function(err, content) {
                expect(err).toBeNull();
                expect(content).toBe(srtContent);
                done();
            });
        });

        it('should find SRT regardless of case', function(done) {
            var srtContent = 'Test subtitle content';
            var zipData = buildZipWithStoredFile('Movie.SRT', srtContent);

            SubDL.extractSrtFromZip(zipData, function(err, content) {
                expect(err).toBeNull();
                expect(content).toBe(srtContent);
                done();
            });
        });

        it('should return error when no SRT in ZIP', function(done) {
            var zipData = buildZipWithStoredFile('readme.txt', 'Not a subtitle');

            SubDL.extractSrtFromZip(zipData, function(err, content) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('No SRT file found');
                done();
            });
        });

        it('should return error for deflate-compressed files without pako', function(done) {
            var encoder = new TextEncoder();
            var fileName = 'test.srt';
            var fileNameBytes = encoder.encode(fileName);
            var fnLen = fileNameBytes.length;
            var fakeCompressed = new Uint8Array([0x78, 0x9c, 0x01, 0x02]);
            var cLen = fakeCompressed.length;

            var totalSize = 30 + fnLen + cLen + 10;
            var buf = new ArrayBuffer(totalSize);
            var view = new DataView(buf);
            var arr = new Uint8Array(buf);
            var pos = 0;

            view.setUint32(pos, 0x04034b50, true); pos += 4;
            view.setUint16(pos, 20, true); pos += 2;
            view.setUint16(pos, 0, true); pos += 2;
            view.setUint16(pos, 8, true); pos += 2;  // deflate
            view.setUint16(pos, 0, true); pos += 2;
            view.setUint16(pos, 0, true); pos += 2;
            view.setUint32(pos, 0, true); pos += 4;
            view.setUint32(pos, cLen, true); pos += 4;
            view.setUint32(pos, 100, true); pos += 4;
            view.setUint16(pos, fnLen, true); pos += 2;
            view.setUint16(pos, 0, true); pos += 2;
            arr.set(fileNameBytes, pos); pos += fnLen;
            arr.set(fakeCompressed, pos);

            SubDL.extractSrtFromZip(buf, function(err, content) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('Cannot decompress');
                done();
            });
        });

        it('should return error for invalid data', function(done) {
            var badData = new ArrayBuffer(4);
            var view = new Uint8Array(badData);
            view[0] = 0; view[1] = 0; view[2] = 0; view[3] = 0;

            SubDL.extractSrtFromZip(badData, function(err, content) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('No SRT file found');
                done();
            });
        });
    });

    describe('searchAndDownload', function() {
        it('should chain search, download, and extract', function(done) {
            var srtContent = '1\n00:00:01,000 --> 00:00:03,000\nBonjour\n';
            var zipData = buildZipWithStoredFile('inception_fr.srt', srtContent);

            SubDL.searchAndDownload({ tmdb_id: 27205 }, function(err, result) {
                expect(err).toBeNull();
                expect(result.content).toBe(srtContent);
                expect(result.subtitle.id).toBe(100);
                done();
            });

            respondXHR(xhrInstances[0], {
                status: true,
                subtitles: [{
                    sd_id: 100,
                    release_name: 'Inception.2010.BluRay',
                    lang: 'french',
                    url: '/subtitles/inception-fr.zip'
                }]
            });

            tick().then(function() {
                xhrInstances[1].response = zipData;
                xhrInstances[1].status = 200;
                xhrInstances[1].readyState = 4;
                if (xhrInstances[1].onreadystatechange) xhrInstances[1].onreadystatechange();
            });
        });

        it('should return error when no subtitles found', function(done) {
            SubDL.searchAndDownload({ tmdb_id: 99999 }, function(err, result) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('No subtitles found');
                expect(result).toBeNull();
                done();
            });

            respondXHR(xhrInstances[0], { status: true, subtitles: [] });
        });

        it('should propagate search error', function(done) {
            SubDL.searchAndDownload({ tmdb_id: 27205 }, function(err, result) {
                expect(err).not.toBeNull();
                expect(result).toBeNull();
                done();
            });

            respondXHR(xhrInstances[0], { message: 'error' }, 500);
        });

        it('should propagate download error', function(done) {
            SubDL.searchAndDownload({ tmdb_id: 27205 }, function(err, result) {
                expect(err).not.toBeNull();
                expect(err.error).toContain('Download failed');
                done();
            });

            respondXHR(xhrInstances[0], {
                status: true,
                subtitles: [{
                    sd_id: 100,
                    release_name: 'test',
                    lang: 'french',
                    url: '/subtitles/test.zip'
                }]
            });

            tick().then(function() {
                xhrInstances[1].status = 500;
                xhrInstances[1].readyState = 4;
                if (xhrInstances[1].onreadystatechange) xhrInstances[1].onreadystatechange();
            });
        });
    });
});
