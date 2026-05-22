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
        // setApiKey falls back to defaultApiKey (the bundled v3 key) when the user
        // passes empty/null. To test the "disabled" path we have to also clear the
        // bundled fallback. In production this fallback ensures TMDB works
        // out-of-the-box without any user setup.
        var savedDefault;
        beforeEach(function() { savedDefault = TMDB.defaultApiKey; });
        afterEach(function()  { TMDB.defaultApiKey = savedDefault; });

        it('should be enabled when API key is set', function() {
            TMDB.setApiKey('abc123');
            expect(TMDB.isEnabled()).toBe(true);
        });

        it('should be disabled when API key is empty AND no default fallback', function() {
            TMDB.defaultApiKey = '';
            TMDB.setApiKey('');
            expect(TMDB.isEnabled()).toBe(false);
        });

        it('should be disabled when API key is null AND no default fallback', function() {
            TMDB.defaultApiKey = '';
            TMDB.setApiKey(null);
            expect(TMDB.isEnabled()).toBe(false);
        });

        it('should still be enabled when key is empty if defaultApiKey is set (production safety net)', function() {
            TMDB.defaultApiKey = 'b796d544bb4de0b1a89ffdfb01304b94';
            TMDB.setApiKey('');
            expect(TMDB.isEnabled()).toBe(true);
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
            // Both the explicit and default keys must be empty for isEnabled() to return false
            // (production keeps a default fallback so TMDB works without user setup).
            var savedDefault = TMDB.defaultApiKey;
            TMDB.defaultApiKey = '';
            TMDB.setApiKey('');
            TMDB.searchMovie('Inception', 2010, function(result) {
                expect(result).toBeNull();
                expect(xhrInstances.length).toBe(0);
                TMDB.defaultApiKey = savedDefault;
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

        // js/tmdb.js:527 reassigns TMDB.searchMulti to a simpler implementation that
        // returns the filtered movie/tv results directly as an array (no automatic
        // routing to getMovieDetails/getTVDetails). The original prototype-style
        // searchMulti at line 135 is shadowed at runtime, so the tests reflect the
        // active behavior.
        it('should pass through movie result in the filtered array', function(done) {
            TMDB.searchMulti('Inception', function(results) {
                expect(Array.isArray(results)).toBe(true);
                expect(results.length).toBe(1);
                expect(results[0].title).toBe('Inception');
                expect(results[0].media_type).toBe('movie');
                done();
            });

            respondXHR(xhrInstances[0], {
                results: [{ id: 27205, title: 'Inception', media_type: 'movie', release_date: '2010-07-16' }]
            });
        });

        it('should pass through tv result in the filtered array', function(done) {
            TMDB.searchMulti('Breaking Bad', function(results) {
                expect(Array.isArray(results)).toBe(true);
                expect(results.length).toBe(1);
                expect(results[0].name).toBe('Breaking Bad');
                expect(results[0].media_type).toBe('tv');
                done();
            });

            respondXHR(xhrInstances[0], {
                results: [{ id: 1396, name: 'Breaking Bad', media_type: 'tv', first_air_date: '2008-01-20' }]
            });
        });

        it('should filter out person and other non-movie/tv media types', function(done) {
            TMDB.searchMulti('Test', function(results) {
                expect(Array.isArray(results)).toBe(true);
                expect(results.length).toBe(0);
                done();
            });

            respondXHR(xhrInstances[0], {
                results: [
                    { id: 1, name: 'Test',  media_type: 'person' },
                    { id: 2, name: 'Other', media_type: 'collection' }
                ]
            });
        });

        it('should return an empty array when the API returns no results', function(done) {
            // The new searchMulti has no shorter-title retry — it simply forwards the
            // (filtered) results array to the caller. Empty in → empty out.
            TMDB.searchMulti('Inception (2010) - Extended Cut', function(result) {
                expect(Array.isArray(result)).toBe(true);
                expect(result.length).toBe(0);
                done();
            });
            respondXHR(xhrInstances[0], { results: [] });
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
            var savedDefault = TMDB.defaultApiKey;
            TMDB.defaultApiKey = '';
            TMDB.setApiKey('');
            TMDB.getSeasonDetails(1396, 1, function(result) {
                expect(result).toBeNull();
                expect(xhrInstances.length).toBe(0);
                TMDB.defaultApiKey = savedDefault;
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
        // getCast intentionally returns the FULL cast list. Trimming (e.g. to 8 actors
        // for the details page header strip) is the renderer's responsibility, not the
        // API client's — actor browsing/search needs the full list.
        it('should map all cast members with their photo URLs', function() {
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

        it('should return ALL cast members (no slice — UI layer is responsible for trimming)', function() {
            var cast = [];
            for (var i = 0; i < 15; i++) {
                cast.push({ id: i, name: 'Actor ' + i, character: 'Role ' + i, profile_path: null });
            }
            var result = TMDB.getCast({ credits: { cast: cast } });
            expect(result.length).toBe(15);
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
            var savedDefault = TMDB.defaultApiKey;
            TMDB.defaultApiKey = '';
            TMDB.setApiKey('');
            TMDB.findByImdbId('tt1375666', function(result) {
                expect(result).toBeNull();
                TMDB.defaultApiKey = savedDefault;
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

    describe('discover', function() {
        it('should construct movie discover URL with genre, sort and page', function() {
            TMDB.discover('movie', 28, 1, function() {});
            var url = xhrInstances[0].url;
            expect(url).toContain('/discover/movie');
            expect(url).toContain('api_key=test-api-key');
            expect(url).toContain('language=fr-FR');
            expect(url).toContain('sort_by=popularity.desc');
            expect(url).toContain('with_genres=28');
            expect(url).toContain('page=1');
            expect(url).toContain('include_adult=false');
        });

        it('should construct tv discover URL when type is tv', function() {
            TMDB.discover('tv', 10759, 2, function() {});
            var url = xhrInstances[0].url;
            expect(url).toContain('/discover/tv');
            expect(url).toContain('with_genres=10759');
            expect(url).toContain('page=2');
        });

        it('should treat type=series as tv', function() {
            TMDB.discover('series', 18, 1, function() {});
            expect(xhrInstances[0].url).toContain('/discover/tv');
        });

        it('should default to page=1 when page is omitted', function() {
            TMDB.discover('movie', 28, undefined, function() {});
            expect(xhrInstances[0].url).toContain('page=1');
        });

        it('should pass through results to callback', function(done) {
            TMDB.discover('movie', 28, 1, function(data) {
                expect(data).not.toBeNull();
                expect(data.results.length).toBe(2);
                expect(data.results[0].id).toBe(27205);
                done();
            });
            respondXHR(xhrInstances[0], {
                page: 1,
                total_pages: 5,
                results: [
                    { id: 27205, title: 'Inception', release_date: '2010-07-16' },
                    { id: 24428, title: 'The Avengers', release_date: '2012-04-25' }
                ]
            });
        });

        it('should call back with null when API key is missing', function(done) {
            TMDB.defaultApiKey = '';
            TMDB.setApiKey('');
            TMDB.discover('movie', 28, 1, function(data) {
                expect(data).toBeNull();
                done();
            });
            expect(xhrInstances.length).toBe(0);
        });

        it('should call back with null when genreId is falsy (no XHR fired)', function(done) {
            TMDB.discover('movie', null, 1, function(data) {
                expect(data).toBeNull();
                done();
            });
            expect(xhrInstances.length).toBe(0);
        });

        it('should accept custom sortBy via options', function() {
            TMDB.discover('movie', 28, 1, function() {}, { sortBy: 'vote_average.desc' });
            var url = xhrInstances[0].url;
            expect(url).toContain('sort_by=vote_average.desc');
        });

        it('should append vote_count.gte when voteCountMin is set', function() {
            TMDB.discover('movie', 28, 1, function() {}, { sortBy: 'vote_average.desc', voteCountMin: 200 });
            var url = xhrInstances[0].url;
            expect(url).toContain('vote_count.gte=200');
        });

        it('should NOT append vote_count.gte when voteCountMin is omitted', function() {
            TMDB.discover('movie', 28, 1, function() {}, { sortBy: 'primary_release_date.desc' });
            var url = xhrInstances[0].url;
            expect(url).not.toContain('vote_count.gte');
        });

        it('should default to popularity.desc when options are not provided', function() {
            TMDB.discover('movie', 28, 1, function() {});
            expect(xhrInstances[0].url).toContain('sort_by=popularity.desc');
        });

        it('should append a date upper bound when dateLte option is provided', function() {
            TMDB.discover('movie', 28, 1, function() {}, {
                sortBy: 'primary_release_date.desc',
                dateLte: { field: 'primary_release_date', value: '2026-05-05' }
            });
            var url = xhrInstances[0].url;
            expect(url).toContain('primary_release_date.lte=2026-05-05');
        });

        it('should NOT append the date filter when dateLte is missing fields', function() {
            TMDB.discover('movie', 28, 1, function() {}, { dateLte: {} });
            expect(xhrInstances[0].url).not.toContain('.lte=');
        });

        it('should combine with_keywords=short-film and with_runtime bounds when genreId is "short"', function() {
            TMDB.discover('movie', 'short', 1, function() {});
            var url = xhrInstances[0].url;
            expect(url).not.toContain('with_genres=');
            expect(url).toContain('with_keywords=' + TMDB.SHORT_FILM_KEYWORD_ID);
            expect(url).toContain('with_runtime.gte=1');
            expect(url).toContain('with_runtime.lte=' + TMDB.SHORT_FILM_MAX_RUNTIME);
        });

        it('should honor options.shortFilmMin/MaxRuntime when overriding defaults', function() {
            TMDB.discover('movie', 'short', 1, function() {}, { shortFilmMinRuntime: 5, shortFilmMaxRuntime: 10 });
            var url = xhrInstances[0].url;
            expect(url).toContain('with_runtime.gte=5');
            expect(url).toContain('with_runtime.lte=10');
        });
    });

    describe('findFeatureCollision', function() {
        beforeEach(function() {
            TMDB._featureCollisionCache = {};
        });

        it('returns the feature when another TMDB record has the same title+year (regression: Planes 2 2014 short id=316541 vs feature id=218836)', function(done) {
            TMDB.findFeatureCollision('Planes 2', 2014, 316541, function(found) {
                expect(found).not.toBeNull();
                expect(found.id).toBe(218836);
                done();
            });
            var url = xhrInstances[0].url;
            expect(url).toContain('/search/movie');
            expect(url).toContain('query=Planes%202');
            expect(url).toContain('year=2014');
            respondXHR(xhrInstances[0], {
                results: [
                    { id: 218836, title: 'Planes 2', release_date: '2014-07-17', vote_count: 921 },
                    { id: 316541, title: 'Planes 2', release_date: '2014-11-04', vote_count: 3 }
                ]
            });
        });

        it('returns null when only the short itself appears (no collision)', function(done) {
            TMDB.findFeatureCollision('Martin poids lourd', 2010, 148605, function(found) {
                expect(found).toBeNull();
                done();
            });
            respondXHR(xhrInstances[0], {
                results: [
                    { id: 148605, title: 'Martin poids lourd', release_date: '2010-07-30', vote_count: 115 }
                ]
            });
        });

        it('ignores results with different year (year filter is exact)', function(done) {
            TMDB.findFeatureCollision('Saw', 2003, 246355, function(found) {
                expect(found).toBeNull();
                done();
            });
            respondXHR(xhrInstances[0], {
                results: [
                    { id: 246355, title: 'Saw', release_date: '2003-10-16', vote_count: 672 },
                    { id: 176, title: 'Saw', release_date: '2004-10-01', vote_count: 10040 }
                ]
            });
        });

        it('ignores results with different normalized title', function(done) {
            TMDB.findFeatureCollision('Underwater', 2020, 999, function(found) {
                expect(found).toBeNull();
                done();
            });
            respondXHR(xhrInstances[0], {
                results: [
                    { id: 443791, title: 'Something Else', release_date: '2020-01-08', vote_count: 5000 }
                ]
            });
        });

        it('serves from cache on second call (no second XHR)', function(done) {
            TMDB.findFeatureCollision('X', 2022, 1, function(first) {
                var n = xhrInstances.length;
                TMDB.findFeatureCollision('X', 2022, 1, function(second) {
                    expect(second).toEqual(first);
                    expect(xhrInstances.length).toBe(n);
                    done();
                });
            });
            respondXHR(xhrInstances[0], { results: [] });
        });

        it('returns null when API is disabled', function(done) {
            TMDB.defaultApiKey = '';
            TMDB.setApiKey('');
            TMDB.findFeatureCollision('Anything', 2024, 123, function(found) {
                expect(found).toBeNull();
                expect(xhrInstances.length).toBe(0);
                done();
            });
        });
    });

    describe('getGenresList', function() {
        beforeEach(function() {
            TMDB._genresCache = {};
        });

        it('should fetch movie genres list (prepended with virtual short-film entry)', function(done) {
            TMDB.getGenresList('movie', function(genres) {
                expect(genres.length).toBe(3);
                expect(genres[0].id).toBe('short');
                expect(genres[0].virtual).toBe(true);
                expect(genres[1].name).toBe('Action');
                done();
            });
            var url = xhrInstances[0].url;
            expect(url).toContain('/genre/movie/list');
            expect(url).toContain('language=fr-FR');
            respondXHR(xhrInstances[0], {
                genres: [
                    { id: 28, name: 'Action' },
                    { id: 35, name: 'Comédie' }
                ]
            });
        });

        it('should not prepend virtual short entry for tv genres', function(done) {
            TMDB.getGenresList('tv', function(genres) {
                expect(genres.length).toBe(1);
                expect(genres[0].name).toBe('Drama');
                done();
            });
            respondXHR(xhrInstances[0], { genres: [{ id: 18, name: 'Drama' }] });
        });

        it('should fetch tv genres list when type is tv or series', function() {
            TMDB.getGenresList('tv', function() {});
            expect(xhrInstances[0].url).toContain('/genre/tv/list');
            xhrInstances.length = 0;
            TMDB._genresCache = {};
            TMDB.getGenresList('series', function() {});
            expect(xhrInstances[0].url).toContain('/genre/tv/list');
        });

        it('should serve from cache on second call (no XHR)', function(done) {
            TMDB.getGenresList('movie', function(genres1) {
                expect(genres1.length).toBe(2);
                var xhrCountAfterFirst = xhrInstances.length;
                TMDB.getGenresList('movie', function(genres2) {
                    expect(genres2.length).toBe(2);
                    expect(xhrInstances.length).toBe(xhrCountAfterFirst);
                    done();
                });
            });
            respondXHR(xhrInstances[0], { genres: [{ id: 28, name: 'Action' }] });
        });

        it('should keep separate cache entries per locale', function(done) {
            TMDB.language = 'fr-FR';
            TMDB.getGenresList('movie', function() {
                TMDB.language = 'en-US';
                TMDB.getGenresList('movie', function() {
                    expect(xhrInstances.length).toBe(2);
                    expect(xhrInstances[0].url).toContain('language=fr-FR');
                    expect(xhrInstances[1].url).toContain('language=en-US');
                    done();
                });
                respondXHR(xhrInstances[1], { genres: [{ id: 28, name: 'Action' }] });
            });
            respondXHR(xhrInstances[0], { genres: [{ id: 28, name: 'Action' }] });
        });

        it('should return [] when API is disabled and not fire XHR', function(done) {
            TMDB.defaultApiKey = '';
            TMDB.setApiKey('');
            TMDB.getGenresList('movie', function(genres) {
                expect(genres).toEqual([]);
                expect(xhrInstances.length).toBe(0);
                done();
            });
        });
    });
});
