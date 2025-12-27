/**
 * Selection and Navigation Handlers Module
 * Dispatch handlers for select() and goBack() actions
 */

IPTVApp.prototype.selectHandlers = {
    modal: function() {
        this.confirmResume(this.focusIndex === 0);
    },
    tracks: function() {
        this.confirmTrackSelection();
    },
    'pattern-modal': function(current) {
        if (current.id === 'pattern-save-btn') {
            window.log('ACTION', 'pattern-save');
            this.closePatternEditor(true);
        } else if (current.id === 'pattern-cancel-btn') {
            window.log('ACTION', 'pattern-cancel');
            this.closePatternEditor(false);
        } else if (current.id === 'pattern-add-btn') {
            var input = document.getElementById('pattern-add-input');
            window.log('ACTION', 'pattern-add-keyword: ' + input.value);
            this.addPatternKeyword(input.value);
        } else if (current.id === 'pattern-add-input' || current.id === 'pattern-category-name' || current.id === 'pattern-category-icon') {
            window.log('ACTION', 'open-keyboard: ' + current.id);
            this.openKeyboard(current.id);
        } else if (current.classList.contains('pattern-chip')) {
            var keyword = current.dataset.keyword;
            var subcategory = current.dataset.subcategory;
            window.log('ACTION', 'pattern-remove-keyword: ' + keyword + ' subcat=' + subcategory);
            this.removePatternKeyword(keyword, subcategory);
        } else if (current.classList.contains('pattern-subcategory-tab')) {
            this.selectPatternSubcategory(current.dataset.subcategory);
        } else if (current.id === 'pattern-use-tmdb-toggle' || current.classList.contains('settings-toggle')) {
            var toggle = current.id === 'pattern-use-tmdb-toggle' ? current : current.closest('.settings-toggle');
            if (toggle) {
                var newValue = toggle.dataset.value === 'yes' ? 'no' : 'yes';
                toggle.dataset.value = newValue;
                var toggleOpts = toggle.querySelectorAll('.toggle-option');
                for (var ti = 0; ti < toggleOpts.length; ti++) {
                    if (toggleOpts[ti].dataset.value === newValue) {
                        toggleOpts[ti].classList.add('active');
                    } else {
                        toggleOpts[ti].classList.remove('active');
                    }
                }
            }
        } else if (current.classList.contains('icon-type-btn') && current.closest('#pattern-icon-type-toggle')) {
            this.handlePatternIconTypeToggle(current.dataset.type);
        } else if (current.classList.contains('icon-option') && current.closest('#pattern-icon-emoji-section')) {
            this.handlePatternEmojiSelect(current.dataset.icon);
        } else if (current.classList.contains('color-option')) {
            var palette = current.closest('#pattern-text-color-palette') ? 'text' : 'bg';
            this.handlePatternColorSelect(palette, current.dataset.color);
        }
    },
    'add-category-modal': function() {
        this.handleAddCategorySelect();
    },
    'confirm-modal': function(current) {
        if (current.id === 'confirm-yes-btn') {
            this.confirmModalAction(true);
        } else if (current.id === 'confirm-no-btn') {
            this.confirmModalAction(false);
        }
    },
    'continue': function(current) {
        var itemId = current.dataset.itemId;
        var itemType = current.dataset.itemType;
        var itemName = current.dataset.itemName;
        var playlistId = current.dataset.playlistId || null;
        this.playFromHistory(itemId, itemType, itemName, playlistId);
    },
    home: function(current) {
        if (current.dataset.playlistId) {
            this.switchPlaylist(current.dataset.playlistId);
            return;
        }
        this.lastHomeIndex = this.focusIndex;
        var section = current.dataset.section;
        this.openSection(section);
    },
    sidebar: function(current) {
        this.lastSidebarIndex = this.focusIndex;
        var categoryId = current.dataset.categoryId;
        this.loadStreams(categoryId);
    },
    filters: function(current) {
        if (current.classList.contains('sort-btn')) {
            var sortType = current.dataset.sort;
            this.applySort(sortType);
        } else if (current.id === 'edit-favorites-btn') {
            this.toggleFavoritesEditMode();
        } else if (current.classList.contains('view-btn')) {
            var viewMode = current.dataset.view;
            this.setViewMode(viewMode);
        } else if (current.classList.contains('rating-star')) {
            var rating = parseInt(current.dataset.rating);
            this.applyRatingFilter(rating);
        } else if (current.classList.contains('filter-input')) {
            this.openKeyboard(current.id);
        }
    },
    grid: function(current) {
        if (this.favoritesEditMode && (this.currentSection === 'favorites' || this.inFilteredFavorites)) {
            this.selectFavoriteToMove();
            return;
        }
        if (this.currentSection === 'downloads') {
            this.removeDownloadAtIndex(this.focusIndex);
            return;
        }
        if (current.classList.contains('actor-search-result')) {
            var actorId = current.dataset.actorId;
            this.lastGridIndex = this.focusIndex;
            this.showActor(actorId);
            return;
        }
        if (current.dataset.categoryId === 'guide') {
            this.showTVGuide();
            return;
        }
        this.lastGridIndex = this.focusIndex;
        var streamId = current.dataset.streamId;
        var streamType = current.dataset.streamType;
        if (streamType === 'live' || streamType === 'sport') {
            var stream = this.findStreamById(streamId, streamType) || this.findFavoriteStream(streamId);
            this.selectedStream = null;
            this.playStream(streamId, 'live', stream);
        } else if (this.currentSection === 'history' && streamType === 'series') {
            var streamData = this.currentStreams.find(function(s) {
                return (s.stream_id || s.series_id) == streamId;
            });
            if (streamData && streamData._episodeId) {
                this.playSeriesFromHistory(streamData);
            } else {
                this.showDetails(current);
            }
        } else if (this.currentSection === 'history' && streamType === 'vod') {
            var streamData = this.currentStreams.find(function(s) {
                return (s.stream_id || s.series_id) == streamId;
            });
            if (streamData) {
                this.playVodFromHistory(streamData);
            } else {
                this.showDetails(current);
            }
        } else {
            this.showDetails(current);
        }
    },
    details: function(current) {
        if (current.id === 'details-description') {
            this.toggleDescriptionTTS();
            return;
        } else if (current.classList.contains('version-btn')) {
            var versionIndex = parseInt(current.dataset.versionIndex);
            this.playVersion(versionIndex);
        } else if (current.id === 'play-btn') {
            this.playCurrentStream(false);
        } else if (current.id === 'continue-btn') {
            this.playCurrentStream(true);
        } else if (current.id === 'mark-watched-btn') {
            this.markAsWatched();
        } else if (current.id === 'download-btn' || current.classList.contains('download-btn')) {
            this.triggerFreeboxDownload();
        } else if (current.id === 'favorite-btn' || current.classList.contains('favorite-star')) {
            window.log('ACTION', 'Favorite click: selectedStream=' + JSON.stringify(this.selectedStream ? {id: this.selectedStream.id, type: this.selectedStream.type, hasData: !!this.selectedStream.data} : null));
            this.toggleFavorite(this.selectedStream.data || this.selectedStream, this.selectedStream.type);
        } else if (current.classList.contains('cast-card')) {
            var actorId = current.dataset.actorId;
            this.lastDetailsIndex = this.focusIndex;
            this.pushDetailsState();
            this.showActor(actorId);
        } else if (current.id === 'download-season-btn' || current.classList.contains('download-season-btn')) {
            this.triggerFreeboxSeasonDownload();
        } else if (current.classList.contains('season-btn')) {
            var season = parseInt(current.dataset.season);
            this.selectSeason(season);
        } else if (current.classList.contains('version-btn')) {
            var versionId = current.dataset.versionId;
            this.selectSeriesVersion(versionId);
        } else if (current.classList.contains('episode-item')) {
            if (this._episodeSelectMode) {
                this.toggleEpisodeSelection(current.dataset.episodeId);
                return;
            }
            var episodeId = current.dataset.episodeId;
            this.playEpisode(episodeId);
        }
    },
    actor: function(current) {
        if (current.id === 'actor-bio') {
            this.toggleDescriptionTTS('actor-bio');
            return;
        }
        if (current.classList.contains('filmography-item')) {
            this.lastActorIndex = this.focusIndex;
            this.showDetailsFromTMDB(current);
        }
    },
    settings: function() {
        this.handleSettingsSelect();
    },
    playlists: function() {
        this.handlePlaylistsSelect();
    },
    'playlist-edit': function() {
        this.handlePlaylistEditSelect();
    }
};

