/**
 * Favorites Module
 * Handles favorites display, editing, and reordering
 */

IPTVApp.prototype.updateFavoriteButton = function() {
    var favBtn = document.getElementById('favorite-btn');
    if (favBtn && this.selectedStream) {
        var idToCheck = this.selectedStream.seriesId || this.selectedStream.id;
        var playlistId = this.selectedStream._playlistId || this.selectedStream.playlistId || this.settings.activePlaylistId;
        var isFav = this.isFavorite(idToCheck, playlistId);
        favBtn.textContent = isFav ? '★' : '☆';
        favBtn.classList.toggle('is-favorite', isFav);
    }
};

IPTVApp.prototype.showFavoritesInGrid = function() {
    var container = document.getElementById('content-grid');
    container.innerHTML = '';
    var self = this;
    var section = this.currentSection;
    this.filteredFavoriteIndices = [];
    var filteredFavorites = [];
    var vodSubsections = ['sport', 'entertainment', 'manga'];
    var isVodSubsection = vodSubsections.indexOf(section) !== -1;
    var isCustom = section.indexOf('custom_') === 0;
    this.favorites.forEach(function(fav, idx) {
        var favType = fav._type || 'vod';
        var favSection = fav._section || favType;
        var match = false;
        if (isVodSubsection || isCustom) {
            match = favSection === section;
        }
        else if (section === 'live') match = favType === 'live';
        else if (section === 'vod') match = favType === 'vod' && vodSubsections.indexOf(favSection) === -1;
        else if (section === 'series') match = favType === 'series';
        else match = true;
        if (match) {
            filteredFavorites.push(fav);
            self.filteredFavoriteIndices.push(idx);
        }
    });
    var editBtn = document.getElementById('edit-favorites-btn');
    editBtn.classList.toggle('hidden', filteredFavorites.length === 0);
    editBtn.classList.remove('selected');
    this.favoritesEditMode = false;
    this.inFilteredFavorites = true;
    var viewModes = this.settings.viewMode;
    if (!viewModes || Array.isArray(viewModes)) {
        viewModes = {};
        this.settings.viewMode = viewModes;
    }
    var favKey = 'favorites_' + section;
    var listDefaultSections = ['live', 'sport', 'entertainment'];
    var sectionDefault = listDefaultSections.indexOf(section) !== -1 ? 'list' : 'grid';
    var defaultMode = viewModes[section] || sectionDefault;
    var viewMode = viewModes[favKey] || defaultMode;
    container.classList.toggle('list-view', viewMode === 'list');
    document.querySelectorAll('.view-btn').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.view === viewMode);
    });
    if (filteredFavorites.length === 0) {
        this.showEmptyMessage(container, 'home.noFavorites', 'No favorites');
        return;
    }
    this.originalStreams = filteredFavorites;
    this.currentStreams = filteredFavorites;
    this.currentStreamType = section === 'live' ? 'live' : (section === 'series' ? 'series' : 'vod');
    if (section === 'live') {
        this.liveChannelList = filteredFavorites;
    }
    this.displayedCount = 0;
    this.loadMoreItems();
};

IPTVApp.prototype.showFavoritesScreen = function() {
    this.currentSection = 'favorites';
    this.currentStreamType = 'favorites';
    this.favoritesEditMode = false;
    this.inFilteredFavorites = false;
    this.filteredFavoriteIndices = null;
    this.showScreen('browse');
    this.currentScreen = 'browse';
    document.getElementById('sidebar-title').textContent = I18n.t('home.favorites', 'Favorites');
    this.showElement('filters-bar');
    this.hideElement('search-filters');
    this.hideElement('sort-filters');
    this.hideElement('sidebar');
    var editBtn = document.getElementById('edit-favorites-btn');
    editBtn.classList.toggle('hidden', this.favorites.length === 0);
    editBtn.classList.remove('selected');
    var container = document.getElementById('categories-list');
    container.innerHTML = '';
    if (this.favorites.length === 0) {
        this.showEmptyMessage('content-grid', 'home.noFavorites', 'No favorites');
    }
    else {
        this.renderGrid(this.favorites, 'favorites');
    }
    this.focusArea = 'grid';
    this.focusIndex = 0;
    this.deferUpdateFocus();
};

