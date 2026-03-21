import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { patientRoute } from '@/lib/utils/patientRoutes';
import { ChevronRight, User as UserIcon, MoreVertical, Archive, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getModulesStatus } from '@/lib/supabase/patient-queries';

const PatientCard = ({ patient, isOnline, onArchive, onDelete, onUnarchive }) => {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isCheckingData, setIsCheckingData] = useState(false);
    const [canDelete, setCanDelete] = useState(false);
    
    // Modal state for Delete confirmation
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showArchiveModal, setShowArchiveModal] = useState(false);
    const [showUnarchiveModal, setShowUnarchiveModal] = useState(false);

    const isArchived = patient.is_active === false || patient.arquivadoHistorico;
    const isPending = patient.needs_password_reset === true;

    const handleDropdownOpen = async (open) => {
        setIsDropdownOpen(open);
        if (open && !isArchived) {
            // Check if patient has clinical data to allow Hard Delete
            setIsCheckingData(true);
            try {
                const { data: statusObj } = await getModulesStatus(patient.id);
                // If everything is 'not_started', we can safely delete
                const hasData = statusObj ? Object.values(statusObj).some(val => val !== 'not_started') : false;
                setCanDelete(!hasData);
            } catch (err) {
                console.error("Erro ao verificar status dos módulos", err);
                setCanDelete(false);
            } finally {
                setIsCheckingData(false);
            }
        }
    };

    return (
        <>
            <div className={`relative block p-4 border bg-background rounded-lg transition-all ${isArchived ? 'opacity-60 border-dashed hover:opacity-80' : 'hover:shadow-md hover:border-primary'}`}>
                
                {/* Status Badges */}
                <div className="absolute top-2 right-10 flex gap-2 z-10">
                    {isArchived && (
                        <Badge variant="destructive" className="h-5 text-[10px] px-1.5 uppercase font-bold tracking-wider">
                            Arquivado
                        </Badge>
                    )}
                    {!isArchived && isPending && (
                        <Badge variant="secondary" className="h-5 text-[10px] px-1.5 bg-amber-100 text-amber-800 hover:bg-amber-200 uppercase tracking-wider">
                            Pendente
                        </Badge>
                    )}
                </div>

                <div className="flex justify-between items-center gap-3">
                    <Link to={patientRoute(patient, 'hub')} className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="relative w-11 h-11 flex-shrink-0">
                            <div className="w-full h-full bg-secondary rounded-full flex items-center justify-center font-bold text-primary overflow-hidden">
                                {patient.avatar_url ? (
                                    <img src={patient.avatar_url} alt={patient.name} className="w-full h-full object-cover"/>
                                ) : (
                                    <UserIcon className="w-6 h-6 text-primary/70" />
                                )}
                            </div>
                            
                            {!isArchived && (
                                <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${isOnline ? 'bg-green-500' : 'bg-neutral-300'}`} 
                                     title={isOnline ? "Online" : "Offline"}
                                />
                            )}
                        </div>
                        
                        <div className="flex-1 min-w-0 overflow-hidden">
                            <h3 className="font-semibold text-base text-foreground truncate pl-1">{patient.name}</h3>
                            <p className="text-sm text-muted-foreground truncate pl-1">
                                {patient.email}
                            </p>
                        </div>
                    </Link>

                    <div className="flex items-center gap-1 flex-shrink-0">
                        <Link to={patientRoute(patient, 'hub')} className="p-2 text-muted-foreground hover:text-primary transition-colors">
                            <ChevronRight className="h-5 w-5" />
                        </Link>
                        
                        <DropdownMenu open={isDropdownOpen} onOpenChange={handleDropdownOpen}>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground z-20 relative">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                {isArchived ? (
                                    <DropdownMenuItem onClick={() => setShowUnarchiveModal(true)} className="cursor-pointer">
                                        <Archive className="mr-2 h-4 w-4" />
                                        <span>Reativar Paciente</span>
                                    </DropdownMenuItem>
                                ) : (
                                    <>
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
                                            {isCheckingData ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="mr-2 h-4 w-4" />
                                            )}
                                            <span>Excluir Permanentemente</span>
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>

            {/* Archive Confirmation Modal */}
            <Dialog open={showArchiveModal} onOpenChange={setShowArchiveModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Arquivar Paciente</DialogTitle>
                        <DialogDescription>
                            Tem certeza que deseja arquivar <strong>{patient.name}</strong>? 
                            <br/><br/>
                            O paciente perderá acesso ao chat e a interface passará para modo somente leitura. O histórico clínico permanecerá salvo para lhe respaldar legalmente e você poderá consultar os dados passados a qualquer momento.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowArchiveModal(false)}>Cancelar</Button>
                        <Button onClick={() => { setShowArchiveModal(false); onArchive(patient); }}>Sim, Arquivar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Unarchive Confirmation Modal */}
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

            {/* Delete Confirmation Modal */}
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
