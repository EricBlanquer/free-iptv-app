#!/usr/bin/env node
/**
 * Build script for i18n-data.js
 * Generates i18n-data.js with embedded translations from locales/*.json files
 */

const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', 'locales');
const outputFile = path.join(__dirname, '..', 'js', 'i18n-data.js');

// Read all locale files and extract metadata
const translations = {};
const iso639Map = {};
const localeNames = {};
const localeFlags = {};
const providerLangMap = {};
const tntChannelsMap = {};
const contentTypePrefixMap = {};
const categoryPatternsMap = {};
const cleanupPatternsMap = {};
const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.json'));

for (const file of files) {
    const locale = file.replace('.json', '');
    const content = fs.readFileSync(path.join(localesDir, file), 'utf8');
    const data = JSON.parse(content);
    // Extract metadata and remove from translations
    if (data.iso639Codes) {
        iso639Map[locale] = [locale].concat(data.iso639Codes);
        delete data.iso639Codes;
    } else {
        iso639Map[locale] = [locale];
    }
    if (data.localeName) {
        localeNames[locale] = data.localeName;
        delete data.localeName;
    } else {
        localeNames[locale] = locale;
    }
    if (data.localeFlag) {
        localeFlags[locale] = data.localeFlag;
        delete data.localeFlag;
    } else {
        localeFlags[locale] = '';
    }
    if (data.providerLangCode) {
        providerLangMap[locale] = data.providerLangCode;
        delete data.providerLangCode;
    } else {
        providerLangMap[locale] = locale.toUpperCase();
    }
    if (data.tntChannels) {
        tntChannelsMap[locale] = data.tntChannels;
        delete data.tntChannels;
    }
    if (data.contentTypePrefix) {
        contentTypePrefixMap[locale] = data.contentTypePrefix;
        delete data.contentTypePrefix;
    }
    if (data.categoryPatterns) {
        categoryPatternsMap[locale] = data.categoryPatterns;
        delete data.categoryPatterns;
    }
    if (data.cleanupPatterns) {
        cleanupPatternsMap[locale] = data.cleanupPatterns;
        delete data.cleanupPatterns;
    }
    translations[locale] = data;
}

const availableLocales = Object.keys(translations).sort((a, b) => {
    // Keep 'en' first as default
    if (a === 'en') return -1;
    if (b === 'en') return 1;
    return a.localeCompare(b);
});

// Generate i18n-data.js
const output = `/**
 * Internationalization Data
 * Supports: ${availableLocales.map(l => l.toUpperCase()).join(', ')} (${availableLocales.length} languages)
 *
 * AUTO-GENERATED - Do not edit manually!
 * Run 'node scripts/build-i18n.js' to regenerate from locales/*.json
 */
var I18nData = {
    availableLocales: ${JSON.stringify(availableLocales)},
    localeNames: ${JSON.stringify(localeNames, null, 8).replace(/\n/g, '\n    ')},
    localeFlags: ${JSON.stringify(localeFlags, null, 8).replace(/\n/g, '\n    ')},
    iso639Map: ${JSON.stringify(iso639Map, null, 8).replace(/\n/g, '\n    ')},
    providerLangMap: ${JSON.stringify(providerLangMap, null, 8).replace(/\n/g, '\n    ')},
    tntChannelsMap: ${JSON.stringify(tntChannelsMap, null, 8).replace(/\n/g, '\n    ')},
    contentTypePrefixMap: ${JSON.stringify(contentTypePrefixMap, null, 8).replace(/\n/g, '\n    ')},
    categoryPatternsMap: ${JSON.stringify(categoryPatternsMap, null, 8).replace(/\n/g, '\n    ')},
    cleanupPatternsMap: ${JSON.stringify(cleanupPatternsMap, null, 8).replace(/\n/g, '\n    ')},
    translations: ${JSON.stringify(translations, null, 8).replace(/\n/g, '\n    ')}
};
`;

fs.writeFileSync(outputFile, output);
console.log(`i18n-data.js generated with ${availableLocales.length} languages: ${availableLocales.join(', ')}`);
