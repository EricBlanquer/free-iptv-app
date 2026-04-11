/**
 * Focus Manager Module
 * Handles keyboard navigation, focus state, and scrolling
 */

IPTVApp.prototype._isKeyRepeat = function(keyCode) {
    var now = Date.now();
    if (this._lastKeyCode === keyCode && now - this._lastKeyTime < 300) {
        this._lastKeyTime = now;
        return true;
    }
    this._lastKeyCode = keyCode;
    this._lastKeyTime = now;
    return false;
};

IPTVApp.prototype.bindKeys = function() {
    var self = this;
    if (/Android/.test(navigator.userAgent)) {
        var backBtn = document.createElement('div');
        backBtn.id = 'android-back-btn';
        backBtn.style.display = 'flex';
        var icon = document.createElement('span');
        icon.className = 'material-symbols-outlined';
        icon.textContent = 'arrow_back';
        backBtn.appendChild(icon);
        document.body.appendChild(backBtn);
    }
    document.addEventListener('keydown', function(e) {
        var key = e.keyCode;
        var activeEl = document.activeElement;
        var isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
        if (isInput) {
            if (key === 38 || key === 40 || key === 10009) {
                activeEl.blur();
                if (key === 38) {
                    var gridItems = document.querySelectorAll('#content-grid .grid-item');
                    if (gridItems.length > 0) {
                        self.focusArea = 'grid';
                        self.focusIndex = 0;
                        self.updateFocus();
                    }
                    return;
                }
            } else if (key === 37) {
                if (activeEl.selectionStart > 0) {
                    return;
                }
                activeEl.blur();
                self.navigate('left');
                return;
            } else if (key === 39) {
                if (activeEl.selectionStart < activeEl.value.length) {
                    return;
                }
                activeEl.blur();
                self.navigate('right');
                return;
            } else if (key === 13) {
                return;
            } else {
                return;
            }
        }
        switch (key) {
            case 37:
                if (self.currentScreen === 'guide') {
                    self.navigateGuide('left');
                } else if (self.currentScreen === 'catchup-modal') {
                    self.navigateCatchupModal('left');
                } else if (self.focusArea === 'sub-options') {
                    self.navigate('left');
                } else if (self.focusArea === 'tracks') {
                    self.navigate('left');
                } else if (self.currentScreen === 'player') {
                    if (self.playerTracksFocused) {
                        self.navigatePlayerTracks(-1);
                    } else if (self.currentPlayingType === 'live') {
                        self.showPlayerOverlay();
                        self.focusPlayerTracks();
                    } else {
                        self.startSeek(-1);
                    }
                } else {
                    self.navigate('left');
                }
                break;
            case 38:
                if (self.ttsVoiceModalOpen) {
                    self.ttsVoiceFocusIndex = Math.max(0, self.ttsVoiceFocusIndex - 1);
                    self.updateTTSVoiceFocus();
                } else if (self.currentScreen === 'guide') {
                    self.navigateGuide('up');
                } else if (self.currentScreen === 'catchup-modal') {
                    self.navigateCatchupModal('up');
                } else if (self.focusArea === 'sub-options') {
                    self.navigate('up');
                } else if (self.focusArea === 'tracks') {
                    self.navigate('up');
                } else if (self.currentScreen === 'player') {
                    if (self.playerTracksFocused) {
                        self.unfocusPlayerTracks();
                    } else if (self.currentPlayingType === 'live') {
                        self.showPlayerOverlay();
                        self.focusPlayerTracks();
                    } else {
                        self.showPlayerOverlay();
                    }
                } else {
                    self.navigate('up', e.repeat || self._isKeyRepeat(key));
                }
                break;
            case 39:
                if (self.currentScreen === 'guide') {
                    self.navigateGuide('right');
                } else if (self.currentScreen === 'catchup-modal') {
                    self.navigateCatchupModal('right');
                } else if (self.focusArea === 'sub-options') {
                    self.navigate('right');
                } else if (self.focusArea === 'tracks') {
                    self.navigate('right');
                } else if (self.currentScreen === 'player') {
                    if (self.playerTracksFocused) {
                        self.navigatePlayerTracks(1);
                    } else if (self.currentPlayingType === 'live') {
                        self.showPlayerOverlay();
                        self.focusPlayerTracks();
                    } else {
                        self.startSeek(1);
                    }
                } else {
                    self.navigate('right');
                }
                break;
            case 40:
                if (self.ttsVoiceModalOpen) {
                    var maxIdx = self.ttsVoiceItems ? self.ttsVoiceItems.length - 1 : 0;
                    self.ttsVoiceFocusIndex = Math.min(maxIdx, self.ttsVoiceFocusIndex + 1);
                    self.updateTTSVoiceFocus();
                } else if (self.currentScreen === 'guide') {
                    self.navigateGuide('down');
                } else if (self.currentScreen === 'catchup-modal') {
                    self.navigateCatchupModal('down');
                } else if (self.focusArea === 'sub-options') {
                    self.navigate('down');
                } else if (self.focusArea === 'tracks') {
                    self.navigate('down');
                } else if (self.currentScreen === 'player') {
                    self.handlePlayerDown();
                } else {
                    self.navigate('down');
                }
                break;
            case 13:
                if (self.ttsVoiceModalOpen) {
                    self.selectTTSVoice();
                } else if (self.currentScreen === 'guide') {
                    self.selectGuideProgram();
                } else if (self.currentScreen === 'catchup-modal') {
                    self.selectCatchupItem();
                } else if (self.focusArea === 'sub-options') {
                    self.handleSubtitleOption();
                } else if (self.focusArea === 'tracks') {
                    self.confirmTrackSelection();
                } else if (self.currentScreen === 'player') {
                    if (self.playerTracksFocused) {
                        self.selectPlayerTrack();
                    } else {
                        self.stopSeek();
                        self.player.togglePlayPause();
                        if (self.currentPlayingType === 'live') {
                            self.updatePlayerStateIndicator();
                            self.showPlayerOverlay();
                            self.focusPlayerTracks();
                        }
                        else {
                            self.showPlayerOverlay();
                        }
                    }
                } else {
                    self.select();
                }
                break;
            case 10009:
            case 8:
                self.stopSeek();
                self.goBack();
                break;
            case 32:
            case 415:
            case 10252:
                if (self.currentScreen === 'player') {
                    self.stopSeek();
                    self.player.togglePlayPause();
                    self.showPlayerOverlay();
                }
                break;
            case 413:
                if (self.currentScreen === 'player') {
                    self.stopSeek();
                    self.stopPlayback();
                }
                break;
            case 417:
                if (self.currentScreen === 'player') {
                    self.startSeek(1);
                }
                break;
            case 412:
                if (self.currentScreen === 'player') {
                    self.startSeek(-1);
                }
                break;
            case 427:
                if (self.currentScreen === 'player' && self.currentPlayingType === 'live') {
                    self.changeChannel(1);
                }
                break;
            case 428:
                if (self.currentScreen === 'player' && self.currentPlayingType === 'live') {
                    self.changeChannel(-1);
                }
                break;
            case 458:
                if (self.currentSection === 'live' || self.currentScreen === 'player') {
                    self.showTVGuide();
                }
                break;
        }
        e.preventDefault();
    });
    var lastClickTs = 0;
    document.addEventListener('click', function(e) {
        var ts = e.timeStamp;
        if (ts && ts === lastClickTs) return;
        lastClickTs = ts;
        if (e.target.classList.contains('modal') && !e.target.closest('.modal-content')) {
            self.goBack();
            return;
        }
        if (e.target.id === 'android-back-btn' || e.target.closest('#android-back-btn')) {
            if (self.currentScreen === 'player') {
                self.stopPlayback();
            }
            else {
                self.goBack();
            }
            return;
        }
        var containerToArea = [
            { id: 'resume-modal', area: 'modal' },
            { id: 'confirm-modal', area: 'confirm-modal' },
            { id: 'premium-modal', area: 'premium-modal' },
            { id: 'pattern-modal', area: 'pattern-modal' },
            { id: 'add-category-modal', area: 'add-category-modal' },
            { id: 'tracks-modal', area: 'tracks' },
            { id: 'tts-voice-modal', area: 'tts-voice-modal' },
            { id: 'playlist-selector', area: 'home' },
            { id: 'home-grid', area: 'home' },
            { id: 'continue-grid', area: 'continue' },
            { id: 'categories-list', area: 'sidebar' },
            { id: 'filters-bar', area: 'filters' },
            { id: 'content-grid', area: 'grid' },
            { id: 'details-screen', area: 'details' },
            { id: 'actor-screen', area: 'actor' },
            { id: 'settings-screen', area: 'settings' },
            { id: 'playlists-screen', area: 'playlists' },
            { id: 'playlist-edit-screen', area: 'playlist-edit' }
        ];
        var clickedArea = null;
        for (var ci = 0; ci < containerToArea.length; ci++) {
            var container = document.getElementById(containerToArea[ci].id);
            if (container && container.contains(e.target)) {
                clickedArea = containerToArea[ci].area;
                break;
            }
        }
        if (!clickedArea) return;
        var savedArea = self.focusArea;
        var savedIndex = self.focusIndex;
        self.focusArea = clickedArea;
        self.invalidateFocusables();
        var focusables = self.getFocusables();
        var clickedEl = null;
        var clickedIndex = -1;
        var closest = e.target.closest('.focusable');
        if (closest) {
            for (var fi = 0; fi < focusables.length; fi++) {
                if (focusables[fi] === closest) {
                    clickedEl = closest;
                    clickedIndex = fi;
                    break;
                }
            }
        }
        if (clickedIndex === -1) {
            for (var fi = 0; fi < focusables.length; fi++) {
                if (focusables[fi].contains(e.target) || focusables[fi] === e.target) {
                    clickedEl = focusables[fi];
                    clickedIndex = fi;
                    break;
                }
            }
        }
        if (clickedIndex === -1) {
            self.focusArea = savedArea;
            self.focusIndex = savedIndex;
            return;
        }
        self.focusIndex = clickedIndex;
        self.updateFocus();
        e.stopImmediatePropagation();
        self.select(clickedEl);
    });
    document.addEventListener('keyup', function(e) {
        var key = e.keyCode;
        if (key === 37 || key === 39 || key === 417 || key === 412) {
            if (self.currentScreen === 'player') {
                self.stopSeek();
            }
        }
    });
};

