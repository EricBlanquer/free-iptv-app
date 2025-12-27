var FreeboxAPI = (function() {
    var APP_ID = 'org.nicefree.iptv';
    var APP_NAME = 'Free IPTV';
    var APP_VERSION = '1.0.0';
    var DEVICE_NAME = /Android/.test(navigator.userAgent) ? 'Android TV' : /Tizen/.test(navigator.userAgent) ? 'Samsung TV' : 'Smart TV';
    var POLL_INTERVAL = 5000;

    var config = {
        host: 'mafreebox.freebox.fr',
        appToken: '',
        sessionToken: '',
        challenge: ''
    };

    var activeDownloads = {};
    var pollTimer = null;

    var HOSTS = ['192.168.1.254', 'mafreebox.freebox.fr'];
    var resolvedHost = null;

    function apiUrl(path) {
        return 'http://' + config.host + path;
    }

    function xhrDirect(method, url, data, contentType, timeout) {
        return new Promise(function(resolve, reject) {
            var req = new XMLHttpRequest();
            req.open(method, url, true);
            req.setRequestHeader('Content-Type', contentType || 'application/json');
            if (config.sessionToken) {
                req.setRequestHeader('X-Fbx-App-Auth', config.sessionToken);
            }
            req.timeout = timeout || 10000;
            req.onload = function() {
                try {
                    var result = JSON.parse(req.responseText);
                    resolve(result);
                }
                catch (ex) {
                    reject(new Error('JSON parse error: ' + req.status));
                }
            };
            req.onerror = function() {
                reject(new Error('Network error'));
            };
            req.ontimeout = function() {
                reject(new Error('Timeout'));
            };
            if (contentType === 'application/x-www-form-urlencoded') {
                req.send(data || null);
            } else {
                req.send(data ? JSON.stringify(data) : null);
            }
        });
    }

    function xhr(method, url, data, contentType) {
        if (resolvedHost) {
            return xhrDirect(method, url.replace('://' + config.host, '://' + resolvedHost), data, contentType);
        }
        var promises = HOSTS.map(function(host) {
            var hostUrl = url.replace('://' + config.host, '://' + host);
            return xhrDirect(method, hostUrl, data, contentType, 5000).then(function(result) {
                resolvedHost = host;
                config.host = host;
                window.log('Freebox: resolved host = ' + host);
                return result;
            });
        });
        return promiseAny(promises);
    }

    function promiseAny(promises) {
        return new Promise(function(resolve, reject) {
            var errors = [];
            var settled = false;
            promises.forEach(function(p, i) {
                p.then(function(val) {
                    if (!settled) { settled = true; resolve(val); }
                }).catch(function(err) {
                    errors[i] = err;
                    if (errors.filter(Boolean).length === promises.length) {
                        reject(errors[0]);
                    }
                });
            });
        });
    }

    function hmacSha1(key, message) {
        var enc = new TextEncoder();
        return crypto.subtle.importKey(
            'raw',
            enc.encode(key),
            { name: 'HMAC', hash: 'SHA-1' },
            false,
            ['sign']
        ).then(function(cryptoKey) {
            return crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
        }).then(function(signature) {
            var bytes = new Uint8Array(signature);
            var hex = '';
            for (var i = 0; i < bytes.length; i++) {
                hex += ('0' + bytes[i].toString(16)).slice(-2);
            }
            return hex;
        });
    }

    function setConfig(host, appToken) {
        config.host = host || 'mafreebox.freebox.fr';
        config.appToken = appToken || '';
        config.sessionToken = '';
    }

    function requestAuthorization() {
        return xhr('POST', apiUrl('/api/v4/login/authorize/'), {
            app_id: APP_ID,
            app_name: APP_NAME,
            app_version: APP_VERSION,
            device_name: DEVICE_NAME
        }).then(function(resp) {
            if (!resp.success) {
                throw new Error(resp.msg || 'Authorization request failed');
            }
            return {
                appToken: resp.result.app_token,
                trackId: resp.result.track_id
            };
        });
    }

    function trackAuthorization(trackId) {
        return xhr('GET', apiUrl('/api/v4/login/authorize/' + trackId)).then(function(resp) {
            if (!resp.success) {
                throw new Error(resp.msg || 'Track failed');
            }
            return resp.result.status;
        });
    }

    function pollAuthorization(trackId, appToken, callback) {
        var attempts = 0;
        var maxAttempts = 60;
        var timer = setInterval(function() {
            attempts++;
            if (attempts > maxAttempts) {
                clearInterval(timer);
                callback('timeout');
                return;
            }
            trackAuthorization(trackId).then(function(status) {
                if (status === 'granted') {
                    clearInterval(timer);
                    config.appToken = appToken;
                    callback('granted');
                }
                else if (status === 'denied') {
                    clearInterval(timer);
                    callback('denied');
                }
                else if (status === 'timeout') {
                    clearInterval(timer);
                    callback('timeout');
                }
            }).catch(function() {
                clearInterval(timer);
                callback('error');
            });
        }, 2000);
        return timer;
    }

    function getChallenge() {
        return xhr('GET', apiUrl('/api/v4/login/')).then(function(resp) {
            if (!resp.success) {
                throw new Error(resp.msg || 'Login failed');
            }
            config.challenge = resp.result.challenge;
            return resp.result.challenge;
        });
    }

    function openSession() {
        return getChallenge().then(function(challenge) {
            return hmacSha1(config.appToken, challenge);
        }).then(function(password) {
            return xhr('POST', apiUrl('/api/v4/login/session/'), {
                app_id: APP_ID,
                password: password
            });
        }).then(function(resp) {
            if (!resp.success) {
                throw new Error(resp.msg || 'Session failed');
            }
            config.sessionToken = resp.result.session_token;
            return config.sessionToken;
        });
    }

    function ensureSession() {
        if (config.sessionToken) {
            return xhr('GET', apiUrl('/api/v4/login/')).then(function(resp) {
                if (resp.success && resp.result.logged_in) {
                    return config.sessionToken;
                }
                config.sessionToken = '';
                return openSession();
            }).catch(function() {
                config.sessionToken = '';
                return openSession();
            });
        }
        return openSession();
    }

    function addDownload(url, filename) {
        return ensureSession().then(function() {
            var params = 'download_url=' + encodeURIComponent(url);
            if (filename) {
                params += '&filename=' + encodeURIComponent(filename);
            }
            return xhr('POST', apiUrl('/api/v4/downloads/add'), params, 'application/x-www-form-urlencoded');
        }).then(function(resp) {
            if (!resp.success) {
                throw new Error(resp.msg || 'Add download failed');
            }
            return resp.result;
        });
    }

    function getDownloads() {
        return ensureSession().then(function() {
            return xhr('GET', apiUrl('/api/v4/downloads/'));
        }).then(function(resp) {
            if (!resp.success) {
                throw new Error(resp.msg || 'Get downloads failed');
            }
            return resp.result || [];
        });
    }

    function pauseDownload(id) {
        return ensureSession().then(function() {
            return xhr('PUT', apiUrl('/api/v4/downloads/' + id), {
                status: 'stopped'
            });
        }).then(function(resp) {
            if (!resp.success) {
                throw new Error(resp.msg || 'Pause failed');
            }
            return resp.result;
        });
    }

    function resumeDownload(id) {
        return ensureSession().then(function() {
            return xhr('PUT', apiUrl('/api/v4/downloads/' + id), {
                status: 'downloading'
            });
        }).then(function(resp) {
            if (!resp.success) {
                throw new Error(resp.msg || 'Resume failed');
            }
            return resp.result;
        });
    }

    function retryDownload(id) {
        return ensureSession().then(function() {
            return xhr('PUT', apiUrl('/api/v4/downloads/' + id), {
                status: 'retry'
            });
        }).then(function(resp) {
            if (!resp.success) {
                throw new Error(resp.msg || 'Retry failed');
            }
            return resp.result;
        });
    }

    function deleteDownload(id) {
        return ensureSession().then(function() {
            return xhr('DELETE', apiUrl('/api/v4/downloads/' + id + '/erase'));
        }).then(function(resp) {
            if (!resp.success) {
                throw new Error(resp.msg || 'Delete failed');
            }
            return true;
        });
    }

    function pauseAllDownloads() {
        return getDownloads().then(function(downloads) {
            var active = downloads.filter(function(d) {
                return d.status === 'downloading';
            });
            return Promise.all(active.map(function(d) {
                return pauseDownload(d.id);
            }));
        });
    }

    function hasActiveDownloads() {
        var keys = Object.keys(activeDownloads);
        for (var i = 0; i < keys.length; i++) {
            if (activeDownloads[keys[i]].status === 'downloading') {
                return true;
            }
        }
        return false;
    }

    function startPolling(callback) {
        stopPolling();
        var poll = function() {
            getDownloads().then(function(downloads) {
                downloads = downloads || [];
                activeDownloads = {};
                for (var i = 0; i < downloads.length; i++) {
                    var d = downloads[i];
                    var pct = d.size > 0 ? Math.round((d.rx_bytes / d.size) * 100) : 0;
                    activeDownloads[d.name] = {
                        id: d.id,
                        status: d.status,
                        rx_pct: pct,
                        rx_bytes: d.rx_bytes,
                        size: d.size,
                        rx_rate: d.rx_rate,
                        name: d.name
                    };
                }
                if (callback) callback(activeDownloads);
            }).catch(function(err) {
                window.log('Freebox poll error: ' + err.message);
            });
        };
        poll();
        pollTimer = setInterval(poll, POLL_INTERVAL);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function getActiveDownloads() {
        return activeDownloads;
    }

    function isConfigured() {
        return !!(config.host && config.appToken);
    }

    return {
        setConfig: setConfig,
        requestAuthorization: requestAuthorization,
        trackAuthorization: trackAuthorization,
        pollAuthorization: pollAuthorization,
        openSession: openSession,
        ensureSession: ensureSession,
        addDownload: addDownload,
        getDownloads: getDownloads,
        pauseDownload: pauseDownload,
        resumeDownload: resumeDownload,
        retryDownload: retryDownload,
        deleteDownload: deleteDownload,
        pauseAllDownloads: pauseAllDownloads,
        hasActiveDownloads: hasActiveDownloads,
        startPolling: startPolling,
        stopPolling: stopPolling,
        getActiveDownloads: getActiveDownloads,
        isConfigured: isConfigured,
        hmacSha1: hmacSha1
    };
})();
