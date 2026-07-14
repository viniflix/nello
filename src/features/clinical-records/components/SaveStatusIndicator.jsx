import React, { useEffect, useState } from 'react';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SaveStatusIndicator = ({ status, error, lastSaved }) => {
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    let timeout;
    if (status === 'idle' && lastSaved) {
      setShowSaved(true);
      // Fade out the 'Saved' status after 3 seconds
      timeout = setTimeout(() => {
        setShowSaved(false);
      }, 3000);
    } else {
      setShowSaved(false);
    }
    return () => clearTimeout(timeout);
  }, [status, lastSaved]);

  return (
    <div className="flex items-center text-sm font-medium h-8 overflow-hidden">
      <AnimatePresence mode="wait">
        {status === 'saving' && (
          <motion.div
            key="saving"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="flex items-center text-zinc-500 dark:text-zinc-400"
          >
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            <span className="text-xs">Salvando...</span>
          </motion.div>
        )}

        {status === 'idle' && showSaved && (
          <motion.div
            key="saved"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="flex items-center text-emerald-600 dark:text-emerald-500"
          >
            <Check className="w-3.5 h-3.5 mr-1.5" />
            <span className="text-xs">Salvo</span>
          </motion.div>
        )}

        {status === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, x: 5 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -5 }}
            transition={{ duration: 0.2 }}
            className="flex items-center text-red-600 dark:text-red-400"
            title={error}
          >
            <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
            <span className="text-xs">Erro ao salvar</span>
          </motion.div>
        )}

        {status === 'idle' && !lastSaved && !showSaved && (
          <motion.div
            key="unsaved"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-zinc-400 dark:text-zinc-500"
          >
            <span className="text-xs">Não salvo</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SaveStatusIndicator;
