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

    searchMovie: function(title, year, callback) {
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
                self.getMovieDetails(data.results[0].id, callback);
            } else if (year) {
                self.searchMovie(title, null, callback);
            } else {
                self.searchTV(title, null, callback);
            }
        });
    },

    searchTV: function(title, year, callback, skipMulti) {
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
                self.getTVDetails(data.results[0].id, callback);
            } else if (year) {
                self.searchTV(title, null, callback, skipMulti);
            } else if (!skipMulti) {
                self.searchMulti(title, callback);
            } else {
                callback(null);
            }
        });
    },

    searchMulti: function(title, callback, triedSplit) {
        var self = this;
        var url = this.baseUrl + '/search/multi?api_key=' + this.apiKey +
            '&language=' + this.language +
            '&query=' + encodeURIComponent(title);

        this._fetch(url, function(data) {
            if (data && data.results && data.results.length > 0) {
                var result = data.results[0];
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
                    self.searchMovie(shortTitle, null, function(result) {
                        if (result) {
                            callback(result);
                        } else {
                            self.searchMulti(shortTitle, callback, true);
                        }
                    });
                } else {
                    callback(null);
                }
            } else {
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
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        callback(data);
                    } catch (e) {
                        window.log('TMDB parse error:', e);
                        callback(null);
                    }
                } else {
                    window.log('TMDB error:', xhr.status);
                    callback(null);
                }
            }
        };
        xhr.send();
    }
};

window.TMDB = TMDB;
