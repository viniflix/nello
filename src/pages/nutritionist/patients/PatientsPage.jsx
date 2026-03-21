import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Plus, Search, Loader2, ListFilter, Users, ArchiveRestore, Clock,
    LayoutGrid, List, Flame, MoreVertical, Archive, FileText, MessageCircle, AlertCircle, Trash2, PhoneOff
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';
import AddPatientModal from '@/components/nutritionist/AddPatientModal';
import ArchivedPatientsModal from '@/components/nutritionist/ArchivedPatientsModal';
import PatientCard from '@/components/nutritionist/PatientCard';
import { usePatientFormStore } from '@/stores/usePatientFormStore';
import {
    fetchAllNutritionistPatients, archivePatient, hardDeletePatient, getModulesStatus
} from '@/lib/supabase/patient-queries';
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

// ── ListActionsMenu (For Table View) ─────────────────────────────────────────
const ListActionsMenu = ({ patient, onArchive, onDelete }) => {
    const navigate = useNavigate();
    const [showArchive, setShowArchive] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [isCheckingData, setIsCheckingData] = useState(false);
    const canDeleteRef = React.useRef(null);
    const isArchived = patient.is_active === false || patient.arquivadoHistorico;

    const handleOpen = async (open) => {
        if (open && !isArchived && canDeleteRef.current === null) {
            setIsCheckingData(true);
            try {
                const { data } = await getModulesStatus(patient.id);
                const hasData = data ? Object.values(data).some(v => v !== 'not_started') : false;
                canDeleteRef.current = !hasData;
            } catch { canDeleteRef.current = false; }
            finally { setIsCheckingData(false); }
        }
    };

    return (
        <>
            <div onClick={e => e.stopPropagation()}>
                <DropdownMenu onOpenChange={handleOpen}>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            {isCheckingData ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <MoreVertical className="h-4 w-4" />}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                        {isArchived ? (
                            <DropdownMenuItem onClick={() => navigate(patientRoute(patient, 'hub'))} className="cursor-pointer">
                                <FileText className="mr-2 h-4 w-4" /> Ver Histórico
                            </DropdownMenuItem>
                        ) : (
                            <>
                                <DropdownMenuItem onClick={() => navigate(patientRoute(patient, 'hub'))} className="cursor-pointer"><FileText className="mr-2 h-4 w-4" /> Prontuário</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/nutritionist/chat?patient=${patient.id}`)} className="cursor-pointer"><MessageCircle className="mr-2 h-4 w-4" /> Chat</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setShowArchive(true)} className="cursor-pointer"><Archive className="mr-2 h-4 w-4" /> Arquivar</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setShowDelete(true)} disabled={isCheckingData || !canDeleteRef.current} className={`cursor-pointer ${canDeleteRef.current ? 'text-destructive focus:text-destructive' : 'text-muted-foreground'}`}>
                                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Modals */}
            <Dialog open={showArchive} onOpenChange={setShowArchive}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Arquivar Paciente</DialogTitle><DialogDescription>O vínculo será encerrado. Este paciente ficará livre para outro convite, e os dados atuais ficarão salvos como Read-Only no seu histórico.</DialogDescription></DialogHeader>
                    <DialogFooter><Button variant="outline" onClick={() => setShowArchive(false)}>Cancelar</Button><Button variant="destructive" onClick={() => { setShowArchive(false); onArchive(patient); }}>Sim, Arquivar</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showDelete} onOpenChange={setShowDelete}>
                <DialogContent>
                    <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><AlertCircle className="h-5 w-5" /> Excluir Permanentemente</DialogTitle><DialogDescription>Você está prestes a excluir permanentemente <strong>{patient.name}</strong>. Esta ação não pode ser desfeita.</DialogDescription></DialogHeader>
                    <DialogFooter><Button variant="outline" onClick={() => setShowDelete(false)}>Cancelar</Button><Button variant="destructive" onClick={() => { setShowDelete(false); onDelete(patient); }}>Excluir Definitivamente</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};


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
    const [searchTerm,          setSearchTerm]          = useState('');
    const [loading,             setLoading]             = useState(true);
    const [sortOrder,           setSortOrder]           = useState(persisted.sortOrder     || 'name_asc');
    const [filterStatus,        setFilterStatus]        = useState(persisted.filterStatus  || 'all');
    const [viewMode,            setViewMode]            = useState(persisted.viewMode      || 'grid');
    const [activeChip,          setActiveChip]          = useState(null); // 'new30' | 'pending' | 'incomplete'
    const [showAddPatientModal, setShowAddPatientModal] = useState(false);
    const [showArchivedModal,   setShowArchivedModal]   = useState(false);

    // Persist state changes
    useEffect(() => { Object.assign(sessionStorage, { [SESSION_KEY]: JSON.stringify({ sortOrder, filterStatus, viewMode }) }); }, [sortOrder, filterStatus, viewMode]);

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
        const { active, archived, error } = await fetchAllNutritionistPatients(user.id);
        if (error) { toast({ title: "Erro", description: "Falha ao carregar.", variant: "destructive" }); }
        else { setPatients([...active, ...archived]); }
        setLoading(false);
    }, [user?.id, toast]);

    useEffect(() => { fetchPatients(); }, [fetchPatients]);

    // ── Actions ──────────────────────────────────────────────────────────────
    const handleArchive = async (patient) => {
        const { success } = await archivePatient(patient.id, user.id);
        if (success) { toast({ title: "Paciente Arquivado", variant: "success" }); fetchPatients(); }
        else toast({ title: "Erro ao arquivar", variant: "destructive" });
    };

    const handleDelete = async (patient) => {
        const { success } = await hardDeletePatient(patient.id);
        if (success) { toast({ title: "Conta Excluída", variant: "success" }); fetchPatients(); }
        else toast({ title: "Erro ao excluir", variant: "destructive" });
    };

    // ── Derived data ────────────────────────────────────────────────────────
    const { activePatients, archivedPatients, stats } = useMemo(() => {
        const activeList = [], archivedList = [];
        let online = 0, pending = 0;
        patients.forEach(p => {
            const isArchived = p.is_active === false || p.arquivadoHistorico;
            if (isArchived) archivedList.push(p);
            else {
                activeList.push(p);
                if (p.needs_password_reset === true) pending++;
                if (isUserOnline(p.id)) online++;
            }
        });
        const thirtyDaysAgo = new Date(new Date() - 30 * 24 * 60 * 60 * 1000);
        const new30 = activeList.filter(p => new Date(p.created_at) >= thirtyDaysAgo).length;
        const incomplete = activeList.filter(p => !p.phone).length; // Cadastro incompleto (sem fone)

        return { activePatients: activeList, archivedPatients: archivedList, stats: { active: activeList.length, online, pending, new30, incomplete } };
    }, [patients, isUserOnline]);

    // ── Filtered & sorted list ───────────────────────────────────────────────
    const filteredPatients = useMemo(() => {
        if (searchTerm.trim()) {
            const lower = searchTerm.toLowerCase();
            return patients.filter(p => (p.name && p.name.toLowerCase().includes(lower)) || (p.email && p.email.toLowerCase().includes(lower)) || (p.cpf && p.cpf.includes(lower)));
        }

        let base = [...activePatients];
        if (activeChip === 'new30') base = base.filter(p => new Date(p.created_at) >= new Date(THIRTY_DAYS_AGO));
        else if (activeChip === 'pending') base = base.filter(p => p.needs_password_reset === true);
        else if (activeChip === 'incomplete') base = base.filter(p => !p.phone);
        else {
            if (filterStatus === 'active') base = base.filter(p => p.needs_password_reset !== true);
            else if (filterStatus === 'pending') base = base.filter(p => p.needs_password_reset === true);
            else if (filterStatus === 'online') base = base.filter(p => isUserOnline(p.id));
        }

        const { column, ascending } = sortOptions[sortOrder];
        return base.sort((a, b) => {
            if (a[column] < b[column]) return ascending ? -1 : 1;
            if (a[column] > b[column]) return ascending ? 1 : -1;
            return 0;
        });
    }, [patients, activePatients, searchTerm, filterStatus, sortOrder, activeChip, isUserOnline]);

    // ── Contextual empty state message ───────────────────────────────────────  
    const emptyMessage = useMemo(() => {
        if (searchTerm) return { title: `Nenhum resultado para "${searchTerm}"`, sub: "Verifique a ortografia do nome ou e-mail." };
        if (activeChip === 'new30') return { title: "Nenhum paciente adicionado recentemente.", sub: "" };
        if (activeChip === 'pending') return { title: "Nenhum convite pendente.", sub: "Todos já acessaram a plataforma cruzando o primeiro acesso." };
        if (activeChip === 'incomplete') return { title: "Ótimo! Cadastros completos.", sub: "Todos os seus pacientes têm telefone cadastrado." };
        if (filterStatus === 'online') return { title: "Nenhum paciente online.", sub: "" };
        return { title: "Nenhum paciente encontrado.", sub: "" };
    }, [searchTerm, filterStatus, activeChip]);

    const handleChipClick = (chip) => setActiveChip(prev => prev === chip ? null : chip);
    const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';

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
                        <div className="flex items-center justify-center sm:justify-start gap-2">
                            <h1 className="text-2xl md:text-3xl font-bold font-heading uppercase tracking-wide text-primary">
                                Meus Pacientes <span className="text-muted-foreground/60 mx-1">•</span> <span className="text-foreground">{stats.active}</span>
                            </h1>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">Gerencie acompanhamentos, consultas, convites e acesse o histórico clínico.</p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex-shrink-0 flex flex-col sm:flex-row justify-center sm:justify-end gap-3 w-full sm:w-auto">
                        {archivedPatients.length > 0 && (
                            <Button variant="outline" onClick={() => setShowArchivedModal(true)} className="w-full sm:w-auto font-medium text-muted-foreground hover:text-foreground">
                                <ArchiveRestore className="w-4 h-4 mr-2" />
                                Ver Arquivados ({archivedPatients.length})
                            </Button>
                        )}
                        <Button onClick={() => setShowAddPatientModal(true)} className="w-full sm:w-auto bg-primary text-primary-foreground font-semibold hover:bg-primary/90">
                            <Plus className="w-4 h-4 mr-2" /> Adicionar Paciente
                        </Button>
                    </div>
                </div>

                {/* ── Search + Filters ── */}
                <Card className="bg-card shadow-card-dark rounded-xl overflow-hidden">
                    <CardHeader className="pb-3 border-b">
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                                <h3 className="font-semibold text-foreground text-sm uppercase tracking-wider flex items-center gap-2">
                                    <ListFilter className="w-4 h-4 text-primary" /> Busca e Filtros
                                </h3>

                                {/* Smart Chips */}
                                {!loading && activePatients.length > 0 && (
                                    <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
                                        <Badge variant={activeChip === 'new30' ? 'default' : 'secondary'} className={`cursor-pointer text-[11px] gap-1 transition-colors px-2.5 py-1 ${activeChip !== 'new30' && 'bg-muted hover:bg-muted/80'}`} onClick={() => handleChipClick('new30')}>
                                            <Flame className="w-3 h-3 text-orange-500" /> Adicionados Recentes ({stats.new30})
                                        </Badge>
                                        <Badge variant={activeChip === 'pending' ? 'default' : 'secondary'} className={`cursor-pointer text-[11px] gap-1 transition-colors px-2.5 py-1 ${activeChip !== 'pending' && 'bg-muted hover:bg-muted/80'}`} onClick={() => handleChipClick('pending')}>
                                            <Clock className="w-3 h-3 text-amber-500" /> Convites Pendentes ({stats.pending})
                                        </Badge>
                                        <Badge variant={activeChip === 'incomplete' ? 'default' : 'secondary'} className={`cursor-pointer text-[11px] gap-1 transition-colors px-2.5 py-1 ${activeChip !== 'incomplete' && 'bg-muted hover:bg-muted/80'}`} onClick={() => handleChipClick('incomplete')}>
                                            <PhoneOff className="w-3 h-3 text-rose-500" /> S/ Telefone ({stats.incomplete})
                                        </Badge>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 pt-1">
                                <div className="relative flex-1 min-w-0">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                    <Input placeholder="Procurar paciente (Nome, Email, CPF...)" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 bg-muted/40 border-border focus-visible:ring-1 focus-visible:ring-primary h-10 transition-all focus:bg-background" />
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <ToggleGroup type="single" value={viewMode} onValueChange={v => v && setViewMode(v)} className="border border-input rounded-md bg-muted/30">
                                        <ToggleGroupItem value="grid" aria-label="Grid view" className="h-10 w-10"><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
                                        <ToggleGroupItem value="list" aria-label="List view" className="h-10 w-10"><List className="h-4 w-4" /></ToggleGroupItem>
                                    </ToggleGroup>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" className="h-10 shrink-0 font-medium">
                                                Filtros Avançados
                                                {(filterStatus !== 'all' || sortOrder !== 'name_asc') && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-primary inline-block" />}
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-[220px]">
                                            <DropdownMenuLabel>Status da Conta</DropdownMenuLabel>
                                            <DropdownMenuRadioGroup value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setActiveChip(null); }}>
                                                <DropdownMenuRadioItem value="all">Todos</DropdownMenuRadioItem>
                                                <DropdownMenuRadioItem value="active">Em Tratamento (Ativos)</DropdownMenuRadioItem>
                                                <DropdownMenuRadioItem value="pending">Convites Pendentes</DropdownMenuRadioItem>
                                                <DropdownMenuRadioItem value="online">Apenas Online Agora</DropdownMenuRadioItem>
                                            </DropdownMenuRadioGroup>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuLabel>Ordenação</DropdownMenuLabel>
                                            <DropdownMenuRadioGroup value={sortOrder} onValueChange={setSortOrder}>
                                                {Object.entries(sortOptions).map(([key, { label }]) => (
                                                    <DropdownMenuRadioItem key={key} value={key}>{label}</DropdownMenuRadioItem>
                                                ))}
                                            </DropdownMenuRadioGroup>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-4 bg-muted/10">
                        {loading ? (
                            <div className="flex justify-center items-center h-40"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                        ) : filteredPatients.length > 0 ? (
                            viewMode === 'grid' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
                                    <AnimatePresence mode="popLayout">
                                        {filteredPatients.map((patient) => (
                                            <motion.div
                                                key={`grid-${patient.id}`}
                                                initial={{ opacity: 0, scale: 0.98 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                transition={{ duration: 0.15 }}
                                                className="h-full"
                                            >
                                                <PatientCard patient={patient} isOnline={isUserOnline(patient.id)} onArchive={handleArchive} onDelete={handleDelete} />
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            ) : (
                                <div className="rounded-md border bg-background">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Paciente</TableHead>
                                                <TableHead className="hidden md:table-cell">Status</TableHead>
                                                <TableHead className="hidden lg:table-cell">Telefone</TableHead>
                                                <TableHead className="hidden lg:table-cell">Membro Desde</TableHead>
                                                <TableHead className="text-right w-[80px]">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody className="overflow-hidden">
                                            <AnimatePresence mode="popLayout">
                                                {filteredPatients.map(patient => {
                                                    const isArchived = patient.is_active === false || patient.arquivadoHistorico;
                                                    return (
                                                        <motion.tr
                                                            key={`list-${patient.id}`}
                                                            initial={{ opacity: 0, y: -5 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: 5 }}
                                                            transition={{ duration: 0.15 }}
                                                            className={`border-b group transition-colors hover:bg-muted/40 ${isArchived ? 'opacity-50' : 'cursor-pointer'}`}
                                                            onClick={e => {
                                                                // Allow clicking row to navigate, except if clicking an interactive element
                                                                if (!isArchived && !e.target.closest('button')) navigate(patientRoute(patient, 'hub'));
                                                            }}
                                                        >
                                                            <TableCell>
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isUserOnline(patient.id) ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
                                                                    <div>
                                                                        <p className="font-semibold text-sm text-foreground">{patient.name}</p>
                                                                        <p className="text-xs text-muted-foreground">{patient.email}</p>
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="hidden md:table-cell">
                                                                {isArchived ? <Badge variant="outline" className="text-[10px] border-dashed">Arquivado</Badge>
                                                                    : patient.needs_password_reset ? <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Convite Pendente</Badge>
                                                                    : <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Ativo</Badge>}
                                                            </TableCell>
                                                            <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                                                                {patient.phone || <span className="opacity-50">—</span>}
                                                            </TableCell>
                                                            <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                                                                {formatDate(patient.created_at)}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <ListActionsMenu patient={patient} onArchive={handleArchive} onDelete={handleDelete} />
                                                            </TableCell>
                                                        </motion.tr>
                                                    );
                                                })}
                                            </AnimatePresence>
                                        </TableBody>
                                    </Table>
                                </div>
                            )
                        ) : (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-xl bg-background mt-4">
                                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                                    <Search className="w-8 h-8 text-primary/40" />
                                </div>
                                <h3 className="text-lg font-bold text-foreground mb-1">{emptyMessage.title}</h3>
                                {emptyMessage.sub && <p className="text-muted-foreground text-sm max-w-[300px]">{emptyMessage.sub}</p>}
                                {filterStatus === 'all' && !searchTerm && !activeChip && (
                                    <Button onClick={() => setShowAddPatientModal(true)} className="mt-6">
                                        <Plus className="w-4 h-4 mr-2" /> Cadastrar Primeiro Paciente
                                    </Button>
                                )}
                            </motion.div>
                        )}
                    </CardContent>
                </Card>
            </motion.div>

            {/* Modals Globais */}
            {showAddPatientModal && <AddPatientModal isOpen={showAddPatientModal} onNavigateBack={() => setShowAddPatientModal(false)} />}
            {showArchivedModal && <ArchivedPatientsModal isOpen={showArchivedModal} onClose={() => setShowArchivedModal(false)} />}
        </div>
    );
};

export default PatientsPage;