IPTVApp.prototype.scrollableTextNav = function(el, direction) {
    if (!el) return false;
    var isScrollable = el.scrollHeight > el.clientHeight + 2;
    if (!isScrollable) return false;
    var step = 60;
    if (direction === 'down') {
        var atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
        if (atBottom) return false;
        el.scrollTop += step;
        return true;
    }
    if (direction === 'up') {
        if (el.scrollTop <= 0) return false;
        el.scrollTop -= step;
        return true;
    }
    return false;
};

IPTVApp.prototype.navigate = function(direction, isRepeat) {
    var navStart = performance.now();
    var now = Date.now();
    if (now - this.lastNavTime < this.navThrottle) return;
    this.lastNavTime = now;
    var focusables = this.getFocusables();
    if (!focusables.length) return;
    var newIndex = this.focusIndex;
    var navContext = {
        focusables: focusables,
        index: newIndex,
        direction: direction,
        isRepeat: isRepeat
    };
    var result;
    if (this.focusArea === 'modal') {
        result = this._navigateModal(navContext);
    } else if (this.focusArea === 'sub-options') {
        result = this._navigateSubOptions(navContext);
        if (result.handled) return;
    } else if (this.focusArea === 'tracks') {
        result = this._navigateTracks(navContext);
    } else if (this.focusArea === 'home') {
        result = this._navigateHome(navContext);
    } else if (this.focusArea === 'continue') {
        result = this._navigateContinue(navContext);
    } else if (this.focusArea === 'sidebar') {
        result = this._navigateSidebar(navContext);
        if (result.handled) return;
    } else if (this.focusArea === 'filters') {
        result = this._navigateFilters(navContext);
        if (result.handled) return;
    } else if (this.focusArea === 'grid') {
        result = this._navigateGrid(navContext);
        if (result.handled) return;
    } else if (this.focusArea === 'details') {
        result = this._navigateDetails(navContext);
        if (result.handled) return;
    } else if (this.focusArea === 'actor') {
        result = this._navigateActor(navContext);
        if (result.handled) return;
    } else if (this.focusArea === 'settings' || this.focusArea === 'playlists' || this.focusArea === 'playlist-edit' || this.focusArea === 'confirm-modal' || this.focusArea === 'pattern-modal' || this.focusArea === 'add-category-modal' || this.focusArea === 'premium-modal') {
        result = { index: this.navigate2D(focusables, newIndex, direction) };
    } else {
        result = { index: newIndex };
    }
    this.focusIndex = result.index;
    this.updateFocus();
    var navDuration = performance.now() - navStart;
    if (navDuration > 5) {
        window.log('PERF', 'navigate(' + direction + ') ' + navDuration.toFixed(1) + 'ms [' + this.focusArea + ' #' + this.focusIndex + ', DOM:' + document.querySelectorAll('#content-grid .grid-item').length + ']');
    }
};

