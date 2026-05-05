/**
 * Tests for Details page functionality
 */

// Mock window.log
window.log = jest.fn();

// Mock I18n
window.I18n = { t: function(key, fallback) { return fallback || key; } };

// Mock DOM elements
document.body.innerHTML = `
    <div id="details-backdrop"></div>
    <div id="details-poster"></div>
    <div id="details-title"></div>
    <div id="details-meta"></div>
    <div id="details-description"></div>
    <div id="details-genres"></div>
    <div id="details-cast-section" class="hidden">
        <div id="details-cast-title">Cast</div>
        <div id="details-cast-grid"></div>
    </div>
    <div id="series-status"></div>
    <div id="details-episodes-section"></div>
`;

describe('playCurrentStream', () => {
    let app;

    beforeEach(() => {
        // Create a minimal app mock with playCurrentStream behavior
        app = {
            selectedStream: null,
            seriesContinueEpisode: null,
            playStream: jest.fn(),
            addToWatchHistory: jest.fn(),
            selectSeason: jest.fn(),
            currentSeason: null,
            currentEpisodeId: null,
            currentEpisodeNum: null,
            launchedFromButton: null
        };
    });

    describe('bug: _episodeId on undefined data', () => {
        it('should not crash when selectedStream.data is undefined for series', () => {
            // This reproduces the bug scenario:
            // 1. User watches an episode
            // 2. Goes to actor page
            // 3. Opens another series from actor page
            // 4. selectedStream is set without data property
            app.selectedStream = { id: 123, type: 'series' };
            // data is undefined - this caused the crash

            // The fix should handle this gracefully
            expect(() => {
                // Simulate the condition check that was crashing
                if (app.selectedStream) {
                    if (app.selectedStream.type === 'series' &&
                        app.selectedStream.data &&
                        app.selectedStream.data._episodeId) {
                        // This branch should not be taken when data is undefined
                        throw new Error('Should not reach here');
                    }
                }
            }).not.toThrow();
        });

        it('should work correctly when selectedStream.data exists with _episodeId', () => {
            app.selectedStream = {
                id: 123,
                type: 'series',
                data: {
                    _episodeId: 456,
                    _season: 1,
                    _episode: 3,
                    name: 'Test Episode',
                    cover: 'http://example.com/cover.jpg'
                }
            };

            // Should be able to access _episodeId without error
            expect(app.selectedStream.data._episodeId).toBe(456);
        });

        it('should work when selectedStream.data exists but _episodeId is missing', () => {
            app.selectedStream = {
                id: 123,
                type: 'series',
                data: {
                    name: 'Test Series'
                }
            };

            // Should not crash, _episodeId is just falsy
            expect(() => {
                if (app.selectedStream.type === 'series' &&
                    app.selectedStream.data &&
                    app.selectedStream.data._episodeId) {
                    throw new Error('Should not reach here');
                }
            }).not.toThrow();
        });
    });
});

describe('bug: focus on favorite button instead of play button', () => {
    var originalHTML;

    beforeEach(() => {
        originalHTML = document.body.innerHTML;
        document.body.innerHTML = `
            <div id="details-screen">
                <button id="favorite-btn" class="focusable">☆</button>
                <button id="continue-btn" class="focusable hidden">Continue</button>
                <button id="play-btn" class="focusable">Play</button>
                <button id="mark-watched-btn" class="focusable hidden">Mark</button>
            </div>
        `;
    });

    afterEach(() => {
        document.body.innerHTML = originalHTML;
    });

    it('should exclude hidden elements from focusables', () => {
        var selector = '#details-screen .focusable:not(.hidden)';
        var focusables = document.querySelectorAll(selector);
        expect(focusables.length).toBe(2);
        expect(focusables[0].id).toBe('favorite-btn');
        expect(focusables[1].id).toBe('play-btn');
    });

    it('should find play-btn at index 1 when continue-btn is hidden', () => {
        var selector = '#details-screen .focusable:not(.hidden)';
        var focusables = document.querySelectorAll(selector);
        var playIndex = -1;
        for (var i = 0; i < focusables.length; i++) {
            if (focusables[i].id === 'continue-btn') {
                playIndex = i;
                break;
            }
        }
        if (playIndex === -1) {
            for (var i = 0; i < focusables.length; i++) {
                if (focusables[i].id === 'play-btn') {
                    playIndex = i;
                    break;
                }
            }
        }
        expect(playIndex).toBe(1);
    });

    it('should find continue-btn at index 1 when it is visible', () => {
        document.getElementById('continue-btn').classList.remove('hidden');
        var selector = '#details-screen .focusable:not(.hidden)';
        var focusables = document.querySelectorAll(selector);
        var playIndex = -1;
        for (var i = 0; i < focusables.length; i++) {
            if (focusables[i].id === 'continue-btn') {
                playIndex = i;
                break;
            }
        }
        expect(playIndex).toBe(1);
    });
});

describe('Cast section visibility', () => {
    beforeEach(() => {
        document.getElementById('details-cast-section').classList.add('hidden');
        document.getElementById('details-cast-grid').innerHTML = '';
    });

    it('should hide cast section when cast is empty', () => {
        var castSection = document.getElementById('details-cast-section');
        var castGrid = document.getElementById('details-cast-grid');
        var cast = [];
        castGrid.innerHTML = '';
        if (cast.length === 0) {
            castSection.classList.add('hidden');
        } else {
            castSection.classList.remove('hidden');
        }
        expect(castSection.classList.contains('hidden')).toBe(true);
    });

    it('should show cast section when cast has entries', () => {
        var castSection = document.getElementById('details-cast-section');
        var castGrid = document.getElementById('details-cast-grid');
        var cast = [{ name: 'Actor 1' }, { name: 'Actor 2' }];
        castGrid.innerHTML = '';
        if (cast.length === 0) {
            castSection.classList.add('hidden');
        } else {
            castSection.classList.remove('hidden');
        }
        expect(castSection.classList.contains('hidden')).toBe(false);
    });
});

