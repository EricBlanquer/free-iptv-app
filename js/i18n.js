/**
 * Internationalization (i18n) Module
 * @description Handles multi-language support
 * Requires: i18n-data.js to be loaded first
 */
var I18n = (function() {
    var locale = 'en';
    var defaultLocale = 'en';

    function getNestedValue(obj, key) {
        return key.split('.').reduce(function(o, k) {
            return o && o[k] !== undefined ? o[k] : null;
        }, obj);
    }

    return {
        init: function() {
            var savedLocale = localStorage.getItem('app_locale');
            if (savedLocale && I18nData.availableLocales.indexOf(savedLocale) !== -1) {
                locale = savedLocale;
            }
            else {
                var systemLang = navigator.language || navigator.userLanguage || 'en';
                var langCode = systemLang.split('-')[0].toLowerCase();
                if (I18nData.availableLocales.indexOf(langCode) !== -1) {
                    locale = langCode;
                }
            }
            this.updateDOM();
        },

        setLocale: function(newLocale) {
            if (I18nData.availableLocales.indexOf(newLocale) === -1) {
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
            return I18nData.availableLocales.slice();
        },

        getLocaleName: function(loc) {
            return I18nData.localeNames[loc] || loc;
        },

        getLocaleFlag: function(loc) {
            return I18nData.localeFlags[loc] || '';
        },

        getIso639Codes: function(loc) {
            return I18nData.iso639Map[loc || locale] || [loc || locale];
        },

        getProviderLangCode: function(loc) {
            return I18nData.providerLangMap[loc || locale] || (loc || locale).toUpperCase();
        },

        getTntChannels: function(loc) {
            return I18nData.tntChannelsMap[loc || locale] || [];
        },

        t: function(key, fallback, params) {
            var translation = getNestedValue(I18nData.translations[locale], key);
            if (!translation) {
                translation = getNestedValue(I18nData.translations[defaultLocale], key);
            }
            if (!translation) {
                return fallback || key;
            }
            if (params) {
                Object.keys(params).forEach(function(param) {
                    translation = translation.replace(new RegExp('\\{' + param + '\\}', 'g'), params[param]);
                });
            }
            return translation;
        },

        updateDOM: function() {
            var self = this;
            var elements = document.querySelectorAll('[data-i18n]');
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
