/**
 * Tests for the TMDB-discover genre filter helpers in js/browse.js.
 *
 * The helpers are duplicated inline below to keep this test self-contained
 * (loading the full js/browse.js drags in IPTVApp/Storage/Regex globals that
 * aren't worth wiring up for pure-function unit tests). If you change a helper
 * in js/browse.js, update the inline copy too — the tests will catch any
 * behavioral drift between the two.
 */

window.log = jest.fn();

function IPTVApp() {}

IPTVApp.prototype._getTMDBTypeForSection = function(section) {
    if (section === 'vod') return 'movie';
    if (section === 'series') return 'tv';
    return null;
};

IPTVApp.prototype._normalizeTitleForGenre = function(s) {
    if (!s) return '';
    return s.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

IPTVApp.prototype._extractStreamYear = function(s) {
    if (!s) return null;
    if (s.year) {
        var ny = parseInt(s.year, 10);
        if (ny) return ny;
    }
    var rd = s.releaseDate || s.release_date;
    if (rd) {
        var ry = parseInt(String(rd).substring(0, 4), 10);
        if (ry) return ry;
    }
    var name = s.name || '';
    var m = name.match(/\((\d{4})\)/);
    if (m) return parseInt(m[1], 10);
    return null;
};

IPTVApp.prototype._buildTitleYearIndex = function(streams) {
    var byTitleYear = {};
    var byTitleOnly = {};
    for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        var rawTitle = (typeof this.getStreamTitle === 'function') ? this.getStreamTitle(s) : (s.name || '');
        var cleaned = (typeof this.cleanTitle === 'function') ? this.cleanTitle(rawTitle) : rawTitle;
        var t = this._normalizeTitleForGenre(cleaned || rawTitle);
        if (!t) continue;
        var y = this._extractStreamYear(s);
        if (!y) {
            var ym = String(rawTitle).match(/\((\d{4})\)/);
            if (ym) y = parseInt(ym[1], 10);
        }
        if (y) {
            var keyTY = t + '|' + y;
            if (!byTitleYear[keyTY]) byTitleYear[keyTY] = [];
            byTitleYear[keyTY].push(s);
        }
        if (!byTitleOnly[t]) byTitleOnly[t] = [];
        byTitleOnly[t].push(s);
    }
    return { byTitleYear: byTitleYear, byTitleOnly: byTitleOnly };
};

IPTVApp.prototype._matchTMDBToStream = function(tmdbResult, isMovie, index, opts) {
    if (!tmdbResult || !index) return null;
    var requireYear = !!(opts && opts.requireYear);
    var titles = [];
    if (isMovie) {
        if (tmdbResult.title) titles.push(tmdbResult.title);
        if (tmdbResult.original_title && tmdbResult.original_title !== tmdbResult.title) {
            titles.push(tmdbResult.original_title);
        }
    } else {
        if (tmdbResult.name) titles.push(tmdbResult.name);
        if (tmdbResult.original_name && tmdbResult.original_name !== tmdbResult.name) {
            titles.push(tmdbResult.original_name);
        }
    }
    var dateField = isMovie ? tmdbResult.release_date : tmdbResult.first_air_date;
    var year = dateField ? parseInt(String(dateField).substring(0, 4), 10) : null;
    for (var i = 0; i < titles.length; i++) {
        var orig = titles[i] || '';
        var t = this._normalizeTitleForGenre(orig);
        if (!t) continue;
        if (orig.length >= 4 && t.length * 2 < orig.length) continue;
        if (year) {
            var hit = index.byTitleYear[t + '|' + year];
            if (hit && hit.length) return hit[0];
            if (requireYear) continue;
            hit = index.byTitleYear[t + '|' + (year - 1)] || index.byTitleYear[t + '|' + (year + 1)];
            if (hit && hit.length) return hit[0];
        }
        if (requireYear) continue;
        var titleHit = index.byTitleOnly[t];
        if (titleHit && titleHit.length) return titleHit[0];
    }
    return null;
};

