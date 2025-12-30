import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Edit, Trash2, Plus, X } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatCurrency } from '@/lib/utils';
import { getServices, saveService, deleteService } from '@/lib/supabase/financial-queries';
import { useToast } from '@/components/ui/use-toast';

const SERVICE_CATEGORIES = [
    { value: 'consulta', label: 'Consulta' },
    { value: 'plano_mensal', label: 'Plano Mensal' },
    { value: 'outros', label: 'Outros' }
];

export default function ServicesManager({ open, onOpenChange, nutritionistId }) {
    const { toast } = useToast();
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
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
        try {
            const data = await getServices(nutritionistId);
            setServices(data);
        } catch (error) {
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
            category: service.category || 'consulta'
        });
        setIsFormOpen(true);
    };

    const handleSaveService = async (e) => {
        e.preventDefault();
        
        if (!formData.name || !formData.price) {
            toast({
                title: "Erro",
                description: "Preencha todos os campos obrigatórios.",
                variant: "destructive"
            });
            return;
        }

        try {
            await saveService({
                id: editingService?.id,
                nutritionist_id: nutritionistId,
                name: formData.name,
                description: formData.description,
                price: parseFloat(formData.price),
                category: formData.category
            });

            toast({
                title: "Sucesso!",
                description: `Serviço ${editingService ? 'atualizado' : 'criado'} com sucesso.`
            });

            setIsFormOpen(false);
            setEditingService(null);
            loadServices();
        } catch (error) {
            toast({
                title: "Erro",
                description: `Não foi possível salvar o serviço: ${error.message}`,
                variant: "destructive"
            });
        }
    };

    const handleDeleteService = async (id) => {
        try {
            await deleteService(id);
            toast({
                title: "Sucesso!",
                description: "Serviço excluído com sucesso."
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
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Gerenciar Serviços</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="flex justify-end">
                            <Button onClick={handleNewService}>
                                <Plus className="w-4 h-4 mr-2" />
                                Novo Serviço
                            </Button>
                        </div>

                        {loading ? (
                            <div className="text-center py-8 text-muted-foreground">
                                Carregando serviços...
                            </div>
                        ) : services.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                Nenhum serviço cadastrado. Clique em "Novo Serviço" para começar.
                            </div>
                        ) : (
                            <Card>
                                <CardContent className="p-0">
                                    <Table>
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
                                                        {SERVICE_CATEGORIES.find(c => c.value === service.category)?.label || service.category}
                                                    </TableCell>
                                                    <TableCell className="text-right font-semibold">
                                                        {formatCurrency(service.price)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex justify-end gap-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleEditService(service)}
                                                                className="h-8 w-8"
                                                            >
                                                                <Edit className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => setDeleteConfirm(service.id)}
                                                                className="h-8 w-8 text-destructive hover:text-destructive"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Service Form Dialog */}
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editingService ? 'Editar Serviço' : 'Novo Serviço'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSaveService} className="space-y-4">
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
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="category">Categoria *</Label>
                                <Select
                                    required
                                    value={formData.category}
                                    onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
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
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit">
                                {editingService ? 'Atualizar' : 'Salvar'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir este serviço? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => handleDeleteService(deleteConfirm)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

