import { useState } from 'react';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';

/**
 * PhotoGallery - Componente para upload e exibição de fotos de progresso
 * @param {string} recordId - ID do registro antropométrico
 * @param {array} initialPhotos - Array inicial de URLs de fotos
 * @param {function} onPhotosChange - Callback quando as fotos mudam
 */
export default function PhotoGallery({ recordId, initialPhotos = [], onPhotosChange }) {
  const { toast } = useToast();
  const [photos, setPhotos] = useState(initialPhotos || []);
  const [uploading, setUploading] = useState(false);

  // Se não houver recordId (registro novo), desabilitar upload até salvar
  const isNewRecord = !recordId || recordId.toString().startsWith('temp-');

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
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Erro',
        description: 'Por favor, selecione um arquivo de imagem.',
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
      const fileExt = file.name.split('.').pop();
      const fileName = `${recordId}-${Date.now()}.${fileExt}`;
      const filePath = `${recordId}/${fileName}`;

      // Upload para Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('patient-photos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        // Se o bucket não existir, tentar criar ou usar fallback
        console.error('Erro no upload:', uploadError);
        throw uploadError;
      }

      // Obter URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('patient-photos')
        .getPublicUrl(filePath);

      // Adicionar à lista de fotos
      const newPhotos = [...photos, publicUrl];
      setPhotos(newPhotos);

      // Notificar mudança
      if (onPhotosChange) {
        onPhotosChange(newPhotos);
      }

      toast({
        title: 'Sucesso',
        description: 'Foto enviada com sucesso!'
      });
    } catch (error) {
      console.error('Erro ao fazer upload da foto:', error);
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

  const handleDelete = async (photoUrl, index) => {
    try {
      // Extrair o caminho do arquivo da URL
      const urlParts = photoUrl.split('/');
      const filePath = urlParts.slice(urlParts.indexOf('patient-photos') + 1).join('/');

      // Deletar do storage
      const { error: deleteError } = await supabase.storage
        .from('patient-photos')
        .remove([filePath]);

      if (deleteError) {
        console.error('Erro ao deletar foto:', deleteError);
        // Continuar mesmo se houver erro no storage (pode ser que o arquivo já não exista)
      }

      // Remover da lista
      const newPhotos = photos.filter((_, i) => i !== index);
      setPhotos(newPhotos);

      // Notificar mudança
      if (onPhotosChange) {
        onPhotosChange(newPhotos);
      }

      toast({
        title: 'Sucesso',
        description: 'Foto removida com sucesso!'
      });
    } catch (error) {
      console.error('Erro ao deletar foto:', error);
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
            {photos.map((photoUrl, index) => (
              <div
                key={index}
                className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-muted"
              >
                <img
                  src={photoUrl}
                  alt={`Foto ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(photoUrl, index)}
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

