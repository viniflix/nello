import React, { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const statusLabels = {
  active: "Ativo",
  replaced: "Substituído",
  revoked: "Revogado",
};
const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(value),
      )
    : "sem término";
const emptyGuardianForm = () => ({
  name: "",
  relationship: "",
  phone: "",
  email: "",
  valid_from: "",
  valid_until: "",
  consent_recorded: false,
  consent_version: "",
  consent_recorded_at: "",
  consent_evidence: "",
  replacement_reason: "",
});

export default function LegalGuardianCard({
  patientId,
  episodeId,
  viewedEpisodeId = null,
  isMinor = false,
  guardians = [],
  onSave,
  onRevoke,
}) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyGuardianForm);
  const [revoking, setRevoking] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const active = guardians.find((guardian) => guardian.status === "active");
  const resetForm = () => {
    setForm(emptyGuardianForm());
    setError("");
  };
  useEffect(() => {
    if (!adding) {
      setForm(emptyGuardianForm());
      setError("");
    }
  }, [adding]);
  const save = async (event) => {
    event.preventDefault();
    setError("");
    if (active && !form.replacement_reason.trim()) {
      setError("Motivo da substituição é obrigatório.");
      return;
    }
    if (
      form.consent_recorded &&
      (!form.consent_version.trim() ||
        !form.consent_recorded_at ||
        !form.consent_evidence.trim())
    ) {
      setError("Complete versão, data e evidência do consentimento.");
      return;
    }
    const payload = {
      name: form.name,
      relationship: form.relationship,
      contact: { phone: form.phone.trim(), email: form.email.trim() },
      ...(form.valid_from ? { valid_from: form.valid_from } : {}),
      ...(form.valid_until ? { valid_until: form.valid_until } : {}),
      consent: {
        recorded: form.consent_recorded,
        ...(form.consent_recorded
          ? {
              version: form.consent_version.trim(),
              recorded_at: form.consent_recorded_at,
              evidence: form.consent_evidence.trim(),
            }
          : {}),
      },
      ...(active ? { reason: form.replacement_reason.trim() } : {}),
    };
    setBusy(true);
    const result = await onSave?.(patientId, episodeId, payload);
    setBusy(false);
    if (result?.error) setError("Não foi possível salvar o responsável.");
    else {
      setAdding(false);
      resetForm();
      setSuccess(
        active
          ? "Responsável substituído com sucesso."
          : "Responsável salvo com sucesso.",
      );
    }
  };
  const revoke = async () => {
    if (!reason.trim()) {
      setError("Informe o motivo da revogação.");
      return;
    }
    setBusy(true);
    const result = await onRevoke?.(revoking.id, reason.trim());
    setBusy(false);
    if (result?.error) setError("Não foi possível revogar o responsável.");
    else {
      setRevoking(null);
      setReason("");
      setSuccess("Responsável revogado com sucesso.");
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Responsável legal</CardTitle>
        <p className="text-sm text-muted-foreground">
          Vínculo válido somente para o episódio de cuidado atual.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!episodeId && (
          <p
            role="status"
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {viewedEpisodeId
              ? "Este episódio está encerrado e disponível somente para leitura."
              : "Inicie um episódio de cuidado para registrar um responsável legal."}
          </p>
        )}
        {isMinor && !active && (
          <p
            role="alert"
            className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Menor sem responsável legal ativo.
          </p>
        )}
        {!isMinor && (
          <p
            role="alert"
            className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-300"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            O paciente já atingiu a maioridade legal (≥ 18 anos). A presença de um responsável não é obrigatória.
          </p>
        )}
        {guardians.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum responsável legal registrado neste episódio.
          </p>
        )}
        {guardians.map((g) => (
          <div
            key={g.id}
            className="flex min-w-0 flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="break-words font-medium">{g.name}</p>
              <p className="text-xs text-muted-foreground">
                {g.relationship || "Relação não informada"} ·{" "}
                {statusLabels[g.status] || g.status}
              </p>
              <p className="text-xs text-muted-foreground">
                Período: {formatDate(g.valid_from)} até{" "}
                {formatDate(g.valid_until)}
              </p>
              <p className="text-xs text-muted-foreground">
                {g.consent?.recorded
                  ? "Consentimento registrado"
                  : "Consentimento não registrado"}
              </p>
            </div>
            {g.status === "active" && (
              <AlertDialog
                open={revoking?.id === g.id}
                onOpenChange={(open) => {
                  setRevoking(open ? g : null);
                  if (!open) {
                    setReason("");
                    setError("");
                  }
                }}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`Revogar ${g.name}`}
                    className="w-full shrink-0 sm:w-auto"
                  >
                    Revogar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revogar responsável</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação mantém o histórico do episódio e exige uma
                      justificativa.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div>
                    <Label htmlFor={`revoke-reason-${g.id}`}>
                      Motivo da revogação
                    </Label>
                    <Input
                      id={`revoke-reason-${g.id}`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                  {error && (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        revoke();
                      }}
                      disabled={busy}
                    >
                      Confirmar revogação
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        ))}
        {!adding && (
          <Button
            type="button"
            disabled={!episodeId}
            onClick={() => setAdding(true)}
          >
            {active ? "Substituir responsável" : "Adicionar responsável"}
          </Button>
        )}
        {adding && (
          <form onSubmit={save} className="space-y-4 rounded-lg border bg-zinc-50/50 p-4 dark:bg-zinc-900/50">
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              <div className="sm:col-span-2">
                <Label htmlFor="guardian-name">Nome do responsável</Label>
                <Input
                  id="guardian-name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="guardian-relation">Relação</Label>
                <Input
                  id="guardian-relation"
                  required
                  value={form.relationship}
                  onChange={(e) =>
                    setForm({ ...form, relationship: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="guardian-phone">Telefone</Label>
                <Input id="guardian-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="sm:col-span-2 md:col-span-2">
                <Label htmlFor="guardian-email">E-mail</Label>
                <Input id="guardian-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="guardian-from">Início do período</Label>
                <Input
                  id="guardian-from"
                  type="date"
                  value={form.valid_from}
                  onChange={(e) =>
                    setForm({ ...form, valid_from: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="guardian-until">Fim do período</Label>
                <Input
                  id="guardian-until"
                  type="date"
                  value={form.valid_until}
                  onChange={(e) =>
                    setForm({ ...form, valid_until: e.target.value })
                  }
                />
              </div>
            </div>
            
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.consent_recorded}
                  onChange={(e) =>
                    setForm({ ...form, consent_recorded: e.target.checked })
                  }
                  className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600"
                />
                <span className="text-sm font-medium">Consentimento registrado</span>
              </label>
              
              {form.consent_recorded && (
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 pl-6">
                  <div>
                    <Label htmlFor="guardian-consent-version">Versão do consentimento</Label>
                    <Input id="guardian-consent-version" required value={form.consent_version} onChange={(e) => setForm({ ...form, consent_version: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="guardian-consent-date">Data do registro</Label>
                    <Input id="guardian-consent-date" required type="datetime-local" value={form.consent_recorded_at} onChange={(e) => setForm({ ...form, consent_recorded_at: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2 md:col-span-3">
                    <Label htmlFor="guardian-consent-evidence">Evidência (link ou referência)</Label>
                    <Input id="guardian-consent-evidence" required value={form.consent_evidence} onChange={(e) => setForm({ ...form, consent_evidence: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            {active && (
              <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <Label htmlFor="replacement-reason">
                  Motivo da substituição <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="replacement-reason"
                  required
                  value={form.replacement_reason}
                  onChange={(e) =>
                    setForm({ ...form, replacement_reason: e.target.value })
                  }
                />
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row mt-6 pt-2">
              <Button disabled={busy} className="w-full sm:w-auto">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Responsável
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAdding(false)}
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}
        {error && !revoking && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="text-sm text-green-700">
            {success}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