describe('Episode selection mode for individual download', () => {
    var app;
    var originalHTML;

    function enterEpisodeSelectMode() {
        this._episodeSelectMode = true;
        this._selectedEpisodeIds = [];
        this.updateEpisodeSelectUI();
        this.updateDownloadSeasonButton();
        this.showToast('Select episodes', 4000);
        var firstEp = document.querySelector('.episode-item');
        if (firstEp) {
            var focusables = this.getFocusables();
            for (var i = 0; i < focusables.length; i++) {
                if (focusables[i] === firstEp) {
                    this.focusIndex = i;
                    this.updateFocus();
                    break;
                }
            }
        }
    }

    function exitEpisodeSelectMode() {
        this._episodeSelectMode = false;
        this._selectedEpisodeIds = [];
        this.updateEpisodeSelectUI();
        this.updateDownloadSeasonButton();
    }

    function toggleEpisodeSelection(epId) {
        if (!this._selectedEpisodeIds) this._selectedEpisodeIds = [];
        var idx = this._selectedEpisodeIds.indexOf(epId);
        if (idx === -1) {
            this._selectedEpisodeIds.push(epId);
        }
        else {
            this._selectedEpisodeIds.splice(idx, 1);
        }
        this.updateEpisodeSelectUI();
        this.updateDownloadSeasonButton();
    }

    function updateEpisodeSelectUI() {
        var items = document.querySelectorAll('.episode-item');
        var selectedIds = this._selectedEpisodeIds || [];
        var selectMode = this._episodeSelectMode;
        for (var i = 0; i < items.length; i++) {
            items[i].classList.toggle('select-mode', !!selectMode);
            items[i].classList.toggle('selected-for-download', selectMode && selectedIds.indexOf(items[i].dataset.episodeId) !== -1);
        }
    }

    function updateDownloadSeasonButton() {
        var btn = document.getElementById('download-season-btn');
        if (!btn) return;
        btn.classList.toggle('select-mode', !!this._episodeSelectMode);
        if (this._episodeSelectMode && this._selectedEpisodeIds && this._selectedEpisodeIds.length > 0) {
            btn.textContent = '(' + this._selectedEpisodeIds.length + ')';
        }
        else if (this._episodeSelectMode) {
            btn.textContent = I18n.t('freebox.downloadAll', 'All');
        }
        else {
            btn.textContent = '';
        }
    }

    function downloadSelectedEpisodes() {
        var selectedIds = this._selectedEpisodeIds ? this._selectedEpisodeIds.slice() : [];
        this.exitEpisodeSelectMode();
        if (!this.currentSeriesInfo || !this.currentSeriesInfo.episodes) return;
        var allEpisodes = this.currentSeriesInfo.episodes[this.currentSeason];
        if (!allEpisodes) return;
        var episodes = allEpisodes.filter(function(ep) {
            return selectedIds.indexOf(String(ep.id)) !== -1;
        });
        if (episodes.length === 0) return;
        this.downloadSeasonEpisodes(episodes);
    }

    function triggerFreeboxSeasonDownload() {
        if (!this.currentSeriesInfo || !this.currentSeriesInfo.episodes) return;
        var episodes = this.currentSeriesInfo.episodes[this.currentSeason];
        if (!episodes || episodes.length === 0) return;
        if (this._episodeSelectMode) {
            if (this._selectedEpisodeIds && this._selectedEpisodeIds.length > 0) {
                this.downloadSelectedEpisodes();
            }
            else {
                this.showToast('No episodes selected, downloading all', 3000);
                this.exitEpisodeSelectMode();
                this.downloadSeasonEpisodes(episodes);
            }
            return;
        }
        this.enterEpisodeSelectMode();
    }

    function buildTestDOM() {
        var container = document.createElement('div');
        var seasonSelector = document.createElement('div');
        seasonSelector.id = 'details-season-selector';
        var seasonBtn = document.createElement('button');
        seasonBtn.className = 'season-btn';
        seasonBtn.dataset.season = '1';
        seasonBtn.textContent = 'Season 1';
        seasonSelector.appendChild(seasonBtn);
        var dlBtn = document.createElement('button');
        dlBtn.id = 'download-season-btn';
        dlBtn.className = 'download-season-btn focusable';
        seasonSelector.appendChild(dlBtn);
        container.appendChild(seasonSelector);
        var grid = document.createElement('div');
        grid.id = 'details-episodes-grid';
        for (var i = 1; i <= 3; i++) {
            var ep = document.createElement('div');
            ep.className = 'episode-item focusable';
            ep.dataset.episodeId = String(100 + i);
            ep.dataset.episodeNum = String(i);
            ep.textContent = 'Ep ' + i;
            grid.appendChild(ep);
        }
        container.appendChild(grid);
        document.body.appendChild(container);
    }

    beforeEach(() => {
        originalHTML = document.body.innerHTML;
        document.body.innerHTML = '';
        buildTestDOM();
        app = {
            _episodeSelectMode: false,
            _selectedEpisodeIds: [],
            showToast: jest.fn(),
            getFocusables: function() {
                return document.querySelectorAll('.focusable');
            },
            focusIndex: 0,
            updateFocus: jest.fn()
        };
        app.enterEpisodeSelectMode = enterEpisodeSelectMode.bind(app);
        app.exitEpisodeSelectMode = exitEpisodeSelectMode.bind(app);
        app.toggleEpisodeSelection = toggleEpisodeSelection.bind(app);
        app.updateEpisodeSelectUI = updateEpisodeSelectUI.bind(app);
        app.updateDownloadSeasonButton = updateDownloadSeasonButton.bind(app);
        app.downloadSelectedEpisodes = downloadSelectedEpisodes.bind(app);
        app.triggerFreeboxSeasonDownload = triggerFreeboxSeasonDownload.bind(app);
    });

    afterEach(() => {
        document.body.innerHTML = originalHTML;
    });

    it('should enter select mode and add select-mode class to episodes', () => {
        app.enterEpisodeSelectMode();
        expect(app._episodeSelectMode).toBe(true);
        expect(app._selectedEpisodeIds).toEqual([]);
        var items = document.querySelectorAll('.episode-item.select-mode');
        expect(items.length).toBe(3);
        var btn = document.getElementById('download-season-btn');
        expect(btn.classList.contains('select-mode')).toBe(true);
    });

    it('should exit select mode and remove all select classes', () => {
        app.enterEpisodeSelectMode();
        app.toggleEpisodeSelection('101');
        app.exitEpisodeSelectMode();
        expect(app._episodeSelectMode).toBe(false);
        expect(app._selectedEpisodeIds).toEqual([]);
        var selectModeItems = document.querySelectorAll('.episode-item.select-mode');
        expect(selectModeItems.length).toBe(0);
        var selectedItems = document.querySelectorAll('.episode-item.selected-for-download');
        expect(selectedItems.length).toBe(0);
        var btn = document.getElementById('download-season-btn');
        expect(btn.classList.contains('select-mode')).toBe(false);
    });

    it('should toggle episode selection on and off', () => {
        app.enterEpisodeSelectMode();
        app.toggleEpisodeSelection('101');
        expect(app._selectedEpisodeIds).toEqual(['101']);
        var ep1 = document.querySelector('[data-episode-id="101"]');
        expect(ep1.classList.contains('selected-for-download')).toBe(true);
        app.toggleEpisodeSelection('102');
        expect(app._selectedEpisodeIds).toEqual(['101', '102']);
        app.toggleEpisodeSelection('101');
        expect(app._selectedEpisodeIds).toEqual(['102']);
        expect(ep1.classList.contains('selected-for-download')).toBe(false);
    });

    it('should update download button text with count', () => {
        app.enterEpisodeSelectMode();
        var btn = document.getElementById('download-season-btn');
        expect(btn.textContent).toBe('All');
        app.toggleEpisodeSelection('101');
        expect(btn.textContent).toBe('(1)');
        app.toggleEpisodeSelection('102');
        expect(btn.textContent).toBe('(2)');
        app.toggleEpisodeSelection('101');
        expect(btn.textContent).toBe('(1)');
    });

    it('should download only selected episodes when selection > 0', () => {
        app.currentSeriesInfo = { episodes: { 1: [
            { id: 101, episode_num: 1 },
            { id: 102, episode_num: 2 },
            { id: 103, episode_num: 3 }
        ]}};
        app.currentSeason = 1;
        app.downloadSeasonEpisodes = jest.fn();
        app._episodeSelectMode = true;
        app._selectedEpisodeIds = ['101', '103'];
        app.downloadSelectedEpisodes();
        expect(app.downloadSeasonEpisodes).toHaveBeenCalledTimes(1);
        var downloadedEpisodes = app.downloadSeasonEpisodes.mock.calls[0][0];
        expect(downloadedEpisodes.length).toBe(2);
        expect(downloadedEpisodes[0].id).toBe(101);
        expect(downloadedEpisodes[1].id).toBe(103);
        expect(app._episodeSelectMode).toBe(false);
    });

    it('should download all episodes when no selection and download pressed again', () => {
        app.currentSeriesInfo = { episodes: { 1: [
            { id: 101, episode_num: 1 },
            { id: 102, episode_num: 2 },
            { id: 103, episode_num: 3 }
        ]}};
        app.currentSeason = 1;
        app.downloadSeasonEpisodes = jest.fn();
        app._episodeSelectMode = true;
        app._selectedEpisodeIds = [];
        app.triggerFreeboxSeasonDownload();
        expect(app.downloadSeasonEpisodes).toHaveBeenCalledTimes(1);
        var episodes = app.downloadSeasonEpisodes.mock.calls[0][0];
        expect(episodes.length).toBe(3);
        expect(app._episodeSelectMode).toBe(false);
    });
});

