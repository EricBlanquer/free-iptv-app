/**
 * TMDB API Client
 */
var TMDB = {
    apiKey: '',
    baseUrl: 'https://api.themoviedb.org/3',
    v4BaseUrl: 'https://api.themoviedb.org/4',
    language: 'fr-FR',

    defaultApiKey: 'b796d544bb4de0b1a89ffdfb01304b94',
    defaultV4ReadToken: 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJiNzk2ZDU0NGJiNGRlMGIxYTg5ZmZkZmIwMTMwNGI5NCIsIm5iZiI6MTU2OTY3MjgzMi4wOTEsInN1YiI6IjVkOGY0ZTgwMTcyZDdmMDAyNzU1NWQ1MSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.UytVKNoNF8-AV3mYS9jmWH1VHlKqEh-XNPqwLJc1kh8',

    accessToken: '',
    accountId: null,
    username: '',

    setApiKey: function(key) {
        this.apiKey = key || this.defaultApiKey;
    },

    setV4ReadToken: function(token) {
        this.v4ReadToken = token || this.defaultV4ReadToken;
    },

    setAccessToken: function(token, accountId, username) {
        this.accessToken = token || '';
        this.accountId = accountId || null;
        this.username = username || '';
    },

    isEnabled: function() {
        return !!this.apiKey;
    },

    isUserLoggedIn: function() {
        return !!this.accessToken && !!this.accountId;
    },

    canStartAuth: function() {
        return !!(this.v4ReadToken || this.defaultV4ReadToken);
    },

    findByImdbId: function(imdbId, callback) {
        window.log('TMDB', 'findByImdbId "' + imdbId + '"');
        if (!this.isEnabled() || !imdbId) {
            callback(null);
            return;
        }
        var self = this;
        var url = this.baseUrl + '/find/' + imdbId +
            '?api_key=' + this.apiKey +
            '&language=' + this.language +
            '&external_source=imdb_id';
        this._fetch(url, function(data) {
            if (data) {
                if (data.movie_results && data.movie_results.length > 0) {
                    var r = data.movie_results[0];
                    window.log('TMDB', 'findByImdbId result="' + r.title + '" type=movie id=' + r.id);
                    self.getMovieDetails(r.id, callback);
                    return;
                }
                if (data.tv_results && data.tv_results.length > 0) {
                    var r = data.tv_results[0];
                    window.log('TMDB', 'findByImdbId result="' + r.name + '" type=tv id=' + r.id);
                    self.getTVDetails(r.id, callback);
                    return;
                }
            }
            window.log('TMDB', 'findByImdbId no result');
            callback(null);
        });
    },

    searchMovie: function(title, year, callback) {
        window.log('TMDB', 'searchMovie "' + title + '" year=' + year);
        if (!this.isEnabled()) {
            callback(null);
            return;
        }
        var self = this;
        var url = this.baseUrl + '/search/movie?api_key=' + this.apiKey +
            '&language=' + this.language +
            '&query=' + encodeURIComponent(title);
        if (year) {
            url += '&year=' + year;
        }

        this._fetch(url, function(data) {
            if (data && data.results && data.results.length > 0) {
                var r = data.results[0];
                window.log('TMDB', 'searchMovie result="' + r.title + '" year=' + (r.release_date || '').substring(0,4) + ' id=' + r.id);
                self.getMovieDetails(r.id, callback);
            } else if (year) {
                window.log('TMDB', 'searchMovie no result, retry without year');
                self.searchMovie(title, null, callback);
            } else {
                window.log('TMDB', 'searchMovie no result, fallback to TV');
                self.searchTV(title, null, callback);
            }
        });
    },

    searchTV: function(title, year, callback, skipMulti) {
        window.log('TMDB', 'searchTV "' + title + '" year=' + year);
        if (!this.isEnabled()) {
            callback(null);
            return;
        }
        var self = this;
        var url = this.baseUrl + '/search/tv?api_key=' + this.apiKey +
            '&language=' + this.language +
            '&query=' + encodeURIComponent(title);
        if (year) {
            url += '&first_air_date_year=' + year;
        }

        this._fetch(url, function(data) {
            if (data && data.results && data.results.length > 0) {
                var r = data.results[0];
                window.log('TMDB', 'searchTV result="' + r.name + '" year=' + (r.first_air_date || '').substring(0,4) + ' id=' + r.id);
                self.getTVDetails(r.id, callback);
            } else if (year) {
                window.log('TMDB', 'searchTV no result, retry without year');
                self.searchTV(title, null, callback, skipMulti);
            } else if (!skipMulti) {
                window.log('TMDB', 'searchTV no result, fallback to multi');
                self.searchMulti(title, callback);
            } else {
                window.log('TMDB', 'searchTV no result');
                callback(null);
            }
        });
    },

    searchMulti: function(title, callback, triedSplit) {
        window.log('TMDB', 'searchMulti "' + title + '"');
        var self = this;
        var url = this.baseUrl + '/search/multi?api_key=' + this.apiKey +
            '&language=' + this.language +
            '&query=' + encodeURIComponent(title);

        this._fetch(url, function(data) {
            if (data && data.results && data.results.length > 0) {
                var result = data.results[0];
                var rTitle = result.title || result.name || '';
                var rYear = (result.release_date || result.first_air_date || '').substring(0,4);
                window.log('TMDB', 'searchMulti result="' + rTitle + '" year=' + rYear + ' type=' + result.media_type + ' id=' + result.id);
                if (result.media_type === 'movie') {
                    self.getMovieDetails(result.id, callback);
                } else if (result.media_type === 'tv') {
                    self.getTVDetails(result.id, callback);
                } else {
                    callback(null);
                }
            } else if (!triedSplit) {
                var shortTitle = title
                    .replace(/\s*\([^)]*\)\s*/g, ' ')
                    .replace(/\s*-\s*.*/g, '')
                    .trim();
                if (shortTitle && shortTitle !== title) {
                    window.log('TMDB', 'searchMulti no result, retry with "' + shortTitle + '"');
                    self.searchMovie(shortTitle, null, function(result) {
                        if (result) {
                            callback(result);
                        } else {
                            self.searchMulti(shortTitle, callback, true);
                        }
                    });
                } else {
                    window.log('TMDB', 'searchMulti no result');
                    callback(null);
                }
            } else {
                window.log('TMDB', 'searchMulti no result');
                callback(null);
            }
        });
    },

    getMovieDetails: function(movieId, callback) {
        if (!this.isEnabled() || !movieId) { callback(null); return; }
        var self = this;
        var url = this.baseUrl + '/movie/' + movieId +
            '?api_key=' + this.apiKey +
            '&language=' + this.language +
            '&append_to_response=credits,external_ids';
        this._fetch(url, function(result) {
            if (result && !result.overview) {
                var savedExternalIds = result.external_ids;
                var urlEn = self.baseUrl + '/movie/' + movieId +
                    '?api_key=' + self.apiKey +
                    '&language=en-US&append_to_response=credits';
                self._fetch(urlEn, function(enResult) {
                    if (enResult && enResult.overview) {
                        var targetLang = self.language.split('-')[0];
                        self.translate(enResult.overview, targetLang, function(translated) {
                            result.overview = translated;
                            if (savedExternalIds) {
                                result.external_ids = savedExternalIds;
                            }
                            callback(result);
                        });
                    } else {
                        if (savedExternalIds) {
                            result.external_ids = savedExternalIds;
                        }
                        callback(result);
                    }
                });
            } else {
                callback(result);
            }
        });
    },

    getTVDetails: function(tvId, callback) {
        if (!this.isEnabled() || !tvId) { callback(null); return; }
        var self = this;
        var url = this.baseUrl + '/tv/' + tvId +
            '?api_key=' + this.apiKey +
            '&language=' + this.language +
            '&append_to_response=credits,external_ids';
        this._fetch(url, function(result) {
            if (result && !result.overview) {
                var savedExternalIds = result.external_ids;
                var urlEn = self.baseUrl + '/tv/' + tvId +
                    '?api_key=' + self.apiKey +
                    '&language=en-US&append_to_response=credits';
                self._fetch(urlEn, function(enResult) {
                    if (enResult && enResult.overview) {
                        var targetLang = self.language.split('-')[0];
                        self.translate(enResult.overview, targetLang, function(translated) {
                            result.overview = translated;
                            if (savedExternalIds) {
                                result.external_ids = savedExternalIds;
                            }
                            callback(result);
                        });
                    } else {
                        if (savedExternalIds) {
                            result.external_ids = savedExternalIds;
                        }
                        callback(result);
                    }
                });
            } else {
                callback(result);
            }
        });
    },

    getGenres: function(data) {
        if (data && data.genres) {
            return data.genres.map(function(g) { return g.name; });
        }
        return [];
    },

    getCast: function(data) {
        if (data && data.credits && data.credits.cast) {
            return data.credits.cast.map(function(c) {
                return {
                    id: c.id,
                    name: c.name,
                    character: c.character,
                    photo: c.profile_path ? 'https://image.tmdb.org/t/p/w185' + c.profile_path : null
                };
            });
        }
        return [];
    },

    getDirector: function(data) {
        if (data && data.credits && data.credits.crew) {
            for (var i = 0; i < data.credits.crew.length; i++) {
                var crew = data.credits.crew[i];
                if (crew.job === 'Director') {
                    return {
                        id: crew.id,
                        name: crew.name,
                        photo: crew.profile_path ? 'https://image.tmdb.org/t/p/w185' + crew.profile_path : null
                    };
                }
            }
        }
        return null;
    },

    getCreator: function(data) {
        if (data && data.created_by && data.created_by.length > 0) {
            var creator = data.created_by[0];
            return {
                id: creator.id,
                name: creator.name,
                photo: creator.profile_path ? 'https://image.tmdb.org/t/p/w185' + creator.profile_path : null
            };
        }
        return null;
    },

    getImages: function(id, type, callback) {
        if (!this.isEnabled() || !id) {
            callback(null);
            return;
        }
        var endpoint = type === 'movie' ? '/movie/' : '/tv/';
        var url = this.baseUrl + endpoint + id + '/images?api_key=' + this.apiKey;
        this._fetch(url, function(data) {
            if (data && data.backdrops && data.backdrops.length > 0) {
                var backdrops = data.backdrops.map(function(b) {
                    return 'https://image.tmdb.org/t/p/w1280' + b.file_path;
                });
                callback(backdrops);
            }
            else {
                callback(null);
            }
        });
    },

    getSeasonDetails: function(tvId, seasonNumber, callback) {
        if (!this.isEnabled() || !tvId) {
            callback(null);
            return;
        }
        var url = this.baseUrl + '/tv/' + tvId + '/season/' + seasonNumber +
            '?api_key=' + this.apiKey + '&language=' + this.language;
        this._fetch(url, function(data) {
            if (data && data.episodes) {
                var episodes = {};
                data.episodes.forEach(function(ep) {
                    episodes[ep.episode_number] = {
                        name: ep.name,
                        air_date: ep.air_date,
                        overview: ep.overview
                    };
                });
                callback(episodes);
            }
            else {
                callback(null);
            }
        });
    },

    getPersonDetails: function(personId, callback) {
        if (!this.isEnabled()) {
            callback(null);
            return;
        }
        var url = this.baseUrl + '/person/' + personId +
            '?api_key=' + this.apiKey +
            '&language=' + this.language +
            '&append_to_response=combined_credits';
        this._fetch(url, callback);
    },

    searchPerson: function(query, callback) {
        if (!this.isEnabled() || !query) {
            callback(null);
            return;
        }
        var url = this.baseUrl + '/search/person' +
            '?api_key=' + this.apiKey +
            '&language=' + this.language +
            '&query=' + encodeURIComponent(query);
        this._fetch(url, function(data) {
            if (data && data.results && data.results.length > 0) {
                var actors = data.results.filter(function(p) {
                    return !p.known_for_department || p.known_for_department === 'Acting';
                });
                var sorted = actors.sort(function(a, b) {
                    return (b.popularity || 0) - (a.popularity || 0);
                });
                window.log('TMDB', 'searchPerson: ' + sorted.length + ' actors (filtered from ' + data.results.length + ')');
                callback(sorted.length > 0 ? sorted : null);
            }
            else {
                callback(null);
            }
        });
    },

    formatRuntime: function(minutes) {
        if (!minutes) return '';
        var h = Math.floor(minutes / 60);
        var m = minutes % 60;
        if (h > 0) {
            return h + 'h ' + m + 'min';
        }
        return m + ' min';
    },

    _pendingQueue: [],
    _activeCount: 0,
    _maxConcurrent: 3,

    _processQueue: function() {
        while (this._activeCount < this._maxConcurrent && this._pendingQueue.length > 0) {
            var item = this._pendingQueue.shift();
            this._activeCount++;
            if (item.method && item.method !== 'GET') {
                this._doRequest(item.method, item.url, item.body, item.auth, item.callback);
            }
            else if (item.auth) {
                this._doRequest('GET', item.url, null, item.auth, item.callback);
            }
            else {
                this._doFetch(item.url, item.callback);
            }
        }
    },

    _fetch: function(url, callback) {
        this._pendingQueue.push({ url: url, callback: callback });
        this._processQueue();
    },

    _redactUrl: function(url) {
        return url.replace(/api_key=[^&]+/g, 'api_key=***');
    },

    _stripApiKey: function(url) {
        return url.replace(/([?&])api_key=[^&]*(&|$)/, function(m, p1, p2) {
            return p2 === '&' ? p1 : '';
        }).replace(/[?&]$/, '');
    },

    _doFetch: function(url, callback) {
        this._doRequest('GET', url, null, null, callback);
    },

    _doRequest: function(method, url, body, auth, callback) {
        var self = this;
        var xhr = new XMLHttpRequest();
        var bearer = null;
        if (auth === 'app') {
            bearer = this.v4ReadToken || this.defaultV4ReadToken;
        }
        else if (auth === 'user') {
            bearer = this.accessToken;
        }
        else if (this.accessToken && url.indexOf('/3/') !== -1) {
            bearer = this.accessToken;
        }
        if (bearer) {
            url = this._stripApiKey(url);
        }
        window.log('HTTP', '> ' + method + ' ' + this._redactUrl(url) + (bearer ? ' [Bearer]' : ''));
        xhr.open(method, url, true);
        xhr.timeout = 15000;
        if (bearer) {
            xhr.setRequestHeader('Authorization', 'Bearer ' + bearer);
        }
        if (body) {
            xhr.setRequestHeader('Content-Type', 'application/json;charset=utf-8');
        }
        xhr.ontimeout = function() {
            self._activeCount--;
            window.log('ERROR', 'TMDB timeout: ' + self._redactUrl(url));
            callback(null, 0);
            self._processQueue();
        };
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                self._activeCount--;
                var redactedUrl = self._redactUrl(url);
                var logMsg = '< ' + xhr.status + ' ' + redactedUrl;
                if (xhr.responseURL && xhr.responseURL !== url) {
                    logMsg += ' -> ' + self._redactUrl(xhr.responseURL);
                }
                window.log('HTTP', logMsg);
                var parsedData = null;
                if (xhr.responseText) {
                    try {
                        parsedData = JSON.parse(xhr.responseText);
                    }
                    catch (ex) {
                        window.log('ERROR', 'TMDB parse: ' + ex);
                    }
                }
                if (parsedData && parsedData.status_message && !(xhr.status >= 200 && xhr.status < 300)) {
                    window.log('TMDB', 'API error status=' + xhr.status + ' code=' + parsedData.status_code + ' msg="' + parsedData.status_message + '"');
                }
                callback(parsedData, xhr.status);
                self._processQueue();
            }
        };
        xhr.send(body ? JSON.stringify(body) : null);
    },

    translate: function(text, targetLang, callback) {
        if (!text || targetLang === 'en') {
            callback(text);
            return;
        }
        var langMap = {
            'fr': 'fr', 'de': 'de', 'es': 'es', 'it': 'it',
            'pt': 'pt', 'nl': 'nl', 'pl': 'pl', 'ru': 'ru',
            'ar': 'ar', 'tr': 'tr'
        };
        var target = langMap[targetLang] || 'fr';
        var url = 'https://api.mymemory.translated.net/get?q=' +
            encodeURIComponent(text) + '&langpair=en|' + target;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
                            var translated = data.responseData.translatedText;
                            window.log('TRANSLATE', 'en->' + target + ': ' + text.substring(0, 50) + '...');
                            callback(translated);
                            return;
                        }
                    } catch (e) {}
                }
                callback(text);
            }
        };
        xhr.send();
    }
};

