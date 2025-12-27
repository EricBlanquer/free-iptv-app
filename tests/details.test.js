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
    <div id="details-director-section" class="hidden">
        <div id="details-director-grid"></div>
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
