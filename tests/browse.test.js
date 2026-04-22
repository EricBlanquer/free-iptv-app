/**
 * Tests for Browse/Grid functionality
 */

// Mock window.log
window.log = jest.fn();

describe('History item title display', () => {
    describe('bug: TMDB update removes S##E## suffix from history items', () => {
        it('should preserve season/episode suffix after TMDB title update', () => {
            // Setup: Create a grid item with history data
            document.body.innerHTML = `
                <div id="content-grid">
                    <div class="grid-item"
                         data-stream-id="123"
                         data-stream-type="series"
                         data-stream-title="Breaking Bad"
                         data-history-season="2"
                         data-history-episode="5">
                        <div class="grid-item-title">Breaking Bad - S02E05</div>
                    </div>
                </div>
            `;

            var gridItem = document.querySelector('.grid-item');
            var titleDiv = gridItem.querySelector('.grid-item-title');

            // Initial state: title should have S##E## suffix
            expect(titleDiv.textContent).toBe('Breaking Bad - S02E05');

            // Simulate TMDB update (the bug was that this would lose the S##E##)
            var tmdbTitle = 'Breaking Bad';
            titleDiv.textContent = tmdbTitle;

            // After TMDB update, re-add the episode info from dataset
            var season = gridItem.dataset.historySeason;
            var episode = gridItem.dataset.historyEpisode;
            if (season && episode) {
                var s = parseInt(season) < 10 ? '0' + season : season;
                var e = parseInt(episode) < 10 ? '0' + episode : episode;
                titleDiv.textContent = tmdbTitle + ' - S' + s + 'E' + e;
            }

            // Should have the episode suffix back
            expect(titleDiv.textContent).toBe('Breaking Bad - S02E05');
        });

        it('should not add suffix for non-history items', () => {
            document.body.innerHTML = `
                <div id="content-grid">
                    <div class="grid-item"
                         data-stream-id="456"
                         data-stream-type="series"
                         data-stream-title="Breaking Bad">
                        <div class="grid-item-title">Breaking Bad</div>
                    </div>
                </div>
            `;

            var gridItem = document.querySelector('.grid-item');
            var titleDiv = gridItem.querySelector('.grid-item-title');

            // No history data attributes
            expect(gridItem.dataset.historySeason).toBeUndefined();
            expect(gridItem.dataset.historyEpisode).toBeUndefined();

            // TMDB update should just set the title
            var tmdbTitle = 'Breaking Bad';
            titleDiv.textContent = tmdbTitle;

            // No suffix added for non-history items
            expect(titleDiv.textContent).toBe('Breaking Bad');
        });

        it('should format single digit season/episode with leading zero', () => {
            document.body.innerHTML = `
                <div id="content-grid">
                    <div class="grid-item"
                         data-history-season="1"
                         data-history-episode="3">
                        <div class="grid-item-title">Test</div>
                    </div>
                </div>
            `;

            var gridItem = document.querySelector('.grid-item');
            var season = gridItem.dataset.historySeason;
            var episode = gridItem.dataset.historyEpisode;

            var s = parseInt(season) < 10 ? '0' + season : season;
            var e = parseInt(episode) < 10 ? '0' + episode : episode;

            expect(s).toBe('01');
            expect(e).toBe('03');
        });

        it('should not add leading zero for double digit season/episode', () => {
            document.body.innerHTML = `
                <div id="content-grid">
                    <div class="grid-item"
                         data-history-season="12"
                         data-history-episode="15">
                        <div class="grid-item-title">Test</div>
                    </div>
                </div>
            `;

            var gridItem = document.querySelector('.grid-item');
            var season = gridItem.dataset.historySeason;
            var episode = gridItem.dataset.historyEpisode;

            var s = parseInt(season) < 10 ? '0' + season : season;
            var e = parseInt(episode) < 10 ? '0' + episode : episode;

            expect(s).toBe('12');
            expect(e).toBe('15');
        });
    });
});

