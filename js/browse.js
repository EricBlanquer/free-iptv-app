/**
 * Browse module - Categories, grid, and filters
 * Handles category navigation, content grid, filtering and sorting
 */

// Format history date (day only, no time)
IPTVApp.prototype.formatHistoryDate = function(timestamp) {
    if (!timestamp) return '';
    var date = new Date(timestamp);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var yesterday = new Date(today.getTime() - 86400000);
    var itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (itemDate.getTime() === today.getTime()) {
        return I18n.t('catchup.today', 'Today');
    }
    if (itemDate.getTime() === yesterday.getTime()) {
        return I18n.t('catchup.yesterday', 'Yesterday');
    }
    var day = date.getDate().toString().padStart(2, '0');
    var month = (date.getMonth() + 1).toString().padStart(2, '0');
    return day + '/' + month;
};

// Get day key for deduplication
IPTVApp.prototype.getHistoryDayKey = function(timestamp) {
    var date = new Date(timestamp);
    return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
};

// Strip category/stream/quality prefix
IPTVApp.prototype.stripCategoryPrefix = function(title) {
    if (!title) return '';
    // Remove invisible characters (LTR mark, zero-width chars, etc.) at the start
    var clean = title.replace(/^[\u200E\u200F\u200B\u200C\u200D\uFEFF]+/, '');
    // First try quality prefix (4K|, 3D|, SD|, etc.)
    var result = clean.replace(Regex.qualityPrefix, '');
    if (result !== clean) return result;
    // Then try category prefix (FR|, EN|, etc.)
    result = clean.replace(Regex.categoryPrefix, '');
    if (result !== clean) return result;
    // Finally try stream prefix
    return clean.replace(Regex.streamPrefix, '');
};

// Set category item text with marquee span wrapper
IPTVApp.prototype.setCategoryText = function(element, text) {
    var span = document.createElement('span');
    span.className = 'category-text';
    span.textContent = text;
    element.appendChild(span);
};

// Parse and format category name, returns object with all display info
IPTVApp.prototype.parseCategoryName = function(categoryName) {
    var name = categoryName || '';
    var upperName = name.toUpperCase();
    var isCanadian = upperName.startsWith('CA|');
    var isSD = upperName.startsWith('SD|');
    var isVostfr = Regex.vostfr.test(upperName);
    var showFlags = this.settings.providerLanguage === 'ALL';
    var langPrefix = '';
    var langCode = '';
    var prefixMatch = name.match(Regex.categoryPrefix);
    if (prefixMatch && Regex.langCode.test(prefixMatch[1])) {
        var code = prefixMatch[1].toUpperCase();
        langCode = this.langAliases[code] || code;
        langPrefix = getFlag(langCode) || '[' + langCode + ']';
    }
    name = this.stripCategoryPrefix(name);
    if (Regex.contentTypePrefix) {
        name = name.replace(Regex.contentTypePrefix, '');
    }
    name = name.replace(Regex.seriesWord, '').replace(Regex.vfq, '').trim();
    name = this.formatDisplayTitle(name);
    if (isCanadian) name += ' (Canadien)';
    if (isSD) name += ' (SD)';
    if (isVostfr && !Regex.vostfr.test(name)) {
        name += ' (VOSTFR)';
    }
    if (isVostfr) {
        langCode = 'FR';
    }
    var displayName = (showFlags && langPrefix) ? langPrefix + ' ' + name : name;
    return {
        displayName: displayName,
        sortName: name.toLowerCase(),
        langCode: langCode,
        isVostfr: isVostfr
    };
};

// Format category name for display (shortcut)
IPTVApp.prototype.formatCategoryDisplayName = function(categoryName) {
    return this.parseCategoryName(categoryName).displayName;
};

// Words to preserve case (channels, networks, etc.)
IPTVApp.prototype.preserveCaseWords = [
    'VO', 'VOSTFR', 'VF', 'VOST', 'UHD', '4K', '3D', 'HDR', 'HD', 'FHD', 'SD', 'TV', 'HEVC',
    'NBA', 'NFL', 'NHL', 'MLB', 'UFC', 'WWE', 'F1', 'GP', 'MotoGP', 'ATP', 'WTA',
    'USA', 'UK', 'ARTE', 'TF1', 'M6', 'TMC', 'NRJ', 'RTL', 'RMC', 'BFM', 'LCI',
    'RTS', 'SRF', 'ORF', 'ZDF', 'ARD', 'RAI', 'TVE', 'RTP', 'NOS', 'VTM', 'RTL', 'ProSieben',
    'PINK', 'NOVA'
];

// Format title to Title Case, preserving special words
IPTVApp.prototype.formatDisplayTitle = function(title) {
    if (!title) return '';
    // Convert to Title Case
    var formatted = title.toLowerCase().replace(Regex.titleCase, function(a) {
        return a.toUpperCase();
    });
    // Restore preserved words
    var self = this;
    this.preserveCaseWords.forEach(function(word) {
        var regex = new RegExp('\\b' + Regex.escape(word) + '\\b', 'gi');
        formatted = formatted.replace(regex, word);
    });
    return formatted;
};

// Language detection
IPTVApp.prototype.detectLanguages = function(categories) {
    var detected = {};
    var self = this;
    categories.forEach(function(cat) {
        var name = cat.category_name || '';
        var match = name.match(Regex.categoryPrefix);
        if (match) {
            var prefix = match[1].toUpperCase();
            var lang = self.langAliases[prefix] || prefix;
            detected[lang] = true;
        }
    });
    this.availableLanguages = Object.keys(detected);
    if (this.availableLanguages.indexOf('FR') !== -1) {
        this.availableLanguages = this.availableLanguages.filter(function(l) { return l !== 'FR'; });
        this.availableLanguages.unshift('FR');
    }
};

IPTVApp.prototype.getEffectiveProviderLanguage = function() {
    var setting = this.settings.providerLanguage || 'ALL';
    if (setting === 'AUTO') {
        return I18n.getProviderLangCode(this.settings.locale);
    }
    return setting;
};

IPTVApp.prototype.matchesLanguage = function(categoryName) {
    var effectiveLang = this.getEffectiveProviderLanguage();
    if (effectiveLang === 'ALL') return true;
    var name = categoryName.toUpperCase();
    var match = name.match(Regex.categoryPrefix);
    // No prefix at all - show category (not language-specific)
    if (!match) return true;
    var prefix = match[1];
    // Check if prefix is a recognized language code
    var isRecognizedLang = this.langAliases[prefix] || Regex.langCode.test(prefix);
    // If prefix is NOT a language code (e.g., "Foradulte"), show category
    if (!isRecognizedLang) return true;
    // It's a language prefix - check if it matches the effective language
    var lang = this.langAliases[prefix] || prefix;
    return lang === effectiveLang;
};

// Get regex patterns for custom category
IPTVApp.prototype.getCustomCategoryPatterns = function(categoryId) {
    var patterns = this.getCategoryPatterns();
    var keywords = patterns[categoryId] || [];
    // Also check in customCategories if not found in patterns
    if (keywords.length === 0) {
        var customCats = this.settings.customCategories || [];
        for (var i = 0; i < customCats.length; i++) {
            if (customCats[i].id === categoryId) {
                keywords = customCats[i].keywords || [];
                break;
            }
        }
    }
    return keywords.map(function(kw) {
        return Regex.keywordPattern(kw);
    });
};

// Image and genre loading
IPTVApp.prototype.loadVisibleImages = function(forceFromStart) {
    var self = this;
    var items = document.querySelectorAll('#content-grid .grid-item');
    var cols = this.gridColumns;
    var focusIdx = (this.focusArea === 'grid' && !forceFromStart) ? this.focusIndex : 0;
    var startIdx, endIdx;
    if (forceFromStart || this.focusArea !== 'grid') {
        startIdx = 0;
        endIdx = Math.min(items.length, cols * 8);
    }
    else {
        var focusRow = Math.floor(focusIdx / cols);
        var startRow = Math.max(0, focusRow - 2);
        var endRow = focusRow + 8;
        startIdx = startRow * cols;
        endIdx = Math.min(items.length, endRow * cols);
    }
    var queue = [];
    var noUrl = 0;
    var alreadyLoaded = 0;
    for (var i = startIdx; i < endIdx; i++) {
        var item = items[i];
        var imageUrl = item.dataset.imageUrl;
        var imageDiv = item.querySelector('.grid-item-image');
        if (!imageDiv || imageDiv.dataset.loaded) {
            alreadyLoaded++;
            continue;
        }
        if (!imageUrl) {
            if (self.currentSection === 'downloads' || self.currentSection === 'history') {
                queue.push({ div: imageDiv, url: '', idx: i, gridItem: item });
            } else {
                imageDiv.dataset.loaded = 'none';
                imageDiv.classList.add('no-image');
            }
            noUrl++;
        }
        else if (!imageDiv.style.backgroundImage) {
            queue.push({ div: imageDiv, url: imageUrl, idx: i, gridItem: item });
        }
    }
    queue.sort(function(a, b) {
        return Math.abs(a.idx - focusIdx) - Math.abs(b.idx - focusIdx);
    });
    if (queue.length > 0 || noUrl > 0) {
        window.log('HTTP', 'IMG queue: ' + queue.length + ' to load, ' + noUrl + ' no URL, ' + alreadyLoaded + ' cached (range ' + startIdx + '-' + endIdx + ')');
    }
    this._imageQueueId = (this._imageQueueId || 0) + 1;
    var queueId = this._imageQueueId;
    var active = 0;
    var pos = 0;
    var MAX_CONCURRENT = 2;
    function processNext() {
        while (active < MAX_CONCURRENT && pos < queue.length) {
            if (self._imageQueueId !== queueId) return;
            var entry = queue[pos++];
            active++;
            self._loadSingleImage(entry.div, entry.url, entry.idx, entry.gridItem, queueId, function() {
                active--;
                if (self._imageQueueId !== queueId) return;
                processNext();
                if (active === 0 && pos >= queue.length) {
                    self.loadVisibleGenres();
                }
            });
        }
    }
    if (queue.length === 0) {
        self.loadVisibleGenres();
    }
    else {
        processNext();
    }
};

IPTVApp.prototype._loadSingleImage = function(div, url, idx, gridItem, queueId, done) {
    var self = this;
    div.dataset.loaded = 'loading';
    var optimizedUrl = this.optimizeTmdbImageUrl(url, 'w300');
    var tryTmdbFallback = function() {
        if (self.currentSection === 'live' || self.currentSection === 'sport') { done(); return; }
        var title = gridItem.dataset.streamTitle;
        var type = gridItem.dataset.streamType;
        var streamId = gridItem.dataset.streamId;
        var streamData = self.currentStreams.find(function(s) {
            return self.sameId(self.getStreamId(s), streamId);
        });
        var tmdbId = streamData && streamData.tmdb_id ? streamData.tmdb_id : null;
        self.fetchTMDBCached(title, type, function(result) {
            if (result && result.poster_path) {
                var tmdbPoster = 'https://image.tmdb.org/t/p/w300' + result.poster_path;
                div.style.backgroundImage = 'url("' + tmdbPoster + '")';
                div.classList.remove('no-image');
                div.dataset.loaded = 'tmdb';
                window.log('HTTP', 'IMG [' + idx + '] TMDB fallback: ' + result.poster_path);
            }
            done();
        }, false, tmdbId);
    };
    if (!url) {
        div.dataset.loaded = 'none';
        div.classList.add('no-image');
        tryTmdbFallback();
        return;
    }
    var loadImage = function(attempt) {
        if (self._imageQueueId !== queueId) { done(); return; }
        var img = new Image();
        var startTime = Date.now();
        var timeoutId = setTimeout(function() {
            div.dataset.loaded = 'timeout';
            div.classList.add('no-image');
            window.log('HTTP', 'IMG [' + idx + '] TIMEOUT after 30s: ' + optimizedUrl);
            tryTmdbFallback();
        }, 30000);
        img.onload = function() {
            clearTimeout(timeoutId);
            var duration = Date.now() - startTime;
            div.style.backgroundImage = cssUrl(self.proxyImageUrl(optimizedUrl));
            div.dataset.loaded = 'ok';
            div.classList.remove('no-image');
            if (duration > 1000) {
                window.log('HTTP', 'IMG [' + idx + '] SLOW ' + duration + 'ms: ' + optimizedUrl);
            }
            done();
        };
        img.onerror = function() {
            clearTimeout(timeoutId);
            var duration = Date.now() - startTime;
            if (attempt < 1) {
                div.dataset.loaded = 'retrying';
                window.log('HTTP', 'IMG [' + idx + '] ERROR ' + duration + 'ms, retrying: ' + optimizedUrl);
                setTimeout(function() { loadImage(attempt + 1); }, 1000);
                return;
            }
            div.dataset.loaded = 'error';
            div.classList.add('no-image');
            window.log('HTTP', 'IMG [' + idx + '] ERROR ' + duration + 'ms (final): ' + optimizedUrl);
            tryTmdbFallback();
        };
        img.src = self.proxyImageUrl(optimizedUrl);
    };
    loadImage(0);
};

