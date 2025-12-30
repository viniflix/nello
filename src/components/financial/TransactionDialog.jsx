import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, addMonths, parseISO } from 'date-fns';
import { Upload, File, X } from 'lucide-react';
import { getServices } from '@/lib/supabase/financial-queries';
import { formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const INCOME_CATEGORIES = [
    { value: 'consulta', label: 'Consulta' },
    { value: 'plano_mensal', label: 'Plano Mensal' },
    { value: 'outros', label: 'Outros' }
];

const EXPENSE_CATEGORIES = [
    { value: 'aluguel', label: 'Aluguel' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'software', label: 'Software' },
    { value: 'outros', label: 'Outros' }
];

const PAYMENT_METHODS = [
    { value: 'pix', label: 'PIX' },
    { value: 'credit', label: 'Cartão de Crédito' },
    { value: 'debit', label: 'Cartão de Débito' },
    { value: 'cash', label: 'Dinheiro' },
    { value: 'transfer', label: 'Transferência Bancária' },
    { value: 'other', label: 'Outro' }
];

export default function TransactionDialog({ 
    open, 
    onOpenChange, 
    transaction, 
    patients = [],
    services = [],
    nutritionistId,
    onSave 
}) {
    const { toast } = useToast();
    const [formData, setFormData] = useState({
        type: 'income',
        category: '',
        patient_id: 'none',
        service_id: 'none',
        description: '',
        amount: '',
        transaction_date: format(new Date(), 'yyyy-MM-dd'),
        isPaid: true,
        due_date: '',
        isInstallment: false,
        installments: 2,
        payment_method: 'pix',
        fee_percentage: '',
        attachment_file: null,
        attachment_url: null
    });
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (transaction) {
            setFormData({
                type: transaction.type || 'income',
                category: transaction.category || '',
                patient_id: transaction.patient_id || 'none',
                service_id: 'none',
                description: transaction.description || '',
                amount: transaction.amount?.toString() || '',
                transaction_date: transaction.transaction_date 
                    ? format(new Date(transaction.transaction_date + 'T00:00:00'), 'yyyy-MM-dd')
                    : format(new Date(), 'yyyy-MM-dd'),
                isPaid: transaction.status === 'paid',
                due_date: transaction.due_date 
                    ? format(new Date(transaction.due_date + 'T00:00:00'), 'yyyy-MM-dd')
                    : '',
                isInstallment: false,
                installments: 2,
                payment_method: transaction.payment_method || 'pix',
                fee_percentage: transaction.fee_percentage?.toString() || '',
                attachment_file: null,
                attachment_url: transaction.attachment_url || null
            });
        } else {
            // Reset form
            setFormData({
                type: 'income',
                category: '',
                patient_id: 'none',
                service_id: 'none',
                description: '',
                amount: '',
                transaction_date: format(new Date(), 'yyyy-MM-dd'),
                isPaid: true,
                due_date: '',
                isInstallment: false,
                installments: 2,
                payment_method: 'pix',
                fee_percentage: '',
                attachment_file: null,
                attachment_url: null
            });
        }
    }, [transaction, open]);

    // Calculate estimated net amount
    const estimatedNetAmount = useMemo(() => {
        const amount = parseFloat(formData.amount) || 0;
        const feePercent = parseFloat(formData.fee_percentage) || 0;
        
        if (amount === 0) return 0;
        
        // Only apply fee for credit or debit
        if ((formData.payment_method === 'credit' || formData.payment_method === 'debit') && feePercent > 0) {
            const feeAmount = (amount * feePercent) / 100;
            return amount - feeAmount;
        }
        
        return amount;
    }, [formData.amount, formData.fee_percentage, formData.payment_method]);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            // Validate file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                toast({
                    title: 'Erro',
                    description: 'O arquivo deve ter no máximo 10MB.',
                    variant: 'destructive'
                });
                return;
            }
            setFormData(prev => ({ ...prev, attachment_file: file }));
        }
    };

    const handleRemoveFile = () => {
        setFormData(prev => ({ ...prev, attachment_file: null, attachment_url: null }));
    };

    const uploadAttachment = async () => {
        if (!formData.attachment_file || !nutritionistId) return null;

        setUploading(true);
        try {
            const fileExt = formData.attachment_file.name.split('.').pop();
            const fileName = `${nutritionistId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

            // Upload to Supabase Storage (bucket: financial-docs)
            const { error: uploadError } = await supabase.storage
                .from('financial-docs')
                .upload(fileName, formData.attachment_file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('financial-docs')
                .getPublicUrl(fileName);

            return publicUrl;
        } catch (error) {
            console.error('Error uploading attachment:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível fazer upload do arquivo.',
                variant: 'destructive'
            });
            return null;
        } finally {
            setUploading(false);
        }
    };

    const handleTypeChange = (type) => {
        setFormData(prev => ({
            ...prev,
            type,
            category: '',
            patient_id: type === 'expense' ? 'none' : (prev.patient_id || 'none'),
            service_id: type === 'expense' ? 'none' : (prev.service_id || 'none'),
            isInstallment: type === 'expense' ? prev.isInstallment : false
        }));
    };

    const handleServiceChange = (serviceId) => {
        if (!serviceId || serviceId === 'none') {
            setFormData(prev => ({ ...prev, service_id: 'none', amount: '', description: '' }));
            return;
        }

        const service = services.find(s => s.id.toString() === serviceId);
        if (service) {
            setFormData(prev => ({
                ...prev,
                service_id: serviceId,
                amount: service.price.toString(),
                description: service.name,
                category: service.category || prev.category
            }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.description || !formData.amount || !formData.category) {
            return;
        }

        // Upload attachment if new file selected
        let attachmentUrl = formData.attachment_url;
        if (formData.attachment_file) {
            attachmentUrl = await uploadAttachment();
            if (!attachmentUrl && formData.attachment_file) {
                // User can still save without attachment if upload fails
                toast({
                    title: 'Aviso',
                    description: 'Salvando sem anexo. Tente fazer upload novamente depois.',
                    variant: 'default'
                });
            }
        }

        // If editing, save normally
        if (transaction?.id) {
            const payload = {
                id: transaction.id,
                type: formData.type,
                category: formData.category,
                patient_id: formData.type === 'income' && formData.patient_id && formData.patient_id !== 'none' && formData.patient_id !== '' ? formData.patient_id : null,
                description: formData.description,
                amount: parseFloat(formData.amount),
                transaction_date: formData.transaction_date,
                status: formData.isPaid ? 'paid' : 'pending',
                due_date: !formData.isPaid && formData.due_date ? formData.due_date : null,
                payment_method: formData.payment_method,
                fee_percentage: formData.fee_percentage ? parseFloat(formData.fee_percentage) : null,
                attachment_url: attachmentUrl
            };
            onSave(payload);
            return;
        }

        // If expense with installments, generate multiple transactions
        if (formData.type === 'expense' && formData.isInstallment && formData.installments > 1) {
            const totalAmount = parseFloat(formData.amount);
            const installmentAmount = totalAmount / formData.installments;
            const baseDate = parseISO(formData.transaction_date + 'T00:00:00');
            
            const transactions = [];
            for (let i = 0; i < formData.installments; i++) {
                const installmentDate = addMonths(baseDate, i);
                transactions.push({
                    type: 'expense',
                    category: formData.category,
                    description: `${formData.description} (${i + 1}/${formData.installments})`,
                    amount: installmentAmount,
                    transaction_date: format(installmentDate, 'yyyy-MM-dd'),
                    status: i === 0 && formData.isPaid ? 'paid' : 'pending',
                    due_date: format(installmentDate, 'yyyy-MM-dd'),
                    payment_method: formData.payment_method,
                    fee_percentage: formData.fee_percentage ? parseFloat(formData.fee_percentage) : null,
                    attachment_url: i === 0 ? attachmentUrl : null // Only attach to first installment
                });
            }
            onSave({ multiple: true, transactions });
        } else {
            // Single transaction
            const payload = {
                type: formData.type,
                category: formData.category,
                patient_id: formData.type === 'income' && formData.patient_id && formData.patient_id !== 'none' && formData.patient_id !== '' ? formData.patient_id : null,
                description: formData.description,
                amount: parseFloat(formData.amount),
                transaction_date: formData.transaction_date,
                status: formData.isPaid ? 'paid' : 'pending',
                due_date: !formData.isPaid && formData.due_date ? formData.due_date : null,
                payment_method: formData.payment_method,
                fee_percentage: formData.fee_percentage ? parseFloat(formData.fee_percentage) : null,
                attachment_url: attachmentUrl
            };
            onSave(payload);
        }
    };

    const currentCategories = formData.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const installmentAmount = formData.isInstallment && formData.amount 
        ? (parseFloat(formData.amount) / formData.installments).toFixed(2)
        : '0.00';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {transaction ? 'Editar Transação' : 'Nova Transação'}
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Type Selector */}
                    <div>
                        <Label>Tipo de Transação</Label>
                        <Tabs 
                            value={formData.type} 
                            onValueChange={handleTypeChange}
                            className="mt-2"
                        >
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="income">Receita</TabsTrigger>
                                <TabsTrigger value="expense">Despesa</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    {/* Service Select (only for income, new transactions) */}
                    {formData.type === 'income' && !transaction && services.length > 0 && (
                        <div>
                            <Label htmlFor="service_id">Serviço (opcional)</Label>
                            <Select
                                value={formData.service_id || 'none'}
                                onValueChange={handleServiceChange}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione um serviço para preencher automaticamente" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Nenhum</SelectItem>
                                    {services.map(service => (
                                        <SelectItem key={service.id} value={service.id.toString()}>
                                            {service.name} - {formatCurrency(service.price)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Category */}
                    <div>
                        <Label htmlFor="category">
                            Categoria {formData.type === 'income' ? 'da Receita' : 'da Despesa'} *
                        </Label>
                        <Select
                            required
                            value={formData.category}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione uma categoria" />
                            </SelectTrigger>
                            <SelectContent>
                                {currentCategories.map(cat => (
                                    <SelectItem key={cat.value} value={cat.value}>
                                        {cat.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Patient Select (only for income) */}
                    {formData.type === 'income' && (
                        <div>
                            <Label htmlFor="patient_id">Paciente (opcional)</Label>
                            <Select
                                value={formData.patient_id || 'none'}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, patient_id: value === 'none' ? '' : value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione um paciente" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Nenhum</SelectItem>
                                    {patients.map(patient => (
                                        <SelectItem key={patient.id} value={patient.id}>
                                            {patient.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Description */}
                    <div>
                        <Label htmlFor="description">Descrição *</Label>
                        <Input
                            id="description"
                            required
                            value={formData.description}
                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Ex: Consulta com João Silva"
                        />
                    </div>

                    {/* Amount and Date */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="amount">Valor Total (R$) *</Label>
                            <Input
                                id="amount"
                                type="number"
                                step="0.01"
                                min="0"
                                required
                                value={formData.amount}
                                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                                placeholder="0.00"
                            />
                        </div>
                        <div>
                            <Label htmlFor="transaction_date">Data *</Label>
                            <Input
                                id="transaction_date"
                                type="date"
                                required
                                value={formData.transaction_date}
                                onChange={(e) => setFormData(prev => ({ ...prev, transaction_date: e.target.value }))}
                            />
                        </div>
                    </div>

                    {/* Installment Switch (only for expenses, new transactions) */}
                    {formData.type === 'expense' && !transaction && (
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="space-y-0.5">
                                <Label htmlFor="isInstallment">Parcelado?</Label>
                                <p className="text-sm text-muted-foreground">
                                    Dividir esta despesa em múltiplas parcelas
                                </p>
                            </div>
                            <Switch
                                id="isInstallment"
                                checked={formData.isInstallment}
                                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isInstallment: checked }))}
                            />
                        </div>
                    )}

                    {/* Installments Input */}
                    {formData.type === 'expense' && formData.isInstallment && !transaction && (
                        <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/50">
                            <div>
                                <Label htmlFor="installments">Número de Parcelas *</Label>
                                <Select
                                    value={formData.installments.toString()}
                                    onValueChange={(value) => setFormData(prev => ({ ...prev, installments: parseInt(value) }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => (
                                            <SelectItem key={num} value={num.toString()}>
                                                {num}x
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Valor por Parcela</Label>
                                <div className="h-10 flex items-center text-lg font-semibold text-primary">
                                    {formatCurrency(parseFloat(installmentAmount))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Payment Status */}
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-0.5">
                            <Label htmlFor="isPaid">Já foi pago?</Label>
                            <p className="text-sm text-muted-foreground">
                                {formData.isInstallment 
                                    ? 'Marque se a primeira parcela já foi paga'
                                    : 'Marque se o pagamento já foi realizado'}
                            </p>
                        </div>
                        <Switch
                            id="isPaid"
                            checked={formData.isPaid}
                            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isPaid: checked }))}
                        />
                    </div>

                    {/* Due Date (if not paid and not installment) */}
                    {!formData.isPaid && !formData.isInstallment && (
                        <div>
                            <Label htmlFor="due_date">Data de Vencimento *</Label>
                            <Input
                                id="due_date"
                                type="date"
                                required={!formData.isPaid}
                                value={formData.due_date}
                                onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                                min={formData.transaction_date}
                            />
                        </div>
                    )}

                    {/* Payment Method */}
                    <div>
                        <Label htmlFor="payment_method">Método de Pagamento</Label>
                        <Select
                            value={formData.payment_method}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, payment_method: value, fee_percentage: (value === 'credit' || value === 'debit') ? prev.fee_percentage : '' }))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione o método de pagamento" />
                            </SelectTrigger>
                            <SelectContent>
                                {PAYMENT_METHODS.map(method => (
                                    <SelectItem key={method.value} value={method.value}>
                                        {method.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Fee Percentage (only for credit/debit) */}
                    {(formData.payment_method === 'credit' || formData.payment_method === 'debit') && (
                        <div>
                            <Label htmlFor="fee_percentage">Taxa (%)</Label>
                            <Input
                                id="fee_percentage"
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={formData.fee_percentage}
                                onChange={(e) => setFormData(prev => ({ ...prev, fee_percentage: e.target.value }))}
                                placeholder="Ex: 2.5"
                            />
                            {formData.amount && formData.fee_percentage && (
                                <p className="text-sm text-muted-foreground mt-1">
                                    Valor Líquido Estimado: <span className="font-semibold text-primary">{formatCurrency(estimatedNetAmount)}</span>
                                </p>
                            )}
                        </div>
                    )}

                    {/* Attachment Section */}
                    <div>
                        <Label htmlFor="attachment">Anexar Comprovante/NF (opcional)</Label>
                        <div className="mt-2 space-y-2">
                            {formData.attachment_file ? (
                                <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                                    <File className="w-4 h-4" />
                                    <span className="flex-1 text-sm truncate">{formData.attachment_file.name}</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleRemoveFile}
                                        className="h-8 w-8"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            ) : formData.attachment_url ? (
                                <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                                    <File className="w-4 h-4" />
                                    <a 
                                        href={formData.attachment_url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex-1 text-sm text-primary hover:underline truncate"
                                    >
                                        Ver anexo existente
                                    </a>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleRemoveFile}
                                        className="h-8 w-8"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Input
                                        id="attachment"
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                        onChange={handleFileChange}
                                        className="flex-1"
                                        disabled={uploading}
                                    />
                                </div>
                            )}
                            <p className="text-xs text-muted-foreground">
                                Formatos aceitos: PDF, JPG, PNG, DOC, DOCX (máx. 10MB)
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit">
                            {transaction ? 'Atualizar' : 'Salvar'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
