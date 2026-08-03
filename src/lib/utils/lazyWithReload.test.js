import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from './lazyWithReload';

describe('isChunkLoadError', () => {
    it.each([
        'Failed to fetch dynamically imported module: /assets/page-old.js',
        'Importing a module script failed.',
        'ChunkLoadError: Loading chunk 42 failed',
    ])('reconhece falhas causadas por chunks removidos em deploys', (message) => {
        expect(isChunkLoadError(new TypeError(message))).toBe(true);
    });

    it('não confunde erros funcionais com falhas de atualização', () => {
        expect(isChunkLoadError(new Error('meal_time_invalid'))).toBe(false);
    });
});
