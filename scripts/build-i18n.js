#!/usr/bin/env node
/**
 * Build script for i18n.js
 * Generates i18n.js with embedded translations from locales/*.json files
 */

const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', 'locales');
const outputFile = path.join(__dirname, '..', 'js', 'i18n.js');

const localeNames = {
    fr: 'Français',
    en: 'English',
    es: 'Español',
    de: 'Deutsch',
    it: 'Italiano',
    pt: 'Português',
    ar: 'العربية',
    tr: 'Türkçe',
    nl: 'Nederlands',
    pl: 'Polski',
    ru: 'Русский'
};

const localeFlags = {
    fr: '🇫🇷',
    en: '🇬🇧',
    es: '🇪🇸',
    de: '🇩🇪',
    it: '🇮🇹',
    pt: '🇵🇹',
    ar: '🇸🇦',
    tr: '🇹🇷',
    nl: '🇳🇱',
    pl: '🇵🇱',
    ru: '🇷🇺'
};

// Read all locale files
const translations = {};
const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.json'));

for (const file of files) {
    const locale = file.replace('.json', '');
    const content = fs.readFileSync(path.join(localesDir, file), 'utf8');
    translations[locale] = JSON.parse(content);
}

const availableLocales = Object.keys(translations).sort((a, b) => {
    // Keep 'en' first as default
    if (a === 'en') return -1;
    if (b === 'en') return 1;
    return a.localeCompare(b);
});

// Generate i18n.js
const output = `/**
 * Internationalization (i18n) Module
 * @description Handles multi-language support with embedded translations
 * Supports: ${availableLocales.map(l => l.toUpperCase()).join(', ')} (${availableLocales.length} languages)
 *
 * AUTO-GENERATED - Do not edit manually!
 * Run 'npm run build:i18n' to regenerate from locales/*.json
 */
var I18n = (function() {
    var locale = 'en';
    var defaultLocale = 'en';
    var availableLocales = ${JSON.stringify(availableLocales)};
    var localeNames = ${JSON.stringify(localeNames, null, 8).replace(/\n/g, '\n    ')};
    var localeFlags = ${JSON.stringify(localeFlags, null, 8).replace(/\n/g, '\n    ')};
    var translations = ${JSON.stringify(translations, null, 8).replace(/\n/g, '\n    ')};

    function getNestedValue(obj, key) {
        return key.split('.').reduce(function(o, k) {
            return o && o[k] !== undefined ? o[k] : null;
        }, obj);
    }

    return {
        init: function() {
            var savedLocale = localStorage.getItem('app_locale');
            if (savedLocale && availableLocales.indexOf(savedLocale) !== -1) {
                locale = savedLocale;
            }
            else {
                // Detect system language
                var systemLang = navigator.language || navigator.userLanguage || 'en';
                var langCode = systemLang.split('-')[0].toLowerCase();
                if (availableLocales.indexOf(langCode) !== -1) {
                    locale = langCode;
                }
            }
            this.updateDOM();
        },

        setLocale: function(newLocale) {
            if (availableLocales.indexOf(newLocale) === -1) {
                return;
            }
            locale = newLocale;
            localStorage.setItem('app_locale', locale);
            this.updateDOM();
        },

        getLocale: function() {
            return locale;
        },

        getAvailableLocales: function() {
            return availableLocales.slice();
        },

        getLocaleName: function(loc) {
            return localeNames[loc] || loc;
        },

        getLocaleFlag: function(loc) {
            return localeFlags[loc] || '';
        },

        t: function(key, params) {
            var translation = getNestedValue(translations[locale], key);
            if (!translation) {
                translation = getNestedValue(translations[defaultLocale], key);
            }
            if (!translation) {
                return key;
            }
            if (params) {
                Object.keys(params).forEach(function(param) {
                    translation = translation.replace(new RegExp('\\\\{' + param + '\\\\}', 'g'), params[param]);
                });
            }
            return translation;
        },

        updateDOM: function() {
            var elements = document.querySelectorAll('[data-i18n]');
            var self = this;
            elements.forEach(function(el) {
                var key = el.getAttribute('data-i18n');
                el.textContent = self.t(key);
            });
            var attrElements = document.querySelectorAll('[data-i18n-placeholder]');
            attrElements.forEach(function(el) {
                var key = el.getAttribute('data-i18n-placeholder');
                el.setAttribute('placeholder', self.t(key));
            });
        }
    };
})();
`;

fs.writeFileSync(outputFile, output);
console.log(`i18n.js generated with ${availableLocales.length} languages: ${availableLocales.join(', ')}`);