TMDB.searchMulti = function(query, callback) {
    if (!this.isEnabled() || !query) {
        callback([]);
        return;
    }
    var url = this.baseUrl + '/search/multi?api_key=' + this.apiKey +
        '&language=' + this.language +
        '&query=' + encodeURIComponent(query);
    this._fetch(url, function(data) {
        var results = (data && data.results) ? data.results.filter(function(r) {
            return r.media_type === 'movie' || r.media_type === 'tv';
        }) : [];
        callback(results);
    });
};

TMDB.searchMovieAsync = function(title, year) {
    var self = this;
    return new Promise(function(resolve) {
        self.searchMovie(title, year, function(result) {
            resolve(result);
        });
    });
};

TMDB.getRecommendations = function(id, type) {
    var self = this;
    return new Promise(function(resolve) {
        if (!self.isEnabled() || !id) { resolve(null); return; }
        var path = (type === 'tv' || type === 'series') ? 'tv' : 'movie';
        var url = self.baseUrl + '/' + path + '/' + id + '/recommendations?api_key=' + self.apiKey + '&language=' + self.language;
        self._fetch(url, function(data) {
            resolve(data ? (data.results || []) : null);
        });
    });
};

TMDB.getSimilar = function(id, type) {
    var self = this;
    return new Promise(function(resolve) {
        if (!self.isEnabled() || !id) { resolve(null); return; }
        var path = (type === 'tv' || type === 'series') ? 'tv' : 'movie';
        var url = self.baseUrl + '/' + path + '/' + id + '/similar?api_key=' + self.apiKey + '&language=' + self.language;
        self._fetch(url, function(data) {
            resolve(data ? (data.results || []) : null);
        });
    });
};

