import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';

export default function AgendaPatientPicker({ value, selectedId, onChange, onSearch, patients = [], disabled = false, allowGuest = true, inputId = 'patient_search' }) {
  const [open, setOpen] = useState(false), [rows, setRows] = useState([]);
  const [state, setState] = useState('ready'), [hasMore, setHasMore] = useState(false), [retry, setRetry] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [guestMode, setGuestMode] = useState(false);
  const sequence = useRef(0), offset = useRef(0);
  const select = patient => { onChange(patient.name || 'Paciente', patient.id); setOpen(false); setActiveIndex(-1); };
  useEffect(() => {
    if (!open || disabled || guestMode) return;
    const request = ++sequence.current;
    setActiveIndex(-1); offset.current = 0;
    setState('loading');
    const timer = setTimeout(async () => {
      try {
        const result = onSearch ? await onSearch(value, 0) : { patients: patients.filter(patient => patient.name?.toLocaleLowerCase('pt-BR').includes(value.toLocaleLowerCase('pt-BR'))), hasMore: false };
        if (sequence.current !== request) return;
        setRows(result.patients); setHasMore(result.hasMore); setState('ready');
      } catch { if (sequence.current === request) { setRows([]); setState('error'); } }
    }, 300);
    return () => { clearTimeout(timer); sequence.current += 1; };
  }, [open, disabled, guestMode, value, onSearch, patients, retry]);
  const loadMore = async () => {
    const request = sequence.current;
    setState('loadingMore');
    try {
      const nextOffset = offset.current + 20;
      const result = await onSearch(value, nextOffset);
      if (sequence.current !== request) return;
      offset.current = nextOffset;
      setRows(previous => [...previous, ...result.patients]); setHasMore(result.hasMore); setState('ready');
    } catch { if (sequence.current === request) setState('error'); }
  };
  return <div className="relative min-w-0" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <Label htmlFor={inputId}>{allowGuest ? 'Paciente *' : 'Paciente cadastrado *'}</Label>
    <div className="relative">
      <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input id={inputId} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${inputId}-options`} aria-activedescendant={open && activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined}
        value={value} disabled={disabled} className="pl-10" placeholder="Buscar paciente pelo nome..."
        onChange={event => { onChange(event.target.value, ''); setOpen(!guestMode); }} onFocus={() => { if (!disabled && !guestMode) setOpen(true); }}
        onKeyDown={event => {
          if (guestMode) return;
          if (event.key === 'Escape' || event.key === 'Tab') setOpen(false);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActiveIndex(index => rows.length ? Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))) : -1); }
          if (event.key === 'Enter' && open && activeIndex >= 0 && rows[activeIndex]) { event.preventDefault(); select(rows[activeIndex]); }
        }} />
    </div>
    {allowGuest && !disabled && <Button type="button" variant="ghost" className="agenda-quick-name" aria-pressed={guestMode} onClick={() => { setGuestMode(mode => !mode); setOpen(false); if (!guestMode) onChange(value, ''); }}>{guestMode ? 'Buscar um paciente cadastrado' : 'Reserva rápida · somente nome'}</Button>}
    {open && !disabled && !guestMode && <div className="mt-2 rounded-xl bg-background p-2 shadow-md ring-1 ring-black/5">
      {state === 'loading' && <p role="status" className="p-2 text-sm text-muted-foreground">Buscando pacientes…</p>}
      {state === 'error' && <div role="alert" className="p-2 text-sm">Não foi possível conferir os pacientes.<Button type="button" variant="outline" className="mt-2 min-h-11" onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button></div>}
      <div id={`${inputId}-options`} role="listbox" aria-label="Pacientes com acompanhamento ativo" className="max-h-52 overflow-y-auto">
        {rows.map((patient, index) => <button key={patient.id} id={`${inputId}-option-${index}`} type="button" role="option" aria-selected={selectedId === patient.id} onClick={() => select(patient)}
          className={`flex min-h-11 w-full flex-col rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-primary/5 focus-visible:outline-primary motion-reduce:transition-none ${activeIndex === index ? 'bg-primary/10' : ''}`}>
          <span className="break-words font-medium">{patient.name || 'Paciente'}</span><span className="text-xs text-muted-foreground">Cadastro {patient.id.slice(-6).toUpperCase()}</span>
        </button>)}
      </div>
      {state === 'ready' && !rows.length && <p className="p-2 text-sm text-muted-foreground">Nenhum paciente cadastrado encontrado.</p>}
      {hasMore && onSearch && <Button type="button" variant="ghost" className="min-h-11 w-full" disabled={state !== 'ready'} onClick={loadMore}>{state === 'loadingMore' ? 'Buscando…' : 'Ver mais pacientes'}</Button>}
      {allowGuest && value.trim() && !selectedId && <Button type="button" variant="outline" className="mt-2 min-h-11 h-auto w-full whitespace-normal text-left" onClick={() => { onChange(value.trim(), ''); setOpen(false); }}>Agendar para “{value.trim()}” sem cadastro</Button>}
    </div>}
    {allowGuest && value.trim() && !selectedId && <p className="mt-2 text-xs text-muted-foreground">Nome sem cadastro: reserva o horário sem criar conta ou enviar convite.</p>}
  </div>;
}
