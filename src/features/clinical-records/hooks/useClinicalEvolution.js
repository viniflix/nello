import { useCallback, useEffect, useRef, useState } from 'react';
import {
  finalizeClinicalRecord,
  signClinicalRecord,
  updateClinicalRecordDraft,
} from '../api/evolution-queries';

const AUTOSAVE_DELAY_MS = 15000;

const draftsMatch = (contentA, visibilityA, contentB, visibilityB) => (
  visibilityA === visibilityB && JSON.stringify(contentA) === JSON.stringify(contentB)
);

const isRevisionConflict = (error) => (
  error?.code === '40001' || error?.message?.includes('draft_revision_conflict')
);

export const useClinicalEvolution = (initialRecord = null) => {
  const [record, setRecord] = useState(initialRecord);
  const [content, setContentState] = useState(initialRecord?.content || {});
  const [visibility, setVisibilityState] = useState(
    initialRecord?.visibility || 'professional_private',
  );
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState(initialRecord?.updated_at || null);

  const incomingRecordRef = useRef(initialRecord);
  const recordRef = useRef(initialRecord);
  const contentRef = useRef(initialRecord?.content || {});
  const visibilityRef = useRef(initialRecord?.visibility || 'professional_private');
  const revisionRef = useRef(initialRecord?.revision || null);
  const dirtyRef = useRef(false);
  const lifecycleGenerationRef = useRef(0);
  const saveGenerationRef = useRef(0);
  const saveTimeoutRef = useRef(null);
  const inFlightSaveRef = useRef(null);
  const finalizationInFlightRef = useRef(false);
  incomingRecordRef.current = initialRecord;

  const clearSaveTimeout = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    lifecycleGenerationRef.current += 1;
    saveGenerationRef.current += 1;
    clearSaveTimeout();
    inFlightSaveRef.current = null;
    finalizationInFlightRef.current = false;

    const nextRecord = incomingRecordRef.current;
    const nextContent = nextRecord?.content || {};
    const nextVisibility = nextRecord?.visibility || 'professional_private';

    recordRef.current = nextRecord;
    contentRef.current = nextContent;
    visibilityRef.current = nextVisibility;
    revisionRef.current = nextRecord?.revision || null;
    dirtyRef.current = false;

    setRecord(nextRecord);
    setContentState(nextContent);
    setVisibilityState(nextVisibility);
    setHasUnsavedChanges(false);
    setLastSaved(nextRecord?.updated_at || null);
    setStatus('idle');
    setError(null);
    setConflict(null);
  }, [
    clearSaveTimeout,
    initialRecord?.id,
    initialRecord?.revision,
    initialRecord?.status,
    initialRecord?.updated_at,
  ]);

  useEffect(() => () => {
    lifecycleGenerationRef.current += 1;
    clearSaveTimeout();
  }, [clearSaveTimeout]);

  const performSave = useCallback(() => {
    const targetRecord = recordRef.current;
    if (!targetRecord?.id || targetRecord.status !== 'draft' || !dirtyRef.current) {
      return Promise.resolve({ ok: true, reason: 'clean' });
    }

    clearSaveTimeout();
    const lifecycleGeneration = lifecycleGenerationRef.current;
    const saveGeneration = ++saveGenerationRef.current;
    const recordId = targetRecord.id;
    const contentSnapshot = contentRef.current;
    const visibilitySnapshot = visibilityRef.current;
    const expectedRevision = revisionRef.current;

    setStatus('saving');
    setError(null);

    const savePromise = (async () => {
      const { data, error: saveError } = await updateClinicalRecordDraft(
        recordId,
        contentSnapshot,
        visibilitySnapshot,
        expectedRevision,
      );

      const isCurrentRecord = (
        lifecycleGenerationRef.current === lifecycleGeneration
        && recordRef.current?.id === recordId
      );
      if (!isCurrentRecord) return { ok: true, reason: 'clean' };

      if (saveError) {
        if (isRevisionConflict(saveError)) {
          setConflict(saveError);
          setStatus('conflict');
          return { ok: false, reason: 'conflict' };
        }

        setError(saveError.message || 'Erro ao salvar rascunho');
        setStatus('error');
        return { ok: false, reason: 'error' };
      }

      recordRef.current = data;
      revisionRef.current = data.revision;
      setRecord(data);
      setLastSaved(data.updated_at || null);
      setConflict(null);

      const remainsDirty = !draftsMatch(
        contentRef.current,
        visibilityRef.current,
        contentSnapshot,
        visibilitySnapshot,
      );
      dirtyRef.current = remainsDirty;
      setHasUnsavedChanges(remainsDirty);
      setStatus(remainsDirty ? 'editing' : 'idle');

      return { ok: true, reason: 'saved' };
    })();

    inFlightSaveRef.current = { promise: savePromise, lifecycleGeneration, saveGeneration };
    savePromise.finally(() => {
      if (inFlightSaveRef.current?.saveGeneration === saveGeneration) {
        inFlightSaveRef.current = null;
      }
    });
    return savePromise;
  }, [clearSaveTimeout]);

  const forceSave = useCallback(async () => {
    const activeSave = inFlightSaveRef.current;
    if (activeSave) {
      const activeResult = await activeSave.promise;
      if (!activeResult.ok || activeSave.lifecycleGeneration !== lifecycleGenerationRef.current) {
        return activeResult;
      }
    }

    return performSave();
  }, [performSave]);

  useEffect(() => {
    if (hasUnsavedChanges && record?.status === 'draft' && status === 'editing') {
      clearSaveTimeout();
      saveTimeoutRef.current = setTimeout(() => {
        void forceSave();
      }, AUTOSAVE_DELAY_MS);
    }

    return clearSaveTimeout;
  }, [clearSaveTimeout, forceSave, hasUnsavedChanges, record?.status, status]);

  const setContent = useCallback((nextContent) => {
    if (recordRef.current?.status !== 'draft' || finalizationInFlightRef.current) return;

    const updatedContent = typeof nextContent === 'function'
      ? nextContent(contentRef.current)
      : nextContent;
    contentRef.current = updatedContent;
    dirtyRef.current = true;
    setContentState(updatedContent);
    setHasUnsavedChanges(true);
    setStatus((currentStatus) => (currentStatus === 'conflict' ? currentStatus : 'editing'));
  }, []);

  const setVisibility = useCallback((nextVisibility) => {
    if (recordRef.current?.status !== 'draft' || finalizationInFlightRef.current) return;

    visibilityRef.current = nextVisibility;
    dirtyRef.current = true;
    setVisibilityState(nextVisibility);
    setHasUnsavedChanges(true);
    setStatus((currentStatus) => (currentStatus === 'conflict' ? currentStatus : 'editing'));
  }, []);

  const finalize = useCallback(async (retrospectiveReason = null) => {
    if (!recordRef.current?.id || recordRef.current.status !== 'draft') return false;

    if (dirtyRef.current || inFlightSaveRef.current) {
      const saveResult = await forceSave();
      if (!saveResult.ok) return false;
    }

    const lifecycleGeneration = lifecycleGenerationRef.current;
    const recordId = recordRef.current.id;
    finalizationInFlightRef.current = true;
    setStatus('finalizing');
    setError(null);

    const { data, error: finalizeError } = await finalizeClinicalRecord(
      recordId,
      contentRef.current,
      revisionRef.current,
      retrospectiveReason,
    );
    if (
      lifecycleGenerationRef.current !== lifecycleGeneration
      || recordRef.current?.id !== recordId
    ) {
      finalizationInFlightRef.current = false;
      return false;
    }

    if (finalizeError) {
      finalizationInFlightRef.current = false;
      if (isRevisionConflict(finalizeError)) {
        setConflict(finalizeError);
        setStatus('conflict');
      } else {
        setError(finalizeError.message || 'Erro ao finalizar evolução');
        setStatus('error');
      }
      return false;
    }

    recordRef.current = data;
    finalizationInFlightRef.current = false;
    revisionRef.current = data.revision;
    dirtyRef.current = false;
    setRecord(data);
    setHasUnsavedChanges(false);
    setConflict(null);
    setStatus('idle');
    return true;
  }, [forceSave]);

  const sign = useCallback(async () => {
    const targetRecord = recordRef.current;
    if (!targetRecord?.id || targetRecord.status !== 'finalized') return false;

    const lifecycleGeneration = lifecycleGenerationRef.current;
    setStatus('signing');
    setError(null);
    const { data, error: signError } = await signClinicalRecord(targetRecord.id);
    if (
      lifecycleGenerationRef.current !== lifecycleGeneration
      || recordRef.current?.id !== targetRecord.id
    ) return false;

    if (signError) {
      setError(signError.message || 'Erro ao assinar evolução');
      setStatus('error');
      return false;
    }

    recordRef.current = data;
    revisionRef.current = data.revision;
    setRecord(data);
    setStatus('idle');
    return true;
  }, []);

  return {
    record,
    content,
    visibility,
    status,
    error,
    conflict,
    hasUnsavedChanges,
    // Temporary compatibility alias; Task 6 migrates the editor to the explicit name.
    isDirty: hasUnsavedChanges,
    lastSaved,
    setContent,
    setVisibility,
    forceSave,
    finalize,
    sign,
  };
};
