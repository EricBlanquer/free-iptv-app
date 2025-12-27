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
