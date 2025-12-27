/**
 * Tests for Provider API Client
 */

// Mock fetch globally
global.fetch = jest.fn();

// Mock window.log
window.log = jest.fn();

// Load the ProviderAPI class
const fs = require('fs');
const providerCode = fs.readFileSync('./js/provider.js', 'utf8');
eval(providerCode);

describe('ProviderAPI', () => {
    let api;

    beforeEach(() => {
        api = new ProviderAPI('http://example.com', 'user', 'pass');
        fetch.mockClear();
    });

    describe('constructor', () => {
        it('should initialize with correct properties', () => {
            expect(api.server).toBe('http://example.com');
            expect(api.username).toBe('user');
            expect(api.password).toBe('pass');
            expect(api.maxRetries).toBe(3);
        });

        it('should remove trailing slash from server URL', () => {
            const api2 = new ProviderAPI('http://example.com/', 'user', 'pass');
            expect(api2.server).toBe('http://example.com');
        });
    });

    describe('getUrl', () => {
        it('should return original URL when tizen is defined', () => {
            global.tizen = {};
            const api2 = new ProviderAPI('http://example.com', 'user', 'pass');
            expect(api2.getUrl('http://test.com')).toBe('http://test.com');
            delete global.tizen;
        });

        it('should return proxied URL when tizen is undefined', () => {
            const url = api.getUrl('http://test.com');
            expect(url).toContain('allorigins.win');
            expect(url).toContain(encodeURIComponent('http://test.com'));
        });
    });

    describe('authenticate', () => {
        it('should authenticate successfully with valid credentials', async () => {
            const mockResponse = {
                ok: true,
                json: () => Promise.resolve({ user_info: { username: 'user' } })
            };
            fetch.mockResolvedValue(mockResponse);

            const result = await api.authenticate();

            expect(result.user_info.username).toBe('user');
            expect(api.authData).toEqual(result);
        });

        it('should throw error on invalid credentials', async () => {
            const mockResponse = {
                ok: true,
                json: () => Promise.resolve({})
            };
            fetch.mockResolvedValue(mockResponse);

            await expect(api.authenticate()).rejects.toThrow('Invalid credentials');
        });

        it('should throw error on network failure', async () => {
            fetch.mockRejectedValue(new Error('Network error'));

            await expect(api.authenticate()).rejects.toThrow();
        });
    });

    describe('fetchWithRetry', () => {
        it('should retry on failure', async () => {
            api.retryDelay = 10; // Speed up tests
            fetch
                .mockRejectedValueOnce(new Error('Fail 1'))
                .mockRejectedValueOnce(new Error('Fail 2'))
                .mockResolvedValueOnce({ ok: true });

            const result = await api.fetchWithRetry('http://test.com');

            expect(result.ok).toBe(true);
            expect(fetch).toHaveBeenCalledTimes(3);
        });

        it('should throw after max retries', async () => {
            api.retryDelay = 10;
            fetch.mockRejectedValue(new Error('Persistent failure'));

            await expect(api.fetchWithRetry('http://test.com')).rejects.toThrow('Persistent failure');
            expect(fetch).toHaveBeenCalledTimes(3);
        });
    });

    describe('stream URLs', () => {
        it('should generate correct live stream URL', () => {
            const url = api.getLiveStreamUrl('123');
            expect(url).toBe('http://example.com/live/user/pass/123.ts');
        });

        it('should generate correct VOD stream URL', () => {
            const url = api.getVodStreamUrl('456');
            expect(url).toBe('http://example.com/movie/user/pass/456.mkv');
        });

        it('should generate correct series stream URL', () => {
            const url = api.getSeriesStreamUrl('789');
            expect(url).toBe('http://example.com/series/user/pass/789.mkv');
        });

        it('should allow custom extension', () => {
            const url = api.getLiveStreamUrl('123', 'm3u8');
            expect(url).toBe('http://example.com/live/user/pass/123.m3u8');
        });
    });
});
