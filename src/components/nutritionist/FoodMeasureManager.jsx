import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Loader2, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';

/**
 * FoodMeasureManager - Modal para gerenciar medidas caseiras de um alimento
 * 
 * Tabs:
 * - Informações Básicas (read-only)
 * - Medidas Caseiras (CRUD)
 */
export default function FoodMeasureManager({ food, isOpen, onClose }) {
  const { toast } = useToast();
  const [measures, setMeasures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state for new measure
  const [newMeasureLabel, setNewMeasureLabel] = useState('');
  const [newMeasureGrams, setNewMeasureGrams] = useState('');

  // Load measures when food changes
  useEffect(() => {
    if (food && isOpen) {
      loadMeasures();
    }
  }, [food, isOpen]);

  const loadMeasures = async () => {
    if (!food?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('food_measures')
        .select('*')
        .eq('food_id', food.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMeasures(data || []);
    } catch (error) {
      console.error('Erro ao carregar medidas:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as medidas.',
        variant: 'destructive'
      });
      setMeasures([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMeasure = async () => {
    if (!newMeasureLabel.trim() || !newMeasureGrams || parseFloat(newMeasureGrams) <= 0) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos corretamente.',
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('food_measures')
        .insert({
          food_id: food.id,
          measure_label: newMeasureLabel.trim(),
          quantity_grams: parseFloat(newMeasureGrams)
        })
        .select()
        .single();

      if (error) throw error;

      setMeasures(prev => [...prev, data]);
      setNewMeasureLabel('');
      setNewMeasureGrams('');
      
      toast({
        title: 'Sucesso!',
        description: 'Medida adicionada com sucesso.'
      });
    } catch (error) {
      console.error('Erro ao adicionar medida:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível adicionar a medida.',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMeasure = async (measureId) => {
    if (!confirm('Tem certeza que deseja excluir esta medida?')) {
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('food_measures')
        .delete()
        .eq('id', measureId);

      if (error) throw error;

      setMeasures(prev => prev.filter(m => m.id !== measureId));
      
      toast({
        title: 'Sucesso!',
        description: 'Medida excluída com sucesso.'
      });
    } catch (error) {
      console.error('Erro ao excluir medida:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível excluir a medida.',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setNewMeasureLabel('');
    setNewMeasureGrams('');
    setMeasures([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Alimento: {food?.name}</DialogTitle>
          <DialogDescription>
            Edite as informações e medidas caseiras deste alimento
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="measures" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="info">Informações Básicas</TabsTrigger>
            <TabsTrigger value="measures">Medidas Caseiras</TabsTrigger>
          </TabsList>

          {/* Tab: Basic Info */}
          <TabsContent value="info" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Informações Nutricionais</CardTitle>
                <CardDescription>Dados base do alimento (100g)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Nome</Label>
                    <p className="font-medium">{food?.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Grupo</Label>
                    <p className="font-medium">{food?.group || 'Não informado'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Calorias</Label>
                    <p className="font-medium">{food?.calories} kcal</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Proteínas</Label>
                    <p className="font-medium">{food?.protein}g</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Carboidratos</Label>
                    <p className="font-medium">{food?.carbs}g</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Gorduras</Label>
                    <p className="font-medium">{food?.fat}g</p>
                  </div>
                </div>
                {food?.description && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Descrição</Label>
                    <p className="text-sm">{food.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Measures */}
          <TabsContent value="measures" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Medidas Caseiras</CardTitle>
                <CardDescription>
                  Defina medidas específicas para este alimento (ex: "1 Colher de Sopa = 15g")
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add New Measure Form */}
                <div className="p-4 border rounded-lg bg-muted/30">
                  <h4 className="font-semibold text-sm mb-3">Adicionar Nova Medida</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <Label htmlFor="measure-label">Nome da Medida</Label>
                      <Input
                        id="measure-label"
                        placeholder="Ex: Colher de Sopa, Fatia, Xícara..."
                        value={newMeasureLabel}
                        onChange={(e) => setNewMeasureLabel(e.target.value)}
                        disabled={saving}
                      />
                    </div>
                    <div>
                      <Label htmlFor="measure-grams">Peso (gramas)</Label>
                      <Input
                        id="measure-grams"
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="Ex: 15"
                        value={newMeasureGrams}
                        onChange={(e) => setNewMeasureGrams(e.target.value)}
                        disabled={saving}
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleAddMeasure}
                    disabled={saving || !newMeasureLabel.trim() || !newMeasureGrams}
                    className="mt-3 w-full md:w-auto"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Adicionar Medida
                      </>
                    )}
                  </Button>
                </div>

                {/* Existing Measures List */}
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : measures.length === 0 ? (
                  <Alert>
                    <Info className="w-4 h-4" />
                    <AlertDescription>
                      Nenhuma medida caseira cadastrada para este alimento.
                      Adicione medidas acima para facilitar o registro dos pacientes.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Medidas Cadastradas</h4>
                    {measures.map((measure) => (
                      <div
                        key={measure.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1">
                          <p className="font-medium">{measure.measure_label}</p>
                          <p className="text-xs text-muted-foreground">
                            {measure.quantity_grams}g por unidade
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteMeasure(measure.id)}
                          disabled={saving}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            <X className="w-4 h-4 mr-2" />
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

