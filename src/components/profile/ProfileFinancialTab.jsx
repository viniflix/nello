import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CreditCard, DollarSign, Calendar, Plus, Edit, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { updateClinicSettings, getClinicSettings, getRecurringExpenses, saveRecurringExpense, deleteRecurringExpense } from '@/lib/supabase/profile-queries';
import { getServices, saveService, deleteService } from '@/lib/supabase/financial-queries';
import { formatCurrency } from '@/lib/utils';

const SERVICE_CATEGORIES = [
    { value: 'consulta', label: 'Consulta' },
    { value: 'plano_mensal', label: 'Plano Mensal' },
    { value: 'outros', label: 'Outros' }
];

export default function ProfileFinancialTab({ userId, onUpdate }) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    
    const [financialSettings, setFinancialSettings] = useState({
        defaultPixKey: '',
        defaultFeePercentage: '',
        monthlyFinancialGoal: 10000
    });

    const [services, setServices] = useState([]);
    const [recurringExpenses, setRecurringExpenses] = useState([]);
    
    const [isServiceFormOpen, setIsServiceFormOpen] = useState(false);
    const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
    const [editingService, setEditingService] = useState(null);
    const [editingExpense, setEditingExpense] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState({ type: null, id: null });

    const [serviceFormData, setServiceFormData] = useState({
        name: '',
        description: '',
        price: '',
        category: 'consulta'
    });

    const [expenseFormData, setExpenseFormData] = useState({
        description: '',
        value: '',
        day_of_month: '1'
    });

    useEffect(() => {
        if (userId) {
            loadData();
        }
    }, [userId]);

    const loadData = async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const [settings, servicesData, expensesData] = await Promise.all([
                getClinicSettings(userId),
                getServices(userId),
                getRecurringExpenses(userId)
            ]);

            setFinancialSettings({
                defaultPixKey: settings.defaultPixKey || '',
                defaultFeePercentage: settings.defaultFeePercentage || '',
                monthlyFinancialGoal: settings.monthlyFinancialGoal || 10000
            });

            setServices(servicesData);
            setRecurringExpenses(expensesData);
        } catch (error) {
            console.error('Error loading financial data:', error);
            toast({
                title: "Erro",
                description: "Não foi possível carregar os dados.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSaveFinancialSettings = async () => {
        if (!userId) return;
        setSaving(true);
        try {
            await updateClinicSettings(userId, {
                defaultPixKey: financialSettings.defaultPixKey,
                defaultFeePercentage: financialSettings.defaultFeePercentage ? parseFloat(financialSettings.defaultFeePercentage) : null,
                monthlyFinancialGoal: financialSettings.monthlyFinancialGoal ? parseFloat(financialSettings.monthlyFinancialGoal) : 10000
            });

            toast({
                title: "Configurações salvas!",
                description: "As configurações financeiras foram atualizadas."
            });

            if (onUpdate) onUpdate();
        } catch (error) {
            toast({
                title: "Erro",
                description: "Não foi possível salvar as configurações.",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    };

    // Services Management
    const handleNewService = () => {
        setEditingService(null);
        setServiceFormData({ name: '', description: '', price: '', category: 'consulta' });
        setIsServiceFormOpen(true);
    };

    const handleEditService = (service) => {
        setEditingService(service);
        setServiceFormData({
            name: service.name,
            description: service.description || '',
            price: service.price.toString(),
            category: service.category || 'consulta'
        });
        setIsServiceFormOpen(true);
    };

    const handleSaveService = async (e) => {
        e.preventDefault();
        if (!serviceFormData.name || !serviceFormData.price) {
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
                nutritionist_id: userId,
                name: serviceFormData.name,
                description: serviceFormData.description,
                price: parseFloat(serviceFormData.price),
                category: serviceFormData.category
            });

            toast({
                title: "Sucesso!",
                description: `Serviço ${editingService ? 'atualizado' : 'criado'} com sucesso.`
            });

            setIsServiceFormOpen(false);
            loadData();
        } catch (error) {
            toast({
                title: "Erro",
                description: "Não foi possível salvar o serviço.",
                variant: "destructive"
            });
        }
    };

    const handleDeleteService = async (id) => {
        try {
            await deleteService(id);
            toast({ title: "Sucesso!", description: "Serviço excluído com sucesso." });
            setDeleteConfirm({ type: null, id: null });
            loadData();
        } catch (error) {
            toast({
                title: "Erro",
                description: "Não foi possível excluir o serviço.",
                variant: "destructive"
            });
        }
    };

    // Recurring Expenses Management
    const handleNewExpense = () => {
        setEditingExpense(null);
        setExpenseFormData({ description: '', value: '', day_of_month: '1' });
        setIsExpenseFormOpen(true);
    };

    const handleEditExpense = (expense) => {
        setEditingExpense(expense);
        setExpenseFormData({
            description: expense.description,
            value: expense.value.toString(),
            day_of_month: expense.day_of_month.toString()
        });
        setIsExpenseFormOpen(true);
    };

    const handleSaveExpense = async (e) => {
        e.preventDefault();
        if (!expenseFormData.description || !expenseFormData.value) {
            toast({
                title: "Erro",
                description: "Preencha todos os campos obrigatórios.",
                variant: "destructive"
            });
            return;
        }

        try {
            await saveRecurringExpense(userId, {
                id: editingExpense?.id,
                description: expenseFormData.description,
                value: parseFloat(expenseFormData.value),
                day_of_month: parseInt(expenseFormData.day_of_month)
            });

            toast({
                title: "Sucesso!",
                description: `Despesa recorrente ${editingExpense ? 'atualizada' : 'criada'} com sucesso.`
            });

            setIsExpenseFormOpen(false);
            loadData();
        } catch (error) {
            toast({
                title: "Erro",
                description: "Não foi possível salvar a despesa.",
                variant: "destructive"
            });
        }
    };

    const handleDeleteExpense = async (id) => {
        try {
            await deleteRecurringExpense(userId, id);
            toast({ title: "Sucesso!", description: "Despesa excluída com sucesso." });
            setDeleteConfirm({ type: null, id: null });
            loadData();
        } catch (error) {
            toast({
                title: "Erro",
                description: "Não foi possível excluir a despesa.",
                variant: "destructive"
            });
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Financial Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5" />
                        Configurações Gerais
                    </CardTitle>
                    <CardDescription>
                        Configurações padrão para transações financeiras
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="defaultPixKey">Chave PIX Padrão</Label>
                        <Input
                            id="defaultPixKey"
                            value={financialSettings.defaultPixKey}
                            onChange={(e) => setFinancialSettings(prev => ({ ...prev, defaultPixKey: e.target.value }))}
                            placeholder="CPF, E-mail, Telefone ou Chave Aleatória"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="defaultFeePercentage">Taxa Padrão de Maquininha (%)</Label>
                        <Input
                            id="defaultFeePercentage"
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={financialSettings.defaultFeePercentage}
                            onChange={(e) => setFinancialSettings(prev => ({ ...prev, defaultFeePercentage: e.target.value }))}
                            placeholder="Ex: 2.5"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="monthlyFinancialGoal">Meta Financeira Mensal (R$)</Label>
                        <Input
                            id="monthlyFinancialGoal"
                            type="number"
                            step="100"
                            min="0"
                            value={financialSettings.monthlyFinancialGoal}
                            onChange={(e) => setFinancialSettings(prev => ({ ...prev, monthlyFinancialGoal: parseFloat(e.target.value) || 0 }))}
                            placeholder="Ex: 10000"
                        />
                        <p className="text-xs text-muted-foreground">
                            Meta de receita mensal para acompanhamento no dashboard financeiro
                        </p>
                    </div>
                    <Button onClick={handleSaveFinancialSettings} disabled={saving}>
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            'Salvar Configurações'
                        )}
                    </Button>
                </CardContent>
            </Card>

            {/* Services */}
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <DollarSign className="w-5 h-5" />
                                Meus Serviços
                            </CardTitle>
                            <CardDescription>
                                Gerencie seus serviços e preços padrão
                            </CardDescription>
                        </div>
                        <Button onClick={handleNewService}>
                            <Plus className="w-4 h-4 mr-2" />
                            Novo Serviço
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {services.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            Nenhum serviço cadastrado. Clique em "Novo Serviço" para começar.
                        </div>
                    ) : (
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
                                        <TableCell className="font-medium">{service.name}</TableCell>
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
                                                    onClick={() => setDeleteConfirm({ type: 'service', id: service.id })}
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
                    )}
                </CardContent>
            </Card>

            {/* Recurring Expenses */}
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Calendar className="w-5 h-5" />
                                Despesas Fixas (Recorrência)
                            </CardTitle>
                            <CardDescription>
                                Despesas que se repetem mensalmente
                            </CardDescription>
                        </div>
                        <Button onClick={handleNewExpense}>
                            <Plus className="w-4 h-4 mr-2" />
                            Nova Despesa
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {recurringExpenses.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            Nenhuma despesa recorrente cadastrada.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead className="text-right">Valor</TableHead>
                                    <TableHead className="text-right">Dia do Mês</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recurringExpenses.map((expense) => (
                                    <TableRow key={expense.id}>
                                        <TableCell className="font-medium">{expense.description}</TableCell>
                                        <TableCell className="text-right font-semibold">
                                            {formatCurrency(expense.value)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            Dia {expense.day_of_month}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleEditExpense(expense)}
                                                    className="h-8 w-8"
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setDeleteConfirm({ type: 'expense', id: expense.id })}
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
                    )}
                </CardContent>
            </Card>

            {/* Service Form Dialog */}
            <Dialog open={isServiceFormOpen} onOpenChange={setIsServiceFormOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editingService ? 'Editar Serviço' : 'Novo Serviço'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSaveService} className="space-y-4">
                        <div>
                            <Label htmlFor="serviceName">Nome do Serviço *</Label>
                            <Input
                                id="serviceName"
                                required
                                value={serviceFormData.name}
                                onChange={(e) => setServiceFormData(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="Ex: Consulta Individual"
                            />
                        </div>
                        <div>
                            <Label htmlFor="serviceDescription">Descrição</Label>
                            <Input
                                id="serviceDescription"
                                value={serviceFormData.description}
                                onChange={(e) => setServiceFormData(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Descrição opcional"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="serviceCategory">Categoria *</Label>
                                <Select
                                    required
                                    value={serviceFormData.category}
                                    onValueChange={(value) => setServiceFormData(prev => ({ ...prev, category: value }))}
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
                                <Label htmlFor="servicePrice">Preço (R$) *</Label>
                                <Input
                                    id="servicePrice"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    required
                                    value={serviceFormData.price}
                                    onChange={(e) => setServiceFormData(prev => ({ ...prev, price: e.target.value }))}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsServiceFormOpen(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit">Salvar</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Expense Form Dialog */}
            <Dialog open={isExpenseFormOpen} onOpenChange={setIsExpenseFormOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editingExpense ? 'Editar Despesa Recorrente' : 'Nova Despesa Recorrente'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSaveExpense} className="space-y-4">
                        <div>
                            <Label htmlFor="expenseDescription">Descrição *</Label>
                            <Input
                                id="expenseDescription"
                                required
                                value={expenseFormData.description}
                                onChange={(e) => setExpenseFormData(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Ex: Aluguel do Consultório"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="expenseValue">Valor (R$) *</Label>
                                <Input
                                    id="expenseValue"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    required
                                    value={expenseFormData.value}
                                    onChange={(e) => setExpenseFormData(prev => ({ ...prev, value: e.target.value }))}
                                    placeholder="0.00"
                                />
                            </div>
                            <div>
                                <Label htmlFor="expenseDay">Dia do Mês *</Label>
                                <Select
                                    required
                                    value={expenseFormData.day_of_month}
                                    onValueChange={(value) => setExpenseFormData(prev => ({ ...prev, day_of_month: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                                            <SelectItem key={day} value={day.toString()}>
                                                Dia {day}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsExpenseFormOpen(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit">Salvar</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteConfirm.type} onOpenChange={(open) => !open && setDeleteConfirm({ type: null, id: null })}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir este {deleteConfirm.type === 'service' ? 'serviço' : 'despesa'}? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (deleteConfirm.type === 'service') {
                                    handleDeleteService(deleteConfirm.id);
                                } else {
                                    handleDeleteExpense(deleteConfirm.id);
                                }
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