IPTVApp.prototype.clearGenreFilter = function(skipRender) {
    if (!this.genreFilter) return;
    window.log('ACTION', 'clearGenreFilter');
    this.genreFilter = null;
    this._genreFilteredStreams = null;
    this._genreNextPage = 1;
    this._genreTotalPages = null;
    this._genreReachedEnd = false;
    this._genreFetchInProgress = false;
    this._genreSeenStreamIds = null;
    this._genreMatchIndex = null;
    this._genreRequestId = (this._genreRequestId || 0) + 1;
    this._updateGenreButton();
    this._updateSortButtons();
    if (!skipRender) {
        this.applyFilters();
    }
};

IPTVApp.prototype._appendGenreMatches = function(newStreams) {
    if (!newStreams || !newStreams.length) return;
    this._genreFilteredStreams = (this._genreFilteredStreams || []).concat(newStreams);
    this.currentStreams = (this.currentStreams || []).concat(newStreams);
    this._streamLookup = null;
    this.updateGridSpacer();
    this.invalidateFocusables();
    this.loadMoreItems();
};

IPTVApp.prototype._GENRE_RATING_VOTE_MIN = 200;
IPTVApp.prototype._GENRE_DATE_VOTE_MIN = 10;

IPTVApp.prototype._getGenrePickerSort = function() {
    var s = this.settings && this.settings.genrePickerSort;
    if (s && s.group) return { group: s.group, asc: !!s.asc };
    return { group: 'popularity', asc: false };
};

IPTVApp.prototype._todayIso = function() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
};

IPTVApp.prototype._getShortRuntime = function() {
    var v = this.settings && this.settings.shortFilmMaxRuntime;
    return (typeof v === 'number' && v > 0) ? v : 40;
};

IPTVApp.prototype._getShortMin = function() {
    var v = this.settings && this.settings.shortFilmMinRuntime;
    return (typeof v === 'number' && v > 0) ? v : 1;
};

IPTVApp.prototype._buildDiscoverOptions = function(type, sort) {
    var dir = sort.asc ? 'asc' : 'desc';
    var opts = {};
    if (sort.group === 'rating') {
        opts.sortBy = 'vote_average.' + dir;
        opts.voteCountMin = this._GENRE_RATING_VOTE_MIN;
    } else if (sort.group === 'date') {
        var isTv = (type === 'tv' || type === 'series');
        var dateField = isTv ? 'first_air_date' : 'primary_release_date';
        opts.sortBy = dateField + '.' + dir;
        opts.dateLte = { field: dateField, value: this._todayIso() };
        opts.voteCountMin = this._GENRE_DATE_VOTE_MIN;
    } else {
        opts.sortBy = 'popularity.' + dir;
    }
    if (this.genreFilter && this.genreFilter.id === 'short') {
        opts.shortFilmMinRuntime = this._getShortMin();
        opts.shortFilmMaxRuntime = this._getShortRuntime();
    }
    return opts;
};

IPTVApp.prototype.applyGenrePickerSort = function(group) {
    var current = this._getGenrePickerSort();
    var newSort;
    if (current.group === group) {
        newSort = { group: group, asc: !current.asc };
    } else {
        newSort = { group: group, asc: false };
    }
    if (typeof this.settings !== 'object') this.settings = {};
    this.settings.genrePickerSort = newSort;
    if (typeof this.saveSettings === 'function') this.saveSettings();
    if (typeof this._updateGenrePickerSortButtons === 'function') this._updateGenrePickerSortButtons();
    if (this.genreFilter) {
        this.applyGenreFilter(this.genreFilter.id, this.genreFilter.name);
    }
};

