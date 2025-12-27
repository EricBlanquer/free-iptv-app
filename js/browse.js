/**
 * Browse module - Categories, grid, and filters
 * Handles category navigation, content grid, filtering and sorting
 */

// Strip category prefix
IPTVApp.prototype.stripCategoryPrefix = function(title) {
    if (!title) return '';
    return title.replace(Regex.categoryPrefix, '');
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
    name = name.replace(Regex.seriesWord, '').replace(Regex.vfq, '').trim();
    name = this.formatDisplayTitle(name);
    if (isCanadian) name += ' (Canadien)';
    if (isSD) name += ' (SD)';
    if (isVostfr && !Regex.vostfr.test(name)) {
        name += ' (VOSTFR)';
    }
    var interfaceLang = this.localeToProviderLang[this.settings.locale] || 'FR';
    if (!langPrefix) {
        langPrefix = getFlag(interfaceLang) || '';
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
        var locale = this.settings.locale || 'fr';
        return this.localeToProviderLang[locale] || 'FR';
    }
    return setting;
};

IPTVApp.prototype.matchesLanguage = function(categoryName) {
    var effectiveLang = this.getEffectiveProviderLanguage();
    if (effectiveLang === 'ALL') return true;
    var name = categoryName.toUpperCase();
    var match = name.match(Regex.categoryPrefix);
    if (!match) return false;
    var prefix = match[1];
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
    var items = document.querySelectorAll('#content-grid .grid-item');
    var cols = this.gridColumns;
    var startIdx, endIdx;
    if (forceFromStart || this.focusArea !== 'grid') {
        startIdx = 0;
        endIdx = Math.min(items.length, cols * 4);
    }
    else {
        var focusRow = Math.floor(this.focusIndex / cols);
        var startRow = Math.max(0, focusRow - 2);
        var endRow = focusRow + 3;
        startIdx = startRow * cols;
        endIdx = Math.min(items.length, endRow * cols);
    }
    for (var i = startIdx; i < endIdx; i++) {
        var item = items[i];
        var imageUrl = item.dataset.imageUrl;
        var imageDiv = item.querySelector('.grid-item-image');
        if (!imageDiv || imageDiv.dataset.loaded) continue;
        if (!imageUrl) {
            // No image URL - show placeholder immediately
            imageDiv.dataset.loaded = 'none';
            imageDiv.classList.add('no-image');
        }
        else if (!imageDiv.style.backgroundImage) {
            // Preload image with error handling and timeout
            (function(div, url) {
                div.dataset.loaded = 'loading';
                var img = new Image();
                var timeoutId = setTimeout(function() {
                    div.dataset.loaded = 'timeout';
                    div.classList.add('no-image');
                }, 10000);
                img.onload = function() {
                    clearTimeout(timeoutId);
                    div.style.backgroundImage = 'url(' + url + ')';
                    div.dataset.loaded = 'ok';
                };
                img.onerror = function() {
                    clearTimeout(timeoutId);
                    div.dataset.loaded = 'error';
                    div.classList.add('no-image');
                };
                img.src = url;
            })(imageDiv, imageUrl);
        }
    }
};

IPTVApp.prototype.loadVisibleGenres = function() {
    // Skip TMDB for sections where it's not relevant
    if (this.currentSection === 'sport') return;
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
        (function(gridItem, title, tp) {
            self.fetchTMDBCached(title, tp, function(result) {
                gridItem.dataset.genreLoaded = 'done';
                if (result) {
                    var genres = TMDB.getGenres(result);
                    if (genres.length > 0) {
                        var infoDiv = gridItem.querySelector('.grid-item-info');
                        if (!infoDiv) {
                            infoDiv = document.createElement('div');
                            infoDiv.className = 'grid-item-info';
                            gridItem.appendChild(infoDiv);
                        }
                        var genreSpan = infoDiv.querySelector('.grid-genre');
                        if (!genreSpan) {
                            genreSpan = document.createElement('span');
                            genreSpan.className = 'grid-genre';
                            infoDiv.appendChild(genreSpan);
                        }
                        genreSpan.textContent = genres.slice(0, 2).join(', ');
                    }
                }
            });
        })(item, streamTitle, type);
    }
};

