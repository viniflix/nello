import { lazy } from 'react';

const CHUNK_ERROR_PATTERN = /(?:Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk \d+ failed|not a valid JavaScript MIME type|Expected a JavaScript(?:-or-Wasm)? module script|module script.+MIME type)/i;

export const isChunkLoadError = (error) => CHUNK_ERROR_PATTERN.test(String(error?.message || error || ''));

/**
 * Recupera automaticamente abas que ficaram abertas durante um deploy.
 * O navegador antigo pode apontar para um chunk que deixou de existir; nesse
 * caso, uma única recarga obtém o HTML e o manifesto da versão atual.
 */
export const lazyWithReload = (importer, componentKey) => lazy(async () => {
    const release = import.meta.env.VITE_APP_RELEASE || 'development';
    const reloadKey = `nello:chunk-reload:${release}:${componentKey}`;

    try {
        const module = await importer();
        window.sessionStorage.removeItem(reloadKey);
        return module;
    } catch (error) {
        if (isChunkLoadError(error) && window.sessionStorage.getItem(reloadKey) !== '1') {
            window.sessionStorage.setItem(reloadKey, '1');
            window.location.reload();
            return new Promise(() => {});
        }

        throw error;
    }
});
