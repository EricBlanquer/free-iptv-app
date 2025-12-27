/**
 * Utility Functions Module
 * Common helpers to reduce code duplication
 */

function proxyDuidParam() {
    var duid = localStorage.getItem('deviceId') || '';
    return duid ? '&duid=' + encodeURIComponent(duid) : '';
}

function formatMs(ms) {
    if (ms <= 0) return '0s';
    var seconds = Math.floor(ms / 1000);
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    var remainingMs = ms % 1000;
    if (h > 0) return h + 'h' + (m > 0 ? m + 'm' : '') + (s > 0 ? s + 's' : '');
    if (m > 0) return m + 'm' + (s > 0 ? s + 's' : '');
    if (s > 0) return remainingMs > 0 ? s + 's' + remainingMs + 'ms' : s + 's';
    return remainingMs + 'ms';
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    var minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return I18n.t('time.now', 'now');
    if (minutes === 1) return I18n.t('time.minuteAgo', '1 min ago');
    if (minutes < 60) return I18n.t('time.minutesAgo', '{n} min ago').replace('{n}', minutes);
    var hours = Math.floor(minutes / 60);
    if (hours === 1) return I18n.t('time.hourAgo', '1 hour ago');
    if (hours < 24) return I18n.t('time.hoursAgo', '{n} hours ago').replace('{n}', hours);
    var days = Math.floor(hours / 24);
    if (days === 1) return I18n.t('time.dayAgo', '1 day ago');
    if (days < 30) return I18n.t('time.daysAgo', '{n} days ago').replace('{n}', days);
    var months = Math.floor(days / 30);
    if (months === 1) return I18n.t('time.monthAgo', '1 month ago');
    return I18n.t('time.monthsAgo', '{n} months ago').replace('{n}', months);
}

IPTVApp.prototype.setFocus = function(area, index) {
    this.focusArea = area;
    this.focusIndex = index !== undefined ? index : 0;
    this.updateFocus();
};

IPTVApp.prototype.deferUpdateFocus = function() {
    var self = this;
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            self.updateFocus();
        });
    });
};

IPTVApp.prototype.showEmptyMessage = function(container, messageKey, defaultText) {
    if (typeof container === 'string') {
        container = document.getElementById(container);
    }
    container.innerHTML = '<div style="color:#888;font-size:24px;padding:40px;">' + I18n.t(messageKey, defaultText) + '</div>';
};

IPTVApp.prototype.showStreamGrid = function(streams, streamType) {
    this.originalStreams = streams;
    this.currentStreams = streams;
    this.currentStreamType = streamType;
    this.displayedCount = 0;
    this.loadMoreItems();
    this.setFocus('grid', 0);
};

IPTVApp.prototype.initBrowseScreen = function(section, streamType, titleKey, titleDefault) {
    this.currentSection = section;
    this.currentStreamType = streamType;
    this.showScreen('browse');
    this.currentScreen = 'browse';
    document.getElementById('sidebar-title').textContent = I18n.t(titleKey, titleDefault);
    this.showElement('filters-bar');
    this.hideElement('search-filters');
    this.hideElement('sort-filters');
    this.hideElement('sidebar');
    this.setHidden('view-mode-filters', false);
    document.getElementById('categories-list').innerHTML = '';
};

IPTVApp.prototype.goToScreen = function(screen, area, index) {
    this.showScreen(screen);
    this.currentScreen = screen;
    this.focusArea = area;
    this.focusIndex = index !== undefined ? index : 0;
    this.updateFocus();
};

IPTVApp.prototype.formatTime = function(hours, minutes) {
    var h = (hours < 10 ? '0' : '') + hours;
    var m = (minutes < 10 ? '0' : '') + minutes;
    return h + 'h' + m;
};

IPTVApp.prototype.formatTimeColon = function(hours, minutes) {
    var h = (hours < 10 ? '0' : '') + hours;
    var m = (minutes < 10 ? '0' : '') + minutes;
    return h + ':' + m;
};

IPTVApp.prototype.getTodayMidnight = function() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
};