// Section navigation
IPTVApp.prototype.openSection = function(section) {
    if (section === 'continue') {
        this.showContinueScreen();
        return;
    }
    if (section === 'favorites') {
        this.showFavoritesScreen();
        return;
    }
    if (section === 'settings') {
        this.showSettings();
        return;
    }
    this.currentSection = section;
    this.showScreen('browse');
    document.getElementById('sidebar').style.display = '';
    document.getElementById('filters-bar').style.display = '';
    if (this.settings.focusOnCategories) {
        this.focusArea = 'sidebar';
        this.focusIndex = 1;
    }
    else {
        this.focusArea = 'grid';
        this.focusIndex = 0;
    }
    this.resetFilters();
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
    window.log('showSection: loading section=' + section + ' data.live=' + JSON.stringify(this.data.live ? {cats: this.data.live.categories.length, streams: this.data.live.streams.length} : null));
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
    var promise;
    if (!this.api) {
        window.log('loadCategory: no API, checking cached data for ' + apiSection);
        window.log('loadCategory: data[' + apiSection + '] = ' + JSON.stringify(this.data[apiSection] ? {
            categories: (this.data[apiSection].categories || []).length,
            streams: (this.data[apiSection].streams || []).length
        } : null));
        if (this.data[apiSection] && this.data[apiSection].categories && this.data[apiSection].categories.length > 0) {
            promise = Promise.resolve([
                this.data[apiSection].categories,
                this.data[apiSection].streams
            ]);
        }
        else {
            this.showLoading(false);
            // Show error message when no data available
            var grid = document.getElementById('content-grid');
            if (grid) {
                grid.innerHTML = '<div style="color:#ff6b6b;font-size:24px;text-align:center;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);">' +
                    '<div style="font-size:48px;margin-bottom:20px;">⚠️</div>' +
                    '<div>' + I18n.t('errors.noData') + '</div></div>';
            }
            return;
        }
    }
    else if (apiSection === 'live') {
        promise = Promise.all([
            this.api.getLiveCategories(),
            this.api.getLiveStreams()
        ]);
    }
    else if (section === 'manga' || isCustom) {
        // Load from both VOD and series
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
            // Mark series categories and streams
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
        var keywordsToPatterns = function(keywords) {
            return keywords.map(function(kw) {
                return Regex.keywordPattern(kw);
            });
        };
        var sportPatterns = keywordsToPatterns(patterns.sport || []);
        var mangaPatterns = keywordsToPatterns(patterns.manga || []);
        // Entertainment = Concerts + Theatre + Shows + Blind Test + Karaoke
        var ent = patterns.entertainment || {};
        var concertsPatterns = keywordsToPatterns(ent.concerts || []);
        var theatrePatterns = keywordsToPatterns(ent.theatre || []);
        var spectaclesPatterns = keywordsToPatterns(ent.spectacles || []);
        var blindtestPatterns = keywordsToPatterns(ent.blindtest || []);
        var karaokePatterns = keywordsToPatterns(ent.karaoke || []);
        var entertainmentPatterns = concertsPatterns.concat(theatrePatterns).concat(spectaclesPatterns).concat(blindtestPatterns).concat(karaokePatterns);
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
        categories = categories.filter(function(cat) {
            return self.matchesLanguage(cat.category_name || '');
        });
        if (self.hideSD) {
            categories = categories.filter(function(cat) {
                var name = (cat.category_name || '').toUpperCase();
                return !name.startsWith('SD|');
            });
        }
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
        var filteredStreams = streams.filter(function(s) {
            return categoryIds[s.category_id];
        });
        filteredStreams.forEach(function(s) {
            if (!s.genre && s.category_id) {
                s.genre = categoryMap[s.category_id] || '';
            }
        });
        self.data[section] = { categories: categories, streams: filteredStreams };
        self.renderCategories(categories, filteredStreams);
        // Show favorites if there are any, otherwise show all streams
        if (self.getFavoritesCount() > 0) {
            self.showFavoritesInGrid();
        }
        else {
            self.renderGrid(filteredStreams, isVodSubsection ? 'vod' : section);
        }
        self.showLoading(false);
        self.updateFocus();
    }).catch(function(err) {
        var errMsg = err ? (err.message || err.toString()) : 'Unknown error';
        window.log('Load error: ' + errMsg);
        if (err && err.stack) {
            window.log('Stack: ' + err.stack);
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

IPTVApp.prototype.loadStreams = function(categoryId) {
    var self = this;
    // Hide edit button and reset filtered state when leaving favorites view
    if (categoryId !== 'favorites') {
        this.inFilteredFavorites = false;
        this.filteredFavoriteIndices = null;
        document.getElementById('edit-favorites-btn').classList.add('hidden');
    }
    if (categoryId === 'continue') {
        this.showContinueInGrid();
        return;
    }
    if (categoryId === 'favorites') {
        this.showFavoritesInGrid();
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
        this.renderGrid(this.data[section].streams, isVodSubsection ? 'vod' : section);
        document.querySelectorAll('.category-item').forEach(function(item) {
            item.classList.toggle('selected', item.dataset.categoryId === categoryId);
        });
        this.updateFocus();
        return;
    }
    this.showLoading(true);
    var promise;
    if (!this.api) {
        // For mixed sections (manga/custom), use section data which contains combined VOD+series
        var dataSection = isMixed ? section : apiSection;
        var allStreams = this.data[dataSection] ? this.data[dataSection].streams : [];
        var filtered = categoryId ? allStreams.filter(function(s) {
            return String(s.category_id) === String(categoryId);
        }) : allStreams;
        promise = Promise.resolve(filtered);
    }
    else if (apiSection === 'live') {
        promise = this.api.getLiveStreams(categoryId);
    }
    else if (apiSection === 'vod') {
        promise = this.api.getVodStreams(categoryId);
    }
    else {
        promise = this.api.getSeries(categoryId);
    }
    var gridType = isMixed ? (sourceType || 'vod') : (isVodSubsection ? 'vod' : section);
    promise.then(function(streams) {
        self.renderGrid(streams, gridType);
        self.showLoading(false);
        document.querySelectorAll('.category-item').forEach(function(item) {
            item.classList.toggle('selected', item.dataset.categoryId === categoryId);
        });
        self.updateFocus();
    }).catch(function(err) {
        window.log('Load streams error:', err);
        self.showLoading(false);
    });
};

// Category rendering
IPTVApp.prototype.renderCategories = function(categories, streams) {
    // Show sidebar and filters for normal browse screens
    document.getElementById('sidebar').style.display = '';
    document.getElementById('filters-bar').style.display = '';
    document.getElementById('search-filters').style.display = '';
    document.getElementById('sort-filters').style.display = '';
    // Hide edit favorites button (only shown in favorites category)
    document.getElementById('edit-favorites-btn').classList.add('hidden');
    this.inFilteredFavorites = false;
    this.filteredFavoriteIndices = null;
    var container = document.getElementById('categories-list');
    container.scrollTop = 0;
    container.innerHTML = '';
    var countByCategory = {};
    streams.forEach(function(s) {
        var catId = s.category_id;
        countByCategory[catId] = (countByCategory[catId] || 0) + 1;
    });
    var section = this.currentSection;
    // Hide filters not relevant for certain sections
    var isLive = section === 'live';
    var isVod = section === 'vod';
    document.getElementById('search-year').style.display = isLive ? 'none' : '';
    document.getElementById('hide-sd-btn').style.display = isVod ? '' : 'none';
    document.getElementById('hide-sm-btn').style.display = isVod ? '' : 'none';
    document.getElementById('sort-filters').style.display = isLive ? 'none' : '';
    // Add "Continue" category (not for live TV)
    if (section !== 'live') {
        var continueCount = this.getContinueCount();
        var continueItem = document.createElement('div');
        continueItem.className = 'category-item category-continue' + (continueCount === 0 ? ' empty' : '');
        continueItem.textContent = '▶ ' + I18n.t('home.continue') + ' (' + continueCount + ')';
        continueItem.dataset.categoryId = 'continue';
        container.appendChild(continueItem);
    }
    // Add "Favorites" category
    var favoritesCount = this.getFavoritesCount();
    var hasFavorites = favoritesCount > 0;
    var favoritesItem = document.createElement('div');
    favoritesItem.className = 'category-item category-favorites' + (favoritesCount === 0 ? ' empty' : '') + (hasFavorites ? ' selected' : '');
    favoritesItem.textContent = '★ ' + I18n.t('home.favorites') + ' (' + favoritesCount + ')';
    favoritesItem.dataset.categoryId = 'favorites';
    container.appendChild(favoritesItem);
    if (categories.length > 1) {
        var totalCount = streams.length;
        var allItem = document.createElement('div');
        allItem.className = 'category-item' + (hasFavorites ? '' : ' selected');
        allItem.textContent = I18n.t('messages.all') + ' (' + totalCount + ')';
        allItem.dataset.categoryId = '';
        container.appendChild(allItem);
    }
    var self = this;
    var preparedCategories = categories.map(function(cat) {
        var parsed = self.parseCategoryName(cat.category_name);
        return {
            id: cat.category_id,
            name: parsed.displayName,
            sortName: parsed.sortName,
            langCode: parsed.langCode,
            isVostfr: parsed.isVostfr,
            sourceType: cat._sourceType,
            icon: cat._icon
        };
    });
    var interfaceLang = this.localeToProviderLang[this.settings.locale] || 'FR';
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
        item.className = 'category-item' + (isFirst ? ' selected' : '');
        var displayName = cat.name;
        // In manga section, replace "Manga" with type name
        if (section === 'manga' && cat.sourceType) {
            var typeName = cat.sourceType === 'series' ? I18n.t('home.series') : I18n.t('home.movies');
            displayName = displayName.replace(Regex.manga, typeName);
        }
        // In custom sections, prefix with Film/Série
        if (section.indexOf('custom_') === 0 && cat.sourceType) {
            var typePrefix = cat.sourceType === 'series' ? I18n.t('home.series') : I18n.t('home.movies');
            displayName = typePrefix + ' - ' + displayName;
        }
        var iconPrefix = cat.icon ? cat.icon + ' ' : '';
        item.textContent = iconPrefix + displayName + ' (' + count + ')';
        item.dataset.categoryId = cat.id;
        if (cat.sourceType) item.dataset.sourceType = cat.sourceType;
        container.appendChild(item);
        isFirst = false;
    });
    // Set focusIndex to match the selected category
    var categoryItems = container.querySelectorAll('.category-item');
    for (var i = 0; i < categoryItems.length; i++) {
        if (categoryItems[i].classList.contains('selected')) {
            this.focusIndex = i;
            break;
        }
    }
};

// Grid rendering
IPTVApp.prototype.renderGrid = function(streams, type) {
    var container = document.getElementById('content-grid');
    container.scrollTop = 0;
    container.innerHTML = '';
    this.originalStreams = streams.slice();
    this.currentStreams = streams;
    this.currentStreamType = type;
    this.displayedCount = 0;
    // Apply saved view mode for current section
    var section = this.currentSection || 'default';
    var viewModes = this.settings.viewMode || {};
    var listDefaultSections = ['live', 'sport', 'entertainment'];
    var defaultMode = listDefaultSections.indexOf(section) !== -1 ? 'list' : 'grid';
    var viewMode = (typeof viewModes === 'object' && viewModes[section]) ? viewModes[section] : defaultMode;
    container.classList.toggle('list-view', viewMode === 'list');
    document.querySelectorAll('.view-btn').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.view === viewMode);
    });
    this.applyFilters();
};

