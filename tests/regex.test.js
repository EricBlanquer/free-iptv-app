/**
 * Tests for Regex patterns
 * Bug: titles like "You've Got Mail" were displayed as "Ve Got Mail"
 * because the regex matched "You " as a language prefix
 */

// Copy of Regex patterns from js/regex.js for testing
var Regex = {
    // Match language prefix: requires pipe separator | to avoid matching words like "Ant-Man", "One-Punch"
    categoryPrefix: /^(?:(?:EU|AF|24\/7)[-\s]*\|?\s*)?([A-Za-z]{2,3})[-\s]*\|\s*/i,
    // Only match known language codes (ISO 639-1/2) to avoid matching words like "You", "The", etc.
    streamPrefix: /^(?:24\/7\|\s*)?(?:(?:FR|EN|DE|ES|IT|PT|NL|PL|RU|TR|AR|ZH|JA|KO|HI|TH|VI|ID|MS|FIL|SV|NO|DA|FI|CS|SK|HU|RO|BG|HR|SR|SL|UK|EL|HE|FA|UR|BN|TA|TE|MR|GU|KN|ML|PA|NE|SI|MY|KM|LO|MN|KA|AM|SW|ZU|XH|AF|EU|CA|GL|CY|GA|GD|MT|IS|LB|MK|SQ|BS|ET|LV|LT|AZ|KK|UZ|TG|KY|TK|PS|SD|KU|EO|LA|VFF|VF|VO|VOST|VOSTFR|MULTI)[-:\s]+)/i,
};

describe('Regex patterns', () => {
    describe('categoryPrefix - should not match common words', () => {
        it('should NOT match "You ve Got Mail" (You is not a language code)', () => {
            var title = 'You ve Got Mail';
            var match = title.match(Regex.categoryPrefix);
            expect(match).toBeNull();
        });

        it('should NOT match "The Matrix" (The is not a language code)', () => {
            var title = 'The Matrix';
            var match = title.match(Regex.categoryPrefix);
            expect(match).toBeNull();
        });

        it('should NOT match "Two and a Half Men" (Two is not a language code)', () => {
            var title = 'Two and a Half Men';
            var match = title.match(Regex.categoryPrefix);
            expect(match).toBeNull();
        });

        it('should NOT match "Ant-Man" (hyphenated word, not a prefix)', () => {
            var title = 'Ant-Man and the Wasp';
            var match = title.match(Regex.categoryPrefix);
            expect(match).toBeNull();
        });

        it('should NOT match "One-Punch Man" (hyphenated word, not a prefix)', () => {
            var title = 'One-Punch Man';
            var match = title.match(Regex.categoryPrefix);
            expect(match).toBeNull();
        });

        it('should NOT match "All-Time High" (hyphenated word, not a prefix)', () => {
            var title = 'All-Time High (2023)';
            var match = title.match(Regex.categoryPrefix);
            expect(match).toBeNull();
        });

        it('should match "FR| Title" (language code with pipe separator)', () => {
            var title = 'FR| Title';
            var match = title.match(Regex.categoryPrefix);
            expect(match).not.toBeNull();
            expect(match[1]).toBe('FR');
        });

        it('should match "FR-| Title" (language code with dash and pipe)', () => {
            var title = 'FR-| Title';
            var match = title.match(Regex.categoryPrefix);
            expect(match).not.toBeNull();
            expect(match[1]).toBe('FR');
        });

        it('should NOT match "FR- Title" (dash alone is not enough, needs pipe)', () => {
            var title = 'FR- Title';
            var match = title.match(Regex.categoryPrefix);
            expect(match).toBeNull();
        });

        it('should match "EU|FR| Title" (region + language with separators)', () => {
            var title = 'EU|FR| Title';
            var match = title.match(Regex.categoryPrefix);
            expect(match).not.toBeNull();
            expect(match[1]).toBe('FR');
        });
    });

    describe('streamPrefix - should only match known language codes', () => {
        it('should NOT match "You ve Got Mail" (You is not a known code)', () => {
            var title = 'You ve Got Mail';
            var match = title.match(Regex.streamPrefix);
            expect(match).toBeNull();
        });

        it('should NOT match "The Matrix" (The is not a known code)', () => {
            var title = 'The Matrix';
            var match = title.match(Regex.streamPrefix);
            expect(match).toBeNull();
        });

        it('should NOT match "Two and a Half Men" (Two is not a known code)', () => {
            var title = 'Two and a Half Men';
            var match = title.match(Regex.streamPrefix);
            expect(match).toBeNull();
        });

        it('should match "FR Titre" (FR is a known language code)', () => {
            var title = 'FR Titre';
            var match = title.match(Regex.streamPrefix);
            expect(match).not.toBeNull();
        });

        it('should match "fr Titre" (lowercase fr is also valid)', () => {
            var title = 'fr Titre';
            var match = title.match(Regex.streamPrefix);
            expect(match).not.toBeNull();
        });

        it('should match "EN: Title" (EN with colon separator)', () => {
            var title = 'EN: Title';
            var match = title.match(Regex.streamPrefix);
            expect(match).not.toBeNull();
        });

        it('should match "DE-Titel" (DE with dash separator)', () => {
            var title = 'DE-Titel';
            var match = title.match(Regex.streamPrefix);
            expect(match).not.toBeNull();
        });

        it('should match "VOSTFR Title" (VOSTFR is in the allowed list)', () => {
            var title = 'VOSTFR Title';
            var match = title.match(Regex.streamPrefix);
            expect(match).not.toBeNull();
        });

        it('should match "VF Titre" (VF is in the allowed list)', () => {
            var title = 'VF Titre';
            var match = title.match(Regex.streamPrefix);
            expect(match).not.toBeNull();
        });

        it('should match "24/7| FR Title" (24/7 prefix with language)', () => {
            var title = '24/7| FR Title';
            var match = title.match(Regex.streamPrefix);
            expect(match).not.toBeNull();
        });

        it('should only remove prefix once, not recursively', () => {
            var title = 'FR EN Title';
            // First match removes "FR "
            var match1 = title.match(Regex.streamPrefix);
            expect(match1).not.toBeNull();
            var cleaned = title.replace(Regex.streamPrefix, '');
            expect(cleaned).toBe('EN Title');
            // The pattern doesn't have 'g' flag, so it only matches once
        });
    });
});
