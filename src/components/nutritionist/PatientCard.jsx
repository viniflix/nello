import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { patientRoute } from '@/lib/utils/patientRoutes';
import {
    MoreVertical, Archive, Trash2, Loader2, AlertCircle,
    MessageCircle, FileText, CalendarPlus, ArchiveRestore
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { getModulesStatus } from '@/lib/supabase/patient-queries';

// ── Gradient Avatar: gera cor determinística a partir do nome ───────────────
const stringToHue = (str = '') => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash) % 360;
};

const GradientAvatar = ({ name = '', avatarUrl, size = 44 }) => {
    const initials = name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(w => w[0].toUpperCase())
        .join('');
    const hue = stringToHue(name);
    const gradient = `linear-gradient(135deg, hsl(${hue},65%,52%), hsl(${(hue + 40) % 360},70%,45%))`;

    if (avatarUrl) {
        return (
            <img
                src={avatarUrl}
                alt={name}
                style={{ width: size, height: size }}
                className="rounded-full object-cover"
            />
        );
    }

    return (
        <div
            style={{ width: size, height: size, background: gradient }}
            className="rounded-full flex items-center justify-center font-bold text-white text-sm select-none"
        >
            {initials || '?'}
        </div>
    );
};

// ── PatientCard ──────────────────────────────────────────────────────────────
const PatientCard = ({ patient, isOnline, onArchive, onDelete, onUnarchive, appointmentSummary }) => {
    const navigate = useNavigate();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isCheckingData, setIsCheckingData] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showArchiveModal, setShowArchiveModal] = useState(false);
    const [showUnarchiveModal, setShowUnarchiveModal] = useState(false);

    // B1: cache do resultado via ref para não repetir a query
    const deleteCheckRef = useRef(null); // null = not checked, true/false = result

    const isArchived = patient.is_active === false || patient.arquivadoHistorico;
    const isPending = !isArchived && patient.needs_password_reset === true;

    const handleDropdownOpen = useCallback(async (open) => {
        setIsDropdownOpen(open);
        if (open && !isArchived && deleteCheckRef.current === null) {
            setIsCheckingData(true);
            try {
                const { data: statusObj } = await getModulesStatus(patient.id);
                const hasData = statusObj
                    ? Object.values(statusObj).some(val => val !== 'not_started')
                    : false;
                deleteCheckRef.current = !hasData; // true = can delete
            } catch {
                deleteCheckRef.current = false;
            } finally {
                setIsCheckingData(false);
            }
        }
    }, [isArchived, patient.id]);

    const canDelete = deleteCheckRef.current === true;

    // Appointment summary
    const apptInfo = appointmentSummary?.get(patient.id);
    const formatDate = (iso) => {
        if (!iso) return null;
        return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    };
    const lastAppt = formatDate(apptInfo?.last);
    const nextAppt = formatDate(apptInfo?.next);

    const goTo = (view) => navigate(patientRoute(patient, view));

    return (
        <>
            <motion.div
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className={`group relative flex flex-col border bg-background rounded-xl overflow-hidden transition-all duration-200
                    ${isArchived
                        ? 'opacity-60 border-dashed hover:opacity-80'
                        : 'hover:shadow-md hover:border-primary/60 cursor-pointer'
                    }`}
            >
                {/* ── Main clickable area ── */}
                <div
                    className="flex items-start gap-3 p-4 flex-1"
                    onClick={() => !isArchived && goTo('hub')}
                >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                        <GradientAvatar name={patient.name} avatarUrl={patient.avatar_url} />
                        {!isArchived && (
                            <div
                                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${isOnline ? 'bg-green-500' : 'bg-neutral-300'}`}
                                title={isOnline ? 'Online' : 'Offline'}
                            />
                        )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm text-foreground truncate">{patient.name}</h3>
                            {isArchived && (
                                <Badge variant="outline" className="h-4 text-[9px] px-1 uppercase font-bold tracking-wider text-muted-foreground border-dashed">
                                    Arquivado
                                </Badge>
                            )}
                            {isPending && (
                                <Badge className="h-4 text-[9px] px-1 bg-amber-100 text-amber-800 border-amber-200 uppercase tracking-wider" variant="outline">
                                    Pendente
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{patient.email}</p>

                        {/* Appointment indicators */}
                        {!isArchived && (lastAppt || nextAppt) && (
                            <div className="flex gap-3 mt-2">
                                {lastAppt && (
                                    <span className="text-[10px] text-muted-foreground">
                                        Últ: <span className="font-medium text-foreground">{lastAppt}</span>
                                    </span>
                                )}
                                {nextAppt ? (
                                    <span className="text-[10px] text-emerald-600">
                                        Próx: <span className="font-semibold">{nextAppt}</span>
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-amber-500/80">Sem Agendamento</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Dropdown — separate from the click zone */}
                    <div onClick={e => e.stopPropagation()} className="flex-shrink-0 -mt-1 -mr-1">
                        <DropdownMenu open={isDropdownOpen} onOpenChange={handleDropdownOpen}>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                                    {isCheckingData
                                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        : <MoreVertical className="h-4 w-4" />
                                    }
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                {isArchived ? (
                                    <DropdownMenuItem onClick={() => setShowUnarchiveModal(true)} className="cursor-pointer">
                                        <ArchiveRestore className="mr-2 h-4 w-4" />
                                        <span>Reativar Paciente</span>
                                    </DropdownMenuItem>
                                ) : (
                                    <>
                                        <DropdownMenuItem onClick={() => goTo('hub')} className="cursor-pointer">
                                            <FileText className="mr-2 h-4 w-4" />
                                            <span>Abrir Prontuário</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => setShowArchiveModal(true)} className="cursor-pointer">
                                            <Archive className="mr-2 h-4 w-4" />
                                            <span>Arquivar Paciente</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            onClick={() => setShowDeleteModal(true)}
                                            disabled={isCheckingData || !canDelete}
                                            className={`cursor-pointer ${canDelete ? 'text-destructive focus:text-destructive' : 'text-muted-foreground'}`}
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            <span>Excluir Permanentemente</span>
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* ── Hover Quick Actions (desktop only, active patients) ── */}
                {!isArchived && (
                    <div className="hidden group-hover:flex items-center gap-1 px-3 pb-3 pt-0 border-t border-border/30 mt-auto"
                         onClick={e => e.stopPropagation()}
                    >
                        <Button
                            size="sm"
                            variant="ghost"
                            className="flex-1 h-7 text-xs gap-1.5 text-muted-foreground hover:text-primary"
                            onClick={() => navigate(`/nutritionist/chat?patient=${patient.id}`)}
                        >
                            <MessageCircle className="h-3 w-3" />
                            Chat
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="flex-1 h-7 text-xs gap-1.5 text-muted-foreground hover:text-primary"
                            onClick={() => goTo('hub')}
                        >
                            <FileText className="h-3 w-3" />
                            Prontuário
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="flex-1 h-7 text-xs gap-1.5 text-muted-foreground hover:text-primary"
                            onClick={() => navigate(`/nutritionist/agenda?patient=${patient.id}`)}
                        >
                            <CalendarPlus className="h-3 w-3" />
                            Agendar
                        </Button>
                    </div>
                )}
            </motion.div>

            {/* Archive Confirmation */}
            <Dialog open={showArchiveModal} onOpenChange={setShowArchiveModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Arquivar Paciente</DialogTitle>
                        <DialogDescription>
                            Tem certeza que deseja arquivar <strong>{patient.name}</strong>?
                            <br /><br />
                            O paciente perderá acesso ao chat e a interface passará para modo somente leitura. O histórico clínico permanecerá salvo para lhe respaldar legalmente.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowArchiveModal(false)}>Cancelar</Button>
                        <Button onClick={() => { setShowArchiveModal(false); onArchive(patient); }}>Sim, Arquivar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Unarchive Confirmation */}
            <Dialog open={showUnarchiveModal} onOpenChange={setShowUnarchiveModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reativar Paciente</DialogTitle>
                        <DialogDescription>
                            Deseja reativar o vínculo com <strong>{patient.name}</strong>?
                            Isso liberará novamente o chat e a edição do tratamento.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowUnarchiveModal(false)}>Cancelar</Button>
                        <Button onClick={() => { setShowUnarchiveModal(false); onUnarchive(patient); }}>Sim, Reativar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-destructive flex items-center gap-2">
                            <AlertCircle className="h-5 w-5" /> Excluir Permanentemente
                        </DialogTitle>
                        <DialogDescription>
                            Você está prestes a excluir permanentemente <strong>{patient.name}</strong>.
                            Essa ação <strong>não pode ser desfeita</strong> e apagará a conta do paciente, liberando o e-mail {patient.email} para um novo cadastro.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDeleteModal(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={() => { setShowDeleteModal(false); onDelete(patient); }}>Excluir Definitivamente</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default PatientCard;
