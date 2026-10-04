import React, { useEffect, useRef, useState } from 'react';
import { X, Save, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
export default function MealPlanEditorFooter({ loading, savingAction, editing, onCancel, onSaveDraft }) {
    const footer = useRef(null);
    const [sticky, setSticky] = useState(false);
    useEffect(() => {
        const update = () => setSticky(Boolean(footer.current && footer.current.getBoundingClientRect().height <= window.innerHeight * 0.2));
        const observer = new ResizeObserver(update);
        observer.observe(footer.current);
        window.addEventListener('resize', update);
        update();
        return () => { observer.disconnect(); window.removeEventListener('resize', update); };
    }, []);
    return <div ref={footer} id="meal-plan-editor-actions" className={`${sticky ? 'sticky bottom-0' : 'relative'} z-10 grid grid-cols-2 gap-2 rounded-2xl border bg-white p-3 shadow-sm sm:flex sm:items-center sm:justify-end`} aria-label="Salvar plano">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading} className="gap-2 bg-white px-2 sm:px-4"><X className="hidden h-4 w-4 sm:block" />Cancelar</Button>
        <Button type="button" variant="outline" onClick={onSaveDraft} disabled={loading} className="gap-2 bg-white px-2 sm:px-4"><Save className="hidden h-4 w-4 sm:block" />{savingAction === 'draft' ? 'Salvando rascunho…' : 'Salvar rascunho'}</Button>
        <Button type="submit" disabled={loading} className="col-span-2 gap-2 px-2 font-semibold sm:px-4"><CheckCircle2 className="hidden h-4 w-4 sm:block" />{savingAction === 'apply' || (loading && !savingAction) ? 'Aplicando…' : editing ? 'Aplicar alterações' : 'Aplicar plano alimentar'}</Button>
    </div>;
}