IPTVApp.prototype.loadVisibleGenres = function() {
    // Skip TMDB for sections where it's not relevant (live TV, sport)
    if (this.currentSection === 'live' || this.currentSection === 'sport') return;
    var self = this;
    var items = document.querySelectorAll('#content-grid .grid-item');
    var cols = this.gridColumns;
    var startIdx = 0;
    var endIdx = Math.min(items.length, cols * 2);
    if (this.focusArea === 'grid') {
        var focusRow = Math.floor(this.focusIndex / cols);
        startIdx = focusRow * cols;
        endIdx = Math.min(items.length, (focusRow + 2) * cols);
    }
    for (var i = startIdx; i < endIdx; i++) {
        var item = items[i];
        if (item.dataset.genreLoaded) continue;
        item.dataset.genreLoaded = 'pending';
        var streamTitle = item.dataset.streamTitle || '';
        var type = item.dataset.streamType;
        var streamId = item.dataset.streamId;
        var streamData = self.currentStreams.find(function(s) {
            return self.sameId(self.getStreamId(s), streamId);
        });
        var tmdbId = streamData && streamData.tmdb_id ? streamData.tmdb_id : null;
        (function(gridItem, title, tp, tid) {
            self.fetchTMDBCached(title, tp, function(result) {
                gridItem.dataset.genreLoaded = 'done';
                if (result) {
                    // Update title from TMDB if good match (>= 80%)
                    var tmdbTitle = result.title || result.name;
                    if (tmdbTitle) {
                        var similarity = self.titleSimilarity(title, tmdbTitle);
                        if (similarity >= 80) {
                            var titleDiv = gridItem.querySelector('.grid-item-title');
                            if (titleDiv) {
                                // Keep genre tag if present
                                var genreTag = titleDiv.querySelector('.grid-item-genre');
                                // Re-add episode info for history items after TMDB update
                                var finalTitle = tmdbTitle;
                                var hSeason = gridItem.dataset.historySeason;
                                var hEpisode = gridItem.dataset.historyEpisode;
                                if (hSeason && hEpisode) {
                                    var hs = parseInt(hSeason) < 10 ? '0' + hSeason : hSeason;
                                    var he = parseInt(hEpisode) < 10 ? '0' + hEpisode : hEpisode;
                                    finalTitle += ' - S' + hs + 'E' + he;
                                }
                                titleDiv.textContent = finalTitle;
                                if (genreTag) titleDiv.appendChild(genreTag);
                            }
                        }
                    }
                    // Update year in overlay and list
                    var releaseDate = result.release_date || result.first_air_date;
                    if (releaseDate) {
                        var tmdbYear = releaseDate.substring(0, 4);
                        var overlayTop = gridItem.querySelector('.grid-overlay-top');
                        if (!overlayTop) {
                            overlayTop = document.createElement('div');
                            overlayTop.className = 'grid-overlay-top';
                            var imgDiv = gridItem.querySelector('.grid-item-image');
                            if (imgDiv) imgDiv.appendChild(overlayTop);
                        }
                        var yearSpan = overlayTop.querySelector('.grid-year');
                        if (!yearSpan) {
                            yearSpan = document.createElement('span');
                            yearSpan.className = 'grid-year';
                            overlayTop.insertBefore(yearSpan, overlayTop.firstChild);
                        }
                        yearSpan.textContent = tmdbYear;
                        var listYear = gridItem.querySelector('.list-year');
                        if (!listYear) {
                            var listMeta = gridItem.querySelector('.list-meta');
                            if (listMeta) {
                                listYear = document.createElement('span');
                                listYear.className = 'list-year';
                                listMeta.insertBefore(listYear, listMeta.firstChild);
                            }
                        }
                        if (listYear) listYear.textContent = tmdbYear;
                    }
                    if (result.vote_average > 0) {
                        gridItem.dataset.tmdbRating = result.vote_average;
                        var sid = gridItem.dataset.streamId;
                        if (sid) {
                            if (!self.tmdbRatings) self.tmdbRatings = {};
                            self.tmdbRatings[sid] = result.vote_average;
                        }
                        var starCount = self.ratingToStars(result.vote_average);
                        var newStars = '';
                        for (var si = 0; si < 5; si++) {
                            newStars += si < starCount ? '★' : '☆';
                        }
                        var listStars = gridItem.querySelector('.list-stars');
                        if (!listStars) {
                            var listMeta = gridItem.querySelector('.list-meta');
                            if (listMeta) {
                                listStars = document.createElement('span');
                                listStars.className = 'list-stars';
                                listMeta.appendChild(listStars);
                            }
                        }
                        if (listStars) listStars.textContent = newStars;
                    }
                    // Update genres in overlay (provider + TMDB genres not in provider)
                    var tmdbGenres = TMDB.getGenres(result);
                    if (tmdbGenres.length > 0) {
                        var imgDiv = gridItem.querySelector('.grid-item-image');
                        var overlayBottom = gridItem.querySelector('.grid-overlay-bottom');
                        if (!overlayBottom && imgDiv) {
                            overlayBottom = document.createElement('div');
                            overlayBottom.className = 'grid-overlay-bottom';
                            var titleSpan = document.createElement('span');
                            titleSpan.className = 'grid-title';
                            titleSpan.textContent = gridItem.dataset.streamTitle || '';
                            overlayBottom.appendChild(titleSpan);
                            imgDiv.appendChild(overlayBottom);
                        }
                        if (overlayBottom) {
                            var providerSpan = overlayBottom.querySelector('.grid-genre-provider');
                            var providerGenre = providerSpan ? providerSpan.textContent : '';
                            var providerLower = providerGenre.toLowerCase();
                            var extraGenres = [];
                            for (var gi = 0; gi < tmdbGenres.length; gi++) {
                                var tg = tmdbGenres[gi];
                                var tgLower = tg.toLowerCase();
                                if (providerLower.indexOf(tgLower) === -1) {
                                    extraGenres.push(tg);
                                }
                            }
                            if (extraGenres.length > 0) {
                                var extraText = extraGenres.join(' ');
                                var combinedText = providerGenre ? providerGenre + ' ' + extraText : extraText;
                                var tmdbSpan = overlayBottom.querySelector('.grid-genre-tmdb');
                                if (!tmdbSpan) {
                                    tmdbSpan = document.createElement('span');
                                    tmdbSpan.className = 'grid-genre-tmdb';
                                    overlayBottom.appendChild(tmdbSpan);
                                }
                                tmdbSpan.textContent = extraText;
                                if (combinedText.length <= 25) {
                                    overlayBottom.classList.add('genres-inline');
                                }
                            }
                        }
                        var listGenre = gridItem.querySelector('.list-genre');
                        if (listGenre) {
                            var currentText = listGenre.textContent;
                            var currentLower = currentText.toLowerCase();
                            var extraListGenres = [];
                            for (var lgi = 0; lgi < tmdbGenres.length; lgi++) {
                                var tlg = tmdbGenres[lgi];
                                if (currentLower.indexOf(tlg.toLowerCase()) === -1) {
                                    extraListGenres.push(tlg);
                                }
                            }
                            if (extraListGenres.length > 0) {
                                listGenre.textContent = currentText + ' ' + extraListGenres.join(' ');
                            }
                        }
                    }
                    if (result.poster_path) {
                        var imgDiv = gridItem.querySelector('.grid-item-image');
                        if (imgDiv && imgDiv.classList.contains('no-image')) {
                            var tmdbPoster = 'https://image.tmdb.org/t/p/w300' + result.poster_path;
                            imgDiv.style.backgroundImage = 'url("' + tmdbPoster + '")';
                            imgDiv.classList.remove('no-image');
                            imgDiv.dataset.loaded = 'tmdb';
                        }
                    }
                }
            }, false, tid);
        })(item, streamTitle, type, tmdbId);
    }
};

// Load EPG for visible live channels
IPTVApp.prototype.loadVisibleEPG = function() {
    if (this.currentSection !== 'live' && this.currentSection !== 'sport') return;
    if (!this.api || !this.api.getShortEPG) return;
    var self = this;
    var items = document.querySelectorAll('#content-grid .grid-item');
    var cols = this.gridColumns;
    var startIdx = 0;
    var endIdx = Math.min(items.length, cols * 3);
    if (this.focusArea === 'grid') {
        var focusRow = Math.floor(this.focusIndex / cols);
        startIdx = Math.max(0, focusRow - 1) * cols;
        endIdx = Math.min(items.length, (focusRow + 3) * cols);
    }
    for (var i = startIdx; i < endIdx; i++) {
        var item = items[i];
        if (item.dataset.epgLoaded) continue;
        var streamId = item.dataset.streamId;
        var epgDiv = item.querySelector('.grid-item-epg');
        if (!streamId || !epgDiv) continue;
        item.dataset.epgLoaded = 'pending';
        (function(div, sid, itm) {
            self.api.getShortEPG(sid, 1).then(function(data) {
                if (!data || !data.epg_listings || data.epg_listings.length === 0) {
                    itm.dataset.epgLoaded = 'empty';
                    return;
                }
                var now = Math.floor(Date.now() / 1000);
                var currentProg = null;
                for (var j = 0; j < data.epg_listings.length; j++) {
                    var prog = data.epg_listings[j];
                    var start = parseInt(prog.start_timestamp, 10);
                    var end = parseInt(prog.stop_timestamp, 10);
                    if (now >= start && now < end) {
                        currentProg = prog;
                        break;
                    }
                }
                if (currentProg) {
                    var title = currentProg.title;
                    try {
                        title = decodeURIComponent(escape(atob(currentProg.title)));
                    } catch (e) { /* keep original title */ }
                    // Unescape JSON-escaped quotes
                    title = title.replace(/\\"/g, '"').replace(/\\'/g, "'");
                    div.textContent = title;
                    div.title = title;
                    itm.dataset.epgLoaded = 'ok';
                }
                else {
                    itm.dataset.epgLoaded = 'no-current';
                }
            }).catch(function() {
                itm.dataset.epgLoaded = 'error';
            });
        })(epgDiv, streamId, item);
    }
};

// Section navigation
IPTVApp.prototype.openSection = function(section) {
    window.log('ACTION', 'openSection=' + section);
    if (section === 'history') {
        this.showHistoryScreen();
        return;
    }
    if (section === 'downloads') {
        this.showDownloadsScreen();
        return;
    }
    if (section === 'settings') {
        this.showSettings();
        return;
    }
    this.currentSection = section;
    this.showScreen('browse');
    this.showElement('sidebar');
    this.showElement('filters-bar');
    if (this.settings.focusOnCategories) {
        this.focusArea = 'sidebar';
        this.focusIndex = 1;
    }
    else {
        this.focusArea = 'grid';
        this.focusIndex = 0;
    }
    this.resetFilters();
    this.lastSidebarIndex = null; // Will be set after categories render
    var titleKeys = {
        live: 'home.live',
        vod: 'home.movies',
        series: 'home.series',
        sport: 'home.sport',
        manga: 'home.manga',
        entertainment: 'home.entertainment'
    };
    var sidebarTitle;
    if (titleKeys[section]) {
        sidebarTitle = I18n.t(titleKeys[section]);
    }
    else if (section.indexOf('custom_') === 0) {
        var categories = this.getAllCategories();
        var cat = categories.find(function(c) { return c.id === section; });
        sidebarTitle = cat ? cat.name : section;
    }
    else {
        sidebarTitle = section;
    }
    document.getElementById('sidebar-title').textContent = sidebarTitle;
    window.log('SCREEN', 'showSection: loading section=' + section + ' data.live=' + JSON.stringify(this.data.live ? {cats: this.data.live.categories.length, streams: this.data.live.streams.length} : null));
    this.loadCategory(section);
};

