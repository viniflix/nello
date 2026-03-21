import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Plus, Search, Loader2, ListFilter, Users, ArchiveRestore, Clock,
    LayoutGrid, List, Flame, CalendarOff, MoreVertical, Archive, FileText, MessageCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuLabel,
    DropdownMenuRadioGroup, DropdownMenuRadioItem,
    DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuItem
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { motion, AnimatePresence } from 'framer-motion';
import AddPatientModal from '@/components/nutritionist/AddPatientModal';
import ArchivedPatientsModal from '@/components/nutritionist/ArchivedPatientsModal';
import PatientCard from '@/components/nutritionist/PatientCard';
import { usePatientFormStore } from '@/stores/usePatientFormStore';
import {
    fetchAllNutritionistPatients, archivePatient, hardDeletePatient, unarchivePatient
} from '@/lib/supabase/patient-queries';
import { getPatientAppointmentsSummary } from '@/lib/supabase/agenda-queries';
import { useOnlinePresence } from '@/hooks/useOnlinePresence';
import { useToast } from '@/components/ui/use-toast';
import { patientRoute } from '@/lib/utils/patientRoutes';

// ── Helpers ──────────────────────────────────────────────────────────────────
const SESSION_KEY = 'patients_page_state';

const loadPersistedState = () => {
    try {
        const saved = sessionStorage.getItem(SESSION_KEY);
        return saved ? JSON.parse(saved) : {};
    } catch {
        return {};
    }
};

const sortOptions = {
    name_asc:         { column: 'name',       ascending: true,  label: 'Ordem Alfabética' },
    created_at_desc:  { column: 'created_at', ascending: false, label: 'Mais Recentes'    },
    created_at_asc:   { column: 'created_at', ascending: true,  label: 'Mais Antigos'     },
};

const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

