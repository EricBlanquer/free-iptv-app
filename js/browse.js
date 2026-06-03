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
IPTVApp.prototype.getLiveChannelBaseName = function(name) {
    if (!name) return '';
    var stripped = this.stripCategoryPrefix(name);
    stripped = stripped.replace(/\b(8K|4320p?|4K|UHD|2160p?|FHD|1080p?|HD|720p?|SD|480p?|HEVC|H[\.\s]?265|H[\.\s]?264|HDR10\+?|HDR|10[Bb]it)\b/gi, ' ');
    stripped = stripped.replace(/[\s\-|:()]+/g, ' ').trim();
    return stripped.toLowerCase();
};

IPTVApp.prototype.getLiveQualityScore = function(name) {
    var t = (name || '').toUpperCase();
    if (/\b(8K|4320)\b/.test(t)) return 5;
    if (/\b(4K|UHD|2160)\b/.test(t)) return 4;
    if (/\b(FHD|1080)\b/.test(t)) return 3;
    if (/\b(HD|720)\b/.test(t)) return 2;
    if (/\b(SD|480)\b/.test(t)) return 1;
    return 0;
};

IPTVApp.prototype.findLiveVariants = function(stream) {
    if (!stream) return [];
    var all = this.findAllLiveVariants(stream);
    var currentScore = this.getLiveQualityScore(this.getStreamTitle(stream));
    var lower = [];
    for (var i = 0; i < all.length; i++) {
        if (all[i].stream_id === stream.stream_id && all[i]._playlistId === stream._playlistId) continue;
        if (this.getLiveQualityScore(this.getStreamTitle(all[i])) >= currentScore) continue;
        lower.push(all[i]);
    }
    return lower;
};

IPTVApp.prototype.findAllLiveVariants = function(stream) {
    if (!stream) return [];
    var allStreams = [];
    if (this.api && this.api.cache && this.api.cache.liveStreams && this.api.cache.liveStreams['_all']) {
        allStreams = this.api.cache.liveStreams['_all'];
    }
    else if (this.data && this.data.live && this.data.live.streams) {
        allStreams = this.data.live.streams;
    }
    var baseName = this.getLiveChannelBaseName(this.getStreamTitle(stream));
    if (!baseName) return [stream];
    var variants = [];
    var seen = {};
    for (var i = 0; i < allStreams.length; i++) {
        var s = allStreams[i];
        var sBase = this.getLiveChannelBaseName(this.getStreamTitle(s));
        if (sBase !== baseName) continue;
        var key = s.stream_id + '_' + (s._playlistId || '');
        if (seen[key]) continue;
        seen[key] = true;
        variants.push(s);
    }
    var self = this;
    variants.sort(function(a, b) {
        return self.getLiveQualityScore(self.getStreamTitle(b)) - self.getLiveQualityScore(self.getStreamTitle(a));
    });
    return variants;
};

IPTVApp.prototype.getLiveQualityTag = function(name) {
    var t = (name || '').toUpperCase();
    var m = t.match(/\b(8K|4K|UHD|2160p?|FHD|1080p?|HD|720p?|SD|480p?|HEVC)\b/);
    return m ? m[1].replace(/P$/, 'p') : '';
};

