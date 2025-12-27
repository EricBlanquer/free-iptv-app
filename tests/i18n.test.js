/**
 * Tests for i18n (Internationalization) module
 */

// Mock XMLHttpRequest for loading locale files
const mockLocales = {
    fr: require('../locales/fr.json'),
    en: require('../locales/en.json'),
    es: require('../locales/es.json')
};

global.XMLHttpRequest = jest.fn().mockImplementation(() => ({
    open: jest.fn(),
    send: jest.fn(function() {
        const url = this._url;
        const locale = url.match(/locales\/(\w+)\.json/)?.[1];
        if (locale && mockLocales[locale]) {
            this.status = 200;
            this.responseText = JSON.stringify(mockLocales[locale]);
        } else {
            this.status = 404;
        }
    }),
    _url: '',
    open: jest.fn(function(method, url) {
        this._url = url;
    })
}));

// Setup DOM
document.body.innerHTML = '<div data-i18n="app.title"></div>';

// Mock localStorage
const localStorageMock = {
    store: {},
    getItem: jest.fn(key => localStorageMock.store[key] || null),
    setItem: jest.fn((key, value) => { localStorageMock.store[key] = value; }),
    clear: jest.fn(() => { localStorageMock.store = {}; })
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Load the I18n module
const fs = require('fs');
const i18nCode = fs.readFileSync('./js/i18n.js', 'utf8');
eval(i18nCode);

describe('I18n', () => {
    beforeEach(() => {
        localStorageMock.clear();
        document.body.innerHTML = '<div data-i18n="app.title"></div>';
    });

    describe('getAvailableLocales', () => {
        it('should return all available locales', () => {
            const locales = I18n.getAvailableLocales();
            expect(locales).toContain('fr');
            expect(locales).toContain('en');
            expect(locales).toContain('es');
            expect(locales).toContain('de');
            expect(locales).toContain('it');
            expect(locales).toContain('pt');
            expect(locales).toContain('ar');
            expect(locales).toContain('tr');
            expect(locales).toContain('nl');
            expect(locales).toContain('pl');
            expect(locales).toContain('ru');
            expect(locales.length).toBe(11);
        });
    });

    describe('getLocaleName', () => {
        it('should return French name', () => {
            expect(I18n.getLocaleName('fr')).toBe('Français');
        });

        it('should return English name', () => {
            expect(I18n.getLocaleName('en')).toBe('English');
        });

        it('should return German name', () => {
            expect(I18n.getLocaleName('de')).toBe('Deutsch');
        });

        it('should return locale code for unknown locale', () => {
            expect(I18n.getLocaleName('xx')).toBe('xx');
        });
    });

    describe('getLocaleFlag', () => {
        it('should return French flag', () => {
            expect(I18n.getLocaleFlag('fr')).toBe('🇫🇷');
        });

        it('should return empty for unknown locale', () => {
            expect(I18n.getLocaleFlag('xx')).toBe('');
        });
    });

    describe('init', () => {
        it('should initialize with default locale', () => {
            I18n.init();
            expect(I18n.getLocale()).toBe('en');
        });
    });

    describe('setLocale', () => {
        beforeEach(() => {
            I18n.init();
        });

        it('should change locale to English', () => {
            I18n.setLocale('en');
            expect(I18n.getLocale()).toBe('en');
        });

        it('should change locale to Spanish', () => {
            I18n.setLocale('es');
            expect(I18n.getLocale()).toBe('es');
        });

        it('should ignore invalid locale', () => {
            I18n.setLocale('en');
            I18n.setLocale('invalid');
            expect(I18n.getLocale()).toBe('en');
        });

        it('should save locale to localStorage', () => {
            I18n.setLocale('en');
            expect(localStorageMock.setItem).toHaveBeenCalledWith('app_locale', 'en');
        });
    });

    describe('t (translate)', () => {
        beforeEach(() => {
            I18n.init();
            I18n.setLocale('en');
        });

        it('should translate app.title in English', () => {
            const result = I18n.t('app.title');
            expect(result).toBe('Free IPTV');
        });

        it('should translate app.loading in English', () => {
            const result = I18n.t('app.loading');
            expect(result).toBe('Loading...');
        });

        it('should return key for missing translation', () => {
            const result = I18n.t('nonexistent.key');
            expect(result).toBe('nonexistent.key');
        });

        it('should handle nested keys', () => {
            const result = I18n.t('disclaimer.title');
            expect(result).toBe('Disclaimer');
        });

        it('should handle interpolation', () => {
            const result = I18n.t('messages.searching', null, { title: 'Test Movie' });
            expect(result).toBe('Searching: "Test Movie"...');
        });
    });

    describe('supported languages count', () => {
        it('should support 11 languages', () => {
            expect(I18n.getAvailableLocales().length).toBe(11);
        });
    });
});
