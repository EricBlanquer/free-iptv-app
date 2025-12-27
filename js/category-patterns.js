/**
 * Default category patterns by locale
 * Used to filter VOD categories into Sport, Entertainment, and Manga sections
 */
var DEFAULT_CATEGORY_PATTERNS = {
    en: {
        sport: ['sport', 'sports', 'nba', 'nfl', 'nhl', 'mlb', 'moto gp', 'formula 1', 'f1', 'boxing', 'wrestling', 'ufc'],
        manga: ['manga', 'anime', 'animation'],
        entertainment: {
            concerts: ['concert', 'live music'],
            theatre: ['theatre', 'theater'],
            spectacles: ['show', 'tv show', 'variety'],
            blindtest: ['blind test', 'quiz'],
            karaoke: ['karaoke']
        }
    },
    fr: {
        sport: ['sport', 'nba', 'nfl', 'moto gp', 'formule 1', 'f1', 'combat'],
        manga: ['manga', 'anime'],
        entertainment: {
            concerts: ['concert'],
            theatre: ['theatre', 'théâtre'],
            spectacles: ['spectacle', 'tv show'],
            blindtest: ['blind test'],
            karaoke: ['karaoke', 'karaoké']
        }
    },
    de: {
        sport: ['sport', 'nba', 'nfl', 'moto gp', 'formel 1', 'f1', 'boxen', 'wrestling', 'kampfsport'],
        manga: ['manga', 'anime', 'zeichentrick'],
        entertainment: {
            concerts: ['konzert', 'concert', 'live musik'],
            theatre: ['theater', 'theatre'],
            spectacles: ['show', 'unterhaltung', 'tv show'],
            blindtest: ['blind test', 'quiz'],
            karaoke: ['karaoke']
        }
    },
    es: {
        sport: ['deporte', 'deportes', 'sport', 'nba', 'nfl', 'moto gp', 'formula 1', 'f1', 'boxeo', 'lucha', 'ufc'],
        manga: ['manga', 'anime', 'animacion'],
        entertainment: {
            concerts: ['concierto', 'concert', 'musica en vivo'],
            theatre: ['teatro', 'theatre'],
            spectacles: ['espectaculo', 'show', 'tv show', 'variedad'],
            blindtest: ['blind test', 'concurso'],
            karaoke: ['karaoke']
        }
    },
    it: {
        sport: ['sport', 'nba', 'nfl', 'moto gp', 'formula 1', 'f1', 'boxe', 'wrestling', 'ufc'],
        manga: ['manga', 'anime', 'animazione'],
        entertainment: {
            concerts: ['concerto', 'concert', 'musica dal vivo'],
            theatre: ['teatro', 'theatre'],
            spectacles: ['spettacolo', 'show', 'tv show', 'varieta'],
            blindtest: ['blind test', 'quiz'],
            karaoke: ['karaoke']
        }
    },
    pt: {
        sport: ['esporte', 'desporto', 'sport', 'nba', 'nfl', 'moto gp', 'formula 1', 'f1', 'boxe', 'luta', 'ufc'],
        manga: ['manga', 'anime', 'animacao'],
        entertainment: {
            concerts: ['concerto', 'concert', 'musica ao vivo'],
            theatre: ['teatro', 'theatre'],
            spectacles: ['espetaculo', 'show', 'tv show', 'variedades'],
            blindtest: ['blind test', 'quiz'],
            karaoke: ['karaoke', 'karaoke']
        }
    },
    nl: {
        sport: ['sport', 'nba', 'nfl', 'moto gp', 'formule 1', 'f1', 'boksen', 'worstelen', 'ufc'],
        manga: ['manga', 'anime', 'animatie'],
        entertainment: {
            concerts: ['concert', 'live muziek'],
            theatre: ['theater', 'theatre'],
            spectacles: ['show', 'tv show', 'variete'],
            blindtest: ['blind test', 'quiz'],
            karaoke: ['karaoke']
        }
    },
    pl: {
        sport: ['sport', 'nba', 'nfl', 'moto gp', 'formula 1', 'f1', 'boks', 'wrestling', 'ufc', 'walki'],
        manga: ['manga', 'anime', 'animacja'],
        entertainment: {
            concerts: ['koncert', 'concert', 'muzyka na zywo'],
            theatre: ['teatr', 'theatre'],
            spectacles: ['spektakl', 'show', 'tv show', 'rozrywka'],
            blindtest: ['blind test', 'quiz'],
            karaoke: ['karaoke']
        }
    },
    ru: {
        sport: ['спорт', 'sport', 'nba', 'nfl', 'мото гп', 'формула 1', 'f1', 'бокс', 'борьба', 'ufc'],
        manga: ['манга', 'manga', 'аниме', 'anime', 'мультфильм'],
        entertainment: {
            concerts: ['концерт', 'concert'],
            theatre: ['театр', 'theatre'],
            spectacles: ['шоу', 'show', 'tv show', 'развлечения'],
            blindtest: ['blind test', 'викторина'],
            karaoke: ['караоке', 'karaoke']
        }
    },
    tr: {
        sport: ['spor', 'sport', 'nba', 'nfl', 'moto gp', 'formula 1', 'f1', 'boks', 'gures', 'ufc', 'dovus'],
        manga: ['manga', 'anime', 'animasyon'],
        entertainment: {
            concerts: ['konser', 'concert'],
            theatre: ['tiyatro', 'theatre'],
            spectacles: ['gosteri', 'show', 'tv show', 'eglence'],
            blindtest: ['blind test', 'bilgi yarismasi'],
            karaoke: ['karaoke']
        }
    },
    ar: {
        sport: ['رياضة', 'sport', 'nba', 'nfl', 'موتو جي بي', 'فورمولا 1', 'f1', 'ملاكمة', 'مصارعة', 'ufc'],
        manga: ['مانجا', 'manga', 'انمي', 'anime', 'رسوم متحركة'],
        entertainment: {
            concerts: ['حفلة', 'حفل', 'concert'],
            theatre: ['مسرح', 'theatre'],
            spectacles: ['عرض', 'show', 'tv show', 'ترفيه'],
            blindtest: ['blind test', 'مسابقة'],
            karaoke: ['كاريوكي', 'karaoke']
        }
    }
};

