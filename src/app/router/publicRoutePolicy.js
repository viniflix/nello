export const normalizeRoutePath = pathname => String(pathname || '/').replace(/\/+$/, '') || '/';
const publicPages=new Set(['/', '/status','/pesquisa','/recursos','/para-pacientes','/termos','/privacidade','/ajuda','/seguranca']);
const authCallbacks=new Set(['/auth/verify','/auth/v1/verify','/convite','/update-password']);
// Exact route shapes only: this never authorizes a portal or a private read.
export function isSessionIndependentPath(pathname) {
 const path=normalizeRoutePath(pathname);
 return isPublicContentPath(path)||authCallbacks.has(path);
}
export function isPublicContentPath(pathname) {
 const path=normalizeRoutePath(pathname);
 return publicPages.has(path)||/^\/f\/[^/]+$/.test(path)||/^\/verificar-documento(?:\/[^/]+)?$/.test(path);
}
export function preservesPublicDraft(pathname) {
 const path=normalizeRoutePath(pathname);
 return path==='/pesquisa'||/^\/f\/[^/]+$/.test(path)||/^\/verificar-documento(?:\/[^/]+)?$/.test(path);
}