// Filters
IPTVApp.prototype.resetFilters = function() {
    this.currentSort = 'default';
    this.searchTitle = '';
    this.searchYear = '';
    document.getElementById('search-title').value = '';
    document.getElementById('search-year').value = '';
    document.querySelectorAll('.sort-btn').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.sort === 'default');
    });
};

IPTVApp.prototype.applySort = function(sortType) {
    this.currentSort = sortType;
    document.querySelectorAll('.sort-btn').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.sort === sortType);
    });
    this.applyFilters();
};

IPTVApp.prototype.toggleHideSD = function() {
    this.hideSD = !this.hideSD;
    var btn = document.getElementById('hide-sd-btn');
    btn.classList.toggle('selected', this.hideSD);
    btn.textContent = I18n.t('filters.hideSD');
    if (this.currentSection) {
        this.loadCategory(this.currentSection);
    }
};

IPTVApp.prototype.toggleHideSM = function() {
    this.hideSM = !this.hideSM;
    var btn = document.getElementById('hide-sm-btn');
    btn.classList.toggle('selected', this.hideSM);
    btn.textContent = I18n.t('filters.hideHI');
    if (this.currentSection) {
        this.loadCategory(this.currentSection);
    }
};

IPTVApp.prototype.setViewMode = function(mode) {
    // Use 'favorites_<section>' key when viewing favorites, otherwise use current section
    var section = this.inFilteredFavorites ? ('favorites_' + this.currentSection) : (this.currentSection || 'default');
    if (typeof this.settings.viewMode !== 'object') {
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
    var name = (stream.name || stream.title || '').toUpperCase();
    return name.startsWith('SD|') || name.indexOf(' SD ') !== -1;
};

IPTVApp.prototype.isSM = function(stream) {
    var name = (stream.name || stream.title || '').toUpperCase();
    return name.indexOf('SOURD') !== -1 || name.indexOf('MALENTENDANT') !== -1 || name.indexOf('SME|') !== -1;
};

IPTVApp.prototype.applyFilters = function() {
    var self = this;
    var streams = this.originalStreams.slice();
    if (this.hideSD) {
        streams = streams.filter(function(s) {
            return !self.isSD(s);
        });
    }
    if (this.hideSM) {
        streams = streams.filter(function(s) {
            return !self.isSM(s);
        });
    }
    var titleFilter = document.getElementById('search-title').value.toLowerCase().trim();
    if (titleFilter) {
        streams = streams.filter(function(s) {
            var name = (s.name || s.title || '').toLowerCase();
            return name.indexOf(titleFilter) !== -1;
        });
    }
    var yearFilter = document.getElementById('search-year').value.trim();
    if (yearFilter) {
        streams = streams.filter(function(s) {
            var name = s.name || s.title || '';
            return name.indexOf(yearFilter) !== -1;
        });
    }
    if (this.currentSort !== 'default') {
        streams.sort(function(a, b) {
            var nameA = (a.name || a.title || '').toLowerCase();
            var nameB = (b.name || b.title || '').toLowerCase();
            var ratingA = parseFloat(a.rating) || 0;
            var ratingB = parseFloat(b.rating) || 0;
            var dateA = a.added || '0';
            var dateB = b.added || '0';
            switch (self.currentSort) {
                case 'name':
                    return nameA.localeCompare(nameB);
                case 'name-desc':
                    return nameB.localeCompare(nameA);
                case 'rating':
                    return ratingB - ratingA;
                case 'date':
                    return dateB.localeCompare(dateA);
                case 'date-asc':
                    return dateA.localeCompare(dateB);
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
            var nameA = (a.name || a.title || '').toLowerCase();
            var nameB = (b.name || b.title || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }
    this.currentStreams = streams;
    this.displayedCount = 0;
    document.getElementById('content-grid').innerHTML = '';
    this.loadMoreItems();
};

IPTVApp.prototype.initFilterEvents = function() {
    var self = this;
    var titleInput = document.getElementById('search-title');
    var yearInput = document.getElementById('search-year');
    titleInput.addEventListener('input', function() {
        self.applyFilters();
    });
    yearInput.addEventListener('input', function() {
        self.applyFilters();
    });
    [titleInput, yearInput].forEach(function(input) {
        input.addEventListener('focus', function() {
            if (typeof webapis !== 'undefined' && webapis.ime) {
                webapis.ime.setInputMode(webapis.ime.ImeInputMode.TEXT);
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
            catch (e) {
                window.log('IME error:', e);
            }
        }
    }
};

// Grid item loading
IPTVApp.prototype.loadMoreItems = function() {
    var container = document.getElementById('content-grid');
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
        item.dataset.streamId = stream.stream_id || stream.vod_id || stream.series_id;
        item.dataset.streamType = stream._type || stream._sourceType || this.currentStreamType;
        item.dataset.imageUrl = stream.stream_icon || stream.cover || '';
        item.dataset.streamTitle = stream.name || stream.title || '';
        var image = document.createElement('div');
        image.className = 'grid-item-image';
        var title = document.createElement('div');
        title.className = 'grid-item-title';
        var streamTitle = stream.name || stream.title || 'Unknown';
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
        title.textContent = streamTitle;
        if (isStreamSD) {
            var sdTag = document.createElement('span');
            sdTag.className = 'sd-tag';
            sdTag.textContent = '(SD)';
            title.appendChild(sdTag);
        }
        var rating = parseFloat(stream.rating) || 0;
        var stars = '';
        if (rating > 0) {
            var starCount = Math.round(rating / 2);
            for (var j = 0; j < 5; j++) {
                stars += j < starCount ? '★' : '☆';
            }
        }
        var info = document.createElement('div');
        info.className = 'grid-item-info';
        if (year) {
            var yearSpan = document.createElement('span');
            yearSpan.className = 'grid-year';
            yearSpan.textContent = year;
            info.appendChild(yearSpan);
        }
        if (stars) {
            if (year) info.appendChild(document.createTextNode(' '));
            var starsSpan = document.createElement('span');
            starsSpan.className = 'grid-stars';
            starsSpan.textContent = stars;
            info.appendChild(starsSpan);
        }
        item.appendChild(image);
        item.appendChild(title);
        if (year || stars) item.appendChild(info);
        var streamId = stream.stream_id || stream.vod_id || stream.series_id;
        var progress = this.getWatchHistoryItem(streamId);
        if (progress && progress.percent > 0 && !progress.watched) {
            var progressBar = document.createElement('div');
            progressBar.className = 'grid-progress-bar';
            var progressFill = document.createElement('div');
            progressFill.className = 'grid-progress-fill';
            progressFill.style.width = progress.percent + '%';
            progressBar.appendChild(progressFill);
            item.appendChild(progressBar);
        }
        // Add favorite icon if stream is in favorites
        if (this.isFavorite(streamId)) {
            var favIcon = document.createElement('span');
            favIcon.className = 'favorite-icon';
            favIcon.textContent = '★';
            item.appendChild(favIcon);
        }
        container.appendChild(item);
    }
    var isFirstBatch = (startIndex === 0);
    this.displayedCount = endIndex;
    if (isFirstBatch) {
        this.loadVisibleImages(true);
        this.loadVisibleGenres();
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
    return this.watchHistory.filter(function(item) {
        if (item.watched) return false;
        // Filter out items below minimum progress threshold
        if (!item.position || item.position < minMs) return false;
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
    if (continueItem) {
        continueItem.textContent = '▶ ' + I18n.t('home.continue') + ' (' + continueCount + ')';
        continueItem.classList.toggle('empty', continueCount === 0);
    }
};

IPTVApp.prototype.updateFavoritesCounter = function() {
    var favoritesCount = this.getFavoritesCount();
    var favoritesItem = document.querySelector('.category-favorites');
    if (favoritesItem) {
        favoritesItem.textContent = '★ ' + I18n.t('home.favorites') + ' (' + favoritesCount + ')';
        favoritesItem.classList.toggle('empty', favoritesCount === 0);
    }
};

IPTVApp.prototype.updateGridProgress = function() {
    var self = this;
    var items = document.querySelectorAll('#content-grid .grid-item');
    items.forEach(function(item) {
        var streamId = item.dataset.streamId;
        var progress = self.getWatchHistoryItem(streamId);
        var existingBar = item.querySelector('.grid-progress-bar');
        if (progress && progress.percent > 0 && !progress.watched) {
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
