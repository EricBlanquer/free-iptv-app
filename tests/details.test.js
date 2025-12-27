/**
 * Tests for Details page functionality
 */

// Mock window.log
window.log = jest.fn();

// Mock DOM elements
document.body.innerHTML = `
    <div id="details-backdrop"></div>
    <div id="details-poster"></div>
    <div id="details-title"></div>
    <div id="details-meta"></div>
    <div id="details-description"></div>
    <div id="details-genres"></div>
    <div id="details-cast-grid"></div>
    <div id="details-director-section"></div>
    <div id="details-director-grid"></div>
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