IPTVApp.prototype.backHandlers = {
    'focusArea:modal': function() {
        this.hideResumeModal();
    },
    'focusArea:tracks': function() {
        this.hideTracksModal();
    },
    'focusArea:sub-options': function() {
        this.hideSubtitleOptionsModal();
    },
    'focusArea:pattern-modal': function() {
        this.closePatternEditor(false);
    },
    'focusArea:add-category-modal': function() {
        this.closeAddCategoryModal(false);
    },
    'focusArea:confirm-modal': function() {
        this.confirmModalAction(false);
    },
    'focusArea:tts-voice-modal': function() {
        this.hideTTSVoiceModal();
    },
    'screen:catchup-modal': function() {
        this.hideCatchupModal();
    },
    'screen:player': function() {
        var overlay = document.getElementById('player-overlay');
        var overlayVisible = overlay && !overlay.classList.contains('hidden');
        var isBuffering = this.isBuffering || (this.bufferPercent !== undefined && this.bufferPercent < 100);
        if (overlayVisible && !isBuffering) {
            this.clearTimer('overlayTimer');
            if (this.playerTracksFocused) {
                this.unfocusPlayerTracks(true);
            } else {
                this.setHidden(overlay, true);
                this.setHidden('player-title', true);
                this.setHidden('player-top-right', true);
            }
            return;
        }
        if (this.currentPlayingType === 'catchup' && this.catchupParams && this.catchupParams.stream) {
            var stream = this.catchupParams.stream;
            this.returnToLiveAfterCatchup = true;
            this.player.stop();
            this.showScreen('browse');
            this.currentScreen = 'browse';
            this.showCatchupModal(stream);
            return;
        }
        this.stopPlayback();
    },
    'screen:lang': function() {
        this.showScreen('home');
        this.currentScreen = 'home';
        this.setFocus('langBtn', 0);
    },
    'screen:continue': function() {
        this.showScreen('home');
        this.currentScreen = 'home';
        this.focusArea = 'home';
        this.focusIndex = this.lastHomeIndex;
        this.updateFocus();
    },
    'screen:actor': function() {
        if (this.actorSearchResults) {
            this.showScreen('browse');
            this.currentScreen = 'browse';
            this.renderActorResults(this.actorSearchResults);
            this.focusArea = 'grid';
            this.focusIndex = this.lastGridIndex;
            this.updateFocus();
        } else {
            this.popDetailsState();
            this.showScreen('details');
            this.currentScreen = 'details';
            this.focusArea = 'details';
            this.focusIndex = this.lastDetailsIndex;
            this.updateFocus();
        }
    },
    'screen:details': function() {
        if (this._episodeSelectMode) {
            this.exitEpisodeSelectMode();
            return;
        }
        this.stopTTS();
        this.clearTTSPreload();
        if (this.previousScreen === 'actor' && (this.detailsReturnActorId || this.currentActorId)) {
            var actorId = this.detailsReturnActorId || this.currentActorId;
            this.previousScreen = null;
            this.detailsReturnActorId = null;
            this.showActor(actorId);
        } else if (this.currentSection === 'history') {
            this.showHistoryScreen();
        } else {
            this.showScreen('browse');
            this.currentScreen = 'browse';
            this.focusArea = 'grid';
            this.focusIndex = this.lastGridIndex;
            this.updateGridProgress();
            this.updateFocus();
        }
    },
    'screen:browse': function() {
        if (this.favoritesEditMode) {
            this.favoritesEditMode = false;
            this.movingFavoriteIndex = -1;
            document.getElementById('content-grid').classList.remove('edit-mode');
            document.querySelectorAll('#content-grid .grid-item.moving').forEach(function(el) {
                el.classList.remove('moving');
            });
            this.saveFavorites();
        }
        this.showScreen('home');
        this.currentScreen = 'home';
        this.focusArea = 'home';
        this.focusIndex = this.lastHomeIndex;
        this.updateFocus();
    },
    'screen:settings': function() {
        this.showScreen('home');
        this.currentScreen = 'home';
        this.focusArea = 'home';
        this.updateHomeMenuVisibility();
        if (this.isIPTVConfigured() && !this.api) {
            this.autoConnect();
        }
        this.focusIndex = this.isIPTVConfigured() ? this.lastHomeIndex : 0;
        this.clampHomeFocusIndex();
        this.updateFocus();
    },
    'screen:playlists': function() {
        this.showSettings();
    },
    'screen:playlist-edit': function() {
        this.showPlaylists();
    },
    'screen:guide': function() {
        this.stopGuideTimeIndicator();
        this.showScreen('browse');
        this.currentScreen = 'browse';
        this.focusArea = 'grid';
        var guideIdx = 0;
        var gridItems = document.querySelectorAll('#content-grid .grid-item');
        gridItems.forEach(function(item, i) {
            if (item.dataset.categoryId === 'guide') guideIdx = i;
        });
        this.focusIndex = guideIdx;
        this.updateFocus();
    },
    'screen:home': function() {
        window.log('ACTION', 'exit');
        if (typeof tizen !== 'undefined') {
            tizen.application.getCurrentApplication().exit();
        }
    }
};

IPTVApp.prototype.select = function() {
    var focusables = this.getFocusables();
    var current = focusables[this.focusIndex];
    if (!current) return;
    var selectInfo = current.id || current.dataset.action || current.dataset.streamId || current.className.split(' ')[0];
    window.log('ACTION', 'select ' + selectInfo);
    var handler = this.selectHandlers[this.focusArea];
    if (handler) {
        handler.call(this, current);
    }
};

IPTVApp.prototype.goBack = function() {
    window.log('ACTION', 'goBack screen=' + this.currentScreen);
    if (this.ttsSpeaking || this.ttsLoading) {
        this.stopTTS();
        return;
    }
    this.showLoading(false);
    var focusHandler = this.backHandlers['focusArea:' + this.focusArea];
    if (focusHandler) {
        focusHandler.call(this);
        return;
    }
    var screenHandler = this.backHandlers['screen:' + this.currentScreen];
    if (screenHandler) {
        screenHandler.call(this);
    }
};
