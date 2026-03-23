/**
 * Utilidades para ativos de PDF (logos, imagens, etc)
 */

// URL da logo oficial no Supabase Storage
export const HIPOZERO_LOGO_URL = 'https://afyoidxrshkmplxhcyeh.supabase.co/storage/v1/object/public/IDV/HIPOZERO%20(2).png';

/**
 * Carrega a logo do projeto de forma robusta para uso em PDFs.
 * Inclui timeout e tratamento de erros para evitar travamentos na geração do PDF.
 * 
 * @param {number} timeoutMs - Tempo máximo de espera em milissegundos (padrão 3000ms)
 * @returns {Promise<string|null>} Base64 da imagem ou null se falhar
 */
export async function loadLogo(timeoutMs = 3000) {
    try {
        // Usar AbortController para implementar timeout no fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(HIPOZERO_LOGO_URL, {
            signal: controller.signal,
            cache: 'force-cache' // Tentar usar cache do navegador
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Falha ao buscar logo: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        
        return await new Promise((resolve) => {
            const reader = new FileReader();
            
            // Handler para sucesso
            reader.onloadend = () => {
                resolve(reader.result);
            };

            // Handler para erro
            reader.onerror = () => {
                console.warn('Erro no FileReader ao carregar logo');
                resolve(null);
            };

            // Timeout de segurança para o FileReader também
            const fileTimeout = setTimeout(() => {
                console.warn('Timeout no FileReader ao carregar logo');
                resolve(null);
            }, 1000);

            reader.onload = () => clearTimeout(fileTimeout);
            
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('Timeout ao carregar logo do PDF (3s)');
        } else {
            console.warn('Erro ao carregar logo para o PDF:', error.message);
        }
        return null; // Retorna null em vez de travar o processo
    }
}