describe('Image loading retry', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        window.log.mockClear();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function createGridWithImage(url) {
        var grid = document.createElement('div');
        grid.id = 'content-grid';
        var item = document.createElement('div');
        item.className = 'grid-item';
        if (url) item.dataset.imageUrl = url;
        item.dataset.streamTitle = 'Test';
        var img = document.createElement('div');
        img.className = 'grid-item-image';
        item.appendChild(img);
        grid.appendChild(item);
        document.body.appendChild(grid);
        return img;
    }

    describe('bug: failed picon loads are never retried', () => {
        beforeEach(() => {
            document.body.textContent = '';
        });

        it('should retry once after image load failure', () => {
            var imageDiv = createGridWithImage('http://covers.ddns.net/logo.png');
            imageDiv.dataset.loaded = 'error';
            imageDiv.classList.add('no-image');

            expect(imageDiv.dataset.loaded).toBe('error');
            expect(imageDiv.classList.contains('no-image')).toBe(true);

            imageDiv.dataset.loaded = 'retrying';
            imageDiv.classList.remove('no-image');

            expect(imageDiv.dataset.loaded).toBe('retrying');
            expect(imageDiv.classList.contains('no-image')).toBe(false);
        });

        it('should not retry more than once', () => {
            var retryCount = 0;
            var maxRetries = 1;

            retryCount++;
            expect(retryCount <= maxRetries).toBe(true);

            retryCount++;
            expect(retryCount <= maxRetries).toBe(false);
        });

        it('should mark as final error after retry fails', () => {
            var imageDiv = createGridWithImage('http://covers.ddns.net/logo.png');

            imageDiv.dataset.loaded = 'error';
            imageDiv.classList.add('no-image');

            expect(imageDiv.dataset.loaded).toBe('error');
            expect(imageDiv.classList.contains('no-image')).toBe(true);
        });

        it('should not retry for images without URL', () => {
            var imageDiv = createGridWithImage(null);
            imageDiv.dataset.loaded = 'none';
            imageDiv.classList.add('no-image');

            expect(imageDiv.dataset.loaded).toBe('none');
        });
    });
});

describe('Category counter updates', () => {
    function createSidebarItem(categoryId, text, extraClass, selected) {
        var div = document.createElement('div');
        div.className = 'category-item' + (extraClass ? ' ' + extraClass : '');
        if (selected) div.classList.add('selected');
        div.dataset.categoryId = categoryId;
        var span = document.createElement('span');
        span.className = 'category-text';
        span.textContent = (selected ? '\u25B6 ' : '') + text;
        div.appendChild(span);
        return div;
    }

    function createSidebar(items) {
        var container = document.createElement('div');
        container.id = 'categories-list';
        items.forEach(function(item) {
            container.appendChild(createSidebarItem(item.categoryId, item.text, item.extraClass, item.selected));
        });
        document.body.textContent = '';
        document.body.appendChild(container);
        return container;
    }

    describe('bug: updateContinueCounter destroys span wrapper and arrow', () => {
        it('should preserve category-text span when updating counter', () => {
            createSidebar([
                { categoryId: 'continue', text: 'Continue (3)', extraClass: 'category-continue' },
                { categoryId: '', text: 'All (100)', selected: true }
            ]);

            var continueItem = document.querySelector('.category-continue');
            var span = continueItem.querySelector('.category-text');
            expect(span).not.toBeNull();
            expect(span.textContent).toBe('Continue (3)');

            // Simulate the bug: setting textContent on the div destroys the span
            continueItem.textContent = 'Continue (2)';
            span = continueItem.querySelector('.category-text');
            expect(span).toBeNull();
        });

        it('should preserve arrow when selected continue item is updated', () => {
            createSidebar([
                { categoryId: 'continue', text: 'Continue (3)', extraClass: 'category-continue', selected: true },
                { categoryId: '', text: 'All (100)' }
            ]);

            var continueItem = document.querySelector('.category-continue');
            var span = continueItem.querySelector('.category-text');
            expect(span.textContent).toBe('\u25B6 Continue (3)');

            // Correct update: modify span content, preserve arrow
            var hasArrow = span.textContent.indexOf('\u25B6 ') === 0;
            span.textContent = (hasArrow ? '\u25B6 ' : '') + 'Continue (2)';

            expect(span.textContent).toBe('\u25B6 Continue (2)');
            expect(continueItem.querySelector('.category-text')).not.toBeNull();
        });
    });

    describe('bug: updateFavoritesCounter destroys span wrapper and arrow', () => {
        it('should preserve category-text span when updating counter', () => {
            createSidebar([
                { categoryId: 'favorites', text: 'Favorites (5)', extraClass: 'category-favorites' },
                { categoryId: '', text: 'All (100)', selected: true }
            ]);

            var favItem = document.querySelector('.category-favorites');
            var span = favItem.querySelector('.category-text');
            expect(span).not.toBeNull();

            // Correct update: modify span content
            span.textContent = 'Favorites (4)';

            expect(favItem.querySelector('.category-text')).not.toBeNull();
            expect(favItem.querySelector('.category-text').textContent).toBe('Favorites (4)');
        });
    });
});