IPTVApp.prototype._navigateModal = function(ctx) {
    var newIndex = ctx.index;
    switch (ctx.direction) {
        case 'left':
            if (ctx.index > 0) newIndex = 0;
            break;
        case 'right':
            if (ctx.index < 1) newIndex = 1;
            break;
    }
    return { index: newIndex };
};

IPTVApp.prototype._navigateSubOptions = function(ctx) {
    var newIndex = ctx.index;
    var rows = [[0,1,2,3], [4,5,6], [7,8,9], [10]];
    var currentRow = 0;
    var posInRow = 0;
    for (var r = 0; r < rows.length; r++) {
        var idx = rows[r].indexOf(newIndex);
        if (idx !== -1) { currentRow = r; posInRow = idx; break; }
    }
    switch (ctx.direction) {
        case 'left':
            if (posInRow > 0) newIndex = rows[currentRow][posInRow - 1];
            break;
        case 'right':
            if (posInRow < rows[currentRow].length - 1) newIndex = rows[currentRow][posInRow + 1];
            break;
        case 'up':
            if (currentRow > 0) {
                var targetRow = rows[currentRow - 1];
                newIndex = targetRow[Math.min(posInRow, targetRow.length - 1)];
            }
            break;
        case 'down':
            if (currentRow < rows.length - 1) {
                var targetRow = rows[currentRow + 1];
                newIndex = targetRow[Math.min(posInRow, targetRow.length - 1)];
            }
            break;
    }
    this.focusIndex = newIndex;
    this.updateFocus();
    return { index: newIndex, handled: true };
};

IPTVApp.prototype._navigateTracks = function(ctx) {
    var newIndex = ctx.index;
    switch (ctx.direction) {
        case 'up':
            if (newIndex > 0) newIndex--;
            break;
        case 'down':
            if (newIndex < ctx.focusables.length - 1) newIndex++;
            break;
    }
    return { index: newIndex };
};

IPTVApp.prototype._navigateHome = function(ctx) {
    var newIndex = ctx.index;
    var homeCols = this.getHomeGridCols();
    var homeCount = ctx.focusables.length;
    var tabCount = document.querySelectorAll('#playlist-selector .focusable').length;
    var gridIndex = newIndex - tabCount;
    if (newIndex < tabCount) {
        switch (ctx.direction) {
            case 'left':
                if (newIndex > 0) newIndex--;
                break;
            case 'right':
                if (newIndex < tabCount - 1) newIndex++;
                break;
            case 'down':
                var targetCol = Math.min(newIndex, homeCols - 1);
                newIndex = tabCount + targetCol;
                if (newIndex >= homeCount) newIndex = homeCount - 1;
                break;
        }
    } else {
        switch (ctx.direction) {
            case 'left':
                if (gridIndex % homeCols > 0) newIndex--;
                break;
            case 'right':
                if (gridIndex % homeCols < homeCols - 1 && newIndex < homeCount - 1) newIndex++;
                break;
            case 'up':
                if (gridIndex >= homeCols) {
                    newIndex -= homeCols;
                } else if (tabCount > 0) {
                    newIndex = Math.min(gridIndex, tabCount - 1);
                }
                break;
            case 'down':
                var gridCount = homeCount - tabCount;
                var currentRow = Math.floor(gridIndex / homeCols);
                var totalRows = Math.ceil(gridCount / homeCols);
                if (currentRow < totalRows - 1) {
                    var targetIndex = newIndex + homeCols;
                    newIndex = targetIndex < homeCount ? targetIndex : homeCount - 1;
                }
                break;
        }
    }
    return { index: newIndex };
};

IPTVApp.prototype._navigateContinue = function(ctx) {
    var newIndex = ctx.index;
    var contCols = 5;
    var contCount = ctx.focusables.length;
    switch (ctx.direction) {
        case 'left':
            if (newIndex % contCols > 0) newIndex--;
            break;
        case 'right':
            if (newIndex % contCols < contCols - 1 && newIndex < contCount - 1) newIndex++;
            break;
        case 'up':
            if (newIndex >= contCols) newIndex -= contCols;
            break;
        case 'down':
            if (newIndex + contCols < contCount) newIndex += contCols;
            break;
    }
    return { index: newIndex };
};

IPTVApp.prototype._navigateSidebar = function(ctx) {
    var newIndex = ctx.index;
    switch (ctx.direction) {
        case 'up':
            if (newIndex > 0) {
                newIndex--;
            } else if (!ctx.isRepeat) {
                var filterItems = document.querySelectorAll('#filters-bar .focusable');
                if (filterItems.length > 0) {
                    this.lastSidebarIndex = this.focusIndex;
                    this.setFocus('filters', 0);
                    return { index: newIndex, handled: true };
                }
            }
            break;
        case 'down':
            newIndex = Math.min(ctx.focusables.length - 1, newIndex + 1);
            break;
        case 'right':
            this.lastSidebarIndex = this.focusIndex;
            var gridFocusables = document.querySelectorAll('#content-grid .grid-item');
            var restoreIdx = (this.lastGridIndex && this.lastGridIndex < gridFocusables.length) ? this.lastGridIndex : 0;
            this.setFocus('grid', restoreIdx);
            return { index: newIndex, handled: true };
    }
    return { index: newIndex };
};