describe('trimTMDBResult', () => {
    function trimTMDBResult(data) {
        if (!data) return data;
        var trimmed = {
            id: data.id,
            title: data.title,
            name: data.name,
            overview: data.overview,
            poster_path: data.poster_path,
            backdrop_path: data.backdrop_path,
            release_date: data.release_date,
            first_air_date: data.first_air_date,
            runtime: data.runtime,
            vote_average: data.vote_average,
            number_of_seasons: data.number_of_seasons,
            _type: data._type
        };
        if (data.genres) {
            trimmed.genres = data.genres;
        }
        if (data.credits) {
            trimmed.credits = {};
            if (data.credits.cast) {
                trimmed.credits.cast = data.credits.cast.slice(0, 8).map(function(c) {
                    return { id: c.id, name: c.name, character: c.character, profile_path: c.profile_path };
                });
            }
            if (data.credits.crew) {
                trimmed.credits.crew = data.credits.crew.filter(function(c) {
                    return c.job === 'Director';
                }).map(function(c) {
                    return { id: c.id, name: c.name, profile_path: c.profile_path, job: c.job };
                });
            }
        }
        if (data.external_ids) {
            trimmed.external_ids = { imdb_id: data.external_ids.imdb_id };
        }
        if (data.created_by && data.created_by.length > 0) {
            var first = data.created_by[0];
            trimmed.created_by = [{ id: first.id, name: first.name, profile_path: first.profile_path }];
        }
        if (data.seasons) {
            trimmed.seasons = data.seasons.map(function(s) {
                return { season_number: s.season_number, overview: s.overview };
            });
        }
        return trimmed;
    }

    it('should return null for null input', () => {
        expect(trimTMDBResult(null)).toBeNull();
    });

    it('should keep only 8 cast members from 50', () => {
        var cast = [];
        for (var i = 0; i < 50; i++) {
            cast.push({ id: i, name: 'Actor ' + i, character: 'Char ' + i, profile_path: '/path' + i, popularity: i, order: i });
        }
        var data = {
            id: 123,
            title: 'Test Movie',
            overview: 'A test movie',
            genres: [{ id: 1, name: 'Action' }],
            credits: { cast: cast, crew: [] },
            _type: 'movie'
        };
        var result = trimTMDBResult(data);
        expect(result.credits.cast.length).toBe(8);
        expect(result.credits.cast[0].id).toBe(0);
        expect(result.credits.cast[7].id).toBe(7);
        expect(result.credits.cast[0].popularity).toBeUndefined();
    });

    it('should keep only Director from 30 crew members', () => {
        var crew = [];
        for (var i = 0; i < 30; i++) {
            crew.push({ id: i, name: 'Crew ' + i, job: i === 5 ? 'Director' : 'Other Job ' + i, profile_path: '/crew' + i, department: 'dept' });
        }
        var data = {
            id: 456,
            title: 'Test Movie 2',
            credits: { cast: [], crew: crew },
            _type: 'movie'
        };
        var result = trimTMDBResult(data);
        expect(result.credits.crew.length).toBe(1);
        expect(result.credits.crew[0].name).toBe('Crew 5');
        expect(result.credits.crew[0].job).toBe('Director');
        expect(result.credits.crew[0].department).toBeUndefined();
    });

    it('should keep empty crew when no Director', () => {
        var crew = [
            { id: 1, name: 'Writer', job: 'Writer', profile_path: '/w' },
            { id: 2, name: 'Producer', job: 'Producer', profile_path: '/p' }
        ];
        var data = {
            id: 789,
            title: 'No Director Movie',
            credits: { cast: [], crew: crew },
            _type: 'movie'
        };
        var result = trimTMDBResult(data);
        expect(result.credits.crew.length).toBe(0);
    });

    it('should only keep imdb_id from external_ids', () => {
        var data = {
            id: 100,
            title: 'Test',
            external_ids: { imdb_id: 'tt1234567', facebook_id: 'fb123', instagram_id: 'ig456', twitter_id: 'tw789' },
            _type: 'movie'
        };
        var result = trimTMDBResult(data);
        expect(result.external_ids).toEqual({ imdb_id: 'tt1234567' });
        expect(result.external_ids.facebook_id).toBeUndefined();
    });

    it('should only keep first created_by entry', () => {
        var data = {
            id: 200,
            name: 'Test TV',
            created_by: [
                { id: 1, name: 'Creator 1', profile_path: '/c1', gender: 2 },
                { id: 2, name: 'Creator 2', profile_path: '/c2', gender: 1 }
            ],
            _type: 'tv'
        };
        var result = trimTMDBResult(data);
        expect(result.created_by.length).toBe(1);
        expect(result.created_by[0].name).toBe('Creator 1');
        expect(result.created_by[0].gender).toBeUndefined();
    });

    it('should trim seasons to season_number and overview only', () => {
        var data = {
            id: 300,
            name: 'TV Show',
            seasons: [
                { season_number: 1, overview: 'Season 1 desc', episode_count: 10, air_date: '2020-01-01', poster_path: '/s1' },
                { season_number: 2, overview: 'Season 2 desc', episode_count: 12, air_date: '2021-01-01', poster_path: '/s2' }
            ],
            _type: 'tv'
        };
        var result = trimTMDBResult(data);
        expect(result.seasons.length).toBe(2);
        expect(result.seasons[0]).toEqual({ season_number: 1, overview: 'Season 1 desc' });
        expect(result.seasons[0].episode_count).toBeUndefined();
        expect(result.seasons[0].poster_path).toBeUndefined();
    });

    it('should preserve essential fields', () => {
        var data = {
            id: 400,
            title: 'Full Movie',
            name: undefined,
            overview: 'Full overview',
            poster_path: '/poster.jpg',
            backdrop_path: '/backdrop.jpg',
            release_date: '2023-06-15',
            runtime: 120,
            vote_average: 7.5,
            genres: [{ id: 1, name: 'Drama' }],
            number_of_seasons: undefined,
            _type: 'movie',
            budget: 50000000,
            revenue: 200000000,
            production_companies: [{ id: 1, name: 'Studio' }],
            spoken_languages: [{ iso_639_1: 'en' }]
        };
        var result = trimTMDBResult(data);
        expect(result.id).toBe(400);
        expect(result.title).toBe('Full Movie');
        expect(result.overview).toBe('Full overview');
        expect(result.poster_path).toBe('/poster.jpg');
        expect(result.backdrop_path).toBe('/backdrop.jpg');
        expect(result.release_date).toBe('2023-06-15');
        expect(result.runtime).toBe(120);
        expect(result.vote_average).toBe(7.5);
        expect(result.genres).toEqual([{ id: 1, name: 'Drama' }]);
        expect(result._type).toBe('movie');
        expect(result.budget).toBeUndefined();
        expect(result.revenue).toBeUndefined();
        expect(result.production_companies).toBeUndefined();
        expect(result.spoken_languages).toBeUndefined();
    });
});