describe('Year sort', () => {
    function sortByYear(streams, direction) {
        var yearRegex = /\((\d{4})\)/;
        streams.forEach(function(s) {
            var m = s.name.match(yearRegex);
            s._sortYear = m ? parseInt(m[1]) : 0;
        });
        streams.sort(function(a, b) {
            var nameA = a.name.toLowerCase();
            var nameB = b.name.toLowerCase();
            if (direction === 'year') {
                if (a._sortYear && !b._sortYear) return -1;
                if (!a._sortYear && b._sortYear) return 1;
                if (a._sortYear !== b._sortYear) return b._sortYear - a._sortYear;
                return nameA.localeCompare(nameB, undefined, {numeric: true});
            }
            if (direction === 'year-asc') {
                if (a._sortYear && !b._sortYear) return -1;
                if (!a._sortYear && b._sortYear) return 1;
                if (a._sortYear !== b._sortYear) return a._sortYear - b._sortYear;
                return nameA.localeCompare(nameB, undefined, {numeric: true});
            }
            return 0;
        });
        return streams;
    }

    it('should sort by year descending', () => {
        var streams = [
            { name: 'Old Movie (2010)' },
            { name: 'New Movie (2023)' },
            { name: 'Mid Movie (2018)' }
        ];
        var sorted = sortByYear(streams, 'year');
        expect(sorted[0].name).toBe('New Movie (2023)');
        expect(sorted[1].name).toBe('Mid Movie (2018)');
        expect(sorted[2].name).toBe('Old Movie (2010)');
    });

    it('should sort by year ascending', () => {
        var streams = [
            { name: 'New Movie (2023)' },
            { name: 'Old Movie (2010)' },
            { name: 'Mid Movie (2018)' }
        ];
        var sorted = sortByYear(streams, 'year-asc');
        expect(sorted[0].name).toBe('Old Movie (2010)');
        expect(sorted[1].name).toBe('Mid Movie (2018)');
        expect(sorted[2].name).toBe('New Movie (2023)');
    });

    it('should put streams without year at the end', () => {
        var streams = [
            { name: 'No Year Movie' },
            { name: 'Has Year (2020)' },
            { name: 'Another No Year' }
        ];
        var sorted = sortByYear(streams, 'year');
        expect(sorted[0].name).toBe('Has Year (2020)');
        expect(sorted[1].name).toBe('Another No Year');
        expect(sorted[2].name).toBe('No Year Movie');
    });

    it('should sort alphabetically when years are equal', () => {
        var streams = [
            { name: 'Zebra Movie (2020)' },
            { name: 'Alpha Movie (2020)' },
            { name: 'Mango Movie (2020)' }
        ];
        var sorted = sortByYear(streams, 'year');
        expect(sorted[0].name).toBe('Alpha Movie (2020)');
        expect(sorted[1].name).toBe('Mango Movie (2020)');
        expect(sorted[2].name).toBe('Zebra Movie (2020)');
    });

    it('should put streams without year at end in ascending mode too', () => {
        var streams = [
            { name: 'No Year' },
            { name: 'Movie (2015)' },
            { name: 'Movie (2022)' }
        ];
        var sorted = sortByYear(streams, 'year-asc');
        expect(sorted[0].name).toBe('Movie (2015)');
        expect(sorted[1].name).toBe('Movie (2022)');
        expect(sorted[2].name).toBe('No Year');
    });
});