describe('Genre filter helpers', function() {
    var app;
    beforeEach(function() {
        app = new IPTVApp();
        app.getStreamTitle = function(s) { return s.name || ''; };
        app.applyFilters = jest.fn();
        app._updateGenreButton = jest.fn();
        app._updateSortButtons = jest.fn();
    });

    describe('_getTMDBTypeForSection', function() {
        it('maps vod to movie', function() {
            expect(app._getTMDBTypeForSection('vod')).toBe('movie');
        });
        it('maps series to tv', function() {
            expect(app._getTMDBTypeForSection('series')).toBe('tv');
        });
        it('returns null for unsupported sections', function() {
            expect(app._getTMDBTypeForSection('live')).toBeNull();
            expect(app._getTMDBTypeForSection('manga')).toBeNull();
            expect(app._getTMDBTypeForSection('sport')).toBeNull();
            expect(app._getTMDBTypeForSection('entertainment')).toBeNull();
            expect(app._getTMDBTypeForSection('history')).toBeNull();
            expect(app._getTMDBTypeForSection(undefined)).toBeNull();
        });
    });

    describe('_normalizeTitleForGenre', function() {
        it('lowercases and strips diacritics', function() {
            expect(app._normalizeTitleForGenre('Amélie')).toBe('amelie');
            expect(app._normalizeTitleForGenre('Comédie')).toBe('comedie');
        });
        it('strips punctuation and collapses whitespace', function() {
            expect(app._normalizeTitleForGenre('Mr. & Mrs.   Smith!')).toBe('mr mrs smith');
        });
        it('strips parenthesized year suffix', function() {
            expect(app._normalizeTitleForGenre('Inception (2010)')).toBe('inception');
        });
        it('returns empty for falsy input', function() {
            expect(app._normalizeTitleForGenre('')).toBe('');
            expect(app._normalizeTitleForGenre(null)).toBe('');
            expect(app._normalizeTitleForGenre(undefined)).toBe('');
        });
        it('treats numbers as part of the title', function() {
            expect(app._normalizeTitleForGenre('Blade Runner 2049')).toBe('blade runner 2049');
        });
    });

    describe('_extractStreamYear', function() {
        it('reads s.year when available (number)', function() {
            expect(app._extractStreamYear({ year: 2010 })).toBe(2010);
        });
        it('reads s.year when available (string)', function() {
            expect(app._extractStreamYear({ year: '1995' })).toBe(1995);
        });
        it('parses s.releaseDate', function() {
            expect(app._extractStreamYear({ releaseDate: '2010-07-16' })).toBe(2010);
        });
        it('parses s.release_date (snake_case)', function() {
            expect(app._extractStreamYear({ release_date: '1999-03-31' })).toBe(1999);
        });
        it('falls back to year extracted from name parens', function() {
            expect(app._extractStreamYear({ name: 'The Matrix (1999)' })).toBe(1999);
        });
        it('returns null when no year information exists', function() {
            expect(app._extractStreamYear({ name: 'Untitled' })).toBeNull();
            expect(app._extractStreamYear({})).toBeNull();
            expect(app._extractStreamYear(null)).toBeNull();
        });
    });

    describe('_buildTitleYearIndex', function() {
        it('indexes by both (title|year) and title-only', function() {
            var streams = [
                { stream_id: 1, name: 'Inception (2010)' },
                { stream_id: 2, name: 'The Matrix', year: 1999 }
            ];
            var idx = app._buildTitleYearIndex(streams);
            expect(idx.byTitleYear['inception|2010']).toBeDefined();
            expect(idx.byTitleYear['inception|2010'][0].stream_id).toBe(1);
            expect(idx.byTitleYear['the matrix|1999']).toBeDefined();
            expect(idx.byTitleOnly['inception']).toBeDefined();
            expect(idx.byTitleOnly['the matrix']).toBeDefined();
        });
        it('skips streams without a normalizable title', function() {
            var idx = app._buildTitleYearIndex([{ stream_id: 1, name: '' }]);
            expect(Object.keys(idx.byTitleYear).length).toBe(0);
            expect(Object.keys(idx.byTitleOnly).length).toBe(0);
        });
        it('groups multiple streams with identical normalized title', function() {
            var streams = [
                { stream_id: 1, name: 'Inception (2010)' },
                { stream_id: 2, name: 'Inception' }
            ];
            var idx = app._buildTitleYearIndex(streams);
            expect(idx.byTitleOnly['inception'].length).toBe(2);
        });

        it('uses cleanTitle to strip provider category prefixes (regression: "CA| Hypnotic" not matching TMDB)', function() {
            // Reproduces the production bug from 2026-05-05: provider names like
            // "CA| Hypnotic (2023)" would normalize to "ca hypnotic" and never
            // match TMDB's "Hypnotic". cleanTitle strips the prefix before
            // normalization so the index key is "hypnotic", matching TMDB.
            var withClean = new IPTVApp();
            withClean.getStreamTitle = function(s) { return s.name || ''; };
            withClean.cleanTitle = function(title) {
                // Minimal stub mirroring production cleanTitle: strip XX| prefix
                // and trailing (YYYY).
                return String(title)
                    .replace(/^[A-Z0-9]{1,4}\|\s*/, '')
                    .replace(/\s*\((?:19|20)\d{2}\)\s*$/, '')
                    .trim();
            };
            var idx = withClean._buildTitleYearIndex([
                { stream_id: 1, name: 'CA| Hypnotic (2023)' }
            ]);
            expect(idx.byTitleYear['hypnotic|2023']).toBeDefined();
            expect(idx.byTitleYear['hypnotic|2023'][0].stream_id).toBe(1);
            expect(idx.byTitleOnly['hypnotic']).toBeDefined();
        });

        it('extracts year from raw title even when cleanTitle stripped it', function() {
            var withClean = new IPTVApp();
            withClean.getStreamTitle = function(s) { return s.name || ''; };
            withClean.cleanTitle = function(title) {
                return String(title).replace(/\s*\((?:19|20)\d{2}\)\s*$/, '').trim();
            };
            var idx = withClean._buildTitleYearIndex([
                { stream_id: 1, name: 'Inception (2010)' }
            ]);
            // Title-year key uses the year from the raw title even though
            // cleanTitle removed it.
            expect(idx.byTitleYear['inception|2010']).toBeDefined();
        });
    });

    describe('_matchTMDBToStream', function() {
        var index;
        beforeEach(function() {
            index = app._buildTitleYearIndex([
                { stream_id: 1, name: 'Inception (2010)' },
                { stream_id: 2, name: 'Le Parrain', year: 1972 },
                { stream_id: 3, name: 'Untitled Project' }
            ]);
        });
        it('matches movie by exact title+year', function() {
            var hit = app._matchTMDBToStream(
                { title: 'Inception', release_date: '2010-07-16' },
                true,
                index
            );
            expect(hit && hit.stream_id).toBe(1);
        });
        it('matches movie by ±1 year tolerance', function() {
            var hit = app._matchTMDBToStream(
                { title: 'Inception', release_date: '2011-01-01' },
                true,
                index
            );
            expect(hit && hit.stream_id).toBe(1);
        });
        it('falls back to title-only when year does not match', function() {
            var hit = app._matchTMDBToStream(
                { title: 'Inception', release_date: '2030-01-01' },
                true,
                index
            );
            expect(hit && hit.stream_id).toBe(1);
        });
        it('matches via original_title when localized title differs', function() {
            var hit = app._matchTMDBToStream(
                { title: 'The Godfather', original_title: 'Le Parrain', release_date: '1972-03-15' },
                true,
                index
            );
            expect(hit && hit.stream_id).toBe(2);
        });
        it('returns null when no title matches', function() {
            var hit = app._matchTMDBToStream(
                { title: 'Some Unknown Movie', release_date: '2020-01-01' },
                true,
                index
            );
            expect(hit).toBeNull();
        });
        it('uses tv fields (name / first_air_date) when isMovie is false', function() {
            var tvIndex = app._buildTitleYearIndex([{ series_id: 99, name: 'Breaking Bad', year: 2008 }]);
            var hit = app._matchTMDBToStream(
                { name: 'Breaking Bad', first_air_date: '2008-01-20' },
                false,
                tvIndex
            );
            expect(hit && hit.series_id).toBe(99);
        });
        it('returns null on falsy inputs', function() {
            expect(app._matchTMDBToStream(null, true, index)).toBeNull();
            expect(app._matchTMDBToStream({}, true, null)).toBeNull();
        });
        it('opts.requireYear: skips title-only fallback (regression: short-film "Underwater 2016" matched user catalog "Underwater 2020" 95min)', function() {
            // No title-only fallback when year diverges by more than 1.
            var hit = app._matchTMDBToStream(
                { title: 'Inception', release_date: '2030-01-01' },
                true,
                index,
                { requireYear: true }
            );
            expect(hit).toBeNull();
        });
        it('opts.requireYear: matches only on EXACT year, no ±1 tolerance (regression: Saw 2003 short matched Saw 2004 feature with ±1)', function() {
            // Exact year matches
            var hit = app._matchTMDBToStream(
                { title: 'Inception', release_date: '2010-01-01' },
                true,
                index,
                { requireYear: true }
            );
            expect(hit && hit.stream_id).toBe(1);
            // ±1 year does NOT match when requireYear is true
            var miss = app._matchTMDBToStream(
                { title: 'Inception', release_date: '2011-01-01' },
                true,
                index,
                { requireYear: true }
            );
            expect(miss).toBeNull();
        });
        it('skips foreign-script title that collapsed to ASCII fragment (regression: Japanese "ネット版　仮面ライダー…X…" → "x" matched user catalog "X 2022")', function() {
            // User catalog: Ti West's "X" 2022 (105min feature)
            var idx = app._buildTitleYearIndex([{ stream_id: 42, name: 'X (2022)', year: 2022 }]);
            // TMDB short: Japanese Kamen Rider, original_title contains 'X' but rest is non-ASCII
            var hit = app._matchTMDBToStream(
                {
                    title: 'Kamen Rider OOO: The Birth of Birth X Prologue',
                    original_title: 'ネット版　仮面ライダーオーズ　バースX誕生・序章',
                    release_date: '2022-03-13'
                },
                true,
                idx,
                { requireYear: true }
            );
            expect(hit).toBeNull();
        });
        it('keeps legitimate short titles like "Up" or "X" when the original is itself short (no stripping)', function() {
            var idx = app._buildTitleYearIndex([{ stream_id: 7, name: 'X (2022)', year: 2022 }]);
            var hit = app._matchTMDBToStream(
                { title: 'X', release_date: '2022-01-01' },
                true,
                idx,
                { requireYear: true }
            );
            expect(hit && hit.stream_id).toBe(7);
        });
    });

    describe('clearGenreFilter', function() {
        it('is a no-op when no filter is active', function() {
            app.clearGenreFilter();
            expect(app.applyFilters).not.toHaveBeenCalled();
            expect(app._updateGenreButton).not.toHaveBeenCalled();
        });
        it('clears state and re-runs applyFilters', function() {
            app.genreFilter = { id: 28, name: 'Action', type: 'movie' };
            app._genreFilteredStreams = [{ stream_id: 1 }];
            app.clearGenreFilter();
            expect(app.genreFilter).toBeNull();
            expect(app._genreFilteredStreams).toBeNull();
            expect(app._updateGenreButton).toHaveBeenCalledTimes(1);
            expect(app._updateSortButtons).toHaveBeenCalledTimes(1);
            expect(app.applyFilters).toHaveBeenCalledTimes(1);
        });
        it('skipRender=true skips applyFilters but still updates UI', function() {
            app.genreFilter = { id: 28, name: 'Action', type: 'movie' };
            app.clearGenreFilter(true);
            expect(app.genreFilter).toBeNull();
            expect(app.applyFilters).not.toHaveBeenCalled();
            expect(app._updateGenreButton).toHaveBeenCalledTimes(1);
            expect(app._updateSortButtons).toHaveBeenCalledTimes(1);
        });
        it('bumps _genreRequestId so an in-flight discover response is dropped', function() {
            app.genreFilter = { id: 28, name: 'Action', type: 'movie' };
            app._genreRequestId = 7;
            app.clearGenreFilter();
            expect(app._genreRequestId).toBe(8);
        });
        it('resets pagination state (regression: stale _genreReachedEnd would block next genre)', function() {
            app.genreFilter = { id: 28, name: 'Action', type: 'movie' };
            app._genreNextPage = 7;
            app._genreTotalPages = 50;
            app._genreReachedEnd = true;
            app._genreFetchInProgress = true;
            app._genreSeenStreamIds = { '123': true };
            app._genreMatchIndex = { byTitleYear: {}, byTitleOnly: {} };
            app.clearGenreFilter();
            expect(app._genreNextPage).toBe(1);
            expect(app._genreTotalPages).toBeNull();
            expect(app._genreReachedEnd).toBe(false);
            expect(app._genreFetchInProgress).toBe(false);
            expect(app._genreSeenStreamIds).toBeNull();
            expect(app._genreMatchIndex).toBeNull();
        });
    });

    describe('_buildDiscoverOptions', function() {
        it('defaults to popularity.desc when sort is empty', function() {
            var opts = app._buildDiscoverOptions('movie', { group: 'popularity', asc: false });
            expect(opts.sortBy).toBe('popularity.desc');
            expect(opts.voteCountMin).toBeUndefined();
        });
        it('uses popularity.asc when ascending', function() {
            var opts = app._buildDiscoverOptions('movie', { group: 'popularity', asc: true });
            expect(opts.sortBy).toBe('popularity.asc');
        });
        it('uses vote_average + voteCountMin for rating sort (avoids obscure 10/10)', function() {
            var opts = app._buildDiscoverOptions('movie', { group: 'rating', asc: false });
            expect(opts.sortBy).toBe('vote_average.desc');
            expect(opts.voteCountMin).toBe(200);
        });
        it('rating asc still applies voteCountMin', function() {
            var opts = app._buildDiscoverOptions('movie', { group: 'rating', asc: true });
            expect(opts.sortBy).toBe('vote_average.asc');
            expect(opts.voteCountMin).toBe(200);
        });
        it('uses primary_release_date for movie date sort + future-date and vote_count filters', function() {
            var opts = app._buildDiscoverOptions('movie', { group: 'date', asc: false });
            expect(opts.sortBy).toBe('primary_release_date.desc');
            // Date sort applies a light vote_count floor so we don't drown the user in
            // unreleased festival films that are absent from any IPTV catalog.
            expect(opts.voteCountMin).toBe(10);
            expect(opts.dateLte).toBeDefined();
            expect(opts.dateLte.field).toBe('primary_release_date');
            // Today's ISO date — exact match would be flaky, so just check the format.
            expect(opts.dateLte.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
        it('uses first_air_date for tv date sort', function() {
            var opts = app._buildDiscoverOptions('tv', { group: 'date', asc: false });
            expect(opts.sortBy).toBe('first_air_date.desc');
            expect(opts.dateLte.field).toBe('first_air_date');
        });
        it('treats series as tv', function() {
            var opts = app._buildDiscoverOptions('series', { group: 'date', asc: true });
            expect(opts.sortBy).toBe('first_air_date.asc');
            expect(opts.dateLte.field).toBe('first_air_date');
        });
        it('falls back to popularity.desc on unknown group', function() {
            var opts = app._buildDiscoverOptions('movie', { group: 'unknown', asc: false });
            expect(opts.sortBy).toBe('popularity.desc');
        });
        it('passes shortFilmMin+MaxRuntime from settings when genreFilter.id is "short"', function() {
            app.genreFilter = { id: 'short', name: 'Court-métrage', type: 'movie' };
            app.settings = { shortFilmMinRuntime: 5, shortFilmMaxRuntime: 15 };
            var opts = app._buildDiscoverOptions('movie', { group: 'popularity', asc: false });
            expect(opts.shortFilmMinRuntime).toBe(5);
            expect(opts.shortFilmMaxRuntime).toBe(15);
        });
        it('defaults shortFilm runtimes (min=1, max=40) when unset', function() {
            app.genreFilter = { id: 'short', name: 'Court-métrage', type: 'movie' };
            app.settings = {};
            var opts = app._buildDiscoverOptions('movie', { group: 'popularity', asc: false });
            expect(opts.shortFilmMinRuntime).toBe(1);
            expect(opts.shortFilmMaxRuntime).toBe(40);
        });
        it('does NOT add shortFilm runtimes when filter is not short', function() {
            app.genreFilter = { id: 28, name: 'Action', type: 'movie' };
            var opts = app._buildDiscoverOptions('movie', { group: 'popularity', asc: false });
            expect(opts.shortFilmMaxRuntime).toBeUndefined();
            expect(opts.shortFilmMinRuntime).toBeUndefined();
        });
    });

    describe('_getGenrePickerSort', function() {
        it('returns popularity desc by default', function() {
            app.settings = {};
            expect(app._getGenrePickerSort()).toEqual({ group: 'popularity', asc: false });
        });
        it('returns saved sort from settings', function() {
            app.settings = { genrePickerSort: { group: 'rating', asc: true } };
            expect(app._getGenrePickerSort()).toEqual({ group: 'rating', asc: true });
        });
        it('coerces asc to boolean', function() {
            app.settings = { genrePickerSort: { group: 'date', asc: 1 } };
            expect(app._getGenrePickerSort()).toEqual({ group: 'date', asc: true });
        });
    });

    describe('applyGenrePickerSort', function() {
        beforeEach(function() {
            app.settings = {};
            app.saveSettings = jest.fn();
            app._updateGenrePickerSortButtons = jest.fn();
            app.applyGenreFilter = jest.fn();
        });
        it('selects new group with default direction (desc)', function() {
            app.applyGenrePickerSort('rating');
            expect(app.settings.genrePickerSort).toEqual({ group: 'rating', asc: false });
            expect(app.saveSettings).toHaveBeenCalled();
        });
        it('toggles direction when clicking the same group again', function() {
            // Default state is popularity desc, so clicking 'popularity' is treated
            // as same-group → toggle direction.
            app.applyGenrePickerSort('popularity'); // toggle 1: desc → asc
            expect(app.settings.genrePickerSort).toEqual({ group: 'popularity', asc: true });
            app.applyGenrePickerSort('popularity'); // toggle 2: asc → desc
            expect(app.settings.genrePickerSort).toEqual({ group: 'popularity', asc: false });
            app.applyGenrePickerSort('popularity'); // toggle 3: desc → asc
            expect(app.settings.genrePickerSort).toEqual({ group: 'popularity', asc: true });
        });
        it('switching to a different group resets direction to desc', function() {
            app.settings = { genrePickerSort: { group: 'popularity', asc: true } };
            app.applyGenrePickerSort('rating');
            expect(app.settings.genrePickerSort).toEqual({ group: 'rating', asc: false });
        });
        it('does NOT re-fetch when no genre filter is active', function() {
            app.genreFilter = null;
            app.applyGenrePickerSort('rating');
            expect(app.applyGenreFilter).not.toHaveBeenCalled();
        });
        it('re-fetches the active genre when sort changes', function() {
            app.genreFilter = { id: 28, name: 'Action', type: 'movie' };
            app.applyGenrePickerSort('rating');
            expect(app.applyGenreFilter).toHaveBeenCalledWith(28, 'Action');
        });
    });

    describe('_appendGenreMatches', function() {
        beforeEach(function() {
            app.updateGridSpacer = jest.fn();
            app.invalidateFocusables = jest.fn();
            app.loadMoreItems = jest.fn();
        });

        it('is a no-op when given empty list', function() {
            app._genreFilteredStreams = [{ stream_id: 1 }];
            app.currentStreams = [{ stream_id: 1 }];
            app._appendGenreMatches([]);
            expect(app._genreFilteredStreams.length).toBe(1);
            expect(app.loadMoreItems).not.toHaveBeenCalled();
        });

        it('appends to _genreFilteredStreams and currentStreams without re-rendering', function() {
            app._genreFilteredStreams = [{ stream_id: 1 }];
            app.currentStreams = [{ stream_id: 1 }];
            app._appendGenreMatches([{ stream_id: 2 }, { stream_id: 3 }]);
            expect(app._genreFilteredStreams.length).toBe(3);
            expect(app.currentStreams.length).toBe(3);
            expect(app.currentStreams[1].stream_id).toBe(2);
            expect(app.currentStreams[2].stream_id).toBe(3);
            // Critical: no applyFilters() — that would reset displayedCount=0 and
            // re-render the entire grid, losing the user's scroll position.
            expect(app.loadMoreItems).toHaveBeenCalledTimes(1);
            expect(app.updateGridSpacer).toHaveBeenCalledTimes(1);
            expect(app.invalidateFocusables).toHaveBeenCalledTimes(1);
        });

        it('handles initial null state (currentStreams not yet set)', function() {
            app._genreFilteredStreams = null;
            app.currentStreams = null;
            app._appendGenreMatches([{ stream_id: 5 }]);
            expect(app._genreFilteredStreams.length).toBe(1);
            expect(app.currentStreams.length).toBe(1);
        });
    });
});
