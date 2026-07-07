/**
 * Country flags mapping - ISO 3166-1 alpha-2 codes to emoji flags
 * Plus common aliases and special codes
 */
var CountryFlags = {
    // Special codes
    'INT': '🌍', 'INTL': '🌍', 'INTERNATIONAL': '🌍',
    'VO': '🎬', 'VOSTFR': '🎬', 'MULTI': '🌐',
    'EXYU': '🇷🇸', 'EX': '🇷🇸',

    // Common aliases
    'UK': '🇬🇧', 'EN': '🇬🇧', 'ENG': '🇬🇧',
    'USA': '🇺🇸', 'ARG': '🇦🇷',
    'SW': '🇸🇪', 'SWE': '🇸🇪',
    'GR': '🇬🇷', 'GRE': '🇬🇷',
    'CZ': '🇨🇿', 'CZE': '🇨🇿',
    'IND': '🇮🇳',

    // A
    'AD': '🇦🇩', 'AE': '🇦🇪', 'AF': '🇦🇫', 'AG': '🇦🇬', 'AI': '🇦🇮',
    'AL': '🇦🇱', 'AM': '🇦🇲', 'AO': '🇦🇴', 'AQ': '🇦🇶', 'AR': '🇦🇷',
    'AS': '🇦🇸', 'AT': '🇦🇹', 'AU': '🇦🇺', 'AW': '🇦🇼', 'AX': '🇦🇽',
    'AZ': '🇦🇿',

    // B
    'BA': '🇧🇦', 'BB': '🇧🇧', 'BD': '🇧🇩', 'BE': '🇧🇪', 'BF': '🇧🇫',
    'BG': '🇧🇬', 'BH': '🇧🇭', 'BI': '🇧🇮', 'BJ': '🇧🇯', 'BL': '🇧🇱',
    'BM': '🇧🇲', 'BN': '🇧🇳', 'BO': '🇧🇴', 'BQ': '🇧🇶', 'BR': '🇧🇷',
    'BS': '🇧🇸', 'BT': '🇧🇹', 'BV': '🇧🇻', 'BW': '🇧🇼', 'BY': '🇧🇾',
    'BZ': '🇧🇿',

    // C
    'CA': '🇨🇦', 'CC': '🇨🇨', 'CD': '🇨🇩', 'CF': '🇨🇫', 'CG': '🇨🇬',
    'CH': '🇨🇭', 'CI': '🇨🇮', 'CK': '🇨🇰', 'CL': '🇨🇱', 'CM': '🇨🇲',
    'CN': '🇨🇳', 'CO': '🇨🇴', 'CR': '🇨🇷', 'CU': '🇨🇺', 'CV': '🇨🇻',
    'CW': '🇨🇼', 'CX': '🇨🇽', 'CY': '🇨🇾', 'CZ': '🇨🇿',

    // D
    'DE': '🇩🇪', 'DJ': '🇩🇯', 'DK': '🇩🇰', 'DM': '🇩🇲', 'DO': '🇩🇴',
    'DZ': '🇩🇿',

    // E
    'EC': '🇪🇨', 'EE': '🇪🇪', 'EG': '🇪🇬', 'EH': '🇪🇭', 'ER': '🇪🇷',
    'ES': '🇪🇸', 'ET': '🇪🇹',

    // F
    'FI': '🇫🇮', 'FJ': '🇫🇯', 'FK': '🇫🇰', 'FM': '🇫🇲', 'FO': '🇫🇴',
    'FR': '🇫🇷',

    // G
    'GA': '🇬🇦', 'GB': '🇬🇧', 'GD': '🇬🇩', 'GE': '🇬🇪', 'GF': '🇬🇫',
    'GG': '🇬🇬', 'GH': '🇬🇭', 'GI': '🇬🇮', 'GL': '🇬🇱', 'GM': '🇬🇲',
    'GN': '🇬🇳', 'GP': '🇬🇵', 'GQ': '🇬🇶', 'GR': '🇬🇷', 'GS': '🇬🇸',
    'GT': '🇬🇹', 'GU': '🇬🇺', 'GW': '🇬🇼', 'GY': '🇬🇾',

    // H
    'HK': '🇭🇰', 'HM': '🇭🇲', 'HN': '🇭🇳', 'HR': '🇭🇷', 'HT': '🇭🇹',
    'HU': '🇭🇺',

    // I
    'ID': '🇮🇩', 'IE': '🇮🇪', 'IL': '🇮🇱', 'IM': '🇮🇲', 'IN': '🇮🇳',
    'IO': '🇮🇴', 'IQ': '🇮🇶', 'IR': '🇮🇷', 'IS': '🇮🇸', 'IT': '🇮🇹',

    // J
    'JE': '🇯🇪', 'JM': '🇯🇲', 'JO': '🇯🇴', 'JP': '🇯🇵',

    // K
    'KE': '🇰🇪', 'KG': '🇰🇬', 'KH': '🇰🇭', 'KI': '🇰🇮', 'KM': '🇰🇲',
    'KN': '🇰🇳', 'KP': '🇰🇵', 'KR': '🇰🇷', 'KW': '🇰🇼', 'KY': '🇰🇾',
    'KZ': '🇰🇿',

    // L
    'LA': '🇱🇦', 'LB': '🇱🇧', 'LC': '🇱🇨', 'LI': '🇱🇮', 'LK': '🇱🇰',
    'LR': '🇱🇷', 'LS': '🇱🇸', 'LT': '🇱🇹', 'LU': '🇱🇺', 'LV': '🇱🇻',
    'LY': '🇱🇾',

    // M
    'MA': '🇲🇦', 'MC': '🇲🇨', 'MD': '🇲🇩', 'ME': '🇲🇪', 'MF': '🇲🇫',
    'MG': '🇲🇬', 'MH': '🇲🇭', 'MK': '🇲🇰', 'ML': '🇲🇱', 'MM': '🇲🇲',
    'MN': '🇲🇳', 'MO': '🇲🇴', 'MP': '🇲🇵', 'MQ': '🇲🇶', 'MR': '🇲🇷',
    'MS': '🇲🇸', 'MT': '🇲🇹', 'MU': '🇲🇺', 'MV': '🇲🇻', 'MW': '🇲🇼',
    'MX': '🇲🇽', 'MY': '🇲🇾', 'MZ': '🇲🇿',

    // N
    'NA': '🇳🇦', 'NC': '🇳🇨', 'NE': '🇳🇪', 'NF': '🇳🇫', 'NG': '🇳🇬',
    'NI': '🇳🇮', 'NL': '🇳🇱', 'NO': '🇳🇴', 'NP': '🇳🇵', 'NR': '🇳🇷',
    'NU': '🇳🇺', 'NZ': '🇳🇿',

    // O
    'OM': '🇴🇲',

    // P
    'PA': '🇵🇦', 'PE': '🇵🇪', 'PF': '🇵🇫', 'PG': '🇵🇬', 'PH': '🇵🇭',
    'PK': '🇵🇰', 'PL': '🇵🇱', 'PM': '🇵🇲', 'PN': '🇵🇳', 'PR': '🇵🇷',
    'PS': '🇵🇸', 'PT': '🇵🇹', 'PW': '🇵🇼', 'PY': '🇵🇾',

    // Q
    'QA': '🇶🇦',

    // R
    'RE': '🇷🇪', 'RO': '🇷🇴', 'RS': '🇷🇸', 'RU': '🇷🇺', 'RW': '🇷🇼',

    // S
    'SA': '🇸🇦', 'SB': '🇸🇧', 'SC': '🇸🇨', 'SD': '🇸🇩', 'SE': '🇸🇪',
    'SG': '🇸🇬', 'SH': '🇸🇭', 'SI': '🇸🇮', 'SJ': '🇸🇯', 'SK': '🇸🇰',
    'SL': '🇸🇱', 'SM': '🇸🇲', 'SN': '🇸🇳', 'SO': '🇸🇴', 'SR': '🇸🇷',
    'SS': '🇸🇸', 'ST': '🇸🇹', 'SV': '🇸🇻', 'SX': '🇸🇽', 'SY': '🇸🇾',
    'SZ': '🇸🇿',

    // T
    'TC': '🇹🇨', 'TD': '🇹🇩', 'TF': '🇹🇫', 'TG': '🇹🇬', 'TH': '🇹🇭',
    'TJ': '🇹🇯', 'TK': '🇹🇰', 'TL': '🇹🇱', 'TM': '🇹🇲', 'TN': '🇹🇳',
    'TO': '🇹🇴', 'TR': '🇹🇷', 'TT': '🇹🇹', 'TV': '🇹🇻', 'TW': '🇹🇼',
    'TZ': '🇹🇿',

    // U
    'UA': '🇺🇦', 'UG': '🇺🇬', 'UM': '🇺🇲', 'US': '🇺🇸', 'UY': '🇺🇾',
    'UZ': '🇺🇿',

    // V
    'VA': '🇻🇦', 'VC': '🇻🇨', 'VE': '🇻🇪', 'VG': '🇻🇬', 'VI': '🇻🇮',
    'VN': '🇻🇳', 'VU': '🇻🇺',

    // W
    'WF': '🇼🇫', 'WS': '🇼🇸',

    // X
    'XK': '🇽🇰',

    // Y
    'YE': '🇾🇪', 'YT': '🇾🇹',

    // Z
    'ZA': '🇿🇦', 'ZM': '🇿🇲', 'ZW': '🇿🇼'
};