TMDB.searchTVAsync = function(title, year) {
    var self = this;
    return new Promise(function(resolve) {
        self.searchTV(title, year, function(result) {
            resolve(result);
        });
    });
};

TMDB.getMovieDetailsAsync = function(movieId) {
    var self = this;
    return new Promise(function(resolve) {
        self.getMovieDetails(movieId, function(result) {
            resolve(result);
        });
    });
};

TMDB.getTVDetailsAsync = function(tvId) {
    var self = this;
    return new Promise(function(resolve) {
        self.getTVDetails(tvId, function(result) {
            resolve(result);
        });
    });
};

TMDB.requestV4Token = function(callback) {
    if (!this.canStartAuth()) {
        window.log('TMDB', 'requestV4Token: no v4 read token configured');
        callback(null);
        return;
    }
    var url = this.v4BaseUrl + '/auth/request_token';
    this._pendingQueue.push({
        url: url,
        method: 'POST',
        body: { redirect_to: null },
        auth: 'app',
        callback: function(data, status) {
            if (data && data.success && data.request_token) {
                window.log('TMDB', 'requestV4Token ok');
                callback(data.request_token);
            }
            else {
                window.log('ERROR', 'TMDB requestV4Token failed status=' + status);
                callback(null);
            }
        }
    });
    this._processQueue();
};