IPTVApp.prototype.stripCategoryPrefix = function(title) {
    if (!title) return '';
    // Remove invisible characters (LTR mark, zero-width chars, etc.) at the start
    var clean = title.replace(/^[\u200E\u200F\u200B\u200C\u200D\uFEFF]+/, '');
    // First try quality prefix (4K|, 3D|, SD|, etc.)
    var result = clean.replace(Regex.qualityPrefix, '');
    if (result !== clean) return result;
    // Try compound region+lang prefix (e.g., "EU- FR ", "24/7| FR ", "VIP CA- ").
    // Both halves are allow-listed to avoid false positives on real titles.
    result = clean.replace(/^(?:EU|AF|AS|NA|SA|OC|24\/7|VIP|EST|INT|EX-YU|EXYU|HK|LA|MA|AR|SE|DK|NO|FI|LU)[-\s|]+(?:FR|EN|DE|ES|IT|PT|NL|PL|RU|TR|AR|UK|US|CA|BE|CH|GR|JP|KR|CN|HU|RO|CZ|SK|HR|SR|BG|FI|SE|DK|NO|IE|AUS|NZ|IN|HK|TW|SG|IL|IR|MX|BR|AT)[-\s|]+/i, '');
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

IPTVApp.prototype.preserveCaseWords = [
    'VO', 'VOSTFR', 'VF', 'VOST', 'UHD', '4K', '3D', 'HDR', 'HD', 'FHD', 'SD', 'TV', 'HEVC',
    'NBA', 'NFL', 'NHL', 'MLB', 'UFC', 'WWE', 'F1', 'GP', 'MotoGP', 'ATP', 'WTA',
    'USA', 'UK', 'ARTE', 'TF1', 'M6', 'TMC', 'NRJ', 'RTL', 'RMC', 'BFM', 'LCI',
    'RTS', 'SRF', 'ORF', 'ZDF', 'ARD', 'RAI', 'TVE', 'RTP', 'NOS', 'VTM', 'RTL', 'ProSieben',
    'PINK', 'NOVA'
];

IPTVApp.prototype._preserveCaseRegexes = (function() {
    var words = IPTVApp.prototype.preserveCaseWords;
    var result = [];
    for (var i = 0; i < words.length; i++) {
        result.push({
            regex: new RegExp('\\b' + Regex.escape(words[i]) + '\\b', 'gi'),
            word: words[i]
        });
    }
    return result;
})();

IPTVApp.prototype.formatDisplayTitle = function(title) {
    if (!title) return '';
    var formatted = title.toLowerCase().replace(Regex.titleCase, function(a) {
        return a.toUpperCase();
    });
    var regexes = this._preserveCaseRegexes;
    for (var i = 0; i < regexes.length; i++) {
        regexes[i].regex.lastIndex = 0;
        formatted = formatted.replace(regexes[i].regex, regexes[i].word);
    }
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

IPTVApp.prototype._buildLangTokenMap = function() {
    // Primary: unambiguous language codes / native names. Win over secondary.
    var primary = {
        FR: 'FR', FRA: 'FR', FRENCH: 'FR', FRANCAIS: 'FR',
        EN: 'EN', ENG: 'EN', ENGLISH: 'EN',
        DE: 'DE', DEU: 'DE', GER: 'DE', GERMAN: 'DE', DEUTSCH: 'DE',
        ES: 'ES', ESP: 'ES', SPANISH: 'ES', ESPANOL: 'ES',
        IT: 'IT', ITA: 'IT', ITALIAN: 'IT',
        PT: 'PT', POR: 'PT', PORTUGUESE: 'PT',
        NL: 'NL', NLD: 'NL', DUTCH: 'NL', VLAAMS: 'NL', FLEMISH: 'NL',
        PL: 'PL', POL: 'PL', POLISH: 'PL', POLSKA: 'PL',
        RU: 'RU', RUS: 'RU', RUSSIAN: 'RU', RUSSE: 'RU',
        TR: 'TR', TUR: 'TR', TURKISH: 'TR', TURKCE: 'TR',
        AR: 'AR', ARA: 'AR', ARABIC: 'AR', ARAB: 'AR', ARABE: 'AR',
        GR: 'EL', GREEK: 'EL', ELLINIKA: 'EL',
        SV: 'SV', SWE: 'SV', SWEDISH: 'SV',
        DA: 'DA', DAN: 'DA', DANISH: 'DA',
        NO: 'NB', NOR: 'NB', NORWEGIAN: 'NB',
        FI: 'FI', FIN: 'FI', FINNISH: 'FI',
        CS: 'CS', CZE: 'CS', CZECH: 'CS',
        SK: 'SK', SLK: 'SK', SLOVAK: 'SK',
        HU: 'HU', HUN: 'HU', HUNGARIAN: 'HU', MAGYAR: 'HU',
        RO: 'RO', RUM: 'RO', ROMANIAN: 'RO',
        BG: 'BG', BUL: 'BG', BULGARIAN: 'BG',
        HR: 'HR', CRO: 'HR', CROATIAN: 'HR',
        SR: 'SR', SRP: 'SR', SERBIAN: 'SR',
        UK: 'EN', GB: 'EN', BRITISH: 'EN', AMERICAN: 'EN',
        US: 'EN', USA: 'EN',
        NHL: 'EN', NBA: 'EN', NFL: 'EN', MLB: 'EN', MLS: 'EN',
        AHL: 'EN', OHL: 'EN', CHL: 'EN', NCAA: 'EN', WNBA: 'EN',
        UFC: 'EN', WWE: 'EN', MMA: 'EN', NASCAR: 'EN',
        TSN: 'EN', SPORTSNET: 'EN', FUBO: 'EN', ESPN: 'EN',
        QMJHL: 'FR', LIGUE: 'FR',
        JA: 'JA', JAP: 'JA', JAPANESE: 'JA',
        KO: 'KO', KOR: 'KO', KOREAN: 'KO',
        ZH: 'ZH', CHI: 'ZH', CHINESE: 'ZH',
        HI: 'HI', HIN: 'HI', HINDI: 'HI', URDU: 'UR',
        HE: 'HE', HEB: 'HE', HEBREW: 'HE',
        FA: 'FA', PERSIAN: 'FA', FARSI: 'FA',
        SQ: 'SQ', ALBANIAN: 'SQ',
        MK: 'MK', MACEDONIAN: 'MK',
        SLOVENIAN: 'SL', SLOVENE: 'SL',
        ESTONIAN: 'ET', LATVIAN: 'LV', LITHUANIAN: 'LT',
        KURD: 'KU', KURDISH: 'KU',
        VLAAMS: 'NL', NEDERLANDS: 'NL',
        VFF: 'FR', VOSTFR: 'FR'
    };
    // Secondary: country / region names. Used only if no primary token matched.
    var secondary = {
        FRANCE: 'FR', BELGIQUE: 'FR', LUXEMBOURG: 'FR', QUEBEC: 'FR',
        MA: 'FR', MAROC: 'FR', MOROCCO: 'FR',
        IVOIRE: 'FR', SENEGAL: 'FR', CAMEROUN: 'FR', CAMEROON: 'FR',
        GABON: 'FR', TOGO: 'FR', BENIN: 'FR',
        BURKINA: 'FR', MALI: 'FR', TCHAD: 'FR', CHAD: 'FR',
        DJIBOUTI: 'FR', MADAGASCAR: 'FR',
        GUINEE: 'FR', GUINEA: 'FR', RWANDA: 'FR', BURUNDI: 'FR',
        HAITI: 'FR', POLYNESIE: 'FR', POLYNESIA: 'FR',
        REUNION: 'FR', ROWANDA: 'FR', CAMERON: 'FR', LU: 'FR',
        IRELAND: 'EN', BRITAIN: 'EN', GERMANY: 'DE', AUSTRIA: 'DE',
        SPAIN: 'ES', ESPANA: 'ES', MEXICO: 'ES', CHILE: 'ES', PERU: 'ES',
        COLOMBIA: 'ES', ARGENTINA: 'ES', LATINO: 'ES', LATAM: 'ES',
        ECUADOR: 'ES', URUGUAY: 'ES', PARAGUAY: 'ES', BOLIVIA: 'ES', VENEZUELA: 'ES',
        PANAMA: 'ES', SALVADOR: 'ES', GUATEMALA: 'ES', HONDURAS: 'ES',
        NICARAGUA: 'ES', DOMINICAN: 'ES', CUBA: 'ES',
        CARIBBEAN: 'ES', CAR: 'ES',
        ITALY: 'IT', ITALIA: 'IT',
        PORTUGAL: 'PT', BRASIL: 'PT', BRAZIL: 'PT',
        ANGOLA: 'PT', MOZAMBIQUE: 'PT', CABOVERDE: 'PT',
        NETHERLANDS: 'NL', NEDERLAND: 'NL', HOLLAND: 'NL', BELGIE: 'NL',
        POLAND: 'PL',
        RUSSIA: 'RU', RUSSIE: 'RU',
        TURKEY: 'TR', TURKIYE: 'TR',
        ALGERIE: 'AR', ALGERIA: 'AR', TUNISIA: 'AR', TUNISIE: 'AR',
        EGYPT: 'AR', EGY: 'AR', ALG: 'AR', TUN: 'AR',
        GREECE: 'EL', CYPRUS: 'EL', CYPRIOT: 'EL',
        SWEDEN: 'SV', SVERIGE: 'SV',
        DENMARK: 'DA', DANMARK: 'DA',
        NORWAY: 'NB', NORGE: 'NB',
        FINLAND: 'FI', SUOMI: 'FI',
        HUNGARY: 'HU', HUNGARIA: 'HU',
        ROMANIA: 'RO', BULGARIA: 'BG',
        CROATIA: 'HR', SERBIA: 'SR', BOSNIA: 'BS', BIH: 'BS', SRB: 'SR',
        MACEDONIA: 'MK', SLOVENIA: 'SL', SLOVAKIA: 'SK',
        UKRAINE: 'UK', UA: 'UK',
        JAPAN: 'JA', KOREA: 'KO', CHINA: 'ZH', INDIA: 'HI',
        VIETNAM: 'VI', THAILAND: 'TH', INDONESIA: 'ID',
        MALAYSIA: 'MS', SINGAPORE: 'EN',
        NIGERIA: 'EN', GHANA: 'EN', KENYA: 'EN', UGANDA: 'EN',
        ZIMBABWE: 'EN', TANZANIA: 'SW', AZAM: 'SW', AZAMTV: 'SW', SWAHILI: 'SW',
        ETHIOPIA: 'AM', AMHARIC: 'AM',
        SOMALIA: 'SO', SOMALI: 'SO',
        ISRAEL: 'HE', IRAN: 'FA',
        AFGHANISTAN: 'FA', PAKISTAN: 'UR',
        SRILANKA: 'SI', BANGLADESH: 'BN',
        PHILIPPINE: 'TL', PHILIPPINES: 'TL',
        MALTA: 'MT', MT: 'MT',
        ERITREA: 'TI', GAMBIA: 'EN',
        ARMENIA: 'HY', AZERBAIJAN: 'AZ', AZERABAIJAN: 'AZ',
        ALBANIA: 'SQ', ALB: 'SQ',
        BALTIC: 'ET', LATVIA: 'LV', LITHUANIA: 'LT', ESTONIA: 'ET',
        HK: 'ZH', TW: 'ZH', SG: 'ZH',
        IE: 'EN', AUS: 'EN', NZ: 'EN',
        IS: 'HE',
        LA: 'ES', LAT: 'ES',
        IN: 'HI', PR: 'ES',
        VLAAMS: 'NL', KINDEREN: 'NL', NATUUR: 'NL',
        YU: 'SR', EX: 'SR', EXYU: 'SR',
        AL: 'SQ',
        CL: 'ES', MX: 'ES', PE: 'ES', CO: 'ES', VE: 'ES', BO: 'ES', PY: 'ES', UY: 'ES',
        DO: 'ES', GT: 'ES', HN: 'ES', NI: 'ES', SV: 'ES', PA: 'ES', CR: 'ES', CU: 'ES',
        PK: 'UR', BD: 'BN', LK: 'SI', AF: 'FA', MY: 'MS', VN: 'VI',
        TH: 'TH', ID: 'ID', IL: 'HE', IR: 'FA',
        ZA: 'EN',
        EG: 'AR', SA: 'AR', AE: 'AR', QA: 'AR', KW: 'AR', BH: 'AR', OM: 'AR', JO: 'AR',
        LB: 'AR', SY: 'AR', IQ: 'AR', YE: 'AR', LY: 'AR', SD: 'AR',
        HU: 'HU', RO: 'RO', BG: 'BG', HR: 'HR', SK: 'SK', CZ: 'CS',
        // BE / CH / SW / CA are intentionally NOT in either map: multilingual
        // countries — we rely on an explicit primary token (FR/NL/DE/EN) to
        // disambiguate. If none, the category stays language-agnostic (shown
        // to all).
    };
    return { primary: primary, secondary: secondary };
};

IPTVApp.prototype.matchesLanguage = function(categoryName) {
    var effectiveLang = this.getEffectiveProviderLanguage();
    if (effectiveLang === 'ALL') return true;
    if (!categoryName) return true;
    var name = categoryName.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!this._langTokenMap) this._langTokenMap = this._buildLangTokenMap();
    var tokens = name.match(/[A-Z]{2,}/g) || [];
    var primary = this._langTokenMap.primary;
    var secondary = this._langTokenMap.secondary;
    var primaryMatched = {};
    var hasPrimary = false;
    for (var i = 0; i < tokens.length; i++) {
        var lang = primary[tokens[i]];
        if (lang) {
            primaryMatched[lang] = true;
            hasPrimary = true;
        }
    }
    if (hasPrimary) return primaryMatched[effectiveLang] === true;
    var secondaryMatched = {};
    var hasSecondary = false;
    for (var j = 0; j < tokens.length; j++) {
        var slang = secondary[tokens[j]];
        if (slang) {
            secondaryMatched[slang] = true;
            hasSecondary = true;
        }
    }
    if (hasSecondary) return secondaryMatched[effectiveLang] === true;
    return true;
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

// True while the grid can still scroll further in either direction. When false
// (top or bottom reached), the `_arrowHeld` block is useless — no more scroll
// will come, so pending loads should fire even with the key still pressed.
IPTVApp.prototype._canScrollMore = function() {
    var grid = document.getElementById('content-grid');
    if (!grid) return false;
    if (grid.scrollTop <= 5) return false;
    if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 5) return false;
    return true;
};

// Compute the DOM index range that covers the visible viewport plus a small buffer.
// Shared by loadVisibleImages / loadVisibleGenres / loadVisibleEPG so they all act
// on the same set of items (TMDB fallback must cover every poster on screen, not
// just the focused row — otherwise list-view at the bottom of a category leaves
// every row but the focused one without a TMDB-fetched poster).
IPTVApp.prototype._getVisibleItemRange = function(items, forceFromStart) {
    var grid = document.getElementById('content-grid');
    var isListView = grid && grid.classList.contains('list-view');
    var cols = isListView ? 1 : this.gridColumns;
    var firstItem = items[0];
    var rowHeight = firstItem ? firstItem.offsetHeight + 10 : (isListView ? 95 : 300);
    var viewportHeight = grid ? grid.clientHeight : 720;
    var visibleRows = Math.max(3, Math.ceil(viewportHeight / rowHeight));
    var focusIdx = (this.focusArea === 'grid' && !forceFromStart) ? this.focusIndex : 0;
    var startIdx, endIdx;
    if (forceFromStart) {
        startIdx = 0;
        endIdx = Math.min(items.length, (visibleRows + 3) * cols);
    }
    else if (grid && items.length > 0 && grid.scrollTop > 0) {
        var topSpacer = document.getElementById('grid-top-spacer');
        var spacerHeight = topSpacer ? topSpacer.offsetHeight : 0;
        var visibleTop = Math.max(0, grid.scrollTop - spacerHeight);
        var firstVisibleRow = Math.floor(visibleTop / rowHeight);
        var startRow = Math.max(0, firstVisibleRow - 1);
        var endRow = firstVisibleRow + visibleRows + 2;
        startIdx = Math.min(items.length, startRow * cols);
        endIdx = Math.min(items.length, endRow * cols);
    }
    else {
        var focusRow = Math.floor(focusIdx / cols);
        var startRow = Math.max(0, focusRow - 2);
        var endRow = focusRow + visibleRows + 2;
        startIdx = startRow * cols;
        endIdx = Math.min(items.length, endRow * cols);
    }
    return { startIdx: startIdx, endIdx: endIdx, cols: cols, visibleRows: visibleRows };
};

// Image and genre loading
IPTVApp.prototype.loadVisibleImages = function(forceFromStart) {
    var self = this;
    var items = document.querySelectorAll('#content-grid .grid-item');
    var range = this._getVisibleItemRange(items, forceFromStart);
    var startIdx = range.startIdx;
    var endIdx = range.endIdx;
    var cols = range.cols;
    var visibleRows = range.visibleRows;
    var focusIdx = (this.focusArea === 'grid' && !forceFromStart) ? this.focusIndex : 0;
    var unloadBuffer = Math.max(cols * 3, visibleRows * cols);
    var unloadStart = Math.min(items.length, Math.max(0, startIdx - unloadBuffer));
    var unloadEnd = Math.min(items.length, endIdx + unloadBuffer);
    var unloaded = 0;
    var unloadOne = function(item) {
        if (!item) return;
        var uDiv = item.firstElementChild;
        if (!uDiv || !uDiv.dataset.loaded) return;
        var loadState = uDiv.dataset.loaded;
        if (loadState !== 'ok' && loadState !== 'tmdb') return;
        uDiv.style.backgroundImage = '';
        delete uDiv.dataset.loaded;
        if (loadState === 'tmdb') {
            // genreLoaded gated loadVisibleGenres from re-applying the cached
            // TMDB poster on revisit; clearing it lets the next pass re-apply
            // it (TMDB fetch hits the cache, no network cost).
            delete item.dataset.genreLoaded;
        }
        unloaded++;
    };
    for (var u = 0; u < unloadStart; u++) unloadOne(items[u]);
    for (var u = unloadEnd; u < items.length; u++) unloadOne(items[u]);
    if (unloaded > 0) {
        window.log('MEM', 'Unloaded ' + unloaded + ' off-screen images (keep range ' + unloadStart + '-' + unloadEnd + ')');
    }
    var queue = [];
    var noUrl = 0;
    var alreadyLoaded = 0;
    for (var i = startIdx; i < endIdx; i++) {
        var item = items[i];
        var imageUrl = item.dataset.imageUrl;
        var imageDiv = item.firstElementChild;
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
        else if (imageUrl.indexOf('data:') === 0) {
            imageDiv.style.backgroundImage = 'url(\'' + imageUrl + '\')';
            imageDiv.classList.add('local-logo');
            imageDiv.dataset.loaded = 'local';
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
    var loaded = 0;
    if (queue.length === 0) {
        self.loadVisibleGenres();
    }
    else {
        for (var i = 0; i < queue.length; i++) {
            (function(entry) {
                self._loadSingleImage(entry.div, entry.url, entry.idx, entry.gridItem, queueId, function() {
                    loaded++;
                    if (self._imageQueueId !== queueId) return;
                    if (loaded >= queue.length) {
                        self.loadVisibleGenres();
                    }
                });
            })(queue[i]);
        }
    }
};

IPTVApp.prototype._getStreamById = function(streamId) {
    if (!this._streamLookup) {
        this._streamLookup = {};
        for (var i = 0; i < this.currentStreams.length; i++) {
            var s = this.currentStreams[i];
            this._streamLookup[String(this.getStreamId(s))] = s;
        }
    }
    return this._streamLookup[String(streamId)] || null;
};

IPTVApp.prototype._loadSingleImage = function(div, url, idx, gridItem, queueId, done) {
    var self = this;
    if (gridItem && gridItem.classList && gridItem.classList.contains('freebox-file')) {
        if (gridItem.dataset.fbMime === 'image' && gridItem.dataset.fbPath) {
            var thumbImg = gridItem.querySelector('.fb-thumb-img');
            if (!thumbImg) { done(); return; }
            FreeboxAPI.fetchFileBytes(gridItem.dataset.fbPath, 196608).then(function(buffer) {
                if (self._imageQueueId !== queueId) { done(); return; }
                var thumbBlob = self._extractExifThumbnail(buffer);
                if (!thumbBlob) {
                    window.log('THUMB no EXIF thumbnail in ' + gridItem.dataset.fbPath);
                    done();
                    return;
                }
                var orient = self._extractExifOrientationFromBuffer(buffer);
                var transform = self._orientationToTransform(orient);
                thumbImg.style.transform = 'translate(-50%, -50%) ' + (transform || '');
                if (orient === 5 || orient === 6 || orient === 7 || orient === 8) {
                    thumbImg.classList.add('fb-thumb-img-rotated');
                }
                thumbImg.onload = function() {
                    if (self._imageQueueId !== queueId) return;
                    div.classList.add('fb-icon-hidden');
                    div.dataset.loaded = 'fb-thumb';
                };
                thumbImg.onerror = function() { done(); };
                thumbImg.src = URL.createObjectURL(thumbBlob);
                done();
            }).catch(function(err) {
                window.log('THUMB fetch error: ' + (err.message || err));
                done();
            });
            return;
        }
        div.dataset.loaded = 'skip';
        done();
        return;
    }
    div.dataset.loaded = 'loading';
    var optimizedUrl = this.optimizeTmdbImageUrl(url, 'w300');
    var loadProviderImage = function(onDone) {
        if (self._imageQueueId !== queueId) { onDone(); return; }
        var img = new Image();
        var startTime = Date.now();
        var timeoutId = setTimeout(function() {
            window.log('HTTP', 'IMG [' + idx + '] TIMEOUT after 8s: ' + optimizedUrl);
            if (div.dataset.loaded !== 'ok' && div.dataset.loaded !== 'tmdb') {
                div.dataset.loaded = 'error';
                div.classList.add('no-image');
            }
            onDone();
        }, 8000);
        img.onload = function() {
            clearTimeout(timeoutId);
            var duration = Date.now() - startTime;
            // Some providers return 200 OK with a placeholder (1x1 transparent gif,
            // "no cover" sentinel) instead of 404 when they don't have the artwork.
            // The browser fires onload normally, so without a size check we'd display
            // the placeholder and never reach the TMDB poster fallback. Threshold 50px
            // is well below any real movie poster (TMDB's w92 is 92×138 minimum).
            if (img.naturalWidth < 50 || img.naturalHeight < 50) {
                window.log('HTTP', 'IMG [' + idx + '] PLACEHOLDER ' + img.naturalWidth + 'x' + img.naturalHeight + ' (treating as missing): ' + optimizedUrl);
                div.dataset.loaded = 'error';
                div.classList.add('no-image');
                onDone();
                return;
            }
            div.style.backgroundImage = cssUrl(self.proxyImageUrl(optimizedUrl));
            div.dataset.loaded = 'ok';
            div.classList.remove('no-image');
            if (duration > 1000) {
                window.log('HTTP', 'IMG [' + idx + '] SLOW ' + duration + 'ms: ' + optimizedUrl);
            }
            onDone();
        };
        img.onerror = function() {
            clearTimeout(timeoutId);
            var duration = Date.now() - startTime;
            window.log('HTTP', 'IMG [' + idx + '] ERROR ' + duration + 'ms (final): ' + optimizedUrl);
            if (div.dataset.loaded !== 'ok' && div.dataset.loaded !== 'tmdb') {
                div.dataset.loaded = 'error';
                div.classList.add('no-image');
            }
            onDone();
        };
        img.src = self.proxyImageUrl(optimizedUrl);
    };
    var tryTmdb = function(onResult) {
        if (self._imageQueueId !== queueId) { onResult(false); return; }
        if (self.currentSection === 'live' || self.currentSection === 'sport') { onResult(false); return; }
        var title = gridItem.dataset.streamTitle;
        var type = gridItem.dataset.streamType;
        var streamId = gridItem.dataset.streamId;
        var streamData = self._getStreamById(streamId);
        var doFetch = function(tmdbId) {
            if (self._imageQueueId !== queueId) { onResult(false); return; }
            self.fetchTMDBCached(title, type, function(result) {
                if (self._imageQueueId !== queueId) { onResult(false); return; }
                if (result && result.poster_path && div.dataset.loaded !== 'ok') {
                    var tmdbPoster = 'https://image.tmdb.org/t/p/w300' + result.poster_path;
                    div.style.backgroundImage = 'url("' + tmdbPoster + '")';
                    div.classList.remove('no-image');
                    div.dataset.loaded = 'tmdb';
                    onResult(true);
                }
                else {
                    onResult(false);
                }
            }, false, tmdbId);
        };
        var knownTmdbId = streamData && streamData.tmdb_id ? streamData.tmdb_id : null;
        if (knownTmdbId || !streamData || type === 'series') {
            doFetch(knownTmdbId);
            return;
        }
        var api = self._getApiForPlaylist ? self._getApiForPlaylist(streamData._playlistId) : self.api;
        if (!api || !api.getVodInfo) {
            doFetch(null);
            return;
        }
        api.getVodInfo(streamData.stream_id || streamData.vod_id).then(function(data) {
            if (self._imageQueueId !== queueId) { onResult(false); return; }
            if (data && data.info && data.info.tmdb_id) {
                streamData.tmdb_id = data.info.tmdb_id;
                doFetch(data.info.tmdb_id);
            }
            else {
                doFetch(null);
            }
        }).catch(function() {
            if (self._imageQueueId !== queueId) { onResult(false); return; }
            doFetch(null);
        });
    };
    if (!url) {
        div.dataset.loaded = 'none';
        div.classList.add('no-image');
        tryTmdb(function() { done(); });
        return;
    }
    var isTmdbEnabled = typeof TMDB !== 'undefined' && TMDB.isEnabled();
    var isVodSection = self.currentSection !== 'live' && self.currentSection !== 'sport';
    var urlIsTmdb = optimizedUrl.indexOf('image.tmdb.org') !== -1;
    if (isTmdbEnabled && isVodSection && !urlIsTmdb) {
        var providerDone = false;
        var tmdbDone = false;
        var providerOk = false;
        var callDone = function() {
            if (providerDone && tmdbDone) done();
        };
        loadProviderImage(function() {
            providerDone = true;
            providerOk = div.dataset.loaded === 'ok';
            callDone();
        });
        tryTmdb(function(found) {
            if (found && !providerOk) {
                div.dataset.loaded = 'tmdb';
            }
            tmdbDone = true;
            callDone();
        });
        return;
    }
    loadProviderImage(done);
};

IPTVApp.prototype.loadVisibleGenres = function() {
    if (this.currentSection === 'live' || this.currentSection === 'sport') return;
    var self = this;
    var items = document.querySelectorAll('#content-grid .grid-item');
    var range = this._getVisibleItemRange(items, false);
    var startIdx = range.startIdx;
    var endIdx = range.endIdx;
    var streamLookup = {};
    for (var si = 0; si < self.currentStreams.length; si++) {
        var s = self.currentStreams[si];
        var sid = String(self.getStreamId(s));
        streamLookup[sid] = s;
    }
    for (var i = startIdx; i < endIdx; i++) {
        var item = items[i];
        if (item.dataset.genreLoaded) continue;
        item.dataset.genreLoaded = 'pending';
        var streamTitle = item.dataset.streamTitle || '';
        var type = item.dataset.streamType;
        var streamId = item.dataset.streamId;
        var streamData = streamLookup[String(streamId)] || null;
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
                    // Update year in overlay and list (skip for download items)
                    var releaseDate = result.release_date || result.first_air_date;
                    if (releaseDate && !gridItem.dataset.isDownload) {
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
                    if (result.vote_average > 0 && !gridItem.dataset.isDownload) {
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
                        // Apply the TMDB poster whenever the provider image has not
                        // succeeded yet (loading/error/none), not only once `no-image`
                        // is set. Otherwise a slow/dead provider image still in
                        // 'loading' state when this runs loses its only chance: the
                        // poster is skipped here but genreLoaded is burned to 'done',
                        // so the item is never retried and stays poster-less.
                        var loadState = imgDiv ? imgDiv.dataset.loaded : null;
                        if (imgDiv && loadState !== 'ok' && loadState !== 'local' && loadState !== 'tmdb') {
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
    var range = this._getVisibleItemRange(items, false);
    var startIdx = range.startIdx;
    var endIdx = range.endIdx;
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
    if (this.settings && this.settings.lastViewedSection !== section) {
        this.settings.lastViewedSection = section;
        this.saveSettings();
    }
    this.currentSection = section;
    this.showScreen('browse');
    this.showElement('sidebar');
    this.showElement('filters-bar');
    this.setHidden('view-mode-filters', false);
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
    document.getElementById('categories-list').innerHTML = '';
    document.getElementById('content-grid').innerHTML = '';
    window.log('SCREEN', 'showSection: loading section=' + section + ' data.live=' + JSON.stringify(this.data.live ? {cats: this.data.live.categories.length, streams: this.data.live.streams.length} : null));
    this.loadCategory(section);
};

// Category loading
IPTVApp.prototype.loadCategory = function(section) {
    var self = this;
    var vodSubsections = ['sport', 'manga', 'entertainment'];
    var isCustom = section.indexOf('custom_') === 0;
    var isVodSubsection = vodSubsections.indexOf(section) !== -1 || isCustom;
    var apiSection = isVodSubsection ? 'vod' : section;
    var playlistId = this.settings.activePlaylistId || 'merged';
    if (this.data[section] && this.data[section]._dedupGroups) {
        window.log('CACHE', 'loadCategory: reusing preprocessed data for ' + section);
        var cachedData = this.data[section];
        self._renderCategoryContent(cachedData.categories, cachedData.streams, section, isVodSubsection);
        return;
    }
    this.showLoading(true, I18n.t('loading.categories', 'Loading categories...'));
    var promise = this._buildCategoryPromise(section, apiSection, isCustom);
    if (!promise) return;
    promise.then(function(results) {
        var loadingText = document.getElementById('loading-text');
        var loadingBaseText = loadingText.textContent;
        var onProgress = function(percent) {
            loadingText.textContent = loadingBaseText + ' ' + percent + '%';
        };
        var onDone = function() {
            loadingText.textContent = loadingBaseText;
            var sectionData = self.data[section];
            self._renderCategoryContent(sectionData.categories, sectionData.streams, section, isVodSubsection);
        };
        var maybePromise = self._preprocessSection(section, results[0], results[1], onProgress);
        if (maybePromise && maybePromise.then) {
            maybePromise.then(onDone);
        }
        else {
            onDone();
        }
    }).catch(function(err) {
        var errMsg = err ? (err.message || err.toString()) : 'Unknown error';
        window.log('ERROR', 'Load: ' + errMsg);
        if (err && err.stack) {
            window.log('ERROR', 'Stack: ' + err.stack);
        }
        self.showLoading(false);
        self._showGridError(errMsg);
    });
};

IPTVApp.prototype._buildCategoryPromise = function(section, apiSection, isCustom) {
    var self = this;
    if (!this.api) {
        window.log('CACHE', 'loadCategory: no API, checking memory data for ' + apiSection);
        if (this.data[apiSection] && this.data[apiSection].categories && this.data[apiSection].categories.length > 0) {
            var memResult = [this.data[apiSection].categories, this.data[apiSection].streams];
            memResult._fromCache = true;
            return Promise.resolve(memResult);
        }
        this.showLoading(false);
        this._showGridError(I18n.t('errors.noData', 'No data'));
        return null;
    }
    if (this.apis && this.apis.length >= 1 && !this.settings.activePlaylistId) {
        return this.loadProviderCache('merged').then(function(providerCache) {
            if (providerCache && providerCache[apiSection] && providerCache[apiSection].categories && providerCache[apiSection].categories.length > 0) {
                window.log('CACHE', 'loadCategory: CACHE HIT merged v2 for ' + apiSection);
                var result = [providerCache[apiSection].categories, providerCache[apiSection].streams || []];
                result._fromCache = true;
                return result;
            }
            return self.loadMergedData(apiSection, section);
        });
    }
    if (apiSection === 'live') {
        return Promise.all([
            this.api.getLiveCategories(),
            this.api.getLiveStreams()
        ]);
    }
    if (section === 'manga' || isCustom) {
        return Promise.all([
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
    if (apiSection === 'vod') {
        return Promise.all([
            this.api.getVodCategories(),
            this.api.getVodStreams()
        ]);
    }
    return Promise.all([
        this.api.getSeriesCategories(),
        this.api.getSeries()
    ]);
};

IPTVApp.prototype._renderCategoryContent = function(categories, streams, section, isVodSubsection) {
    var self = this;
    this.renderCategories(categories, streams);
    var categoryKey = (this.settings.activePlaylistId || '') + '_' + section;
    var savedCategory = this.selectedCategoryBySection[categoryKey];
    var sidebarContainer = document.getElementById('categories-list');
    var categoryExistsInSidebar = savedCategory !== undefined && sidebarContainer &&
        sidebarContainer.querySelector('[data-category-id="' + savedCategory + '"]') !== null;
    var categoryExistsInData = savedCategory !== undefined &&
        categories.some(function(c) { return c.category_id === savedCategory || String(c.category_id) === String(savedCategory); });
    if (categoryExistsInSidebar || categoryExistsInData) {
        this.loadStreams(savedCategory);
    }
    else {
        var pseudoCategories = ['continue', 'favorites', 'rated', 'recommended', 'tnt', 'guide'];
        var isPseudoCategory = savedCategory !== undefined && pseudoCategories.indexOf(savedCategory) !== -1;
        if (savedCategory !== undefined && !isPseudoCategory) {
            delete this.selectedCategoryBySection[categoryKey];
            this.saveSelectedCategories();
        }
        var activePl = this.getActivePlaylist && this.getActivePlaylist();
        var isM3U = activePl && activePl.type === 'm3u';
        var tntChannels = I18n.getTntChannels();
        var hasTnt = !isM3U && section === 'live' && tntChannels.length > 0 && this.getTntStreamsCount(streams, tntChannels) > 0;
        if (hasTnt) {
            this.showTntInGrid();
            this.updateCategorySelection('tnt');
        }
        else {
            this.renderGrid(streams, isVodSubsection ? 'vod' : section);
            this.updateCategorySelection('');
        }
    }
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            self.showLoading(false);
            self.updateFocus();
        });
    });
};

IPTVApp.prototype._showGridError = function(message) {
    var grid = document.getElementById('content-grid');
    if (!grid) return;
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'color:#ff6b6b;font-size:24px;text-align:center;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)';
    var icon = document.createElement('div');
    icon.style.cssText = 'font-size:48px;margin-bottom:20px';
    icon.textContent = '\u26A0\uFE0F';
    var msg = document.createElement('div');
    msg.textContent = message;
    wrapper.appendChild(icon);
    wrapper.appendChild(msg);
    grid.appendChild(wrapper);
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
        this.lastGridIndex = 0;
    }
    // Hide edit button and reset filtered state when leaving favorites view
    if (categoryId !== 'favorites') {
        this.inFilteredFavorites = false;
        this.filteredFavoriteIndices = null;
        this.setHidden('edit-favorites-btn', true);
    }
    if (categoryId === 'continue') {
        this.setHidden('view-mode-filters', false);
        this.showContinueInGrid();
        this.updateCategorySelection(categoryId);
        return;
    }
    if (categoryId === 'favorites') {
        this.showFavoritesInGrid();
        this.updateCategorySelection(categoryId);
        return;
    }
    if (categoryId === 'rated') {
        this.showRatedInGrid();
        this.updateCategorySelection(categoryId);
        return;
    }
    if (categoryId === 'recommended') {
        this.showRecommendedInGrid();
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
    if (categoryId && categoryId.indexOf('genre:') === 0) {
        var genre = categoryId.substring(6);
        var section = this.currentSection;
        var self = this;
        var data = this.data[section];
        var allStreams = data ? data.streams : [];
        var filtered = allStreams.filter(function(s) {
            if (!s._normalizedGenres) return false;
            return s._normalizedGenres.indexOf(genre) !== -1;
        });
        var gridType = section === 'live' ? 'live' : (section === 'series' ? 'series' : 'vod');
        this.renderGrid(filtered, gridType);
        this.showLoading(false);
        this.updateCategorySelection(categoryId);
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                self.updateFocus();
            });
        });
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
    this.showLoading(true, I18n.t('loading.streams', 'Loading streams...'));
    var self = this;
    var promise;
    var isMergeMode = this.apis && this.apis.length >= 1 && !this.settings.activePlaylistId;
    var realCategoryId = categoryId;
    var categoryPlaylistId = null;
    var mergedIds = null;
    if (categoryId) {
        var catEl = document.querySelector('.category-item[data-category-id="' + CSS.escape(categoryId) + '"]');
        if (catEl) {
            if (catEl.dataset.merged === '1' && catEl.dataset.mergedIds) {
                mergedIds = {};
                catEl.dataset.mergedIds.split(',').forEach(function(id) { mergedIds[id] = true; });
            }
            else {
                realCategoryId = catEl.dataset.realCategoryId || categoryId;
                categoryPlaylistId = catEl.dataset.playlistId || null;
            }
        }
    }
    if (mergedIds) {
        var dataSectionM = isMixed ? section : apiSection;
        var allStreamsM = this.data[dataSectionM] ? this.data[dataSectionM].streams : [];
        var filteredM = allStreamsM.filter(function(s) {
            var key = s._playlistId ? s.category_id + '_' + s._playlistId : s.category_id;
            return mergedIds[key] === true || mergedIds[String(s.category_id)] === true;
        });
        promise = Promise.resolve(filteredM);
    }
    else if (!this.api || isMergeMode) {
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
            var allStreams = self.data[apiSection] ? self.data[apiSection].streams : streams;
            var titleHasHD = {};
            for (var ti = 0; ti < allStreams.length; ti++) {
                var as = allStreams[ti];
                var asIsSD = as._isSD !== undefined ? as._isSD : self.isSD(as);
                var asClean = as._dedupCleanTitle || self._normalizeDedupTitle(self.getStreamTitle(as));
                if (!asIsSD) titleHasHD[asClean] = true;
            }
            streams = streams.filter(function(s) {
                var sIsSD = s._isSD !== undefined ? s._isSD : self.isSD(s);
                if (!sIsSD) return true;
                var sClean = s._dedupCleanTitle || self._normalizeDedupTitle(self.getStreamTitle(s));
                return !titleHasHD[sClean];
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
    this.updateCurrentCategoryLabel();
};

// Category rendering
IPTVApp.prototype.getCategorySortConfig = function(section) {
    var key = (this.settings.activePlaylistId || '') + '_' + section;
    var config = this.categorySortBySection && this.categorySortBySection[key];
    if (config && config.mode) return config;
    return { mode: 'alpha', dir: 'asc' };
};

IPTVApp.prototype._buildCategoryUsage = function(streams, useGenre) {
    var usage = {};
    if (!this.watchHistory || !this.watchHistory.length) return usage;
    var streamLookup = {};
    var seriesLookup = {};
    for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        var catKey = s._playlistId ? s.category_id + '_' + s._playlistId : s.category_id;
        var entry = useGenre ? (s._normalizedGenres || []) : catKey;
        if (s.stream_id != null) {
            var sk = s._playlistId ? s.stream_id + '|' + s._playlistId : String(s.stream_id);
            streamLookup[sk] = entry;
        }
        if (s.series_id != null) {
            var srk = s._playlistId ? s.series_id + '|' + s._playlistId : String(s.series_id);
            seriesLookup[srk] = entry;
        }
    }
    var seen = {};
    for (var hi = 0; hi < this.watchHistory.length; hi++) {
        var h = this.watchHistory[hi];
        var lookupKey;
        var entry;
        if (h.seriesId != null) {
            lookupKey = 's:' + (h.playlistId ? h.seriesId + '|' + h.playlistId : h.seriesId);
            entry = seriesLookup[h.playlistId ? h.seriesId + '|' + h.playlistId : String(h.seriesId)];
        }
        else {
            lookupKey = 'v:' + (h.playlistId ? h.id + '|' + h.playlistId : h.id);
            entry = streamLookup[h.playlistId ? h.id + '|' + h.playlistId : String(h.id)];
        }
        if (seen[lookupKey]) continue;
        seen[lookupKey] = true;
        if (!entry) continue;
        if (useGenre) {
            for (var gi = 0; gi < entry.length; gi++) {
                var gKey = 'genre:' + entry[gi];
                usage[gKey] = (usage[gKey] || 0) + 1;
            }
        }
        else {
            usage[entry] = (usage[entry] || 0) + 1;
        }
    }
    return usage;
};

IPTVApp.prototype.updateCategorySortButtons = function() {
    var section = this.currentSection;
    if (!section) return;
    var config = this.getCategorySortConfig(section);
    var btns = document.querySelectorAll('#category-sort-bar .cat-sort-btn');
    var hideUsage = section === 'live';
    for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        if (btn.dataset.sort === 'usage') {
            this.setHidden(btn, hideUsage);
            if (hideUsage && config.mode === 'usage') {
                config = { mode: 'alpha', dir: 'asc' };
            }
        }
        var isSelected = btn.dataset.sort === config.mode;
        btn.classList.toggle('selected', isSelected);
        var arrow = btn.querySelector('.cat-sort-dir');
        if (arrow) arrow.textContent = config.dir === 'asc' ? '↑' : '↓';
    }
};

IPTVApp.prototype.toggleCategorySort = function(mode) {
    var section = this.currentSection;
    if (!section) return;
    var key = (this.settings.activePlaylistId || '') + '_' + section;
    if (!this.categorySortBySection) this.categorySortBySection = {};
    var current = this.categorySortBySection[key] || { mode: 'alpha', dir: 'asc' };
    if (current.mode === mode) {
        current = { mode: mode, dir: current.dir === 'asc' ? 'desc' : 'asc' };
    }
    else {
        current = { mode: mode, dir: mode === 'alpha' ? 'asc' : 'desc' };
    }
    this.categorySortBySection[key] = current;
    this.saveCategorySort();
    var data = this.data[section];
    if (data && data.categories && data.streams) {
        this.renderCategories(data.categories, data.streams);
    }
};

IPTVApp.prototype.renderCategories = function(categories, streams) {
    // Show sidebar and filters for normal browse screens
    this.showElement('sidebar');
    this.showElement('filters-bar');
    this.showElement('search-filters');
    this.showElement('sort-filters');
    this.showElement('rating-filters');
    this.showElement('category-sort-bar');
    this.updateCategorySortButtons();
    // Hide edit favorites button (only shown in favorites category)
    this.setHidden('edit-favorites-btn', true);
    this.inFilteredFavorites = false;
    this.filteredFavoriteIndices = null;
    var container = document.getElementById('categories-list');
    container.scrollTop = 0;
    container.innerHTML = '';
    var section = this.currentSection;
    var data = this.data[section];
    var countByCategory = (data && data._categoryCounts) ? data._categoryCounts : {};
    if (!data || !data._categoryCounts) {
        for (var sci = 0; sci < streams.length; sci++) {
            var s = streams[sci];
            var catKey = s._playlistId ? s.category_id + '_' + s._playlistId : s.category_id;
            countByCategory[catKey] = (countByCategory[catKey] || 0) + 1;
        }
    }
    // Hide filters not relevant for certain sections
    var isLive = section === 'live';
    var isVod = section === 'vod';
    document.getElementById('search-year').style.display = isLive ? 'none' : '';
    document.getElementById('search-actor').style.display = (!isLive && TMDB.isEnabled()) ? '' : 'none';
    document.getElementById('rating-filters').style.display = isLive ? 'none' : '';
    document.getElementById('sort-filters').style.display = '';
    var yearSortBtn = document.querySelector('.sort-btn[data-sort-group="year"]');
    if (yearSortBtn) yearSortBtn.style.display = isLive ? 'none' : '';
    var defaultSortBtn = document.querySelector('.sort-btn[data-sort-group="default"]');
    if (defaultSortBtn) defaultSortBtn.style.display = isLive ? 'none' : '';
    var titleInput = document.getElementById('search-title');
    if (titleInput) {
        titleInput.placeholder = I18n.t(isLive ? 'filters.name' : 'filters.title', isLive ? 'Name...' : 'Title...');
    }
    // Check TNT availability for live section
    var hasTnt = false;
    var tntCount = 0;
    if (section === 'live') {
        var activePlaylist = this.getActivePlaylist && this.getActivePlaylist();
        var isM3UPlaylist = activePlaylist && activePlaylist.type === 'm3u';
        if (!isM3UPlaylist) {
            var tntChannels = I18n.getTntChannels();
            if (tntChannels.length > 0) {
                tntCount = this.getTntStreamsCount(streams, tntChannels);
                hasTnt = tntCount > 0;
            }
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
    // Add "My ratings" pseudo-category for vod and series when TMDB logged in
    if ((section === 'vod' || section === 'series') && TMDB.isUserLoggedIn()) {
        var ratedStreams = this._getRatedStreamsForSection(section);
        if (ratedStreams.length > 0) {
            var ratedItem = document.createElement('div');
            ratedItem.className = 'category-item category-rated' + (defaultCategory === 'rated' ? ' selected' : '');
            this.setCategoryText(ratedItem, I18n.t('home.myRatings', 'My ratings') + ' (' + ratedStreams.length + ')');
            ratedItem.dataset.categoryId = 'rated';
            container.appendChild(ratedItem);
        }
    }
    // Add "Recommended" pseudo-category for vod and series only when non-empty
    if (this.settings.showRecommended !== false && (section === 'vod' || section === 'series')) {
        this.ensureRecommendationsComputed(section);
        if (this._hasRecommendations(section)) {
            var recCount = this._recommendationsCache[section].streams.length;
            var recItem = document.createElement('div');
            recItem.className = 'category-item category-recommended' + (defaultCategory === 'recommended' ? ' selected' : '');
            this.setCategoryText(recItem, I18n.t('home.recommended', 'Recommended') + ' (' + recCount + ')');
            recItem.dataset.categoryId = 'recommended';
            container.appendChild(recItem);
        }
    }
    // Add "TNT" category for live section (only if not empty)
    if (hasTnt) {
        var tntItem = document.createElement('div');
        tntItem.className = 'category-item category-tnt' + (defaultCategory === 'tnt' ? ' selected' : '');
        this.setCategoryText(tntItem, I18n.t('home.tnt', 'National TV') + ' (' + tntCount + ')');
        tntItem.dataset.categoryId = 'tnt';
        container.appendChild(tntItem);
    }
    var self = this;
    var data = this.data[section];
    var useGenre = this.settings.useGenreCategories && data && data._genreCategories && Object.keys(data._genreCategories).length > 0;
    if (categories.length > 1 || useGenre) {
        var totalCount = streams.length;
        var allItem = document.createElement('div');
        allItem.className = 'category-item' + (defaultCategory === '' ? ' selected' : '');
        this.setCategoryText(allItem, I18n.t('messages.all', 'All') + ' (' + totalCount + ')');
        allItem.dataset.categoryId = '';
        container.appendChild(allItem);
    }
    var preparedCategories = categories.map(function(cat) {
        var parsed = self.parseCategoryName(cat.category_name);
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
    if (useGenre) {
        var genreSet = data._genreCategories;
        preparedCategories = [];
        var genreNames = Object.keys(genreSet);
        for (var gni = 0; gni < genreNames.length; gni++) {
            var genre = genreNames[gni];
            preparedCategories.push({
                id: 'genre:' + genre,
                categoryId: null,
                name: genre,
                sortName: genre.toLowerCase(),
                genreCount: genreSet[genre],
                isGenre: true
            });
        }
    }
    var interfaceLang = I18n.getProviderLangCode(this.settings.locale);
    if (section === 'entertainment') {
        var sortKeywords = this.getEntertainmentSortKeywords();
        var entertainmentOrder = sortKeywords.order;
        var entertainmentLast = sortKeywords.last;
        preparedCategories.sort(function(a, b) {
            var aName = a.sortName;
            var bName = b.sortName;
            var aIsLast = entertainmentLast.some(function(k) { return aName.indexOf(k.toLowerCase()) !== -1; });
            var bIsLast = entertainmentLast.some(function(k) { return bName.indexOf(k.toLowerCase()) !== -1; });
            if (aIsLast && !bIsLast) return 1;
            if (!aIsLast && bIsLast) return -1;
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
    else {
        var sortConfig = self.getCategorySortConfig(section);
        var usageByCategory = sortConfig.mode === 'usage' ? self._buildCategoryUsage(streams, useGenre) : {};
        var dirMult = sortConfig.dir === 'asc' ? 1 : -1;
        var getCount = function(cat) {
            if (cat.isGenre) return cat.genreCount || 0;
            return countByCategory[cat.id] || 0;
        };
        preparedCategories.sort(function(a, b) {
            var aLang = a.langCode || interfaceLang;
            var bLang = b.langCode || interfaceLang;
            var aIsInterfaceLang = aLang === interfaceLang;
            var bIsInterfaceLang = bLang === interfaceLang;
            if (aIsInterfaceLang && !bIsInterfaceLang) return -1;
            if (!aIsInterfaceLang && bIsInterfaceLang) return 1;
            if (aLang !== bLang) {
                return aLang.localeCompare(bLang);
            }
            if (!a.isVostfr && b.isVostfr) return -1;
            if (a.isVostfr && !b.isVostfr) return 1;
            var diff = 0;
            if (sortConfig.mode === 'count') {
                diff = getCount(a) - getCount(b);
            }
            else if (sortConfig.mode === 'usage') {
                diff = (usageByCategory[a.id] || 0) - (usageByCategory[b.id] || 0);
            }
            else {
                diff = a.sortName.localeCompare(b.sortName);
            }
            if (diff !== 0) return diff * dirMult;
            return a.sortName.localeCompare(b.sortName);
        });
    }
    if (!useGenre) {
        preparedCategories = preparedCategories.filter(function(cat) {
            return (countByCategory[cat.id] || 0) > 0;
        });
    }
    // Merge categories sharing the same display name (e.g. several "Music"
    // entries left over after prefix stripping). Sort order is preserved by
    // keeping the first occurrence and absorbing the others into it.
    if (!useGenre) {
        var nameToFirst = {};
        var mergedList = [];
        preparedCategories.forEach(function(cat) {
            var key = (cat.name || '').toLowerCase().trim();
            if (!key) { mergedList.push(cat); return; }
            if (!nameToFirst[key]) {
                cat._mergedIds = [cat.id];
                cat._mergedCount = countByCategory[cat.id] || 0;
                nameToFirst[key] = cat;
                mergedList.push(cat);
            }
            else {
                var first = nameToFirst[key];
                first._mergedIds.push(cat.id);
                first._mergedCount += countByCategory[cat.id] || 0;
                first._isMerged = true;
            }
        });
        // Re-stamp the merged anchor's id so the sidebar selection works on the
        // synthetic merged identifier (not the first underlying category_id).
        mergedList.forEach(function(cat) {
            if (cat._isMerged) {
                cat._originalId = cat.id;
                cat.id = 'merged:' + cat.name.toLowerCase().trim();
            }
        });
        preparedCategories = mergedList;
    }
    var isFirst = (categories.length === 1 && continueCount === 0 && !useGenre);
    preparedCategories.forEach(function(cat) {
        var item = document.createElement('div');
        var isSelected = isFirst || cat.id === defaultCategory;
        item.className = 'category-item' + (isSelected ? ' selected' : '');
        if (cat.isGenre) {
            self.setCategoryText(item, cat.name + ' (' + cat.genreCount + ')');
            item.dataset.categoryId = cat.id;
            item.dataset.genre = cat.name;
        }
        else {
            var displayName = cat.name;
            if (section === 'manga' && cat.sourceType) {
                var typeName = cat.sourceType === 'series' ? I18n.t('home.series', 'Series') : I18n.t('home.movies', 'Movies');
                displayName = displayName.replace(Regex.manga, typeName);
            }
            if (section.indexOf('custom_') === 0 && cat.sourceType) {
                var typePrefix = cat.sourceType === 'series' ? I18n.t('home.series', 'Series') : I18n.t('home.movies', 'Movies');
                displayName = typePrefix + ' - ' + displayName;
            }
            var iconPrefix = cat.icon ? cat.icon + ' ' : '';
            var displayCount = cat._isMerged ? cat._mergedCount : (countByCategory[cat.id] || 0);
            self.setCategoryText(item, iconPrefix + displayName + ' (' + displayCount + ')');
            item.dataset.categoryId = cat.id;
            if (cat._isMerged) {
                item.dataset.merged = '1';
                item.dataset.mergedIds = cat._mergedIds.join(',');
            }
            else {
                item.dataset.realCategoryId = cat.categoryId;
            }
            if (cat.playlistId) item.dataset.playlistId = cat.playlistId;
            if (cat.sourceType) item.dataset.sourceType = cat.sourceType;
        }
        container.appendChild(item);
        isFirst = false;
    });
    var realCategoryCount = preparedCategories.length;
    window.log('SIDEBAR', 'render section=' + section + ' inputCats=' + categories.length + ' afterCountFilter=' + realCategoryCount + ' streams=' + (streams ? streams.length : 0));
    var sectionExpectsCategories = ['live', 'vod', 'series', 'sport', 'manga', 'entertainment'].indexOf(section) !== -1 || section.indexOf('custom_') === 0;
    if (sectionExpectsCategories && realCategoryCount === 0 && streams && streams.length > 0 && !this._sidebarRecovering) {
        this._sidebarRecovering = true;
        var recoverSelf = this;
        var apiSection = ['sport', 'manga', 'entertainment'].indexOf(section) !== -1 || section.indexOf('custom_') === 0 ? 'vod' : section;
        var rawCats = null, rawStreams = null;
        if (this.api && this.api.cache) {
            if (apiSection === 'vod') {
                rawCats = (this.api.cache.vodCategories || []).slice();
                rawStreams = (this.api.cache.vodStreams && this.api.cache.vodStreams['_all']) || [];
                if (section === 'manga' || section.indexOf('custom_') === 0) {
                    var seriesCats = (this.api.cache.seriesCategories || []).slice();
                    var seriesStreams = (this.api.cache.series && this.api.cache.series['_all']) || [];
                    seriesCats.forEach(function(c) { c._sourceType = 'series'; });
                    seriesStreams.forEach(function(s) { s._sourceType = 'series'; });
                    rawCats.forEach(function(c) { c._sourceType = 'vod'; });
                    rawStreams.forEach(function(s) { s._sourceType = 'vod'; });
                    rawCats = rawCats.concat(seriesCats);
                    rawStreams = rawStreams.concat(seriesStreams);
                }
            }
            else if (apiSection === 'series') {
                rawCats = (this.api.cache.seriesCategories || []).slice();
                rawStreams = (this.api.cache.series && this.api.cache.series['_all']) || [];
            }
            else if (apiSection === 'live') {
                rawCats = (this.api.cache.liveCategories || []).slice();
                rawStreams = (this.api.cache.liveStreams && this.api.cache.liveStreams['_all']) || [];
            }
        }
        var rerender = function() {
            var d = recoverSelf.data[section];
            window.log('SIDEBAR', 'recovery rerender section=' + section + ' cats=' + (d && d.categories ? d.categories.length : 'none') + ' streams=' + (d && d.streams ? d.streams.length : 'none'));
            if (d && d.categories) recoverSelf.renderCategories(d.categories, d.streams);
            recoverSelf._sidebarRecovering = false;
        };
        if (rawCats && rawStreams && rawCats.length > 0 && rawStreams.length > 0) {
            window.log('SIDEBAR', 'EMPTY: forcing re-preprocess for section=' + section + ' apiSection=' + apiSection + ' rawCats=' + rawCats.length + ' rawStreams=' + rawStreams.length);
            if (this.data[section]) delete this.data[section]._dedupGroups;
            var maybePromise = this._preprocessSection(section, rawCats, rawStreams);
            if (maybePromise && maybePromise.then) maybePromise.then(rerender);
            else rerender();
        }
        else {
            window.log('SIDEBAR', 'EMPTY: cannot recover (no api.cache for apiSection=' + apiSection + ')');
            this._sidebarRecovering = false;
        }
        return;
    }
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
    // Scroll sidebar so selected category is at top (only if not already visible)
    var selectedEl = categoryItems[selectedIndex];
    if (selectedEl) {
        var containerRect = container.getBoundingClientRect();
        var elRect = selectedEl.getBoundingClientRect();
        if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
            selectedEl.scrollIntoView({ block: 'start', behavior: 'auto' });
        }
    }
};

// Grid rendering
IPTVApp.prototype.renderGrid = function(streams, type, keepScroll) {
    window.log('GRID', 'renderGrid: ' + streams.length + ' ' + type + ' streams' + (keepScroll ? ' (keepScroll)' : ''));
    this.logMemory('renderGrid ' + type);
    var container = document.getElementById('content-grid');
    if (!keepScroll) container.scrollTop = 0;
    container.textContent = '';
    var gridLoader = document.createElement('div');
    gridLoader.id = 'grid-loader';
    var hg = document.createElement('span');
    hg.className = 'hourglass';
    var hgIcon = document.createElement('span');
    hgIcon.className = 'material-symbols-outlined';
    hgIcon.textContent = 'hourglass_empty';
    hg.appendChild(hgIcon);
    gridLoader.appendChild(hg);
    container.appendChild(gridLoader);
    this.originalStreams = streams.slice();
    this.currentStreams = streams;
    this._streamLookup = null;
    this.currentStreamType = type;
    // Save live channel list for channel switching
    if (type === 'live') {
        this.liveChannelList = streams;
    }
    this.displayedCount = 0;
    this._domOffset = 0;
    this._loadingMore = false;
    this._preloading = false;
    this._gridRowHeight = 0;
    var oldTopSpacer = document.getElementById('grid-top-spacer');
    if (oldTopSpacer) oldTopSpacer.remove();
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
    var isListView = container.classList.contains('list-view');
    var itemHeight = this._gridRowHeight || (isListView ? 95 : 275);
    var cols = isListView ? 1 : this.gridColumns;
    var remainingRows = Math.ceil(remainingItems / cols);
    spacer.style.height = (remainingRows * itemHeight) + 'px';
};

// Filters
IPTVApp.prototype._sortToGroup = function(sort) {
    if (sort === 'name' || sort === 'name-desc') return 'name';
    if (sort === 'year' || sort === 'year-asc') return 'year';
    if (sort === 'default' || sort === 'default-asc') return 'default';
    return null;
};

IPTVApp.prototype._isSortAsc = function(sort) {
    return sort === 'name' || sort === 'year-asc' || sort === 'default-asc';
};

IPTVApp.prototype._updateSortButtons = function() {
    var self = this;
    var genreActive = !!this.genreFilter;
    var group = genreActive ? null : this._sortToGroup(this.currentSort);
    var asc = this._isSortAsc(this.currentSort);
    document.querySelectorAll('.sort-btn').forEach(function(btn) {
        if (btn.id === 'genre-filter-btn') return;
        var btnGroup = btn.dataset.sortGroup;
        btn.classList.toggle('selected', btnGroup === group);
        btn.classList.toggle('genre-disabled', genreActive);
        var arrow = btn.querySelector('.sort-arrow');
        if (arrow) {
            if (btnGroup === group) {
                arrow.textContent = asc ? '↑' : '↓';
                arrow.style.display = '';
            }
            else {
                arrow.textContent = '';
                arrow.style.display = 'none';
            }
        }
    });
};

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
    this.genreFilter = null;
    this._genreFilteredStreams = null;
    this._genreNextPage = 1;
    this._genreTotalPages = null;
    this._genreReachedEnd = false;
    this._genreFetchInProgress = false;
    this._genreSeenStreamIds = null;
    this._genreMatchIndex = null;
    document.getElementById('search-title').value = '';
    document.getElementById('search-year').value = '';
    document.getElementById('search-actor').value = '';
    this._updateSortButtons();
    this.updateRatingStars(0);
    this._updateGenreButton();
    this._updateGenreButtonVisibility();
};

IPTVApp.prototype.applySortGroup = function(group) {
    if (this.genreFilter) {
        this.clearGenreFilter(true);
    }
    var newSort;
    var currentGroup = this._sortToGroup(this.currentSort);
    if (currentGroup === group) {
        // Toggle direction
        if (group === 'default') {
            newSort = this.currentSort === 'default' ? 'default-asc' : 'default';
        }
        else if (group === 'name') {
            newSort = this.currentSort === 'name' ? 'name-desc' : 'name';
        }
        else {
            newSort = this.currentSort === 'year' ? 'year-asc' : 'year';
        }
    }
    else {
        // Default direction: default desc (newest first), name asc, year desc
        newSort = group === 'name' ? 'name' : (group === 'year' ? 'year' : 'default');
    }
    this.applySort(newSort);
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
    this._updateSortButtons();
    if (section === 'downloads' && this.settings.freeboxEnabled && this.settings.freeboxAppToken) {
        this._fbRestoreSortGroup = this._sortToGroup(sortType);
        this.showDownloadsScreen();
        return;
    }
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

// Genre filter (TMDB discover)
IPTVApp.prototype._getTMDBTypeForSection = function(section) {
    if (section === 'vod') return 'movie';
    if (section === 'series') return 'tv';
    return null;
};

IPTVApp.prototype._normalizeTitleForGenre = function(s) {
    if (!s) return '';
    return s.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

IPTVApp.prototype._extractStreamYear = function(s) {
    if (!s) return null;
    if (s.year) {
        var ny = parseInt(s.year, 10);
        if (ny) return ny;
    }
    var rd = s.releaseDate || s.release_date;
    if (rd) {
        var ry = parseInt(String(rd).substring(0, 4), 10);
        if (ry) return ry;
    }
    var name = s.name || '';
    var m = name.match(/\((\d{4})\)/);
    if (m) return parseInt(m[1], 10);
    return null;
};

IPTVApp.prototype._buildTitleYearIndex = function(streams) {
    var byTitleYear = {};
    var byTitleOnly = {};
    for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        // Use cleanTitle to strip category prefixes ("CA| ", "FR| ", "VF | ") and
        // quality tags. Without this the provider title "CA| Hypnotic (2023)"
        // never matches TMDB's "Hypnotic".
        var rawTitle = (typeof this.getStreamTitle === 'function') ? this.getStreamTitle(s) : (s.name || '');
        var cleaned = (typeof this.cleanTitle === 'function') ? this.cleanTitle(rawTitle) : rawTitle;
        var t = this._normalizeTitleForGenre(cleaned || rawTitle);
        if (!t) continue;
        // Year must come from the RAW title — cleanTitle already stripped "(YYYY)".
        var y = this._extractStreamYear(s);
        if (!y) {
            var ym = String(rawTitle).match(/\((\d{4})\)/);
            if (ym) y = parseInt(ym[1], 10);
        }
        if (y) {
            var keyTY = t + '|' + y;
            if (!byTitleYear[keyTY]) byTitleYear[keyTY] = [];
            byTitleYear[keyTY].push(s);
        }
        if (!byTitleOnly[t]) byTitleOnly[t] = [];
        byTitleOnly[t].push(s);
    }
    return { byTitleYear: byTitleYear, byTitleOnly: byTitleOnly };
};

IPTVApp.prototype._matchTMDBToStream = function(tmdbResult, isMovie, index, opts) {
    if (!tmdbResult || !index) return null;
    var requireYear = !!(opts && opts.requireYear);
    var titles = [];
    if (isMovie) {
        if (tmdbResult.title) titles.push(tmdbResult.title);
        if (tmdbResult.original_title && tmdbResult.original_title !== tmdbResult.title) {
            titles.push(tmdbResult.original_title);
        }
    } else {
        if (tmdbResult.name) titles.push(tmdbResult.name);
        if (tmdbResult.original_name && tmdbResult.original_name !== tmdbResult.name) {
            titles.push(tmdbResult.original_name);
        }
    }
    var dateField = isMovie ? tmdbResult.release_date : tmdbResult.first_air_date;
    var year = dateField ? parseInt(String(dateField).substring(0, 4), 10) : null;
    for (var i = 0; i < titles.length; i++) {
        var orig = titles[i] || '';
        var t = this._normalizeTitleForGenre(orig);
        if (!t) continue;
        // Skip foreign-script titles that collapsed to a tiny ASCII fragment after
        // stripping non-ASCII. E.g. "ネット版　仮面ライダーオーズ　バースX誕生・序章" → "x", which
        // would otherwise false-match any stream titled "X". Short titles like "M",
        // "X", "Up" stay valid because their original is itself short (no stripping).
        if (orig.length >= 4 && t.length * 2 < orig.length) continue;
        if (year) {
            var hit = index.byTitleYear[t + '|' + year];
            if (hit && hit.length) return hit[0];
            // Skip the ±1 year fallback when requireYear is true. The short-film
            // filter cannot afford ±1 tolerance: e.g. Saw (2003, original 9min
            // short) would otherwise match a user catalog entry "Saw (2004)" which
            // is the 103min feature film.
            if (requireYear) continue;
            hit = index.byTitleYear[t + '|' + (year - 1)] || index.byTitleYear[t + '|' + (year + 1)];
            if (hit && hit.length) return hit[0];
        }
        // Skip the title-only fallback when the caller demands a year match.
        // Generic titles ("Love", "Underwater", "Hello") otherwise produce false
        // positives for genres with few results (notably the short-film virtual filter).
        if (requireYear) continue;
        var titleHit = index.byTitleOnly[t];
        if (titleHit && titleHit.length) return titleHit[0];
    }
    return null;
};

IPTVApp.prototype._updateGenreButton = function() {
    var btn = document.getElementById('genre-filter-btn');
    if (!btn) return;
    var label = document.getElementById('genre-filter-label');
    var active = !!this.genreFilter;
    btn.classList.toggle('selected', active);
    if (label) {
        label.textContent = active ? (' · ' + this.genreFilter.name) : '';
    }
};

IPTVApp.prototype._updateGenreButtonVisibility = function() {
    var btn = document.getElementById('genre-filter-btn');
    if (!btn) return;
    var supported = !!this._getTMDBTypeForSection(this.currentSection);
    this.setHidden(btn, !supported);
};

IPTVApp.prototype._clearChildren = function(el) {
    while (el && el.firstChild) el.removeChild(el.firstChild);
};

IPTVApp.prototype.openGenrePicker = function() {
    var type = this._getTMDBTypeForSection(this.currentSection);
    if (!type) return;
    var modal = document.getElementById('genre-picker-modal');
    var listEl = document.getElementById('genre-picker-list');
    var loadingEl = document.getElementById('genre-picker-loading');
    var clearBtn = document.getElementById('genre-picker-clear-btn');
    if (!modal || !listEl) return;
    this._clearChildren(listEl);
    this.setHidden(loadingEl, false);
    this.setHidden(clearBtn, !this.genreFilter);
    this.setHidden(modal, false);
    this._updateGenrePickerSortButtons();
    this._previousFocusArea = this.focusArea;
    this._previousFocusIndex = this.focusIndex;
    this.focusArea = 'genre-picker';
    this.focusIndex = 0;
    var self = this;
    TMDB.getGenresList(type, function(genres) {
        self.setHidden(loadingEl, true);
        self._clearChildren(listEl);
        if (!genres || !genres.length) {
            self.invalidateFocusables();
            self.updateFocus();
            return;
        }
        var activeId = self.genreFilter ? self.genreFilter.id : null;
        for (var i = 0; i < genres.length; i++) {
            var g = genres[i];
            var item = document.createElement('button');
            item.className = 'genre-picker-item focusable';
            item.dataset.genreId = String(g.id);
            item.dataset.genreName = g.name;
            item.textContent = g.name;
            if (activeId && String(activeId) === String(g.id)) {
                item.classList.add('selected');
            }
            listEl.appendChild(item);
        }
        self.invalidateFocusables();
        self.updateFocus();
    });
};

IPTVApp.prototype.closeGenrePicker = function() {
    var modal = document.getElementById('genre-picker-modal');
    if (!modal) return;
    this.setHidden(modal, true);
    if (this._previousFocusArea) {
        this.focusArea = this._previousFocusArea;
        this.focusIndex = this._previousFocusIndex || 0;
        this._previousFocusArea = null;
        this._previousFocusIndex = null;
    }
    this.invalidateFocusables();
    this.updateFocus();
};

IPTVApp.prototype._GENRE_PAGES_PER_BATCH = 3;
IPTVApp.prototype._GENRE_MAX_PAGES = 50; // 1000 titles per genre — big genres (sci-fi, drama) need more depth when matching against a provider catalog
IPTVApp.prototype._GENRE_PREFETCH_THRESHOLD = 10; // start fetch when ≤ N items left
IPTVApp.prototype._SHORT_AUTO_TARGET = 30; // short-film filter only: auto-fetch batches without user scroll until ≥ N matches accumulated. Required because TMDB pagination is popularity-sorted and a given short (e.g. Martin poids lourd id=148605, runtime=5) lands on page 5 at ≤5min but page 11 at ≤10min, so 3-page initial batches never reach it.
IPTVApp.prototype._GENRE_RATING_VOTE_MIN = 200;  // floor on TMDB vote_count when sorting by rating (filters out obscure 10/10)
IPTVApp.prototype._GENRE_DATE_VOTE_MIN = 10;  // light floor when sorting by date (filters truly unknown films but stays permissive)

IPTVApp.prototype._getGenrePickerSort = function() {
    var s = this.settings && this.settings.genrePickerSort;
    if (s && s.group) return { group: s.group, asc: !!s.asc };
    return { group: 'popularity', asc: false };
};

IPTVApp.prototype._getShortRuntime = function() {
    var v = this.settings && this.settings.shortFilmMaxRuntime;
    return (typeof v === 'number' && v > 0) ? v : 40;
};

IPTVApp.prototype._buildDiscoverOptions = function(type, sort) {
    var dir = sort.asc ? 'asc' : 'desc';
    var opts = {};
    if (sort.group === 'rating') {
        opts.sortBy = 'vote_average.' + dir;
        opts.voteCountMin = this._GENRE_RATING_VOTE_MIN;
    } else if (sort.group === 'date') {
        var isTv = (type === 'tv' || type === 'series');
        var dateField = isTv ? 'first_air_date' : 'primary_release_date';
        opts.sortBy = dateField + '.' + dir;
        // Filter out future releases — they pollute date.desc with announced-but-not-released titles.
        opts.dateLte = { field: dateField, value: this._todayIso() };
        // Light vote_count floor: keeps recent indie/festival films out without being as
        // strict as the rating sort (which uses 200).
        opts.voteCountMin = this._GENRE_DATE_VOTE_MIN;
    } else {
        opts.sortBy = 'popularity.' + dir;
    }
    if (this.genreFilter && this.genreFilter.id === 'short') {
        opts.shortFilmMinRuntime = this._getShortMin();
        opts.shortFilmMaxRuntime = this._getShortRuntime();
    }
    return opts;
};

IPTVApp.prototype._todayIso = function() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
};

IPTVApp.prototype._updateGenrePickerSortButtons = function() {
    var sort = this._getGenrePickerSort();
    document.querySelectorAll('.genre-sort-btn').forEach(function(btn) {
        var btnGroup = btn.dataset.genreSortGroup;
        var arrow = btn.querySelector('.sort-arrow');
        var selected = (btnGroup === sort.group);
        btn.classList.toggle('selected', selected);
        if (arrow) {
            if (selected) {
                arrow.textContent = sort.asc ? '↑' : '↓';
                arrow.style.display = '';
            }
            else {
                arrow.textContent = '';
                arrow.style.display = 'none';
            }
        }
    });
};

IPTVApp.prototype.SHORT_MIN_PRESETS = [1, 5, 10, 15, 20, 30];
IPTVApp.prototype.SHORT_MAX_PRESETS = [5, 10, 15, 20, 30, 40, 60];

IPTVApp.prototype._getShortMin = function() {
    var v = this.settings && this.settings.shortFilmMinRuntime;
    return (typeof v === 'number' && v > 0) ? v : 1;
};

IPTVApp.prototype._cyclePreset = function(presets, current) {
    var idx = presets.indexOf(current);
    return presets[(idx + 1) % presets.length];
};

IPTVApp.prototype.openShortRuntimeModal = function(genreName) {
    var modal = document.getElementById('short-runtime-modal');
    if (!modal) return;
    this._pendingShortGenreName = genreName;
    this._pendingShortMin = this._getShortMin();
    this._pendingShortMax = this._getShortRuntime();
    this._updateShortRuntimeModal();
    this.setHidden(modal, false);
    this._previousFocusAreaShort = this.focusArea;
    this._previousFocusIndexShort = this.focusIndex;
    this.focusArea = 'short-runtime';
    this.focusIndex = 3; // default focus on "Filtrer"
    this.invalidateFocusables();
    this.updateFocus();
};

IPTVApp.prototype.closeShortRuntimeModal = function() {
    var modal = document.getElementById('short-runtime-modal');
    if (!modal) return;
    this.setHidden(modal, true);
    if (this._previousFocusAreaShort) {
        this.focusArea = this._previousFocusAreaShort;
        this.focusIndex = this._previousFocusIndexShort || 0;
        this._previousFocusAreaShort = null;
        this._previousFocusIndexShort = null;
    }
    this.invalidateFocusables();
    this.updateFocus();
};

IPTVApp.prototype._updateShortRuntimeModal = function() {
    var minEl = document.getElementById('short-min-value');
    var maxEl = document.getElementById('short-max-value');
    if (minEl) minEl.textContent = this._pendingShortMin;
    if (maxEl) maxEl.textContent = this._pendingShortMax;
};

IPTVApp.prototype.cycleShortMin = function() {
    var next = this._cyclePreset(this.SHORT_MIN_PRESETS, this._pendingShortMin);
    this._pendingShortMin = next;
    // Bump max if it's now below the new min.
    if (this._pendingShortMax < next) {
        for (var i = 0; i < this.SHORT_MAX_PRESETS.length; i++) {
            if (this.SHORT_MAX_PRESETS[i] >= next) { this._pendingShortMax = this.SHORT_MAX_PRESETS[i]; break; }
        }
    }
    this._updateShortRuntimeModal();
    window.log('ACTION', 'cycleShortMin → ' + next + 'min');
};

IPTVApp.prototype.cycleShortMax = function() {
    var next = this._cyclePreset(this.SHORT_MAX_PRESETS, this._pendingShortMax);
    this._pendingShortMax = next;
    if (this._pendingShortMin > next) {
        for (var i = this.SHORT_MIN_PRESETS.length - 1; i >= 0; i--) {
            if (this.SHORT_MIN_PRESETS[i] <= next) { this._pendingShortMin = this.SHORT_MIN_PRESETS[i]; break; }
        }
    }
    this._updateShortRuntimeModal();
    window.log('ACTION', 'cycleShortMax → ' + next + 'min');
};

IPTVApp.prototype.applyShortRuntimeModal = function() {
    if (typeof this.settings !== 'object') this.settings = {};
    this.settings.shortFilmMinRuntime = this._pendingShortMin;
    this.settings.shortFilmMaxRuntime = this._pendingShortMax;
    this.saveSettings();
    var name = this._pendingShortGenreName || 'Court-métrage';
    window.log('ACTION', 'applyShortRuntimeModal min=' + this._pendingShortMin + ' max=' + this._pendingShortMax);
    this.closeShortRuntimeModal();
    this.closeGenrePicker();
    this.applyGenreFilter('short', name);
};

IPTVApp.prototype.applyGenrePickerSort = function(group) {
    var current = this._getGenrePickerSort();
    var newSort;
    if (current.group === group) {
        newSort = { group: group, asc: !current.asc };
    } else {
        newSort = { group: group, asc: false };
    }
    if (typeof this.settings !== 'object') this.settings = {};
    this.settings.genrePickerSort = newSort;
    this.saveSettings();
    this._updateGenrePickerSortButtons();
    window.log('ACTION', 'applyGenrePickerSort group=' + newSort.group + ' asc=' + newSort.asc);
    // Re-fetch from page 1 if a genre is currently active.
    if (this.genreFilter) {
        this.applyGenreFilter(this.genreFilter.id, this.genreFilter.name);
    }
};

IPTVApp.prototype.applyGenreFilter = function(genreId, genreName) {
    var type = this._getTMDBTypeForSection(this.currentSection);
    if (!type || !genreId) return;
    window.log('ACTION', 'applyGenreFilter id=' + genreId + ' name=' + genreName + ' type=' + type);
    this.genreFilter = { id: genreId, name: genreName, type: type };
    this._genreFilteredStreams = null;
    this._genreNextPage = 1;
    this._genreTotalPages = null;
    this._genreReachedEnd = false;
    this._genreFetchInProgress = false;
    this._genreSeenStreamIds = {};
    var streamsAtRequest = this.originalStreams || [];
    this._genreMatchIndex = this._buildTitleYearIndex(streamsAtRequest);
    window.log('GENRE', 'index built: ' + streamsAtRequest.length + ' streams, ' +
        Object.keys(this._genreMatchIndex.byTitleYear).length + ' (title|year) keys, ' +
        Object.keys(this._genreMatchIndex.byTitleOnly).length + ' title-only keys');
    this.closeGenrePicker();
    this._updateGenreButton();
    this._updateSortButtons();
    var requestId = (this._genreRequestId || 0) + 1;
    this._genreRequestId = requestId;
    var gridEl = document.getElementById('content-grid');
    this._clearChildren(gridEl);
    if (typeof this.showEmptyMessage === 'function') {
        this.showEmptyMessage('content-grid', 'common.loading', 'Loading...');
    }
    var self = this;
    this._fetchGenrePagesBatch(requestId, function(newStreams, isInitial) {
        if (self._genreRequestId !== requestId) return;
        if (!self.genreFilter || String(self.genreFilter.id) !== String(genreId)) return;
        self._genreFilteredStreams = newStreams.slice();
        window.log('GENRE', 'initial batch: ' + newStreams.length + ' matched streams for genre=' + genreName +
            ' (totalPages=' + self._genreTotalPages + ')');
        self.applyFilters();
        if (genreId === 'short') self._autoPaginateShorts(requestId);
    }, true);
};

// For the short-film virtual filter, keep fetching batches (without waiting for
// user scroll) until we have at least _SHORT_AUTO_TARGET matches accumulated or
// TMDB pagination is exhausted. Required because match rate is sparse (~0-2 per
// page) and the popularity-sorted pagination pushes specific shorts far down
// when the runtime window widens (Martin poids lourd at page 5 with ≤5min,
// page 11 with ≤10min, page 26 with ≤40min).
IPTVApp.prototype._autoPaginateShorts = function(requestId) {
    var self = this;
    if (!this.genreFilter || this.genreFilter.id !== 'short') return;
    if (this._genreRequestId !== requestId) return;
    if (this._genreReachedEnd) return;
    var current = (this._genreFilteredStreams || []).length;
    if (current >= this._SHORT_AUTO_TARGET) return;
    if (this._genreFetchInProgress) return;
    this._fetchGenrePagesBatch(requestId, function(newStreams) {
        if (self._genreRequestId !== requestId) return;
        if (newStreams.length) self._appendGenreMatches(newStreams);
        else window.log('GENRE', 'auto-paginate: 0 matches in batch (nextPage=' + self._genreNextPage + ', total=' + (self._genreFilteredStreams || []).length + ')');
        // Recursion is driven by finish() in _fetchGenrePagesBatch, not here, so
        // scroll-triggered prefetches that race in via loadMoreItems also re-arm
        // the auto-paginate chain instead of killing it.
    }, false);
};

// Fetch the next batch of TMDB discover pages (3 at a time) and append matches to
// the caller-provided callback. The first batch (isInitial=true) clears state and
// resets the grid via applyFilters(); subsequent batches append to the existing
// rendered grid via _appendGenreMatches().
IPTVApp.prototype._fetchGenrePagesBatch = function(requestId, onComplete, isInitial) {
    if (!this.genreFilter) return;
    var startPage = this._genreNextPage || 1;
    if (this._genreTotalPages && startPage > this._genreTotalPages) {
        this._genreReachedEnd = true;
        return;
    }
    if (startPage > this._GENRE_MAX_PAGES) {
        this._genreReachedEnd = true;
        return;
    }
    if (this._genreFetchInProgress) return;
    this._genreFetchInProgress = true;
    var self = this;
    var type = this.genreFilter.type;
    var genreId = this.genreFilter.id;
    var pagesPerBatch = this._GENRE_PAGES_PER_BATCH;
    var endPage = Math.min(startPage + pagesPerBatch - 1, this._GENRE_MAX_PAGES);
    if (this._genreTotalPages) endPage = Math.min(endPage, this._genreTotalPages);
    var fetched = 0;
    var pagesRequested = endPage - startPage + 1;
    var allMatches = [];
    var seenIds = this._genreSeenStreamIds || {};
    var sawEmptyPage = false;
    var discoverOptions = this._buildDiscoverOptions(type, this._getGenrePickerSort());
    var isShortFilter = !!(this.genreFilter && this.genreFilter.id === 'short');
    var matchOpts = { requireYear: isShortFilter };
    var onPage = function(pageNum) {
        return function(data) {
            fetched++;
            if (data) {
                if (data.total_pages && !self._genreTotalPages) {
                    self._genreTotalPages = data.total_pages;
                }
                if (data.results) {
                    if (data.results.length === 0) sawEmptyPage = true;
                    for (var i = 0; i < data.results.length; i++) {
                        var tmdbItem = data.results[i];
                        var match = self._matchTMDBToStream(tmdbItem, type === 'movie', self._genreMatchIndex, matchOpts);
                        if (!match) continue;
                        var sid = match.stream_id || match.vod_id || match.series_id;
                        var key = sid != null ? String(sid) : (match.name || '') + '|p' + pageNum + 'i' + i;
                        if (seenIds[key]) continue;
                        seenIds[key] = true;
                        if (isShortFilter) {
                            window.log('GENRE', 'short-match: tmdb=' + tmdbItem.id + ' "' + (tmdbItem.title || tmdbItem.name) + '" (' + (tmdbItem.release_date || tmdbItem.first_air_date || '?') + ') ↔ stream=' + sid + ' "' + (match.name || '') + '"');
                        }
                        var tmdbYear = parseInt((tmdbItem.release_date || tmdbItem.first_air_date || '').substring(0, 4), 10) || null;
                        allMatches.push({ stream: match, order: pageNum * 1000 + i, tmdbItem: tmdbItem, tmdbYear: tmdbYear });
                    }
                }
            }
            if (fetched === pagesRequested) {
                if (self._genreRequestId !== requestId) {
                    self._genreFetchInProgress = false;
                    return;
                }
                self._genreSeenStreamIds = seenIds;
                self._genreNextPage = endPage + 1;
                if (sawEmptyPage || (self._genreTotalPages && self._genreNextPage > self._genreTotalPages) || self._genreNextPage > self._GENRE_MAX_PAGES) {
                    self._genreReachedEnd = true;
                }
                allMatches.sort(function(a, b) { return a.order - b.order; });
                var finish = function(finalMatches) {
                    self._genreFetchInProgress = false;
                    if (self._genreRequestId !== requestId) return;
                    var streams = finalMatches.map(function(m) { return m.stream; });
                    onComplete(streams, !!isInitial);
                    // For short-film filter: chain another auto-paginate after ANY
                    // batch completes (auto OR scroll-driven prefetch). Prevents the
                    // auto-paginate chain from dying when prefetch races in via
                    // loadMoreItems → _maybePrefetchGenrePages.
                    if (self.genreFilter && self.genreFilter.id === 'short') {
                        self._autoPaginateShorts(requestId);
                    }
                };
                if (isShortFilter && allMatches.length) {
                    self._filterShortCollisions(allMatches, requestId, function(noCollisions) {
                        if (self._genreRequestId !== requestId) { finish([]); return; }
                        self._filterShortRuntimes(noCollisions, requestId, finish);
                    });
                } else {
                    finish(allMatches);
                }
            }
        };
    };
    for (var p = startPage; p <= endPage; p++) {
        TMDB.discover(type, genreId, p, onPage(p), discoverOptions);
    }
};

// For each short-film match candidate, fetch the TMDB runtime and drop matches
// whose actual runtime is outside the user-chosen [min, max] bounds. Required
// because TMDB's with_runtime filter on /discover/movie is unreliable even when
// combined with the short-film keyword (the paradox query gte=10 AND lte=5
// returns ~15 results, and concretely "La vie en lumière" id=594530 runtime=7
// leaks through a gte=10 filter, ending up matched against a user catalog
// stream that expected 10–30min content).
IPTVApp.prototype._filterShortRuntimes = function(matches, requestId, callback) {
    var self = this;
    if (!matches.length) { callback(matches); return; }
    var min = this._getShortMin();
    var max = this._getShortRuntime();
    var pending = matches.length;
    var kept = [];
    matches.forEach(function(m) {
        var item = m.tmdbItem;
        TMDB.getMovieRuntime(item.id, function(rt) {
            if (self._genreRequestId !== requestId) {
                pending--;
                if (pending === 0) callback([]);
                return;
            }
            if (rt == null) {
                // Unknown runtime: be conservative and drop. Most "unknown
                // runtime" entries on TMDB are unreleased films or contributor
                // placeholders that shouldn't surface as shorts.
                window.log('GENRE', 'short-skip runtime-unknown: tmdb=' + item.id + ' "' + (item.title || item.name) + '"');
            } else if (rt < min || rt > max) {
                window.log('GENRE', 'short-skip runtime: tmdb=' + item.id + ' "' + (item.title || item.name) + '" runtime=' + rt + ' outside [' + min + ',' + max + ']');
            } else {
                kept.push(m);
            }
            pending--;
            if (pending === 0) {
                kept.sort(function(a, b) { return a.order - b.order; });
                window.log('GENRE', 'short-runtime pass: kept ' + kept.length + '/' + matches.length + ' in [' + min + ',' + max + ']');
                callback(kept);
            }
        });
    });
};

// For each short-film match candidate, check whether TMDB has another entry with
// the same title+year (= likely a feature film the user actually has in their
// catalog). Skip those matches. Runs all checks in parallel via the TMDB queue,
// preserves order.
IPTVApp.prototype._filterShortCollisions = function(matches, requestId, callback) {
    var self = this;
    var pending = matches.length;
    var kept = [];
    matches.forEach(function(m) {
        var item = m.tmdbItem;
        var title = item.title || item.name || '';
        TMDB.findFeatureCollision(title, m.tmdbYear, item.id, function(collision) {
            if (self._genreRequestId !== requestId) {
                pending--;
                if (pending === 0) callback([]);
                return;
            }
            if (collision) {
                window.log('GENRE', 'short-skip collision: tmdb=' + item.id + ' "' + title + '" (' + m.tmdbYear + ') → feature id=' + collision.id + ' (' + (collision.vote_count || 0) + ' votes)');
            } else {
                kept.push(m);
            }
            pending--;
            if (pending === 0) {
                kept.sort(function(a, b) { return a.order - b.order; });
                window.log('GENRE', 'short-collision pass: kept ' + kept.length + '/' + matches.length);
                callback(kept);
            }
        });
    });
};

// Hook called from loadMoreItems when the user is near the end of currentStreams.
// Triggers a background fetch of the next pages and appends matches to the grid.
IPTVApp.prototype._maybePrefetchGenrePages = function() {
    if (!this.genreFilter) return;
    if (this._genreReachedEnd || this._genreFetchInProgress) return;
    var remaining = (this.currentStreams || []).length - (this.displayedCount || 0);
    if (remaining > this._GENRE_PREFETCH_THRESHOLD) return;
    var requestId = this._genreRequestId;
    var self = this;
    this._fetchGenrePagesBatch(requestId, function(newStreams) {
        if (self._genreRequestId !== requestId) return;
        if (!newStreams.length) {
            window.log('GENRE', 'pagination: no new matches in batch (reachedEnd=' + self._genreReachedEnd + ')');
            return;
        }
        self._appendGenreMatches(newStreams);
    }, false);
};

// Append newly-fetched genre matches to _genreFilteredStreams + currentStreams
// without re-rendering the existing grid (preserves scroll position and focus).
IPTVApp.prototype._appendGenreMatches = function(newStreams) {
    if (!newStreams || !newStreams.length) return;
    this._genreFilteredStreams = (this._genreFilteredStreams || []).concat(newStreams);
    this.currentStreams = (this.currentStreams || []).concat(newStreams);
    this._streamLookup = null;
    window.log('GENRE', 'pagination: +' + newStreams.length + ' streams (total=' +
        this._genreFilteredStreams.length + ', nextPage=' + this._genreNextPage + ')');
    this.updateGridSpacer();
    this.invalidateFocusables();
    this.loadMoreItems();
    // loadMoreItems only calls loadVisibleImages on the first batch — newly appended
    // items via genre pagination (especially short-film auto-pagination) otherwise
    // wait for an unrelated trigger (scroll, focus change) before their posters
    // load. Force a refresh here so the new items are processed immediately.
    this.loadVisibleImages();
};

IPTVApp.prototype.clearGenreFilter = function(skipRender) {
    if (!this.genreFilter) return;
    window.log('ACTION', 'clearGenreFilter');
    this.genreFilter = null;
    this._genreFilteredStreams = null;
    this._genreNextPage = 1;
    this._genreTotalPages = null;
    this._genreReachedEnd = false;
    this._genreFetchInProgress = false;
    this._genreSeenStreamIds = null;
    this._genreMatchIndex = null;
    this._genreRequestId = (this._genreRequestId || 0) + 1;
    this._updateGenreButton();
    this._updateSortButtons();
    if (!skipRender) {
        this.applyFilters();
    }
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
    // CSS changed item dimensions; re-measure so trim/ensureItems use the right rowHeight.
    var firstItem = grid.querySelector('.grid-item');
    this._gridRowHeight = (firstItem && firstItem.offsetHeight > 0) ? firstItem.offsetHeight + 10 : 0;
    document.querySelectorAll('.view-btn').forEach(function(btn) {
        btn.classList.toggle('selected', btn.dataset.view === mode);
    });
    // Load more items if switching to list mode and not enough items displayed
    if (mode === 'list' && this.displayedCount < 20) {
        this.loadMoreItems();
    }
    // Grid and list don't show the same number of visible items (grid = cols ×
    // rows, list = 1 × rows); re-compute visible range and fetch any missing
    // posters/genres for items newly in view.
    this._trimExcessDomItems();
    this.loadVisibleImages();
    this.loadVisibleEPG();
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

IPTVApp.prototype._getExcludeKeywordRegex = function() {
    var enabled = !!this.settings.hideExcludeKeywords;
    var keywords = this.settings.excludeKeywords || [];
    var cacheKey = (enabled ? '1' : '0') + '' + keywords.join('');
    if (this._excludeKeywordRegexKey === cacheKey) {
        return this._excludeKeywordRegex;
    }
    this._excludeKeywordRegexKey = cacheKey;
    if (!enabled) {
        this._excludeKeywordRegex = null;
        return null;
    }
    var escaped = [];
    for (var i = 0; i < keywords.length; i++) {
        var keyword = (keywords[i] || '').trim();
        if (keyword) {
            escaped.push(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        }
    }
    this._excludeKeywordRegex = escaped.length ? new RegExp('\\b(' + escaped.join('|') + ')\\b', 'i') : null;
    return this._excludeKeywordRegex;
};

IPTVApp.prototype.isExcludedCategoryName = function(categoryName) {
    var regex = this._getExcludeKeywordRegex();
    return regex ? regex.test(categoryName || '') : false;
};

IPTVApp.prototype._normalizeDedupTitle = function(title) {
    if (!title) return '';
    var s = title;
    var lastPipe = s.lastIndexOf('|');
    if (lastPipe !== -1) s = s.substring(lastPipe + 1);
    return this.cleanTitle(s).toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

IPTVApp.prototype._consolidateDedupGroupsByCleanTitle = function(dedupGroups) {
    var YEAR_DELTA_MAX = 2;
    var byCleanTitle = {};
    var keys = Object.keys(dedupGroups);
    for (var ki = 0; ki < keys.length; ki++) {
        var key = keys[ki];
        var sepIdx = key.lastIndexOf('|');
        if (sepIdx < 0) continue;
        var ct = key.substring(0, sepIdx);
        var yearStr = key.substring(sepIdx + 1);
        var year = yearStr ? parseInt(yearStr, 10) || null : null;
        if (!byCleanTitle[ct]) byCleanTitle[ct] = [];
        byCleanTitle[ct].push({ key: key, year: year, group: dedupGroups[key] });
    }
    var ctKeys = Object.keys(byCleanTitle);
    for (var ci = 0; ci < ctKeys.length; ci++) {
        var entries = byCleanTitle[ctKeys[ci]];
        if (entries.length < 2) continue;
        var withYear = [];
        var noYear = [];
        for (var ei = 0; ei < entries.length; ei++) {
            if (entries[ei].year === null) noYear.push(entries[ei]);
            else withYear.push(entries[ei]);
        }
        if (withYear.length >= 2) {
            var minY = withYear[0].year;
            var maxY = withYear[0].year;
            for (var wi = 1; wi < withYear.length; wi++) {
                if (withYear[wi].year < minY) minY = withYear[wi].year;
                if (withYear[wi].year > maxY) maxY = withYear[wi].year;
            }
            if (maxY - minY > YEAR_DELTA_MAX) continue;
        }
        var anchor = null;
        if (withYear.length > 0) {
            anchor = withYear[0];
            for (var wi2 = 1; wi2 < withYear.length; wi2++) {
                if (withYear[wi2].group.length > anchor.group.length) anchor = withYear[wi2];
            }
        }
        else {
            anchor = entries[0];
            for (var ni = 1; ni < entries.length; ni++) {
                if (entries[ni].group.length > anchor.group.length) anchor = entries[ni];
            }
        }
        for (var mi = 0; mi < entries.length; mi++) {
            var e = entries[mi];
            if (e.key === anchor.key) continue;
            for (var gi = 0; gi < e.group.length; gi++) {
                e.group[gi]._dedupKey = anchor.key;
                anchor.group.push(e.group[gi]);
            }
            delete dedupGroups[e.key];
        }
        anchor.group.sort(function(a, b) {
            return parseInt(a.stream_id || a.series_id || 0) - parseInt(b.stream_id || b.series_id || 0);
        });
    }
};

IPTVApp.prototype._sortByDateAdded = function(streams, asc, useLocalDate) {
    var n = streams.length;
    if (n < 2) return;
    var withIdx = new Array(n);
    for (var i = 0; i < n; i++) {
        var added;
        if (useLocalDate && streams[i]._addedAt) {
            added = streams[i]._addedAt;
        }
        else {
            var raw = streams[i].added;
            added = (raw === undefined || raw === null || raw === '') ? 0 : (parseInt(raw, 10) || 0);
        }
        withIdx[i] = { s: streams[i], i: i, added: added };
    }
    withIdx.sort(function(a, b) {
        if (a.added !== b.added) return asc ? (a.added - b.added) : (b.added - a.added);
        return a.i - b.i;
    });
    for (var k = 0; k < n; k++) streams[k] = withIdx[k].s;
};

IPTVApp.prototype.applyFilters = function() {
    var self = this;
    this._filterGeneration = (this._filterGeneration || 0) + 1;
    var generation = this._filterGeneration;
    // When genre filter is active, start from the TMDB-matched subset (popularity order preserved).
    // Search/rating filters still apply on top; sort is bypassed (TMDB popularity wins).
    var streams = (this.genreFilter && this._genreFilteredStreams)
        ? this._genreFilteredStreams.slice()
        : this.originalStreams.slice();
    var titleFilter = document.getElementById('search-title').value.toLowerCase().trim();
    this.searchTitle = titleFilter;
    if (titleFilter) {
        var normalizedFilter = titleFilter
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        var searchWords = normalizedFilter.split(' ').filter(function(w) { return w.length > 0; });
        var titleOverridesSearch = {};
        try { titleOverridesSearch = JSON.parse(localStorage.getItem('titleOverrides') || '{}'); }
        catch (ex) {}
        var normalize = function(s) {
            return s.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
        };
        var matchesAllWords = function(haystack) {
            for (var w = 0; w < searchWords.length; w++) {
                if (haystack.indexOf(searchWords[w]) === -1) return false;
            }
            return true;
        };
        streams = streams.filter(function(s) {
            var sid = s.stream_id || s.vod_id || s.series_id;
            var override = sid ? titleOverridesSearch[sid] : null;
            if (override && matchesAllWords(normalize(override))) return true;
            if (s._searchKey) return matchesAllWords(s._searchKey);
            var rawName = self.getStreamTitle(s);
            return matchesAllWords(normalize(rawName));
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
    window.log('SORT', 'currentSort=' + this.currentSort + ', streams.length=' + streams.length + (this.genreFilter ? ' [GENRE-FILTER ACTIVE: skipping sort]' : ''));
    if (!this.genreFilter && (this.currentSort === 'default' || this.currentSort === 'default-asc')) {
        var firstSample = streams.slice(0, 5).map(function(s) {
            var id = s.stream_id || s.vod_id || s.series_id || '?';
            var name = (self.getStreamTitle(s) || '').substring(0, 30);
            return id + ':"' + name + '"(' + (s.added || 'no-added') + ')';
        }).join(' | ');
        window.log('SORT', 'default top5: ' + firstSample);
    }
    if (!this.genreFilter && (this.currentSort === 'year' || this.currentSort === 'year-asc')) {
        var yearRegex = /\((\d{4})\)/;
        streams.forEach(function(s) {
            if (s._sortYear === undefined) {
                var m = self.getStreamTitle(s).match(yearRegex);
                var extracted = m ? parseInt(m[1]) : 0;
                if (!extracted && s.year) {
                    extracted = parseInt(s.year, 10) || 0;
                }
                s._sortYear = extracted;
            }
        });
    }
    if (this.genreFilter) {
        // Sort phase skipped: TMDB popularity order from _genreFilteredStreams is preserved.
    }
    else if (this.currentSection === 'downloads') {
        // Sort phase skipped: Freebox file browser pre-sorts items via _sortFreeboxEntries.
    }
    else if ((this.currentSort === 'default' || this.currentSort === 'default-asc') && this.currentSection !== 'entertainment') {
        var userSections = { favorites: 1, continue: 1, rated: 1 };
        this._sortByDateAdded(streams, this.currentSort === 'default-asc', !!userSections[this.currentSection]);
    }
    else if (this.currentSort === 'default-asc' && this.currentSection === 'entertainment') {
        streams.reverse();
    }
    else if (this.currentSort !== 'default') {
        var sortCacheKey = this.currentSort + '_' + streams.length;
        if (this._lastSortKey === sortCacheKey && this._lastSortedStreams === streams) {
            window.log('SORT', 'using cached sort ' + this.currentSort);
        }
        else {
            window.log('SORT', 'applying sort ' + this.currentSort);
            var titleOverrides = {};
            try { titleOverrides = JSON.parse(localStorage.getItem('titleOverrides') || '{}'); }
            catch (ex) {}
            window.log('SORT', 'overrides loaded: ' + Object.keys(titleOverrides).length + ' entries');
            for (var si = 0; si < streams.length; si++) {
                var sid = streams[si].stream_id || streams[si].vod_id || streams[si].series_id;
                var override = sid ? titleOverrides[sid] : null;
                if (override) {
                    streams[si]._sortKey = self._computeSortKey(override, true);
                    streams[si]._sortKeyOverride = true;
                }
                else if (streams[si]._sortKeyOverride || !streams[si]._sortKey) {
                    var rawForSort = self.getStreamTitle(streams[si]);
                    var cleanForSort = self.cleanTitle(rawForSort);
                    streams[si]._sortKey = self._computeSortKey(cleanForSort || rawForSort, false);
                    streams[si]._sortKeyOverride = false;
                }
            }
            streams.sort(function(a, b) {
                var nameA = a._sortKey;
                var nameB = b._sortKey;
                switch (self.currentSort) {
                    case 'name':
                    case 'name-desc':
                        return self.currentSort === 'name' ? (nameA < nameB ? -1 : nameA > nameB ? 1 : 0) : (nameB < nameA ? -1 : nameB > nameA ? 1 : 0);
                    case 'year':
                        if (a._sortYear && !b._sortYear) return -1;
                        if (!a._sortYear && b._sortYear) return 1;
                        if (a._sortYear !== b._sortYear) return b._sortYear - a._sortYear;
                        return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
                    case 'year-asc':
                        if (a._sortYear && !b._sortYear) return -1;
                        if (!a._sortYear && b._sortYear) return 1;
                        if (a._sortYear !== b._sortYear) return a._sortYear - b._sortYear;
                        return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
                    default:
                        return 0;
                }
            });
            this._lastSortKey = sortCacheKey;
            this._lastSortedStreams = streams;
        }
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
    self._streamLookup = null;
    self.displayedCount = 0;
    self._domOffset = 0;
    var gridEl = document.getElementById('content-grid');
    gridEl.textContent = '';
    gridEl.scrollTop = 0;
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

IPTVApp.prototype._normalizeGenre = function(genre) {
    if (!genre) return '';
    var g = genre.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    if (!g) return '';
    if (Regex.contentTypePrefix) {
        g = g.replace(Regex.contentTypePrefix, '');
    }
    if (Regex.seriesWord) {
        g = g.replace(Regex.seriesWord, '');
    }
    g = g.replace(Regex.vfq, '').trim();
    if (!g) return '';
    return this.formatDisplayTitle(g);
};

IPTVApp.prototype._genreMergeKey = function(genre) {
    return genre.toLowerCase();
};

IPTVApp.prototype._mergeGenrePlurals = function(genreSet) {
    var names = Object.keys(genreSet);
    var lowerMap = {};
    for (var i = 0; i < names.length; i++) {
        lowerMap[names[i].toLowerCase()] = names[i];
    }
    var lowerKeys = Object.keys(lowerMap);
    lowerKeys.sort(function(a, b) { return a.length - b.length; });
    var merged = {};
    var aliasTo = {};
    for (var i = 0; i < lowerKeys.length; i++) {
        var short = lowerKeys[i];
        if (aliasTo[short]) continue;
        var found = false;
        for (var j = i + 1; j < lowerKeys.length; j++) {
            var long = lowerKeys[j];
            if (aliasTo[long]) continue;
            var diff = long.length - short.length;
            if (diff > 0 && diff <= 2 && long.indexOf(short) === 0) {
                aliasTo[long] = short;
                found = true;
            }
        }
    }
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var key = name.toLowerCase();
        var target = aliasTo[key] || key;
        var canonName = lowerMap[target];
        merged[canonName] = (merged[canonName] || 0) + genreSet[name];
    }
    return merged;
};

IPTVApp.prototype.preloadSections = function(onDone) {
    var self = this;
    var sections = ['live', 'vod', 'series'];
    var customCategories = this.settings.customCategories || [];
    var hiddenCategories = this.settings.hiddenDefaultCategories || [];
    if (hiddenCategories.indexOf('sport') === -1) sections.push('sport');
    if (hiddenCategories.indexOf('manga') === -1) sections.push('manga');
    if (hiddenCategories.indexOf('entertainment') === -1) sections.push('entertainment');
    customCategories.forEach(function(cat) { sections.push(cat.id); });
    var index = 0;
    var processNext = function() {
        if (index >= sections.length) {
            window.log('PERF', 'preloadSections: done (' + sections.length + ' sections)');
            if (onDone) onDone();
            return;
        }
        var section = sections[index++];
        var apiSection = ['sport', 'manga', 'entertainment'].indexOf(section) !== -1 || section.indexOf('custom_') === 0 ? 'vod' : section;
        var categories, streams;
        if (apiSection === 'vod') {
            categories = (self.api.cache.vodCategories || []).slice();
            streams = self.api.cache.vodStreams['_all'] || [];
            if (section === 'manga' || section.indexOf('custom_') === 0) {
                var seriesCats = (self.api.cache.seriesCategories || []).slice();
                var seriesStreams = self.api.cache.series['_all'] || [];
                seriesCats.forEach(function(c) { c._sourceType = 'series'; });
                seriesStreams.forEach(function(s) { s._sourceType = 'series'; });
                categories.forEach(function(c) { c._sourceType = 'vod'; });
                streams.forEach(function(s) { s._sourceType = 'vod'; });
                categories = categories.concat(seriesCats);
                streams = streams.concat(seriesStreams);
            }
        }
        else if (apiSection === 'series') {
            categories = (self.api.cache.seriesCategories || []).slice();
            streams = self.api.cache.series['_all'] || [];
        }
        else if (apiSection === 'live') {
            categories = (self.api.cache.liveCategories || []).slice();
            streams = self.api.cache.liveStreams['_all'] || [];
        }
        else {
            setTimeout(processNext, 0);
            return;
        }
        if (categories.length > 0 && streams.length > 0) {
            self._preprocessSection(section, categories, streams);
        }
        setTimeout(processNext, 0);
    };
    setTimeout(processNext, 100);
};

IPTVApp.prototype._invalidatePreprocessCache = function(onDone) {
    var sections = ['vod', 'series', 'live', 'sport', 'manga', 'entertainment'];
    var customCats = this.settings.customCategories || [];
    for (var k = 0; k < customCats.length; k++) {
        sections.push('custom_' + customCats[k].id);
    }
    for (var i = 0; i < sections.length; i++) {
        if (this.data[sections[i]]) {
            delete this.data[sections[i]]._dedupGroups;
        }
    }
    this.preloadSections(onDone);
    window.log('CACHE', 'Preprocessing cache invalidated + sections reloaded');
};

IPTVApp.prototype._preprocessSection = function(section, categories, streams, onProgress) {
    if (this.data[section] && this.data[section]._dedupGroups) return;
    var patterns = this.getCategoryPatterns();
    var hiddenCategories = this.settings.hiddenDefaultCategories || [];
    var keywordsToPatterns = function(keywords) {
        return keywords.map(function(kw) {
            return Regex.keywordPattern(kw);
        });
    };
    var sportPatterns = hiddenCategories.indexOf('sport') === -1 ? keywordsToPatterns(patterns.sport || []) : [];
    var mangaPatterns = hiddenCategories.indexOf('manga') === -1 ? keywordsToPatterns(patterns.manga || []) : [];
    var ent = patterns.entertainment || {};
    var entertainmentPatterns = [];
    var concertsPatterns, theatrePatterns, spectaclesPatterns, blindtestPatterns, karaokePatterns;
    if (hiddenCategories.indexOf('entertainment') === -1) {
        concertsPatterns = keywordsToPatterns(ent.concerts || []);
        theatrePatterns = keywordsToPatterns(ent.theatre || []);
        spectaclesPatterns = keywordsToPatterns(ent.spectacles || []);
        blindtestPatterns = keywordsToPatterns(ent.blindtest || []);
        karaokePatterns = keywordsToPatterns(ent.karaoke || []);
        entertainmentPatterns = concertsPatterns.concat(theatrePatterns).concat(spectaclesPatterns).concat(blindtestPatterns).concat(karaokePatterns);
    }
    var allSpecialPatterns = sportPatterns.concat(entertainmentPatterns).concat(mangaPatterns);
    var customCategories = this.settings.customCategories || [];
    var self = this;
    customCategories.forEach(function(cat) {
        var kws = patterns[cat.id] || cat.keywords || [];
        allSpecialPatterns = allSpecialPatterns.concat(keywordsToPatterns(kws));
    });
    if (section === 'vod') {
        categories = categories.filter(function(cat) {
            return !allSpecialPatterns.some(function(p) { return p.test(cat.category_name || ''); });
        });
    }
    else if (section === 'sport') {
        categories = categories.filter(function(cat) {
            return sportPatterns.some(function(p) { return p.test(cat.category_name || ''); });
        });
    }
    else if (section === 'entertainment') {
        categories = categories.filter(function(cat) {
            var name = cat.category_name || '';
            var matches = entertainmentPatterns.some(function(p) { return p.test(name); });
            if (matches) {
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
            return mangaPatterns.some(function(p) { return p.test(cat.category_name || ''); });
        });
    }
    else if (section.indexOf('custom_') === 0) {
        var customPatterns = this.getCustomCategoryPatterns(section);
        categories = categories.filter(function(cat) {
            return customPatterns.some(function(p) { return p.test(cat.category_name || ''); });
        });
    }
    else if (section === 'series') {
        categories = categories.filter(function(cat) {
            return !allSpecialPatterns.some(function(p) { return p.test(cat.category_name || ''); });
        });
    }
    var beforeLangFilter = categories.length;
    categories = categories.filter(function(cat) {
        return self.matchesLanguage(cat.category_name || '');
    });
    if (beforeLangFilter !== categories.length) {
        window.log('CACHE', 'LANG FILTER: ' + beforeLangFilter + ' -> ' + categories.length + ' categories (excluded ' + (beforeLangFilter - categories.length) + ' by language)');
    }
    if (this.hideSM) {
        categories = categories.filter(function(cat) {
            var name = (cat.category_name || '').toUpperCase();
            return name.indexOf('SOURD') === -1 && name.indexOf('MALENTENDANT') === -1 && !name.startsWith('SME|');
        });
    }
    var excludeKeywordRegex = this._getExcludeKeywordRegex();
    if (excludeKeywordRegex) {
        var beforeKeywordFilter = categories.length;
        categories = categories.filter(function(cat) {
            return !excludeKeywordRegex.test(cat.category_name || '');
        });
        if (beforeKeywordFilter !== categories.length) {
            window.log('CACHE', 'KEYWORD FILTER: ' + beforeKeywordFilter + ' -> ' + categories.length + ' categories (excluded ' + (beforeKeywordFilter - categories.length) + ' by keyword)');
        }
    }
    var categoryMap = {};
    categories.forEach(function(c) {
        var name = self.stripCategoryPrefix(c.category_name || '');
        categoryMap[c.category_id] = name;
    });
    var self = this;
    if (section === 'live') {
        var categoryIds = {};
        for (var ci = 0; ci < categories.length; ci++) {
            categoryIds[categories[ci].category_id] = true;
        }
        var filtered = [];
        var categoryCounts = {};
        for (var si = 0; si < streams.length; si++) {
            var s = streams[si];
            if (!categoryIds[s.category_id]) continue;
            if (!s._displayTitle) {
                var t = self.getStreamTitle(s);
                s._displayTitle = self.stripCategoryPrefix(self.formatDisplayTitle(t));
            }
            var catKey = s._playlistId ? s.category_id + '_' + s._playlistId : s.category_id;
            categoryCounts[catKey] = (categoryCounts[catKey] || 0) + 1;
            filtered.push(s);
        }
        this.data[section] = {
            categories: categories,
            streams: filtered,
            _dedupGroups: {},
            _dedupTitleCounts: {},
            _genreCategories: {},
            _categoryCounts: categoryCounts
        };
        this.logMemory('preprocessed ' + section + ' (' + filtered.length + ' streams)');
        return;
    }
    var storeResult = function(result) {
        self.data[section] = {
            categories: result.categories,
            streams: result.streams,
            _dedupGroups: result._dedupGroups,
            _dedupTitleCounts: result._dedupTitleCounts,
            _genreCategories: result._genreCategories,
            _categoryCounts: result._categoryCounts
        };
        self.logMemory('preprocessed ' + section + ' (' + result.streams.length + ' streams)');
        if (result._wasSlowPath) {
            self._schedulePersistPreprocessedCache();
        }
    };
    var result = this._preprocessStreams(streams, categories, categoryMap, onProgress);
    if (result && result.then) {
        return result.then(storeResult);
    }
    storeResult(result);
};

IPTVApp.prototype._schedulePersistPreprocessedCache = function() {
    var self = this;
    if (this._persistPreprocessedTimer) clearTimeout(this._persistPreprocessedTimer);
    this._persistPreprocessedTimer = setTimeout(function() {
        self._persistPreprocessedTimer = null;
        self._persistPreprocessedCache();
    }, 3000);
};

IPTVApp.prototype._persistPreprocessedCache = function() {
    if (!this.api || !this.api.cache) return;
    var multiPlaylist = this.apis && this.apis.length > 1 && !this.settings.activePlaylistId;
    if (multiPlaylist) {
        window.log('CACHE', 'persistPreprocessedCache: skipping (multi-playlist mode not yet supported)');
        return;
    }
    var playlistId = this.settings.activePlaylistId || this.api.playlistId;
    if (!playlistId) {
        window.log('CACHE', 'persistPreprocessedCache: no playlistId, skipping');
        return;
    }
    var data = {
        vod: {
            categories: this.api.cache.vodCategories || [],
            streams: (this.api.cache.vodStreams && this.api.cache.vodStreams['_all']) || []
        },
        series: {
            categories: this.api.cache.seriesCategories || [],
            streams: (this.api.cache.series && this.api.cache.series['_all']) || []
        },
        live: {
            categories: this.api.cache.liveCategories || [],
            streams: (this.api.cache.liveStreams && this.api.cache.liveStreams['_all']) || []
        }
    };
    var totalStreams = data.vod.streams.length + data.series.streams.length + data.live.streams.length;
    window.log('CACHE', 'persistPreprocessedCache: playlistId=' + playlistId + ' totalStreams=' + totalStreams);
    this.saveProviderCache(playlistId, data);
};

IPTVApp.prototype._preprocessStreams = function(streams, categories, categoryMap, onProgress) {
    var DEDUP_FORMAT_VERSION = 3;
    var self = this;
    var t0 = Date.now();
    var filtered = [];
    var titleMap = {};
    var genreSet = {};
    var genreKeyMap = {};
    var dedupGroups = {};
    var categoryCounts = {};
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
    var categoryIds = {};
    for (var ci = 0; ci < categories.length; ci++) {
        categoryIds[categories[ci].category_id] = true;
    }
    var needsSDFilter = self.hideSD || self.hide3D;
    var needsQualityFilter = needsSDFilter;
    var needsGenre = true;
    var beforeCount = streams.length;
    var BATCH_SIZE = 2000;
    var hasPreprocessedData = streams.length > 0 && streams[0]._dedupKey && streams[0]._dedupFormatVersion === DEDUP_FORMAT_VERSION;
    if (streams.length > 100) {
        var sampleKeyShape = function(idx) {
            var s = streams[idx];
            if (!s) return 'undef';
            var k = s._dedupKey;
            var prefix = k && typeof k === 'string' ? k.substring(0, 6) : (k === undefined ? 'noKey' : typeof k);
            return idx + ':' + prefix + '/' + (s._dedupFormatVersion === undefined ? 'noVer' : 'v' + s._dedupFormatVersion) + '/tmdb=' + (s.tmdb || 'none');
        };
        window.log('DEDUP', 'enter ' + (categories[0] && categories[0]._sourceType ? 'multi' : 'single') + ' streams=' + streams.length + ' fast=' + hasPreprocessedData + ' samples: ' + sampleKeyShape(0) + ' | ' + sampleKeyShape(Math.floor(streams.length / 2)) + ' | ' + sampleKeyShape(streams.length - 1));
    }
    var computeFields = function(s) {
        if (s._dedupKey !== undefined && s._dedupFormatVersion === DEDUP_FORMAT_VERSION) return;
        var title = self.getStreamTitle(s);
        var clean = self.cleanTitle(title);
        var cleanTitle = self._normalizeDedupTitle(title);
        var year = self.extractYear(title);
        s._dedupCleanTitle = cleanTitle;
        s._dedupYear = year;
        var tmdbId = s.tmdb && String(s.tmdb).trim();
        if (tmdbId && tmdbId !== '0') {
            s._dedupKey = 'tmdb:' + tmdbId;
        }
        else {
            s._dedupKey = 'title:' + cleanTitle + '|' + (year || '');
        }
        var stripped = self.stripCategoryPrefix(title);
        var diff = stripped.replace(clean, '').replace(/\(\d{4}\)/g, '').replace(Regex.removeYearEnd, '').replace(/[\s\-|:()]+/g, ' ').trim();
        var qualityMatch = title.match(Regex.qualityPrefix);
        if (qualityMatch) {
            diff = (qualityMatch[1] + (diff ? ' ' + diff : '')).trim();
        }
        s._dedupTag = diff || '';
        s._dedupQualityScore = qualityScore(diff);
        s._isSD = self.isSD(s);
        s._is3D = self.is3D(s);
        s._displayTitle = self.stripCategoryPrefix(self.formatDisplayTitle(title));
        s._searchKey = s._displayTitle.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
        s._dedupFormatVersion = DEDUP_FORMAT_VERSION;
    };
    var processStream = hasPreprocessedData ? function(s) {
        if (!categoryIds[s.category_id]) return;
        if (s._isSD === undefined) {
            s._isSD = self.isSD(s);
            s._is3D = self.is3D(s);
        }
        if (needsSDFilter) {
            if (!titleMap[s._dedupCleanTitle]) titleMap[s._dedupCleanTitle] = { sd: false, hd: false };
            if (s._isSD) titleMap[s._dedupCleanTitle].sd = true;
            else titleMap[s._dedupCleanTitle].hd = true;
        }
        if (needsGenre && s._normalizedGenres) {
            for (var gi = 0; gi < s._normalizedGenres.length; gi++) {
                var g = s._normalizedGenres[gi];
                genreSet[g] = (genreSet[g] || 0) + 1;
            }
        }
        dedupTitleCounts[s._dedupCleanTitle] = (dedupTitleCounts[s._dedupCleanTitle] || 0) + 1;
        if (!dedupGroups[s._dedupKey]) dedupGroups[s._dedupKey] = [];
        dedupGroups[s._dedupKey].push(s);
        if (!needsQualityFilter) {
            var catKey = s._playlistId ? s.category_id + '_' + s._playlistId : s.category_id;
            categoryCounts[catKey] = (categoryCounts[catKey] || 0) + 1;
        }
        filtered.push(s);
    } : function(s) {
        computeFields(s);
        if (!categoryIds[s.category_id]) return;
        if (!s.genre && s.category_id) {
            s.genre = categoryMap[s.category_id] || '';
        }
        var cleanTitle = s._dedupCleanTitle;
        if (needsSDFilter) {
            if (!titleMap[cleanTitle]) titleMap[cleanTitle] = { sd: false, hd: false };
            if (s._isSD) titleMap[cleanTitle].sd = true;
            else titleMap[cleanTitle].hd = true;
        }
        if (needsGenre) {
            var normalizedGenres = [];
            var seenGenreKeys = {};
            var addGenre = function(raw) {
                var g = self._normalizeGenre(raw);
                if (!g) return;
                var gKey = self._genreMergeKey(g);
                if (seenGenreKeys[gKey]) return;
                seenGenreKeys[gKey] = true;
                if (!genreKeyMap[gKey]) genreKeyMap[gKey] = g;
                genreSet[genreKeyMap[gKey]] = (genreSet[genreKeyMap[gKey]] || 0) + 1;
                normalizedGenres.push(genreKeyMap[gKey]);
            };
            if (s.genre) {
                var decodedGenre = s.genre.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                var genres = decodedGenre.split(/[\/,&]/);
                for (var gi = 0; gi < genres.length; gi++) addGenre(genres[gi]);
            }
            var catName = categoryMap[s.category_id];
            if (catName) {
                var catParts = catName.replace(/&amp;/g, '&').split(/[\/,&]/);
                for (var cpi = 0; cpi < catParts.length; cpi++) addGenre(catParts[cpi]);
            }
            s._normalizedGenres = normalizedGenres;
        }
        dedupTitleCounts[cleanTitle] = (dedupTitleCounts[cleanTitle] || 0) + 1;
        if (!dedupGroups[s._dedupKey]) dedupGroups[s._dedupKey] = [];
        dedupGroups[s._dedupKey].push(s);
        if (!needsQualityFilter) {
            var catKey = s._playlistId ? s.category_id + '_' + s._playlistId : s.category_id;
            categoryCounts[catKey] = (categoryCounts[catKey] || 0) + 1;
        }
        filtered.push(s);
    };
    var finalize = function() {
        if (beforeCount !== filtered.length) {
            window.log('CACHE', 'CATEGORY FILTER: ' + beforeCount + ' -> ' + filtered.length + ' (lost ' + (beforeCount - filtered.length) + ' streams with invalid category_id)');
        }
        var needsGenreRecount = needsGenre && needsQualityFilter;
        if (needsQualityFilter) {
            var kept = [];
            var activeCatIds = {};
            var hiddenSD = 0;
            var hidden3D = 0;
            if (needsGenreRecount) {
                genreSet = {};
                genreKeyMap = {};
            }
            for (var fi = 0; fi < filtered.length; fi++) {
                var s = filtered[fi];
                if (self.hideSD && s._isSD && titleMap[s._dedupCleanTitle] && titleMap[s._dedupCleanTitle].hd) {
                    hiddenSD++;
                    continue;
                }
                if (self.hide3D && s._is3D) {
                    hidden3D++;
                    continue;
                }
                kept.push(s);
                activeCatIds[s.category_id] = true;
                var catKey = s._playlistId ? s.category_id + '_' + s._playlistId : s.category_id;
                categoryCounts[catKey] = (categoryCounts[catKey] || 0) + 1;
                if (needsGenreRecount && s._normalizedGenres) {
                    for (var gi = 0; gi < s._normalizedGenres.length; gi++) {
                        var g = s._normalizedGenres[gi];
                        genreSet[g] = (genreSet[g] || 0) + 1;
                    }
                }
            }
            if (hiddenSD > 0) window.log('CACHE', 'HIDDEN (SD has HD): ' + hiddenSD);
            if (hidden3D > 0) window.log('CACHE', 'HIDDEN (3D): ' + hidden3D);
            filtered = kept;
            categories = categories.filter(function(cat) {
                var name = (cat.category_name || '').toUpperCase();
                if (self.hideSD && name.startsWith('SD|') && !activeCatIds[cat.category_id]) return false;
                if (self.hide3D && name.indexOf('3D') !== -1 && !activeCatIds[cat.category_id]) return false;
                return true;
            });
        }
        var preConsolidateKeys = Object.keys(dedupGroups).length;
        self._consolidateDedupGroupsByCleanTitle(dedupGroups);
        var keys = Object.keys(dedupGroups);
        for (var k = 0; k < keys.length; k++) {
            dedupGroups[keys[k]].sort(function(a, b) {
                return parseInt(a.stream_id || a.series_id || 0) - parseInt(b.stream_id || b.series_id || 0);
            });
        }
        if (needsGenre) genreSet = self._mergeGenrePlurals(genreSet);
        if (filtered.length > 100 && keys.length < filtered.length / 4) {
            var topGroups = keys.map(function(k) { return { k: k, n: dedupGroups[k].length }; })
                .sort(function(a, b) { return b.n - a.n; }).slice(0, 5);
            var top5Str = topGroups.map(function(g) { return g.n + 'x"' + g.k.substring(0, 60) + '"'; }).join(' | ');
            window.log('DEDUP', 'ANOMALY: ' + filtered.length + ' streams collapsed to ' + keys.length + ' groups (preConsolidate=' + preConsolidateKeys + '), top5: ' + top5Str);
        }
        window.log('DEDUP', 'Preprocessed ' + filtered.length + ' streams into ' + keys.length + ' groups' + (hasPreprocessedData ? ' (fast path from cache)' : ''));
        window.log('PERF', 'preprocessStreams: ' + (Date.now() - t0) + 'ms' + (hasPreprocessedData ? ' (fast)' : ''));
        return {
            categories: categories,
            streams: filtered,
            _dedupGroups: dedupGroups,
            _dedupTitleCounts: dedupTitleCounts,
            _genreCategories: genreSet,
            _categoryCounts: categoryCounts,
            _wasSlowPath: !hasPreprocessedData
        };
    };
    if (streams.length <= BATCH_SIZE) {
        for (var i = 0; i < streams.length; i++) processStream(streams[i]);
        return finalize();
    }
    return this.runLowPriority(streams.length, function(start, end) {
        for (var i = start; i < end; i++) processStream(streams[i]);
    }, onProgress).then(finalize);
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
        var s = streams[i];
        var sid = s.stream_id || s.series_id;
        if (sid) streamLookup[sid] = true;
        s._duplicateVersions = undefined;
        s._hiddenDuplicate = undefined;
        s._isDuplicate = undefined;
        s._duplicateInfos = undefined;
        s._duplicateNum = undefined;
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
            var qualDiff = b.data._dedupQualityScore - a.data._dedupQualityScore;
            if (qualDiff !== 0) return qualDiff;
            var aTag = (a.tag || '').toUpperCase();
            var bTag = (b.tag || '').toUpperCase();
            var aIsVostfr = aTag.indexOf('VOSTFR') !== -1 || aTag.indexOf('VOST') !== -1 || aTag.indexOf('VO') !== -1;
            var bIsVostfr = bTag.indexOf('VOSTFR') !== -1 || bTag.indexOf('VOST') !== -1 || bTag.indexOf('VO') !== -1;
            if (aIsVostfr !== bIsVostfr) return aIsVostfr ? 1 : -1;
            return 0;
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

IPTVApp.prototype.initGridScrollLoader = function() {
    var self = this;
    var grid = document.getElementById('content-grid');
    if (!grid) return;
    var ENSURE_INTERVAL = 50;
    var lastEnsureRun = 0;
    var ensurePending = false;
    var imageTimer = null;
    var userScrollClearTimer = null;
    var markUserScroll = function() {
        self._userScrolling = true;
        if (userScrollClearTimer) clearTimeout(userScrollClearTimer);
        userScrollClearTimer = setTimeout(function() {
            self._userScrolling = false;
            userScrollClearTimer = null;
        }, 400);
        if (self.currentSection === 'history' && typeof self.hideButtonTooltip === 'function') {
            self.hideButtonTooltip('history-delete-tooltip-anchor');
            if (typeof self.cancelTooltipShow === 'function') self.cancelTooltipShow('historyDelete');
        }
        if (self.currentSection === 'downloads' && typeof self.hideButtonTooltip === 'function') {
            self.hideButtonTooltip('download-delete-tooltip-anchor');
            if (typeof self.cancelTooltipShow === 'function') self.cancelTooltipShow('downloadDelete');
        }
    };
    grid.addEventListener('touchstart', markUserScroll, { passive: true });
    grid.addEventListener('touchmove', markUserScroll, { passive: true });
    grid.addEventListener('wheel', markUserScroll, { passive: true });
    var ensureItems = function() {
        if (!self.currentStreams) return;
        var rowHeight = self._gridRowHeight || 300;
        var isListView = grid.classList.contains('list-view');
        var cols = isListView ? 1 : (self.gridColumns || 5);
        var totalStreams = self.currentStreams.length;
        var domOffset = self._domOffset || 0;
        var viewportFirstRow = Math.floor(grid.scrollTop / rowHeight);
        var viewportLastRow = Math.ceil((grid.scrollTop + grid.clientHeight) / rowHeight);
        var viewportFirstIdx = viewportFirstRow * cols;
        var viewportLastIdx = viewportLastRow * cols;
        var BIG_GAP = cols * 30;
        if (viewportLastIdx < domOffset - BIG_GAP || viewportFirstIdx > self.displayedCount + BIG_GAP) {
            var targetIdx = Math.max(0, Math.min(viewportFirstIdx, totalStreams - 1));
            self._jumpToIndex(targetIdx);
            return;
        }
        var viewportBottom = grid.scrollTop + grid.clientHeight + 600;
        var neededRows = Math.ceil(viewportBottom / rowHeight);
        var neededCount = neededRows * cols;
        var safety = 100;
        while (self.displayedCount < neededCount && self.displayedCount < totalStreams && safety-- > 0) {
            if (!self.loadMoreItems()) break;
        }
        var prependSafety = 200;
        while (prependSafety-- > 0) {
            if ((self._domOffset || 0) === 0) break;
            var topSpacer = document.getElementById('grid-top-spacer');
            if (!topSpacer) break;
            if (topSpacer.offsetHeight <= grid.scrollTop - 600) break;
            if (self._prependGridItems() === 0) break;
        }
        self._trimExcessDomItems();
    };
    var runEnsure = function() {
        ensurePending = false;
        lastEnsureRun = Date.now();
        ensureItems();
    };
    grid.addEventListener('scroll', function() {
        var now = Date.now();
        var sinceLast = now - lastEnsureRun;
        if (sinceLast >= ENSURE_INTERVAL) {
            runEnsure();
        }
        else if (!ensurePending) {
            ensurePending = true;
            setTimeout(runEnsure, ENSURE_INTERVAL - sinceLast);
        }
        // Mouse/touch scroll (arrow keys use keydown/keyup and their own nav
        // logic): keep the focus on the first fully visible item so PageUp/Down
        // and arrow keys have a meaningful reference point after scrolling.
        // We update the .focused class inline WITHOUT calling updateFocus —
        // updateFocus's scrollIntoView adjust would fight the user's scroll.
        // Skip when scroll was programmatic (stopPlayback / changeChannel set
        // scrollTop after computing focusIndex; without this guard the handler
        // would overwrite the computed focus with the first-visible row).
        if (self._userScrolling && !self._arrowHeld && !self._programmaticScroll && self.focusArea === 'grid') {
            var isListView = grid.classList.contains('list-view');
            var cols = isListView ? 1 : (self.gridColumns || 5);
            var rowHeight = self._gridRowHeight || (isListView ? 88 : 300);
            var topSpacer = document.getElementById('grid-top-spacer');
            var spacerH = topSpacer ? topSpacer.offsetHeight : 0;
            var visibleTopY = Math.max(0, grid.scrollTop - spacerH);
            var firstVisibleLocalRow = Math.floor(visibleTopY / rowHeight);
            var newFocus = firstVisibleLocalRow * cols;
            var focusables = self.getFocusables();
            if (newFocus >= 0 && newFocus < focusables.length && newFocus !== self.focusIndex) {
                if (self._lastFocusedEl) self._lastFocusedEl.classList.remove('focused');
                self.focusIndex = newFocus;
                var newEl = focusables[newFocus];
                if (newEl) {
                    newEl.classList.add('focused');
                    self._lastFocusedEl = newEl;
                }
            }
        }
        if (imageTimer) clearTimeout(imageTimer);
        // Arrow-key scroll: long debounce so images load only on keyup (avoids
        // blocking the UI during fast key repeats). Mouse/touch scroll: short
        // debounce so posters keep appearing while the user scrolls.
        var debounce = self._arrowHeld ? 250 : 80;
        imageTimer = setTimeout(function() {
            imageTimer = null;
            if (self._arrowHeld && self.focusArea === 'grid' && self._canScrollMore()) return;
            self._trimExcessDomItems();
            self.loadVisibleImages();
        }, debounce);
    });
};

IPTVApp.prototype.initFilterEvents = function() {
    var self = this;
    var titleInput = document.getElementById('search-title');
    var yearInput = document.getElementById('search-year');
    var actorInput = document.getElementById('search-actor');
    function handleSearchInput() {
        var selectedCategory = document.querySelector('.category-item.selected');
        var currentCategoryId = selectedCategory ? selectedCategory.dataset.categoryId : '';
        if ((titleInput.value.trim() || yearInput.value.trim()) && currentCategoryId !== '') {
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
        else if (!query && self.searchActor) {
            self.searchActor = '';
            self.actorSearchResults = null;
            self.applyFilters();
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
    var loadingGrid = document.getElementById('content-grid');
    loadingGrid.innerHTML = '';
    var loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-message';
    loadingDiv.textContent = I18n.t('app.loading', 'Loading...');
    loadingGrid.appendChild(loadingDiv);
    TMDB.searchPerson(query, function(results) {
        if (results && results.length > 0) {
            self.actorSearchResults = results;
            self.renderActorResults(results);
        }
        else {
            self.actorSearchResults = null;
            var noResGrid = document.getElementById('content-grid');
            noResGrid.innerHTML = '';
            var noResDiv = document.createElement('div');
            noResDiv.className = 'no-results';
            noResDiv.textContent = I18n.t('app.noResults', 'No results');
            noResGrid.appendChild(noResDiv);
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

// Grid item creation
IPTVApp.prototype._createGridItem = function(stream) {
    if (stream._freeboxFile) {
        return this._createFreeboxItem(stream);
    }
    var item = document.createElement('div');
    item.className = 'grid-item';
    item.dataset.streamId = this.getStreamId(stream);
    item.dataset.playlistId = stream._playlistId || '';
    item.dataset.streamType = stream._type || stream._sourceType || this.currentStreamType;
    if (stream._isDownload) item.dataset.isDownload = '1';
    if (stream._isHistory && this.currentSection === 'history') item.dataset.isHistory = '1';
    if (stream._tmdbOnly) {
        item.dataset.tmdbOnly = '1';
        item.dataset.tmdbId = stream.tmdb_id || '';
        item.dataset.tmdbType = stream._type === 'series' ? 'tv' : 'movie';
        item.dataset.title = (stream.name || '').replace(/\s*\(\d{4}\)\s*$/, '');
        item.dataset.posterUrl = stream.stream_icon || '';
        item.dataset.backdropUrl = '';
    }
    var imageUrl = this.getStreamImage(stream);
    item.dataset.imageUrl = imageUrl;
    item.dataset.streamTitle = this.getStreamTitle(stream);
    var image = document.createElement('div');
    image.className = 'grid-item-image';
    if (imageUrl.indexOf('data:') === 0) {
        image.style.backgroundImage = 'url(\'' + imageUrl + '\')';
        image.classList.add('local-logo');
        image.dataset.loaded = 'local';
    }
    var originalTitle = this.getStreamTitle(stream) || 'Unknown';
    var streamTitle = originalTitle;
    var isStreamSD = stream._isSD !== undefined ? stream._isSD : this.isSD(stream);
    var hasDisplayTitle = !!stream._displayTitle;
    streamTitle = hasDisplayTitle ? stream._displayTitle : this.stripCategoryPrefix(streamTitle);
    var yearMatch = streamTitle.match(Regex.yearInParens) || streamTitle.match(Regex.yearAtEnd);
    var year = yearMatch ? yearMatch[1] : '';
    streamTitle = streamTitle
        .replace(Regex.removeYearParens, '')
        .replace(Regex.removeYearEnd, '')
        .replace(Regex.trailingDash, '')
        .trim();
    if (!hasDisplayTitle) {
        streamTitle = this.formatDisplayTitle(streamTitle);
    }
    if (stream._isHistory && stream._season && stream._episode) {
        var s = stream._season < 10 ? '0' + stream._season : stream._season;
        var e = stream._episode < 10 ? '0' + stream._episode : stream._episode;
        streamTitle += ' - S' + s + 'E' + e;
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
    if (!stream._isDownload && (year || stars || (stream._duplicateTag && !stream._duplicateVersions))) {
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
    var streamType = stream._type || stream._sourceType || this.currentStreamType;
    if (streamType === 'live') {
        var epgSubtitle = document.createElement('div');
        epgSubtitle.className = 'grid-item-epg';
        item.appendChild(epgSubtitle);
    }
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
            var hgIcon = document.createElement('span');
            hgIcon.className = 'material-symbols-outlined';
            hgIcon.textContent = 'hourglass_empty';
            hg.appendChild(hgIcon);
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
    return item;
};

IPTVApp.prototype._createFreeboxItem = function(stream) {
    var item = document.createElement('div');
    item.className = 'grid-item freebox-file';
    item.dataset.streamId = stream.stream_id || stream._fbPath;
    item.dataset.fbPath = stream._fbPath || '';
    item.dataset.fbIsDir = stream._fbIsDir ? '1' : '0';
    item.dataset.fbMime = stream._fbMime || '';
    if (stream._fbIsUp) item.dataset.fbIsUp = '1';
    if (stream._fbContinue) item.dataset.fbContinue = '1';
    var image = document.createElement('div');
    image.className = 'grid-item-image fb-icon';
    var iconName;
    if (stream._fbIsUp) iconName = 'arrow_upward';
    else if (stream._fbIsDir) iconName = 'folder';
    else if (stream._fbMime === 'video') iconName = 'movie';
    else if (stream._fbMime === 'audio') iconName = 'music_note';
    else if (stream._fbMime === 'image') iconName = 'image';
    else iconName = 'insert_drive_file';
    var icon = document.createElement('span');
    icon.className = 'material-symbols-outlined fb-icon-glyph';
    icon.textContent = iconName;
    image.appendChild(icon);
    if (stream._fbMime === 'image' && !stream._fbIsDir && !stream._fbIsUp) {
        var thumbImg = document.createElement('img');
        thumbImg.className = 'fb-thumb-img';
        image.appendChild(thumbImg);
    }
    var overlayBottom = document.createElement('div');
    overlayBottom.className = 'grid-overlay-bottom';
    var titleSpan = document.createElement('span');
    titleSpan.className = 'grid-title';
    titleSpan.textContent = stream.name || '';
    overlayBottom.appendChild(titleSpan);
    image.appendChild(overlayBottom);
    item.appendChild(image);
    var info = document.createElement('div');
    info.className = 'grid-item-info';
    var listTitle = document.createElement('div');
    listTitle.className = 'list-title';
    listTitle.textContent = stream.name || '';
    info.appendChild(listTitle);
    if (!stream._fbIsDir && !stream._fbIsUp) {
        var meta = document.createElement('div');
        meta.className = 'list-meta';
        var sizeSpan = document.createElement('span');
        sizeSpan.className = 'list-year';
        if (stream._fbContinue) {
            sizeSpan.textContent = '▶ ' + this.formatPosition(stream._fbContinuePosition || 0);
        } else {
            sizeSpan.textContent = this._fbFormatSize(stream._fbSize);
        }
        meta.appendChild(sizeSpan);
        info.appendChild(meta);
    }
    item.appendChild(info);
    if (!stream._fbIsDir && !stream._fbIsUp && (stream._fbMime === 'video' || stream._fbMime === 'audio')) {
        var fbProgress = this.getWatchHistoryItem(stream.stream_id, '_fb_');
        var minMs = (this.settings.minProgressMinutes || 2) * 60000;
        if (fbProgress && fbProgress.position >= minMs && fbProgress.percent > 0 && !fbProgress.watched) {
            var pb = document.createElement('div');
            pb.className = 'grid-progress-bar';
            var pf = document.createElement('div');
            pf.className = 'grid-progress-fill';
            pf.style.width = fbProgress.percent + '%';
            pb.appendChild(pf);
            item.appendChild(pb);
        }
    }
    return item;
};

IPTVApp.prototype._fbFormatSize = function(bytes) {
    var unitsByLocale = {
        fr: ['o', 'Ko', 'Mo', 'Go', 'To'],
        ru: ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
    };
    var locale = (typeof I18n !== 'undefined' && I18n.getLocale) ? I18n.getLocale() : 'en';
    var units = unitsByLocale[locale] || ['B', 'KB', 'MB', 'GB', 'TB'];
    if (!bytes || bytes < 0) return '0 ' + units[0];
    var i = 0;
    var n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return (n < 10 ? n.toFixed(1) : Math.round(n)) + ' ' + units[i];
};

IPTVApp.prototype._prependGridItems = function() {
    var container = document.getElementById('content-grid');
    if (!container) return 0;
    var isListView = container.classList.contains('list-view');
    var cols = isListView ? 1 : this.gridColumns;
    var batchSize = cols * 3;
    var startIdx = Math.max(0, this._domOffset - batchSize);
    var endIdx = this._domOffset;
    var count = endIdx - startIdx;
    if (count <= 0) return 0;
    var fragment = document.createDocumentFragment();
    for (var i = startIdx; i < endIdx; i++) {
        fragment.appendChild(this._createGridItem(this.currentStreams[i]));
    }
    var topSpacer = document.getElementById('grid-top-spacer');
    var refNode = topSpacer ? topSpacer.nextSibling : container.firstChild;
    container.insertBefore(fragment, refNode);
    this._domOffset = startIdx;
    this._syncTopSpacer();
    this.focusIndex += count;
    this.invalidateFocusables();
    window.log('MEM', 'Prepended ' + count + ' DOM items (offset now ' + this._domOffset + ')');
    this._trimExcessDomItems();
    return count;
};

IPTVApp.prototype._syncTopSpacer = function() {
    var container = document.getElementById('content-grid');
    if (!container) return;
    var isListView = container.classList.contains('list-view');
    var cols = isListView ? 1 : (this.gridColumns || 5);
    var rowHeight = this._gridRowHeight || 300;
    var targetHeight = Math.max(0, Math.floor((this._domOffset || 0) / cols) * rowHeight);
    var topSpacer = document.getElementById('grid-top-spacer');
    if (targetHeight <= 0) {
        if (topSpacer) topSpacer.remove();
        return;
    }
    if (!topSpacer) {
        topSpacer = document.createElement('div');
        topSpacer.id = 'grid-top-spacer';
        topSpacer.style.gridColumn = '1 / -1';
        container.insertBefore(topSpacer, container.firstChild);
    }
    topSpacer.style.height = targetHeight + 'px';
};

// Grid item loading
IPTVApp.prototype._jumpToIndex = function(targetIndex) {
    if (this.actorSearchResults) return;
    if (!this.currentStreams) return;
    var container = document.getElementById('content-grid');
    if (!container) return;
    var isListView = container.classList.contains('list-view');
    var cols = isListView ? 1 : (this.gridColumns || 5);
    var rowHeight = this._gridRowHeight || (isListView ? 88 : 300);
    var viewportRows = Math.max(6, Math.ceil((container.clientHeight + 600) / rowHeight));
    var rowsBefore = 2;
    var rowsAfter = viewportRows;
    var startIndex = Math.max(0, Math.floor(targetIndex / cols) * cols - rowsBefore * cols);
    var endIndex = Math.min(startIndex + (rowsBefore + rowsAfter) * cols, this.currentStreams.length);
    while (container.firstChild) container.removeChild(container.firstChild);
    if (!this._gridRowHeight) {
        this._gridRowHeight = 300;
    }
    this._domOffset = startIndex;
    this._syncTopSpacer();
    var fragment = document.createDocumentFragment();
    for (var i = startIndex; i < endIndex; i++) {
        fragment.appendChild(this._createGridItem(this.currentStreams[i]));
    }
    container.appendChild(fragment);
    this.displayedCount = endIndex;
    this.updateGridSpacer();
    this.invalidateFocusables();
    var firstItem = container.querySelector('.grid-item');
    if (firstItem && firstItem.offsetHeight > 0) {
        this._gridRowHeight = firstItem.offsetHeight + 10;
        this._syncTopSpacer();
    }
    this.focusIndex = targetIndex - startIndex;
    this.loadVisibleImages(true);
    this.loadVisibleEPG();
};

IPTVApp.prototype.loadMoreItems = function() {
    if (this.actorSearchResults) return false;
    var container = document.getElementById('content-grid');
    var gridLoader = document.getElementById('grid-loader');
    if (gridLoader) gridLoader.remove();
    var spacer = document.getElementById('grid-spacer');
    var isListView = container.classList.contains('list-view');
    var startIndex = this.displayedCount;
    var batchSize;
    if (startIndex === 0) {
        // First batch must fill the viewport (otherwise grid opens with just a
        // handful of items). Subsequent batches stay small to avoid per-keypress
        // layout spikes from adding many grid items at once during scroll.
        var cols = isListView ? 1 : this.gridColumns;
        var rowHeight = this._gridRowHeight || (isListView ? 88 : 300);
        var viewportRows = Math.ceil((container.clientHeight + 300) / rowHeight);
        batchSize = Math.max(isListView ? 20 : this.gridColumns * 4, viewportRows * cols);
    } else {
        batchSize = isListView ? 20 : this.itemsPerBatch;
    }
    var endIndex = Math.min(startIndex + batchSize, this.currentStreams.length);
    if (startIndex >= this.currentStreams.length) {
        // Genre filter pagination: when the user reaches the end and there are
        // more TMDB pages available, fetch the next batch in the background.
        if (this.genreFilter && !this._genreReachedEnd) {
            this._maybePrefetchGenrePages();
        }
        return false;
    }
    // Pre-emptive prefetch when only a few items remain ahead of the cursor —
    // hides the network latency by overlapping fetch with rendering.
    if (this.genreFilter && !this._genreReachedEnd) {
        this._maybePrefetchGenrePages();
    }
    var fragment = document.createDocumentFragment();
    for (var i = startIndex; i < endIndex; i++) {
        fragment.appendChild(this._createGridItem(this.currentStreams[i]));
    }
    if (spacer) {
        container.insertBefore(fragment, spacer);
    } else {
        container.appendChild(fragment);
    }
    var isFirstBatch = (startIndex === 0);
    this.displayedCount = endIndex;
    if (isFirstBatch && !this._gridRowHeight) {
        var firstCreated = container.querySelector('.grid-item');
        if (firstCreated && firstCreated.offsetHeight > 0) {
            this._gridRowHeight = firstCreated.offsetHeight + 10;
        }
    }
    this.updateGridSpacer();
    this.invalidateFocusables();
    if (isFirstBatch) {
        this.loadVisibleImages(true);
        this.loadVisibleEPG();
    }
    if (!isFirstBatch) this._trimExcessDomItems();
    return true;
};

IPTVApp.prototype._trimExcessDomItems = function() {
    var container = document.getElementById('content-grid');
    if (!container) return;
    var items = container.querySelectorAll('.grid-item');
    var itemsLen = items.length;
    var maxItems = 50;
    if (itemsLen <= maxItems) return;
    var firstGridItem = items[0];
    if (firstGridItem && firstGridItem.offsetHeight > 0) {
        this._gridRowHeight = firstGridItem.offsetHeight + 10;
    }
    var rowHeight = this._gridRowHeight || 300;
    var isListView = container.classList.contains('list-view');
    var cols = isListView ? 1 : this.gridColumns;
    var existingTopSpacer = document.getElementById('grid-top-spacer');
    var topSpacerH = existingTopSpacer ? existingTopSpacer.offsetHeight : 0;
    var firstVisibleRow = Math.floor(Math.max(0, container.scrollTop - topSpacerH) / rowHeight);
    var visibleRows = Math.ceil(container.clientHeight / rowHeight);
    var keepRows = isListView ? 5 : 1;
    var keepStartRow = Math.max(0, firstVisibleRow - keepRows);
    var keepEndRow = firstVisibleRow + visibleRows + keepRows;
    var keepStart = keepStartRow * cols;
    var keepEnd = keepEndRow * cols;
    keepStart = Math.max(0, Math.min(itemsLen, Math.floor(keepStart / cols) * cols));
    keepEnd = Math.max(keepStart, Math.min(itemsLen, Math.ceil(keepEnd / cols) * cols));
    var topRemoveCount = keepStart;
    var bottomRemoveCount = itemsLen - keepEnd;
    if (topRemoveCount <= 0 && bottomRemoveCount <= 0) return;
    var savedScrollTop = container.scrollTop;
    var focusedStreamId = null;
    if (this.focusArea === 'grid' && items[this.focusIndex] && items[this.focusIndex].dataset) {
        focusedStreamId = items[this.focusIndex].dataset.streamId || null;
    }
    if (bottomRemoveCount > 0) {
        for (var b = itemsLen - 1; b >= keepEnd; b--) {
            if (items[b]) items[b].remove();
        }
        this.displayedCount -= bottomRemoveCount;
        this.updateGridSpacer();
    }
    if (topRemoveCount > 0) {
        this._domOffset = (this._domOffset || 0) + topRemoveCount;
        this._syncTopSpacer();
        for (var t = 0; t < topRemoveCount; t++) {
            if (items[t]) items[t].remove();
        }
        this.focusIndex = Math.max(0, this.focusIndex - topRemoveCount);
    }
    this._programmaticScroll = true;
    container.scrollTop = savedScrollTop;
    this.invalidateFocusables();
    var anchoredByStreamId = false;
    if (focusedStreamId) {
        var survivors = this.getFocusables();
        for (var fi = 0; fi < survivors.length; fi++) {
            if (survivors[fi].dataset && survivors[fi].dataset.streamId === focusedStreamId) {
                this.focusIndex = fi;
                anchoredByStreamId = true;
                break;
            }
        }
    }
    window.log('MEM', 'Trimmed top=' + topRemoveCount + ' bottom=' + bottomRemoveCount + ' (DOM now ' + (itemsLen - topRemoveCount - bottomRemoveCount) + ', offset ' + this._domOffset + ' scroll ' + savedScrollTop + ' focusIndex=' + this.focusIndex + ' anchored=' + anchoredByStreamId + ')');
    if (this.focusArea === 'grid') {
        this.updateFocus();
    }
    var selfTrim = this;
    setTimeout(function() { selfTrim._programmaticScroll = false; }, 300);
};

IPTVApp.prototype.getFilteredContinueHistory = function(section) {
    if (!this.watchHistory || !this.watchHistory.length) {
        return [];
    }
    var self = this;
    var minMs = (this.settings.minProgressMinutes || 2) * 60000;
    section = section || this.currentSection;
    var activePlaylistId = this.settings.activePlaylistId;
    var vodSubsections = ['sport', 'entertainment', 'manga'];
    var isVodSubsection = vodSubsections.indexOf(section) !== -1;
    var isCustom = section.indexOf('custom_') === 0;
    var seenSeries = {};
    return this.watchHistory.filter(function(item) {
        if (item.playlistId === '_fb_') return false;
        if (activePlaylistId && item.playlistId && item.playlistId !== activePlaylistId) return false;
        if (item.watched) return false;
        if (item.type !== 'series' && (!item.position || item.position < minMs)) return false;
        if (item.type === 'series') {
            var seriesKey = (item.playlistId || '') + '_' + item.name;
            if (seenSeries[seriesKey]) return false;
            seenSeries[seriesKey] = true;
        }
        var itemSection = item.section || item.type;
        if (isVodSubsection || isCustom) return itemSection === section;
        if (section === 'vod') {
            if (item.type !== 'vod' && item.type !== 'movie') return false;
            return vodSubsections.indexOf(itemSection) === -1 && itemSection.indexOf('custom_') !== 0;
        }
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
    var activePlaylistId = this.settings.activePlaylistId;
    var vodSubsections = ['sport', 'entertainment', 'manga'];
    var isVodSubsection = vodSubsections.indexOf(section) !== -1;
    var isCustom = section.indexOf('custom_') === 0;
    return this.favorites.filter(function(fav) {
        if (activePlaylistId && fav._playlistId && fav._playlistId !== activePlaylistId) return false;
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
                var dlProgress = '';
                if (matchingDl.status === 'downloading' || matchingDl.status === 'uploading') {
                    var icon = matchingDl.status === 'uploading' ? '\u2197' : '\u2B07';
                    if (matchingDl.size > 0) {
                        var rxMb = Math.round(matchingDl.rx_bytes / 1048576);
                        var totalMb = Math.round(matchingDl.size / 1048576);
                        var sizeLabel = totalMb >= 1024 ? (Math.round(totalMb / 102.4) / 10) + ' Go' : totalMb + ' Mo';
                        var rxLabel = rxMb >= 1024 ? (Math.round(rxMb / 102.4) / 10) + ' Go' : rxMb + ' Mo';
                        var rate = matchingDl.rx_rate ? Math.round(matchingDl.rx_rate / 1048576 * 10) / 10 : 0;
                        dlProgress = icon + ' ' + rxLabel + ' / ' + sizeLabel + (rate > 0 ? ' (' + rate + ' Mo/s)' : '');
                    }
                    else if (matchingDl.rx_bytes > 0) {
                        var mb = Math.round(matchingDl.rx_bytes / 1048576);
                        var rate = matchingDl.rx_rate ? Math.round(matchingDl.rx_rate / 1048576 * 10) / 10 : 0;
                        dlProgress = icon + ' ' + mb + ' Mo' + (rate > 0 ? ' (' + rate + ' Mo/s)' : '');
                    }
                    else {
                        dlProgress = icon + ' ...';
                    }
                }
                var statusLabel = matchingDl.status === 'done' ? '\u2713' :
                    (matchingDl.status === 'downloading' || matchingDl.status === 'uploading') ? dlProgress :
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
                if (fillEl) fillEl.style.width = pct + '%';
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
