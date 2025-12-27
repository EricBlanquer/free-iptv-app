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

var tmdbCode = fs.readFileSync('./js/tmdb.js', 'utf8');
eval(tmdbCode);

function respondXHR(instance, responseData, status) {
    instance.responseText = JSON.stringify(responseData);
    instance.status = status || 200;
    instance.readyState = 4;
    if (instance.onreadystatechange) instance.onreadystatechange();
}

function tick() {
    return new Promise(function(r) { setTimeout(r, 10); });
}

describe('TMDB', function() {
    beforeEach(function() {
        xhrInstances = [];
        TMDB.setApiKey('test-api-key');
        TMDB.language = 'fr-FR';
        TMDB._pendingQueue = [];
        TMDB._activeCount = 0;
    });

    describe('setApiKey / isEnabled', function() {
        it('should be enabled when API key is set', function() {
            TMDB.setApiKey('abc123');
            expect(TMDB.isEnabled()).toBe(true);
        });

        it('should be disabled when API key is empty', function() {
            TMDB.setApiKey('');
            expect(TMDB.isEnabled()).toBe(false);
        });

        it('should be disabled when API key is null', function() {
            TMDB.setApiKey(null);
            expect(TMDB.isEnabled()).toBe(false);
        });
    });

    describe('searchMovie', function() {
        it('should construct correct URL with title and year', function() {
            TMDB.searchMovie('Inception', 2010, function() {});
            expect(xhrInstances[0].url).toContain('/search/movie');
            expect(xhrInstances[0].url).toContain('api_key=test-api-key');
            expect(xhrInstances[0].url).toContain('language=fr-FR');
            expect(xhrInstances[0].url).toContain('query=Inception');
            expect(xhrInstances[0].url).toContain('year=2010');
        });

        it('should fetch movie details on successful search', function(done) {
            TMDB.searchMovie('Inception', 2010, function(result) {
                expect(result).not.toBeNull();
                expect(result.title).toBe('Inception');
                done();
            });

            respondXHR(xhrInstances[0], {
                results: [{ id: 27205, title: 'Inception', release_date: '2010-07-16' }]
            });

            tick().then(function() {
                respondXHR(xhrInstances[1], {
                    id: 27205,
                    title: 'Inception',
                    overview: 'A thief who steals secrets...',
                    credits: { cast: [], crew: [] },
                    external_ids: { imdb_id: 'tt1375666' }
                });
            });
        });

        it('should retry without year when no results', function(done) {
            TMDB.searchMovie('Inception', 2010, function(result) {
                expect(result).not.toBeNull();
                done();
            });

            respondXHR(xhrInstances[0], { results: [] });

            tick().then(function() {
                expect(xhrInstances[1].url).toContain('query=Inception');
                expect(xhrInstances[1].url).not.toContain('year=');
                respondXHR(xhrInstances[1], {
                    results: [{ id: 27205, title: 'Inception', release_date: '2010-07-16' }]
                });
                return tick();
            }).then(function() {
                respondXHR(xhrInstances[2], {
                    id: 27205, title: 'Inception', overview: 'desc',
                    credits: { cast: [], crew: [] }, external_ids: {}
                });
            });
        });

        it('should fallback to searchTV when no movie results without year', function(done) {
            TMDB.searchMovie('Breaking Bad', null, function(result) {
                expect(result).not.toBeNull();
                expect(result.name).toBe('Breaking Bad');
                done();
            });

            respondXHR(xhrInstances[0], { results: [] });

            tick().then(function() {
                expect(xhrInstances[1].url).toContain('/search/tv');
                respondXHR(xhrInstances[1], {
                    results: [{ id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20' }]
                });
                return tick();
            }).then(function() {
                respondXHR(xhrInstances[2], {
                    id: 1396, name: 'Breaking Bad', overview: 'A chemistry teacher...',
                    credits: { cast: [], crew: [] }, external_ids: {}
                });
            });
        });

        it('should return null when not enabled', function(done) {
            TMDB.setApiKey('');
            TMDB.searchMovie('Inception', 2010, function(result) {
                expect(result).toBeNull();
                expect(xhrInstances.length).toBe(0);
                done();
            });
        });
    });

    describe('searchTV', function() {
        it('should construct correct URL', function() {
            TMDB.searchTV('Breaking Bad', 2008, function() {});
            expect(xhrInstances[0].url).toContain('/search/tv');
            expect(xhrInstances[0].url).toContain('query=Breaking');
            expect(xhrInstances[0].url).toContain('first_air_date_year=2008');
        });

        it('should return null when no results and skipMulti is true', function(done) {
            TMDB.searchTV('NonExistent', null, function(result) {
                expect(result).toBeNull();
                done();
            }, true);

            respondXHR(xhrInstances[0], { results: [] });
        });
    });

    describe('searchMulti', function() {
        it('should construct correct URL', function() {
            TMDB.searchMulti('Inception', function() {});
            expect(xhrInstances[0].url).toContain('/search/multi');
            expect(xhrInstances[0].url).toContain('query=Inception');
        });

        it('should route movie result to getMovieDetails', function(done) {
            TMDB.searchMulti('Inception', function(result) {
                expect(result).not.toBeNull();
                expect(result.title).toBe('Inception');
                done();
            });

            respondXHR(xhrInstances[0], {
                results: [{ id: 27205, title: 'Inception', media_type: 'movie', release_date: '2010-07-16' }]
            });

            tick().then(function() {
                respondXHR(xhrInstances[1], {
                    id: 27205, title: 'Inception', overview: 'desc',
                    credits: { cast: [], crew: [] }, external_ids: {}
                });
            });
        });

        it('should route tv result to getTVDetails', function(done) {
            TMDB.searchMulti('Breaking Bad', function(result) {
                expect(result).not.toBeNull();
                expect(result.name).toBe('Breaking Bad');
                done();
            });

            respondXHR(xhrInstances[0], {
                results: [{ id: 1396, name: 'Breaking Bad', media_type: 'tv', first_air_date: '2008-01-20' }]
            });

            tick().then(function() {
                respondXHR(xhrInstances[1], {
                    id: 1396, name: 'Breaking Bad', overview: 'A chemistry teacher...',
                    credits: { cast: [], crew: [] }, external_ids: {}
                });
            });
        });

        it('should return null for unknown media type', function(done) {
            TMDB.searchMulti('Test', function(result) {
                expect(result).toBeNull();
                done();
            });

            respondXHR(xhrInstances[0], {
                results: [{ id: 1, name: 'Test', media_type: 'person' }]
            });
        });

        it('should try shorter title on no results', function(done) {
            TMDB.searchMulti('Inception (2010) - Extended Cut', function(result) {
                expect(result).not.toBeNull();
                done();
            });

            respondXHR(xhrInstances[0], { results: [] });

            tick().then(function() {
                expect(xhrInstances[1].url).toContain('query=Inception');
                respondXHR(xhrInstances[1], {
                    results: [{ id: 27205, title: 'Inception', release_date: '2010-07-16' }]
                });
                return tick();
            }).then(function() {
                respondXHR(xhrInstances[2], {
                    id: 27205, title: 'Inception', overview: 'desc',
                    credits: { cast: [], crew: [] }, external_ids: {}
                });
            });
        });
    });

    describe('getMovieDetails', function() {
        it('should construct correct URL', function() {
            TMDB.getMovieDetails(27205, function() {});
            expect(xhrInstances[0].url).toContain('/movie/27205');
            expect(xhrInstances[0].url).toContain('append_to_response=credits,external_ids');
        });

        it('should return parsed data', function(done) {
            TMDB.getMovieDetails(27205, function(result) {
                expect(result.title).toBe('Inception');
                expect(result.overview).toBe('A thief who steals secrets...');
                done();
            });

            respondXHR(xhrInstances[0], {
                id: 27205, title: 'Inception', overview: 'A thief who steals secrets...',
                credits: { cast: [], crew: [] }, external_ids: { imdb_id: 'tt1375666' }
            });
        });

        it('should fetch English overview and translate when overview is missing', function(done) {
            TMDB.getMovieDetails(27205, function(result) {
                expect(result.overview).toBe('Un voleur qui vole des secrets...');
                expect(result.external_ids.imdb_id).toBe('tt1375666');
                done();
            });

            respondXHR(xhrInstances[0], {
                id: 27205, title: 'Inception', overview: '',
                credits: { cast: [], crew: [] }, external_ids: { imdb_id: 'tt1375666' }
            });

            tick().then(function() {
                expect(xhrInstances[1].url).toContain('language=en-US');
                respondXHR(xhrInstances[1], {
                    id: 27205, title: 'Inception', overview: 'A thief who steals secrets...',
                    credits: { cast: [], crew: [] }
                });
                return tick();
            }).then(function() {
                expect(xhrInstances[2].url).toContain('api.mymemory.translated.net');
                expect(xhrInstances[2].url).toContain('langpair=en|fr');
                xhrInstances[2].responseText = JSON.stringify({
                    responseStatus: 200,
                    responseData: { translatedText: 'Un voleur qui vole des secrets...' }
                });
                xhrInstances[2].status = 200;
                xhrInstances[2].readyState = 4;
                if (xhrInstances[2].onreadystatechange) xhrInstances[2].onreadystatechange();
            });
        });
    });

    describe('getTVDetails', function() {
        it('should construct correct URL', function() {
            TMDB.getTVDetails(1396, function() {});
            expect(xhrInstances[0].url).toContain('/tv/1396');
            expect(xhrInstances[0].url).toContain('append_to_response=credits,external_ids');
        });
    });

    describe('getSeasonDetails', function() {
        it('should construct correct URL', function() {
            TMDB.getSeasonDetails(1396, 1, function() {});
            expect(xhrInstances[0].url).toContain('/tv/1396/season/1');
            expect(xhrInstances[0].url).toContain('language=fr-FR');
        });

        it('should return episodes keyed by episode_number', function(done) {
            TMDB.getSeasonDetails(1396, 1, function(result) {
                expect(result[1].name).toBe('Pilot');
                expect(result[2].name).toBe('Cat\'s in the Bag...');
                done();
            });

            respondXHR(xhrInstances[0], {
                episodes: [
                    { episode_number: 1, name: 'Pilot', air_date: '2008-01-20', overview: 'ep1' },
                    { episode_number: 2, name: 'Cat\'s in the Bag...', air_date: '2008-01-27', overview: 'ep2' }
                ]
            });
        });

        it('should return null when no episodes', function(done) {
            TMDB.getSeasonDetails(1396, 1, function(result) {
                expect(result).toBeNull();
                done();
            });

            respondXHR(xhrInstances[0], {});
        });

        it('should return null when not enabled', function(done) {
            TMDB.setApiKey('');
            TMDB.getSeasonDetails(1396, 1, function(result) {
                expect(result).toBeNull();
                expect(xhrInstances.length).toBe(0);
                done();
            });
        });
    });

    describe('Queue system', function() {
        it('should respect concurrency limit', function() {
            for (var i = 0; i < 5; i++) {
                TMDB._fetch('http://example.com/api/' + i, function() {});
            }
            expect(xhrInstances.length).toBe(3);
            expect(TMDB._activeCount).toBe(3);
            expect(TMDB._pendingQueue.length).toBe(2);
        });

        it('should process queue when request completes', function() {
            for (var i = 0; i < 5; i++) {
                TMDB._fetch('http://example.com/api/' + i, function() {});
            }
            expect(xhrInstances.length).toBe(3);

            respondXHR(xhrInstances[0], { data: 'ok' });

            expect(xhrInstances.length).toBe(4);
            expect(TMDB._activeCount).toBe(3);
            expect(TMDB._pendingQueue.length).toBe(1);
        });
    });

    describe('Error handling', function() {
        it('should return null on HTTP error', function(done) {
            TMDB.getMovieDetails(99999, function(result) {
                expect(result).toBeNull();
                done();
            });

            respondXHR(xhrInstances[0], { status_message: 'Not Found' }, 404);
        });

        it('should return null on invalid JSON', function(done) {
            TMDB.getMovieDetails(27205, function(result) {
                expect(result).toBeNull();
                done();
            });

            xhrInstances[0].responseText = 'not json {{{';
            xhrInstances[0].status = 200;
            xhrInstances[0].readyState = 4;
            if (xhrInstances[0].onreadystatechange) xhrInstances[0].onreadystatechange();
        });

        it('should return null on timeout', function(done) {
            TMDB.getMovieDetails(27205, function(result) {
                expect(result).toBeNull();
                done();
            });

            if (xhrInstances[0].ontimeout) xhrInstances[0].ontimeout();
        });
    });

    describe('translate', function() {
        it('should construct correct URL for translation', function() {
            TMDB.translate('Hello world', 'fr', function() {});
            expect(xhrInstances[0].url).toContain('api.mymemory.translated.net');
            expect(xhrInstances[0].url).toContain('langpair=en|fr');
            expect(xhrInstances[0].url).toContain('q=' + encodeURIComponent('Hello world'));
        });

        it('should return translated text on success', function(done) {
            TMDB.translate('Hello', 'fr', function(result) {
                expect(result).toBe('Bonjour');
                done();
            });

            xhrInstances[0].responseText = JSON.stringify({
                responseStatus: 200,
                responseData: { translatedText: 'Bonjour' }
            });
            xhrInstances[0].status = 200;
            xhrInstances[0].readyState = 4;
            if (xhrInstances[0].onreadystatechange) xhrInstances[0].onreadystatechange();
        });

        it('should return original text when target is English', function(done) {
            TMDB.translate('Hello', 'en', function(result) {
                expect(result).toBe('Hello');
                expect(xhrInstances.length).toBe(0);
                done();
            });
        });

        it('should return original text on translation failure', function(done) {
            TMDB.translate('Hello', 'fr', function(result) {
                expect(result).toBe('Hello');
                done();
            });

            xhrInstances[0].responseText = JSON.stringify({ responseStatus: 403, responseData: null });
            xhrInstances[0].status = 200;
            xhrInstances[0].readyState = 4;
            if (xhrInstances[0].onreadystatechange) xhrInstances[0].onreadystatechange();
        });

        it('should return original text when text is empty', function(done) {
            TMDB.translate('', 'fr', function(result) {
                expect(result).toBe('');
                expect(xhrInstances.length).toBe(0);
                done();
            });
        });
    });

    describe('getGenres', function() {
        it('should return genre names', function() {
            var result = TMDB.getGenres({
                genres: [{ id: 28, name: 'Action' }, { id: 12, name: 'Adventure' }]
            });
            expect(result).toEqual(['Action', 'Adventure']);
        });

        it('should return empty array when no genres', function() {
            expect(TMDB.getGenres({})).toEqual([]);
            expect(TMDB.getGenres(null)).toEqual([]);
        });
    });

    describe('getCast', function() {
        it('should return up to 8 cast members with photo URLs', function() {
            var data = {
                credits: {
                    cast: [
                        { id: 1, name: 'Actor 1', character: 'Role 1', profile_path: '/abc.jpg' },
                        { id: 2, name: 'Actor 2', character: 'Role 2', profile_path: null }
                    ]
                }
            };
            var result = TMDB.getCast(data);
            expect(result.length).toBe(2);
            expect(result[0].photo).toBe('https://image.tmdb.org/t/p/w185/abc.jpg');
            expect(result[1].photo).toBeNull();
        });

        it('should limit to 8 cast members', function() {
            var cast = [];
            for (var i = 0; i < 15; i++) {
                cast.push({ id: i, name: 'Actor ' + i, character: 'Role ' + i, profile_path: null });
            }
            var result = TMDB.getCast({ credits: { cast: cast } });
            expect(result.length).toBe(8);
        });

        it('should return empty array when no cast data', function() {
            expect(TMDB.getCast(null)).toEqual([]);
            expect(TMDB.getCast({})).toEqual([]);
        });
    });

    describe('getDirector', function() {
        it('should find the director from crew', function() {
            var data = {
                credits: {
                    crew: [
                        { id: 1, name: 'Writer', job: 'Screenplay', profile_path: null },
                        { id: 2, name: 'Christopher Nolan', job: 'Director', profile_path: '/nolan.jpg' }
                    ]
                }
            };
            var result = TMDB.getDirector(data);
            expect(result.name).toBe('Christopher Nolan');
            expect(result.photo).toContain('/nolan.jpg');
        });

        it('should return null when no director', function() {
            expect(TMDB.getDirector({ credits: { crew: [] } })).toBeNull();
            expect(TMDB.getDirector(null)).toBeNull();
        });
    });

    describe('getCreator', function() {
        it('should return first creator', function() {
            var data = {
                created_by: [{ id: 1, name: 'Vince Gilligan', profile_path: '/vince.jpg' }]
            };
            var result = TMDB.getCreator(data);
            expect(result.name).toBe('Vince Gilligan');
        });

        it('should return null when no creators', function() {
            expect(TMDB.getCreator({})).toBeNull();
            expect(TMDB.getCreator({ created_by: [] })).toBeNull();
        });
    });

    describe('formatRuntime', function() {
        it('should format hours and minutes', function() {
            expect(TMDB.formatRuntime(148)).toBe('2h 28min');
        });

        it('should format minutes only', function() {
            expect(TMDB.formatRuntime(45)).toBe('45 min');
        });

        it('should return empty string for falsy input', function() {
            expect(TMDB.formatRuntime(0)).toBe('');
            expect(TMDB.formatRuntime(null)).toBe('');
        });
    });

    describe('findByImdbId', function() {
        it('should construct correct URL', function() {
            TMDB.findByImdbId('tt1375666', function() {});
            expect(xhrInstances[0].url).toContain('/find/tt1375666');
            expect(xhrInstances[0].url).toContain('external_source=imdb_id');
        });

        it('should route movie result to getMovieDetails', function(done) {
            TMDB.findByImdbId('tt1375666', function(result) {
                expect(result).not.toBeNull();
                expect(result.title).toBe('Inception');
                done();
            });

            respondXHR(xhrInstances[0], {
                movie_results: [{ id: 27205, title: 'Inception' }],
                tv_results: []
            });

            tick().then(function() {
                respondXHR(xhrInstances[1], {
                    id: 27205, title: 'Inception', overview: 'desc',
                    credits: { cast: [], crew: [] }, external_ids: {}
                });
            });
        });

        it('should return null when not enabled', function(done) {
            TMDB.setApiKey('');
            TMDB.findByImdbId('tt1375666', function(result) {
                expect(result).toBeNull();
                done();
            });
        });

        it('should return null when imdbId is empty', function(done) {
            TMDB.findByImdbId('', function(result) {
                expect(result).toBeNull();
                done();
            });
        });
    });

    describe('getImages', function() {
        it('should construct correct URL for movie', function() {
            TMDB.getImages(27205, 'movie', function() {});
            expect(xhrInstances[0].url).toContain('/movie/27205/images');
        });

        it('should construct correct URL for tv', function() {
            TMDB.getImages(1396, 'tv', function() {});
            expect(xhrInstances[0].url).toContain('/tv/1396/images');
        });

        it('should return backdrop URLs', function(done) {
            TMDB.getImages(27205, 'movie', function(result) {
                expect(result.length).toBe(2);
                expect(result[0]).toContain('w1280');
                expect(result[0]).toContain('/back1.jpg');
                done();
            });

            respondXHR(xhrInstances[0], {
                backdrops: [{ file_path: '/back1.jpg' }, { file_path: '/back2.jpg' }]
            });
        });

        it('should return null when no backdrops', function(done) {
            TMDB.getImages(27205, 'movie', function(result) {
                expect(result).toBeNull();
                done();
            });

            respondXHR(xhrInstances[0], { backdrops: [] });
        });
    });

    describe('_redactUrl', function() {
        it('should hide API key in URL', function() {
            var redacted = TMDB._redactUrl('https://api.themoviedb.org/3/movie/123?api_key=secret123&language=fr');
            expect(redacted).toContain('api_key=***');
            expect(redacted).not.toContain('secret123');
        });
    });
});