TMDB.pollV4AccessToken = function(requestToken, callback) {
    if (!this.canStartAuth() || !requestToken) {
        callback(null, 'not-configured');
        return;
    }
    var url = this.v4BaseUrl + '/auth/access_token';
    this._pendingQueue.push({
        url: url,
        method: 'POST',
        body: { request_token: requestToken },
        auth: 'app',
        callback: function(data, status) {
            if (data && data.success && data.access_token && data.account_id) {
                window.log('TMDB', 'pollV4AccessToken ok account=' + data.account_id);
                callback({ accessToken: data.access_token, accountId: data.account_id }, null);
            }
            else if (status === 0 || status >= 500) {
                callback(null, 'error');
            }
            else {
                callback(null, 'pending');
            }
        }
    });
    this._processQueue();
};

TMDB.logoutV4 = function(callback) {
    if (!this.accessToken) {
        callback(true);
        return;
    }
    var token = this.accessToken;
    var url = this.v4BaseUrl + '/auth/access_token';
    var self = this;
    this._pendingQueue.push({
        url: url,
        method: 'DELETE',
        body: { access_token: token },
        auth: 'app',
        callback: function(data, status) {
            self.setAccessToken('', null, '');
            callback(status >= 200 && status < 300);
        }
    });
    this._processQueue();
};