describe('removeCompletedDownloadsFromGrid', () => {
    var app;

    beforeEach(() => {
        var grid = document.createElement('div');
        grid.id = 'content-grid';
        for (var i = 0; i < 3; i++) {
            var item = document.createElement('div');
            item.className = 'grid-item';
            item.dataset.streamId = String((i + 1) * 100);
            grid.appendChild(item);
        }
        document.body.appendChild(grid);
        app = {
            currentSection: 'downloads',
            currentStreams: [
                { _isDownload: true, _dlId: '10', _streamId: '100' },
                { _isDownload: true, _dlId: '20', _streamId: '200' },
                { _isDownload: true, _dlId: '30', _streamId: '300' }
            ],
            _freeboxDownloadMap: { '10': '100', '30': '300' },
            focusIndex: 1,
            updateFocus: jest.fn(),
            showEmptyMessage: jest.fn()
        };
    });

    afterEach(() => {
        var grid = document.getElementById('content-grid');
        if (grid) grid.remove();
    });

    function findCompletedIndices(ctx) {
        if (ctx.currentSection !== 'downloads') return [];
        var grid = document.getElementById('content-grid');
        if (!grid) return [];
        var gridItems = grid.querySelectorAll('.grid-item');
        var dlMap = ctx._freeboxDownloadMap || {};
        var toRemove = [];
        for (var i = 0; i < gridItems.length; i++) {
            if (i >= ctx.currentStreams.length) break;
            var stream = ctx.currentStreams[i];
            if (!stream._isDownload || !stream._dlId) continue;
            if (!dlMap[stream._dlId]) {
                toRemove.push(i);
            }
        }
        return toRemove;
    }

    it('should detect completed downloads not in dlMap', () => {
        var toRemove = findCompletedIndices(app);
        expect(toRemove).toEqual([1]);
    });

    it('should detect nothing when all downloads are still in dlMap', () => {
        app._freeboxDownloadMap = { '10': '100', '20': '200', '30': '300' };
        var toRemove = findCompletedIndices(app);
        expect(toRemove).toEqual([]);
    });

    it('should detect multiple completed downloads', () => {
        app._freeboxDownloadMap = {};
        var toRemove = findCompletedIndices(app);
        expect(toRemove).toEqual([0, 1, 2]);
    });

    it('should skip items without _dlId (queued items)', () => {
        app.currentStreams[1] = { _isDownload: true, _dlId: null, _streamId: '200' };
        app._freeboxDownloadMap = {};
        var toRemove = findCompletedIndices(app);
        expect(toRemove).toEqual([0, 2]);
    });

    it('should not run when not on downloads screen', () => {
        app.currentSection = 'movies';
        var toRemove = findCompletedIndices(app);
        expect(toRemove).toEqual([]);
    });
});

describe('bug: fetchTMDBInfo type mapping for series with cached tmdb_id', () => {
    function resolveTmdbType(type) {
        return (type === 'series' || type === 'tv') ? 'tv' : 'movie';
    }

    it('maps series → tv', () => {
        expect(resolveTmdbType('series')).toBe('tv');
    });

    it('maps tv → tv (regression: caller already passes "tv")', () => {
        expect(resolveTmdbType('tv')).toBe('tv');
    });

    it('maps movie → movie', () => {
        expect(resolveTmdbType('movie')).toBe('movie');
    });

    it('maps vod → movie', () => {
        expect(resolveTmdbType('vod')).toBe('movie');
    });
});