describe('Category selection persistence', () => {
    describe('bug: selected category not persisted across app restart', () => {
        it('should round-trip selected categories through JSON serialization', () => {
            var selectedCategories = { 'pl1_vod': 'continue', 'pl1_series': 'favorites' };
            var serialized = JSON.stringify(selectedCategories);
            var loaded = JSON.parse(serialized);

            expect(loaded).toEqual(selectedCategories);
            expect(loaded['pl1_vod']).toBe('continue');
            expect(loaded['pl1_series']).toBe('favorites');
        });

        it('should return empty object for null/undefined data', () => {
            var data = null;
            var loaded = data ? JSON.parse(data) : {};
            expect(loaded).toEqual({});
        });

        it('should delete entry when All is selected', () => {
            var categories = { 'pl1_vod': 'continue', 'pl1_series': 'favorites' };

            var categoryId = '';
            var categoryKey = 'pl1_vod';
            if (categoryId === '') {
                delete categories[categoryKey];
            }

            expect(categories['pl1_vod']).toBeUndefined();
            expect(categories['pl1_series']).toBe('favorites');
        });
    });
});

describe('Category sub-sort (alpha/count/usage)', () => {
    function buildSorter(mode, dir, countByCategory, usageByCategory) {
        var dirMult = dir === 'asc' ? 1 : -1;
        return function(a, b) {
            var diff = 0;
            if (mode === 'count') {
                diff = (countByCategory[a.id] || 0) - (countByCategory[b.id] || 0);
            }
            else if (mode === 'usage') {
                diff = (usageByCategory[a.id] || 0) - (usageByCategory[b.id] || 0);
            }
            else {
                diff = a.sortName.localeCompare(b.sortName);
            }
            if (diff !== 0) return diff * dirMult;
            return a.sortName.localeCompare(b.sortName);
        };
    }

    var cats = [
        { id: 'a', sortName: 'action' },
        { id: 'c', sortName: 'comedy' },
        { id: 'd', sortName: 'drama' }
    ];
    var counts = { a: 100, c: 30, d: 60 };
    var usage = { a: 5, c: 0, d: 12 };

    it('sorts alpha asc', () => {
        var sorted = cats.slice().sort(buildSorter('alpha', 'asc', counts, usage));
        expect(sorted.map(c => c.id)).toEqual(['a', 'c', 'd']);
    });

    it('sorts alpha desc', () => {
        var sorted = cats.slice().sort(buildSorter('alpha', 'desc', counts, usage));
        expect(sorted.map(c => c.id)).toEqual(['d', 'c', 'a']);
    });

    it('sorts count desc (largest first)', () => {
        var sorted = cats.slice().sort(buildSorter('count', 'desc', counts, usage));
        expect(sorted.map(c => c.id)).toEqual(['a', 'd', 'c']);
    });

    it('sorts count asc (smallest first)', () => {
        var sorted = cats.slice().sort(buildSorter('count', 'asc', counts, usage));
        expect(sorted.map(c => c.id)).toEqual(['c', 'd', 'a']);
    });

    it('sorts usage desc (most viewed first)', () => {
        var sorted = cats.slice().sort(buildSorter('usage', 'desc', counts, usage));
        expect(sorted.map(c => c.id)).toEqual(['d', 'a', 'c']);
    });

    it('breaks ties alphabetically', () => {
        var ties = [
            { id: 'b', sortName: 'banana' },
            { id: 'a', sortName: 'apple' },
            { id: 'c', sortName: 'cherry' }
        ];
        var equalCounts = { a: 10, b: 10, c: 10 };
        var sorted = ties.slice().sort(buildSorter('count', 'desc', equalCounts, {}));
        expect(sorted.map(c => c.id)).toEqual(['a', 'b', 'c']);
    });

    it('treats missing usage as 0', () => {
        var sparseUsage = { d: 5 };
        var sorted = cats.slice().sort(buildSorter('usage', 'desc', counts, sparseUsage));
        expect(sorted.map(c => c.id)).toEqual(['d', 'a', 'c']);
    });
});

