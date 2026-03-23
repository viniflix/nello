import React, { useState, useEffect } from 'react';
import { Search, User as UserIcon, Loader2, X, PlusCircle } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
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

const NewChatModal = ({ open, onOpenChange, onSelectPatient }) => {
  const { user } = useAuth();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open && user) {
      fetchPatients();
    }
  }, [open, user]);

  const fetchPatients = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_patients_for_new_chat', {
      p_nutritionist_id: user.id
    });

    if (!error && data) {
      setPatients(data);
    } else {
      console.error('Error fetching patients for chat:', error);
    }
    setLoading(false);
  };

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

        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
                      <img 
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
                      <Badge variant="outline" className="text-[10px] h-4 px-1 absolute right-3 mt-[-18px]">
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