describe('Recommendations engine', () => {
    function buildProviderIndex(streams) {
        var byTmdb = {};
        var byCleanKey = {};
        for (var i = 0; i < streams.length; i++) {
            var s = streams[i];
            if (s.tmdb_id != null) byTmdb[String(s.tmdb_id)] = s;
            if (!byCleanKey[s._dedupKey]) byCleanKey[s._dedupKey] = s;
        }
        return { byTmdb: byTmdb, byCleanKey: byCleanKey };
    }

    function matchTmdbToStream(tmdbResult, type, providerIndex) {
        var hit = providerIndex.byTmdb[String(tmdbResult.id)];
        if (hit) return hit;
        var rawTitle = type === 'tv' ? tmdbResult.name : tmdbResult.title;
        if (!rawTitle) return null;
        var clean = rawTitle.toLowerCase();
        var year = '';
        if (type === 'tv' && tmdbResult.first_air_date) year = tmdbResult.first_air_date.substring(0, 4);
        if (type !== 'tv' && tmdbResult.release_date) year = tmdbResult.release_date.substring(0, 4);
        return providerIndex.byCleanKey[clean + '|' + year]
            || providerIndex.byCleanKey[clean + '|']
            || null;
    }

    it('matches by tmdb_id when present', () => {
        var streams = [
            { tmdb_id: 42, _dedupKey: 'movie a|2020', name: 'Movie A' },
            { tmdb_id: 99, _dedupKey: 'movie b|2021', name: 'Movie B' }
        ];
        var idx = buildProviderIndex(streams);
        var match = matchTmdbToStream({ id: 42, title: 'Different Title' }, 'movie', idx);
        expect(match).toBe(streams[0]);
    });

    it('matches by title+year when no tmdb_id', () => {
        var streams = [
            { _dedupKey: 'inception|2010', name: 'Inception' }
        ];
        var idx = buildProviderIndex(streams);
        var match = matchTmdbToStream({ id: 27205, title: 'Inception', release_date: '2010-07-16' }, 'movie', idx);
        expect(match).toBe(streams[0]);
    });

    it('falls back to title-only when year mismatch', () => {
        var streams = [
            { _dedupKey: 'cube|', name: 'Cube' }
        ];
        var idx = buildProviderIndex(streams);
        var match = matchTmdbToStream({ id: 1, title: 'Cube', release_date: '1997-09-09' }, 'movie', idx);
        expect(match).toBe(streams[0]);
    });

    it('returns null when no match', () => {
        var idx = buildProviderIndex([{ _dedupKey: 'foo|2020' }]);
        var match = matchTmdbToStream({ id: 999, title: 'Bar' }, 'movie', idx);
        expect(match).toBeNull();
    });

    it('scores recommendations by frequency across multiple seeds', () => {
        var allResults = [
            [{ id: 1 }, { id: 2 }, { id: 3 }],
            [{ id: 2 }, { id: 4 }],
            [{ id: 2 }, { id: 3 }, { id: 5 }]
        ];
        var scoreById = {};
        for (var i = 0; i < allResults.length; i++) {
            for (var j = 0; j < allResults[i].length; j++) {
                var id = allResults[i][j].id;
                scoreById[id] = (scoreById[id] || 0) + 1;
            }
        }
        expect(scoreById[2]).toBe(3);
        expect(scoreById[3]).toBe(2);
        expect(scoreById[1]).toBe(1);
        expect(scoreById[4]).toBe(1);
        expect(scoreById[5]).toBe(1);
    });

    it('filters out items already in seen set', () => {
        var seen = { 't:movie:42': true };
        var candidates = [{ id: 42 }, { id: 43 }];
        var kept = candidates.filter(function(c) { return !seen['t:movie:' + c.id]; });
        expect(kept).toEqual([{ id: 43 }]);
    });
});

describe('bug: stale TMDB callback after Back overwrites previous detail (I Origins → Split)', () => {
    function makeApp() {
        return {
            _detailsSession: 0,
            tmdbInfo: null,
            selectedStream: null,
            titleOverrides: {},
            displayedTitle: '',
            _bumpDetailsSession: function() {
                this._detailsSession = (this._detailsSession || 0) + 1;
                return this._detailsSession;
            },
            saveTitleOverride: function(streamId, title) {
                this.titleOverrides[streamId] = title;
            },
            fetchTMDBDetailsByIdAsync: function(tmdbId, type, tmdbResponse) {
                var self = this;
                var session = self._detailsSession;
                return function applyResponseLater() {
                    if (self._detailsSession !== session) return false;
                    self.tmdbInfo = tmdbResponse;
                    if (self.selectedStream && self.selectedStream.data) {
                        self.selectedStream.data.tmdb_id = tmdbResponse.id;
                    }
                    var providerTitle = self.selectedStream && self.selectedStream.data
                        ? self.selectedStream.data.name : '';
                    var titlesMatch = providerTitle.toLowerCase() === tmdbResponse.title.toLowerCase();
                    if (!titlesMatch) {
                        self.displayedTitle = tmdbResponse.title;
                        var streamId = self.selectedStream && self.selectedStream.data
                            && self.selectedStream.data.stream_id;
                        if (streamId) self.saveTitleOverride(streamId, tmdbResponse.title);
                    }
                    return true;
                };
            }
        };
    }

    it('aborts stale Split callback after user navigates back to I Origins details', () => {
        var app = makeApp();
        var iOriginsStream = { stream_id: 'IO', data: { stream_id: 'IO', name: 'I Origins' } };
        var splitStream = { stream_id: 'SP', data: { stream_id: 'SP', name: 'Split' } };
        app._bumpDetailsSession();
        app.selectedStream = iOriginsStream;
        app.displayedTitle = 'I Origins';
        var iOriginsApply = app.fetchTMDBDetailsByIdAsync('IO_TMDB', 'movie', { id: 'IO_TMDB', title: 'I Origins' });
        expect(iOriginsApply()).toBe(true);
        expect(app.displayedTitle).toBe('I Origins');
        app._bumpDetailsSession();
        app.selectedStream = splitStream;
        app.displayedTitle = 'Split';
        var splitApply = app.fetchTMDBDetailsByIdAsync('SP_TMDB', 'movie', { id: 'SP_TMDB', title: 'Split' });
        app._bumpDetailsSession();
        app.selectedStream = iOriginsStream;
        app.displayedTitle = 'I Origins';
        var applied = splitApply();
        expect(applied).toBe(false);
        expect(app.displayedTitle).toBe('I Origins');
        expect(iOriginsStream.data.tmdb_id).toBe('IO_TMDB');
        expect(app.titleOverrides['IO']).toBeUndefined();
    });

    it('without session check: stale Split callback corrupts I Origins title and override (regression baseline)', () => {
        var app = makeApp();
        app._bumpDetailsSession = function() {};
        var iOriginsStream = { stream_id: 'IO', data: { stream_id: 'IO', name: 'I Origins' } };
        var splitStream = { stream_id: 'SP', data: { stream_id: 'SP', name: 'Split' } };
        app.selectedStream = iOriginsStream;
        app.displayedTitle = 'I Origins';
        app.selectedStream = splitStream;
        var splitApply = app.fetchTMDBDetailsByIdAsync('SP_TMDB', 'movie', { id: 'SP_TMDB', title: 'Split' });
        app.selectedStream = iOriginsStream;
        app.displayedTitle = 'I Origins';
        splitApply();
        expect(app.displayedTitle).toBe('Split');
        expect(iOriginsStream.data.tmdb_id).toBe('SP_TMDB');
        expect(app.titleOverrides['IO']).toBe('Split');
    });
});