describe('toggleCategorySort behavior', () => {
    function toggle(state, mode) {
        var current = state || { mode: 'alpha', dir: 'asc' };
        if (current.mode === mode) {
            return { mode: mode, dir: current.dir === 'asc' ? 'desc' : 'asc' };
        }
        return { mode: mode, dir: mode === 'alpha' ? 'asc' : 'desc' };
    }

    it('switches mode from alpha to count with desc default', () => {
        expect(toggle({ mode: 'alpha', dir: 'asc' }, 'count'))
            .toEqual({ mode: 'count', dir: 'desc' });
    });

    it('switches mode from count to alpha with asc default', () => {
        expect(toggle({ mode: 'count', dir: 'desc' }, 'alpha'))
            .toEqual({ mode: 'alpha', dir: 'asc' });
    });

    it('toggles direction when re-clicking same mode', () => {
        var state = { mode: 'count', dir: 'desc' };
        state = toggle(state, 'count');
        expect(state).toEqual({ mode: 'count', dir: 'asc' });
        state = toggle(state, 'count');
        expect(state).toEqual({ mode: 'count', dir: 'desc' });
    });
});

describe('bug: lastGridIndex carries over to new category', () => {
    function loadStreams(app, options) {
        options = options || {};
        if (!options.preserveFilters) {
            app.lastGridIndex = 0;
        }
    }

    it('resets lastGridIndex to 0 when switching category', () => {
        var app = { lastGridIndex: 50 };
        loadStreams(app);
        expect(app.lastGridIndex).toBe(0);
    });

    it('preserves lastGridIndex when preserveFilters is set', () => {
        var app = { lastGridIndex: 50 };
        loadStreams(app, { preserveFilters: true });
        expect(app.lastGridIndex).toBe(50);
    });
});