// Category loading
IPTVApp.prototype.loadCategory = function(section) {
    var self = this;
    this.showLoading(true);
    var vodSubsections = ['sport', 'manga', 'entertainment'];
    var isCustom = section.indexOf('custom_') === 0;
    var isVodSubsection = vodSubsections.indexOf(section) !== -1 || isCustom;
    var apiSection = isVodSubsection ? 'vod' : section;
    var playlistId = this.settings.activePlaylistId || 'merged';
    var promise;
    // Provider cache only stores categories (not streams) to save localStorage space
    // Streams come from API memory cache after preload
    if (!this.api) {
        window.log('CACHE', 'loadCategory: no API, checking memory data for ' + apiSection);
        if (this.data[apiSection] && this.data[apiSection].categories && this.data[apiSection].categories.length > 0) {
            var memResult = [this.data[apiSection].categories, this.data[apiSection].streams];
            memResult._fromCache = true;
            promise = Promise.resolve(memResult);
        }
        else {
            this.showLoading(false);
            var grid = document.getElementById('content-grid');
            if (grid) {
                grid.innerHTML = '<div style="color:#ff6b6b;font-size:24px;text-align:center;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);">' +
                    '<div style="font-size:48px;margin-bottom:20px;">⚠️</div>' +
                    '<div>' + I18n.t('errors.noData', 'No data') + '</div></div>';
            }
            return;
        }
    }
    else if (this.apis && this.apis.length >= 1 && !this.settings.activePlaylistId) {
        // Check cache first for merged mode
        promise = this.loadProviderCache('merged').then(function(providerCache) {
            if (providerCache && providerCache[apiSection] && providerCache[apiSection].categories && providerCache[apiSection].categories.length > 0) {
                window.log('CACHE', 'loadCategory: CACHE HIT merged v2 for ' + apiSection);
                var result = [providerCache[apiSection].categories, providerCache[apiSection].streams || []];
                result._fromCache = true;
                return result;
            }
            // No cache, load from APIs
            return self.loadMergedData(apiSection, section);
        });
    }
    else if (apiSection === 'live') {
        promise = Promise.all([
            this.api.getLiveCategories(),
            this.api.getLiveStreams()
        ]);
    }
    else if (section === 'manga' || isCustom) {
        promise = Promise.all([
            this.api.getVodCategories(),
            this.api.getVodStreams(),
            this.api.getSeriesCategories(),
            this.api.getSeries()
        ]).then(function(results) {
            var vodCats = results[0] || [];
            var vodStreams = results[1] || [];
            var seriesCats = results[2] || [];
            var seriesStreams = results[3] || [];
            seriesCats.forEach(function(c) { c._sourceType = 'series'; });
            seriesStreams.forEach(function(s) { s._sourceType = 'series'; });
            vodCats.forEach(function(c) { c._sourceType = 'vod'; });
            vodStreams.forEach(function(s) { s._sourceType = 'vod'; });
            return [vodCats.concat(seriesCats), vodStreams.concat(seriesStreams)];
        });
    }
    else if (apiSection === 'vod') {
        promise = Promise.all([
            this.api.getVodCategories(),
            this.api.getVodStreams()
        ]);
    }
    else {
        promise = Promise.all([
            this.api.getSeriesCategories(),
            this.api.getSeries()
        ]);
    }
    promise.then(function(results) {
        var categories = results[0];
        var streams = results[1];
        // Build patterns from settings (keywords -> regex)
        var patterns = self.getCategoryPatterns();
        var hiddenCategories = self.settings.hiddenDefaultCategories || [];
        var keywordsToPatterns = function(keywords) {
            return keywords.map(function(kw) {
                return Regex.keywordPattern(kw);
            });
        };
        // Only build patterns for categories that are NOT hidden
        var sportPatterns = hiddenCategories.indexOf('sport') === -1 ? keywordsToPatterns(patterns.sport || []) : [];
        var mangaPatterns = hiddenCategories.indexOf('manga') === -1 ? keywordsToPatterns(patterns.manga || []) : [];
        // Entertainment = Concerts + Theatre + Shows + Blind Test + Karaoke
        var ent = patterns.entertainment || {};
        var entertainmentPatterns = [];
        if (hiddenCategories.indexOf('entertainment') === -1) {
            var concertsPatterns = keywordsToPatterns(ent.concerts || []);
            var theatrePatterns = keywordsToPatterns(ent.theatre || []);
            var spectaclesPatterns = keywordsToPatterns(ent.spectacles || []);
            var blindtestPatterns = keywordsToPatterns(ent.blindtest || []);
            var karaokePatterns = keywordsToPatterns(ent.karaoke || []);
            entertainmentPatterns = concertsPatterns.concat(theatrePatterns).concat(spectaclesPatterns).concat(blindtestPatterns).concat(karaokePatterns);
        }
        var allSpecialPatterns = sportPatterns
            .concat(entertainmentPatterns)
            .concat(mangaPatterns);
        // Add custom category patterns to exclusion list
        var customCategories = self.settings.customCategories || [];
        customCategories.forEach(function(cat) {
            var kws = patterns[cat.id] || cat.keywords || [];
            var customPatterns = keywordsToPatterns(kws);
            allSpecialPatterns = allSpecialPatterns.concat(customPatterns);
        });
        if (section === 'vod') {
            categories = categories.filter(function(cat) {
                var name = cat.category_name || '';
                return !allSpecialPatterns.some(function(p) { return p.test(name); });
            });
        }
        else if (section === 'sport') {
            categories = categories.filter(function(cat) {
                var name = cat.category_name || '';
                return sportPatterns.some(function(p) { return p.test(name); });
            });
        }
        else if (section === 'entertainment') {
            categories = categories.filter(function(cat) {
                var name = cat.category_name || '';
                var matches = entertainmentPatterns.some(function(p) { return p.test(name); });
                if (matches) {
                    // Add icon based on subcategory
                    if (concertsPatterns.some(function(p) { return p.test(name); })) cat._icon = '🎵';
                    else if (theatrePatterns.some(function(p) { return p.test(name); })) cat._icon = '🎭';
                    else if (spectaclesPatterns.some(function(p) { return p.test(name); })) cat._icon = '🎪';
                    else if (blindtestPatterns.some(function(p) { return p.test(name); })) cat._icon = '🎯';
                    else if (karaokePatterns.some(function(p) { return p.test(name); })) cat._icon = '🎤';
                }
                return matches;
            });
        }
        else if (section === 'manga') {
            categories = categories.filter(function(cat) {
                var name = cat.category_name || '';
                return mangaPatterns.some(function(p) { return p.test(name); });
            });
        }
        else if (section.indexOf('custom_') === 0) {
            // Custom category - use patterns from settings
            var customPatterns = self.getCustomCategoryPatterns(section);
            categories = categories.filter(function(cat) {
                var name = cat.category_name || '';
                return customPatterns.some(function(p) { return p.test(name); });
            });
        }
        else if (section === 'series') {
            // Exclude manga and custom categories from series section
            categories = categories.filter(function(cat) {
                var name = cat.category_name || '';
                return !allSpecialPatterns.some(function(p) { return p.test(name); });
            });
        }
        var beforeLangFilter = categories.length;
        categories = categories.filter(function(cat) {
            return self.matchesLanguage(cat.category_name || '');
        });
        if (beforeLangFilter !== categories.length) {
            window.log('CACHE', 'LANG FILTER: ' + beforeLangFilter + ' -> ' + categories.length + ' categories (excluded ' + (beforeLangFilter - categories.length) + ' by language)');
        }
        // SD categories are filtered later based on whether they have streams after SD filtering
        if (self.hideSM) {
            categories = categories.filter(function(cat) {
                var name = (cat.category_name || '').toUpperCase();
                return name.indexOf('SOURD') === -1 && name.indexOf('MALENTENDANT') === -1 && !name.startsWith('SME|');
            });
        }
        var categoryMap = {};
        categories.forEach(function(c) {
            var name = (c.category_name || '').replace(Regex.categoryPrefix, '');
            categoryMap[c.category_id] = name;
        });
        var categoryIds = {};
        categories.forEach(function(c) { categoryIds[c.category_id] = true; });
        var beforeCategoryFilter = streams.length;
        var filteredStreams = streams.filter(function(s) {
            return categoryIds[s.category_id];
        });
        if (beforeCategoryFilter !== filteredStreams.length) {
            window.log('CACHE', 'CATEGORY FILTER: ' + beforeCategoryFilter + ' -> ' + filteredStreams.length + ' (lost ' + (beforeCategoryFilter - filteredStreams.length) + ' streams with invalid category_id)');
        }
        filteredStreams.forEach(function(s) {
            if (!s.genre && s.category_id) {
                s.genre = categoryMap[s.category_id] || '';
            }
        });
        if (self.hideSD) {
            var titleMap = {};
            filteredStreams.forEach(function(s) {
                var cleanTitle = self.cleanTitle(self.getStreamTitle(s)).toLowerCase();
                if (!titleMap[cleanTitle]) {
                    titleMap[cleanTitle] = { sd: [], hd: [] };
                }
                if (self.isSD(s)) {
                    titleMap[cleanTitle].sd.push(s);
                }
                else {
                    titleMap[cleanTitle].hd.push(s);
                }
            });
            var beforeCount = filteredStreams.length;
            filteredStreams = filteredStreams.filter(function(s) {
                if (!self.isSD(s)) return true;
                var cleanTitle = self.cleanTitle(self.getStreamTitle(s)).toLowerCase();
                var hasHD = titleMap[cleanTitle].hd.length > 0;
                return !hasHD;
            });
            var hiddenCount = beforeCount - filteredStreams.length;
            if (hiddenCount > 0) window.log('CACHE', 'HIDDEN (SD has HD): ' + hiddenCount);
            var streamCategoryIds = {};
            filteredStreams.forEach(function(s) { streamCategoryIds[s.category_id] = true; });
            categories = categories.filter(function(cat) {
                var name = (cat.category_name || '').toUpperCase();
                if (!name.startsWith('SD|')) return true;
                return streamCategoryIds[cat.category_id];
            });
        }
        if (self.hide3D) {
            var beforeCount3D = filteredStreams.length;
            filteredStreams = filteredStreams.filter(function(s) {
                return !self.is3D(s);
            });
            var hiddenCount3D = beforeCount3D - filteredStreams.length;
            if (hiddenCount3D > 0) window.log('CACHE', 'HIDDEN (3D): ' + hiddenCount3D);
            var streamCategoryIds3D = {};
            filteredStreams.forEach(function(s) { streamCategoryIds3D[s.category_id] = true; });
            categories = categories.filter(function(cat) {
                var name = (cat.category_name || '').toUpperCase();
                if (name.indexOf('3D') === -1) return true;
                return streamCategoryIds3D[cat.category_id];
            });
        }
        self.data[section] = { categories: categories, streams: filteredStreams };
        self._preprocessDuplicates(section);
        self.logMemory('loaded ' + section + ' (' + filteredStreams.length + ' streams)');
        // Save filtered data to cache (only if data came from API, not from cache)
        if (!results._fromCache) {
            var cachePlaylistId = playlistId || (self.apis && self.apis.length > 1 ? 'merged' : null);
            if (cachePlaylistId) {
                self.cacheProviderData(cachePlaylistId, apiSection, categories, filteredStreams);
            }
        }
        // Delay render to let loading overlay display
        setTimeout(function() {
            self.renderCategories(categories, filteredStreams);
            var categoryKey = (self.settings.activePlaylistId || '') + '_' + section;
            var savedCategory = self.selectedCategoryBySection[categoryKey];
            var sidebarContainer = document.getElementById('categories-list');
            var categoryExistsInSidebar = savedCategory !== undefined && sidebarContainer &&
                sidebarContainer.querySelector('[data-category-id="' + savedCategory + '"]') !== null;
            var categoryExistsInData = savedCategory !== undefined &&
                categories.some(function(c) { return c.category_id === savedCategory || String(c.category_id) === String(savedCategory); });
            if (categoryExistsInSidebar || categoryExistsInData) {
                self.loadStreams(savedCategory);
            }
            else {
                if (savedCategory !== undefined) {
                    delete self.selectedCategoryBySection[categoryKey];
                    self.saveSelectedCategories();
                }
                // Show default category: TNT (live only) > All
                var tntChannels = I18n.getTntChannels();
                var hasTnt = section === 'live' && tntChannels.length > 0 && self.getTntStreamsCount(filteredStreams, tntChannels) > 0;
                if (hasTnt) {
                    self.showTntInGrid();
                    self.updateCategorySelection('tnt');
                }
                else {
                    self.renderGrid(filteredStreams, isVodSubsection ? 'vod' : section);
                    self.updateCategorySelection('');
                }
            }
            self.showLoading(false);
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    self.updateFocus();
                });
            });
        }, 50);
    }).catch(function(err) {
        var errMsg = err ? (err.message || err.toString()) : 'Unknown error';
        window.log('ERROR', 'Load: ' + errMsg);
        if (err && err.stack) {
            window.log('ERROR', 'Stack: ' + err.stack);
        }
        self.showLoading(false);
        // Show error to user
        var grid = document.getElementById('content-grid');
        if (grid) {
            grid.innerHTML = '<div style="color:#ff6b6b;font-size:24px;text-align:center;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);">' +
                '<div style="font-size:48px;margin-bottom:20px;">⚠️</div>' +
                '<div>' + errMsg + '</div></div>';
        }
    });
};

