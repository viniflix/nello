import React from 'react';
import { Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ServiceActions({ service, onEdit, onDelete }) {
    return <div className="flex flex-wrap justify-end gap-1" role="group" aria-label={`Ações do serviço ${service.name}`}>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label={`Editar serviço ${service.name}`} title={`Editar serviço ${service.name}`} onClick={onEdit}><Edit className="h-4 w-4" aria-hidden="true" /></Button>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-destructive hover:text-destructive" aria-label={`Desativar serviço ${service.name}`} title={`Desativar serviço ${service.name}`} onClick={onDelete}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
    </div>;
}