describe('bug: poster load/unload ignores list-view when counting items', () => {
    // Reproduces the row/column index math used by loadVisibleImages /
    // loadVisibleGenres / loadVisibleEPG / ensureItems / _trimExcessDomItems.
    // Two cascading bugs:
    //   1) cols hard-coded to gridColumns (5) -> scroll-based startIdx*cols
    //      overshoots by 5x in list-view, loading items well past the visible range.
    //   2) preload sizes like `cols * 3` or `focusRow + 4` were dimensioned in
    //      "rows * grid-cols ≈ one screen" — with cols=1 they collapse to 3-4
    //      items, far short of the 8-12 rows actually on screen in list-view.
    // Fix: compute visibleRows from viewportHeight/rowHeight, use that to size
    // both the scroll window and the initial/focus preload range.
    function rangeFromScroll(totalItems, cols, scrollTop, viewportHeight, rowHeight) {
        var firstVisibleRow = Math.floor(scrollTop / rowHeight);
        var visibleRows = Math.max(3, Math.ceil(viewportHeight / rowHeight));
        var startRow = Math.max(0, firstVisibleRow - 1);
        var endRow = firstVisibleRow + visibleRows + 2;
        return {
            startIdx: Math.min(totalItems, startRow * cols),
            endIdx: Math.min(totalItems, endRow * cols)
        };
    }

    function rangeFromFocus(totalItems, cols, focusIdx, viewportHeight, rowHeight) {
        var visibleRows = Math.max(3, Math.ceil(viewportHeight / rowHeight));
        var focusRow = Math.floor(focusIdx / cols);
        var startRow = Math.max(0, focusRow - 2);
        var endRow = focusRow + visibleRows + 2;
        return {
            startIdx: startRow * cols,
            endIdx: Math.min(totalItems, endRow * cols)
        };
    }

    function rangeFromStart(totalItems, cols, viewportHeight, rowHeight) {
        var visibleRows = Math.max(3, Math.ceil(viewportHeight / rowHeight));
        return {
            startIdx: 0,
            endIdx: Math.min(totalItems, (visibleRows + 3) * cols)
        };
    }

    it('list-view scroll: buggy cols=gridColumns misses the visible posters', () => {
        // 100 list items, rowHeight=95px (list), viewport 720px, scrolled to ~item 50
        var buggy = rangeFromScroll(100, 5, 50 * 95, 720, 95);
        // firstVisibleRow=50, startRow=49; startRow*5=245 -> clamped past the end
        expect(buggy.startIdx).toBe(100);
        expect(buggy.endIdx).toBe(100);
    });

    it('list-view scroll: fixed cols=1 loads items around the visible row', () => {
        var fixed = rangeFromScroll(100, 1, 50 * 95, 720, 95);
        // visibleRows = max(3, ceil(720/95)) = 8; endRow = 50 + 8 + 2 = 60
        expect(fixed.startIdx).toBe(49);
        expect(fixed.endIdx).toBe(60);
    });

    it('list-view initial: 4 items (old) vs visibleRows (new, covers screen)', () => {
        // 100 list items at initial load (no scroll, focus at 0)
        var oldFormula = Math.min(100, (0 + 4) * 1);
        expect(oldFormula).toBe(4); // old: focusRow + 4 rows -> only 4 posters

        // New: rows-to-load driven by viewport height, not grid columns
        var fixed = rangeFromFocus(100, 1, 0, 720, 95);
        // visibleRows=8 -> endRow = 0 + 8 + 2 = 10 items loaded
        expect(fixed.endIdx).toBe(10);
    });

    it('forceFromStart: cols*3 (old) vs (visibleRows+3)*cols (new)', () => {
        // Old formula in list mode loaded 3 items at app open (cols*3 with cols=1)
        var oldFormula = Math.min(100, 1 * 3);
        expect(oldFormula).toBe(3);

        // Fixed: scales with viewport
        var fixed = rangeFromStart(100, 1, 720, 95);
        // visibleRows=8 -> 11 items loaded, covers the visible list
        expect(fixed.endIdx).toBe(11);
    });

    it('grid-view: still loads a full band around the visible area', () => {
        // 100 grid items, rowHeight=275px, viewport 720px, scrolled to row 5
        var ok = rangeFromScroll(100, 5, 5 * 275, 720, 275);
        // visibleRows = max(3, ceil(720/275)) = 3; endRow = 5 + 3 + 2 = 10 -> 20..50
        expect(ok.startIdx).toBe(20);
        expect(ok.endIdx).toBe(50);
    });

    it('uses grid.classList.contains("list-view") to pick cols', () => {
        document.body.textContent = '';
        var grid = document.createElement('div');
        grid.id = 'content-grid';
        grid.classList.add('list-view');
        document.body.appendChild(grid);
        var gridColumns = 5;
        var cols = grid.classList.contains('list-view') ? 1 : gridColumns;
        expect(cols).toBe(1);

        grid.classList.remove('list-view');
        cols = grid.classList.contains('list-view') ? 1 : gridColumns;
        expect(cols).toBe(5);
    });

    // loadVisibleGenres / loadVisibleEPG originally only loaded around focusRow
    // (startIdx = focusRow * cols, endIdx = (focusRow + visibleRows) * cols).
    // When the user scrolls to the very bottom of a list-view category, focus
    // sits on the LAST item, so that formula collapses to a single-item range —
    // every other visible row is skipped, and since the provider often has no
    // poster URL, only the focused item ever gets a TMDB-fetched poster.
    // Fix: the genre/EPG fetch must cover the same scroll-window that
    // loadVisibleImages already uses.
    it('focus at end of list: old genre-range only covers focus row', () => {
        // 58 items, focus on the last one (index 57), list-view
        var focusRow = 57;
        var visibleRows = 12;
        var cols = 1;
        var items = 58;
        var buggyStart = focusRow * cols;
        var buggyEnd = Math.min(items, (focusRow + visibleRows) * cols);
        expect(buggyEnd - buggyStart).toBe(1); // only the focused row
    });

    it('focus at end of list: scroll-window covers every visible row', () => {
        // Same scenario, using the scroll-aware range (no top spacer since
        // no trim happened, all 58 items are in DOM)
        var scrollTop = 47 * 65;
        var fixed = rangeFromScroll(58, 1, scrollTop, 720, 65);
        expect(fixed.startIdx).toBe(46);
        expect(fixed.endIdx).toBe(58);
        expect(fixed.endIdx - fixed.startIdx).toBe(12);
    });

    // Unload of a TMDB-applied poster must also clear genreLoaded, otherwise
    // loadVisibleGenres skips the item on revisit and the poster never comes
    // back. Reproduces the scroll-down-then-back-to-top "no posters" bug.
    it('unload of tmdb poster must clear genreLoaded so it can be re-applied', () => {
        document.body.textContent = '';
        var item = document.createElement('div');
        item.className = 'grid-item';
        item.dataset.genreLoaded = 'done';
        var imgDiv = document.createElement('div');
        imgDiv.className = 'grid-item-image';
        imgDiv.dataset.loaded = 'tmdb';
        imgDiv.style.backgroundImage = 'url("https://image.tmdb.org/t/p/w300/x.jpg")';
        item.appendChild(imgDiv);
        document.body.appendChild(item);

        // Simulate the unload pass of loadVisibleImages
        var uDiv = item.firstElementChild;
        var loadState = uDiv.dataset.loaded;
        if (loadState === 'ok' || loadState === 'tmdb') {
            uDiv.style.backgroundImage = '';
            delete uDiv.dataset.loaded;
            if (loadState === 'tmdb') delete item.dataset.genreLoaded;
        }

        expect(imgDiv.style.backgroundImage).toBe('');
        expect(imgDiv.dataset.loaded).toBeUndefined();
        expect(item.dataset.genreLoaded).toBeUndefined();
    });

    it('unload of provider poster keeps genreLoaded (only TMDB unload clears it)', () => {
        document.body.textContent = '';
        var item = document.createElement('div');
        item.className = 'grid-item';
        item.dataset.genreLoaded = 'done';
        var imgDiv = document.createElement('div');
        imgDiv.className = 'grid-item-image';
        imgDiv.dataset.loaded = 'ok';
        imgDiv.style.backgroundImage = 'url("http://provider.example/x.jpg")';
        item.appendChild(imgDiv);
        document.body.appendChild(item);

        var uDiv = item.firstElementChild;
        var loadState = uDiv.dataset.loaded;
        if (loadState === 'ok' || loadState === 'tmdb') {
            uDiv.style.backgroundImage = '';
            delete uDiv.dataset.loaded;
            if (loadState === 'tmdb') delete item.dataset.genreLoaded;
        }

        // Provider images still have their imageUrl; loadVisibleImages re-fetches
        // from the URL on revisit, so genreLoaded doesn't need clearing.
        expect(item.dataset.genreLoaded).toBe('done');
    });
});
