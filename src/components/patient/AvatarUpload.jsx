import { useState, useRef } from 'react';
import { Camera, User, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback } from 'react';

/**
 * AvatarUpload - Componente para exibir e fazer upload de foto de perfil
 */
export default function AvatarUpload({ size = 'large', showChangeButton = true }) {
  const { user, updateUserProfile } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null); // For optimistic update
  const fileInputRef = useRef(null);

  const sizeClasses = {
    small: 'w-12 h-12',
    medium: 'w-20 h-20',
    large: 'w-32 h-32'
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validar tipo de arquivo
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Erro',
          description: 'Por favor, selecione uma imagem válida.',
          variant: 'destructive'
        });
        return;
      }

      // Validar tamanho (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: 'Erro',
          description: 'A imagem deve ter no máximo 5MB.',
          variant: 'destructive'
        });
        return;
      }

      setUploading(true);

      // Optimistic update: Show preview immediately
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);

      // Remove old avatar if exists
      const { data: existingFiles } = await supabase.storage
        .from('avatars')
        .list(user.id);
      
      if (existingFiles && existingFiles.length > 0) {
        const filesToRemove = existingFiles.map(f => `${user.id}/${f.name}`);
        await supabase.storage.from('avatars').remove(filesToRemove);
      }

      // Create unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Upload to Supabase Storage (avatars bucket)
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        // Revert optimistic update on error
        setPreviewUrl(null);
        URL.revokeObjectURL(objectUrl);
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update user profile in database
      const { data: updatedProfile, error: updateError } = await supabase
        .from('user_profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)
        .select()
        .single();

      if (updateError) {
        // Revert optimistic update on error
        setPreviewUrl(null);
        URL.revokeObjectURL(objectUrl);
        throw updateError;
      }

      // Update context with new profile data (if function exists)
      if (updateUserProfile) {
        updateUserProfile(updatedProfile);
      }

      // Clean up object URL
      URL.revokeObjectURL(objectUrl);
      setPreviewUrl(null);

      toast({
        title: 'Sucesso!',
        description: 'Foto de perfil atualizada com sucesso.'
      });
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível atualizar a foto de perfil.',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
      // Clear input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getInitials = () => {
    const name = user?.profile?.name || 'U';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name[0].toUpperCase();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <Avatar className={sizeClasses[size]}>
          <AvatarImage 
            src={previewUrl || user?.profile?.avatar_url} 
            alt={user?.profile?.name}
          />
          <AvatarFallback className="bg-primary/10 text-primary text-2xl font-semibold">
            {uploading ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              getInitials()
            )}
          </AvatarFallback>
        </Avatar>

        {showChangeButton && (
          <button
            onClick={handleFileSelect}
            disabled={uploading}
            className="absolute bottom-0 right-0 p-2 bg-primary text-white rounded-full shadow-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Camera className="w-4 h-4" />
          </button>
        )}
      </div>

      {showChangeButton && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleFileSelect}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Camera className="w-4 h-4 mr-2" />
              Alterar Foto
            </>
          )}
        </Button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