TMDB.getAccountDetails = function(callback) {
    if (!this.accessToken) {
        callback(null);
        return;
    }
    var url = this.baseUrl + '/account';
    this._pendingQueue.push({
        url: url,
        method: 'GET',
        auth: 'user',
        callback: function(data, status) {
            callback(data || null);
        }
    });
    this._processQueue();
};

TMDB.rateMovie = function(movieId, value, callback) {
    if (!this.accessToken || !movieId) { callback(false); return; }
    var url = this.baseUrl + '/movie/' + movieId + '/rating';
    this._pendingQueue.push({
        url: url,
        method: 'POST',
        body: { value: value },
        auth: 'user',
        callback: function(data, status) {
            window.log('TMDB', 'rateMovie id=' + movieId + ' value=' + value + ' status=' + status);
            callback(status >= 200 && status < 300);
        }
    });
    this._processQueue();
};

TMDB.rateTVShow = function(tvId, value, callback) {
    if (!this.accessToken || !tvId) { callback(false); return; }
    var url = this.baseUrl + '/tv/' + tvId + '/rating';
    this._pendingQueue.push({
        url: url,
        method: 'POST',
        body: { value: value },
        auth: 'user',
        callback: function(data, status) {
            window.log('TMDB', 'rateTVShow id=' + tvId + ' value=' + value + ' status=' + status);
            callback(status >= 200 && status < 300);
        }
    });
    this._processQueue();
};

