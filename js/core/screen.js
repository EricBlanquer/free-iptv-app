/**
 * Screen Manager Module
 * Handles screen transitions, loading states, toasts, and disclaimer
 */

IPTVApp.prototype.showDisclaimer = function() {
    var self = this;
    this.setHidden('disclaimer-modal', false);
    var btn = document.getElementById('disclaimer-accept-btn');
    if (btn) {
        btn.classList.add('focused');
        btn.focus();
    }
    this.disclaimerKeyHandler = function(e) {
        if (e.keyCode === 13) {
            self.acceptDisclaimer();
        }
        e.preventDefault();
        e.stopPropagation();
    };
    document.addEventListener('keydown', this.disclaimerKeyHandler, true);
};

IPTVApp.prototype.hideDisclaimer = function() {
    this.setHidden('disclaimer-modal', true);
    if (this.disclaimerKeyHandler) {
        document.removeEventListener('keydown', this.disclaimerKeyHandler, true);
        this.disclaimerKeyHandler = null;
    }
};

IPTVApp.prototype.bindDisclaimerButton = function() {
    var self = this;
    var btn = document.getElementById('disclaimer-accept-btn');
    if (btn) {
        btn.addEventListener('click', function() {
            self.acceptDisclaimer();
        });
    }
};

IPTVApp.prototype.bindTouchEvents = function() {
    var self = this;
    document.getElementById('details-wrapper').addEventListener('scroll', function() {
        if (self.hideAllButtonTooltips) self.hideAllButtonTooltips();
        if (self.hideTTSTooltip) self.hideTTSTooltip();
    });
    var swipeState = null;
    var SWIPE_TRIGGER_PX = 100;
    var SWIPE_MAX_VERTICAL_PX = 40;
    var createTrashIndicator = function(item) {
        var grid = document.getElementById('content-grid');
        if (!grid._prevPositionSet) {
            grid._prevPositionSet = true;
            grid._prevPosition = grid.style.position;
            grid.style.position = 'relative';
        }
        var trash = document.createElement('div');
        trash.className = 'swipe-trash-bg';
        var icon = document.createElement('span');
        icon.className = 'material-symbols-outlined';
        icon.textContent = 'delete';
        trash.appendChild(icon);
        trash.style.position = 'absolute';
        trash.style.top = item.offsetTop + 'px';
        trash.style.left = item.offsetLeft + 'px';
        trash.style.width = item.offsetWidth + 'px';
        trash.style.height = item.offsetHeight + 'px';
        trash.style.setProperty('--swipe-trash-slot', item.offsetHeight + 'px');
        trash.style.zIndex = '0';
        grid.appendChild(trash);
        item.style.zIndex = '1';
        return trash;
    };
    var destroyTrashIndicator = function(state) {
        if (state.trashEl) state.trashEl.remove();
        if (state.item) state.item.style.zIndex = '';
        var grid = document.getElementById('content-grid');
        if (grid._prevPositionSet) {
            grid.style.position = grid._prevPosition || '';
            grid._prevPositionSet = false;
        }
    };
    document.addEventListener('touchstart', function(e) {
        var item = e.target.closest('#content-grid .grid-item[data-is-download="1"]');
        if (!item || self.currentSection !== 'downloads') return;
        var touch = e.touches[0];
        swipeState = { item: item, startX: touch.clientX, startY: touch.clientY, dx: 0, cancelled: false, trashEl: null };
    }, { passive: true });
    document.addEventListener('touchmove', function(e) {
        if (!swipeState || swipeState.cancelled) return;
        var touch = e.touches[0];
        var dx = touch.clientX - swipeState.startX;
        var dy = touch.clientY - swipeState.startY;
        if (Math.abs(dy) > SWIPE_MAX_VERTICAL_PX) {
            swipeState.cancelled = true;
            swipeState.item.style.transform = '';
            swipeState.item.style.opacity = '';
            destroyTrashIndicator(swipeState);
            return;
        }
        if (dx > 0) {
            if (!swipeState.trashEl && dx > 5) {
                swipeState.trashEl = createTrashIndicator(swipeState.item);
            }
            var maxDx = swipeState.item.offsetHeight;
            var clampedDx = Math.min(dx, maxDx);
            swipeState.dx = clampedDx;
            swipeState.item.style.transform = 'translateX(' + clampedDx + 'px)';
            swipeState.item.style.opacity = String(Math.max(0.3, 1 - clampedDx / 300));
        }
    }, { passive: true });
    var endSwipe = function() {
        if (!swipeState) return;
        var state = swipeState;
        swipeState = null;
        if (state.cancelled) {
            destroyTrashIndicator(state);
            return;
        }
        var trigger = Math.min(SWIPE_TRIGGER_PX, state.item.offsetHeight * 0.7);
        if (state.dx >= trigger) {
            var grid = document.getElementById('content-grid');
            var items = grid.querySelectorAll('.grid-item');
            var idx = Array.prototype.indexOf.call(items, state.item);
            if (idx >= 0) {
                self._suppressNextClickUntil = Date.now() + 500;
                destroyTrashIndicator(state);
                self.removeDownloadAtIndex(idx);
                return;
            }
        }
        state.item.style.transition = 'transform 0.2s, opacity 0.2s';
        state.item.style.transform = '';
        state.item.style.opacity = '';
        setTimeout(function() {
            state.item.style.transition = '';
            destroyTrashIndicator(state);
        }, 250);
    };
    document.addEventListener('touchend', endSwipe, { passive: true });
    document.addEventListener('touchcancel', endSwipe, { passive: true });
    var areaMap = [
        { selector: '#player-tracks .player-track-btn', area: 'player-tracks' },
        { selector: '#resume-modal .modal-btn', area: 'modal' },
        { selector: '#confirm-modal .modal-btn', area: 'confirm-modal' },
        { selector: '#premium-modal .focusable', area: 'premium-modal' },
        { selector: '#add-category-modal .focusable', area: 'add-category-modal' },
        { selector: '#pattern-modal .focusable', area: 'pattern-modal' },
        { selector: '#playlist-selector .focusable', area: 'home' },
        { selector: '#home-grid .focusable', area: 'home' },
        { selector: '#continue-grid .continue-item', area: 'continue' },
        { selector: '#categories-list .category-item', area: 'sidebar' },
        { selector: '#filters-bar .focusable', area: 'filters' },
        { selector: '#content-grid .grid-item', area: 'grid' },
        { selector: '#details-screen .focusable', area: 'details' },
        { selector: '#actor-filmography-grid .tmdb-card', area: 'actor' },
        { selector: '#settings-screen .focusable', area: 'settings' },
        { selector: '#playlists-screen .focusable', area: 'playlists' },
        { selector: '#playlist-edit-screen .focusable', area: 'playlist-edit' }
    ];
    document.addEventListener('click', function(e) {
        if (self._suppressNextClickUntil && Date.now() < self._suppressNextClickUntil) return;
        var target = e.target;
        // Player track buttons
        var playerBtn = target.closest('#player-tracks .player-track-btn');
        if (playerBtn) {
            var visibleBtns = document.querySelectorAll('#player-tracks .player-track-btn.focusable:not(.hidden)');
            var idx = Array.prototype.indexOf.call(visibleBtns, playerBtn);
            if (idx < 0) return;
            self.playerTrackIndex = idx;
            if (!self.playerTracksFocused) {
                self.focusPlayerTracks();
            }
            self.updatePlayerTracksFocus();
            self.selectPlayerTrack();
            return;
        }
        // Player overlay tap (not on buttons) = toggle play/pause
        var isPlayerTap = target.closest('#player-screen') && !target.closest('#player-tracks') && !target.closest('.modal');
        if (!isPlayerTap && self.currentScreen === 'player' && target.closest('#loading')) {
            isPlayerTap = true;
        }
        if (isPlayerTap) {
            if (self.currentScreen === 'player') {
                var overlay = document.getElementById('player-overlay');
                var overlayVisible = overlay && !overlay.classList.contains('hidden');
                if (overlayVisible && self.player) {
                    self.stopSeek && self.stopSeek();
                    self.player.togglePlayPause();
                }
                self.showPlayerOverlay();
                return;
            }
        }
        // Guide programs
        var guideProgram = target.closest('.guide-program');
        if (guideProgram && self.currentScreen === 'guide') {
            var programs = document.querySelectorAll('.guide-program');
            for (var g = 0; g < programs.length; g++) {
                if (programs[g] === guideProgram) {
                    self.guideFocusedProgram = guideProgram;
                    self.selectGuideProgram();
                    return;
                }
            }
        }
        // Catchup modal items
        var catchupDay = target.closest('.catchup-day-btn');
        if (catchupDay) {
            var dayBtns = document.querySelectorAll('.catchup-day-btn');
            for (var d = 0; d < dayBtns.length; d++) {
                if (dayBtns[d] === catchupDay) {
                    self.catchupFocusArea = 'days';
                    self.catchupDayIndex = d;
                    self.selectCatchupItem();
                    return;
                }
            }
        }
        var catchupProg = target.closest('.catchup-program');
        if (catchupProg) {
            var progs = document.querySelectorAll('.catchup-program');
            for (var p = 0; p < progs.length; p++) {
                if (progs[p] === catchupProg) {
                    self.catchupFocusArea = 'programs';
                    self.catchupProgramIndex = p;
                    self.selectCatchupItem();
                    return;
                }
            }
        }
        // TTS voice items
        var ttsItem = target.closest('.tts-voice-item');
        if (ttsItem && self.ttsVoiceModalOpen) {
            var items = document.querySelectorAll('.tts-voice-item');
            for (var t = 0; t < items.length; t++) {
                if (items[t] === ttsItem) {
                    self.ttsVoiceFocusIndex = t;
                    self.selectTTSVoice();
                    return;
                }
            }
        }
        // Track selection modal items
        var trackItem = target.closest('.track-item');
        if (trackItem && self.focusArea === 'tracks') {
            var trackItems = document.querySelectorAll('.track-item:not(.hidden)');
            for (var ti = 0; ti < trackItems.length; ti++) {
                if (trackItems[ti] === trackItem) {
                    self.focusIndex = ti;
                    self.updateFocus();
                    self.confirmTrackSelection();
                    return;
                }
            }
        }
        // Generic focusable areas - handled by focus.js click handler
    });
};