IPTVApp.prototype._navigateFilters = function(ctx) {
    var newIndex = ctx.index;
    var filterCount = ctx.focusables.length;
    var sidebarVisible = document.getElementById('sidebar').style.display !== 'none';
    switch (ctx.direction) {
        case 'left':
            if (newIndex > 0) {
                newIndex--;
            } else if (sidebarVisible) {
                this.focusArea = 'sidebar';
                this.focusIndex = this.getSelectedSidebarIndex();
                this.updateFocus();
                return { index: newIndex, handled: true };
            }
            break;
        case 'right':
            if (newIndex < filterCount - 1) newIndex++;
            break;
        case 'down':
            var currentEl = ctx.focusables[ctx.index];
            if (currentEl && currentEl.classList.contains('cat-sort-btn') && sidebarVisible) {
                this.setFocus('sidebar', this.getSelectedSidebarIndex());
                return { index: newIndex, handled: true };
            }
            var gridItems = document.querySelectorAll('#content-grid .grid-item');
            if (gridItems.length > 0) {
                this._cameFromFilters = true;
                this.setFocus('grid', 0);
            }
            return { index: newIndex, handled: true };
    }
    return { index: newIndex };
};

IPTVApp.prototype._navigateGrid = function(ctx) {
    var newIndex = ctx.index;
    var isListView = document.getElementById('content-grid').classList.contains('list-view');
    var cols = isListView ? 1 : this.gridColumns;
    var sidebarVisible = document.getElementById('sidebar').style.display !== 'none';
    switch (ctx.direction) {
        case 'left':
            if (this.favoritesEditMode && this.movingFavoriteIndex >= 0) {
                this.moveFavorite('left');
                return { index: newIndex, handled: true };
            }
            if (newIndex % cols === 0) {
                if (sidebarVisible) {
                    this.lastGridIndex = this.focusIndex;
                    this.focusArea = 'sidebar';
                    if (this._cameFromFilters && this.lastSidebarIndex !== null && this.lastSidebarIndex !== undefined) {
                        this.focusIndex = this.lastSidebarIndex;
                        window.log('FOCUS', 'grid->sidebar (via filters): focusIndex=' + this.focusIndex);
                    } else {
                        this.focusIndex = this.getSelectedSidebarIndex();
                        window.log('FOCUS', 'grid->sidebar: focusIndex=' + this.focusIndex);
                    }
                    this._cameFromFilters = false;
                    this.updateFocus();
                }
                return { index: newIndex, handled: true };
            }
            newIndex--;
            break;
        case 'right':
            if (this.favoritesEditMode && this.movingFavoriteIndex >= 0) {
                this.moveFavorite('right');
                return { index: newIndex, handled: true };
            }
            if (isListView && !this.favoritesEditMode && this.currentSection === 'history') {
                this.removeHistoryAtIndex(this.focusIndex);
                return { index: newIndex, handled: true };
            }
            if (isListView && this.currentSection === 'downloads') {
                this.removeDownloadAtIndex(this.focusIndex);
                return { index: newIndex, handled: true };
            }
            if ((newIndex + 1) % cols !== 0 && newIndex < ctx.focusables.length - 1) {
                newIndex++;
            }
            break;
        case 'up':
            this._cameFromFilters = false;
            if (this.favoritesEditMode && this.movingFavoriteIndex >= 0) {
                this.moveFavorite('up');
                return { index: newIndex, handled: true };
            }
            if (newIndex < cols && this._domOffset > 0) {
                this._prependGridItems();
                newIndex = this.focusIndex;
                newIndex -= cols;
                break;
            }
            if (newIndex < cols) {
                this.lastGridIndex = this.focusIndex;
                var currentEl = ctx.focusables[ctx.index];
                this.focusArea = 'filters';
                this.invalidateFocusables();
                var visibleFilters = this.getFocusables();
                var targetIdx = 0;
                if (visibleFilters.length > 0) {
                    if (isListView) {
                        for (var fi = 0; fi < visibleFilters.length; fi++) {
                            if (visibleFilters[fi].id === 'view-grid-btn') {
                                targetIdx = fi;
                                break;
                            }
                        }
                    }
                    else if (currentEl) {
                        var rect = currentEl.getBoundingClientRect();
                        var cx = rect.left + rect.width / 2;
                        var bestDist = Infinity;
                        for (var fi = 0; fi < visibleFilters.length; fi++) {
                            var fRect = visibleFilters[fi].getBoundingClientRect();
                            var fcx = fRect.left + fRect.width / 2;
                            var d = Math.abs(fcx - cx);
                            if (d < bestDist) {
                                bestDist = d;
                                targetIdx = fi;
                            }
                        }
                    }
                }
                this.focusIndex = targetIdx;
                this.updateFocus();
                return { index: newIndex, handled: true };
            }
            newIndex -= cols;
            break;
        case 'down':
            this._cameFromFilters = false;
            if (this.favoritesEditMode && this.movingFavoriteIndex >= 0) {
                this.moveFavorite('down');
                return { index: newIndex, handled: true };
            }
            if (newIndex + cols < ctx.focusables.length) {
                newIndex += cols;
                var rowsLeft = Math.floor((ctx.focusables.length - newIndex) / cols);
                if (rowsLeft <= 8 && this.displayedCount < this.currentStreams.length && !this._preloading) {
                    this._preloading = true;
                    var self = this;
                    setTimeout(function() {
                        self.loadMoreItems();
                        setTimeout(function() {
                            self.loadMoreItems();
                            setTimeout(function() {
                                self.loadMoreItems();
                                self._preloading = false;
                            }, 16);
                        }, 16);
                    }, 0);
                }
            } else if (this.displayedCount < this.currentStreams.length) {
                if (!this._loadingMore) {
                    this._loadingMore = true;
                    var self = this;
                    setTimeout(function() {
                        if (self.focusArea !== 'grid') {
                            self._loadingMore = false;
                            return;
                        }
                        if (self.loadMoreItems()) {
                            self.focusIndex += cols;
                            var focusables = self.getFocusables();
                            if (self.focusIndex >= focusables.length) {
                                self.focusIndex = focusables.length - 1;
                            }
                            self.updateFocus();
                        }
                        self._loadingMore = false;
                    }, 0);
                }
            }
            break;
    }
    return { index: newIndex };
};