IPTVApp.prototype.loadMergedData = function(apiSection, section) {
    var self = this;
    var promises = this.apis.map(function(api) {
        var playlistId = api.playlistId;
        if (apiSection === 'live') {
            return Promise.all([
                api.getLiveCategories(),
                api.getLiveStreams()
            ]).then(function(r) {
                r[0].forEach(function(c) { c._playlistId = playlistId; });
                r[1].forEach(function(s) { s._playlistId = playlistId; });
                return r;
            }).catch(function() { return [[], []]; /* empty on error */ });
        }
        else if (apiSection === 'vod') {
            return Promise.all([
                api.getVodCategories(),
                api.getVodStreams()
            ]).then(function(r) {
                r[0].forEach(function(c) { c._playlistId = playlistId; });
                r[1].forEach(function(s) { s._playlistId = playlistId; });
                return r;
            }).catch(function() { return [[], []]; /* empty on error */ });
        }
        else {
            return Promise.all([
                api.getSeriesCategories(),
                api.getSeries()
            ]).then(function(r) {
                r[0].forEach(function(c) { c._playlistId = playlistId; });
                r[1].forEach(function(s) { s._playlistId = playlistId; });
                return r;
            }).catch(function() { return [[], []]; /* empty on error */ });
        }
    });
    return Promise.all(promises).then(function(results) {
        var allCategories = [];
        var allStreams = [];
        results.forEach(function(r) {
            allCategories = allCategories.concat(r[0] || []);
            allStreams = allStreams.concat(r[1] || []);
        });
        var playlistIds = {};
        allStreams.forEach(function(s) { if (s._playlistId) playlistIds[s._playlistId] = true; });
        window.log('CACHE', 'loadMergedData: ' + allCategories.length + ' categories, ' + allStreams.length + ' streams, playlistIds=' + Object.keys(playlistIds).join(','));
        return [allCategories, allStreams];
    });
};

IPTVApp.prototype.loadStreams = function(categoryId, options) {
    window.log('ACTION', 'loadStreams category=' + (categoryId || 'ALL') + ' options=' + JSON.stringify(options || {}));
    options = options || {};
    var self = this;
    // Reset search filters when changing category (unless preserveFilters is set)
    if (!options.preserveFilters) {
        this.resetFilters();
    }
    // Hide edit button and reset filtered state when leaving favorites view
    if (categoryId !== 'favorites') {
        this.inFilteredFavorites = false;
        this.filteredFavoriteIndices = null;
        this.setHidden('edit-favorites-btn', true);
    }
    if (categoryId === 'continue') {
        this.showContinueInGrid();
        this.updateCategorySelection(categoryId);
        return;
    }
    if (categoryId === 'favorites') {
        this.showFavoritesInGrid();
        this.updateCategorySelection(categoryId);
        return;
    }
    if (categoryId === 'tnt') {
        this.showTntInGrid();
        this.updateCategorySelection(categoryId);
        return;
    }
    if (categoryId === 'guide') {
        this.showTVGuide();
        return;
    }
    var section = this.currentSection;
    var vodSubsections = ['sport', 'entertainment'];
    var isCustom = section.indexOf('custom_') === 0;
    var isVodSubsection = vodSubsections.indexOf(section) !== -1 || isCustom;
    var isManga = section === 'manga';
    var isMixed = isManga || isCustom;
    // For manga/custom, get sourceType from the selected category
    var sourceType = null;
    if (isMixed && categoryId) {
        var catItem = document.querySelector('.category-item[data-category-id="' + categoryId + '"]');
        if (catItem) sourceType = catItem.dataset.sourceType;
    }
    var apiSection = isMixed ? (sourceType || 'vod') : (isVodSubsection ? 'vod' : section);
    if (!categoryId && this.data[section] && this.data[section].streams) {
        var self = this;
        this.renderGrid(this.data[section].streams, isVodSubsection ? 'vod' : section);
        this.updateCategorySelection(categoryId);
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                self.updateFocus();
            });
        });
        return;
    }
    this.showLoading(true);
    var self = this;
    var promise;
    var isMergeMode = this.apis && this.apis.length >= 1 && !this.settings.activePlaylistId;
    var realCategoryId = categoryId;
    var categoryPlaylistId = null;
    if (categoryId) {
        var catEl = document.querySelector('.category-item[data-category-id="' + categoryId + '"]');
        if (catEl) {
            realCategoryId = catEl.dataset.realCategoryId || categoryId;
            categoryPlaylistId = catEl.dataset.playlistId || null;
        }
    }
    if (!this.api || isMergeMode) {
        var dataSection = isMixed ? section : apiSection;
        var allStreams = this.data[dataSection] ? this.data[dataSection].streams : [];
        var filtered = categoryId ? allStreams.filter(function(s) {
            var matchCategory = self.sameId(s.category_id, realCategoryId);
            var matchPlaylist = !categoryPlaylistId || self.sameId(s._playlistId, categoryPlaylistId);
            return matchCategory && matchPlaylist;
        }) : allStreams;
        promise = Promise.resolve(filtered);
    }
    else if (apiSection === 'live') {
        promise = this.api.getLiveStreams(realCategoryId);
    }
    else if (apiSection === 'vod') {
        promise = this.api.getVodStreams(realCategoryId);
    }
    else {
        promise = this.api.getSeries(realCategoryId);
    }
    var gridType = isMixed ? (sourceType || 'vod') : (isVodSubsection ? 'vod' : section);
    promise.then(function(streams) {
        if (self.hideSD && streams.length > 0) {
            var titleMap = {};
            var allStreams = self.data[apiSection] ? self.data[apiSection].streams : streams;
            allStreams.forEach(function(s) {
                var cleanTitle = self.cleanTitle(self.getStreamTitle(s)).toLowerCase();
                if (!titleMap[cleanTitle]) titleMap[cleanTitle] = { hasHD: false };
                if (!self.isSD(s)) titleMap[cleanTitle].hasHD = true;
            });
            streams = streams.filter(function(s) {
                if (!self.isSD(s)) return true;
                var cleanTitle = self.cleanTitle(self.getStreamTitle(s)).toLowerCase();
                return !titleMap[cleanTitle].hasHD;
            });
        }
        self.renderGrid(streams, gridType);
        self.showLoading(false);
        self.updateCategorySelection(categoryId);
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                self.updateFocus();
            });
        });
    }).catch(function(err) {
        window.log('ERROR', 'Load streams: ' + (err.message || err));
        self.showLoading(false);
    });
};

IPTVApp.prototype.updateCategorySelection = function(categoryId) {
    document.querySelectorAll('.category-item').forEach(function(item) {
        var isSelected = item.dataset.categoryId === categoryId;
        item.classList.toggle('selected', isSelected);
        var textSpan = item.querySelector('.category-text');
        if (textSpan) {
            var text = textSpan.textContent;
            if (text.indexOf('▶ ') === 0) {
                text = text.substring(2);
            }
            if (isSelected) {
                text = '▶ ' + text;
            }
            textSpan.textContent = text;
        }
    });
    if (this.currentSection) {
        var categoryKey = (this.settings.activePlaylistId || '') + '_' + this.currentSection;
        if (categoryId === '') {
            delete this.selectedCategoryBySection[categoryKey];
        }
        else {
            this.selectedCategoryBySection[categoryKey] = categoryId;
        }
        this.saveSelectedCategories();
    }
};

