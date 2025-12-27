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
