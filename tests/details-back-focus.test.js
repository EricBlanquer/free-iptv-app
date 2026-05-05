/**
 * Regression test for: returning from details lands focus on the wrong movie
 * when the virtual-DOM scroll has shifted between click and back.
 *
 * Strategy: lastGridIndex is treated as a hint. We verify the stream at that
 * position by streamId. If it's the right one, no DOM disruption. If the
 * window shifted (pagination/trim) but the stream is still in the DOM, we
 * re-index without rebuilding. Only when the stream is not in the DOM do we
 * call _jumpToIndex (which rebuilds the DOM and is the only invasive path).
 *
 * The handler default branch is duplicated below — keep it in sync with
 * js/core/handlers.js screen:details handler.
 */

window.log = jest.fn();

function IPTVApp() {}

function detailsBackHandler() {
    var needsResort = this._titleOverrideDirty;
    this._titleOverrideDirty = false;
    var focusedStreamId = this.selectedStream && this.selectedStream.id;
    this.showScreen('browse');
    this.currentScreen = 'browse';
    this.focusArea = 'grid';
    if (needsResort && this.applyFilters) {
        this.applyFilters();
    }
    this.focusIndex = this.lastGridIndex || 0;
    var rebuiltDom = false;
    if (focusedStreamId) {
        var focusables = this.getFocusables();
        var hint = focusables[this.focusIndex];
        if (hint && hint.dataset && hint.dataset.streamId == focusedStreamId) {
            // lastGridIndex still valid — nothing to do.
        } else {
            var foundInDom = -1;
            for (var fi = 0; fi < focusables.length; fi++) {
                var f = focusables[fi];
                if (f && f.dataset && f.dataset.streamId == focusedStreamId) {
                    foundInDom = fi;
                    break;
                }
            }
            if (foundInDom >= 0) {
                this.focusIndex = foundInDom;
                this.lastGridIndex = foundInDom;
            } else if (this.currentStreams) {
                var targetIndex = -1;
                for (var ci = 0; ci < this.currentStreams.length; ci++) {
                    var s = this.currentStreams[ci];
                    var sid = s.stream_id || s.vod_id || s.series_id;
                    if (sid == focusedStreamId) {
                        targetIndex = ci;
                        break;
                    }
                }
                if (targetIndex >= 0) {
                    this._jumpToIndex(targetIndex);
                    this.lastGridIndex = this.focusIndex;
                    rebuiltDom = true;
                }
            }
        }
    }
    this._programmaticScroll = true;
    this.updateGridProgress();
    this.updateFocus();
    var selfPS = this;
    setTimeout(function() { selfPS._programmaticScroll = false; }, 200);
    return { rebuiltDom: rebuiltDom };
}

function makeFocusableEl(streamId) {
    var el = document.createElement('div');
    el.className = 'grid-item focusable';
    el.dataset.streamId = String(streamId);
    return el;
}

function clearGrid() {
    var grid = document.getElementById('content-grid');
    if (grid) while (grid.firstChild) grid.removeChild(grid.firstChild);
}