IPTVApp.prototype.findById = function(array, id) {
    if (!array) return null;
    for (var i = 0; i < array.length; i++) {
        if (this.sameId(array[i].id, id)) {
            return array[i];
        }
    }
    return null;
};

IPTVApp.prototype.findByStreamId = function(array, streamId) {
    if (!array) return null;
    for (var i = 0; i < array.length; i++) {
        var item = array[i];
        if (this.sameId(this.getStreamId(item), streamId)) {
            return item;
        }
    }
    return null;
};

IPTVApp.prototype.sameId = function(id1, id2) {
    return String(id1) === String(id2);
};

IPTVApp.prototype.getStreamId = function(stream) {
    if (!stream) return null;
    return stream.stream_id || stream.series_id || stream.vod_id || stream.id;
};

IPTVApp.prototype.ratingToStars = function(rating) {
    return Math.round((rating || 0) / 2);
};

IPTVApp.prototype.getStreamTitle = function(stream) {
    if (!stream) return '';
    return stream.name || stream.title || '';
};

IPTVApp.prototype.getStreamImage = function(stream) {
    if (!stream) return '';
    return stream.stream_icon || stream.cover || '';
};

IPTVApp.prototype.getStreamProxyUrl = function() {
    if (!this.settings.proxyEnabled || !this.settings.proxyUrl || this.settings.streamProxy === false) return '';
    return this.settings.proxyUrl;
};

IPTVApp.prototype.proxyImageUrl = function(url) {
    if (!url || !this.getStreamProxyUrl()) return url;
    if (url.indexOf('tmdb.org') !== -1) return url;
    return this.settings.proxyUrl.replace(/\/+$/, '') + '/image?url=' + encodeURIComponent(url) + proxyDuidParam();
};

IPTVApp.prototype.optimizeTmdbImageUrl = function(url, size) {
    if (!url || url.indexOf('image.tmdb.org/t/p/') === -1) return url;
    return url.replace(/\/t\/p\/[^/]+\//, '/t/p/' + (size || 'w300') + '/');
};

IPTVApp.prototype.showElement = function(element) {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    if (element) {
        element.classList.remove('hidden');
        element.style.display = '';
    }
};

IPTVApp.prototype.hideElement = function(element) {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    if (element) element.style.display = 'none';
};

IPTVApp.prototype.padZero = function(num, length) {
    var s = String(num);
    while (s.length < (length || 2)) s = '0' + s;
    return s;
};

IPTVApp.prototype.clearElement = function(element) {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    if (element) element.innerHTML = '';
};

IPTVApp.prototype.parseDelimitedList = function(text, delimiter) {
    if (!text) return [];
    return text.split(delimiter || ',').map(function(item) {
        return item.trim();
    }).filter(function(item) {
        return item;
    });
};

IPTVApp.prototype.renderStarRating = function(rating) {
    var starCount = this.ratingToStars(rating);
    var emptyCount = 5 - starCount;
    var html = '★'.repeat(starCount);
    if (emptyCount > 0) {
        html += '<span class="empty-stars">' + '☆'.repeat(emptyCount) + '</span>';
    }
    return html;
};

IPTVApp.prototype.setBackgroundImage = function(element, url) {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    if (element) element.style.backgroundImage = cssUrl(this.proxyImageUrl(url));
};

IPTVApp.prototype.setHidden = function(element, hide) {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    if (element) element.classList.toggle('hidden', hide);
};

IPTVApp.prototype.saveFocusIndex = function(area) {
    var prop = 'last' + area.charAt(0).toUpperCase() + area.slice(1) + 'Index';
    this[prop] = this.focusIndex;
};

IPTVApp.prototype.restoreFocusIndex = function(area, defaultIndex) {
    var prop = 'last' + area.charAt(0).toUpperCase() + area.slice(1) + 'Index';
    this.focusIndex = this[prop] !== undefined ? this[prop] : (defaultIndex || 0);
};

IPTVApp.prototype.clearTimer = function(timerName) {
    if (this[timerName]) {
        clearTimeout(this[timerName]);
        this[timerName] = null;
    }
};

IPTVApp.prototype.getElementCenter = function(element) {
    var rect = element.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        rect: rect
    };
};