IPTVApp.prototype.acceptDisclaimer = function() {
    try {
        localStorage.setItem('disclaimerAccepted', 'true');
    }
    catch (e) {}
    this.hideDisclaimer();
    this.startApp();
};

IPTVApp.prototype.resetScreens = function() {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
        screens[i].classList.remove('active');
    }
    document.getElementById('home-screen').classList.add('active');
    this.setHidden('player-title', true);
    this.setHidden('player-top-right', true);
    this.setHidden('player-overlay', true);
    this.currentScreen = 'home';
};

IPTVApp.prototype.showScreen = function(screen) {
    window.log('SCREEN ' + screen);
    if (this.hideAllTooltips) this.hideAllTooltips();
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
        screens[i].classList.remove('active');
    }
    document.getElementById(screen + '-screen').classList.add('active');
    this.currentScreen = screen;
    this.invalidateFocusables();
    var backBtn = document.getElementById('android-back-btn');
    if (backBtn) backBtn.style.display = (screen === 'player') ? 'none' : 'flex';
    if (screen !== 'player' && this._webUpdatePending && this._tryApplyWebUpdate) {
        var self = this;
        setTimeout(function() { self._tryApplyWebUpdate(); }, 500);
    }
    if (screen === 'browse' && (this._sidebarDirty || this._dynamicGridDirty)) {
        var section = this.currentSection;
        var data = section ? this.data[section] : null;
        if (this._sidebarDirty && data && data.categories && data.streams) {
            this.renderCategories(data.categories, data.streams);
        }
        this._sidebarDirty = false;
        if (this._dynamicGridDirty && section) {
            var categoryKey = (this.settings.activePlaylistId || '') + '_' + section;
            var currentCategory = this.selectedCategoryBySection[categoryKey];
            if (currentCategory) {
                this.loadStreams(currentCategory);
            }
        }
        this._dynamicGridDirty = false;
    }
};

