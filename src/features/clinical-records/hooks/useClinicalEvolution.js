import { useState, useEffect, useCallback, useRef } from 'react';
import {
  updateClinicalRecordDraft,
  finalizeClinicalRecord,
  signClinicalRecord,
  cosignClinicalRecord,
} from '../api/evolution-queries';

const AUTOSAVE_DELAY_MS = 15000;

export const useClinicalEvolution = (initialRecord = null) => {
  const [record, setRecord] = useState(initialRecord);
  const [content, setContent] = useState(initialRecord?.content || {});
  const [visibility, setVisibility] = useState(initialRecord?.visibility || 'professional_private');
  
  // Status machine: idle | editing | saving | finalizing | signing | error
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState(initialRecord?.updated_at || null);

  const saveTimeoutRef = useRef(null);
  const contentRef = useRef(content);
  const visibilityRef = useRef(visibility);
  const recordIdRef = useRef(initialRecord?.id);

  // Keep refs in sync for the timeout closure
  useEffect(() => {
    contentRef.current = content;
    visibilityRef.current = visibility;
  }, [content, visibility]);

  useEffect(() => {
    recordIdRef.current = record?.id;
  }, [record]);

  const forceSave = useCallback(async () => {
    if (!recordIdRef.current || !isDirty || record?.status !== 'draft') return;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setStatus('saving');
    setError(null);
    
    const { data, error: saveError } = await updateClinicalRecordDraft(
      recordIdRef.current,
      contentRef.current,
      visibilityRef.current
    );

    if (saveError) {
      setStatus('error');
      setError(saveError.message || 'Erro ao salvar rascunho');
      return false;
    }

    setRecord(data);
    setLastSaved(data.updated_at);
    setIsDirty(false);
    setStatus('idle');
    return true;
  }, [isDirty, record?.status]);

  // Debounced autosave
  useEffect(() => {
    if (isDirty && record?.status === 'draft') {
      setStatus('editing');
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        forceSave();
      }, AUTOSAVE_DELAY_MS);
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [isDirty, record?.status, forceSave]);

  const handleContentChange = useCallback((newContent) => {
    if (record?.status !== 'draft') return;
    
    // Suporta updater function ou objeto direto
    const updated = typeof newContent === 'function' ? newContent(content) : newContent;
    setContent(updated);
    setIsDirty(true);
  }, [content, record?.status]);

  const handleVisibilityChange = useCallback((newVisibility) => {
    if (record?.status !== 'draft') return;
    setVisibility(newVisibility);
    setIsDirty(true);
  }, [record?.status]);

  const finalize = useCallback(async (retrospectiveReason = null) => {
    if (!recordIdRef.current || record?.status !== 'draft') return false;

    // Save pending changes first
    if (isDirty) {
      const saved = await forceSave();
      if (!saved) return false;
    }

    setStatus('finalizing');
    setError(null);

    const { data, error: finalizeError } = await finalizeClinicalRecord(
      recordIdRef.current,
      contentRef.current,
      retrospectiveReason
    );

    if (finalizeError) {
      setStatus('error');
      setError(finalizeError.message || 'Erro ao finalizar evolução');
      return false;
    }

    setRecord(data);
    setStatus('idle');
    return true;
  }, [isDirty, forceSave, record?.status]);

  const sign = useCallback(async () => {
    if (!recordIdRef.current || record?.status !== 'finalized') return false;

    setStatus('signing');
    setError(null);

    const { data, error: signError } = await signClinicalRecord(recordIdRef.current);

    if (signError) {
      setStatus('error');
      setError(signError.message || 'Erro ao assinar evolução');
      return false;
    }

    setRecord(data);
    setStatus('idle');
    return true;
  }, [record?.status]);

  const cosign = useCallback(async () => {
    if (!recordIdRef.current || record?.status !== 'signed') return false;

    setStatus('signing');
    setError(null);

    const { data, error: cosignError } = await cosignClinicalRecord(recordIdRef.current);

    if (cosignError) {
      setStatus('error');
      setError(cosignError.message || 'Erro ao co-assinar evolução');
      return false;
    }

    setRecord(data);
    setStatus('idle');
    return true;
  }, [record?.status]);

  return {
    record,
    content,
    visibility,
    status,
    error,
    isDirty,
    lastSaved,
    setContent: handleContentChange,
    setVisibility: handleVisibilityChange,
    forceSave,
    finalize,
    sign,
    cosign,
  };
};
