import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, Users, ArchiveRestore } from 'lucide-react';
import PatientCard from './PatientCard';
import { ScrollArea } from '@/components/ui/scroll-area';

// B9: archived patients are never online, no need to pass isUserOnline.
// B10: searchTerm resets when modal closes (via key prop or effect).
export default function ArchivedPatientsModal({
    isOpen,
    onClose,
    archivedPatients,
    handleUnarchive,
    handleDelete
}) {
    const [searchTerm, setSearchTerm] = useState('');

    // B10: reset search when modal closes
    const handleClose = (open) => {
        if (!open) setSearchTerm('');
        onClose(open);
    };

    const filtered = useMemo(() => {
        if (!searchTerm.trim()) return archivedPatients;
        const lower = searchTerm.toLowerCase();
        return archivedPatients.filter(p =>
            (p.name  && p.name.toLowerCase().includes(lower)) ||
            (p.email && p.email.toLowerCase().includes(lower))
        );
    }, [archivedPatients, searchTerm]);

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col p-0">
                <DialogHeader className="p-6 pb-4 border-b">
                    <DialogTitle className="text-xl flex items-center gap-2 text-foreground">
                        <ArchiveRestore className="w-5 h-5 text-muted-foreground" />
                        Central de Pacientes Arquivados
                    </DialogTitle>
                    <DialogDescription>
                        Histórico Read-Only. Pacientes arquivados podem ser reativados caso retornem ao acompanhamento.
                    </DialogDescription>

                    <div className="relative mt-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar em arquivos..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-9 bg-muted/50"
                        />
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1 p-6 pt-2">
                    {filtered.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filtered.map(patient => (
                                <PatientCard
                                    key={patient.id}
                                    patient={patient}
                                    isOnline={false}        // B9: archived patients are never online
                                    onArchive={() => {}}   // already archived
                                    onUnarchive={handleUnarchive}
                                    onDelete={handleDelete}
                                    appointmentSummary={new Map()} // no agenda indicators for archived
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <Users className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
                            <h3 className="text-lg font-medium text-foreground">
                                {searchTerm
                                    ? `Nenhum arquivo encontrado para "${searchTerm}".`
                                    : 'Nenhum paciente arquivado.'
                                }
                            </h3>
                        </div>
                    )}
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