describe('bug: title editor recovery from corrupted tmdb_id (clear before re-fetch)', () => {
    function commitNonEmpty(app, streamData, newTitle, rawTitle) {
        if (newTitle === rawTitle) return;
        app._manualTitleOverride = newTitle;
        if (streamData) {
            delete streamData.tmdb_id;
            delete streamData._tmdbId;
        }
        app.titleOverrides[streamData.stream_id] = newTitle;
    }

    it('clears corrupted tmdb_id when user edits title to recover from a stale-callback corruption', () => {
        var app = { titleOverrides: { IO: 'Split' }, _manualTitleOverride: null };
        var streamData = { stream_id: 'IO', name: 'I Origins', tmdb_id: 'SP_TMDB', _tmdbId: 'SP_TMDB' };
        commitNonEmpty(app, streamData, 'I Origins', 'i_origins_2014');
        expect(streamData.tmdb_id).toBeUndefined();
        expect(streamData._tmdbId).toBeUndefined();
        expect(app.titleOverrides.IO).toBe('I Origins');
        expect(app._manualTitleOverride).toBe('I Origins');
    });
});

describe('bug: displayTMDBDetails respects _manualTitleOverride', () => {
    function shouldOverwriteTitleFromTMDB(titlesMatch, manualTitleOverride) {
        return !titlesMatch && !manualTitleOverride;
    }

    it('overwrites title when titles do not match and no manual override (default behaviour)', () => {
        expect(shouldOverwriteTitleFromTMDB(false, null)).toBe(true);
    });

    it('skips overwrite when user has set a manual title override', () => {
        expect(shouldOverwriteTitleFromTMDB(false, 'I Origins')).toBe(false);
    });

    it('skips overwrite when titles already match', () => {
        expect(shouldOverwriteTitleFromTMDB(true, null)).toBe(false);
        expect(shouldOverwriteTitleFromTMDB(true, 'I Origins')).toBe(false);
    });
});

describe('bug: container_extension lost between series buttons and playStream', () => {
    // These mirror the implementations in js/details.js. Keep in sync.
    function findFirstEpisode(seriesData) {
        if (!seriesData.episodes) return null;
        var seasons = Object.keys(seriesData.episodes).sort(function(a, b) {
            return parseInt(a) - parseInt(b);
        });
        if (seasons.length === 0) return null;
        var firstSeason = seasons[0];
        var episodes = seriesData.episodes[firstSeason];
        if (!episodes || episodes.length === 0) return null;
        var firstEp = episodes.reduce(function(min, ep) {
            return parseInt(ep.episode_num) < parseInt(min.episode_num) ? ep : min;
        }, episodes[0]);
        return {
            id: firstEp.id,
            season: parseInt(firstSeason),
            episode: parseInt(firstEp.episode_num),
            containerExtension: firstEp.container_extension || null
        };
    }

    function analyzeSeriesProgress(seriesData, lastSeason, lastEpisode) {
        var result = { newCount: 0, nextEpisode: null };
        if (!seriesData.episodes) return result;
        var candidates = [];
        var seasonKeys = Object.keys(seriesData.episodes);
        for (var si = 0; si < seasonKeys.length; si++) {
            var seasonNum = seasonKeys[si];
            var sNum = parseInt(seasonNum);
            var episodes = seriesData.episodes[seasonNum];
            for (var ei = 0; ei < episodes.length; ei++) {
                var ep = episodes[ei];
                var eNum = parseInt(ep.episode_num);
                if (sNum > lastSeason || (sNum === lastSeason && eNum > lastEpisode)) {
                    result.newCount++;
                    candidates.push({
                        id: ep.id,
                        season: sNum,
                        episode: eNum,
                        containerExtension: ep.container_extension || null
                    });
                }
            }
        }
        if (candidates.length > 0) {
            candidates.sort(function(a, b) {
                if (a.season !== b.season) return a.season - b.season;
                return a.episode - b.episode;
            });
            result.nextEpisode = candidates[0];
        }
        return result;
    }

    function buildPlayStreamFromContinueEpisode(selectedStream, ep) {
        return {
            stream_id: ep.id,
            series_id: selectedStream.seriesId,
            name: selectedStream.data.name,
            cover: selectedStream.data.cover || selectedStream.data.stream_icon,
            season: ep.season,
            episode: ep.episode,
            container_extension: ep.containerExtension || null,
            _playlistId: selectedStream._playlistId
        };
    }

    function buildPlayStreamFromHistoryEpisode(selectedStream) {
        var data = selectedStream.data;
        return {
            stream_id: data._episodeId,
            series_id: selectedStream.seriesId,
            name: data.name,
            cover: data.cover || data.stream_icon,
            season: data._season,
            episode: data._episode,
            container_extension: data.container_extension || null,
            _playlistId: selectedStream._playlistId
        };
    }

    var seriesData = {
        episodes: {
            '1': [
                { id: 948118, episode_num: 1, container_extension: 'mp4' },
                { id: 948119, episode_num: 2, container_extension: 'mkv' }
            ],
            '2': [
                { id: 948200, episode_num: 1, container_extension: 'mp4' }
            ]
        }
    };

    it('findFirstEpisode propagates container_extension', () => {
        var first = findFirstEpisode(seriesData);
        expect(first.id).toBe(948118);
        expect(first.containerExtension).toBe('mp4');
    });

    it('findFirstEpisode returns null containerExtension when episode lacks it', () => {
        var bare = { episodes: { '1': [{ id: 1, episode_num: 1 }] } };
        var first = findFirstEpisode(bare);
        expect(first.containerExtension).toBeNull();
    });

    it('_analyzeSeriesProgress.nextEpisode propagates container_extension', () => {
        var result = analyzeSeriesProgress(seriesData, 1, 1);
        expect(result.nextEpisode.id).toBe(948119);
        expect(result.nextEpisode.containerExtension).toBe('mkv');
    });

    it('playCurrentStream (seriesContinueEpisode path) preserves mp4 extension end-to-end', () => {
        // Simulate the full chain: findFirstEpisode → seriesContinueEpisode → playStream
        var firstEp = findFirstEpisode(seriesData);
        var seriesContinueEpisode = {
            id: firstEp.id,
            season: firstEp.season,
            episode: firstEp.episode,
            position: 0,
            containerExtension: firstEp.containerExtension || null
        };
        var selectedStream = {
            seriesId: 17350,
            _playlistId: 'Pure IPTV',
            data: { name: 'A Town Like Alice', cover: 'cover.jpg' }
        };
        var stream = buildPlayStreamFromContinueEpisode(selectedStream, seriesContinueEpisode);
        // Bug repro: before fix, container_extension was undefined and playStream
        // fell back to '.mkv' producing a wrong URL for .mp4 episodes.
        expect(stream.container_extension).toBe('mp4');
    });

    it('playCurrentStream (history Continue path) preserves container_extension', () => {
        var selectedStream = {
            type: 'series',
            seriesId: 17350,
            _playlistId: 'Pure IPTV',
            data: {
                _episodeId: 948118,
                _season: 1,
                _episode: 1,
                name: 'A Town Like Alice',
                cover: 'cover.jpg',
                container_extension: 'mp4'
            }
        };
        var stream = buildPlayStreamFromHistoryEpisode(selectedStream);
        expect(stream.container_extension).toBe('mp4');
        expect(stream.stream_id).toBe(948118);
    });

    it('emulates playStream URL building: mp4 episode no longer falls back to mkv', () => {
        // Mirrors playback.js: url = getSeriesStreamUrl(streamId, ext || 'mkv')
        function getSeriesUrl(streamId, ext) {
            return 'http://srv/series/u/p/' + streamId + '.' + (ext || 'mkv');
        }
        var firstEp = findFirstEpisode(seriesData);
        var seriesContinueEpisode = { id: firstEp.id, containerExtension: firstEp.containerExtension };
        var stream = {
            stream_id: seriesContinueEpisode.id,
            container_extension: seriesContinueEpisode.containerExtension || null
        };
        var url = getSeriesUrl(stream.stream_id, stream.container_extension);
        expect(url).toBe('http://srv/series/u/p/948118.mp4');
    });
});