IPTVApp.prototype.toggleFavoritesEditMode = function() {
    window.log('ACTION toggleFavoritesEditMode: ' + !this.favoritesEditMode);
    this.favoritesEditMode = !this.favoritesEditMode;
    this.movingFavoriteIndex = -1;
    var editBtn = document.getElementById('edit-favorites-btn');
    var grid = document.getElementById('content-grid');
    if (this.favoritesEditMode) {
        editBtn.classList.add('selected');
        grid.classList.add('edit-mode');
        this.focusArea = 'grid';
        this.updateFocus();
    }
    else {
        editBtn.classList.remove('selected');
        grid.classList.remove('edit-mode');
        document.querySelectorAll('#content-grid .grid-item.moving').forEach(function(el) {
            el.classList.remove('moving');
        });
        this.saveFavorites();
    }
};

IPTVApp.prototype.selectFavoriteToMove = function() {
    if (!this.favoritesEditMode) return;
    if (this.currentSection !== 'favorites' && !this.inFilteredFavorites) return;
    window.log('ACTION selectFavoriteToMove: idx=' + this.focusIndex + ' moving=' + this.movingFavoriteIndex);
    var items = document.querySelectorAll('#content-grid .grid-item');
    if (this.movingFavoriteIndex >= 0) {
        items[this.movingFavoriteIndex].classList.remove('moving');
        this.movingFavoriteIndex = -1;
        this.saveFavorites();
    }
    else {
        this.movingFavoriteIndex = this.focusIndex;
        if (items[this.focusIndex]) {
            items[this.focusIndex].classList.add('moving');
        }
    }
};

IPTVApp.prototype.moveFavorite = function(direction) {
    if (!this.favoritesEditMode) return false;
    if (this.currentSection !== 'favorites' && !this.inFilteredFavorites) return false;
    if (this.movingFavoriteIndex < 0) return false;
    var isListView = document.getElementById('content-grid').classList.contains('list-view');
    var cols = isListView ? 1 : this.gridColumns;
    var currentIndex = this.movingFavoriteIndex;
    var newIndex;
    if (direction === 'up') {
        newIndex = currentIndex - cols;
    }
    else if (direction === 'down') {
        newIndex = currentIndex + cols;
    }
    else if (direction === 'left') {
        newIndex = currentIndex - 1;
    }
    else if (direction === 'right') {
        newIndex = currentIndex + 1;
    }
    var maxIndex = this.inFilteredFavorites ? this.filteredFavoriteIndices.length : this.favorites.length;
    if (newIndex < 0 || newIndex >= maxIndex) return false;
    if (this.inFilteredFavorites && this.filteredFavoriteIndices) {
        var realCurrentIdx = this.filteredFavoriteIndices[currentIndex];
        var realNewIdx = this.filteredFavoriteIndices[newIndex];
        var temp = this.favorites[realCurrentIdx];
        this.favorites[realCurrentIdx] = this.favorites[realNewIdx];
        this.favorites[realNewIdx] = temp;
        var tempIdx = this.filteredFavoriteIndices[currentIndex];
        this.filteredFavoriteIndices[currentIndex] = this.filteredFavoriteIndices[newIndex];
        this.filteredFavoriteIndices[newIndex] = tempIdx;
    }
    else {
        var temp = this.favorites[currentIndex];
        this.favorites[currentIndex] = this.favorites[newIndex];
        this.favorites[newIndex] = temp;
    }
    var items = document.querySelectorAll('#content-grid .grid-item');
    var currentEl = items[currentIndex];
    var targetEl = items[newIndex];
    if (currentEl && targetEl) {
        var parent = currentEl.parentNode;
        currentEl.classList.remove('moving');
        var placeholder = document.createElement('div');
        parent.insertBefore(placeholder, currentEl);
        parent.insertBefore(currentEl, targetEl);
        parent.insertBefore(targetEl, placeholder);
        parent.removeChild(placeholder);
        currentEl.classList.add('moving');
    }
    this.movingFavoriteIndex = newIndex;
    this.focusIndex = newIndex;
    this.updateFocus();
    return true;
};