/**
 * Get flag emoji for a country code
 * @param {string} code - Country code (case insensitive)
 * @returns {string|null} Flag emoji or null if not found
 */
function getFlag(code) {
    if (!code) return null;
    return CountryFlags[code.toUpperCase()] || null;
}

// Localized country names (ISO 3166-1 alpha-2) for the main film-producing
// countries, in the app's 11 languages: en, fr, de, es, it, pt, nl, pl, ru, ar, tr.
// Falls back to the TMDB name (English) for codes not listed here.
var CountryNames = {
    'US': { en: 'United States', fr: 'États-Unis', de: 'USA', es: 'Estados Unidos', it: 'Stati Uniti', pt: 'Estados Unidos', nl: 'Verenigde Staten', pl: 'Stany Zjednoczone', ru: 'США', ar: 'الولايات المتحدة', tr: 'ABD' },
    'GB': { en: 'United Kingdom', fr: 'Royaume-Uni', de: 'Vereinigtes Königreich', es: 'Reino Unido', it: 'Regno Unito', pt: 'Reino Unido', nl: 'Verenigd Koninkrijk', pl: 'Wielka Brytania', ru: 'Великобритания', ar: 'المملكة المتحدة', tr: 'Birleşik Krallık' },
    'FR': { en: 'France', fr: 'France', de: 'Frankreich', es: 'Francia', it: 'Francia', pt: 'França', nl: 'Frankrijk', pl: 'Francja', ru: 'Франция', ar: 'فرنسا', tr: 'Fransa' },
    'DE': { en: 'Germany', fr: 'Allemagne', de: 'Deutschland', es: 'Alemania', it: 'Germania', pt: 'Alemanha', nl: 'Duitsland', pl: 'Niemcy', ru: 'Германия', ar: 'ألمانيا', tr: 'Almanya' },
    'IT': { en: 'Italy', fr: 'Italie', de: 'Italien', es: 'Italia', it: 'Italia', pt: 'Itália', nl: 'Italië', pl: 'Włochy', ru: 'Италия', ar: 'إيطاليا', tr: 'İtalya' },
    'ES': { en: 'Spain', fr: 'Espagne', de: 'Spanien', es: 'España', it: 'Spagna', pt: 'Espanha', nl: 'Spanje', pl: 'Hiszpania', ru: 'Испания', ar: 'إسبانيا', tr: 'İspanya' },
    'PT': { en: 'Portugal', fr: 'Portugal', de: 'Portugal', es: 'Portugal', it: 'Portogallo', pt: 'Portugal', nl: 'Portugal', pl: 'Portugalia', ru: 'Португалия', ar: 'البرتغال', tr: 'Portekiz' },
    'NL': { en: 'Netherlands', fr: 'Pays-Bas', de: 'Niederlande', es: 'Países Bajos', it: 'Paesi Bassi', pt: 'Países Baixos', nl: 'Nederland', pl: 'Holandia', ru: 'Нидерланды', ar: 'هولندا', tr: 'Hollanda' },
    'BE': { en: 'Belgium', fr: 'Belgique', de: 'Belgien', es: 'Bélgica', it: 'Belgio', pt: 'Bélgica', nl: 'België', pl: 'Belgia', ru: 'Бельгия', ar: 'بلجيكا', tr: 'Belçika' },
    'LU': { en: 'Luxembourg', fr: 'Luxembourg', de: 'Luxemburg', es: 'Luxemburgo', it: 'Lussemburgo', pt: 'Luxemburgo', nl: 'Luxemburg', pl: 'Luksemburg', ru: 'Люксембург', ar: 'لوكسمبورغ', tr: 'Lüksemburg' },
    'IE': { en: 'Ireland', fr: 'Irlande', de: 'Irland', es: 'Irlanda', it: 'Irlanda', pt: 'Irlanda', nl: 'Ierland', pl: 'Irlandia', ru: 'Ирландия', ar: 'أيرلندا', tr: 'İrlanda' },
    'PL': { en: 'Poland', fr: 'Pologne', de: 'Polen', es: 'Polonia', it: 'Polonia', pt: 'Polónia', nl: 'Polen', pl: 'Polska', ru: 'Польша', ar: 'بولندا', tr: 'Polonya' },
    'RU': { en: 'Russia', fr: 'Russie', de: 'Russland', es: 'Rusia', it: 'Russia', pt: 'Rússia', nl: 'Rusland', pl: 'Rosja', ru: 'Россия', ar: 'روسيا', tr: 'Rusya' },
    'UA': { en: 'Ukraine', fr: 'Ukraine', de: 'Ukraine', es: 'Ucrania', it: 'Ucraina', pt: 'Ucrânia', nl: 'Oekraïne', pl: 'Ukraina', ru: 'Украина', ar: 'أوكرانيا', tr: 'Ukrayna' },
    'TR': { en: 'Turkey', fr: 'Turquie', de: 'Türkei', es: 'Turquía', it: 'Turchia', pt: 'Turquia', nl: 'Turkije', pl: 'Turcja', ru: 'Турция', ar: 'تركيا', tr: 'Türkiye' },
    'GR': { en: 'Greece', fr: 'Grèce', de: 'Griechenland', es: 'Grecia', it: 'Grecia', pt: 'Grécia', nl: 'Griekenland', pl: 'Grecja', ru: 'Греция', ar: 'اليونان', tr: 'Yunanistan' },
    'CZ': { en: 'Czech Republic', fr: 'République tchèque', de: 'Tschechien', es: 'República Checa', it: 'Repubblica Ceca', pt: 'República Checa', nl: 'Tsjechië', pl: 'Czechy', ru: 'Чехия', ar: 'التشيك', tr: 'Çekya' },
    'SK': { en: 'Slovakia', fr: 'Slovaquie', de: 'Slowakei', es: 'Eslovaquia', it: 'Slovacchia', pt: 'Eslováquia', nl: 'Slowakije', pl: 'Słowacja', ru: 'Словакия', ar: 'سلوفاكيا', tr: 'Slovakya' },
    'HU': { en: 'Hungary', fr: 'Hongrie', de: 'Ungarn', es: 'Hungría', it: 'Ungheria', pt: 'Hungria', nl: 'Hongarije', pl: 'Węgry', ru: 'Венгрия', ar: 'المجر', tr: 'Macaristan' },
    'RO': { en: 'Romania', fr: 'Roumanie', de: 'Rumänien', es: 'Rumanía', it: 'Romania', pt: 'Romênia', nl: 'Roemenië', pl: 'Rumunia', ru: 'Румыния', ar: 'رومانيا', tr: 'Romanya' },
    'BG': { en: 'Bulgaria', fr: 'Bulgarie', de: 'Bulgarien', es: 'Bulgaria', it: 'Bulgaria', pt: 'Bulgária', nl: 'Bulgarije', pl: 'Bułgaria', ru: 'Болгария', ar: 'بلغاريا', tr: 'Bulgaristan' },
    'RS': { en: 'Serbia', fr: 'Serbie', de: 'Serbien', es: 'Serbia', it: 'Serbia', pt: 'Sérvia', nl: 'Servië', pl: 'Serbia', ru: 'Сербия', ar: 'صربيا', tr: 'Sırbistan' },
    'HR': { en: 'Croatia', fr: 'Croatie', de: 'Kroatien', es: 'Croacia', it: 'Croazia', pt: 'Croácia', nl: 'Kroatië', pl: 'Chorwacja', ru: 'Хорватия', ar: 'كرواتيا', tr: 'Hırvatistan' },
    'AT': { en: 'Austria', fr: 'Autriche', de: 'Österreich', es: 'Austria', it: 'Austria', pt: 'Áustria', nl: 'Oostenrijk', pl: 'Austria', ru: 'Австрия', ar: 'النمسا', tr: 'Avusturya' },
    'CH': { en: 'Switzerland', fr: 'Suisse', de: 'Schweiz', es: 'Suiza', it: 'Svizzera', pt: 'Suíça', nl: 'Zwitserland', pl: 'Szwajcaria', ru: 'Швейцария', ar: 'سويسرا', tr: 'İsviçre' },
    'SE': { en: 'Sweden', fr: 'Suède', de: 'Schweden', es: 'Suecia', it: 'Svezia', pt: 'Suécia', nl: 'Zweden', pl: 'Szwecja', ru: 'Швеция', ar: 'السويد', tr: 'İsveç' },
    'NO': { en: 'Norway', fr: 'Norvège', de: 'Norwegen', es: 'Noruega', it: 'Norvegia', pt: 'Noruega', nl: 'Noorwegen', pl: 'Norwegia', ru: 'Норвегия', ar: 'النرويج', tr: 'Norveç' },
    'DK': { en: 'Denmark', fr: 'Danemark', de: 'Dänemark', es: 'Dinamarca', it: 'Danimarca', pt: 'Dinamarca', nl: 'Denemarken', pl: 'Dania', ru: 'Дания', ar: 'الدنمارك', tr: 'Danimarka' },
    'FI': { en: 'Finland', fr: 'Finlande', de: 'Finnland', es: 'Finlandia', it: 'Finlandia', pt: 'Finlândia', nl: 'Finland', pl: 'Finlandia', ru: 'Финляндия', ar: 'فنلندا', tr: 'Finlandiya' },
    'IS': { en: 'Iceland', fr: 'Islande', de: 'Island', es: 'Islandia', it: 'Islanda', pt: 'Islândia', nl: 'IJsland', pl: 'Islandia', ru: 'Исландия', ar: 'آيسلندا', tr: 'İzlanda' },
    'JP': { en: 'Japan', fr: 'Japon', de: 'Japan', es: 'Japón', it: 'Giappone', pt: 'Japão', nl: 'Japan', pl: 'Japonia', ru: 'Япония', ar: 'اليابان', tr: 'Japonya' },
    'KR': { en: 'South Korea', fr: 'Corée du Sud', de: 'Südkorea', es: 'Corea del Sur', it: 'Corea del Sud', pt: 'Coreia do Sul', nl: 'Zuid-Korea', pl: 'Korea Południowa', ru: 'Южная Корея', ar: 'كوريا الجنوبية', tr: 'Güney Kore' },
    'CN': { en: 'China', fr: 'Chine', de: 'China', es: 'China', it: 'Cina', pt: 'China', nl: 'China', pl: 'Chiny', ru: 'Китай', ar: 'الصين', tr: 'Çin' },
    'HK': { en: 'Hong Kong', fr: 'Hong Kong', de: 'Hongkong', es: 'Hong Kong', it: 'Hong Kong', pt: 'Hong Kong', nl: 'Hongkong', pl: 'Hongkong', ru: 'Гонконг', ar: 'هونغ كونغ', tr: 'Hong Kong' },
    'TW': { en: 'Taiwan', fr: 'Taïwan', de: 'Taiwan', es: 'Taiwán', it: 'Taiwan', pt: 'Taiwan', nl: 'Taiwan', pl: 'Tajwan', ru: 'Тайвань', ar: 'تايوان', tr: 'Tayvan' },
    'IN': { en: 'India', fr: 'Inde', de: 'Indien', es: 'India', it: 'India', pt: 'Índia', nl: 'India', pl: 'Indie', ru: 'Индия', ar: 'الهند', tr: 'Hindistan' },
    'TH': { en: 'Thailand', fr: 'Thaïlande', de: 'Thailand', es: 'Tailandia', it: 'Thailandia', pt: 'Tailândia', nl: 'Thailand', pl: 'Tajlandia', ru: 'Таиланд', ar: 'تايلاند', tr: 'Tayland' },
    'ID': { en: 'Indonesia', fr: 'Indonésie', de: 'Indonesien', es: 'Indonesia', it: 'Indonesia', pt: 'Indonésia', nl: 'Indonesië', pl: 'Indonezja', ru: 'Индонезия', ar: 'إندونيسيا', tr: 'Endonezya' },
    'PH': { en: 'Philippines', fr: 'Philippines', de: 'Philippinen', es: 'Filipinas', it: 'Filippine', pt: 'Filipinas', nl: 'Filipijnen', pl: 'Filipiny', ru: 'Филиппины', ar: 'الفلبين', tr: 'Filipinler' },
    'VN': { en: 'Vietnam', fr: 'Viêt Nam', de: 'Vietnam', es: 'Vietnam', it: 'Vietnam', pt: 'Vietnã', nl: 'Vietnam', pl: 'Wietnam', ru: 'Вьетнам', ar: 'فيتنام', tr: 'Vietnam' },
    'MY': { en: 'Malaysia', fr: 'Malaisie', de: 'Malaysia', es: 'Malasia', it: 'Malaysia', pt: 'Malásia', nl: 'Maleisië', pl: 'Malezja', ru: 'Малайзия', ar: 'ماليزيا', tr: 'Malezya' },
    'SG': { en: 'Singapore', fr: 'Singapour', de: 'Singapur', es: 'Singapur', it: 'Singapore', pt: 'Singapura', nl: 'Singapore', pl: 'Singapur', ru: 'Сингапур', ar: 'سنغافورة', tr: 'Singapur' },
    'IL': { en: 'Israel', fr: 'Israël', de: 'Israel', es: 'Israel', it: 'Israele', pt: 'Israel', nl: 'Israël', pl: 'Izrael', ru: 'Израиль', ar: 'إسرائيل', tr: 'İsrail' },
    'IR': { en: 'Iran', fr: 'Iran', de: 'Iran', es: 'Irán', it: 'Iran', pt: 'Irã', nl: 'Iran', pl: 'Iran', ru: 'Иран', ar: 'إيران', tr: 'İran' },
    'SA': { en: 'Saudi Arabia', fr: 'Arabie saoudite', de: 'Saudi-Arabien', es: 'Arabia Saudita', it: 'Arabia Saudita', pt: 'Arábia Saudita', nl: 'Saoedi-Arabië', pl: 'Arabia Saudyjska', ru: 'Саудовская Аравия', ar: 'السعودية', tr: 'Suudi Arabistan' },
    'AE': { en: 'United Arab Emirates', fr: 'Émirats arabes unis', de: 'Vereinigte Arabische Emirate', es: 'Emiratos Árabes Unidos', it: 'Emirati Arabi Uniti', pt: 'Emirados Árabes Unidos', nl: 'Verenigde Arabische Emiraten', pl: 'Zjednoczone Emiraty Arabskie', ru: 'ОАЭ', ar: 'الإمارات', tr: 'Birleşik Arap Emirlikleri' },
    'EG': { en: 'Egypt', fr: 'Égypte', de: 'Ägypten', es: 'Egipto', it: 'Egitto', pt: 'Egito', nl: 'Egypte', pl: 'Egipt', ru: 'Египет', ar: 'مصر', tr: 'Mısır' },
    'MA': { en: 'Morocco', fr: 'Maroc', de: 'Marokko', es: 'Marruecos', it: 'Marocco', pt: 'Marrocos', nl: 'Marokko', pl: 'Maroko', ru: 'Марокко', ar: 'المغرب', tr: 'Fas' },
    'DZ': { en: 'Algeria', fr: 'Algérie', de: 'Algerien', es: 'Argelia', it: 'Algeria', pt: 'Argélia', nl: 'Algerije', pl: 'Algieria', ru: 'Алжир', ar: 'الجزائر', tr: 'Cezayir' },
    'TN': { en: 'Tunisia', fr: 'Tunisie', de: 'Tunesien', es: 'Túnez', it: 'Tunisia', pt: 'Tunísia', nl: 'Tunesië', pl: 'Tunezja', ru: 'Тунис', ar: 'تونس', tr: 'Tunus' },
    'ZA': { en: 'South Africa', fr: 'Afrique du Sud', de: 'Südafrika', es: 'Sudáfrica', it: 'Sudafrica', pt: 'África do Sul', nl: 'Zuid-Afrika', pl: 'RPA', ru: 'ЮАР', ar: 'جنوب أفريقيا', tr: 'Güney Afrika' },
    'NG': { en: 'Nigeria', fr: 'Nigeria', de: 'Nigeria', es: 'Nigeria', it: 'Nigeria', pt: 'Nigéria', nl: 'Nigeria', pl: 'Nigeria', ru: 'Нигерия', ar: 'نيجيريا', tr: 'Nijerya' },
    'CA': { en: 'Canada', fr: 'Canada', de: 'Kanada', es: 'Canadá', it: 'Canada', pt: 'Canadá', nl: 'Canada', pl: 'Kanada', ru: 'Канада', ar: 'كندا', tr: 'Kanada' },
    'MX': { en: 'Mexico', fr: 'Mexique', de: 'Mexiko', es: 'México', it: 'Messico', pt: 'México', nl: 'Mexico', pl: 'Meksyk', ru: 'Мексика', ar: 'المكسيك', tr: 'Meksika' },
    'BR': { en: 'Brazil', fr: 'Brésil', de: 'Brasilien', es: 'Brasil', it: 'Brasile', pt: 'Brasil', nl: 'Brazilië', pl: 'Brazylia', ru: 'Бразилия', ar: 'البرازيل', tr: 'Brezilya' },
    'AR': { en: 'Argentina', fr: 'Argentine', de: 'Argentinien', es: 'Argentina', it: 'Argentina', pt: 'Argentina', nl: 'Argentinië', pl: 'Argentyna', ru: 'Аргентина', ar: 'الأرجنتين', tr: 'Arjantin' },
    'CL': { en: 'Chile', fr: 'Chili', de: 'Chile', es: 'Chile', it: 'Cile', pt: 'Chile', nl: 'Chili', pl: 'Chile', ru: 'Чили', ar: 'تشيلي', tr: 'Şili' },
    'CO': { en: 'Colombia', fr: 'Colombie', de: 'Kolumbien', es: 'Colombia', it: 'Colombia', pt: 'Colômbia', nl: 'Colombia', pl: 'Kolumbia', ru: 'Колумбия', ar: 'كولومبيا', tr: 'Kolombiya' },
    'PE': { en: 'Peru', fr: 'Pérou', de: 'Peru', es: 'Perú', it: 'Perù', pt: 'Peru', nl: 'Peru', pl: 'Peru', ru: 'Перу', ar: 'بيرو', tr: 'Peru' },
    'AU': { en: 'Australia', fr: 'Australie', de: 'Australien', es: 'Australia', it: 'Australia', pt: 'Austrália', nl: 'Australië', pl: 'Australia', ru: 'Австралия', ar: 'أستراليا', tr: 'Avustralya' },
    'NZ': { en: 'New Zealand', fr: 'Nouvelle-Zélande', de: 'Neuseeland', es: 'Nueva Zelanda', it: 'Nuova Zelanda', pt: 'Nova Zelândia', nl: 'Nieuw-Zeeland', pl: 'Nowa Zelandia', ru: 'Новая Зеландия', ar: 'نيوزيلندا', tr: 'Yeni Zelanda' }
};

function getCountryName(code, locale) {
    if (!code) return null;
    var entry = CountryNames[code.toUpperCase()];
    if (!entry) return null;
    return entry[locale] || entry.en || null;
}