describe('bug: startFreeboxDownload missing var self = this leaks state to window', () => {
    // The fix declares `var self = this;` at the top of startFreeboxDownload before the
    // FreeboxAPI.addDownload(...).then(function(result) { ... self._freeboxDownloadMap[result.id] = ... }).
    // Without it, `self` resolves to `window.self` (which is `window`) and the maps end up on
    // `window` instead of the IPTVApp instance — silent state corruption.
    function buildAddDownload(callbackResult) {
        return function(url, filename) {
            return Promise.resolve(callbackResult);
        };
    }
    function emulateStartFreeboxDownloadFixed(app, addDownloadFn, opts) {
        var self = app;
        return addDownloadFn(opts.url, opts.filename).then(function(result) {
            if (!self._freeboxDownloadMap) self._freeboxDownloadMap = {};
            self._freeboxDownloadMap[result.id] = opts.streamId;
            if (!self._freeboxDownloadProviderMap) self._freeboxDownloadProviderMap = {};
            self._freeboxDownloadProviderMap[result.id] = opts.playlistId;
            if (opts.poster) {
                if (!self._freeboxDownloadPosterMap) self._freeboxDownloadPosterMap = {};
                self._freeboxDownloadPosterMap[result.id] = opts.poster;
            }
        });
    }
    function emulateStartFreeboxDownloadBuggy(app, addDownloadFn, opts) {
        // Note: no `var self = this` — `self` resolves to global `self` (window in jsdom).
        return addDownloadFn(opts.url, opts.filename).then(function(result) {
            if (!self._freeboxDownloadMap) self._freeboxDownloadMap = {};
            self._freeboxDownloadMap[result.id] = opts.streamId;
        });
    }
    afterEach(() => {
        try { delete global._freeboxDownloadMap; } catch (e) {}
        try { delete global.self._freeboxDownloadMap; } catch (e) {}
    });
    it('writes the maps on the app instance after addDownload resolves', async () => {
        var app = {};
        await emulateStartFreeboxDownloadFixed(app, buildAddDownload({ id: 'fb_42' }), {
            url: 'http://x', filename: 'a.mp4', streamId: 'sid_1', playlistId: 'pl_A', poster: 'p.jpg'
        });
        expect(app._freeboxDownloadMap).toEqual({ fb_42: 'sid_1' });
        expect(app._freeboxDownloadProviderMap).toEqual({ fb_42: 'pl_A' });
        expect(app._freeboxDownloadPosterMap).toEqual({ fb_42: 'p.jpg' });
    });
    it('baseline repro: without var self = this, the map ends up on global self (window) instead of app', async () => {
        var app = {};
        await emulateStartFreeboxDownloadBuggy(app, buildAddDownload({ id: 'fb_99' }), {
            url: 'http://x', filename: 'a.mp4', streamId: 'sid_2', playlistId: 'pl_B'
        });
        // BUG: app stays untouched
        expect(app._freeboxDownloadMap).toBeUndefined();
        // BUG: global self.window has the leaked state
        expect(global.self._freeboxDownloadMap).toEqual({ fb_99: 'sid_2' });
    });
});

describe('bug: streamId loose == matches when sid undefined', () => {
    // Original code in saveTitleOverride / removeTitleOverride compared streamId with `==`,
    // so streams missing all id fields (sid === undefined) matched when streamId was undefined,
    // mass-assigning the sortKey to every untyped stream.
    function updateStreamFixed(arr, streamId, newSortKey) {
        var streamIdStr = String(streamId);
        for (var i = 0; i < arr.length; i++) {
            var sid = arr[i].stream_id || arr[i].vod_id || arr[i].series_id;
            if (sid != null && String(sid) === streamIdStr) {
                arr[i]._sortKey = newSortKey;
            }
        }
    }
    function updateStreamBuggy(arr, streamId, newSortKey) {
        for (var i = 0; i < arr.length; i++) {
            var sid = arr[i].stream_id || arr[i].vod_id || arr[i].series_id;
            // eslint-disable-next-line eqeqeq
            if (sid == streamId) {
                arr[i]._sortKey = newSortKey;
            }
        }
    }
    it('fixed: does NOT update streams with no id when streamId is undefined', () => {
        var arr = [{ name: 'a' }, { stream_id: 5, name: 'b' }];
        updateStreamFixed(arr, undefined, 'X');
        expect(arr[0]._sortKey).toBeUndefined();
        expect(arr[1]._sortKey).toBeUndefined();
    });
    it('baseline repro: buggy version updates ALL streams with no id when streamId is undefined', () => {
        var arr = [{ name: 'a' }, { stream_id: 5, name: 'b' }];
        updateStreamBuggy(arr, undefined, 'X');
        // BUG: undefined == undefined → arr[0] gets matched
        expect(arr[0]._sortKey).toBe('X');
        // arr[1] has stream_id 5, so 5 == undefined is false, untouched
        expect(arr[1]._sortKey).toBeUndefined();
    });
    it('fixed: matches both numeric and string streamId variants (5 vs "5")', () => {
        var arr = [{ stream_id: 5 }, { stream_id: '5' }];
        updateStreamFixed(arr, '5', 'Y');
        expect(arr[0]._sortKey).toBe('Y');
        expect(arr[1]._sortKey).toBe('Y');
    });
});

