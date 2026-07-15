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
  const requestSequenceRef = useRef({
    impact: 0,
    chain: 0,
    comparison: 0,
    mutation: 0,
    status: 0,
  });
  const chainTargetId = rootRecordId || recordId;

  useEffect(() => {
    const requestSequence = requestSequenceRef.current;
    lifecycleGenerationRef.current += 1;
    Object.keys(requestSequence).forEach((key) => {
      requestSequence[key] += 1;
    });
    setImpact(null);
    setChain([]);
    setComparison(null);
    setStatus('idle');
    setError(null);
    setConflict(null);

    return () => {
      lifecycleGenerationRef.current += 1;
      Object.keys(requestSequence).forEach((key) => {
        requestSequence[key] += 1;
      });
    };
  }, [chainTargetId, recordId]);

  const isCurrentRequest = useCallback(
    (generation, domain, requestId) => (
      lifecycleGenerationRef.current === generation
      && requestSequenceRef.current[domain] === requestId
    ),
    [],
  );

  const isCurrentStatus = useCallback(
    (generation, statusRequestId) => (
      lifecycleGenerationRef.current === generation
      && requestSequenceRef.current.status === statusRequestId
    ),
    [],
  );

  const beginMutation = useCallback(() => {
    const requests = requestSequenceRef.current;
    requests.impact += 1;
    requests.chain += 1;
    requests.comparison += 1;

    return {
      generation: lifecycleGenerationRef.current,
      mutationRequestId: ++requests.mutation,
      statusRequestId: ++requests.status,
    };
  }, []);

  const loadChain = useCallback(async () => {
    if (!chainTargetId) return null;
    const generation = lifecycleGenerationRef.current;
    const chainRequestId = ++requestSequenceRef.current.chain;
    const statusRequestId = ++requestSequenceRef.current.status;
    setStatus('loading-chain');
    setError(null);

    const { data, error: chainError } = await listClinicalRecordVersionChain(chainTargetId);
    if (!isCurrentRequest(generation, 'chain', chainRequestId)) return null;

    if (chainError) {
      if (isCurrentStatus(generation, statusRequestId)) {
        setError(GENERIC_ERROR_MESSAGES.chain);
        setStatus('error');
      }
      return null;
    }

    const nextChain = Array.isArray(data) ? data : [];
    setChain(nextChain);
    if (isCurrentStatus(generation, statusRequestId)) setStatus('idle');
    return nextChain;
  }, [chainTargetId, isCurrentRequest, isCurrentStatus]);

  const refreshChainAfterMutation = useCallback(async ({
    generation,
    mutationRequestId,
    statusRequestId,
  }, finalStatus = 'idle') => {
    if (!chainTargetId) {
      if (
        isCurrentRequest(generation, 'mutation', mutationRequestId)
        && isCurrentStatus(generation, statusRequestId)
      ) setStatus(finalStatus);
      return [];
    }

    const chainRequestId = ++requestSequenceRef.current.chain;
    const { data, error: chainError } = await listClinicalRecordVersionChain(chainTargetId);
    if (
      !isCurrentRequest(generation, 'mutation', mutationRequestId)
      || !isCurrentRequest(generation, 'chain', chainRequestId)
    ) return null;
    if (chainError) {
      if (isCurrentStatus(generation, statusRequestId)) {
        setError(GENERIC_ERROR_MESSAGES.chain);
        setStatus('error');
      }
      return null;
    }

    const nextChain = Array.isArray(data) ? data : [];
    setChain(nextChain);
    if (isCurrentStatus(generation, statusRequestId)) setStatus(finalStatus);
    return nextChain;
  }, [chainTargetId, isCurrentRequest, isCurrentStatus]);

  const loadImpact = useCallback(async () => {
    if (!recordId) return null;
    const generation = lifecycleGenerationRef.current;
    const impactRequestId = ++requestSequenceRef.current.impact;
    const statusRequestId = ++requestSequenceRef.current.status;
    setStatus('loading-impact');
    setError(null);
    setConflict(null);

    const { data, error: impactError } = await getAmendmentImpact(recordId);
    if (!isCurrentRequest(generation, 'impact', impactRequestId)) return null;

    if (impactError) {
      setImpact(null);
      if (isCurrentStatus(generation, statusRequestId)) {
        setError(GENERIC_ERROR_MESSAGES.impact);
        setStatus('error');
      }
      return null;
    }

    const nextImpact = normalizeImpact(data);
    setImpact(nextImpact);
    if (isCurrentStatus(generation, statusRequestId)) setStatus('idle');
    return nextImpact;
  }, [isCurrentRequest, isCurrentStatus, recordId]);

  const handleMutationError = useCallback(async (mutationError, request, fallbackMessage) => {
    const { generation, mutationRequestId, statusRequestId } = request;
    if (!isCurrentRequest(generation, 'mutation', mutationRequestId)) return;

    if (isAmendmentConflict(mutationError)) {
      setImpact(null);
      setComparison(null);
      setConflict(mutationError);
      setError(null);
      if (isCurrentStatus(generation, statusRequestId)) setStatus('conflict');
      await refreshChainAfterMutation(request, 'conflict');
      return;
    }

    setConflict(null);
    if (isCurrentStatus(generation, statusRequestId)) {
      setError(fallbackMessage);
      setStatus('error');
    }
  }, [isCurrentRequest, isCurrentStatus, refreshChainAfterMutation]);

  const startCorrection = useCallback(async (reason, impactConfirmation) => {
    if (!recordId) return null;
    const request = beginMutation();
    setStatus('starting-correction');
    setError(null);
    setConflict(null);

    const { data, error: correctionError } = await startClinicalRecordCorrection(
      recordId,
      reason,
      impactConfirmation,
    );
    if (!isCurrentRequest(request.generation, 'mutation', request.mutationRequestId)) return null;
    if (correctionError) {
      await handleMutationError(
        correctionError,
        request,
        GENERIC_ERROR_MESSAGES.correction,
      );
      return null;
    }

    setImpact(null);
    setComparison(null);
    await refreshChainAfterMutation(request);
    if (!isCurrentRequest(request.generation, 'mutation', request.mutationRequestId)) return null;
    return data;
  }, [beginMutation, handleMutationError, isCurrentRequest, recordId, refreshChainAfterMutation]);

  const abandonCorrection = useCallback(async (amendmentId, reason) => {
    if (!amendmentId) return null;
    const request = beginMutation();
    setStatus('abandoning-correction');
    setError(null);
    setConflict(null);

    const { data, error: abandonmentError } = await abandonClinicalRecordCorrection(
      amendmentId,
      reason,
    );
    if (!isCurrentRequest(request.generation, 'mutation', request.mutationRequestId)) return null;
    if (abandonmentError) {
      await handleMutationError(
        abandonmentError,
        request,
        GENERIC_ERROR_MESSAGES.abandonment,
      );
      return null;
    }

    setImpact(null);
    setComparison(null);
    await refreshChainAfterMutation(request);
    if (!isCurrentRequest(request.generation, 'mutation', request.mutationRequestId)) return null;
    return data;
  }, [beginMutation, handleMutationError, isCurrentRequest, refreshChainAfterMutation]);

  const invalidateRecord = useCallback(async (reason, impactConfirmation) => {
    if (!recordId) return null;
    const request = beginMutation();
    setStatus('invalidating-record');
    setError(null);
    setConflict(null);

    const { data, error: invalidationError } = await invalidateClinicalRecord(
      recordId,
      reason,
      impactConfirmation,
    );
    if (!isCurrentRequest(request.generation, 'mutation', request.mutationRequestId)) return null;
    if (invalidationError) {
      await handleMutationError(
        invalidationError,
        request,
        GENERIC_ERROR_MESSAGES.invalidation,
      );
      return null;
    }

    setImpact(null);
    setComparison(null);
    await refreshChainAfterMutation(request);
    if (!isCurrentRequest(request.generation, 'mutation', request.mutationRequestId)) return null;
    return data;
  }, [beginMutation, handleMutationError, isCurrentRequest, recordId, refreshChainAfterMutation]);

  const compareVersions = useCallback(async (leftRecordId, rightRecordId) => {
    if (!leftRecordId || !rightRecordId) return null;
    const generation = lifecycleGenerationRef.current;
    const comparisonRequestId = ++requestSequenceRef.current.comparison;
    const statusRequestId = ++requestSequenceRef.current.status;
    setStatus('comparing');
    setError(null);

    const { data, error: comparisonError } = await compareClinicalRecordVersions(
      leftRecordId,
      rightRecordId,
    );
    if (!isCurrentRequest(generation, 'comparison', comparisonRequestId)) return null;

    if (comparisonError) {
      setComparison(null);
      if (isCurrentStatus(generation, statusRequestId)) {
        setError(GENERIC_ERROR_MESSAGES.comparison);
        setStatus('error');
      }
      return null;
    }

    setComparison(data);
    if (isCurrentStatus(generation, statusRequestId)) setStatus('idle');
    return data;
  }, [isCurrentRequest, isCurrentStatus]);

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
