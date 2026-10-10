import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function CurrentPasswordField({ value, onChange, disabled }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="currentPassword">Senha atual</Label>
      <Input
        id="currentPassword"
        name="current-password"
        type="password"
        autoComplete="current-password"
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-describedby="currentPasswordHelp"
      />
      <p id="currentPasswordHelp" className="text-xs text-muted-foreground">
        Para trocar a senha de uma sessão conectada, informe a senha atual.
        Se entrou por um link de recuperação ou convite por email, deixe este campo vazio.
      </p>
    </div>
  );
}
