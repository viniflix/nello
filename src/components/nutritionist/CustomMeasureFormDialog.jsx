import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Scale, Info } from 'lucide-react';

const CATEGORIES = [
  { value: 'volume', label: 'Volume', description: 'Ex: colher, xícara, copo' },
  { value: 'unit', label: 'Unidade', description: 'Ex: fatia, pedaço, unidade' },
  { value: 'weight', label: 'Peso', description: 'Ex: porção pesada, sachê' },
  { value: 'other', label: 'Outros', description: 'Qualquer outra medida' },
];

/**
 * Dialog para criar ou editar uma medida caseira personalizada.
 *
 * Props:
 *  - open: boolean
 *  - onOpenChange: (open) => void
 *  - measure: object | null — null para criar, objeto para editar
 *  - onSave: ({ name, grams_equivalent, category, description }) => Promise<void>
 *  - isSaving: boolean
 */
const CustomMeasureFormDialog = ({ open, onOpenChange, measure, onSave, isSaving }) => {
  const isEditing = Boolean(measure);

  const [name, setName] = useState('');
  const [gramsEquivalent, setGramsEquivalent] = useState('');
  const [category, setCategory] = useState('volume');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});

  // Preencher form ao editar
  useEffect(() => {
    if (measure) {
      setName(measure.name || '');
      setGramsEquivalent(String(measure.grams_equivalent || ''));
      setCategory(measure.category || 'volume');
      setDescription(measure.description || '');
    } else {
      setName('');
      setGramsEquivalent('');
      setCategory('volume');
      setDescription('');
    }
    setErrors({});
  }, [measure, open]);

  const validate = () => {
    const newErrors = {};
    if (!name.trim() || name.trim().length < 2) {
      newErrors.name = 'Nome deve ter pelo menos 2 caracteres.';
    }
    const grams = parseFloat(gramsEquivalent);
    if (!gramsEquivalent || isNaN(grams) || grams <= 0) {
      newErrors.grams = 'Informe um valor válido em gramas (maior que 0).';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    await onSave({
      name: name.trim(),
      grams_equivalent: parseFloat(gramsEquivalent),
      category,
      description: description.trim() || null,
    });
  };

  const parsedGrams = parseFloat(gramsEquivalent);
  const hasPreview = name.trim() && !isNaN(parsedGrams) && parsedGrams > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Scale className="w-5 h-5 text-emerald-600" />
            {isEditing ? 'Editar Medida Caseira' : 'Nova Medida Caseira'}
          </DialogTitle>
          <DialogDescription>
            Defina o nome e a equivalência em gramas para uso nos cálculos nutricionais.
          </DialogDescription>
        </DialogHeader>

        <form id="custom-measure-form" onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="cm-name" className="font-medium">
              Nome da Medida <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cm-name"
              placeholder="Ex: Minha xícara da clínica"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={errors.name ? 'border-destructive' : ''}
              maxLength={100}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Gramas */}
          <div className="space-y-1.5">
            <Label htmlFor="cm-grams" className="font-medium">
              Equivalência em Gramas <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">1 unidade =</span>
              <Input
                id="cm-grams"
                type="number"
                step="0.1"
                min="0.1"
                placeholder="Ex: 240"
                value={gramsEquivalent}
                onChange={(e) => setGramsEquivalent(e.target.value)}
                className={`max-w-[140px] ${errors.grams ? 'border-destructive' : ''}`}
              />
              <span className="text-sm text-muted-foreground">gramas (g)</span>
            </div>
            {errors.grams && (
              <p className="text-xs text-destructive">{errors.grams}</p>
            )}
          </div>

          {/* Categoria */}
          <div className="space-y-1.5">
            <Label className="font-medium">Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    <div className="flex flex-col">
                      <span>{cat.label}</span>
                      <span className="text-xs text-muted-foreground">{cat.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="cm-desc" className="font-medium text-muted-foreground">
              Descrição <span className="text-xs">(opcional)</span>
            </Label>
            <Textarea
              id="cm-desc"
              placeholder="Ex: Copo plástico descartável utilizado na clínica"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={300}
            />
          </div>

          {/* Preview */}
          {hasPreview && (
            <div className="flex items-start gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
              <Info className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <p className="text-sm text-emerald-800">
                <span className="font-semibold">Prévia:</span>{' '}
                1 {name.trim()} = <span className="font-semibold">{parsedGrams}g</span>
                {parsedGrams > 0 && (
                  <span className="text-emerald-600">
                    {' '}· 2 {name.trim()} = {(parsedGrams * 2).toFixed(1)}g
                  </span>
                )}
              </p>
            </div>
          )}
        </form>

        <DialogFooter className="pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="custom-measure-form"
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-700 min-w-[120px]"
          >
            {isSaving ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Criar Medida'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CustomMeasureFormDialog;
