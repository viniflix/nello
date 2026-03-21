import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { patientRoute } from '@/lib/utils/patientRoutes';
import {
    MoreVertical, Archive, Trash2, Loader2, AlertCircle, FileText
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getModulesStatus } from '@/lib/supabase/patient-queries';

// ── Gradient Avatar ───────────────────────────────────────────────────────────
const stringToHue = (str = '') => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash) % 360;
};

export const GradientAvatar = ({ name = '', avatarUrl, size = 44 }) => {
    const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
    const hue = stringToHue(name);
    const gradient = `linear-gradient(135deg, hsl(${hue},65%,52%), hsl(${(hue + 40) % 360},70%,45%))`;

    if (avatarUrl) {
        return <img src={avatarUrl} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover flex-shrink-0" />;
    }
    return (
        <div style={{ width: size, height: size, background: gradient }} className="rounded-full flex items-center justify-center font-bold text-white text-sm select-none flex-shrink-0">
            {initials || '?'}
        </div>
    );
};

// ── PatientCard ───────────────────────────────────────────────────────────────
const PatientCard = ({ patient, isOnline, onArchive, onDelete }) => {
    const navigate = useNavigate();
    const [isCheckingData, setIsCheckingData] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showArchiveModal, setShowArchiveModal] = useState(false);

    // B1: cache do resultado via ref para não repetir a query
    const deleteCheckRef = useRef(null);

    const isArchived = patient.is_active === false || patient.arquivadoHistorico;
    const isPending = !isArchived && patient.needs_password_reset === true;

    const handleDropdownOpen = useCallback(async (open) => {
        if (open && !isArchived && deleteCheckRef.current === null) {
            setIsCheckingData(true);
            try {
                const { data: statusObj } = await getModulesStatus(patient.id);
                const hasData = statusObj
                    ? Object.values(statusObj).some(val => val !== 'not_started')
                    : false;
                deleteCheckRef.current = !hasData;
            } catch {
                deleteCheckRef.current = false;
            } finally {
                setIsCheckingData(false);
            }
        }
    }, [isArchived, patient.id]);

    const canDelete = deleteCheckRef.current === true;

    // Quick info pills derived from patient data
    const memberSince = patient.created_at
        ? Math.floor((Date.now() - new Date(patient.created_at)) / (1000 * 60 * 60 * 24))
        : null;

    return (
        <>
            <div
                className={`flex items-start gap-3 p-4 border bg-background rounded-xl transition-all duration-150 h-full
                    ${isArchived
                        ? 'opacity-60 border-dashed'
                        : 'hover:shadow-md hover:border-primary/40 cursor-pointer'
                    }`}
                onClick={() => !isArchived && navigate(patientRoute(patient, 'hub'))}
            >
                {/* Avatar */}
                <div className="relative flex-shrink-0 mt-0.5">
                    <GradientAvatar name={patient.name} avatarUrl={patient.avatar_url} />
                    {!isArchived && (
                        <div
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${isOnline ? 'bg-green-500' : 'bg-neutral-300 dark:bg-neutral-600'}`}
                        />
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col h-full">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm text-foreground truncate">{patient.name}</h3>
                        {isArchived && (
                            <Badge variant="outline" className="h-4 text-[9px] px-1.5 uppercase font-bold tracking-wider text-muted-foreground border-dashed">
                                Arquivado
                            </Badge>
                        )}
                        {isPending && (
                            <Badge variant="outline" className="h-4 text-[9px] px-1.5 bg-amber-100 text-amber-800 border-amber-200 uppercase tracking-wider dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
                                Convite Pendente
                            </Badge>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{patient.email}</p>

                    {/* Quick info pills (anchored to bottom) */}
                    <div className="mt-auto pt-3">
                        {!isArchived && (
                            <div className="flex flex-wrap gap-1.5">
                                {isOnline && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full dark:text-emerald-400">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                                        Online
                                    </span>
                                )}
                                {memberSince !== null && memberSince <= 30 && (
                                    <span className="inline-flex items-center text-[10px] font-medium text-violet-700 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded-full dark:text-violet-400">
                                        Novo paciente
                                    </span>
                                )}
                                {patient.phone && (
                                    <span className="inline-flex items-center text-[10px] text-muted-foreground bg-muted/60 border border-border/40 px-1.5 py-0.5 rounded-full truncate max-w-[120px]">
                                        {patient.phone}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Dropdown — isolated from card click zone (B2) */}
                <div onClick={e => e.stopPropagation()} className="flex-shrink-0 -mt-1 -mr-1">
                    <DropdownMenu onOpenChange={handleDropdownOpen}>
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
                                <DropdownMenuItem
                                    onClick={() => navigate(patientRoute(patient, 'hub'))}
                                    className="cursor-pointer"
                                >
                                    <FileText className="mr-2 h-4 w-4" />
                                    Ver Histórico (Read-Only)
                                </DropdownMenuItem>
                            ) : (
                                <>
                                    <DropdownMenuItem onClick={() => navigate(patientRoute(patient, 'hub'))} className="cursor-pointer">
                                        <FileText className="mr-2 h-4 w-4" />
                                        Abrir Prontuário
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setShowArchiveModal(true)} className="cursor-pointer">
                                        <Archive className="mr-2 h-4 w-4" />
                                        Arquivar Paciente
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => setShowDeleteModal(true)}
                                        disabled={isCheckingData || !canDelete}
                                        className={`cursor-pointer ${canDelete ? 'text-destructive focus:text-destructive' : 'text-muted-foreground'}`}
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Excluir Permanentemente
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Archive Confirmation */}
            <Dialog open={showArchiveModal} onOpenChange={setShowArchiveModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Arquivar Paciente</DialogTitle>
                        <DialogDescription>
                            Tem certeza que deseja arquivar <strong>{patient.name}</strong>?
                            <br /><br />
                            O vínculo será encerrado. Seus dados clínicos registrados por você ficam salvos como read-only para fins legais (LGPD / CFN). O paciente ficará livre para ser vinculado a outro nutricionista via novo convite.
                            <br /><br />
                            <strong>Essa ação não pode ser desfeita diretamente — um novo convite será necessário para reestabelecer o vínculo.</strong>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowArchiveModal(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={() => { setShowArchiveModal(false); onArchive(patient); }}>
                            Sim, Arquivar
                        </Button>
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
                            Esta ação <strong>não pode ser desfeita</strong>. A conta do paciente será apagada
                            da autenticação, liberando o e-mail <em>{patient.email}</em> para um novo cadastro.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDeleteModal(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={() => { setShowDeleteModal(false); onDelete(patient); }}>
                            Excluir Definitivamente
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export { PatientCard as default, PatientCard };
