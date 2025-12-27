/**
 * Centralized regex patterns
 * Avoids duplication and ensures consistency across the codebase
 */

var Regex = {
    // === Category/Language detection ===
    categoryPrefix: /^([A-Za-z0-9]{2,10})(?:-[A-Za-z0-9]+)?\s*\|\s*/i,
    langCode: /^[A-Za-z]{2,6}$/,
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

    // Initialize dynamic patterns from TITLE_CLEANUP_PATTERNS and DEFAULT_CATEGORY_PATTERNS
    // Sets: langTags, saison, part, seriesWord, manga
    init: function() {
        var self = this;
        var escapeWords = function(words) {
            return words.map(function(w) { return self.escape(w); });
        };
        // langTags
        var langWords = buildCleanupPattern('langTags') || [];
        if (langWords.length > 0) {
            this.langTags = new RegExp('\\s*\\b(' + escapeWords(langWords).join('|') + ')\\b\\s*', 'gi');
        }
        // saison
        var seasonWords = buildCleanupPattern('season') || [];
        if (seasonWords.length > 0) {
            this.saison = new RegExp('\\s*(' + escapeWords(seasonWords).join('|') + ')\\s*\\d+\\s*', 'gi');
        }
        // part
        var partWords = buildCleanupPattern('part') || [];
        if (partWords.length > 0) {
            this.part = new RegExp('\\s*-?\\s*(' + escapeWords(partWords).join('|') + ')\\s*\\d+\\s*', 'gi');
        }
        // seriesWord
        var seriesWords = buildCleanupPattern('series') || [];
        if (seriesWords.length > 0) {
            this.seriesWord = new RegExp('\\b(' + escapeWords(seriesWords).join('|') + ')\\b', 'gi');
        }
        // manga (from all locales)
        var mangaWords = [];
        for (var locale in DEFAULT_CATEGORY_PATTERNS) {
            if (DEFAULT_CATEGORY_PATTERNS.hasOwnProperty(locale) && DEFAULT_CATEGORY_PATTERNS[locale].manga) {
                mangaWords = mangaWords.concat(DEFAULT_CATEGORY_PATTERNS[locale].manga);
            }
        }
        var uniqueManga = mangaWords.filter(function(w, i) { return mangaWords.indexOf(w) === i; });
        if (uniqueManga.length > 0) {
            this.manga = new RegExp('\\b(' + escapeWords(uniqueManga).join('|') + ')\\b', 'gi');
        }
    }
};
