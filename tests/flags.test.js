/**
 * Tests for js/flags.js
 * Uses eval to load the module - required because the source uses global
 * function declarations (not CommonJS), same pattern as tests/storage.test.js
 */

window.log = jest.fn();

const fs = require('fs');
const flagsCode = fs.readFileSync('./js/flags.js', 'utf8');

// Load module - required because source is not CommonJS (see tests/storage.test.js)
eval(flagsCode);

describe('CountryFlags object', () => {
    it('should be defined', () => {
        expect(CountryFlags).toBeDefined();
        expect(typeof CountryFlags).toBe('object');
    });

    it('should contain standard ISO codes', () => {
        expect(CountryFlags['FR']).toBeDefined();
        expect(CountryFlags['US']).toBeDefined();
        expect(CountryFlags['DE']).toBeDefined();
        expect(CountryFlags['GB']).toBeDefined();
    });

    it('should contain special codes', () => {
        expect(CountryFlags['INT']).toBeDefined();
        expect(CountryFlags['INTL']).toBeDefined();
        expect(CountryFlags['VO']).toBeDefined();
        expect(CountryFlags['MULTI']).toBeDefined();
    });

    it('should contain common aliases', () => {
        expect(CountryFlags['UK']).toBe(CountryFlags['GB']);
        expect(CountryFlags['USA']).toBe(CountryFlags['US']);
        expect(CountryFlags['EN']).toBe(CountryFlags['GB']);
        expect(CountryFlags['ENG']).toBe(CountryFlags['GB']);
    });
});

describe('getFlag', () => {
    it('should return flag for known uppercase code', () => {
        expect(getFlag('FR')).toBe(CountryFlags['FR']);
        expect(getFlag('US')).toBe(CountryFlags['US']);
    });

    it('should be case insensitive', () => {
        expect(getFlag('fr')).toBe(CountryFlags['FR']);
        expect(getFlag('Fr')).toBe(CountryFlags['FR']);
        expect(getFlag('us')).toBe(CountryFlags['US']);
    });

    it('should return null for unknown codes', () => {
        expect(getFlag('ZZ')).toBeNull();
        expect(getFlag('UNKNOWN')).toBeNull();
        expect(getFlag('XX')).toBeNull();
    });

    it('should return null for falsy input', () => {
        expect(getFlag(null)).toBeNull();
        expect(getFlag(undefined)).toBeNull();
        expect(getFlag('')).toBeNull();
    });

    it('should handle special codes case-insensitively', () => {
        expect(getFlag('int')).toBe(CountryFlags['INT']);
        expect(getFlag('multi')).toBe(CountryFlags['MULTI']);
        expect(getFlag('vostfr')).toBe(CountryFlags['VOSTFR']);
    });

    it('should handle alias codes', () => {
        expect(getFlag('uk')).toBe(CountryFlags['GB']);
        expect(getFlag('USA')).toBe(CountryFlags['US']);
        expect(getFlag('eng')).toBe(CountryFlags['GB']);
    });

    it('should return distinct flags for different countries', () => {
        var fr = getFlag('FR');
        var de = getFlag('DE');
        var us = getFlag('US');
        expect(fr).not.toBe(de);
        expect(fr).not.toBe(us);
        expect(de).not.toBe(us);
    });
});