// Category rendering
IPTVApp.prototype.renderCategories = function(categories, streams) {
    // Show sidebar and filters for normal browse screens
    this.showElement('sidebar');
    this.showElement('filters-bar');
    this.showElement('search-filters');
    this.showElement('sort-filters');
    this.showElement('rating-filters');
    // Hide edit favorites button (only shown in favorites category)
    this.setHidden('edit-favorites-btn', true);
    this.inFilteredFavorites = false;
    this.filteredFavoriteIndices = null;
    var container = document.getElementById('categories-list');
    container.scrollTop = 0;
    container.innerHTML = '';
    var countByCategory = {};
    streams.forEach(function(s) {
        // Use unique key combining category_id + playlistId for merge mode
        var catKey = s._playlistId ? s.category_id + '_' + s._playlistId : s.category_id;
        countByCategory[catKey] = (countByCategory[catKey] || 0) + 1;
    });
    var section = this.currentSection;
    // Hide filters not relevant for certain sections
    var isLive = section === 'live';
    var isVod = section === 'vod';
    document.getElementById('search-year').style.display = isLive ? 'none' : '';
    document.getElementById('search-actor').style.display = (!isLive && TMDB.isEnabled()) ? '' : 'none';
    document.getElementById('rating-filters').style.display = isLive ? 'none' : '';
    document.getElementById('sort-filters').style.display = isLive ? 'none' : '';
    // Check TNT availability for live section
    var hasTnt = false;
    var tntCount = 0;
    if (section === 'live') {
        var tntChannels = I18n.getTntChannels();
        if (tntChannels.length > 0) {
            tntCount = this.getTntStreamsCount(streams, tntChannels);
            hasTnt = tntCount > 0;
        }
    }
    // Determine default selection: saved > TNT > All
    var favoritesCount = this.getFavoritesCount();
    var categoryKey = (this.settings.activePlaylistId || '') + '_' + section;
    var savedCategory = this.selectedCategoryBySection[categoryKey];
    var defaultCategory = savedCategory !== undefined ? savedCategory : (hasTnt ? 'tnt' : '');
    window.log('FOCUS', 'renderCategories: categoryKey=' + categoryKey + ' savedCategory=' + savedCategory + ' defaultCategory=' + defaultCategory + ' continueCount=' + (section !== 'live' ? this.getContinueCount() : 0) + ' focusArea=' + this.focusArea + ' focusIndex=' + this.focusIndex);
    // Add "Continue" category (not for live TV, only if not empty)
    var continueCount = section !== 'live' ? this.getContinueCount() : 0;
    if (continueCount > 0) {
        var continueItem = document.createElement('div');
        continueItem.className = 'category-item category-continue' + (defaultCategory === 'continue' ? ' selected' : '');
        this.setCategoryText(continueItem, I18n.t('home.continue', 'Continue') + ' (' + continueCount + ')');
        continueItem.dataset.categoryId = 'continue';
        container.appendChild(continueItem);
    }
    // Add "Favorites" category (only if not empty)
    if (favoritesCount > 0) {
        var favoritesItem = document.createElement('div');
        favoritesItem.className = 'category-item category-favorites' + (defaultCategory === 'favorites' ? ' selected' : '');
        this.setCategoryText(favoritesItem, I18n.t('home.favorites', 'Favorites') + ' (' + favoritesCount + ')');
        favoritesItem.dataset.categoryId = 'favorites';
        container.appendChild(favoritesItem);
    }
    // Add "TNT" category for live section (only if not empty)
    if (hasTnt) {
        var tntItem = document.createElement('div');
        tntItem.className = 'category-item category-tnt' + (defaultCategory === 'tnt' ? ' selected' : '');
        this.setCategoryText(tntItem, I18n.t('home.tnt', 'National TV') + ' (' + tntCount + ')');
        tntItem.dataset.categoryId = 'tnt';
        container.appendChild(tntItem);
    }
    if (categories.length > 1) {
        var totalCount = streams.length;
        var allItem = document.createElement('div');
        allItem.className = 'category-item' + (defaultCategory === '' ? ' selected' : '');
        this.setCategoryText(allItem, I18n.t('messages.all', 'All') + ' (' + totalCount + ')');
        allItem.dataset.categoryId = '';
        container.appendChild(allItem);
    }
    var self = this;
    var preparedCategories = categories.map(function(cat) {
        var parsed = self.parseCategoryName(cat.category_name);
        // Create unique ID combining category_id + playlistId for merge mode
        var uniqueId = cat._playlistId ? cat.category_id + '_' + cat._playlistId : cat.category_id;
        return {
            id: uniqueId,
            categoryId: cat.category_id,
            playlistId: cat._playlistId,
            name: parsed.displayName,
            sortName: parsed.sortName,
            langCode: parsed.langCode,
            isVostfr: parsed.isVostfr,
            sourceType: cat._sourceType,
            icon: cat._icon
        };
    });
    var interfaceLang = I18n.getProviderLangCode(this.settings.locale);
    // Special sort order for entertainment section
    if (section === 'entertainment') {
        var sortKeywords = this.getEntertainmentSortKeywords();
        var entertainmentOrder = sortKeywords.order;
        var entertainmentLast = sortKeywords.last;
        preparedCategories.sort(function(a, b) {
            var aName = a.sortName;
            var bName = b.sortName;
            // Check if should be last (Blind Test, Karaokes)
            var aIsLast = entertainmentLast.some(function(k) { return aName.indexOf(k.toLowerCase()) !== -1; });
            var bIsLast = entertainmentLast.some(function(k) { return bName.indexOf(k.toLowerCase()) !== -1; });
            if (aIsLast && !bIsLast) return 1;
            if (!aIsLast && bIsLast) return -1;
            // Check priority order
            var aOrder = entertainmentOrder.length;
            var bOrder = entertainmentOrder.length;
            for (var i = 0; i < entertainmentOrder.length; i++) {
                if (aName.indexOf(entertainmentOrder[i].toLowerCase()) !== -1) { aOrder = i; break; }
            }
            for (var i = 0; i < entertainmentOrder.length; i++) {
                if (bName.indexOf(entertainmentOrder[i].toLowerCase()) !== -1) { bOrder = i; break; }
            }
            if (aOrder !== bOrder) return aOrder - bOrder;
            return aName.localeCompare(bName);
        });
    }
    else preparedCategories.sort(function(a, b) {
        // Treat empty langCode as interface language
        var aLang = a.langCode || interfaceLang;
        var bLang = b.langCode || interfaceLang;
        var aIsInterfaceLang = aLang === interfaceLang;
        var bIsInterfaceLang = bLang === interfaceLang;
        if (aIsInterfaceLang && !bIsInterfaceLang) return -1;
        if (!aIsInterfaceLang && bIsInterfaceLang) return 1;
        if (aLang !== bLang) {
            return aLang.localeCompare(bLang);
        }
        // Within same language: non-VOSTFR before VOSTFR
        if (!a.isVostfr && b.isVostfr) return -1;
        if (a.isVostfr && !b.isVostfr) return 1;
        return a.sortName.localeCompare(b.sortName);
    });
    var isFirst = (categories.length === 1 && continueCount === 0);
    preparedCategories.forEach(function(cat) {
        var count = countByCategory[cat.id] || 0;
        var item = document.createElement('div');
        var isSelected = isFirst || cat.id === defaultCategory;
        item.className = 'category-item' + (isSelected ? ' selected' : '');
        var displayName = cat.name;
        // In manga section, replace "Manga" with type name
        if (section === 'manga' && cat.sourceType) {
            var typeName = cat.sourceType === 'series' ? I18n.t('home.series', 'Series') : I18n.t('home.movies', 'Movies');
            displayName = displayName.replace(Regex.manga, typeName);
        }
        // In custom sections, prefix with Film/Série
        if (section.indexOf('custom_') === 0 && cat.sourceType) {
            var typePrefix = cat.sourceType === 'series' ? I18n.t('home.series', 'Series') : I18n.t('home.movies', 'Movies');
            displayName = typePrefix + ' - ' + displayName;
        }
        var iconPrefix = cat.icon ? cat.icon + ' ' : '';
        self.setCategoryText(item, iconPrefix + displayName + ' (' + count + ')');
        item.dataset.categoryId = cat.id;
        item.dataset.realCategoryId = cat.categoryId;
        if (cat.playlistId) item.dataset.playlistId = cat.playlistId;
        if (cat.sourceType) item.dataset.sourceType = cat.sourceType;
        container.appendChild(item);
        isFirst = false;
    });
    // Find index of selected category and add arrow to text
    var categoryItems = container.querySelectorAll('.category-item');
    var selectedIndex = 0;
    for (var i = 0; i < categoryItems.length; i++) {
        if (categoryItems[i].classList.contains('selected')) {
            selectedIndex = i;
            var textSpan = categoryItems[i].querySelector('.category-text');
            if (textSpan && textSpan.textContent.indexOf('▶ ') !== 0) {
                textSpan.textContent = '▶ ' + textSpan.textContent;
            }
            break;
        }
    }
    // Set lastSidebarIndex to selected category if not already set
    if (this.lastSidebarIndex === null) {
        this.lastSidebarIndex = selectedIndex;
    }
    // Set focusIndex to match the selected category (only if focus is on sidebar)
    if (this.focusArea === 'sidebar') {
        this.focusIndex = selectedIndex;
    }
};

// Grid rendering
IPTVApp.prototype.renderGrid = function(streams, type) {
    window.log('GRID', 'renderGrid: ' + streams.length + ' ' + type + ' streams');
    this.logMemory('renderGrid ' + type);
    var container = document.getElementById('content-grid');
    container.scrollTop = 0;
    container.textContent = '';
    var gridLoader = document.createElement('div');
    gridLoader.id = 'grid-loader';
    var hg = document.createElement('span');
    hg.className = 'hourglass';
    hg.textContent = '⏳';
    gridLoader.appendChild(hg);
    container.appendChild(gridLoader);
    this.originalStreams = streams.slice();
    this.currentStreams = streams;
    this.currentStreamType = type;
    // Save live channel list for channel switching
    if (type === 'live') {
        this.liveChannelList = streams;
    }
    this.displayedCount = 0;
    this._gridLoading = true;
    // Apply saved view mode for current section
    var section = this.currentSection || 'default';
    // Fix: ensure viewModes is an object, not an array (legacy data migration)
    var viewModes = this.settings.viewMode;
    if (!viewModes || Array.isArray(viewModes)) {
        viewModes = {};
        this.settings.viewMode = viewModes;
    }
    var listDefaultSections = ['live', 'sport', 'entertainment', 'history', 'favorites', 'continue', 'downloads'];
    var defaultMode = listDefaultSections.indexOf(section) !== -1 ? 'list' : 'grid';
    var viewMode = viewModes[section] || defaultMode;
    container.classList.toggle('list-view', viewMode === 'list');
    document.querySelectorAll('.view-btn').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.view === viewMode);
    });
    this.applyFilters();
};

// Calculate and update grid spacer for stable scrollbar
IPTVApp.prototype.updateGridSpacer = function() {
    var container = document.getElementById('content-grid');
    var spacer = document.getElementById('grid-spacer');
    if (!spacer) {
        spacer = document.createElement('div');
        spacer.id = 'grid-spacer';
        spacer.style.gridColumn = '1 / -1';
        container.appendChild(spacer);
    }
    var totalItems = this.currentStreams.length;
    var displayedItems = this.displayedCount;
    var remainingItems = totalItems - displayedItems;
    if (remainingItems <= 0) {
        spacer.style.height = '0';
        return;
    }
    // Estimate item height (grid: image ~220px + title ~40px + margin ~15px = 275px)
    // List view: min-height 80px + margin-bottom 15px = 95px
    var isListView = container.classList.contains('list-view');
    var itemHeight = isListView ? 95 : 275;
    var cols = isListView ? 1 : this.gridColumns;
    var remainingRows = Math.ceil(remainingItems / cols);
    spacer.style.height = (remainingRows * itemHeight) + 'px';
};

// Filters
IPTVApp.prototype.resetFilters = function() {
    // Restore saved sort mode for current section, or 'default'
    var section = this.currentSection || 'default';
    var sortModes = this.settings.sortMode || {};
    var savedSort = (typeof sortModes === 'object' && sortModes[section]) ? sortModes[section] : 'default';
    this.currentSort = savedSort;
    this.searchTitle = '';
    this.searchYear = '';
    this.searchActor = '';
    this.ratingFilter = 0;
    this.actorSearchResults = null;
    document.getElementById('search-title').value = '';
    document.getElementById('search-year').value = '';
    document.getElementById('search-actor').value = '';
    document.querySelectorAll('.sort-btn').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.sort === savedSort);
    });
    this.updateRatingStars(0);
};

IPTVApp.prototype.applySort = function(sortType) {
    window.log('ACTION', 'applySort: ' + sortType);
    this.currentSort = sortType;
    // Save sort mode per section
    var section = this.currentSection || 'default';
    if (typeof this.settings.sortMode !== 'object') {
        this.settings.sortMode = {};
    }
    this.settings.sortMode[section] = sortType;
    this.saveSettings();
    document.querySelectorAll('.sort-btn').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.sort === sortType);
    });
    this.applyFilters();
};

IPTVApp.prototype.applyRatingFilter = function(rating) {
    window.log('ACTION', 'applyRatingFilter: ' + rating);
    if (this.ratingFilter === rating) {
        this.ratingFilter = 0;
    } else {
        this.ratingFilter = rating;
    }
    this.updateRatingStars(this.ratingFilter);
    this.applyFilters();
};

IPTVApp.prototype.updateRatingStars = function(rating) {
    document.querySelectorAll('.rating-star').forEach(function(star) {
        var starRating = parseInt(star.dataset.rating);
        var isFilled = starRating <= rating;
        star.classList.toggle('filled', isFilled);
        star.textContent = isFilled ? '★' : '☆';
    });
};

IPTVApp.prototype.setViewMode = function(mode) {
    window.log('ACTION', 'setViewMode: ' + mode);
    // Use 'favorites_<section>' key when viewing favorites, otherwise use current section
    var section = this.inFilteredFavorites ? ('favorites_' + this.currentSection) : (this.currentSection || 'default');
    if (typeof this.settings.viewMode !== 'object' || Array.isArray(this.settings.viewMode)) {
        this.settings.viewMode = {};
    }
    this.settings.viewMode[section] = mode;
    this.saveSettings();
    var grid = document.getElementById('content-grid');
    grid.classList.toggle('list-view', mode === 'list');
    document.querySelectorAll('.view-btn').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.view === mode);
    });
    // Load more items if switching to list mode and not enough items displayed
    if (mode === 'list' && this.displayedCount < 20) {
        this.loadMoreItems();
    }
};

IPTVApp.prototype.isSD = function(stream) {
    var name = this.getStreamTitle(stream).toUpperCase()
        .replace(/^[\u200E\u200F\u200B\u200C\u200D\uFEFF]+/, '');
    return name.startsWith('SD|') || name.indexOf(' SD ') !== -1;
};

