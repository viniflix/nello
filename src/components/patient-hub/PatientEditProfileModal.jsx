import React, { useRef, useState } from "react";
import { Camera, Loader2, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/customSupabaseClient";
import { updatePatientProfile } from "@/lib/supabase/patient-queries";
import ProgressivePatientProfile from "@/features/clinical-records/components/ProgressivePatientProfile";
import LegalGuardianCard from "@/features/clinical-records/components/LegalGuardianCard";
import {
  revokePatientLegalGuardian,
  savePatientLegalGuardian,
  updatePatientProgressiveProfile,
} from "@/features/clinical-records/api/record-foundation-queries";

export default function PatientEditProfileModal({
  isOpen,
  onClose,
  patientData,
  writableEpisodeId = null,
  profileRequirements = [],
  legalGuardians = [],
  onSaveSuccess,
}) {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const episodeId = writableEpisodeId;
  const isMinor = profileRequirements.includes("legal_guardian");
  const refreshAfter = async (operation) => {
    const result = await operation;
    if (!result?.error) await onSaveSuccess?.();
    return result;
  };
  const changePhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !patientData?.id) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      toast({
        title: "Erro",
        description: "Selecione uma imagem de até 5 MB.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    try {
      const path = `${patientData.id}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const saved = await updatePatientProfile(patientData.id, {
        avatar_url: data.publicUrl,
      });
      if (saved.error) throw saved.error;
      await onSaveSuccess?.();
      toast({ title: "Sucesso", description: "Foto atualizada." });
    } catch {
      setPreviewUrl(null);
      toast({
        title: "Erro",
        description: "Não foi possível salvar a foto.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar perfil do paciente</DialogTitle>
          <DialogDescription>
            Complete os dados progressivamente conforme eles se tornarem
            necessários.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
        <button
          type="button"
          disabled={!writableEpisodeId}
          aria-label="Alterar foto do paciente"
            onClick={() => fileInputRef.current?.click()}
            className="relative h-16 w-16 overflow-hidden rounded-full border-2 border-primary/20 bg-muted"
          >
            {uploading ? (
              <Loader2 className="m-auto h-6 w-6 animate-spin" />
            ) : previewUrl || patientData?.avatar_url ? (
              <img
                src={previewUrl || patientData.avatar_url}
                alt="Avatar do paciente"
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="m-auto h-8 w-8" />
            )}
            <Camera className="absolute bottom-1 right-1 h-4 w-4" />
          </button>
          <div>
            <p className="font-semibold">Foto de perfil</p>
            <p className="text-xs text-muted-foreground">Imagem de até 5 MB.</p>
          </div>
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={changePhoto}
          />
        </div>
        <ProgressivePatientProfile
          patient={patientData}
          requirements={profileRequirements}
          readOnly={!writableEpisodeId}
          onSave={(changes) =>
            refreshAfter(
              updatePatientProgressiveProfile(
                patientData.id,
                changes,
                "nutritionist",
              ),
            )
          }
        />
        <LegalGuardianCard
          patientId={patientData.id}
          episodeId={episodeId}
          isMinor={isMinor}
          guardians={legalGuardians}
          onSave={(patientId, currentEpisodeId, payload) =>
            refreshAfter(
              savePatientLegalGuardian(patientId, currentEpisodeId, payload),
            )
          }
          onRevoke={(guardianId, reason) =>
            refreshAfter(revokePatientLegalGuardian(guardianId, reason))
          }
        />
      </DialogContent>
    </Dialog>
  );
}