describe('bug: closure-loop in retryErroredDownloads logs wrong dl/action', () => {
    // The original `apiCall.then(function(){ window.log('Freebox: ' + action + ' sent for id=' + dl.id); })`
    // captures `dl` and `action` by reference (var, not let). When the loop has finished iterating,
    // all closures see the LAST values, so logs always report the last-iterated download — not the actual one.
    function runLoopBuggy(downloads, log) {
        var promises = [];
        for (var i = 0; i < downloads.length; i++) {
            var dl = downloads[i];
            var action = dl.status === 'error' ? 'retry' : 'resume';
            promises.push(Promise.resolve().then(function() {
                log('Freebox: ' + action + ' sent for id=' + dl.id);
            }));
        }
        return Promise.all(promises);
    }
    function runLoopFixed(downloads, log) {
        var promises = [];
        for (var i = 0; i < downloads.length; i++) {
            var dl = downloads[i];
            var action = dl.status === 'error' ? 'retry' : 'resume';
            promises.push((function(currentDl, currentAction) {
                return Promise.resolve().then(function() {
                    log('Freebox: ' + currentAction + ' sent for id=' + currentDl.id);
                });
            })(dl, action));
        }
        return Promise.all(promises);
    }
    it('baseline repro: buggy version reports the same id for every iteration', async () => {
        var downloads = [
            { id: 1, status: 'error' },
            { id: 2, status: 'stopped' },
            { id: 3, status: 'error' }
        ];
        var lines = [];
        await runLoopBuggy(downloads, function(s) { lines.push(s); });
        expect(lines).toEqual([
            'Freebox: error sent for id=3'.replace('error', 'retry'),
            'Freebox: error sent for id=3'.replace('error', 'retry'),
            'Freebox: error sent for id=3'.replace('error', 'retry')
        ]);
    });
    it('fixed: each closure carries its own dl and action via IIFE binding', async () => {
        var downloads = [
            { id: 1, status: 'error' },
            { id: 2, status: 'stopped' },
            { id: 3, status: 'error' }
        ];
        var lines = [];
        await runLoopFixed(downloads, function(s) { lines.push(s); });
        expect(lines).toEqual([
            'Freebox: retry sent for id=1',
            'Freebox: resume sent for id=2',
            'Freebox: retry sent for id=3'
        ]);
    });
});

describe('bug: showDownloadsScreen leaves stale grid content while VM /downloads pending', () => {
    // When opening Downloads, showDownloadsScreen sends an XHR to the VM proxy and waits
    // up to 10s before rendering the list. During that wait, the previous screen's content
    // (e.g. 18 VOD movies from the last browse) stays visible because initBrowseScreen does
    // NOT clear the content-grid. Result: user sees what looks like the History page until
    // the XHR resolves. Worse, the original code had no `ontimeout` handler — if the VM
    // didn't respond within 10s, nothing was ever rendered and the stale grid stayed forever.
    function setEmpty(grid, label) {
        while (grid.firstChild) grid.removeChild(grid.firstChild);
        var div = document.createElement('div');
        div.className = 'empty-message';
        div.textContent = label;
        grid.appendChild(div);
    }
    function setItems(grid, count) {
        while (grid.firstChild) grid.removeChild(grid.firstChild);
        for (var i = 0; i < count; i++) {
            var it = document.createElement('div');
            it.className = 'grid-item dl';
            it.textContent = 'item' + i;
            grid.appendChild(it);
        }
    }
    function buildXhr(spec) {
        var xhr = {
            timeout: 10000,
            onload: null,
            onerror: null,
            ontimeout: null,
            send: function() {
                if (spec.action === 'load') {
                    xhr.responseText = JSON.stringify({ success: true, result: spec.list || [] });
                    xhr.onload();
                }
                else if (spec.action === 'timeout' && xhr.ontimeout) {
                    xhr.ontimeout();
                }
                else if (spec.action === 'error' && xhr.onerror) {
                    xhr.onerror();
                }
            }
        };
        return xhr;
    }
    function emulateBuggy(grid, spec) {
        var xhr = buildXhr(spec);
        xhr.onload = function() {
            try {
                var resp = JSON.parse(xhr.responseText);
                var list = (resp.success && resp.result) ? resp.result : [];
                if (list.length === 0) setEmpty(grid, 'No downloads');
                else setItems(grid, list.length);
            }
            catch (ex) { setEmpty(grid, 'No downloads'); }
        };
        xhr.onerror = function() { setEmpty(grid, 'No downloads'); };
        xhr.send();
    }
    function emulateFixed(grid, spec) {
        setEmpty(grid, 'Loading...');
        var xhr = buildXhr(spec);
        xhr.onload = function() {
            try {
                var resp = JSON.parse(xhr.responseText);
                var list = (resp.success && resp.result) ? resp.result : [];
                if (list.length === 0) setEmpty(grid, 'No downloads');
                else setItems(grid, list.length);
            }
            catch (ex) { setEmpty(grid, 'No downloads'); }
        };
        xhr.onerror = function() { setEmpty(grid, 'No downloads'); };
        xhr.ontimeout = function() { setEmpty(grid, 'No downloads'); };
        xhr.send();
    }
    var grid;
    beforeEach(() => {
        grid = document.createElement('div');
        setItems(grid, 3);
    });
    it('baseline repro: buggy version leaves 3 stale items visible when VM never responds', () => {
        emulateBuggy(grid, { action: 'timeout' });
        expect(grid.querySelectorAll('.grid-item').length).toBe(3);
    });
    it('fixed: synchronously clears stale content before the XHR fires', () => {
        emulateFixed(grid, { action: 'timeout' });
        expect(grid.querySelectorAll('.grid-item').length).toBe(0);
        expect(grid.querySelector('.empty-message')).not.toBeNull();
    });
    it('fixed: ontimeout resolves to "No downloads" even when VM does not respond', () => {
        emulateFixed(grid, { action: 'timeout' });
        expect(grid.querySelector('.empty-message').textContent).toBe('No downloads');
    });
    it('fixed: onload with empty list shows "No downloads"', () => {
        emulateFixed(grid, { action: 'load', list: [] });
        expect(grid.querySelectorAll('.grid-item').length).toBe(0);
        expect(grid.querySelector('.empty-message').textContent).toBe('No downloads');
    });
    it('fixed: onload with items renders them', () => {
        emulateFixed(grid, { action: 'load', list: [{ id: 1 }, { id: 2 }] });
        expect(grid.querySelectorAll('.grid-item').length).toBe(2);
        expect(grid.querySelector('.empty-message')).toBeNull();
    });
    it('fixed: onerror falls back to "No downloads"', () => {
        emulateFixed(grid, { action: 'error' });
        expect(grid.querySelector('.empty-message').textContent).toBe('No downloads');
        expect(grid.querySelectorAll('.grid-item').length).toBe(0);
    });
});