TMDB.deleteRating = function(id, type, callback) {
    if (!this.accessToken || !id) { callback(false); return; }
    var path = (type === 'tv' || type === 'series') ? '/tv/' : '/movie/';
    var url = this.baseUrl + path + id + '/rating';
    this._pendingQueue.push({
        url: url,
        method: 'DELETE',
        auth: 'user',
        callback: function(data, status) {
            window.log('TMDB', 'deleteRating id=' + id + ' type=' + type + ' status=' + status);
            callback(status >= 200 && status < 300);
        }
    });
    this._processQueue();
};

TMDB.getUserRating = function(id, type, callback) {
    if (!this.accessToken || !id) { callback(null); return; }
    var path = (type === 'tv' || type === 'series') ? '/tv/' : '/movie/';
    var url = this.baseUrl + path + id + '/account_states';
    this._pendingQueue.push({
        url: url,
        method: 'GET',
        auth: 'user',
        callback: function(data, status) {
            if (!data) { callback(null); return; }
            var rated = data.rated;
            if (rated && typeof rated === 'object' && typeof rated.value === 'number') {
                callback(rated.value);
            }
            else {
                callback(null);
            }
        }
    });
    this._processQueue();
};

TMDB.getMyRatedPage = function(type, page, callback) {
    if (!this.accessToken || !this.accountId) { callback(null); return; }
    var path = type === 'tv' ? '/tv/rated' : '/movie/rated';
    var url = this.v4BaseUrl + '/account/' + this.accountId + path + '?page=' + (page || 1) + '&language=' + this.language;
    this._pendingQueue.push({
        url: url,
        method: 'GET',
        auth: 'user',
        callback: function(data, status) {
            callback(data || null);
        }
    });
    this._processQueue();
};

TMDB.getAllMyRated = function(type, callback) {
    var self = this;
    if (!this.accessToken || !this.accountId) { callback({}); return; }
    var all = {};
    var fetchPage = function(page) {
        self.getMyRatedPage(type, page, function(data) {
            if (!data || !data.results) {
                callback(all);
                return;
            }
            data.results.forEach(function(item) {
                if (!item || !item.id) return;
                var ratingValue = null;
                if (item.account_rating && typeof item.account_rating.value === 'number') {
                    ratingValue = item.account_rating.value;
                }
                else if (typeof item.rating === 'number') {
                    ratingValue = item.rating;
                }
                if (ratingValue === null) return;
                var title = type === 'tv' ? item.name : item.title;
                var dateField = type === 'tv' ? item.first_air_date : item.release_date;
                var year = dateField ? String(dateField).substring(0, 4) : '';
                all[item.id] = {
                    value: ratingValue,
                    title: title || '',
                    year: year,
                    posterPath: item.poster_path || ''
                };
            });
            if (page < (data.total_pages || 1)) {
                fetchPage(page + 1);
            }
            else {
                window.log('TMDB', 'getAllMyRated type=' + type + ' count=' + Object.keys(all).length + ' pages=' + data.total_pages);
                callback(all);
            }
        });
    };
    fetchPage(1);
};

window.TMDB = TMDB;