IPTVApp.prototype.showLoading = function(show, posterUrl, message) {
    if (typeof posterUrl === 'string' && posterUrl.indexOf('http') !== 0 && posterUrl.indexOf('/') === -1 && posterUrl.indexOf('data:') !== 0) {
        message = posterUrl;
        posterUrl = null;
    }
    var backdrop = document.getElementById('loading-backdrop');
    var posterBg = backdrop.querySelector('.poster-bg');
    var loadingText = document.getElementById('loading-text');
    document.getElementById('loading').classList.toggle('hidden', !show);
    if (show && message) {
        loadingText.textContent = message;
    }
    else if (show) {
        loadingText.textContent = I18n.t('app.loading', 'Loading...');
    }
    window.log('showLoading: show=' + show + ' message=' + (message || '') + ' currentTmdbBackdrop=' + (this.currentTmdbBackdrop ? 'yes' : 'no') + ' posterUrl=' + (posterUrl ? 'yes' : 'no'));
    if (!show) {
        var imgDivs = document.querySelectorAll('#loading-backdrop .backdrop-img');
        for (var i = 0; i < imgDivs.length; i++) {
            imgDivs[i].style.backgroundImage = '';
        }
        backdrop.classList.remove('poster-mode', 'tmdb-mode');
        posterBg.style.backgroundImage = '';
    }
    else if (this.currentTmdbBackdrop) {
        backdrop.classList.add('poster-mode', 'tmdb-mode');
        this.setBackgroundImage(posterBg, this.currentTmdbBackdrop);
    }
    else if (posterUrl) {
        backdrop.classList.add('poster-mode');
        backdrop.classList.remove('tmdb-mode');
        this.setBackgroundImage(posterBg, posterUrl);
    }
    else {
        backdrop.classList.remove('poster-mode', 'tmdb-mode');
        posterBg.style.backgroundImage = '';
    }
};

IPTVApp.prototype.showToast = function(message, duration, isError, variant) {
    duration = duration || 3000;
    var existing = document.getElementById('toast-message');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'toast-message';
    toast.className = 'toast-message';
    if (isError) {
        toast.classList.add('toast-error');
    }
    else if (variant === 'discreet') {
        toast.classList.add('toast-discreet');
    }
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function() {
        if (toast.parentNode) toast.remove();
    }, duration);
};