IPTVApp.prototype._navigateDetails = function(ctx) {
    var newIndex = ctx.index;
    var current = ctx.focusables[newIndex];
    var currentZone = this.getDetailsZone(current);
    var zones = this.getDetailsZones(ctx.focusables);
    if (currentZone === 'versions' || currentZone === 'actions') {
        var candidate = this.navigate2D(ctx.focusables, newIndex, ctx.direction);
        if (candidate !== newIndex) {
            return { index: candidate };
        }
    }
    switch (ctx.direction) {
        case 'left':
            if (currentZone === 'episodes' && zones.episodes) {
                if (newIndex === zones.episodes.start) {
                    newIndex = zones.episodes.end;
                } else {
                    newIndex--;
                }
            } else if (currentZone === 'favorite' && zones.download) {
                newIndex = zones.download.start;
            } else if ((currentZone === 'favorite' || currentZone === 'download') && zones.title) {
                newIndex = zones.title.start;
            } else if (newIndex > 0) {
                var prev = ctx.focusables[newIndex - 1];
                if (this.getDetailsZone(prev) === currentZone) {
                    newIndex--;
                }
            }
            break;
        case 'right':
            if (currentZone === 'episodes' && zones.episodes) {
                if (newIndex === zones.episodes.end) {
                    newIndex = zones.episodes.start;
                } else {
                    newIndex++;
                }
            } else if (currentZone === 'download' && zones.favorite) {
                newIndex = zones.favorite.start;
            } else if (currentZone === 'title') {
                if (zones.download) newIndex = zones.download.start;
                else if (zones.favorite) newIndex = zones.favorite.start;
            } else if (newIndex < ctx.focusables.length - 1) {
                var next = ctx.focusables[newIndex + 1];
                if (this.getDetailsZone(next) === currentZone) {
                    newIndex++;
                }
            }
            break;
        case 'up':
            if (current.id === 'details-description' && this.scrollableTextNav(current, 'up')) {
                return { index: newIndex, handled: true };
            }
            if (currentZone === 'favorite' || currentZone === 'download' || currentZone === 'title') {
                break;
            }
            if (currentZone === 'description') {
                if (zones.download) { newIndex = zones.download.start; break; }
                if (zones.favorite) { newIndex = zones.favorite.start; break; }
                if (zones.title) { newIndex = zones.title.start; break; }
            }
            if (currentZone === 'episodes') {
                var episodeCols = this.getEpisodeColumns();
                var zoneStart = zones.episodes.start;
                var posInZone = newIndex - zoneStart;
                if (posInZone >= episodeCols) {
                    newIndex -= episodeCols;
                } else {
                    var prevZone = this.getPrevDetailsZone(currentZone, zones);
                    if (prevZone) newIndex = zones[prevZone].start;
                }
            } else {
                var prevZone = this.getPrevDetailsZone(currentZone, zones);
                if (prevZone) {
                    newIndex = zones[prevZone].start;
                }
            }
            break;
        case 'down':
            if (current.id === 'details-description' && this.scrollableTextNav(current, 'down')) {
                return { index: newIndex, handled: true };
            }
            if (currentZone === 'favorite' || currentZone === 'download' || currentZone === 'title') {
                var lastTopZone = zones.download ? 'download' : (zones.favorite ? 'favorite' : currentZone);
                var nextZone = this.getNextDetailsZone(lastTopZone, zones);
                if (nextZone) newIndex = zones[nextZone].start;
                break;
            }
            if (currentZone === 'episodes') {
                var episodeCols = this.getEpisodeColumns();
                var zoneStart = zones.episodes.start;
                var zoneEnd = zones.episodes.end;
                var posInZone = newIndex - zoneStart;
                var totalEpisodes = zoneEnd - zoneStart + 1;
                var currentRow = Math.floor(posInZone / episodeCols);
                var lastRow = Math.floor((totalEpisodes - 1) / episodeCols);
                if (posInZone + episodeCols < totalEpisodes) {
                    newIndex += episodeCols;
                } else if (currentRow < lastRow) {
                    newIndex = zoneStart + totalEpisodes - 1;
                } else {
                    var nextZone = this.getNextDetailsZone(currentZone, zones);
                    if (nextZone) newIndex = zones[nextZone].start;
                }
            } else {
                var nextZone = this.getNextDetailsZone(currentZone, zones);
                if (nextZone) {
                    newIndex = zones[nextZone].start;
                }
            }
            break;
    }
    return { index: newIndex };
};

IPTVApp.prototype._navigateActor = function(ctx) {
    var newIndex = ctx.index;
    var bioEl = document.getElementById('actor-bio');
    var isBioFocused = ctx.focusables[newIndex] === bioEl;
    switch (ctx.direction) {
        case 'left':
            if (!isBioFocused && newIndex > 0) newIndex--;
            break;
        case 'right':
            if (!isBioFocused && newIndex < ctx.focusables.length - 1) {
                newIndex++;
            }
            if (this.filmographyData && newIndex >= this.filmographyOffset - 8) {
                this.loadMoreFilmography(8);
            }
            break;
        case 'up':
            if (isBioFocused) {
                this.scrollableTextNav(bioEl, 'up');
                this.focusIndex = newIndex;
                this.updateFocus();
                return { index: newIndex, handled: true };
            }
            if (bioEl) {
                for (var bi = 0; bi < ctx.focusables.length; bi++) {
                    if (ctx.focusables[bi] === bioEl) {
                        this.lastFilmographyIndex = newIndex;
                        newIndex = bi;
                        bioEl.scrollTop = 0;
                        break;
                    }
                }
            }
            break;
        case 'down':
            if (isBioFocused) {
                if (this.scrollableTextNav(bioEl, 'down')) {
                    this.focusIndex = newIndex;
                    this.updateFocus();
                    return { index: newIndex, handled: true };
                }
                newIndex = this.lastFilmographyIndex || 0;
                if (newIndex >= ctx.focusables.length) newIndex = 0;
                if (ctx.focusables[newIndex] === bioEl) newIndex = newIndex + 1 < ctx.focusables.length ? newIndex + 1 : 0;
            }
            break;
    }
    return { index: newIndex };
};

