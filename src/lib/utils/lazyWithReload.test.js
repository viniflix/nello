import { describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, requestReleaseReload } from './lazyWithReload';

describe('isChunkLoadError', () => {
    it('requires confirmation and permits only one reload per release across routes',()=>{
      const storage=new Map(),reload=vi.fn(),confirm=vi.fn(()=>true);
      const options={release:'test',storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},reload,confirm};
      expect(requestReleaseReload({...options,confirm:()=>false})).toBe(false);
      expect(reload).not.toHaveBeenCalled();
      expect(requestReleaseReload(options)).toBe(true);
      expect(requestReleaseReload(options)).toBe(false);
      expect(reload).toHaveBeenCalledTimes(1);
      expect(requestReleaseReload({...options,release:'next'})).toBe(true);
    });
    it('cannot create a reload loop when session storage is blocked',()=>{
      const reload=vi.fn();expect(requestReleaseReload({storage:{getItem:()=>{throw Error('blocked')}},reload,confirm:()=>true})).toBe(false);expect(reload).not.toHaveBeenCalled();
    });
    it.each([
        'Failed to fetch dynamically imported module: /assets/page-old.js',
        'Importing a module script failed.',
        'Error loading dynamically imported module: /assets/page-old.js',
        'ChunkLoadError: Loading chunk 42 failed',
        "'text/html' is not a valid JavaScript MIME type.",
        'Expected a JavaScript module script but the server responded with a MIME type of "text/html".',
    ])('reconhece falhas causadas por chunks removidos em deploys', (message) => {
        expect(isChunkLoadError(new TypeError(message))).toBe(true);
    });

    it('não confunde erros funcionais com falhas de atualização', () => {
        expect(isChunkLoadError(new Error('meal_time_invalid'))).toBe(false);
    });
});
