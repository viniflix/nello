import { fileExtensionForMime } from '@/lib/storage/uploadPolicy';
import { uploadVerifiedFile } from '@/lib/storage/verifiedUpload';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { useEffect, useState } from 'react';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  createPatientPhotoSignedUrl,
  getActiveCareEpisodeId,
} from '@/lib/supabase/progress-photos-queries';

/**
 * PhotoGallery - Componente para upload e exibição de fotos de progresso
 * @param {string} recordId - ID do registro antropométrico
 * @param {array} initialPhotos - Array inicial de URLs de fotos
 * @param {function} onPhotosChange - Callback quando as fotos mudam
 */
export default function PhotoGallery({ patientId, recordId, initialPhotos = [], onPhotosChange }) {
  const { toast } = useToast();
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Se não houver recordId (registro novo), desabilitar upload até salvar
  const isNewRecord = !recordId || recordId.toString().startsWith('temp-');

  useEffect(() => {
    let active = true;
    Promise.all((initialPhotos || []).map(async (value) => {
      const signed = await createPatientPhotoSignedUrl(value);
      return signed.data && signed.path ? { storagePath: signed.path, url: signed.data } : null;
    })).then((resolved) => {
      if (active) setPhotos(resolved.filter(Boolean));
    });
    return () => { active = false; };
  }, [initialPhotos]);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (isNewRecord) {
      toast({
        title: 'Atenção',
        description: 'Salve o registro primeiro antes de adicionar fotos.',
        variant: 'destructive'
      });
      event.target.value = '';
      return;
    }

    // Validar tipo de arquivo
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast({
        title: 'Erro',
        description: 'Selecione uma imagem JPG, PNG ou WebP.',
        variant: 'destructive'
      });
      return;
    }

    // Validar tamanho (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Erro',
        description: 'A imagem deve ter no máximo 5MB.',
        variant: 'destructive'
      });
      return;
    }

    setUploading(true);

    try {
      // Gerar nome único para o arquivo
      const episode = await getActiveCareEpisodeId(patientId);
      if (episode.error) throw episode.error;
      const fileExt = fileExtensionForMime(file.type);
      const filePath = `${patientId}/${episode.data}/anthropometry/${recordId}/${crypto.randomUUID()}.${fileExt}`;

      // Upload para Supabase Storage
      await uploadVerifiedFile('patient-photos', filePath, file);

      // Obter URL pública
      const signed = await createPatientPhotoSignedUrl(filePath);
      if (signed.error || !signed.data) {
        throw signed.error || new Error('Não foi possível autorizar a visualização da foto.');
      }

      // Adicionar à lista de fotos
      const newPhotos = [...photos, { storagePath: filePath, url: signed.data }];
      setPhotos(newPhotos);

      // Notificar mudança
      if (onPhotosChange) {
        onPhotosChange(newPhotos.map((photo) => photo.storagePath));
      }

      toast({
        title: 'Sucesso',
        description: 'Foto enviada com sucesso!'
      });
    } catch (error) {
      logDiagnostic('error', 'components/anthropometry/PhotoGallery.jsx:117', 'Erro ao fazer upload da foto:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível fazer upload da foto. Tente novamente.',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
      // Limpar input
      event.target.value = '';
    }
  };

  const handleDelete = async (_photo, index) => {
    try {
      // Extrair o caminho do arquivo da URL

      // Deletar do storage

        // Continuar mesmo se houver erro no storage (pode ser que o arquivo já não exista)

      // Remover da lista
      const newPhotos = photos.filter((_, i) => i !== index);
      setPhotos(newPhotos);

      // Notificar mudança
      if (onPhotosChange) {
        onPhotosChange(newPhotos.map((photo) => photo.storagePath));
      }

      toast({
        title: 'Sucesso',
        description: 'Foto removida com sucesso!'
      });
    } catch (error) {
      logDiagnostic('error', 'components/anthropometry/PhotoGallery.jsx:152', 'Erro ao deletar foto:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível remover a foto.',
        variant: 'destructive'
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ImageIcon className="w-5 h-5" />
          Fotos de Progresso
        </CardTitle>
        <CardDescription>
          Adicione fotos antes/depois para acompanhar a evolução do paciente
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Button */}
        <div className="flex items-center gap-4">
          <label htmlFor="photo-upload">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              disabled={uploading || isNewRecord}
              asChild
            >
              <span>
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Adicionar Foto
                  </>
                )}
              </span>
            </Button>
          </label>
          {isNewRecord && (
            <span className="text-xs text-muted-foreground">
              Salve o registro primeiro
            </span>
          )}
          <input
            id="photo-upload"
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
            disabled={uploading}
          />
          <span className="text-sm text-muted-foreground">
            Máximo 5MB por foto
          </span>
        </div>

        {/* Photo Grid */}
        {photos.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((photo, index) => (
              <div
                key={photo.storagePath || index}
                className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-muted"
              >
                <img
                  src={photo.url}
                  alt={`Foto ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(photo, index)}
                    className="opacity-100"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Remover
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-muted rounded-lg">
            <ImageIcon className="w-12 h-12 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Nenhuma foto adicionada ainda
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Clique em "Adicionar Foto" para começar
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