IPTVApp.prototype.navigate2D = function(focusables, currentIndex, direction) {
    if (focusables.length === 0) return currentIndex;
    var current = focusables[currentIndex];
    if (!current) return currentIndex;
    var currentRect = current.getBoundingClientRect();
    var currentCenterX = currentRect.left + currentRect.width / 2;
    var currentCenterY = currentRect.top + currentRect.height / 2;
    var bestIndex = currentIndex;
    var bestScore = Infinity;
    var rowTolerance = 15;
    var band = 500;
    for (var i = 0; i < focusables.length; i++) {
        if (i === currentIndex) continue;
        var el = focusables[i];
        if (direction === 'left' || direction === 'right') {
            var elTop = el.offsetTop;
            var elHeight = el.offsetHeight;
            var elCenterY = elTop + elHeight / 2;
            var approxDy = elCenterY - (current.offsetTop + current.offsetHeight / 2);
            if (Math.abs(approxDy) > rowTolerance + band) continue;
        }
        else {
        }
        var rect = el.getBoundingClientRect();
        var centerX = rect.left + rect.width / 2;
        var centerY = rect.top + rect.height / 2;
        var dx = centerX - currentCenterX;
        var dy = centerY - currentCenterY;
        var isValid = false;
        var score = Infinity;
        if (direction === 'up' && dy < -rowTolerance) {
            isValid = true;
            score = Math.round(Math.abs(dy) / rowTolerance) * 10000 + centerX;
        }
        else if (direction === 'down' && dy > rowTolerance) {
            isValid = true;
            score = Math.round(dy / rowTolerance) * 10000 + centerX;
        }
        else if (direction === 'left' && dx < -10 && Math.abs(dy) < rowTolerance) {
            isValid = true;
            score = Math.abs(dx);
        }
        else if (direction === 'right' && dx > 10 && Math.abs(dy) < rowTolerance) {
            isValid = true;
            score = Math.abs(dx);
        }
        if (isValid && score < bestScore) {
            bestScore = score;
            bestIndex = i;
        }
    }
    return bestIndex;
};

IPTVApp.prototype.getSelectedSidebarIndex = function() {
    var items = document.querySelectorAll('#categories-list .category-item');
    for (var i = 0; i < items.length; i++) {
        if (items[i].classList.contains('selected')) {
            window.log('FOCUS', 'getSelectedSidebarIndex: found .selected at index ' + i + ' (' + items[i].textContent.trim() + ')');
            return i;
        }
    }
    window.log('FOCUS', 'getSelectedSidebarIndex: no .selected found, fallback to lastSidebarIndex=' + this.lastSidebarIndex);
    return this.lastSidebarIndex !== null ? this.lastSidebarIndex : 0;
};

IPTVApp.prototype.invalidateFocusables = function() {
    this._focusablesDirty = true;
};

IPTVApp.prototype.getFocusables = function() {
    if (!this._focusablesDirty && this._cachedFocusables && this._cachedFocusArea === this.focusArea) {
        return this._cachedFocusables;
    }
    var selector = '';
    switch (this.focusArea) {
        case 'modal':
            selector = '#resume-modal .modal-btn';
            break;
        case 'home':
            selector = '#playlist-selector .focusable, #home-grid .focusable';
            break;
        case 'continue':
            selector = '#continue-grid .continue-item';
            break;
        case 'sidebar':
            selector = '#categories-list .category-item';
            break;
        case 'filters':
            selector = '#filters-bar .focusable';
            break;
        case 'grid':
            selector = '#content-grid .grid-item';
            break;
        case 'details':
            selector = '#details-screen .focusable:not(.hidden)';
            break;
        case 'actor':
            selector = '#actor-screen #actor-bio, #actor-filmography-grid .filmography-item';
            break;
        case 'tracks':
            return this.trackModalItems || [];
        case 'sub-options':
            return this.subOptionsItems || [];
        case 'settings':
            selector = '#settings-screen .focusable';
            break;
        case 'playlists':
            selector = '#playlists-screen .focusable';
            break;
        case 'playlist-edit':
            selector = '#playlist-edit-screen .focusable';
            break;
        case 'pattern-modal':
            selector = '#pattern-modal .focusable';
            break;
        case 'add-category-modal':
            selector = '#add-category-modal .focusable';
            break;
        case 'confirm-modal':
            selector = '#confirm-modal .modal-btn';
            break;
        case 'premium-modal':
            selector = '#premium-modal .focusable';
            break;
    }
    var elements = document.querySelectorAll(selector);
    var visible = [];
    for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        if (!el.classList.contains('hidden') && !el.classList.contains('collapsed-hidden') && el.style.display !== 'none' && !el.closest('.collapsible-content.collapsed') && !el.closest('.hidden')) {
            visible.push(el);
        }
    }
    this._cachedFocusables = visible;
    this._cachedFocusArea = this.focusArea;
    this._focusablesDirty = false;
    return visible;
};

IPTVApp.prototype.getDetailsZone = function(element) {
    if (element.id === 'details-title') return 'title';
    if (element.classList.contains('favorite-star')) return 'favorite';
    if (element.classList.contains('download-btn')) return 'download';
    if (element.classList.contains('version-btn')) return 'versions';
    if (element.classList.contains('action-btn')) return 'actions';
    if (element.id === 'details-description') return 'description';
    if (element.classList.contains('season-btn') || element.classList.contains('download-season-btn')) return 'seasons';
    if (element.classList.contains('episode-item')) return 'episodes';
    if (element.classList.contains('cast-card')) {
        if (element.parentElement && element.parentElement.id === 'details-director-grid') {
            return 'director';
        }
        return 'cast';
    }
    return 'actions';
};

IPTVApp.prototype.getDetailsZones = function(focusables) {
    var zones = {};
    var zoneOrder = ['title', 'favorite', 'download', 'description', 'versions', 'actions', 'seasons', 'episodes', 'cast', 'director'];
    for (var i = 0; i < focusables.length; i++) {
        var zone = this.getDetailsZone(focusables[i]);
        if (!zones[zone]) {
            zones[zone] = { start: i, end: i };
        } else {
            zones[zone].end = i;
        }
    }
    zones._order = [];
    for (var j = 0; j < zoneOrder.length; j++) {
        if (zones[zoneOrder[j]]) {
            zones._order.push(zoneOrder[j]);
        }
    }
    return zones;
};

IPTVApp.prototype.getPrevDetailsZone = function(currentZone, zones) {
    var order = zones._order;
    var idx = order.indexOf(currentZone);
    if (idx > 0) {
        return order[idx - 1];
    }
    return null;
};

