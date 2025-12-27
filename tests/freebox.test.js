window.log = jest.fn();

var fs = require('fs');
var util = require('util');

global.TextEncoder = util.TextEncoder;

var xhrInstances = [];

function MockXHR() {
    this.headers = {};
    this.method = null;
    this.url = null;
    this.timeout = 0;
    this.responseText = '';
    this.status = 200;
    this.onload = null;
    this.onerror = null;
    this.ontimeout = null;
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

global.XMLHttpRequest = MockXHR;

var nodeCrypto = require('crypto');
if (!global.crypto) {
    global.crypto = nodeCrypto.webcrypto;
} else if (!global.crypto.subtle) {
    global.crypto.subtle = nodeCrypto.webcrypto.subtle;
}

var freeboxCode = fs.readFileSync('./js/freebox.js', 'utf8');
eval(freeboxCode);

function respondXHR(instance, responseData) {
    instance.responseText = JSON.stringify(responseData);
    instance.status = 200;
    if (instance.onload) instance.onload();
}

function tick() {
    return new Promise(function(r) { setTimeout(r, 10); });
}

describe('FreeboxAPI', function() {
    beforeEach(function() {
        xhrInstances = [];
        FreeboxAPI.setConfig('mafreebox.freebox.fr', '');
        FreeboxAPI.stopPolling();
    });

    describe('HMAC-SHA1', function() {
        it('should compute correct HMAC-SHA1 for known test vector', async function() {
            var result = await FreeboxAPI.hmacSha1('key', 'The quick brown fox jumps over the lazy dog');
            expect(result).toBe('de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9');
        });

        it('should compute correct HMAC-SHA1 for empty message', async function() {
            var result = await FreeboxAPI.hmacSha1('key', '');
            expect(result).toBe('f42bb0eeb018ebbd4597ae7213711ec60760843f');
        });

        it('should return 40-character hex string', async function() {
            var result = await FreeboxAPI.hmacSha1('mytoken', 'mychallenge');
            expect(result).toMatch(/^[0-9a-f]{40}$/);
        });
    });

    describe('requestAuthorization', function() {
        it('should POST to /api/v4/login/authorize/ with app info', async function() {
            var promise = FreeboxAPI.requestAuthorization();

            expect(xhrInstances.length).toBe(1);
            expect(xhrInstances[0].method).toBe('POST');
            expect(xhrInstances[0].url).toContain('/api/v4/login/authorize/');

            var body = JSON.parse(xhrInstances[0].sentData);
            expect(body.app_id).toBe('org.nicefree.iptv');
            expect(body.app_name).toBe('Free IPTV');
            expect(body.device_name).toBe('Samsung TV');

            respondXHR(xhrInstances[0], {
                success: true,
                result: { app_token: 'tok-123', track_id: 42 }
            });

            var result = await promise;
            expect(result.appToken).toBe('tok-123');
            expect(result.trackId).toBe(42);
        });

        it('should throw on failed authorization', async function() {
            var promise = FreeboxAPI.requestAuthorization();

            respondXHR(xhrInstances[0], {
                success: false,
                msg: 'Rate limit exceeded'
            });

            await expect(promise).rejects.toThrow('Rate limit exceeded');
        });
    });

    describe('trackAuthorization', function() {
        it('should GET authorization status for trackId', async function() {
            var promise = FreeboxAPI.trackAuthorization(42);

            expect(xhrInstances[0].method).toBe('GET');
            expect(xhrInstances[0].url).toContain('/api/v4/login/authorize/42');

            respondXHR(xhrInstances[0], {
                success: true,
                result: { status: 'granted' }
            });

            var status = await promise;
            expect(status).toBe('granted');
        });

        it('should return pending status', async function() {
            var promise = FreeboxAPI.trackAuthorization(42);

            respondXHR(xhrInstances[0], {
                success: true,
                result: { status: 'pending' }
            });

            var status = await promise;
            expect(status).toBe('pending');
        });
    });

    describe('pollAuthorization', function() {
        it('should callback with granted when accepted', async function() {
            jest.useFakeTimers();
            var callbackResult = null;

            FreeboxAPI.pollAuthorization(42, 'app-tok', function(status) {
                callbackResult = status;
            });

            jest.advanceTimersByTime(2000);
            expect(xhrInstances.length).toBe(1);

            respondXHR(xhrInstances[0], {
                success: true,
                result: { status: 'granted' }
            });

            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
            expect(callbackResult).toBe('granted');
            jest.useRealTimers();
        });

        it('should callback with denied when rejected', async function() {
            jest.useFakeTimers();
            var callbackResult = null;

            FreeboxAPI.pollAuthorization(42, 'app-tok', function(status) {
                callbackResult = status;
            });

            jest.advanceTimersByTime(2000);

            respondXHR(xhrInstances[0], {
                success: true,
                result: { status: 'denied' }
            });

            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
            expect(callbackResult).toBe('denied');
            jest.useRealTimers();
        });

        it('should callback with timeout after max attempts', async function() {
            jest.useFakeTimers();
            var callbackResult = null;

            FreeboxAPI.pollAuthorization(42, 'app-tok', function(status) {
                callbackResult = status;
            });

            for (var i = 0; i <= 60; i++) {
                jest.advanceTimersByTime(2000);
                await Promise.resolve();
                await Promise.resolve();
                if (xhrInstances[i]) {
                    respondXHR(xhrInstances[i], {
                        success: true,
                        result: { status: 'pending' }
                    });
                }
                await Promise.resolve();
                await Promise.resolve();
            }

            jest.advanceTimersByTime(2000);
            expect(callbackResult).toBe('timeout');
            jest.useRealTimers();
        });

        it('should callback with error on network failure', async function() {
            jest.useFakeTimers();
            var callbackResult = null;

            FreeboxAPI.pollAuthorization(42, 'app-tok', function(status) {
                callbackResult = status;
            });

            jest.advanceTimersByTime(2000);

            if (xhrInstances[0].onerror) {
                xhrInstances[0].onerror();
            }

            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
            expect(callbackResult).toBe('error');
            jest.useRealTimers();
        });
    });

    describe('openSession', function() {
        it('should get challenge then open session with HMAC password', async function() {
            FreeboxAPI.setConfig('mafreebox.freebox.fr', 'my-app-token');

            var promise = FreeboxAPI.openSession();

            expect(xhrInstances[0].method).toBe('GET');
            expect(xhrInstances[0].url).toContain('/api/v4/login/');

            respondXHR(xhrInstances[0], {
                success: true,
                result: { challenge: 'test-challenge' }
            });

            await tick();

            expect(xhrInstances.length).toBe(2);
            expect(xhrInstances[1].method).toBe('POST');
            expect(xhrInstances[1].url).toContain('/api/v4/login/session/');

            var body = JSON.parse(xhrInstances[1].sentData);
            expect(body.app_id).toBe('org.nicefree.iptv');
            expect(body.password).toMatch(/^[0-9a-f]{40}$/);

            respondXHR(xhrInstances[1], {
                success: true,
                result: { session_token: 'session-abc' }
            });

            var token = await promise;
            expect(token).toBe('session-abc');
        });

        it('should throw on session failure', async function() {
            FreeboxAPI.setConfig('mafreebox.freebox.fr', 'my-app-token');

            var promise = FreeboxAPI.openSession();

            respondXHR(xhrInstances[0], {
                success: true,
                result: { challenge: 'c1' }
            });
            await tick();

            respondXHR(xhrInstances[1], {
                success: false,
                msg: 'Invalid credentials'
            });

            await expect(promise).rejects.toThrow('Invalid credentials');
        });
    });

    describe('ensureSession', function() {
        async function setupSession(token) {
            FreeboxAPI.setConfig('mafreebox.freebox.fr', 'my-app-token');
            var p = FreeboxAPI.openSession();
            respondXHR(xhrInstances[0], { success: true, result: { challenge: 'c1' } });
            await tick();
            respondXHR(xhrInstances[1], { success: true, result: { session_token: token } });
            await p;
            xhrInstances = [];
        }

        it('should reuse existing session if still logged in', async function() {
            await setupSession('existing-token');

            var promise = FreeboxAPI.ensureSession();

            expect(xhrInstances[0].method).toBe('GET');
            respondXHR(xhrInstances[0], {
                success: true,
                result: { logged_in: true }
            });

            var token = await promise;
            expect(token).toBe('existing-token');
            expect(xhrInstances.length).toBe(1);
        });

        it('should re-authenticate if session expired', async function() {
            await setupSession('old-token');

            var promise = FreeboxAPI.ensureSession();

            respondXHR(xhrInstances[0], {
                success: true,
                result: { logged_in: false }
            });
            await tick();

            respondXHR(xhrInstances[1], {
                success: true,
                result: { challenge: 'new-challenge' }
            });
            await tick();

            respondXHR(xhrInstances[2], {
                success: true,
                result: { session_token: 'new-token' }
            });

            var token = await promise;
            expect(token).toBe('new-token');
        });

        it('should open fresh session if no session token', async function() {
            FreeboxAPI.setConfig('mafreebox.freebox.fr', 'my-app-token');

            var promise = FreeboxAPI.ensureSession();

            expect(xhrInstances[0].method).toBe('GET');
            respondXHR(xhrInstances[0], {
                success: true,
                result: { challenge: 'c1' }
            });
            await tick();

            respondXHR(xhrInstances[1], {
                success: true,
                result: { session_token: 'fresh-token' }
            });

            var token = await promise;
            expect(token).toBe('fresh-token');
        });

        it('should re-authenticate on network error checking session', async function() {
            await setupSession('token-1');

            var promise = FreeboxAPI.ensureSession();

            if (xhrInstances[0].onerror) {
                xhrInstances[0].onerror();
            }
            await tick();

            respondXHR(xhrInstances[1], {
                success: true,
                result: { challenge: 'c2' }
            });
            await tick();

            respondXHR(xhrInstances[2], {
                success: true,
                result: { session_token: 'recovered-token' }
            });

            var token = await promise;
            expect(token).toBe('recovered-token');
        });
    });

    describe('addDownload', function() {
        it('should ensure session then POST download', async function() {
            FreeboxAPI.setConfig('mafreebox.freebox.fr', 'my-app-token');

            var promise = FreeboxAPI.addDownload('http://example.com/movie.mp4', 'movie.mp4');

            respondXHR(xhrInstances[0], { success: true, result: { challenge: 'c1' } });
            await tick();
            respondXHR(xhrInstances[1], { success: true, result: { session_token: 'tok' } });
            await tick();

            expect(xhrInstances[2].method).toBe('POST');
            expect(xhrInstances[2].url).toContain('/api/v4/downloads/add');
            expect(xhrInstances[2].headers['X-Fbx-App-Auth']).toBe('tok');
            expect(xhrInstances[2].headers['Content-Type']).toBe('application/x-www-form-urlencoded');

            var sentData = xhrInstances[2].sentData;
            expect(sentData).toContain('download_url=' + encodeURIComponent('http://example.com/movie.mp4'));
            expect(sentData).toContain('filename=' + encodeURIComponent('movie.mp4'));

            respondXHR(xhrInstances[2], {
                success: true,
                result: { id: 99, status: 'queued' }
            });

            var result = await promise;
            expect(result.id).toBe(99);
            expect(result.status).toBe('queued');
        });

        it('should throw on download error', async function() {
            FreeboxAPI.setConfig('mafreebox.freebox.fr', 'my-app-token');

            var promise = FreeboxAPI.addDownload('http://example.com/movie.mp4');

            respondXHR(xhrInstances[0], { success: true, result: { challenge: 'c1' } });
            await tick();
            respondXHR(xhrInstances[1], { success: true, result: { session_token: 'tok' } });
            await tick();

            respondXHR(xhrInstances[2], {
                success: false,
                msg: 'URL not supported'
            });

            await expect(promise).rejects.toThrow('URL not supported');
        });
    });

    describe('getDownloads', function() {
        it('should return download list', async function() {
            FreeboxAPI.setConfig('mafreebox.freebox.fr', 'my-app-token');

            var promise = FreeboxAPI.getDownloads();

            respondXHR(xhrInstances[0], { success: true, result: { challenge: 'c1' } });
            await tick();
            respondXHR(xhrInstances[1], { success: true, result: { session_token: 'tok' } });
            await tick();

            expect(xhrInstances[2].method).toBe('GET');
            expect(xhrInstances[2].url).toContain('/api/v4/downloads/');

            respondXHR(xhrInstances[2], {
                success: true,
                result: [
                    { id: 1, name: 'file1.mp4', status: 'downloading', rx_bytes: 500, size: 1000 },
                    { id: 2, name: 'file2.mp4', status: 'done', rx_bytes: 2000, size: 2000 }
                ]
            });

            var result = await promise;
            expect(result.length).toBe(2);
            expect(result[0].name).toBe('file1.mp4');
        });
    });

    describe('pauseDownload', function() {
        it('should PUT stopped status', async function() {
            FreeboxAPI.setConfig('mafreebox.freebox.fr', 'my-app-token');

            var promise = FreeboxAPI.pauseDownload(42);

            respondXHR(xhrInstances[0], { success: true, result: { challenge: 'c1' } });
            await tick();
            respondXHR(xhrInstances[1], { success: true, result: { session_token: 'tok' } });
            await tick();

            expect(xhrInstances[2].method).toBe('PUT');
            expect(xhrInstances[2].url).toContain('/api/v4/downloads/42');
            var body = JSON.parse(xhrInstances[2].sentData);
            expect(body.status).toBe('stopped');

            respondXHR(xhrInstances[2], { success: true, result: { id: 42, status: 'stopped' } });

            var result = await promise;
            expect(result.status).toBe('stopped');
        });
    });

    describe('resumeDownload', function() {
        it('should PUT downloading status', async function() {
            FreeboxAPI.setConfig('mafreebox.freebox.fr', 'my-app-token');

            var promise = FreeboxAPI.resumeDownload(42);

            respondXHR(xhrInstances[0], { success: true, result: { challenge: 'c1' } });
            await tick();
            respondXHR(xhrInstances[1], { success: true, result: { session_token: 'tok' } });
            await tick();

            expect(xhrInstances[2].method).toBe('PUT');
            var body = JSON.parse(xhrInstances[2].sentData);
            expect(body.status).toBe('downloading');

            respondXHR(xhrInstances[2], { success: true, result: { id: 42, status: 'downloading' } });

            var result = await promise;
            expect(result.status).toBe('downloading');
        });
    });

    describe('deleteDownload', function() {
        it('should DELETE download with erase', async function() {
            FreeboxAPI.setConfig('mafreebox.freebox.fr', 'my-app-token');

            var promise = FreeboxAPI.deleteDownload(42);

            respondXHR(xhrInstances[0], { success: true, result: { challenge: 'c1' } });
            await tick();
            respondXHR(xhrInstances[1], { success: true, result: { session_token: 'tok' } });
            await tick();

            expect(xhrInstances[2].method).toBe('DELETE');
            expect(xhrInstances[2].url).toContain('/api/v4/downloads/42/erase');

            respondXHR(xhrInstances[2], { success: true });

            var result = await promise;
            expect(result).toBe(true);
        });
    });

    describe('hasActiveDownloads', function() {
        it('should return false when no downloads tracked', function() {
            expect(FreeboxAPI.hasActiveDownloads()).toBe(false);
        });
    });

    describe('isConfigured', function() {
        it('should return false with empty appToken', function() {
            FreeboxAPI.setConfig('mafreebox.freebox.fr', '');
            expect(FreeboxAPI.isConfigured()).toBe(false);
        });

        it('should return true with host and appToken', function() {
            FreeboxAPI.setConfig('mafreebox.freebox.fr', 'some-token');
            expect(FreeboxAPI.isConfigured()).toBe(true);
        });

        it('should use default host when null', function() {
            FreeboxAPI.setConfig(null, 'token');
            expect(FreeboxAPI.isConfigured()).toBe(true);
        });
    });

    describe('getActiveDownloads', function() {
        it('should return empty object initially', function() {
            var downloads = FreeboxAPI.getActiveDownloads();
            expect(Object.keys(downloads).length).toBe(0);
        });
    });
});
