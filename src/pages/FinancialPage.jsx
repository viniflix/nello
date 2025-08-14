
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Plus, Download, Edit, Trash2, FileText, ArrowUp, ArrowDown, Banknote } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import Papa from 'papaparse';
import DashboardHeader from '@/components/DashboardHeader';
import { ResponsiveContainer, BarChart as RechartsBarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { exportFinancialsToPdf } from '@/lib/pdfUtils';

const expenseCategories = ['Aluguel', 'Contas', 'Materiais', 'Marketing', 'Outros'];

const TransactionForm = ({ transaction, patients, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        type: transaction?.type || 'income',
        patient_id: transaction?.patient_id || '',
        income_source: transaction?.income_source || (transaction?.patient_id ? 'patient_payment' : 'other'),
        description: transaction?.description || '',
        amount: transaction?.amount || '',
        transaction_date: transaction ? format(new Date(transaction.transaction_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        category: transaction?.category || ''
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ ...transaction, ...formData, amount: parseFloat(formData.amount) });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <Label htmlFor="type">Tipo</Label>
                <Select required value={formData.type} onValueChange={(value) => setFormData(prev => ({ ...prev, type: value, patient_id: '', category: '', income_source: 'patient_payment' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="income">Receita</SelectItem>
                        <SelectItem value="expense">Despesa</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            {formData.type === 'income' && (
                 <div>
                    <Label htmlFor="income_source">Fonte da Receita</Label>
                    <Select required value={formData.income_source} onValueChange={(value) => setFormData(prev => ({ ...prev, income_source: value, patient_id: value === 'other' ? '' : prev.patient_id }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="patient_payment">Pagamento de Paciente</SelectItem>
                            <SelectItem value="other">Outra Entrada</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            )}
            {formData.type === 'income' && formData.income_source === 'patient_payment' && (
                <div>
                    <Label htmlFor="patient_id">Paciente</Label>
                    <Select value={formData.patient_id} onValueChange={(value) => setFormData(prev => ({ ...prev, patient_id: value }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione um paciente" /></SelectTrigger>
                        <SelectContent>
                            {patients.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            )}
            {formData.type === 'expense' && (
                <div>
                    <Label htmlFor="category">Categoria da Despesa</Label>
                    <Select required value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                        <SelectTrigger><SelectValue placeholder="Selecione uma categoria" /></SelectTrigger>
                        <SelectContent>
                            {expenseCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            )}
            <div>
                <Label htmlFor="description">Descrição</Label>
                <Input id="description" required value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="amount">Valor (R$)</Label>
                    <Input id="amount" type="number" step="0.01" required value={formData.amount} onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))} />
                </div>
                <div>
                    <Label htmlFor="transaction_date">Data</Label>
                    <Input id="transaction_date" type="date" required value={formData.transaction_date} onChange={e => setFormData(prev => ({ ...prev, transaction_date: e.target.value }))} />
                </div>
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
                <Button type="submit">Salvar</Button>
            </DialogFooter>
        </form>
    );
};

export default function FinancialPage() {
    const { user, signOut } = useAuth();
    const { toast } = useToast();
    const [transactions, setTransactions] = useState([]);
    const [patients, setPatients] = useState([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(new Date());

    const dateRange = useMemo(() => {
        const start = startOfMonth(selectedMonth);
        const end = endOfMonth(selectedMonth);
        return { start, end };
    }, [selectedMonth]);

    const loadData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const { data: transData, error: transError } = await supabase.from('financial_transactions').select('*, patient:user_profiles!financial_transactions_patient_id_fkey(name)').eq('nutritionist_id', user.id).gte('transaction_date', format(dateRange.start, 'yyyy-MM-dd')).lte('transaction_date', format(dateRange.end, 'yyyy-MM-dd')).order('transaction_date', { ascending: false });
        if (transError) toast({ title: "Erro", description: transError.message, variant: "destructive" });
        else setTransactions(transData || []);

        const { data: patientsData, error: patientsError } = await supabase.from('user_profiles').select('id, name').eq('nutritionist_id', user.id);
        if (patientsError) toast({ title: "Erro", description: "Não foi possível carregar os pacientes.", variant: "destructive" });
        else setPatients(patientsData || []);
        setLoading(false);
    }, [user, toast, dateRange]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleSaveTransaction = async (data) => {
        const { type, patient_id, income_source, description, amount, transaction_date, category } = data;
        
        const payload = { 
            nutritionist_id: user.id, 
            type, 
            patient_id: patient_id || null, 
            income_source: type === 'income' ? income_source : null, 
            description, 
            amount, 
            transaction_date, 
            category: type === 'expense' ? category : null 
        };
        
        let query;
        if (data.id) {
            query = supabase.from('financial_transactions').update(payload).eq('id', data.id);
        } else {
            query = supabase.from('financial_transactions').insert(payload);
        }

        const { error } = await query;

        if (error) {
            toast({ title: "Erro", description: `Não foi possível salvar a transação: ${error.message}`, variant: "destructive" });
        } else {
            toast({ title: "Sucesso!", description: `Transação ${data.id ? 'atualizada' : 'criada'} com sucesso.` });
            setIsFormOpen(false);
            setEditingTransaction(null);
            loadData();
        }
    };

    const handleDeleteTransaction = async (id) => {
        const { error } = await supabase.from('financial_transactions').delete().eq('id', id);
        if (error) toast({ title: "Erro", description: "Não foi possível deletar a transação.", variant: "destructive" });
        else {
            toast({ title: "Sucesso!", description: "Transação deletada." });
            loadData();
        }
    };

    const handleExportCSV = () => {
        const csvData = transactions.map(t => ({ Data: t.transaction_date, Tipo: t.type === 'income' ? 'Receita' : 'Despesa', Descrição: t.description, Categoria: t.category || (t.income_source === 'patient_payment' ? 'Pag. Paciente' : 'Outra'), Paciente: t.patient?.name || '-', Valor: t.amount.toFixed(2)}));
        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `financeiro_hipozero_${format(selectedMonth, 'yyyy-MM')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const summary = useMemo(() => {
        const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        return { income, expense, balance: income - expense };
    }, [transactions]);
    
    const chartData = useMemo(() => ([{ name: 'Mês Atual', Receitas: summary.income, Despesas: summary.expense }]), [summary]);
    
    return (
        <div className="min-h-screen bg-background">
            <DashboardHeader user={user.profile} logout={signOut} title="Financeiro" subtitle="Controle suas receitas e despesas" icon={<DollarSign className="w-6 h-6 text-primary-foreground" />} backLink="/nutritionist" />
            <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
                        <Input type="month" value={format(selectedMonth, 'yyyy-MM')} onChange={(e) => setSelectedMonth(new Date(e.target.value + '-02'))} className="w-auto" />
                        <div className='flex justify-end gap-2 flex-wrap'>
                            <Button onClick={() => exportFinancialsToPdf(transactions, summary, format(selectedMonth, 'MMMM yyyy'))} variant="outline"><FileText className="w-4 h-4 mr-2" /> Exportar PDF</Button>
                            <Button onClick={handleExportCSV} variant="outline"><Download className="w-4 h-4 mr-2" /> Exportar CSV</Button>
                            <Dialog open={isFormOpen} onOpenChange={(open) => { if(!open) setEditingTransaction(null); setIsFormOpen(open);}}><DialogTrigger asChild><Button onClick={() => {setEditingTransaction(null); setIsFormOpen(true);}}><Plus className="w-4 h-4 mr-2" /> Nova Transação</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{editingTransaction ? 'Editar' : 'Nova'} Transação</DialogTitle></DialogHeader><TransactionForm transaction={editingTransaction} patients={patients} onSave={handleSaveTransaction} onCancel={() => {setEditingTransaction(null); setIsFormOpen(false);}} /></DialogContent></Dialog>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        <Card><CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Receitas</CardTitle><ArrowUp className="w-4 h-4 text-green-500"/></CardHeader><CardContent><p className="text-2xl font-bold text-green-500">R$ {summary.income.toFixed(2)}</p></CardContent></Card>
                        <Card><CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Despesas</CardTitle><ArrowDown className="w-4 h-4 text-red-500"/></CardHeader><CardContent><p className="text-2xl font-bold text-red-500">R$ {summary.expense.toFixed(2)}</p></CardContent></Card>
                        <Card><CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">Saldo</CardTitle><Banknote className="w-4 h-4 text-blue-500"/></CardHeader><CardContent><p className="text-2xl font-bold text-blue-500">R$ {summary.balance.toFixed(2)}</p></CardContent></Card>
                        <Card className="md:col-span-2 lg:col-span-1"><CardHeader><CardTitle className="text-sm font-medium">Balanço do Mês</CardTitle></CardHeader><CardContent className="p-0"><ResponsiveContainer width="100%" height={80}><RechartsBarChart data={chartData} layout="vertical" barSize={20}><Tooltip cursor={{fill: 'transparent'}} contentStyle={{backgroundColor: 'hsl(var(--card))', border: 'none'}} formatter={(value) => `R$ ${value.toFixed(2)}`} /><Bar dataKey="Receitas" stackId="a" fill="hsl(var(--primary))" radius={[4, 0, 0, 4]} /><Bar dataKey="Despesas" stackId="a" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]}/></RechartsBarChart></ResponsiveContainer></CardContent></Card>
                    </div>

                    <Card id="financial-report">
                        <CardHeader><CardTitle>Histórico de Transações do Mês</CardTitle></CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {loading ? <p>Carregando...</p> : transactions.length > 0 ? transactions.map(t => (
                                    <div key={t.id} className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                                        <div>
                                            <p className={`font-semibold ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>R$ {t.amount.toFixed(2)}</p>
                                            <p className="text-sm text-foreground">{t.description}</p>
                                            <p className="text-xs text-muted-foreground">{format(new Date(t.transaction_date + 'T00:00:00'), 'dd/MM/yyyy')} {t.patient ? `- ${t.patient.name}` : (t.category ? `- ${t.category}` : '')}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => { setEditingTransaction(t); setIsFormOpen(true); }}><Edit className="w-4 h-4" /></Button>
                                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteTransaction(t.id)}><Trash2 className="w-4 h-4" /></Button>
                                        </div>
                                    </div>
                                )) : <p className="text-center text-muted-foreground py-8">Nenhuma transação registrada para este mês.</p>}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </main>
        </div>
    );
}
