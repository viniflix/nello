import React, { useState, useEffect, useRef } from 'react';
import { decimalMoney } from '@/lib/utils/money';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import ServiceActions from './ServiceActions';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatCurrency } from '@/lib/utils';
import { getServices, saveService, deleteService } from '@/lib/supabase/financial-queries';
import { useToast } from '@/components/ui/use-toast';
import { toPortugueseError } from '@/lib/utils/errorMessages';

const SERVICE_CATEGORIES = [
    { value: 'consulta', label: 'Consulta' },
    { value: 'plano_mensal', label: 'Plano Mensal' },
    { value: 'outros', label: 'Outros' }
];

export default function ServicesManager({ open, onOpenChange, nutritionistId }) {
    const { toast } = useToast();
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [saving, setSaving] = useState(false);
    const saveLock = useRef(false);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingService, setEditingService] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        category: 'consulta'
    });

    useEffect(() => {
        if (open && nutritionistId) {
            loadServices();
        }
    }, [open, nutritionistId]);

    const loadServices = async () => {
        if (!nutritionistId) return;
        setLoading(true);
        setLoadError(false);
        try {
            const data = await getServices(nutritionistId);
            setServices(data);
        } catch (error) {
            setLoadError(true);
            toast({
                title: "Erro",
                description: "Não foi possível carregar os serviços.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const handleNewService = () => {
        setEditingService(null);
        setFormData({
            name: '',
            description: '',
            price: '',
            category: 'consulta'
        });
        setIsFormOpen(true);
    };

    const handleEditService = (service) => {
        setEditingService(service);
        setFormData({
            name: service.name,
            description: service.description || '',
            price: service.price.toString(),
            category: service.category || ''
        });
        setIsFormOpen(true);
    };

    const handleSaveService = async (e) => {
        e.preventDefault();
        if (saveLock.current) return;

        if (!formData.name || !formData.price) {
            toast({
                title: "Erro",
                description: "Preencha todos os campos obrigatórios.",
                variant: "destructive"
            });
            return;
        }

        saveLock.current = true; setSaving(true);
        try {
            await saveService({
                id: editingService?.id,
                updated_at: editingService?.updated_at,
                nutritionist_id: nutritionistId,
                name: formData.name,
                description: formData.description,
                price: decimalMoney(formData.price),
                category: formData.category
            });

            toast({
                title: "Sucesso!",
                description: `Serviço ${editingService ? 'atualizado' : 'criado'} com sucesso.`
            });

            setIsFormOpen(false);
            setEditingService(null);
            await loadServices();
        } catch (error) {
            toast({
                title: "Erro",
                description: toPortugueseError(error, 'Não foi possível salvar o serviço.'),
                variant: "destructive"
            });
        } finally { saveLock.current = false; setSaving(false); }
    };

    const handleDeleteService = async (id) => {
        try {
            await deleteService(id);
            toast({
                title: "Sucesso!",
                description: "Serviço desativado com sucesso."
            });
            setDeleteConfirm(null);
            loadServices();
        } catch (error) {
            toast({
                title: "Erro",
                description: "Não foi possível excluir o serviço.",
                variant: "destructive"
            });
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={next => !saveLock.current && onOpenChange(next)}>
                <DialogContent className="financial-dialog financial-structured-dialog flex max-w-4xl max-h-[90dvh] flex-col gap-0 overflow-hidden p-0">
                    <DialogHeader className="financial-dialog-header">
                        <DialogTitle>Gerenciar Serviços</DialogTitle>
                    </DialogHeader>
                    <div className="financial-dialog-body min-h-0 overflow-y-auto space-y-4">
                        <div className="flex justify-end">
                            <Button onClick={handleNewService} disabled={loading || loadError}>
                                <Plus className="w-4 h-4 mr-2" />
                                Novo Serviço
                            </Button>
                        </div>

                        {loading ? (
                            <div className="text-center py-8 text-muted-foreground">
                                Carregando serviços...
                            </div>
                        ) : loadError ? (<div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">Não foi possível carregar os serviços. <Button variant="outline" size="sm" onClick={loadServices}>Tentar novamente</Button></div>) : services.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                Nenhum serviço cadastrado. Clique em "Novo Serviço" para começar.
                            </div>
                        ) : (
                            <Card>
                                <CardContent className="p-0">
                                    <Table aria-label="Serviços" mobileLabels={["Nome", "Descrição", "Categoria", "Preço", "Ações"]}>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Nome</TableHead>
                                                <TableHead>Descrição</TableHead>
                                                <TableHead>Categoria</TableHead>
                                                <TableHead className="text-right">Preço</TableHead>
                                                <TableHead className="text-right">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {services.map((service) => (
                                                <TableRow key={service.id}>
                                                    <TableCell className="font-medium">
                                                        {service.name}
                                                    </TableCell>
                                                    <TableCell className="max-w-[300px] truncate">
                                                        {service.description || '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {SERVICE_CATEGORIES.find(c => c.value === service.category)?.label || service.category || 'Não definida'}
                                                    </TableCell>
                                                    <TableCell className="text-right font-semibold tabular-nums">
                                                        {formatCurrency(service.price)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <ServiceActions service={service} onEdit={() => handleEditService(service)} onDelete={() => setDeleteConfirm(service.id)} />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                    <DialogFooter className="financial-dialog-footer"><Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Fechar serviços</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Service Form Dialog */}
            <Dialog open={isFormOpen} onOpenChange={next => !saveLock.current && setIsFormOpen(next)}>
                <DialogContent className="financial-dialog financial-structured-dialog flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0">
                    <DialogHeader className="financial-dialog-header">
                        <DialogTitle>
                            {editingService ? 'Editar Serviço' : 'Novo Serviço'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSaveService} className="flex min-h-0 flex-col overflow-hidden">
                        <div className="financial-dialog-body min-h-0 overflow-y-auto space-y-4">
                        <div>
                            <Label htmlFor="name">Nome do Serviço *</Label>
                            <Input
                                id="name"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="Ex: Consulta Individual"
                            />
                        </div>
                        <div>
                            <Label htmlFor="description">Descrição</Label>
                            <Input
                                id="description"
                                value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Descrição opcional do serviço"
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="service-category">Categoria (opcional)</Label>
                                <Select
                                    value={formData.category || 'none'}
                                    onValueChange={(value) => setFormData(prev => ({ ...prev, category: value === 'none' ? '' : value }))}
                                >
                                    <SelectTrigger id="service-category">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Não definida</SelectItem>
                                        {SERVICE_CATEGORIES.map(cat => (
                                            <SelectItem key={cat.value} value={cat.value}>
                                                {cat.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="price">Preço (R$) *</Label>
                                <Input
                                    id="price"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    required
                                    value={formData.price}
                                    onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                        </div>
                        <DialogFooter className="financial-dialog-footer">
                            <Button type="button" variant="outline" disabled={saving} onClick={() => setIsFormOpen(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={saving}>
                                {saving ? 'Salvando…' : editingService ? 'Atualizar' : 'Salvar'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
                <AlertDialogContent className="financial-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Desativar serviço</AlertDialogTitle>
                        <AlertDialogDescription>
                            Este serviço deixará de aparecer nas novas transações. O histórico permanece preservado.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => handleDeleteService(deleteConfirm)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Desativar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