// ── Component ─────────────────────────────────────────────────────────────────
const PatientsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { updateField } = usePatientFormStore();
    const { toast } = useToast();
    const { isUserOnline } = useOnlinePresence();

    // ── State (with sessionStorage persistence) ──
    const persisted = useMemo(loadPersistedState, []);
    const [patients,            setPatients]            = useState([]);
    const [apptSummary,         setApptSummary]         = useState(new Map());
    const [searchTerm,          setSearchTerm]          = useState('');
    const [loading,             setLoading]             = useState(true);
    const [sortOrder,           setSortOrder]           = useState(persisted.sortOrder     || 'name_asc');
    const [filterStatus,        setFilterStatus]        = useState(persisted.filterStatus  || 'all');
    const [viewMode,            setViewMode]            = useState(persisted.viewMode      || 'grid');
    const [activeChip,          setActiveChip]          = useState(null); // 'new30' | 'noAppt'
    const [showAddPatientModal, setShowAddPatientModal] = useState(false);
    const [showArchivedModal,   setShowArchivedModal]   = useState(false);

    // Persist state changes
    useEffect(() => {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ sortOrder, filterStatus, viewMode }));
    }, [sortOrder, filterStatus, viewMode]);

    // Auto-open from URL params
    useEffect(() => {
        const name = searchParams.get('addPatientName');
        if (name) {
            setShowAddPatientModal(true);
            updateField('name', name);
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, setSearchParams, updateField]);

    // ── Data fetching ────────────────────────────────────────────────────────
    const fetchPatients = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        const [{ active, archived, error }, summary] = await Promise.all([
            fetchAllNutritionistPatients(user.id),
            getPatientAppointmentsSummary(user.id).catch(() => new Map()),
        ]);
        if (error) {
            toast({ title: "Erro de Conexão", description: "Não foi possível carregar os pacientes.", variant: "destructive" });
        } else {
            setPatients([...active, ...archived]);
            setApptSummary(summary);
        }
        setLoading(false);
    }, [user?.id, toast]);

    useEffect(() => { fetchPatients(); }, [fetchPatients]);

    // ── Actions ──────────────────────────────────────────────────────────────
    const handleArchive = async (patient) => {
        toast({ title: "Aguarde", description: "Arquivando paciente..." });
        const { success } = await archivePatient(patient.id, user.id);
        if (success) {
            toast({ title: "Paciente Arquivado", description: "Chat e edição bloqueados.", variant: "success" });
            fetchPatients();
        } else {
            toast({ title: "Erro", description: "Não foi possível arquivar.", variant: "destructive" });
        }
    };

    const handleUnarchive = async (patient) => {
        toast({ title: "Aguarde", description: "Reativando paciente..." });
        const { success } = await unarchivePatient(patient.id, user.id);
        if (success) {
            toast({ title: "Paciente Reativado", description: "Comunicação reestabelecida.", variant: "success" });
            fetchPatients();
            setShowArchivedModal(false);
        } else {
            toast({ title: "Aviso", description: "Pode ser que o paciente já esteja vinculado a outro nutricionista.", variant: "destructive" });
        }
    };

    const handleDelete = async (patient) => {
        toast({ title: "Aguarde", description: "Excluindo paciente..." });
        const { success } = await hardDeletePatient(patient.id);
        if (success) {
            toast({ title: "Conta Excluída", description: "E-mail liberado permanentemente.", variant: "success" });
            fetchPatients();
        } else {
            toast({ title: "Erro", description: "Não foi possível excluir.", variant: "destructive" });
        }
    };

    // ── Derived data (single pass — B6) ─────────────────────────────────────
    const { activePatients, archivedPatients, stats } = useMemo(() => {
        const activeList = [];
        const archivedList = [];
        let online = 0, pending = 0;
        const now = new Date();
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

        patients.forEach(p => {
            const isArchived = p.is_active === false || p.arquivadoHistorico;
            if (isArchived) {
                archivedList.push(p);
            } else {
                activeList.push(p);
                if (p.needs_password_reset === true) pending++;
                if (isUserOnline(p.id)) online++;
            }
        });

        // Smart chip counts: "Novos 30d" — created in last 30 days
        const new30 = activeList.filter(p => p.created_at && new Date(p.created_at) >= thirtyDaysAgo).length;
        // Smart chip: "Sem Agenda" — no next appointment
        const noAppt = activeList.filter(p => !apptSummary.get(p.id)?.next).length;

        return {
            activePatients:   activeList,
            archivedPatients: archivedList,
            stats: { active: activeList.length, online, pending, new30, noAppt },
        };
    }, [patients, isUserOnline, apptSummary]);

    // ── Filtered & sorted list ───────────────────────────────────────────────
    const filteredPatients = useMemo(() => {
        const getPriority = (p) => {
            const isArchived = p.is_active === false || p.arquivadoHistorico;
            if (isArchived) return 4;
            if (p.needs_password_reset === true) return 3;
            if (isUserOnline(p.id)) return 1;
            return 2;
        };

        // ── Global text search (bypasses filter, includes archived) ──
        if (searchTerm.trim()) {
            const lower = searchTerm.toLowerCase();
            const matched = patients.filter(p =>
                (p.name  && p.name.toLowerCase().includes(lower))  ||
                (p.email && p.email.toLowerCase().includes(lower)) ||
                (p.phone && p.phone.includes(lower))               ||
                (p.cpf   && p.cpf.includes(lower))
            );
            return matched.sort((a, b) => getPriority(a) - getPriority(b));
        }

        // ── Smart chip filter (overrides filterStatus) ──
        let base = [...activePatients];

        if (activeChip === 'new30') {
            base = base.filter(p => p.created_at && new Date(p.created_at) >= new Date(THIRTY_DAYS_AGO));
        } else if (activeChip === 'noAppt') {
            base = base.filter(p => !apptSummary.get(p.id)?.next);
        } else {
            // ── Standard filter ──
            if (filterStatus === 'active') {
                base = base.filter(p => p.needs_password_reset !== true);
            } else if (filterStatus === 'pending') {
                base = base.filter(p => p.needs_password_reset === true);
            } else if (filterStatus === 'online') {
                base = base.filter(p => isUserOnline(p.id));
            }
        }

        // Sort
        const { column, ascending } = sortOptions[sortOrder];
        return [...base].sort((a, b) => {
            const vA = a[column], vB = b[column];
            if (!vA) return ascending ? 1 : -1;
            if (!vB) return ascending ? -1 : 1;
            if (vA < vB) return ascending ? -1 : 1;
            if (vA > vB) return ascending ? 1 : -1;
            return 0;
        });
    }, [patients, activePatients, searchTerm, filterStatus, sortOrder, activeChip, isUserOnline, apptSummary]);

    // ── Contextual empty state message ───────────────────────────────────────  
    const emptyMessage = useMemo(() => {
        if (searchTerm) return { title: `Nenhum resultado para "${searchTerm}"`, sub: "Verifique o nome, e-mail ou CPF e tente novamente." };
        if (activeChip === 'new30') return { title: "Nenhum paciente novo nos últimos 30 dias.", sub: "" };
        if (activeChip === 'noAppt') return { title: "Todos os pacientes têm consulta agendada! 🎉", sub: "" };
        if (filterStatus === 'online') return { title: "Nenhum paciente está online no momento.", sub: "Os pacientes online aparecerão aqui assim que acessarem a plataforma." };
        if (filterStatus === 'pending') return { title: "Todos os convites foram aceitos! 🎉", sub: "Nenhum convite pendente de primeiro acesso." };
        if (filterStatus === 'active') return { title: "Nenhum paciente em tratamento.", sub: "Adicione um novo paciente para começar." };
        return { title: "Você ainda não cadastrou nenhum paciente.", sub: "Clique em \"Adicionar Paciente\" para começar." };
    }, [searchTerm, filterStatus, activeChip]);

    // ── Toggle chip (deselect on second click) ───────────────────────────────
    const handleChipClick = (chip) => {
        setActiveChip(prev => prev === chip ? null : chip);
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col min-h-screen bg-background">
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="max-w-7xl mx-auto w-full px-4 md:px-8 pt-4 md:pt-8 min-w-0 overflow-x-hidden"
            >
                {/* ── Header ── */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 md:mb-8">
                    <div className="flex flex-col justify-center flex-1 min-w-0 text-center sm:text-left">
                        <h1 className="text-2xl md:text-3xl font-bold font-heading uppercase tracking-wide text-primary">
                            Meus Pacientes
                        </h1>

                        {/* Stats Pills */}
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2 text-sm">
                            <div className="flex items-center text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full border border-border/50">
                                <Users className="w-3.5 h-3.5 mr-1.5" />
                                <span className="font-semibold text-foreground">{stats.active}</span>
                                <span className="ml-1">Ativos</span>
                            </div>
                            {stats.online > 0 && (
                                <div className="flex items-center text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                                    <span className="font-semibold">{stats.online}</span>
                                    <span className="ml-1">Online</span>
                                </div>
                            )}
                            {stats.pending > 0 && (
                                <div className="flex items-center text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                                    <Clock className="w-3.5 h-3.5 mr-1.5" />
                                    <span className="font-semibold">{stats.pending}</span>
                                    <span className="ml-1">Pendentes</span>
                                </div>
                            )}
                        </div>

                        {/* Smart Chips */}
                        {!loading && activePatients.length > 0 && (
                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                                <Badge
                                    variant={activeChip === 'new30' ? 'default' : 'outline'}
                                    className="cursor-pointer text-xs gap-1 select-none transition-colors"
                                    onClick={() => handleChipClick('new30')}
                                >
                                    <Flame className="w-3 h-3" />
                                    Novos (30d) · {stats.new30}
                                </Badge>
                                <Badge
                                    variant={activeChip === 'noAppt' ? 'default' : 'outline'}
                                    className="cursor-pointer text-xs gap-1 select-none transition-colors"
                                    onClick={() => handleChipClick('noAppt')}
                                >
                                    <CalendarOff className="w-3 h-3" />
                                    Sem Agenda · {stats.noAppt}
                                </Badge>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex-shrink-0 flex flex-col sm:flex-row justify-center sm:justify-end gap-3 w-full sm:w-auto">
                        {archivedPatients.length > 0 && (
                            <Button
                                variant="outline"
                                onClick={() => setShowArchivedModal(true)}
                                className="w-full sm:w-auto font-medium text-muted-foreground hover:text-foreground"
                            >
                                <ArchiveRestore className="w-4 h-4 mr-2" />
                                Ver Arquivados ({archivedPatients.length})
                            </Button>
                        )}
                        <Button
                            onClick={() => setShowAddPatientModal(true)}
                            className="w-full sm:w-auto bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Adicionar Paciente
                        </Button>
                    </div>
                </div>

                {/* ── Search + Filters ── */}
                <Card className="bg-card shadow-card-dark rounded-xl overflow-hidden">
                    <CardHeader className="pb-2">
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1 min-w-0">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <Input
                                    placeholder="Procurar paciente (Nome, Email, CPF...)"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="pl-10 bg-muted/50 border-transparent focus-visible:ring-1 focus-visible:ring-primary h-10 transition-all focus:bg-background"
                                />
                            </div>

                            <div className="flex gap-2 shrink-0">
                                {/* View Toggle */}
                                <ToggleGroup
                                    type="single"
                                    value={viewMode}
                                    onValueChange={v => v && setViewMode(v)}
                                    className="border border-input rounded-md"
                                >
                                    <ToggleGroupItem value="grid" aria-label="Grid view" className="h-10 w-10">
                                        <LayoutGrid className="h-4 w-4" />
                                    </ToggleGroupItem>
                                    <ToggleGroupItem value="list" aria-label="List view" className="h-10 w-10">
                                        <List className="h-4 w-4" />
                                    </ToggleGroupItem>
                                </ToggleGroup>

                                {/* Filters Dropdown */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="h-10 shrink-0 font-medium">
                                            <ListFilter className="w-4 h-4 mr-2" />
                                            Filtros
                                            {(filterStatus !== 'all' && !activeChip) && (
                                                <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                                            )}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-[220px]">
                                        <DropdownMenuLabel>Exibir Pacientes</DropdownMenuLabel>
                                        <DropdownMenuRadioGroup value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setActiveChip(null); }}>
                                            <DropdownMenuRadioItem value="all">Todos os Ativos</DropdownMenuRadioItem>
                                            <DropdownMenuRadioItem value="active">Em Tratamento</DropdownMenuRadioItem>
                                            <DropdownMenuRadioItem value="pending">Convites Pendentes</DropdownMenuRadioItem>
                                            <DropdownMenuRadioItem value="online">Apenas Online</DropdownMenuRadioItem>
                                        </DropdownMenuRadioGroup>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
                                        <DropdownMenuRadioGroup value={sortOrder} onValueChange={setSortOrder}>
                                            {Object.entries(sortOptions).map(([key, { label }]) => (
                                                <DropdownMenuRadioItem key={key} value={key}>{label}</DropdownMenuRadioItem>
                                            ))}
                                        </DropdownMenuRadioGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent>
                        {loading ? (
                            <div className="flex justify-center items-center h-40">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            </div>
                        ) : filteredPatients.length > 0 ? (
                            viewMode === 'grid' ? (
                                /* ── Grid View ── */
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <AnimatePresence mode="popLayout">
                                        {filteredPatients.map((patient, i) => (
                                            <motion.div
                                                key={patient.id}
                                                layout
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
                                                exit={{ opacity: 0, scale: 0.96 }}
                                            >
                                                <PatientCard
                                                    patient={patient}
                                                    isOnline={isUserOnline(patient.id)}
                                                    onArchive={handleArchive}
                                                    onUnarchive={handleUnarchive}
                                                    onDelete={handleDelete}
                                                    appointmentSummary={apptSummary}
                                                />
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            ) : (
                                /* ── List / Table View ── */
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Paciente</TableHead>
                                            <TableHead className="hidden md:table-cell">Status</TableHead>
                                            <TableHead className="hidden lg:table-cell">Última Consulta</TableHead>
                                            <TableHead className="hidden lg:table-cell">Próxima Consulta</TableHead>
                                            <TableHead className="text-right">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        <AnimatePresence>
                                            {filteredPatients.map(patient => {
                                                const isArchived = patient.is_active === false || patient.arquivadoHistorico;
                                                const appt = apptSummary.get(patient.id);
                                                const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
                                                return (
                                                    <motion.tr
                                                        key={patient.id}
                                                        layout
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className={`border-b transition-colors hover:bg-muted/30 ${isArchived ? 'opacity-50' : 'cursor-pointer'}`}
                                                        onClick={() => !isArchived && navigate(patientRoute(patient, 'hub'))}
                                                    >
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isUserOnline(patient.id) ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                                                                <div>
                                                                    <p className="font-medium text-sm">{patient.name}</p>
                                                                    <p className="text-xs text-muted-foreground">{patient.email}</p>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="hidden md:table-cell">
                                                            {isArchived
                                                                ? <Badge variant="outline" className="text-[10px] border-dashed">Arquivado</Badge>
                                                                : patient.needs_password_reset
                                                                    ? <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Pendente</Badge>
                                                                    : <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Ativo</Badge>
                                                            }
                                                        </TableCell>
                                                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{formatDate(appt?.last)}</TableCell>
                                                        <TableCell className="hidden lg:table-cell text-sm">
                                                            {appt?.next
                                                                ? <span className="text-emerald-600 font-medium">{formatDate(appt.next)}</span>
                                                                : <span className="text-amber-500 text-xs">Sem Agenda</span>
                                                            }
                                                        </TableCell>
                                                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                        <MoreVertical className="h-4 w-4" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end" className="w-44">
                                                                    {isArchived ? (
                                                                        <DropdownMenuItem onClick={() => handleUnarchive(patient)} className="cursor-pointer">
                                                                            <ArchiveRestore className="mr-2 h-4 w-4" />
                                                                            Reativar Paciente
                                                                        </DropdownMenuItem>
                                                                    ) : (
                                                                        <>
                                                                            <DropdownMenuItem onClick={() => navigate(patientRoute(patient, 'hub'))} className="cursor-pointer">
                                                                                <FileText className="mr-2 h-4 w-4" />
                                                                                Prontuário
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem onClick={() => navigate(`/nutritionist/chat?patient=${patient.id}`)} className="cursor-pointer">
                                                                                <MessageCircle className="mr-2 h-4 w-4" />
                                                                                Chat
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuSeparator />
                                                                            <DropdownMenuItem onClick={() => handleArchive(patient)} className="cursor-pointer">
                                                                                <Archive className="mr-2 h-4 w-4" />
                                                                                Arquivar
                                                                            </DropdownMenuItem>
                                                                        </>
                                                                    )}
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </TableCell>
                                                    </motion.tr>
                                                );
                                            })}
                                        </AnimatePresence>
                                    </TableBody>
                                </Table>
                            )
                        ) : (
                            /* ── Empty State ── */
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-center py-16 md:col-span-3"
                            >
                                <Users className="mx-auto h-12 w-12 text-muted-foreground/20 mb-4" />
                                <h3 className="text-lg font-semibold text-foreground">{emptyMessage.title}</h3>
                                {emptyMessage.sub && (
                                    <p className="text-muted-foreground mt-1.5 max-w-sm mx-auto text-sm">{emptyMessage.sub}</p>
                                )}
                                {!searchTerm && activePatients.length === 0 && (
                                    <Button className="mt-6" onClick={() => setShowAddPatientModal(true)}>
                                        <Plus className="w-4 h-4 mr-2" />
                                        Adicionar Paciente
                                    </Button>
                                )}
                            </motion.div>
                        )}
                    </CardContent>
                </Card>
            </motion.div>

            {/* ── Modals ── */}
            <AddPatientModal
                isOpen={showAddPatientModal}
                setIsOpen={setShowAddPatientModal}
                onPatientAdded={fetchPatients}
            />

            <ArchivedPatientsModal
                isOpen={showArchivedModal}
                onClose={setShowArchivedModal}
                archivedPatients={archivedPatients}
                handleUnarchive={handleUnarchive}
                handleDelete={handleDelete}
            />
        </div>
    );
};

export default PatientsPage;