import { PrivateImage } from '@/components/ui/private-image';
import { subscribeDomain } from '@/infrastructure/realtime/events';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import React, { useState, useEffect, useRef } from 'react';
import { Search, User as UserIcon, Loader2, X, PlusCircle } from 'lucide-react';
import { supabase } from '@/infrastructure/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

const NewChatModal = props => {
  const { user } = useAuth();
  return <NewChatModalContent key={user?.id || 'signed-out'} {...props} />;
};

const NewChatModalContent = ({ open, onOpenChange, onSelectPatient }) => {
  const { user } = useAuth();
  const userId = user?.id;
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [dataRevision, setDataRevision] = useState(0);
  const [search, setSearch] = useState('');
  const requestGeneration = useRef(0);

  useEffect(() => {
    return subscribeDomain(userId, 'access', () => {
      requestGeneration.current += 1;
      setPatients([]);
      setDataRevision(value => value + 1);
    });
  }, [userId]);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    const generation = ++requestGeneration.current;
    const isCurrent = () => !cancelled && generation === requestGeneration.current;
    setLoading(true);
    setLoadError(false);
    const fetchPatients = async () => {
      try {
        const { data, error } = await supabase.rpc('get_patients_for_new_chat', {
          p_nutritionist_id: userId
        });
        if (!isCurrent()) return;
        if (error) throw error;
        setPatients(data || []);
      } catch (error) {
        if (!isCurrent()) return;
        setLoadError(true);
        logDiagnostic('error', 'components/nutritionist/NewChatModal.jsx', 'Error fetching patients for chat:', error?.code || 'unknown');
      } finally {
        if (isCurrent()) setLoading(false);
      }
    };
    void fetchPatients();
    return () => { cancelled = true; };
  }, [open, userId, dataRevision]);

  const filteredPatients = patients.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>Nova Conversa</DialogTitle>
          <DialogDescription>
            Selecione um paciente para iniciar um novo chat.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 bg-muted/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome..."
              className="pl-9 bg-white border-none shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[60dvh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : loadError ? (
            <div className="p-8 space-y-3">
              <p role="alert" className="text-sm text-destructive">Não foi possível carregar os pacientes.</p>
              <Button variant="outline" onClick={() => setDataRevision(value => value + 1)}>Tentar novamente</Button>
            </div>
          ) : filteredPatients.length > 0 ? (
            <div className="divide-y divide-border/50">
              {filteredPatients.map(patient => (
                <button
                  key={patient.id}
                  onClick={() => onSelectPatient(patient)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border border-border/50">
                    {patient.avatar_url ? (
                      <PrivateImage
                        src={patient.avatar_url}
                        alt={patient.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserIcon className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{patient.name}</p>
                    {!patient.is_active && (
                      <Badge variant="outline" className="text-xs h-4 px-1 absolute right-3 mt-[-18px]">
                        Arquivado
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">Nenhum paciente encontrado.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewChatModal;