/**
 * Title cleanup patterns by locale
 * Used to clean stream/category names for display and TMDB search
 */
var TITLE_CLEANUP_PATTERNS = {
    // Language/version tags to remove from titles
    langTags: {
        en: ['DUBBED', 'SUBBED', 'ENGLISH', 'ENG'],
        fr: ['VOSTFR', 'FRENCH', 'VF', 'VFQ', 'VO', 'MULTI', 'TRUEFRENCH', 'SUBFRENCH'],
        de: ['GERMAN', 'DEUTSCH', 'GER'],
        es: ['SPANISH', 'ESPANOL', 'ESP', 'CASTELLANO', 'LATINO'],
        it: ['ITALIAN', 'ITALIANO', 'ITA'],
        pt: ['PORTUGUESE', 'PORTUGUES', 'POR', 'DUBLADO', 'LEGENDADO'],
        nl: ['DUTCH', 'NEDERLANDS', 'NL'],
        pl: ['POLISH', 'POLSKI', 'PL', 'LEKTOR'],
        ru: ['RUSSIAN', 'РУССКИЙ', 'RUS'],
        tr: ['TURKISH', 'TURKCE', 'TR'],
        ar: ['ARABIC', 'عربي', 'مدبلج', 'مترجم']
    },
    // "Season" word in different languages
    season: {
        en: ['Season'],
        fr: ['Saison'],
        de: ['Staffel'],
        es: ['Temporada'],
        it: ['Stagione'],
        pt: ['Temporada'],
        nl: ['Seizoen'],
        pl: ['Sezon'],
        ru: ['Сезон'],
        tr: ['Sezon'],
        ar: ['موسم']
    },
    // "Part" word in different languages
    part: {
        en: ['Part'],
        fr: ['Partie'],
        de: ['Teil'],
        es: ['Parte'],
        it: ['Parte'],
        pt: ['Parte'],
        nl: ['Deel'],
        pl: ['Część'],
        ru: ['Часть'],
        tr: ['Bölüm'],
        ar: ['جزء']
    },
    // "Series" word in different languages
    series: {
        en: ['Series', 'Serie'],
        fr: ['Séries', 'Série', 'Series', 'Serie'],
        de: ['Serien', 'Serie'],
        es: ['Series', 'Serie'],
        it: ['Serie'],
        pt: ['Séries', 'Série', 'Series', 'Serie'],
        nl: ['Series', 'Serie'],
        pl: ['Seriale', 'Serial'],
        ru: ['Сериалы', 'Сериал'],
        tr: ['Diziler', 'Dizi'],
        ar: ['مسلسلات', 'مسلسل']
    }
};

/**
 * Build regex pattern from all locales
 */
function buildCleanupPattern(patternKey) {
    var allWords = [];
    var patterns = TITLE_CLEANUP_PATTERNS[patternKey];
    if (!patterns) return null;
    for (var locale in patterns) {
        if (patterns.hasOwnProperty(locale)) {
            allWords = allWords.concat(patterns[locale]);
        }
    }
    // Remove duplicates
    var unique = [];
    for (var i = 0; i < allWords.length; i++) {
        if (unique.indexOf(allWords[i]) === -1) {
            unique.push(allWords[i]);
        }
    }
    return unique;
}
