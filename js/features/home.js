/**
 * Home Screen Module
 * Handles home screen layout, visibility, and navigation
 */

var HOME_ICONS = {
    live: { emoji: '📡' },
    vod: { emoji: '🎬' },
    series: { emoji: '📺' },
    manga: { emoji: '🇯🇵' },
    sport: { emoji: '⚽' },
    entertainment: { emoji: '🎭' },
    history: { emoji: '🕒' },
    downloads: { emoji: '📁' },
    settings: { emoji: '⚙️' }
};

var HOME_THEME_PRESETS = {
    emoji: { icon: 'emoji', tile: 'flat' },
    aurora: { icon: 'image', tile: 'image', assetDir: 'assets/home/aurora/' }
};

IPTVApp.prototype.applyHomeTheme = function() {
    var grid = document.getElementById('home-grid');
    if (!grid) return;
    var theme = (this.settings && this.settings.homeTheme) || 'aurora';
    if (!HOME_THEME_PRESETS[theme]) theme = 'aurora';
    var savedTheme = theme;
    var licenseExpired = (typeof Premium !== 'undefined') && Premium.getState() === Premium.STATE_EXPIRED;
    if (licenseExpired) theme = 'emoji';
    var banner = document.getElementById('home-license-banner');
    if (banner) {
        banner.classList.toggle('hidden', !licenseExpired);
        if (licenseExpired) {
            var bannerKey = savedTheme === 'emoji' ? 'home.licenseExpiredPlain' : 'home.licenseExpired';
            banner.setAttribute('data-i18n', bannerKey);
            banner.textContent = I18n.t(bannerKey, 'License expired');
        }
    }
    var cfg = HOME_THEME_PRESETS[theme];
    var labelsOn = !this.settings || this.settings.homeLabels !== false;
    grid.setAttribute('data-home-theme', theme);
    grid.setAttribute('data-tile', cfg.tile);
    grid.setAttribute('data-labels', labelsOn ? 'on' : 'off');
    var homeScreen = document.getElementById('home-screen');
    if (homeScreen) homeScreen.setAttribute('data-home-theme', theme);
    if (document.body) document.body.setAttribute('data-home-theme', theme);
    var btns = grid.querySelectorAll('.home-btn');
    for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        if (btn.classList.contains('custom-category')) continue;
        var def = HOME_ICONS[btn.dataset.section];
        var iconEl = btn.querySelector('.home-icon');
        if (!def || !iconEl) continue;
        while (iconEl.firstChild) {
            iconEl.removeChild(iconEl.firstChild);
        }
        if (cfg.icon === 'image') {
            btn.classList.add('has-art');
            var img = document.createElement('img');
            img.className = 'home-art';
            img.src = cfg.assetDir + btn.dataset.section + '.png';
            img.alt = '';
            iconEl.appendChild(img);
        }
        else {
            btn.classList.remove('has-art');
            iconEl.textContent = def.emoji;
        }
    }
};

IPTVApp.prototype.updateHomeMenuVisibility = function() {
    var configured = this.isIPTVConfigured();
    var playlist = this.getActivePlaylist();
    var isM3U = playlist && playlist.type === 'm3u';
    var isJellyfin = playlist && playlist.type === 'jellyfin';
    var homeButtons = document.querySelectorAll('#home-grid > .home-btn');
    var providerOnlySections = ['vod', 'series', 'sport', 'manga', 'entertainment', 'history'];
    var jellyfinHiddenSections = ['live', 'sport', 'manga', 'entertainment'];
    var patterns = this.getCategoryPatterns();
    var hasPatterns = {
        sport: patterns.sport && patterns.sport.length > 0,
        manga: patterns.manga && patterns.manga.length > 0,
        entertainment: this.hasEntertainmentPatterns(patterns.entertainment)
    };
    var hiddenCategories = this.settings.hiddenDefaultCategories || [];
    window.log('updateHomeMenuVisibility: hasPatterns=' + JSON.stringify(hasPatterns) + ' hidden=' + JSON.stringify(hiddenCategories));
    for (var i = 0; i < homeButtons.length; i++) {
        var btn = homeButtons[i];
        var section = btn.dataset.section;
        var isHidden = hiddenCategories.indexOf(section) !== -1;
        var noPatterns = hasPatterns.hasOwnProperty(section) && !hasPatterns[section];
        if (section === 'settings') {
            btn.style.display = '';
        }
        else if (!configured) {
            btn.style.display = 'none';
        }
        else if (isM3U && providerOnlySections.indexOf(section) !== -1) {
            btn.style.display = 'none';
        }
        else if (isJellyfin && jellyfinHiddenSections.indexOf(section) !== -1) {
            btn.style.display = 'none';
        }
        else if (isHidden || noPatterns) {
            btn.style.display = 'none';
        }
        else {
            btn.style.display = '';
        }
    }
    var dlBtn = document.getElementById('home-downloads-btn');
    if (dlBtn) {
        dlBtn.style.display = this.hasAppDownloads() ? '' : 'none';
    }
    this.renderCustomCategoryButtons(configured, isM3U || isJellyfin, patterns);
    this.applyHomeTheme();
    this.updateHomeGridLayout();
    this.invalidateFocusables();
    if (this.focusArea === 'home') {
        this.clampHomeFocusIndex();
        this.updateFocus();
    }
    this.maybeAutoJumpToLive();
};

