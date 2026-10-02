import { lazy } from 'react';

const CHUNK_ERROR_PATTERN = /(?:Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk \d+ failed|not a valid JavaScript MIME type|Expected a JavaScript(?:-or-Wasm)? module script|module script.+MIME type)/i;

export const isChunkLoadError = (error) => CHUNK_ERROR_PATTERN.test(String(error?.message || error || ''));

/** Chunk errors are recovered explicitly without automatically discarding drafts. */
export const lazyWithReload = (importer) => lazy(async () => {
    try {
        const module = await importer();
        return module;
    } catch (error) {
        throw error;
    }
});

// Explicit consent, once per release across all routes; never auto-reload drafts.
export function requestReleaseReload({release=import.meta.env.VITE_APP_RELEASE || 'development',storage,reload=()=>window.location.reload(),confirm=()=>window.confirm('Atualizar a página pode descartar alterações ainda não salvas. Deseja continuar?'),onBlocked=()=>{}}={}) {
    const key=`nello:chunk-reload:${release}`;
    try { storage=storage||window.sessionStorage;if(storage.getItem(key)==='1'){onBlocked();return false;} }catch{onBlocked();return false;}
    try { if(!confirm())return false; }catch{onBlocked();return false;}
    try { storage.setItem(key,'1'); }catch{onBlocked();return false;}
    try { reload();return true; }catch{onBlocked();return false;}
}