IPTVApp.prototype.is3D = function(stream) {
    var name = this.getStreamTitle(stream).toUpperCase()
        .replace(/^[\u200E\u200F\u200B\u200C\u200D\uFEFF]+/, '');
    return name.startsWith('3D|') || name.indexOf(' 3D ') !== -1 || name.indexOf('|3D|') !== -1;
};

IPTVApp.prototype.isSM = function(stream) {
    var name = this.getStreamTitle(stream).toUpperCase();
    return name.indexOf('SOURD') !== -1 || name.indexOf('MALENTENDANT') !== -1 || name.indexOf('SME|') !== -1;
};

IPTVApp.prototype.applyFilters = function() {
    var self = this;
    this._filterGeneration = (this._filterGeneration || 0) + 1;
    var generation = this._filterGeneration;
    // Data is already filtered (SD/3D/SM) in IndexedDB cache, just apply search filters
    var streams = this.originalStreams.slice();
    var titleFilter = document.getElementById('search-title').value.toLowerCase().trim();
    this.searchTitle = titleFilter;
    if (titleFilter) {
        // Normalize for search: remove accents, keep only alphanumeric and spaces
        var normalizedFilter = titleFilter
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        streams = streams.filter(function(s) {
            var rawName = self.getStreamTitle(s);
            var name = rawName.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
            return name.indexOf(normalizedFilter) !== -1;
        });
    }
    var yearFilter = document.getElementById('search-year').value.trim();
    if (yearFilter) {
        streams = streams.filter(function(s) {
            var name = self.getStreamTitle(s);
            return name.indexOf(yearFilter) !== -1;
        });
    }
    if (this.ratingFilter > 0) {
        var minRating = this.ratingFilter * 2;
        streams = streams.filter(function(s) {
            var rating = parseFloat(s.rating) || 0;
            return rating >= minRating;
        });
    }
    window.log('SORT', 'currentSort=' + this.currentSort + ', streams.length=' + streams.length);
    if (this.currentSort === 'year' || this.currentSort === 'year-asc') {
        var yearRegex = /\((\d{4})\)/;
        streams.forEach(function(s) {
            if (s._sortYear === undefined) {
                var m = self.getStreamTitle(s).match(yearRegex);
                s._sortYear = m ? parseInt(m[1]) : 0;
            }
        });
    }
    if (this.currentSort !== 'default') {
        window.log('SORT', 'applying sort ' + this.currentSort);
        streams.sort(function(a, b) {
            var nameA = self.getStreamTitle(a).trim().toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            var nameB = self.getStreamTitle(b).trim().toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            switch (self.currentSort) {
                case 'name':
                    return nameA.localeCompare(nameB, undefined, {numeric: true});
                case 'name-desc':
                    return nameB.localeCompare(nameA, undefined, {numeric: true});
                case 'year':
                    if (a._sortYear && !b._sortYear) return -1;
                    if (!a._sortYear && b._sortYear) return 1;
                    if (a._sortYear !== b._sortYear) return b._sortYear - a._sortYear;
                    return nameA.localeCompare(nameB, undefined, {numeric: true});
                case 'year-asc':
                    if (a._sortYear && !b._sortYear) return -1;
                    if (!a._sortYear && b._sortYear) return 1;
                    if (a._sortYear !== b._sortYear) return a._sortYear - b._sortYear;
                    return nameA.localeCompare(nameB, undefined, {numeric: true});
                default:
                    return 0;
            }
        });
    }
    else if (this.currentSection === 'entertainment') {
        // Sort by category order for entertainment
        var categories = this.data.entertainment && this.data.entertainment.categories || [];
        var catOrder = {};
        var sortKeywords = this.getEntertainmentSortKeywords();
        var entertainmentOrderKeys = sortKeywords.order;
        var entertainmentLastKeys = sortKeywords.last;
        categories.forEach(function(cat) {
            var catName = (cat.category_name || '').toLowerCase();
            var order = 50; // default middle
            // Check if last
            for (var i = 0; i < entertainmentLastKeys.length; i++) {
                if (catName.indexOf(entertainmentLastKeys[i].toLowerCase()) !== -1) { order = 100; break; }
            }
            if (order === 50) {
                // Check priority order
                for (var i = 0; i < entertainmentOrderKeys.length; i++) {
                    if (catName.indexOf(entertainmentOrderKeys[i].toLowerCase()) !== -1) { order = i; break; }
                }
            }
            catOrder[cat.category_id] = order;
        });
        streams.sort(function(a, b) {
            var orderA = catOrder[a.category_id] !== undefined ? catOrder[a.category_id] : 50;
            var orderB = catOrder[b.category_id] !== undefined ? catOrder[b.category_id] : 50;
            if (orderA !== orderB) return orderA - orderB;
            var nameA = self.getStreamTitle(a).toLowerCase();
            var nameB = self.getStreamTitle(b).toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }
    window.log('FILTER', 'applyFilters: ' + streams.length + ' streams after filter/sort');
    self.logMemory('applyFilters');
    if (this.currentSection !== 'downloads' && this.currentSection !== 'history') {
        streams = this._applyDedup(streams);
    }
    self.logMemory('applyFilters done');
    self.currentStreams = streams;
    self.displayedCount = 0;
    document.getElementById('content-grid').textContent = '';
    requestAnimationFrame(function() {
        if (self._filterGeneration !== generation) return;
        var wasLoading = self._gridLoading;
        self._gridLoading = false;
        self.loadMoreItems();
        if (wasLoading) {
            self.updateFocus();
        }
    });
};

IPTVApp.prototype._preprocessDuplicates = function(section) {
    var data = this.data[section];
    if (!data || !data.streams) return;
    var streams = data.streams;
    var self = this;
    var dedupGroups = {};
    var dedupTitleCounts = {};
    var qualityScore = function(tag) {
        var t = (tag || '').toUpperCase();
        if (t.indexOf('8K') !== -1 || t.indexOf('4320') !== -1) return 5;
        if (t.indexOf('4K') !== -1 || t.indexOf('UHD') !== -1 || t.indexOf('2160') !== -1) return 4;
        if (t.indexOf('FHD') !== -1 || t.indexOf('1080') !== -1) return 3;
        if (t.indexOf('HD') !== -1 || t.indexOf('720') !== -1) return 2;
        if (t.indexOf('SD') !== -1 || t.indexOf('480') !== -1) return 1;
        return 0;
    };
    for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        var title = self.getStreamTitle(s);
        var cleanTitle = self.cleanTitle(title).toLowerCase();
        var year = self.extractYear(title);
        var dedupKey = cleanTitle + '|' + (year || '');
        s._dedupCleanTitle = cleanTitle;
        s._dedupYear = year;
        s._dedupKey = dedupKey;
        var originalTitle = title;
        var clean = self.cleanTitle(originalTitle);
        var stripped = self.stripCategoryPrefix(originalTitle);
        var diff = stripped.replace(clean, '').replace(/\(\d{4}\)/g, '').replace(Regex.removeYearEnd, '').replace(/[\s\-|:()]+/g, ' ').trim();
        var qualityMatch = originalTitle.match(Regex.qualityPrefix);
        if (qualityMatch) {
            diff = (qualityMatch[1] + (diff ? ' ' + diff : '')).trim();
        }
        s._dedupTag = diff || '';
        s._dedupQualityScore = qualityScore(diff);
        dedupTitleCounts[cleanTitle] = (dedupTitleCounts[cleanTitle] || 0) + 1;
        if (!dedupGroups[dedupKey]) dedupGroups[dedupKey] = [];
        dedupGroups[dedupKey].push(s);
    }
    var keys = Object.keys(dedupGroups);
    for (var k = 0; k < keys.length; k++) {
        dedupGroups[keys[k]].sort(function(a, b) {
            var idA = parseInt(a.stream_id || a.series_id || 0);
            var idB = parseInt(b.stream_id || b.series_id || 0);
            return idA - idB;
        });
    }
    data._dedupGroups = dedupGroups;
    data._dedupTitleCounts = dedupTitleCounts;
    window.log('DEDUP', 'Preprocessed ' + streams.length + ' streams into ' + keys.length + ' groups for section ' + section);
};

IPTVApp.prototype._applyDedup = function(streams) {
    var section = this.currentSection;
    var data = this.data[section];
    if (!data || !data._dedupGroups) return streams;
    var dedupGroups = data._dedupGroups;
    var dedupTitleCounts = data._dedupTitleCounts;
    var hideSD = this.hideSD;
    var hide3D = this.hide3D;
    var streamLookup = {};
    for (var i = 0; i < streams.length; i++) {
        var sid = streams[i].stream_id || streams[i].series_id;
        if (sid) streamLookup[sid] = true;
    }
    for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        delete s._duplicateVersions;
        delete s._hiddenDuplicate;
        delete s._isDuplicate;
        delete s._duplicateInfos;
        delete s._duplicateNum;
    }
    var processedKeys = {};
    for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        var dedupKey = s._dedupKey;
        if (!dedupKey || processedKeys[dedupKey]) continue;
        processedKeys[dedupKey] = true;
        var fullGroup = dedupGroups[dedupKey];
        if (!fullGroup || fullGroup.length <= 1) continue;
        var group = [];
        for (var g = 0; g < fullGroup.length; g++) {
            var gs = fullGroup[g];
            var gsId = gs.stream_id || gs.series_id;
            if (gsId && streamLookup[gsId]) group.push(gs);
        }
        if (group.length <= 1) continue;
        var tags = [];
        var duplicateInfos = [];
        for (var gi = 0; gi < group.length; gi++) {
            var gs = group[gi];
            gs._duplicateNum = gi + 1;
            tags.push(gs._dedupTag);
            duplicateInfos.push({ id: gs.stream_id || gs.series_id, name: gs.name || gs.title || '', num: gi + 1 });
        }
        var uniqueTags = tags.filter(function(t, idx) { return tags.indexOf(t) === idx; });
        if (uniqueTags.length <= 1 && (uniqueTags.length === 0 || uniqueTags[0] === '')) continue;
        for (var gi = 0; gi < group.length; gi++) {
            group[gi]._duplicateInfos = duplicateInfos;
        }
        var versions = [];
        for (var gi = 0; gi < group.length; gi++) {
            versions.push({
                id: group[gi].stream_id || group[gi].series_id,
                tag: group[gi]._dedupTag || '',
                data: group[gi]
            });
        }
        if (hideSD) {
            var isHDQuality = function(tag) {
                if (!tag) return false;
                var qMatch = (tag + '|').match(Regex.qualityPrefix);
                return qMatch && Regex.sdQualities.indexOf(qMatch[1].toUpperCase()) === -1;
            };
            var isSDQuality = function(tag) {
                if (!tag) return false;
                var qMatch = (tag + '|').match(Regex.qualityPrefix);
                return qMatch && Regex.sdQualities.indexOf(qMatch[1].toUpperCase()) !== -1;
            };
            var hasHDVersion = versions.some(function(v) { return isHDQuality(v.tag); });
            if (hasHDVersion) {
                versions = versions.filter(function(v) { return isHDQuality(v.tag); });
            }
            else {
                var hasNonSDVersion = versions.some(function(v) { return !isSDQuality(v.tag); });
                if (hasNonSDVersion) {
                    versions = versions.filter(function(v) { return !isSDQuality(v.tag); });
                }
            }
        }
        if (hide3D) {
            var is3DVersion = function(tag) {
                if (!tag) return false;
                var qMatch = (tag + '|').match(Regex.qualityPrefix);
                return qMatch && qMatch[1].toUpperCase() === '3D';
            };
            versions = versions.filter(function(v) { return !is3DVersion(v.tag); });
        }
        var seenTags = {};
        versions = versions.filter(function(v) {
            var tag = v.tag || '';
            if (seenTags[tag]) return false;
            seenTags[tag] = true;
            return true;
        });
        versions.sort(function(a, b) {
            return b.data._dedupQualityScore - a.data._dedupQualityScore;
        });
        if (versions.length > 1) {
            var primaryStream = versions[0].data;
            var primaryIdx = group.indexOf(primaryStream);
            if (primaryIdx > 0) {
                group.splice(primaryIdx, 1);
                group.unshift(primaryStream);
            }
            primaryStream._duplicateVersions = versions;
        }
        for (var gi = 1; gi < group.length; gi++) {
            group[gi]._hiddenDuplicate = true;
        }
    }
    var result = [];
    for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        if (s._hiddenDuplicate) continue;
        s._isDuplicate = dedupTitleCounts[s._dedupCleanTitle] > 1;
        result.push(s);
    }
    window.log('DEDUP', '_applyDedup: ' + streams.length + ' -> ' + result.length + ' streams');
    return result;
};