IPTVApp.prototype.getNextDetailsZone = function(currentZone, zones) {
    var order = zones._order;
    var idx = order.indexOf(currentZone);
    if (idx < order.length - 1) {
        return order[idx + 1];
    }
    return null;
};

IPTVApp.prototype.getDetailsPlayIndex = function() {
    var focusables = document.querySelectorAll('#details-screen .focusable:not(.hidden)');
    for (var i = 0; i < focusables.length; i++) {
        if (focusables[i].id === 'continue-btn') {
            return i;
        }
    }
    for (var i = 0; i < focusables.length; i++) {
        if (focusables[i].id === 'play-btn') {
            return i;
        }
    }
    for (var i = 0; i < focusables.length; i++) {
        if (focusables[i].classList.contains('version-btn') && focusables[i].classList.contains('selected')) {
            return i;
        }
    }
    for (var i = 0; i < focusables.length; i++) {
        if (focusables[i].classList.contains('version-btn')) {
            return i;
        }
    }
    return 0;
};

IPTVApp.prototype.getEpisodeColumns = function() {
    var container = document.getElementById('details-episodes-grid');
    var items = container.querySelectorAll('.episode-item');
    if (items.length < 2) return 1;
    var firstTop = items[0].offsetTop;
    var cols = 1;
    for (var i = 1; i < items.length; i++) {
        if (items[i].offsetTop === firstTop) {
            cols++;
        } else {
            break;
        }
    }
    return cols;
};

IPTVApp.prototype.applyMarquee = function(element, containerWidth) {
    var overflow = element.scrollWidth - containerWidth;
    if (overflow > 15) {
        var speed = 20;
        var duration = overflow / speed;
        element.style.setProperty('--marquee-distance', -overflow + 'px');
        element.style.setProperty('--marquee-duration', duration + 's');
        element.classList.add('marquee');
    }
};

IPTVApp.prototype.applyMarqueeLoop = function(element, containerWidth) {
    var overflow = element.scrollWidth - containerWidth;
    if (overflow > 0) {
        var text = element.textContent;
        var wrapper = document.createElement('span');
        wrapper.className = 'marquee-wrapper';
        var original = document.createElement('span');
        original.textContent = text;
        var copy = document.createElement('span');
        copy.className = 'marquee-copy';
        copy.textContent = text;
        wrapper.appendChild(original);
        wrapper.appendChild(copy);
        element.textContent = '';
        element.appendChild(wrapper);
        var gap = 30;
        var totalWidth = element.scrollWidth / 2;
        var distance = totalWidth + gap;
        var speed = 30;
        var duration = distance / speed;
        wrapper.style.setProperty('--marquee-distance', -distance + 'px');
        wrapper.style.setProperty('--marquee-duration', duration + 's');
        wrapper.classList.add('marquee-loop');
    }
};

IPTVApp.prototype.clearMarquee = function(element) {
    var wrapper = element.querySelector('.marquee-wrapper');
    if (wrapper) {
        var original = wrapper.querySelector('span:first-child');
        var text = original ? original.textContent : '';
        element.textContent = text;
    }
    element.classList.remove('marquee');
    element.classList.remove('marquee-loop');
    element.style.removeProperty('--marquee-distance');
    element.style.removeProperty('--marquee-duration');
};

IPTVApp.prototype.applyMarqueeToFocusedElement = function(el) {
    var self = this;
    if (el.classList.contains('category-item')) {
        var textSpan = el.querySelector('.category-text');
        if (textSpan) {
            var elRect = el.getBoundingClientRect();
            var textRect = textSpan.getBoundingClientRect();
            var availableWidth = elRect.right - textRect.left - 15;
            this.applyMarquee(textSpan, availableWidth);
        }
    }
    else if (el.classList.contains('cast-card')) {
        var castName = el.querySelector('.cast-name');
        var castChar = el.querySelector('.cast-character');
        var castInfo = el.querySelector('.cast-info');
        var containerWidth = castInfo ? castInfo.clientWidth - 16 : el.clientWidth;
        if (castName) this.applyMarqueeLoop(castName, containerWidth);
        if (castChar) this.applyMarqueeLoop(castChar, containerWidth);
    }
    else if (el.classList.contains('filmography-item')) {
        var filmTitle = el.querySelector('.filmography-title');
        if (filmTitle) {
            this.applyMarqueeLoop(filmTitle, el.clientWidth - 20);
        }
    }
    else if (el.classList.contains('episode-item')) {
        var epTitle = el.querySelector('.episode-title');
        if (epTitle) {
            this.applyMarqueeLoop(epTitle, el.clientWidth - 30);
        }
    }
    else if (el.classList.contains('grid-item')) {
        var overlayBottom = el.querySelector('.grid-overlay-bottom');
        if (overlayBottom) {
            var containerWidth = overlayBottom.clientWidth;
            var providerSpan = el.querySelector('.grid-genre-provider');
            var tmdbSpan = el.querySelector('.grid-genre-tmdb');
            if (providerSpan) this.applyMarqueeLoop(providerSpan, containerWidth);
            if (tmdbSpan) this.applyMarqueeLoop(tmdbSpan, containerWidth);
        }
        var listTitle = el.querySelector('.list-title');
        var listGenre = el.querySelector('.list-genre');
        var epgDiv = el.querySelector('.grid-item-epg');
        if (listTitle) this.applyMarqueeLoop(listTitle, el.clientWidth - 20);
        if (listGenre) this.applyMarqueeLoop(listGenre, el.clientWidth - 20);
        if (epgDiv) this.applyMarqueeLoop(epgDiv, el.clientWidth - 20);
    }
    else if (el.classList.contains('continue-item')) {
        var continueTitle = el.querySelector('.continue-title');
        if (continueTitle) this.applyMarqueeLoop(continueTitle, el.clientWidth - 20);
    }
    else if (el.classList.contains('playlist-item')) {
        var playlistName = el.querySelector('.playlist-name');
        if (playlistName) this.applyMarqueeLoop(playlistName, el.clientWidth - 40);
    }
};

