/**
 * TMDB API Client
 */
var TMDB = {
    apiKey: '',
    baseUrl: 'https://api.themoviedb.org/3',
    language: 'fr-FR',

    setApiKey: function(key) {
        this.apiKey = key || '';
    },

    isEnabled: function() {
        return !!this.apiKey;
    },

    findByImdbId: function(imdbId, callback) {
        window.log('TMDB findByImdbId "' + imdbId + '"');
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
                    window.log('TMDB findByImdbId result="' + r.title + '" type=movie id=' + r.id);
                    self.getMovieDetails(r.id, callback);
                    return;
                }
                if (data.tv_results && data.tv_results.length > 0) {
                    var r = data.tv_results[0];
                    window.log('TMDB findByImdbId result="' + r.name + '" type=tv id=' + r.id);
                    self.getTVDetails(r.id, callback);
                    return;
                }
            }
            window.log('TMDB findByImdbId no result');
            callback(null);
        });
    },

    searchMovie: function(title, year, callback) {
        window.log('TMDB searchMovie "' + title + '" year=' + year);
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
                window.log('TMDB searchMovie result="' + r.title + '" year=' + (r.release_date || '').substring(0,4) + ' id=' + r.id);
                self.getMovieDetails(r.id, callback);
            } else if (year) {
                window.log('TMDB searchMovie no result, retry without year');
                self.searchMovie(title, null, callback);
            } else {
                window.log('TMDB searchMovie no result, fallback to TV');
                self.searchTV(title, null, callback);
            }
        });
    },

    searchTV: function(title, year, callback, skipMulti) {
        window.log('TMDB searchTV "' + title + '" year=' + year);
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
                window.log('TMDB searchTV result="' + r.name + '" year=' + (r.first_air_date || '').substring(0,4) + ' id=' + r.id);
                self.getTVDetails(r.id, callback);
            } else if (year) {
                window.log('TMDB searchTV no result, retry without year');
                self.searchTV(title, null, callback, skipMulti);
            } else if (!skipMulti) {
                window.log('TMDB searchTV no result, fallback to multi');
                self.searchMulti(title, callback);
            } else {
                window.log('TMDB searchTV no result');
                callback(null);
            }
        });
    },

    searchMulti: function(title, callback, triedSplit) {
        window.log('TMDB searchMulti "' + title + '"');
        var self = this;
        var url = this.baseUrl + '/search/multi?api_key=' + this.apiKey +
            '&language=' + this.language +
            '&query=' + encodeURIComponent(title);

        this._fetch(url, function(data) {
            if (data && data.results && data.results.length > 0) {
                var result = data.results[0];
                var rTitle = result.title || result.name || '';
                var rYear = (result.release_date || result.first_air_date || '').substring(0,4);
                window.log('TMDB searchMulti result="' + rTitle + '" year=' + rYear + ' type=' + result.media_type + ' id=' + result.id);
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
                    window.log('TMDB searchMulti no result, retry with "' + shortTitle + '"');
                    self.searchMovie(shortTitle, null, function(result) {
                        if (result) {
                            callback(result);
                        } else {
                            self.searchMulti(shortTitle, callback, true);
                        }
                    });
                } else {
                    window.log('TMDB searchMulti no result');
                    callback(null);
                }
            } else {
                window.log('TMDB searchMulti no result');
                callback(null);
            }
        });
    },

    getMovieDetails: function(movieId, callback) {
        var self = this;
        var url = this.baseUrl + '/movie/' + movieId +
            '?api_key=' + this.apiKey +
            '&language=' + this.language +
            '&append_to_response=credits,external_ids';
        this._fetch(url, function(result) {
            if (result && !result.overview) {
                // Save external_ids before fallback
                var savedExternalIds = result.external_ids;
                var urlEn = self.baseUrl + '/movie/' + movieId +
                    '?api_key=' + self.apiKey +
                    '&language=en-US&append_to_response=credits';
                self._fetch(urlEn, function(enResult) {
                    if (enResult && enResult.overview) {
                        result.overview = enResult.overview;
                    }
                    // Restore external_ids
                    if (savedExternalIds) {
                        result.external_ids = savedExternalIds;
                    }
                    callback(result);
                });
            } else {
                callback(result);
            }
        });
    },

    getTVDetails: function(tvId, callback) {
        var self = this;
        var url = this.baseUrl + '/tv/' + tvId +
            '?api_key=' + this.apiKey +
            '&language=' + this.language +
            '&append_to_response=credits,external_ids';
        this._fetch(url, function(result) {
            if (result && !result.overview) {
                // Save external_ids before fallback
                var savedExternalIds = result.external_ids;
                var urlEn = self.baseUrl + '/tv/' + tvId +
                    '?api_key=' + self.apiKey +
                    '&language=en-US&append_to_response=credits';
                self._fetch(urlEn, function(enResult) {
                    if (enResult && enResult.overview) {
                        result.overview = enResult.overview;
                    }
                    // Restore external_ids
                    if (savedExternalIds) {
                        result.external_ids = savedExternalIds;
                    }
                    callback(result);
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
            return data.credits.cast.slice(0, 8).map(function(c) {
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
                // Sort by popularity
                var sorted = data.results.sort(function(a, b) {
                    return (b.popularity || 0) - (a.popularity || 0);
                });
                window.log('TMDB searchPerson: ' + sorted.length + ' results');
                callback(sorted);
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

    _fetch: function(url, callback) {
        var xhr = new XMLHttpRequest();
        window.log('HTTP> ' + url);
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                var logMsg = 'HTTP< ' + xhr.status + ' ' + url;
                if (xhr.responseURL && xhr.responseURL !== url) {
                    logMsg += ' -> ' + xhr.responseURL;
                }
                window.log(logMsg);
                window.log('HTTP body ' + url + ': ' + xhr.responseText);
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        callback(data);
                    } catch (e) {
                        window.log('ERROR TMDB parse: ' + e);
                        callback(null);
                    }
                }
                else {
                    callback(null);
                }
            }
        };
        xhr.send();
    }
};

window.TMDB = TMDB;