IPTVApp.prototype.initFilterEvents = function() {
    var self = this;
    var titleInput = document.getElementById('search-title');
    var yearInput = document.getElementById('search-year');
    var actorInput = document.getElementById('search-actor');
    function handleSearchInput() {
        var selectedCategory = document.querySelector('.category-item.selected');
        var currentCategoryId = selectedCategory ? selectedCategory.dataset.categoryId : '';
        if (currentCategoryId !== '' && currentCategoryId !== 'favorites' && currentCategoryId !== 'continue' &&
            (titleInput.value.trim() || yearInput.value.trim())) {
            self.loadStreams('', { preserveFilters: true });
        }
        else {
            self.applyFilters();
        }
    }
    titleInput.addEventListener('input', handleSearchInput);
    yearInput.addEventListener('input', handleSearchInput);
    actorInput.addEventListener('input', function() {
        var query = actorInput.value.trim();
        window.log('ACTION', 'actorInput input: query="' + query + '" tmdbEnabled=' + TMDB.isEnabled());
        if (query && TMDB.isEnabled()) {
            self.searchActorTMDB(query);
        }
    });
    var filterInputs = [titleInput, yearInput, actorInput];
    filterInputs.forEach(function(input) {
        input.addEventListener('focus', function() {
            if (typeof webapis !== 'undefined' && webapis.ime) {
                webapis.ime.setInputMode(webapis.ime.ImeInputMode.TEXT);
            }
            self.focusArea = 'filters';
            var focusables = document.querySelectorAll('#filters-bar .focusable');
            for (var i = 0; i < focusables.length; i++) {
                if (focusables[i] === input) {
                    self.focusIndex = i;
                    break;
                }
            }
        });
        input.addEventListener('keydown', function(e) {
            if (e.keyCode === 37 || e.keyCode === 39) {
                var visibleInputs = filterInputs.filter(function(inp) {
                    return inp.offsetParent !== null;
                });
                var currentVisibleIndex = visibleInputs.indexOf(input);
                var newVisibleIndex = currentVisibleIndex;
                if (e.keyCode === 37 && currentVisibleIndex > 0) {
                    newVisibleIndex = currentVisibleIndex - 1;
                }
                else if (e.keyCode === 39 && currentVisibleIndex < visibleInputs.length - 1) {
                    newVisibleIndex = currentVisibleIndex + 1;
                }
                if (newVisibleIndex !== currentVisibleIndex) {
                    e.preventDefault();
                    e.stopPropagation();
                    input.blur();
                    self.focusIndex = newVisibleIndex;
                    self.updateFocus();
                }
            }
        });
    });
};

IPTVApp.prototype.openKeyboard = function(inputId) {
    var input = document.getElementById(inputId);
    if (input) {
        input.focus();
        if (typeof webapis !== 'undefined' && webapis.ime) {
            try {
                webapis.ime.setInputMode(webapis.ime.ImeInputMode.TEXT);
            }
            catch (ex) {
                window.log('ERROR', 'IME: ' + (ex.message || ex));
            }
        }
    }
};

IPTVApp.prototype.searchActorTMDB = function(query) {
    var self = this;
    window.log('ACTION', 'searchActorTMDB: ' + query);
    this.searchActor = query;
    document.getElementById('content-grid').innerHTML = '<div class="loading-message">' + I18n.t('app.loading', 'Loading...') + '</div>';
    TMDB.searchPerson(query, function(results) {
        if (results && results.length > 0) {
            self.actorSearchResults = results;
            self.renderActorResults(results);
        }
        else {
            self.actorSearchResults = null;
            document.getElementById('content-grid').innerHTML = '<div class="no-results">' + I18n.t('app.noResults', 'No results') + '</div>';
        }
    });
};

IPTVApp.prototype.renderActorResults = function(actors) {
    var container = document.getElementById('content-grid');
    container.innerHTML = '';
    container.classList.remove('list-view');
    var self = this;
    actors.forEach(function(actor) {
        var card = document.createElement('div');
        card.className = 'grid-item actor-search-result focusable';
        card.dataset.actorId = actor.id;
        var image = document.createElement('div');
        image.className = 'grid-item-image';
        if (actor.profile_path) {
            image.style.backgroundImage = 'url(https://image.tmdb.org/t/p/w185' + actor.profile_path + ')';
        }
        else {
            image.classList.add('no-image');
        }
        card.appendChild(image);
        var title = document.createElement('div');
        title.className = 'grid-item-title';
        title.textContent = actor.name;
        card.appendChild(title);
        if (actor.known_for_department && actor.known_for_department !== 'Acting') {
            var info = document.createElement('div');
            info.className = 'grid-item-info';
            info.textContent = I18n.t('department.' + actor.known_for_department, actor.known_for_department);
            card.appendChild(info);
        }
        container.appendChild(card);
    });
    var spacer = document.getElementById('grid-spacer');
    if (spacer) {
        spacer.style.height = '0px';
    }
};

// Grid item loading
IPTVApp.prototype.loadMoreItems = function() {
    if (this.checkMemoryPressure() > 80) {
        window.log('MEM', 'loadMoreItems aborted: memory pressure > 80%');
        return false;
    }
    var container = document.getElementById('content-grid');
    var gridLoader = document.getElementById('grid-loader');
    if (gridLoader) gridLoader.remove();
    var spacer = document.getElementById('grid-spacer');
    var isListView = container.classList.contains('list-view');
    var batchSize = isListView ? 20 : this.itemsPerBatch;
    var startIndex = this.displayedCount;
    var endIndex = Math.min(startIndex + batchSize, this.currentStreams.length);
    if (startIndex >= this.currentStreams.length) {
        return false;
    }
    for (var i = startIndex; i < endIndex; i++) {
        var stream = this.currentStreams[i];
        var item = document.createElement('div');
        item.className = 'grid-item';
        item.dataset.streamId = this.getStreamId(stream);
        item.dataset.playlistId = stream._playlistId || '';
        item.dataset.streamType = stream._type || stream._sourceType || this.currentStreamType;
        item.dataset.imageUrl = this.getStreamImage(stream);
        item.dataset.streamTitle = this.getStreamTitle(stream);
        var image = document.createElement('div');
        image.className = 'grid-item-image';
        var originalTitle = this.getStreamTitle(stream) || 'Unknown';
        var streamTitle = originalTitle;
        var isStreamSD = this.isSD(stream);
        // Remove category prefix like "FR|", "TR-VFF|", "4K|", "Exyu| ", etc.
        streamTitle = this.stripCategoryPrefix(streamTitle);
        var yearMatch = streamTitle.match(Regex.yearInParens) || streamTitle.match(Regex.yearAtEnd);
        var year = yearMatch ? yearMatch[1] : '';
        streamTitle = streamTitle
            .replace(Regex.removeYearParens, '')
            .replace(Regex.removeYearEnd, '')
            .replace(Regex.trailingDash, '')
            .trim();
        // Format to Title Case for better readability
        streamTitle = this.formatDisplayTitle(streamTitle);
        // Add episode info for series from history
        if (stream._isHistory && stream._season && stream._episode) {
            var s = stream._season < 10 ? '0' + stream._season : stream._season;
            var e = stream._episode < 10 ? '0' + stream._episode : stream._episode;
            streamTitle += ' - S' + s + 'E' + e;
            // Store in dataset for TMDB update to preserve
            item.dataset.historySeason = stream._season;
            item.dataset.historyEpisode = stream._episode;
        }
        var rating = parseFloat(stream.rating) || 0;
        var stars = '';
        if (rating > 0) {
            var starCount = this.ratingToStars(rating);
            for (var j = 0; j < 5; j++) {
                stars += j < starCount ? '★' : '☆';
            }
        }
        if (year || stars || (stream._duplicateTag && !stream._duplicateVersions)) {
            var overlayTop = document.createElement('div');
            overlayTop.className = 'grid-overlay-top';
            if (year) {
                var yearSpan = document.createElement('span');
                yearSpan.className = 'grid-year';
                yearSpan.textContent = year;
                overlayTop.appendChild(yearSpan);
            }
            if (stream._duplicateTag && !stream._duplicateVersions) {
                var titleWords = streamTitle.split(/[\s\-()]+/).filter(Boolean);
                var tagWords = stream._duplicateTag.split(/\s+/).filter(function(w) {
                    if (w === year) return false;
                    if (/^\d+$/.test(w)) return true;
                    if (titleWords.some(function(tw) { return tw.toLowerCase() === w.toLowerCase(); })) return false;
                    return true;
                });
                var filteredTag = tagWords.join(' ').trim();
                if (filteredTag) {
                    var tagSpan = document.createElement('span');
                    tagSpan.className = 'grid-format-tag';
                    tagSpan.textContent = filteredTag;
                    overlayTop.appendChild(tagSpan);
                }
            }
            if (stars) {
                var starsSpan = document.createElement('span');
                starsSpan.className = 'grid-stars';
                starsSpan.textContent = stars;
                overlayTop.appendChild(starsSpan);
            }
            image.appendChild(overlayTop);
        }
        var overlayBottom = document.createElement('div');
        overlayBottom.className = 'grid-overlay-bottom';
        var titleSpan = document.createElement('span');
        titleSpan.className = 'grid-title';
        titleSpan.textContent = this.formatDisplayTitle(this.cleanTitle(originalTitle));
        overlayBottom.appendChild(titleSpan);
        if (stream.genre) {
            var genreSpan = document.createElement('span');
            genreSpan.className = 'grid-genre-provider';
            genreSpan.textContent = this.formatDisplayTitle(stream.genre.split(',')[0].trim());
            overlayBottom.appendChild(genreSpan);
        }
        image.appendChild(overlayBottom);
        item.appendChild(image);
        var listInfo = document.createElement('div');
        listInfo.className = 'grid-item-info';
        var listTitle = document.createElement('div');
        listTitle.className = 'list-title';
        listTitle.textContent = streamTitle;
        listInfo.appendChild(listTitle);
        var listMeta = document.createElement('div');
        listMeta.className = 'list-meta';
        if (year) {
            var listYear = document.createElement('span');
            listYear.className = 'list-year';
            listYear.textContent = year;
            listMeta.appendChild(listYear);
        }
        if (stars) {
            var listStars = document.createElement('span');
            listStars.className = 'list-stars';
            listStars.textContent = stars;
            listMeta.appendChild(listStars);
        }
        listInfo.appendChild(listMeta);
        if (stream.genre) {
            var listGenre = document.createElement('div');
            listGenre.className = 'list-genre';
            listGenre.textContent = this.formatDisplayTitle(stream.genre.split(',')[0].trim());
            listInfo.appendChild(listGenre);
        }
        item.appendChild(listInfo);
        // Add EPG subtitle placeholder for live channels
        var streamType = stream._type || stream._sourceType || this.currentStreamType;
        if (streamType === 'live') {
            var epgSubtitle = document.createElement('div');
            epgSubtitle.className = 'grid-item-epg';
            item.appendChild(epgSubtitle);
        }
        // Add date and duration for history items
        if (stream._isHistory && stream._timestamp) {
            var dateSpan = document.createElement('div');
            dateSpan.className = 'grid-item-date';
            var dateText = this.formatHistoryDate(stream._timestamp);
            if (stream._duration && stream._duration > 0) {
                dateText += ' • ' + this.formatDuration(stream._duration);
            }
            dateSpan.textContent = dateText;
            item.appendChild(dateSpan);
        }
        if (stream._isDownload && stream._statusLabel) {
            var dlStatus = document.createElement('div');
            dlStatus.className = 'grid-item-date';
            if (stream._statusLabel === '⏳') {
                var hg = document.createElement('span');
                hg.className = 'hourglass';
                hg.textContent = '⏳';
                dlStatus.appendChild(hg);
            }
            else {
                dlStatus.textContent = stream._statusLabel;
            }
            item.appendChild(dlStatus);
        }
        var streamId = this.getStreamId(stream);
        var streamPlaylistId = stream._playlistId || this.settings.activePlaylistId;
        var progress = this.getWatchHistoryItem(streamId, streamPlaylistId);
        var minMs = (this.settings.minProgressMinutes || 2) * 60000;
        if (progress && progress.position >= minMs && progress.percent > 0 && !progress.watched) {
            var progressBar = document.createElement('div');
            progressBar.className = 'grid-progress-bar';
            var progressFill = document.createElement('div');
            progressFill.className = 'grid-progress-fill';
            progressFill.style.width = progress.percent + '%';
            progressBar.appendChild(progressFill);
            item.appendChild(progressBar);
        }
        // Add favorite icon if stream is in favorites
        if (this.isFavorite(streamId, streamPlaylistId)) {
            var favIcon = document.createElement('span');
            favIcon.className = 'favorite-icon';
            favIcon.textContent = '★';
            item.appendChild(favIcon);
        }
        if (spacer) {
            container.insertBefore(item, spacer);
        } else {
            container.appendChild(item);
        }
    }
    var isFirstBatch = (startIndex === 0);
    this.displayedCount = endIndex;
    this.updateGridSpacer();
    if (isFirstBatch) {
        this.loadVisibleImages(true);
        this.loadVisibleEPG();
    }
    return true;
};