IPTVApp.prototype.renderCategoryIcon = function(iconData, container) {
    container.innerHTML = '';
    if (typeof iconData === 'object' && iconData.type === 'custom') {
        container.textContent = iconData.text || 'X';
        container.style.color = iconData.color || '#fff';
        container.style.background = iconData.bg || '#000';
        container.style.borderRadius = '16px';
        container.style.width = '80px';
        container.style.height = '80px';
        container.style.fontSize = '40px';
        container.style.fontWeight = 'bold';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
    }
    else {
        container.textContent = iconData || '📁';
        container.style.color = '';
        container.style.background = '';
        container.style.borderRadius = '';
        container.style.width = '';
        container.style.height = '';
        container.style.fontSize = '';
        container.style.fontWeight = '';
        container.style.display = '';
        container.style.alignItems = '';
        container.style.justifyContent = '';
    }
};

IPTVApp.prototype.renderCustomCategoryButtons = function(configured, isM3U, patterns) {
    var self = this;
    var historyBtn = document.querySelector('#home-grid .home-btn[data-section="history"]');
    if (!historyBtn) return;
    var existing = document.querySelectorAll('#home-grid .home-btn.custom-category');
    for (var j = 0; j < existing.length; j++) {
        existing[j].remove();
    }
    if (!configured || isM3U) return;
    var customCategories = this.settings.customCategories || [];
    for (var i = 0; i < customCategories.length; i++) {
        var cat = customCategories[i];
        var catPatterns = patterns[cat.id] || cat.keywords || [];
        if (catPatterns.length === 0) continue;
        var btn = document.createElement('div');
        btn.className = 'home-btn focusable custom-category';
        btn.dataset.section = cat.id;
        var icon = document.createElement('div');
        icon.className = 'home-icon';
        self.renderCategoryIcon(cat.icon, icon);
        btn.appendChild(icon);
        var name = document.createElement('span');
        name.textContent = cat.name;
        btn.appendChild(name);
        historyBtn.parentNode.insertBefore(btn, historyBtn);
    }
};

IPTVApp.prototype.maybeAutoJumpToLive = function() {
    if (!this._autoJumpPending) return;
    if (this.currentScreen !== 'home') return;
    var contentButtons = document.querySelectorAll('#home-grid > .home-btn:not([data-section="settings"])');
    var visible = [];
    for (var i = 0; i < contentButtons.length; i++) {
        if (contentButtons[i].style.display !== 'none') {
            visible.push(contentButtons[i].dataset.section);
        }
    }
    if (visible.length === 1 && visible[0] === 'live') {
        this._autoJumpPending = false;
        window.log('INIT', 'auto-jumping to Live (only section available)');
        this.openSection('live');
    }
    else if (visible.length > 0) {
        this._autoJumpPending = false;
    }
};

IPTVApp.prototype.hasEntertainmentPatterns = function(ent) {
    if (!ent) return false;
    var keys = ['concerts', 'theatre', 'spectacles', 'blindtest', 'karaoke'];
    for (var i = 0; i < keys.length; i++) {
        if (ent[keys[i]] && ent[keys[i]].length > 0) return true;
    }
    return false;
};

IPTVApp.prototype.getHomeGridCols = function() {
    var visibleCount = document.querySelectorAll('#home-grid .home-btn:not([style*="display: none"])').length;
    if (visibleCount <= 4) return 2;
    if (visibleCount <= 9) return 3;
    if (visibleCount <= 16) return 4;
    if (visibleCount <= 25) return 5;
    if (visibleCount <= 36) return 6;
    if (visibleCount <= 49) return 7;
    return 8;
};

IPTVApp.prototype.updateHomeGridLayout = function() {
    var grid = document.getElementById('home-grid');
    var cols = this.getHomeGridCols();
    grid.classList.remove('cols-2', 'cols-3', 'cols-4', 'cols-5', 'cols-6', 'cols-7', 'cols-8');
    grid.classList.add('cols-' + cols);
};

IPTVApp.prototype.clampHomeFocusIndex = function() {
    var focusables = this.getFocusables();
    var totalCount = focusables.length;
    if (this.focusIndex >= totalCount) {
        this.focusIndex = Math.max(0, totalCount - 1);
    }
};

IPTVApp.prototype.getHomeButtonIndexBySection = function(section) {
    if (!section) return -1;
    var focusables = this.getFocusables();
    for (var i = 0; i < focusables.length; i++) {
        if (focusables[i].dataset && focusables[i].dataset.section === section) {
            return i;
        }
    }
    return -1;
};

IPTVApp.prototype.getHomeLiveButtonIndex = function() {
    var idx = this.getHomeButtonIndexBySection('live');
    return idx >= 0 ? idx : 0;
};

IPTVApp.prototype.setDefaultHomeFocus = function() {
    if (this.focusArea !== 'home') return;
    var lastSection = this.settings && this.settings.lastViewedSection;
    if (lastSection) {
        var idx = this.getHomeButtonIndexBySection(lastSection);
        if (idx >= 0) {
            this.focusIndex = idx;
            return;
        }
    }
    this.focusIndex = this.getHomeLiveButtonIndex();
};
