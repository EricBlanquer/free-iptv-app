var fs = require('fs');
var path = require('path');

var LOCALES = ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ar', 'tr'];
var LOCALE_DATA = {};
LOCALES.forEach(function(locale) {
    LOCALE_DATA[locale] = require('../locales/' + locale + '.json');
});

var HTML_CONTENT = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

var JS_DIR = path.join(__dirname, '..', 'js');

function getAllJsFiles(dir) {
    var results = [];
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.forEach(function(entry) {
        var fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(getAllJsFiles(fullPath));
        } else if (entry.name.endsWith('.js') && entry.name !== 'i18n-data.js') {
            results.push(fullPath);
        }
    });
    return results;
}

function resolveKey(obj, keyPath) {
    var parts = keyPath.split('.');
    var current = obj;
    for (var i = 0; i < parts.length; i++) {
        if (current === undefined || current === null) return undefined;
        current = current[parts[i]];
    }
    return current;
}

function extractDataI18nKeys() {
    var regex = /data-i18n="([^"]+)"/g;
    var keys = [];
    var match;
    while ((match = regex.exec(HTML_CONTENT)) !== null) {
        keys.push(match[1]);
    }
    return keys;
}

function extractI18nTKeys() {
    var jsFiles = getAllJsFiles(JS_DIR);
    var keys = [];
    var staticRegex = /I18n\.t\(\s*'([^']+)'\s*[,)]/g;
    var dynamicRegex = /I18n\.t\(\s*'([^']+)'\s*\+/g;
    jsFiles.forEach(function(file) {
        var content = fs.readFileSync(file, 'utf8');
        var dynamicPrefixes = {};
        var match;
        while ((match = dynamicRegex.exec(content)) !== null) {
            dynamicPrefixes[match[1]] = true;
        }
        while ((match = staticRegex.exec(content)) !== null) {
            if (!dynamicPrefixes[match[1]]) {
                keys.push({ key: match[1], file: path.relative(JS_DIR, file) });
            }
        }
    });
    return keys;
}

describe('i18n hardcoded text detection', function() {

    describe('HTML data-i18n keys exist in all locales', function() {
        var htmlKeys = extractDataI18nKeys();

        LOCALES.forEach(function(locale) {
            it('all HTML keys should exist in ' + locale + '.json', function() {
                var missing = [];
                htmlKeys.forEach(function(key) {
                    if (resolveKey(LOCALE_DATA[locale], key) === undefined) {
                        missing.push(key);
                    }
                });
                if (missing.length > 0) {
                    throw new Error('Missing keys in ' + locale + '.json:\n  ' + missing.join('\n  '));
                }
            });
        });
    });

    describe('JS I18n.t() keys exist in all locales', function() {
        var jsKeys = extractI18nTKeys();

        LOCALES.forEach(function(locale) {
            it('all JS keys should exist in ' + locale + '.json', function() {
                var missing = [];
                jsKeys.forEach(function(entry) {
                    if (resolveKey(LOCALE_DATA[locale], entry.key) === undefined) {
                        missing.push(entry.key + ' (in ' + entry.file + ')');
                    }
                });
                if (missing.length > 0) {
                    throw new Error('Missing keys in ' + locale + '.json:\n  ' + missing.join('\n  '));
                }
            });
        });
    });

    describe('no hardcoded strings in showToast calls', function() {
        it('showToast should always use I18n.t()', function() {
            var jsFiles = getAllJsFiles(JS_DIR);
            var violations = [];
            jsFiles.forEach(function(file) {
                var content = fs.readFileSync(file, 'utf8');
                var lines = content.split('\n');
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    if (line.indexOf('showToast(') === -1) continue;
                    if (line.indexOf('showToast(I18n.t(') !== -1) continue;
                    if (line.indexOf('showToast(msg') !== -1) continue;
                    if (line.indexOf('showToast(text') !== -1) continue;
                    if (line.indexOf('showToast(error') !== -1) continue;
                    var relFile = path.relative(path.join(__dirname, '..'), file);
                    violations.push(relFile + ':' + (i + 1) + ': ' + line.trim());
                }
            });
            if (violations.length > 0) {
                throw new Error('showToast() calls without I18n.t():\n  ' + violations.join('\n  '));
            }
        });
    });

    describe('locale files completeness', function() {
        it('all locales should have the same keys as en.json', function() {
            function flattenKeys(obj, prefix) {
                var keys = [];
                Object.keys(obj).forEach(function(k) {
                    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
                        keys = keys.concat(flattenKeys(obj[k], prefix ? prefix + '.' + k : k));
                    } else {
                        keys.push(prefix ? prefix + '.' + k : k);
                    }
                });
                return keys;
            }

            var metaKeys = ['iso639Codes', 'localeName', 'localeFlag', 'providerLangCode', 'contentTypePrefix', 'tntChannels'];
            var enKeys = flattenKeys(LOCALE_DATA.en, '').filter(function(k) {
                return !metaKeys.some(function(mk) { return k === mk || k.startsWith(mk + '.'); });
            });

            var failures = [];
            LOCALES.forEach(function(locale) {
                if (locale === 'en') return;
                var localeKeys = flattenKeys(LOCALE_DATA[locale], '').filter(function(k) {
                    return !metaKeys.some(function(mk) { return k === mk || k.startsWith(mk + '.'); });
                });
                var missing = enKeys.filter(function(k) { return localeKeys.indexOf(k) === -1; });
                if (missing.length > 0) {
                    failures.push(locale + '.json missing: ' + missing.join(', '));
                }
            });
            if (failures.length > 0) {
                throw new Error('Locale files are incomplete:\n  ' + failures.join('\n  '));
            }
        });
    });
});