describe('screen:details back handler — focus restoration', function() {
    var app;

    beforeEach(function() {
        var existing = document.getElementById('content-grid');
        if (!existing) {
            var grid = document.createElement('div');
            grid.id = 'content-grid';
            document.body.appendChild(grid);
        } else {
            clearGrid();
        }
        app = new IPTVApp();
        app._titleOverrideDirty = false;
        app.lastGridIndex = 0;
        app.focusIndex = 0;
        app.showScreen = jest.fn();
        app._jumpToIndex = jest.fn(function(idx) {
            app._lastJumpTarget = idx;
            app.focusIndex = 0;
        });
        app.updateGridProgress = jest.fn();
        app.updateFocus = jest.fn();
        app.applyFilters = jest.fn();
        app.getFocusables = function() {
            return Array.prototype.slice.call(document.querySelectorAll('#content-grid .grid-item'));
        };
    });

    function populateDom(streamIds) {
        var grid = document.getElementById('content-grid');
        for (var i = 0; i < streamIds.length; i++) {
            grid.appendChild(makeFocusableEl(streamIds[i]));
        }
    }

    it('common case: lastGridIndex still points to selected stream — no DOM rebuild', function() {
        populateDom([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
        app.lastGridIndex = 7;
        app.selectedStream = { id: '17' };
        app.currentStreams = [];
        for (var i = 10; i < 20; i++) app.currentStreams.push({ stream_id: i });

        var r = detailsBackHandler.call(app);

        expect(r.rebuiltDom).toBe(false);
        expect(app._jumpToIndex).not.toHaveBeenCalled();
        expect(app.focusIndex).toBe(7);
    });

    it('window shifted but stream still in DOM: re-index without rebuilding', function() {
        // Simulates pagination prepending items: stream that was at lastGridIndex=7
        // is now at index 12 in the focusables list.
        populateDom([0, 1, 2, 3, 4, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
        app.lastGridIndex = 7;
        app.selectedStream = { id: '17' };
        app.currentStreams = [];
        for (var i = 0; i < 20; i++) app.currentStreams.push({ stream_id: i });

        var r = detailsBackHandler.call(app);

        expect(r.rebuiltDom).toBe(false);
        expect(app._jumpToIndex).not.toHaveBeenCalled();
        expect(app.focusIndex).toBe(12);
        expect(app.lastGridIndex).toBe(12);
    });

    it('stream is far away (not in DOM): jump rebuilds DOM', function() {
        populateDom([0, 1, 2, 3, 4]);
        app.lastGridIndex = 0;
        app.selectedStream = { id: '42' };
        app.currentStreams = [];
        for (var i = 0; i < 60; i++) app.currentStreams.push({ stream_id: i });

        var r = detailsBackHandler.call(app);

        expect(r.rebuiltDom).toBe(true);
        expect(app._jumpToIndex).toHaveBeenCalledWith(42);
    });

    it('stream is no longer in currentStreams: fall back to lastGridIndex (no crash)', function() {
        populateDom([0, 1, 2]);
        app.lastGridIndex = 1;
        app.selectedStream = { id: '999' };
        app.currentStreams = [{ stream_id: 0 }, { stream_id: 1 }, { stream_id: 2 }];

        var r = detailsBackHandler.call(app);

        expect(r.rebuiltDom).toBe(false);
        expect(app._jumpToIndex).not.toHaveBeenCalled();
        expect(app.focusIndex).toBe(1);
    });

    it('handles number vs string id mismatch (== loose equality)', function() {
        populateDom([5, 7, 11]);
        app.lastGridIndex = 0;
        app.selectedStream = { id: '7' };
        app.currentStreams = [{ stream_id: 5 }, { stream_id: 7 }, { stream_id: 11 }];

        var r = detailsBackHandler.call(app);

        expect(app.focusIndex).toBe(1);
        expect(r.rebuiltDom).toBe(false);
    });

    it('still applies filters first when title-override changed', function() {
        populateDom([1, 2]);
        app.lastGridIndex = 0;
        app.selectedStream = { id: '2' };
        app._titleOverrideDirty = true;
        app.currentStreams = [{ stream_id: 1 }, { stream_id: 2 }];

        detailsBackHandler.call(app);

        expect(app.applyFilters).toHaveBeenCalledTimes(1);
    });

    it('clears the dirty flag after handling', function() {
        populateDom([]);
        app.selectedStream = { id: '999' };
        app._titleOverrideDirty = true;

        detailsBackHandler.call(app);

        expect(app._titleOverrideDirty).toBe(false);
    });

    it('sets _programmaticScroll during restoration so the grid scroll listener does not overwrite focus (regression: Tizen)', function() {
        // Tizen fires a scroll event when the browse screen is shown after
        // details. The grid's scroll listener (initGridScrollLoader at
        // browse.js:3098) would otherwise recompute focusIndex from the first
        // visible row (= firstVisibleRow * cols) and clobber our streamId-based
        // restoration. The same _programmaticScroll guard is used by
        // changeChannel for live TV.
        populateDom([10, 11, 12, 13, 14, 15, 16, 17]);
        app.lastGridIndex = 7;
        app.selectedStream = { id: '17' };
        app.currentStreams = [];
        for (var i = 10; i < 18; i++) app.currentStreams.push({ stream_id: i });

        detailsBackHandler.call(app);

        expect(app._programmaticScroll).toBe(true);
    });

    it('clears _programmaticScroll after a delay so future user scrolls work normally', function(done) {
        populateDom([1, 2, 3]);
        app.lastGridIndex = 0;
        app.selectedStream = { id: '1' };
        app.currentStreams = [{ stream_id: 1 }, { stream_id: 2 }, { stream_id: 3 }];

        detailsBackHandler.call(app);

        expect(app._programmaticScroll).toBe(true);
        setTimeout(function() {
            expect(app._programmaticScroll).toBe(false);
            done();
        }, 250);
    });
});
