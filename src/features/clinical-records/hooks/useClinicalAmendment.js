import { useCallback, useEffect, useRef, useState } from 'react';
import {
  abandonClinicalRecordCorrection,
  compareClinicalRecordVersions,
  getAmendmentImpact,
  invalidateClinicalRecord,
  listClinicalRecordVersionChain,
  startClinicalRecordCorrection,
} from '../api/amendment-queries';
import { normalizeImpact } from '../model/amendmentSchema';

const CONFLICT_MESSAGES = ['amendment_chain_conflict', 'amendment_impact_changed'];

const isAmendmentConflict = (error) => (
  error?.code === '40001'
  || CONFLICT_MESSAGES.some((message) => error?.message?.includes(message))
);

const GENERIC_ERROR_MESSAGES = {
  impact: 'Não foi possível consultar o impacto da alteração.',
  chain: 'Não foi possível carregar o histórico do registro.',
  comparison: 'Não foi possível comparar as versões do registro.',
  correction: 'Não foi possível iniciar a correção do registro.',
  abandonment: 'Não foi possível abandonar a correção do registro.',
  invalidation: 'Não foi possível invalidar o registro.',
};

export const useClinicalAmendment = (recordId, rootRecordId = null) => {
  const [impact, setImpact] = useState(null);
  const [chain, setChain] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);
  const lifecycleGenerationRef = useRef(0);
  const chainTargetId = rootRecordId || recordId;

  useEffect(() => {
    lifecycleGenerationRef.current += 1;
    setImpact(null);
    setChain([]);
    setComparison(null);
    setStatus('idle');
    setError(null);
    setConflict(null);

    return () => {
      lifecycleGenerationRef.current += 1;
    };
  }, [chainTargetId, recordId]);

  const isCurrentRequest = useCallback(
    (generation) => lifecycleGenerationRef.current === generation,
    [],
  );

  const loadChain = useCallback(async () => {
    if (!chainTargetId) return null;
    const generation = lifecycleGenerationRef.current;
    setStatus('loading-chain');
    setError(null);

    const { data, error: chainError } = await listClinicalRecordVersionChain(chainTargetId);
    if (!isCurrentRequest(generation)) return null;

    if (chainError) {
      setError(GENERIC_ERROR_MESSAGES.chain);
      setStatus('error');
      return null;
    }

    const nextChain = Array.isArray(data) ? data : [];
    setChain(nextChain);
    setStatus('idle');
    return nextChain;
  }, [chainTargetId, isCurrentRequest]);

  const refreshChainAfterMutation = useCallback(async (generation, finalStatus = 'idle') => {
    if (!chainTargetId) {
      if (isCurrentRequest(generation)) setStatus(finalStatus);
      return [];
    }

    const { data, error: chainError } = await listClinicalRecordVersionChain(chainTargetId);
    if (!isCurrentRequest(generation)) return null;
    if (chainError) {
      setError(GENERIC_ERROR_MESSAGES.chain);
      setStatus('error');
      return null;
    }

    const nextChain = Array.isArray(data) ? data : [];
    setChain(nextChain);
    setStatus(finalStatus);
    return nextChain;
  }, [chainTargetId, isCurrentRequest]);

  const loadImpact = useCallback(async () => {
    if (!recordId) return null;
    const generation = lifecycleGenerationRef.current;
    setStatus('loading-impact');
    setError(null);
    setConflict(null);

    const { data, error: impactError } = await getAmendmentImpact(recordId);
    if (!isCurrentRequest(generation)) return null;

    if (impactError) {
      setImpact(null);
      setError(GENERIC_ERROR_MESSAGES.impact);
      setStatus('error');
      return null;
    }

    const nextImpact = normalizeImpact(data);
    setImpact(nextImpact);
    setStatus('idle');
    return nextImpact;
  }, [isCurrentRequest, recordId]);

  const handleMutationError = useCallback(async (mutationError, generation, fallbackMessage) => {
    if (!isCurrentRequest(generation)) return;

    if (isAmendmentConflict(mutationError)) {
      setImpact(null);
      setComparison(null);
      setConflict(mutationError);
      setError(null);
      setStatus('conflict');
      await refreshChainAfterMutation(generation, 'conflict');
      return;
    }

    setError(fallbackMessage);
    setConflict(null);
    setStatus('error');
  }, [isCurrentRequest, refreshChainAfterMutation]);

  const startCorrection = useCallback(async (reason, impactConfirmation) => {
    if (!recordId) return null;
    const generation = lifecycleGenerationRef.current;
    setStatus('starting-correction');
    setError(null);
    setConflict(null);

    const { data, error: correctionError } = await startClinicalRecordCorrection(
      recordId,
      reason,
      impactConfirmation,
    );
    if (!isCurrentRequest(generation)) return null;
    if (correctionError) {
      await handleMutationError(
        correctionError,
        generation,
        GENERIC_ERROR_MESSAGES.correction,
      );
      return null;
    }

    setImpact(null);
    setComparison(null);
    await refreshChainAfterMutation(generation);
    return data;
  }, [handleMutationError, isCurrentRequest, recordId, refreshChainAfterMutation]);

  const abandonCorrection = useCallback(async (amendmentId, reason) => {
    if (!amendmentId) return null;
    const generation = lifecycleGenerationRef.current;
    setStatus('abandoning-correction');
    setError(null);
    setConflict(null);

    const { data, error: abandonmentError } = await abandonClinicalRecordCorrection(
      amendmentId,
      reason,
    );
    if (!isCurrentRequest(generation)) return null;
    if (abandonmentError) {
      await handleMutationError(
        abandonmentError,
        generation,
        GENERIC_ERROR_MESSAGES.abandonment,
      );
      return null;
    }

    setImpact(null);
    setComparison(null);
    await refreshChainAfterMutation(generation);
    return data;
  }, [handleMutationError, isCurrentRequest, refreshChainAfterMutation]);

  const invalidateRecord = useCallback(async (reason, impactConfirmation) => {
    if (!recordId) return null;
    const generation = lifecycleGenerationRef.current;
    setStatus('invalidating-record');
    setError(null);
    setConflict(null);

    const { data, error: invalidationError } = await invalidateClinicalRecord(
      recordId,
      reason,
      impactConfirmation,
    );
    if (!isCurrentRequest(generation)) return null;
    if (invalidationError) {
      await handleMutationError(
        invalidationError,
        generation,
        GENERIC_ERROR_MESSAGES.invalidation,
      );
      return null;
    }

    setImpact(null);
    setComparison(null);
    await refreshChainAfterMutation(generation);
    return data;
  }, [handleMutationError, isCurrentRequest, recordId, refreshChainAfterMutation]);

  const compareVersions = useCallback(async (leftRecordId, rightRecordId) => {
    if (!leftRecordId || !rightRecordId) return null;
    const generation = lifecycleGenerationRef.current;
    setStatus('comparing');
    setError(null);

    const { data, error: comparisonError } = await compareClinicalRecordVersions(
      leftRecordId,
      rightRecordId,
    );
    if (!isCurrentRequest(generation)) return null;

    if (comparisonError) {
      setComparison(null);
      setError(GENERIC_ERROR_MESSAGES.comparison);
      setStatus('error');
      return null;
    }

    setComparison(data);
    setStatus('idle');
    return data;
  }, [isCurrentRequest]);

  return {
    impact,
    chain,
    comparison,
    status,
    error,
    conflict,
    loadImpact,
    loadChain,
    startCorrection,
    abandonCorrection,
    invalidateRecord,
    compareVersions,
  };
};
