import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Calendar as CalendarIcon, Plus, Clock, User, Edit, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const AppointmentForm = ({ appointment, patients, onSave, onCancel }) => {
    const [formData, setFormData] = useState({
        patient_id: appointment?.patient_id || '',
        appointment_time_date: appointment ? format(new Date(appointment.appointment_time), 'yyyy-MM-dd') : '',
        appointment_time_hour: appointment ? format(new Date(appointment.appointment_time), 'HH:mm') : '',
        notes: appointment?.notes || ''
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        const [year, month, day] = formData.appointment_time_date.split('-').map(Number);
        const [hours, minutes] = formData.appointment_time_hour.split(':').map(Number);
        const appointment_time = new Date(year, month - 1, day, hours, minutes);
        onSave({ ...appointment, ...formData, appointment_time: appointment_time.toISOString() });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <Label htmlFor="patient_id">Paciente</Label>
                <Select required value={formData.patient_id} onValueChange={(value) => setFormData(prev => ({ ...prev, patient_id: value }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione um paciente" /></SelectTrigger>
                    <SelectContent>
                        {patients.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="date">Data</Label>
                    <Input id="date" type="date" required value={formData.appointment_time_date} onChange={e => setFormData(prev => ({ ...prev, appointment_time_date: e.target.value }))} />
                </div>
                <div>
                    <Label htmlFor="time">Hora</Label>
                    <Input id="time" type="time" required value={formData.appointment_time_hour} onChange={e => setFormData(prev => ({ ...prev, appointment_time_hour: e.target.value }))} />
                </div>
            </div>
            <div>
                <Label htmlFor="notes">Observações</Label>
                <Input id="notes" value={formData.notes} onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))} />
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
                <Button type="submit">Salvar</Button>
            </DialogFooter>
        </form>
    );
};

export default function AgendaPage() {
    const { user, signOut } = useAuth();
    const { toast } = useToast();
    const [appointments, setAppointments] = useState([]);
    const [patients, setPatients] = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingAppointment, setEditingAppointment] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const { data: apptsData, error: apptsError } = await supabase.from('appointments').select('*, patient:user_profiles!appointments_patient_id_fkey(name)').eq('nutritionist_id', user.id);
        if (apptsError) toast({ title: "Erro", description: apptsError.message, variant: "destructive" });
        else setAppointments(apptsData || []);

        const { data: patientsData, error: patientsError } = await supabase.from('user_profiles').select('id, name').eq('nutritionist_id', user.id);
        if (patientsError) toast({ title: "Erro", description: "Não foi possível carregar os pacientes.", variant: "destructive" });
        else setPatients(patientsData || []);
        setLoading(false);
    }, [user, toast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleSaveAppointment = async (data) => {
        const { patient_id, appointment_time, notes } = data;
        const payload = {
            nutritionist_id: user.id,
            patient_id,
            appointment_time,
            notes,
            status: 'scheduled'
        };

        let query;
        if (data.id) {
            query = supabase.from('appointments').update(payload).eq('id', data.id);
        } else {
            query = supabase.from('appointments').insert(payload);
        }
        
        const { error } = await query;

        if (error) {
            toast({ title: "Erro", description: `Não foi possível salvar o agendamento. ${error.message}`, variant: "destructive" });
        } else {
            toast({ title: "Sucesso!", description: `Agendamento ${data.id ? 'atualizado' : 'criado'} com sucesso.` });
            setIsFormOpen(false);
            setEditingAppointment(null);
            loadData();
        }
    };

    const handleDeleteAppointment = async (id) => {
        const { error } = await supabase.from('appointments').delete().eq('id', id);
        if (error) toast({ title: "Erro", description: "Não foi possível deletar o agendamento.", variant: "destructive" });
        else {
            toast({ title: "Sucesso!", description: "Agendamento deletado." });
            loadData();
        }
    };

    const appointmentsOnSelectedDate = appointments
        .filter(a => format(new Date(a.appointment_time), 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd'))
        .sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time));

    return (
        <div className="min-h-screen bg-background">
            <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-1">
                        <Card className="glass-card">
                            <CardContent className="p-0">
                                <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} className="w-full" locale={ptBR} />
                            </CardContent>
                        </Card>
                    </div>
                    <div className="md:col-span-2">
                        <Card className="glass-card">
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <CardTitle>Consultas para {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}</CardTitle>
                                        <CardDescription>Visualize e gerencie os agendamentos do dia.</CardDescription>
                                    </div>
                                    <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                                        <DialogTrigger asChild>
                                            <Button onClick={() => setEditingAppointment(null)}><Plus className="w-4 h-4 mr-2" /> Agendar</Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>{editingAppointment ? 'Editar' : 'Novo'} Agendamento</DialogTitle>
                                            </DialogHeader>
                                            <AppointmentForm
                                                appointment={editingAppointment}
                                                patients={patients}
                                                onSave={handleSaveAppointment}
                                                onCancel={() => setIsFormOpen(false)}
                                            />
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {loading ? <p>Carregando...</p> : (
                                    <div className="space-y-4">
                                        {appointmentsOnSelectedDate.length > 0 ? appointmentsOnSelectedDate.map(appt => (
                                            <div key={appt.id} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                                                <div className="flex items-center gap-4">
                                                    <div className="text-primary font-bold flex flex-col items-center">
                                                        <Clock className="w-5 h-5 mb-1" />
                                                        <span>{format(new Date(appt.appointment_time), 'HH:mm')}</span>
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-foreground flex items-center gap-2"><User className="w-4 h-4" /> {appt.patient.name}</p>
                                                        {appt.notes && <p className="text-sm text-muted-foreground">{appt.notes}</p>}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button variant="ghost" size="icon" onClick={() => { setEditingAppointment(appt); setIsFormOpen(true); }}><Edit className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteAppointment(appt.id)}><Trash2 className="w-4 h-4" /></Button>
                                                </div>
                                            </div>
                                        )) : <p className="text-center text-muted-foreground py-8">Nenhuma consulta para esta data.</p>}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </motion.div>
            </main>
        </div>
    );
}