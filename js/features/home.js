/**
 * Home Screen Module
 * Handles home screen layout, visibility, and navigation
 */

IPTVApp.prototype.updateHomeMenuVisibility = function() {
    var configured = this.isIPTVConfigured();
    var playlist = this.getActivePlaylist();
    var isM3U = playlist && playlist.type === 'm3u';
    var homeButtons = document.querySelectorAll('#home-grid > .home-btn');
    var providerOnlySections = ['vod', 'series', 'sport', 'manga', 'entertainment', 'history'];
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
    this.renderCustomCategoryButtons(configured, isM3U, patterns);
    this.updateHomeGridLayout();
    if (this.focusArea === 'home') {
        this.clampHomeFocusIndex();
        this.updateFocus();
    }
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

IPTVApp.prototype.getHomeLiveButtonIndex = function() {
    var focusables = this.getFocusables();
    for (var i = 0; i < focusables.length; i++) {
        if (focusables[i].dataset && focusables[i].dataset.section === 'live') {
            return i;
        }
    }
    return 0;
};

IPTVApp.prototype.setDefaultHomeFocus = function() {
    if (this.focusArea === 'home') {
        this.focusIndex = this.getHomeLiveButtonIndex();
    }
};
