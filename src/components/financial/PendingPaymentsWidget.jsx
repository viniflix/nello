import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateInputWithCalendar } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, Calendar, AlertCircle } from 'lucide-react';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrency } from '@/lib/utils';
import { getPendingPayments, updateTransactionStatus, rescheduleTransaction, deleteTransaction } from '@/lib/supabase/financial-queries';
import { useToast } from '@/components/ui/use-toast';

export default function PendingPaymentsWidget({ nutritionistId, onUpdate }) {
    const { toast } = useToast();
    const [pendingPayments, setPendingPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmDialog, setConfirmDialog] = useState(null);
    const [cancelDialog, setCancelDialog] = useState(null);
    const [rescheduleDialog, setRescheduleDialog] = useState(null);
    const [rescheduleDate, setRescheduleDate] = useState('');

    useEffect(() => {
        if (nutritionistId) {
            loadPendingPayments();
        }
    }, [nutritionistId]);

    const loadPendingPayments = async () => {
        if (!nutritionistId) return;
        setLoading(true);
        try {
            const data = await getPendingPayments(nutritionistId);
            setPendingPayments(data);
        } catch (error) {
            console.error('Error loading pending payments:', error);
            toast({
                title: "Erro",
                description: "Não foi possível carregar os pagamentos pendentes.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmPayment = async (transactionId) => {
        try {
            await updateTransactionStatus(transactionId, 'paid');
            toast({
                title: "Sucesso!",
                description: "Pagamento confirmado com sucesso."
            });
            setConfirmDialog(null);
            loadPendingPayments();
            if (onUpdate) onUpdate();
        } catch (error) {
            toast({
                title: "Erro",
                description: "Não foi possível confirmar o pagamento.",
                variant: "destructive"
            });
        }
    };

    const handleCancelPayment = async (transactionId) => {
        try {
            await deleteTransaction(transactionId);
            toast({
                title: "Sucesso!",
                description: "Pagamento cancelado e removido."
            });
            setCancelDialog(null);
            loadPendingPayments();
            if (onUpdate) onUpdate();
        } catch (error) {
            toast({
                title: "Erro",
                description: "Não foi possível cancelar o pagamento.",
                variant: "destructive"
            });
        }
    };

    const handleReschedule = async (transactionId) => {
        if (!rescheduleDate) {
            toast({
                title: "Erro",
                description: "Selecione uma data para reagendar.",
                variant: "destructive"
            });
            return;
        }

        try {
            await rescheduleTransaction(transactionId, rescheduleDate);
            toast({
                title: "Sucesso!",
                description: "Cobrança reagendada com sucesso."
            });
            setRescheduleDialog(null);
            setRescheduleDate('');
            loadPendingPayments();
            if (onUpdate) onUpdate();
        } catch (error) {
            toast({
                title: "Erro",
                description: "Não foi possível reagendar a cobrança.",
                variant: "destructive"
            });
        }
    };

    const formatTransactionDate = (dateString) => {
        const date = parseISO(dateString + 'T00:00:00');
        if (isToday(date)) {
            return 'Hoje';
        } else if (isYesterday(date)) {
            return 'Ontem';
        } else {
            return format(date, "dd 'de' MMMM", { locale: ptBR });
        }
    };

    const getDaysOverdue = (dateString) => {
        const date = parseISO(dateString + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const transactionDate = new Date(date);
        transactionDate.setHours(0, 0, 0, 0);
        const diffTime = today - transactionDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    };

    if (loading) {
        return null;
    }

    if (pendingPayments.length === 0) {
        return null; // Don't show widget if no pending payments
    }

    return (
        <>
            <Card className="mb-6 border-2 border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                        <CardTitle className="text-lg font-semibold text-orange-900 dark:text-orange-100">
                            Pagamentos Pendentes
                        </CardTitle>
                    </div>
                    <CardDescription className="text-orange-700 dark:text-orange-300">
                        Consultas realizadas aguardando confirmação de pagamento
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {pendingPayments.map((transaction) => {
                            const daysOverdue = getDaysOverdue(transaction.transaction_date);
                            const isOverdue = daysOverdue > 0;

                            return (
                                <div
                                    key={transaction.id}
                                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-white dark:bg-gray-900 rounded-lg border border-orange-200 dark:border-orange-800 shadow-sm"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="font-semibold text-sm sm:text-base text-foreground truncate">
                                                {transaction.description || `Consulta com ${transaction.patient?.name || 'Paciente'}`}
                                            </p>
                                            {isOverdue && (
                                                <Badge variant="destructive" className="text-xs">
                                                    {daysOverdue} {daysOverdue === 1 ? 'dia' : 'dias'} atrasado
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                                            <span>
                                                {transaction.patient?.name || 'Paciente não identificado'}
                                            </span>
                                            <span>•</span>
                                            <span>
                                                {formatTransactionDate(transaction.transaction_date)}
                                            </span>
                                            <span>•</span>
                                            <span className="font-semibold text-orange-600 dark:text-orange-400">
                                                {formatCurrency(transaction.amount)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                                        <Button
                                            size="sm"
                                            onClick={() => setConfirmDialog(transaction.id)}
                                            className="flex-1 sm:flex-initial bg-green-600 hover:bg-green-700 text-white"
                                        >
                                            <CheckCircle2 className="w-4 h-4 mr-1.5" />
                                            <span className="hidden sm:inline">Confirmar Pagamento</span>
                                            <span className="sm:hidden">Confirmar</span>
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setRescheduleDialog({ id: transaction.id, date: transaction.transaction_date })}
                                            className="flex-1 sm:flex-initial"
                                        >
                                            <Calendar className="w-4 h-4 mr-1.5" />
                                            <span className="hidden sm:inline">Reagendar</span>
                                            <span className="sm:hidden">Reagendar</span>
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setCancelDialog(transaction.id)}
                                            className="flex-1 sm:flex-initial text-destructive hover:text-destructive hover:bg-destructive/10"
                                        >
                                            <XCircle className="w-4 h-4 mr-1.5" />
                                            <span className="hidden sm:inline">Cancelar</span>
                                            <span className="sm:hidden">Cancelar</span>
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Confirm Payment Dialog */}
            <AlertDialog open={!!confirmDialog} onOpenChange={(open) => !open && setConfirmDialog(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Pagamento</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja confirmar este pagamento? Esta ação marcará a transação como paga.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => handleConfirmPayment(confirmDialog)}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            Confirmar Pagamento
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Cancel Payment Dialog */}
            <AlertDialog open={!!cancelDialog} onOpenChange={(open) => !open && setCancelDialog(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar Pagamento</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja cancelar este pagamento? Esta ação removerá a transação permanentemente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => handleCancelPayment(cancelDialog)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Cancelar Pagamento
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Reschedule Dialog */}
            <Dialog open={!!rescheduleDialog} onOpenChange={(open) => !open && setRescheduleDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reagendar Cobrança</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label htmlFor="reschedule_date">Nova Data *</Label>
                            <DateInputWithCalendar
                                id="reschedule_date"
                                required
                                value={rescheduleDate || (rescheduleDialog ? rescheduleDialog.date : '')}
                                onChange={(value) => setRescheduleDate(value)}
                                min={format(new Date(), 'yyyy-MM-dd')}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRescheduleDialog(null)}>
                            Cancelar
                        </Button>
                        <Button onClick={() => handleReschedule(rescheduleDialog.id)}>
                            Reagendar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