IPTVApp.prototype.updateFocus = function() {
    var self = this;
    if (this._lastFocusedEl) {
        this._lastFocusedEl.classList.remove('focused');
        var marquees = this._lastFocusedEl.querySelectorAll('.marquee, .marquee-wrapper');
        for (var mi = 0; mi < marquees.length; mi++) {
            var parent = marquees[mi].classList.contains('marquee-wrapper') ? marquees[mi].parentElement : marquees[mi];
            self.clearMarquee(parent);
        }
        this._lastFocusedEl = null;
    }
    var focusables = this.getFocusables();
    if (focusables.length > 0) {
        if (this.focusIndex < 0) {
            this.focusIndex = 0;
        }
        else if (this.focusIndex >= focusables.length) {
            this.focusIndex = focusables.length - 1;
        }
    }
    if (focusables[this.focusIndex]) {
        var el = focusables[this.focusIndex];
        el.classList.add('focused');
        this._lastFocusedEl = el;
        this.applyMarqueeToFocusedElement(el);
        this.lastValidFocus = {
            screen: this.currentScreen,
            area: this.focusArea,
            index: this.focusIndex
        };
        if (this.focusArea === 'settings') {
            this.scrollSettingsToElement(el);
        }
        else if (this.focusArea === 'details') {
            this.scrollDetailsToElement(el);
        }
        else if (this.focusArea === 'grid') {
            var container = document.getElementById('content-grid');
            if (container) {
                var elRect = el.getBoundingClientRect();
                var containerRect = container.getBoundingClientRect();
                if (elRect.top < containerRect.top + 10) {
                    container.scrollTop -= (containerRect.top + 10 - elRect.top);
                }
                else if (elRect.bottom > containerRect.bottom - 20) {
                    container.scrollTop += (elRect.bottom - containerRect.bottom + 20);
                }
            }
        }
        else if (this.focusArea === 'sidebar') {
            var container = document.getElementById('categories-list');
            if (container) {
                var elRect = el.getBoundingClientRect();
                var containerRect = container.getBoundingClientRect();
                if (elRect.top < containerRect.top + 10) {
                    container.scrollTop -= (containerRect.top + 10 - elRect.top);
                }
                else if (elRect.bottom > containerRect.bottom - 10) {
                    container.scrollTop += (elRect.bottom - containerRect.bottom + 10);
                }
            }
        }
        else if (this.focusArea === 'actor') {
            el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
            this.scrollHorizontalGridToElement(el);
        }
        else {
            el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
        requestAnimationFrame(function() {
            if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
            if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
        });
        if (this.focusArea === 'grid') {
            var self = this;
            clearTimeout(this.imageLoadTimer);
            this.imageLoadTimer = setTimeout(function() {
                self.loadVisibleImages();
                self.loadVisibleEPG();
            }, 250);
        }
    }
    else if (focusables.length === 0 && !this.restoringFocus && !this._gridLoading) {
        this.restoringFocus = true;
        var found = false;
        // 1. Grid empty: fallback to sidebar if visible
        if (this.focusArea === 'grid') {
            var sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.offsetParent !== null) {
                this.focusArea = 'sidebar';
                this.focusIndex = this.getSelectedSidebarIndex();
                found = this.getFocusables().length > 0;
            }
        }
        // 2. Try lastValidFocus if different area
        if (!found && this.lastValidFocus && this.lastValidFocus.screen === this.currentScreen && this.lastValidFocus.area !== this.focusArea) {
            this.focusArea = this.lastValidFocus.area;
            this.focusIndex = this.lastValidFocus.index;
            found = this.getFocusables().length > 0;
        }
        // 3. Default focus: find any focusable area
        if (!found) {
            var fallbackAreas = ['sidebar', 'grid', 'home', 'filters', 'details', 'settings'];
            for (var i = 0; i < fallbackAreas.length; i++) {
                this.focusArea = fallbackAreas[i];
                this.focusIndex = 0;
                if (this.getFocusables().length > 0) {
                    found = true;
                    break;
                }
            }
        }
        if (found) {
            this.updateFocus();
        }
        this.restoringFocus = false;
    }
};

IPTVApp.prototype.scrollSettingsToElement = function(el) {
    var container = document.getElementById('settings-screen');
    if (!container) return;
    var elRect = el.getBoundingClientRect();
    var containerRect = container.getBoundingClientRect();
    var marginTop = 215;
    var marginBottom = 150;
    if (elRect.top < containerRect.top + marginTop) {
        container.scrollTop -= (containerRect.top + marginTop - elRect.top);
    }
    else if (elRect.bottom > containerRect.bottom - marginBottom) {
        container.scrollTop += (elRect.bottom - containerRect.bottom + marginBottom);
    }
};

IPTVApp.prototype.scrollDetailsToElement = function(el) {
    var existing = document.getElementById('tts-tooltip');
    if (existing) existing.remove();
    if (this.hideAllButtonTooltips) this.hideAllButtonTooltips();
    var container = document.getElementById('details-wrapper');
    if (!container) return;
    var zone = this.getDetailsZone(el);
    if (zone === 'favorite' || zone === 'download' || zone === 'actions') {
        container.scrollTop = 0;
        return;
    }
    var elRect = el.getBoundingClientRect();
    var containerRect = container.getBoundingClientRect();
    var marginTop = 50;
    var marginBottom = zone === 'cast' ? 10 : 80;
    if (elRect.top < containerRect.top + marginTop) {
        container.scrollTop -= (containerRect.top + marginTop - elRect.top);
    }
    else if (elRect.bottom > containerRect.bottom - marginBottom) {
        container.scrollTop += (elRect.bottom - containerRect.bottom + marginBottom);
    }
    this.scrollHorizontalGridToElement(el);
};

IPTVApp.prototype.scrollHorizontalGridToElement = function(el) {
    var horizontalGrid = el.closest('#details-cast-grid, #details-director-grid, #actor-filmography-grid, #details-season-selector');
    if (!horizontalGrid) return;
    var elRect = el.getBoundingClientRect();
    var gridRect = horizontalGrid.getBoundingClientRect();
    var margin = 15;
    if (elRect.left < gridRect.left + margin) {
        horizontalGrid.scrollLeft -= (gridRect.left + margin - elRect.left);
    }
    else if (elRect.right > gridRect.right - margin) {
        horizontalGrid.scrollLeft += (elRect.right - gridRect.right + margin);
    }
};
