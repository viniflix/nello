import React,{useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import {Loader2,MoreVertical,FileText,MessageCircle,Archive,Trash2,AlertCircle} from 'lucide-react';
import {DropdownMenu,DropdownMenuContent,DropdownMenuTrigger,DropdownMenuItem,DropdownMenuSeparator} from '@/components/ui/dropdown-menu';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {getEmptyPatientRemovalStatus} from '@/lib/supabase/patient-queries';
import {patientRoute} from '@/lib/utils/patientRoutes';
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
                const { data } = await getEmptyPatientRemovalStatus(patient.id);
                canDeleteRef.current = data?.can_remove === true;
            } catch { canDeleteRef.current = false; }
            finally { setIsCheckingData(false); }
        }
    };

    return (
        <>
            <div 
                onClick={e => e.stopPropagation()} 
                onPointerDown={e => e.stopPropagation()}
                onPointerUp={e => e.stopPropagation()}
            >
                <DropdownMenu onOpenChange={handleOpen} modal={false}>
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
                                <DropdownMenuItem onClick={() => setShowArchive(true)} className="cursor-pointer"><Archive className="mr-2 h-4 w-4" /> Encerrar acompanhamento</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setShowDelete(true)} disabled={isCheckingData || !canDeleteRef.current} className={`cursor-pointer ${canDeleteRef.current ? 'text-destructive focus:text-destructive' : 'text-muted-foreground'}`}>
                                    <Trash2 className="mr-2 h-4 w-4" /> Remover cadastro vazio
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Modals */}
            <Dialog open={showArchive} onOpenChange={setShowArchive}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Encerrar acompanhamento</DialogTitle><DialogDescription>O vínculo será encerrado imediatamente. O paciente ficará livre para outro convite e o histórico permanecerá preservado somente para os participantes deste episódio.</DialogDescription></DialogHeader>
                    <DialogFooter><Button variant="outline" onClick={() => setShowArchive(false)}>Cancelar</Button><Button variant="destructive" onClick={() => { setShowArchive(false); onArchive(patient); }}>Confirmar encerramento</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showDelete} onOpenChange={setShowDelete}>
                <DialogContent>
                    <DialogHeader><DialogTitle className="text-destructive flex items-center gap-2"><AlertCircle className="h-5 w-5" /> Remover cadastro vazio</DialogTitle><DialogDescription>O cadastro de <strong>{patient.name}</strong> será removido da sua lista. Essa opção existe apenas para cadastros sem dados clínicos; a conta do paciente e a auditoria mínima da ação são preservadas.</DialogDescription></DialogHeader>
                    <DialogFooter><Button variant="outline" onClick={() => setShowDelete(false)}>Cancelar</Button><Button variant="destructive" onClick={() => { setShowDelete(false); onDelete(patient); }}>Confirmar remoção</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};



export default ListActionsMenu;