IPTVApp.prototype.getFilteredContinueHistory = function(section) {
    if (!this.watchHistory || !this.watchHistory.length) {
        return [];
    }
    var self = this;
    var minMs = (this.settings.minProgressMinutes || 2) * 60000;
    section = section || this.currentSection;
    var seenSeries = {};
    return this.watchHistory.filter(function(item) {
        if (item.watched) return false;
        // Filter out items below minimum progress threshold (except series)
        if (item.type !== 'series' && (!item.position || item.position < minMs)) return false;
        // Deduplicate series by name (seriesId is unreliable)
        if (item.type === 'series') {
            var seriesKey = (item.playlistId || '') + '_' + item.name;
            if (seenSeries[seriesKey]) return false;
            seenSeries[seriesKey] = true;
        }
        if (section === 'vod') return item.type === 'vod' || item.type === 'movie';
        if (section === 'series') return item.type === 'series';
        if (section === 'live') return item.type === 'live';
        return item.type === 'vod' || item.type === 'movie';
    });
};

IPTVApp.prototype.getContinueCount = function() {
    return this.getFilteredContinueHistory().length;
};

IPTVApp.prototype.getFavoritesCount = function() {
    var section = this.currentSection;
    var vodSubsections = ['sport', 'entertainment', 'manga'];
    var isVodSubsection = vodSubsections.indexOf(section) !== -1;
    var isCustom = section.indexOf('custom_') === 0;
    return this.favorites.filter(function(fav) {
        var favType = fav._type || 'vod';
        var favSection = fav._section || favType;
        if (isVodSubsection || isCustom) return favSection === section;
        if (section === 'live') return favType === 'live';
        if (section === 'vod') return favType === 'vod' && vodSubsections.indexOf(favSection) === -1;
        if (section === 'series') return favType === 'series';
        return true;
    }).length;
};

IPTVApp.prototype.updateContinueCounter = function() {
    var continueCount = this.getContinueCount();
    var continueItem = document.querySelector('.category-continue');
    if (continueCount === 0) {
        if (continueItem) continueItem.remove();
    } else if (continueItem) {
        var newText = I18n.t('home.continue', 'Continue') + ' (' + continueCount + ')';
        var textSpan = continueItem.querySelector('.category-text');
        if (textSpan) {
            var hasArrow = textSpan.textContent.indexOf('\u25B6 ') === 0;
            textSpan.textContent = (hasArrow ? '\u25B6 ' : '') + newText;
        } else {
            continueItem.textContent = '';
            this.setCategoryText(continueItem, newText);
        }
    } else {
        var container = document.getElementById('categories-list');
        if (!container) return;
        var newItem = document.createElement('div');
        newItem.className = 'category-item category-continue';
        this.setCategoryText(newItem, I18n.t('home.continue', 'Continue') + ' (' + continueCount + ')');
        newItem.dataset.categoryId = 'continue';
        container.insertBefore(newItem, container.firstChild);
    }
};

IPTVApp.prototype.updateFavoritesCounter = function() {
    var favoritesCount = this.getFavoritesCount();
    var favoritesItem = document.querySelector('.category-favorites');
    if (favoritesCount === 0) {
        if (favoritesItem) favoritesItem.remove();
    } else if (favoritesItem) {
        var newText = I18n.t('home.favorites', 'Favorites') + ' (' + favoritesCount + ')';
        var textSpan = favoritesItem.querySelector('.category-text');
        if (textSpan) {
            var hasArrow = textSpan.textContent.indexOf('\u25B6 ') === 0;
            textSpan.textContent = (hasArrow ? '\u25B6 ' : '') + newText;
        } else {
            favoritesItem.textContent = '';
            this.setCategoryText(favoritesItem, newText);
        }
    } else {
        var container = document.getElementById('categories-list');
        if (!container) return;
        var continueItem = container.querySelector('.category-continue');
        var newItem = document.createElement('div');
        newItem.className = 'category-item category-favorites';
        this.setCategoryText(newItem, I18n.t('home.favorites', 'Favorites') + ' (' + favoritesCount + ')');
        newItem.dataset.categoryId = 'favorites';
        if (continueItem) {
            continueItem.after(newItem);
        } else {
            container.insertBefore(newItem, container.firstChild);
        }
    }
};

// TNT (National TV) filtering functions
IPTVApp.prototype.matchesTntChannel = function(streamName, tntChannels) {
    var name = (streamName || '').toUpperCase();
    // Remove common prefixes
    name = name.replace(/^(FR\||UK\||4K\||HD\||FHD\||SD\|)/i, '').trim();
    for (var i = 0; i < tntChannels.length; i++) {
        var channel = tntChannels[i].toUpperCase();
        // Match if name starts with or contains channel name
        if (name.indexOf(channel) !== -1) {
            return channel;
        }
    }
    return null;
};

IPTVApp.prototype.getTntStreams = function(streams, tntChannels) {
    var self = this;
    var matchedStreams = [];
    streams.forEach(function(stream) {
        var name = self.getStreamTitle(stream);
        var nameUpper = name.toUpperCase();
        // Skip 4K/UHD streams - not real TNT channels
        if (nameUpper.indexOf('4K') !== -1 || nameUpper.indexOf('UHD') !== -1) return;
        var matchedChannel = self.matchesTntChannel(name, tntChannels);
        if (matchedChannel) {
            matchedStreams.push({
                stream: stream,
                channel: matchedChannel,
                name: name
            });
        }
    });
    // Deduplicate: keep only highest quality per channel
    var channelMap = {};
    matchedStreams.forEach(function(item) {
        var channel = item.channel;
        var name = item.name.toUpperCase();
        // Determine quality score (higher is better): FHD > HD > SD
        var score = 0;
        if (name.indexOf('FHD') !== -1) score = 3;
        else if (name.indexOf('HD') !== -1 && name.indexOf('SD') === -1) score = 2;
        else if (name.indexOf('SD') === -1) score = 1;
        if (!channelMap[channel] || score > channelMap[channel].score) {
            channelMap[channel] = { stream: item.stream, score: score };
        }
    });
    // Return streams sorted by channel order in tntChannels
    var result = [];
    tntChannels.forEach(function(channel) {
        var key = channel.toUpperCase();
        if (channelMap[key]) {
            result.push(channelMap[key].stream);
        }
    });
    return result;
};

IPTVApp.prototype.getTntStreamsCount = function(streams, tntChannels) {
    return this.getTntStreams(streams, tntChannels).length;
};

IPTVApp.prototype.updateGridProgress = function() {
    var self = this;
    var items = document.querySelectorAll('#content-grid .grid-item');
    var minMs = (this.settings.minProgressMinutes || 2) * 60000;
    items.forEach(function(item) {
        var streamId = item.dataset.streamId;
        var progress = self.getWatchHistoryItem(streamId);
        var existingBar = item.querySelector('.grid-progress-bar');
        if (progress && progress.position >= minMs && progress.percent > 0 && !progress.watched) {
            if (existingBar) {
                existingBar.querySelector('.grid-progress-fill').style.width = progress.percent + '%';
            }
            else {
                var progressBar = document.createElement('div');
                progressBar.className = 'grid-progress-bar';
                var progressFill = document.createElement('div');
                progressFill.className = 'grid-progress-fill';
                progressFill.style.width = progress.percent + '%';
                progressBar.appendChild(progressFill);
                item.appendChild(progressBar);
            }
        }
        else if (existingBar) {
            existingBar.remove();
        }
    });
};

IPTVApp.prototype.updateGridDownloadProgress = function(downloads) {
    if (!downloads) return;
    var grid = document.getElementById('content-grid');
    if (!grid) return;
    var items = grid.querySelectorAll('.grid-item');
    var dlMap = this._freeboxDownloadMap || {};
    var isDownloadsScreen = this.currentSection === 'downloads';
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var streamId = item.dataset.streamId;
        var streamType = item.dataset.streamType;
        if (!streamId || streamType === 'live') continue;
        var existingDlBar = item.querySelector('.grid-download-bar');
        var existingDlComplete = item.querySelector('.grid-download-complete');
        var matchingDl = null;
        var keys = Object.keys(downloads);
        for (var j = 0; j < keys.length; j++) {
            var dl = downloads[keys[j]];
            var mappedStreamId = dlMap[dl.id];
            if ((mappedStreamId && String(mappedStreamId) === String(streamId)) ||
                keys[j].indexOf(streamId) !== -1 ||
                (dl.name && dl.name.indexOf(streamId) !== -1)) {
                matchingDl = dl;
                break;
            }
        }
        if (matchingDl) {
            if (isDownloadsScreen) {
                var pct = matchingDl.size > 0 ? Math.round((matchingDl.rx_bytes / matchingDl.size) * 100) : 0;
                var statusLabel = matchingDl.status === 'done' ? '\u2713' :
                    matchingDl.status === 'downloading' ? '\u2B07 ' + pct + '%' :
                    (matchingDl.status === 'stopped' || matchingDl.status === 'error') ? '\u23F8' :
                    matchingDl.status === 'queued' ? '\u23F3' : matchingDl.status;
                var dateEl = item.querySelector('.grid-item-date');
                if (dateEl) dateEl.textContent = statusLabel;
            }
            if (matchingDl.status === 'done') {
                if (existingDlBar) existingDlBar.remove();
                if (!existingDlComplete) {
                    var completeIcon = document.createElement('span');
                    completeIcon.className = 'grid-download-complete';
                    completeIcon.textContent = '\u2713';
                    item.appendChild(completeIcon);
                }
            }
            else if (matchingDl.status === 'downloading' || matchingDl.status === 'queued') {
                if (existingDlComplete) existingDlComplete.remove();
                if (!existingDlBar) {
                    existingDlBar = document.createElement('div');
                    existingDlBar.className = 'grid-download-bar';
                    var fill = document.createElement('div');
                    fill.className = 'grid-download-fill';
                    existingDlBar.appendChild(fill);
                    item.appendChild(existingDlBar);
                }
                var fillEl = existingDlBar.querySelector('.grid-download-fill');
                if (fillEl) fillEl.style.width = (matchingDl.rx_pct || 0) + '%';
            }
            else {
                if (existingDlBar) existingDlBar.remove();
                if (existingDlComplete) existingDlComplete.remove();
            }
        }
        else {
            if (existingDlBar) existingDlBar.remove();
            if (existingDlComplete) existingDlComplete.remove();
        }
    }
};
