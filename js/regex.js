/**
 * Centralized regex patterns
 * Avoids duplication and ensures consistency across the codebase
 */

var Regex = {
    // === Category/Language detection ===
    // Match language prefix: requires pipe separator | to avoid matching words like "Ant-Man", "One-Punch"
    // Matches: "FR|", "FR |", "FR- |", "EU|FR|" but NOT "Ant-" or "One-"
    categoryPrefix: /^(?:(?:EU|AF|24\/7)[-\s]*\|?\s*)?([A-Za-z]{2,3})[-\s]*\|\s*/i,
    // Only match known language codes (ISO 639-1/2) to avoid matching words like "You", "The", etc.
    streamPrefix: /^(?:24\/7\|\s*)?(?:(?:FR|EN|DE|ES|IT|PT|NL|PL|RU|TR|AR|ZH|JA|KO|HI|TH|VI|ID|MS|FIL|SV|NO|DA|FI|CS|SK|HU|RO|BG|HR|SR|SL|UK|EL|HE|FA|UR|BN|TA|TE|MR|GU|KN|ML|PA|NE|SI|MY|KM|LO|MN|KA|AM|SW|ZU|XH|AF|EU|CA|GL|CY|GA|GD|MT|IS|LB|MK|SQ|BS|ET|LV|LT|AZ|KK|UZ|TG|KY|TK|PS|SD|KU|EO|VFF|VF|VO|VOST|VOSTFR|MULTI)[-:\s]+)/i,
    qualityPrefix: /^(4K|3D|SD|HD|FHD|UHD|DVB|DBV)[-|\s]+/i,
    sdQualities: ['SD', 'DVB', 'DBV'],
    langCodeTag: /^(FR|EN|DE|ES|IT|PT|NL|PL|RU|TR|AR|ZH|JA|KO|VFF|VF|VO|VOST|VOSTFR|MULTI)$/i,
    langCode: /^[A-Za-z]{2,6}$/,
    contentTypePrefix: null, // Built dynamically in init()
    shortLangCode: /^[a-zA-Z]{2,3}$/,
    vostfr: /VOSTFR|VO-?STFR|VOST\b/i,
    vfq: /\bVFQ\b/gi,

    // === Year detection ===
    yearInParens: /\((\d{4})\)/,
    yearAtEnd: /[-\s]((?:19|20)\d{2})\s*$/,
    removeYearParens: /\s*\(\d{4}\)\s*/g,
    removeYearEnd: /[-\s]+(?:19|20)\d{2}\s*$/,

    // === Quality/Format tags ===
    qualityTags: /\s*(720p|1080p|2160p|4K|UHD|HDR|HDR10|HDTV|WEB-?DL|BluRay|BDRip|DVDRip)\s*/gi,
    seasonEpisode: /\s*S\d+\s*E\d+\s*/gi,

    // === String normalization ===
    trailingDash: /[-\s]+$/,
    nonAlphanumeric: /[^a-z0-9]/g,
    whitespace: /\s+/g,
    titleCase: /(?:^|[\s\-])\S/g,
    escapeRegex: /[.*+?^${}()|[\]\\]/g,

    // === URL/Network ===
    trailingSlash: /\/+$/,
    macColons: /:/g,

    // === M3U parsing ===
    m3u: {
        tvgName: /tvg-name="([^"]*)"/,
        tvgLogo: /tvg-logo="([^"]*)"/,
        groupTitle: /group-title="([^"]*)"/,
        extinfCount: /#EXTINF/g
    },

    // === SRT subtitle parsing ===
    srtTiming: /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/,
    srtIndex: /^\d+$/,
    srtArrow: /-->/,

    // === Video ===
    resolution: /(\d+)x(\d+)/,

    // === Helper functions ===
    escape: function(str) {
        return str.replace(this.escapeRegex, '\\$&');
    },

    keywordPattern: function(keyword) {
        var escaped = this.escape(keyword).replace(this.whitespace, '\\s*');
        return new RegExp(escaped, 'i');
    },

    // Collect all values for a key from all locales in a map
    collectFromMap: function(map, key) {
        var allWords = [];
        for (var locale in map) {
            if (map.hasOwnProperty(locale) && map[locale][key]) {
                allWords = allWords.concat(map[locale][key]);
            }
        }
        // Remove duplicates
        return allWords.filter(function(w, i) { return allWords.indexOf(w) === i; });
    },

    // Initialize dynamic patterns from I18nData
    // Sets: langTags, saison, part, seriesWord, manga, contentTypePrefix
    init: function() {
        var self = this;
        var escapeWords = function(words) {
            return words.map(function(w) { return self.escape(w); });
        };
        var cleanupMap = I18nData.cleanupPatternsMap || {};
        var categoryMap = I18nData.categoryPatternsMap || {};
        var contentTypeMap = I18nData.contentTypePrefixMap || {};
        // langTags
        var langWords = this.collectFromMap(cleanupMap, 'langTags');
        if (langWords.length > 0) {
            this.langTags = new RegExp('\\s*\\b(' + escapeWords(langWords).join('|') + ')\\b\\s*', 'gi');
        }
        // saison
        var seasonWords = this.collectFromMap(cleanupMap, 'season');
        if (seasonWords.length > 0) {
            this.saison = new RegExp('\\s*(' + escapeWords(seasonWords).join('|') + ')\\s*\\d+\\s*', 'gi');
        }
        // part
        var partWords = this.collectFromMap(cleanupMap, 'part');
        if (partWords.length > 0) {
            this.part = new RegExp('\\s*-?\\s*(' + escapeWords(partWords).join('|') + ')\\s*\\d+\\s*', 'gi');
        }
        // seriesWord
        var seriesWords = this.collectFromMap(cleanupMap, 'series');
        if (seriesWords.length > 0) {
            this.seriesWord = new RegExp('\\b(' + escapeWords(seriesWords).join('|') + ')\\b', 'gi');
        }
        // manga (from categoryPatternsMap)
        var mangaWords = this.collectFromMap(categoryMap, 'manga');
        if (mangaWords.length > 0) {
            this.manga = new RegExp('\\b(' + escapeWords(mangaWords).join('|') + ')\\b', 'gi');
        }
        // contentTypePrefix (Movies, Films, Series, etc. from all locales)
        var contentTypeWords = [];
        for (var locale in contentTypeMap) {
            if (contentTypeMap.hasOwnProperty(locale)) {
                contentTypeWords = contentTypeWords.concat(contentTypeMap[locale]);
            }
        }
        contentTypeWords = contentTypeWords.filter(function(w, i) { return contentTypeWords.indexOf(w) === i; });
        if (contentTypeWords.length > 0) {
            // Sort by length descending to match longer words first (e.g., "Películas" before "Película")
            contentTypeWords.sort(function(a, b) { return b.length - a.length; });
            this.contentTypePrefix = new RegExp('^(' + escapeWords(contentTypeWords).join('|') + ')\\s+', 'i');
        }
    }
};
