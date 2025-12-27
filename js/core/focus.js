/**
 * Focus Manager Module
 * Handles keyboard navigation, focus state, and scrolling
 */

IPTVApp.prototype.bindKeys = function() {
    var self = this;
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
                    } else {
                        self.showPlayerOverlay();
                    }
                } else {
                    self.navigate('up');
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
                    } else if (self.currentPlayingType === 'live' && self.player.isInTimeshift) {
                        self.returnToLive();
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
                        self.showPlayerOverlay();
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

IPTVApp.prototype.navigate = function(direction) {
    var now = Date.now();
    if (now - this.lastNavTime < this.navThrottle) return;
    this.lastNavTime = now;
    var focusables = this.getFocusables();
    if (!focusables.length) return;
    var newIndex = this.focusIndex;
    var isListView = document.getElementById('content-grid').classList.contains('list-view');
    var cols = isListView ? 1 : this.gridColumns;
    if (this.focusArea === 'modal') {
        switch (direction) {
            case 'left':
                if (this.focusIndex > 0) newIndex = 0;
                break;
            case 'right':
                if (this.focusIndex < 1) newIndex = 1;
                break;
        }
    } else if (this.focusArea === 'sub-options') {
        var rows = [[0,1,2,3], [4,5,6], [7,8,9], [10]];
        var currentRow = 0;
        var posInRow = 0;
        for (var r = 0; r < rows.length; r++) {
            var idx = rows[r].indexOf(newIndex);
            if (idx !== -1) { currentRow = r; posInRow = idx; break; }
        }
        switch (direction) {
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
        return;
    } else if (this.focusArea === 'tracks') {
        switch (direction) {
            case 'up':
                if (newIndex > 0) newIndex--;
                break;
            case 'down':
                if (newIndex < focusables.length - 1) newIndex++;
                break;
        }
    } else if (this.focusArea === 'home') {
        var homeCols = this.getHomeGridCols();
        var homeCount = focusables.length;
        var tabCount = document.querySelectorAll('#playlist-selector .focusable').length;
        var gridIndex = newIndex - tabCount;
        if (newIndex < tabCount) {
            switch (direction) {
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
            switch (direction) {
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
    } else if (this.focusArea === 'continue') {
        var contCols = 5;
        var contCount = focusables.length;
        switch (direction) {
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
    } else if (this.focusArea === 'sidebar') {
        switch (direction) {
            case 'up':
                if (newIndex > 0) {
                    newIndex--;
                } else {
                    this.lastSidebarIndex = this.focusIndex;
                    this.setFocus('filters', 0);
                    return;
                }
                break;
            case 'down':
                newIndex = Math.min(focusables.length - 1, newIndex + 1);
                break;
            case 'right':
                this.lastSidebarIndex = this.focusIndex;
                this.setFocus('grid', 0);
                return;
        }
    } else if (this.focusArea === 'filters') {
        var filterCount = focusables.length;
        var sidebarVisible = document.getElementById('sidebar').style.display !== 'none';
        switch (direction) {
            case 'left':
                if (newIndex > 0) {
                    newIndex--;
                } else if (sidebarVisible) {
                    this.focusArea = 'sidebar';
                    this.focusIndex = this.getSelectedSidebarIndex();
                    this.updateFocus();
                    return;
                }
                break;
            case 'right':
                if (newIndex < filterCount - 1) newIndex++;
                break;
            case 'down':
                var gridItems = document.querySelectorAll('#content-grid .grid-item');
                if (gridItems.length > 0) {
                    this.setFocus('grid', 0);
                }
                return;
        }
    } else if (this.focusArea === 'grid') {
        var sidebarVisible = document.getElementById('sidebar').style.display !== 'none';
        switch (direction) {
            case 'left':
                if (this.favoritesEditMode && this.movingFavoriteIndex >= 0) {
                    this.moveFavorite('left');
                    return;
                }
                if (newIndex % cols === 0) {
                    if (sidebarVisible) {
                        this.focusArea = 'sidebar';
                        this.focusIndex = this.getSelectedSidebarIndex();
                        window.log('FOCUS', 'grid->sidebar: focusIndex=' + this.focusIndex);
                        this.updateFocus();
                    }
                    return;
                }
                newIndex--;
                break;
            case 'right':
                if (this.favoritesEditMode && this.movingFavoriteIndex >= 0) {
                    this.moveFavorite('right');
                    return;
                }
                if (isListView && !this.favoritesEditMode && this.currentSection === 'history') {
                    this.removeHistoryAtIndex(this.focusIndex);
                    return;
                }
                if (isListView && this.currentSection === 'downloads') {
                    this.removeDownloadAtIndex(this.focusIndex);
                    return;
                }
                if ((newIndex + 1) % cols !== 0 && newIndex < focusables.length - 1) {
                    newIndex++;
                }
                break;
            case 'up':
                if (this.favoritesEditMode && this.movingFavoriteIndex >= 0) {
                    this.moveFavorite('up');
                    return;
                }
                if (newIndex < cols) {
                    this.focusArea = 'filters';
                    var col = newIndex % cols;
                    this.focusIndex = (col < 2) ? 0 : 4;
                    this.updateFocus();
                    return;
                }
                newIndex -= cols;
                break;
            case 'down':
                if (this.favoritesEditMode && this.movingFavoriteIndex >= 0) {
                    this.moveFavorite('down');
                    return;
                }
                if (newIndex + cols < focusables.length) {
                    newIndex += cols;
                } else if (this.displayedCount < this.currentStreams.length) {
                    var oldCount = focusables.length;
                    if (this.loadMoreItems()) {
                        newIndex += cols;
                        if (newIndex >= oldCount + this.itemsPerBatch) {
                            newIndex = oldCount;
                        }
                    }
                }
                break;
        }
    } else if (this.focusArea === 'details') {
        var current = focusables[newIndex];
        var currentZone = this.getDetailsZone(current);
        var zones = this.getDetailsZones(focusables);
        switch (direction) {
            case 'left':
                if (currentZone === 'episodes' && zones.episodes) {
                    if (newIndex === zones.episodes.start) {
                        newIndex = zones.episodes.end;
                    } else {
                        newIndex--;
                    }
                } else if (currentZone === 'favorite' && zones.download) {
                    newIndex = zones.download.start;
                } else if (newIndex > 0) {
                    var prev = focusables[newIndex - 1];
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
                } else if (newIndex < focusables.length - 1) {
                    var next = focusables[newIndex + 1];
                    if (this.getDetailsZone(next) === currentZone) {
                        newIndex++;
                    }
                }
                break;
            case 'up':
                if (current.id === 'details-description' && this.scrollableTextNav(current, 'up')) {
                    return;
                }
                if (currentZone === 'favorite' || currentZone === 'download') {
                    break;
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
                    return;
                }
                if (currentZone === 'favorite' || currentZone === 'download') {
                    var nextZone = this.getNextDetailsZone('download', zones);
                    if (nextZone) newIndex = zones[nextZone].start;
                    break;
                }
                if (currentZone === 'episodes') {
                    var episodeCols = this.getEpisodeColumns();
                    var zoneStart = zones.episodes.start;
                    var zoneEnd = zones.episodes.end;
                    var posInZone = newIndex - zoneStart;
                    var totalEpisodes = zoneEnd - zoneStart + 1;
                    if (posInZone + episodeCols < totalEpisodes) {
                        newIndex += episodeCols;
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
    } else if (this.focusArea === 'actor') {
        var bioEl = document.getElementById('actor-bio');
        var isBioFocused = focusables[newIndex] === bioEl;
        switch (direction) {
            case 'left':
                if (!isBioFocused && newIndex > 0) newIndex--;
                break;
            case 'right':
                if (!isBioFocused && newIndex < focusables.length - 1) {
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
                    return;
                }
                if (bioEl) {
                    for (var bi = 0; bi < focusables.length; bi++) {
                        if (focusables[bi] === bioEl) {
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
                        return;
                    }
                    newIndex = this.lastFilmographyIndex || 0;
                    if (newIndex >= focusables.length) newIndex = 0;
                    if (focusables[newIndex] === bioEl) newIndex = newIndex + 1 < focusables.length ? newIndex + 1 : 0;
                }
                break;
        }
    } else if (this.focusArea === 'settings' || this.focusArea === 'playlists' || this.focusArea === 'playlist-edit' || this.focusArea === 'confirm-modal' || this.focusArea === 'pattern-modal' || this.focusArea === 'add-category-modal') {
        newIndex = this.navigate2D(focusables, newIndex, direction);
    }
    this.focusIndex = newIndex;
    this.updateFocus();
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
    for (var i = 0; i < focusables.length; i++) {
        if (i === currentIndex) continue;
        var el = focusables[i];
        var rect = el.getBoundingClientRect();
        var centerX = rect.left + rect.width / 2;
        var centerY = rect.top + rect.height / 2;
        var dx = centerX - currentCenterX;
        var dy = centerY - currentCenterY;
        var isValid = false;
        var score = Infinity;
        if (direction === 'up' && dy < -rowTolerance) {
            isValid = true;
            score = Math.abs(dy) + centerX * 0.01;
        }
        else if (direction === 'down' && dy > rowTolerance) {
            isValid = true;
            score = Math.abs(dy) + centerX * 0.01;
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

IPTVApp.prototype.getFocusables = function() {
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
    }
    var elements = document.querySelectorAll(selector);
    var visible = [];
    for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        if (!el.classList.contains('hidden') && el.offsetParent !== null && !el.closest('.collapsible-content.collapsed')) {
            visible.push(el);
        }
    }
    return visible;
};

IPTVApp.prototype.getDetailsZone = function(element) {
    if (element.classList.contains('favorite-star')) return 'favorite';
    if (element.classList.contains('download-btn')) return 'download';
    if (element.classList.contains('action-btn')) return 'actions';
    if (element.classList.contains('version-btn')) return 'versions';
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
    var zoneOrder = ['favorite', 'download', 'versions', 'description', 'actions', 'seasons', 'episodes', 'cast', 'director'];
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
    if (overflow > 0) {
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
            this.applyMarquee(textSpan, el.clientWidth - 30);
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
    document.querySelectorAll('.focused').forEach(function(el) {
        el.classList.remove('focused');
        el.querySelectorAll('.marquee, .marquee-wrapper').forEach(function(m) {
            var parent = m.classList.contains('marquee-wrapper') ? m.parentElement : m;
            self.clearMarquee(parent);
        });
    });
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
        else if (this.focusArea === 'actor') {
            el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
            this.scrollHorizontalGridToElement(el);
        }
        else {
            el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
        if (this.focusArea === 'grid') {
            var self = this;
            clearTimeout(this.imageLoadTimer);
            this.imageLoadTimer = setTimeout(function() {
                self.loadVisibleImages();
                self.loadVisibleEPG();
            }, 100);
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
