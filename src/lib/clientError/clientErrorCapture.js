import { logOperationalEvent } from '@/lib/supabase/observability-queries';

const MAX_CONSOLE_ENTRIES = 30;
const MAX_ERROR_SIGNATURES = 200;
const DEDUPE_WINDOW_MS = 60 * 1000; // 1 min

const redactSensitiveText = (input) => {
  if (typeof input !== 'string') return input;
  let out = input;

  // Redact tokens in query params (ex: token=...)
  out = out.replace(/([?&]token=)[^&\s]+/gi, '$1[redacted]');

  // Redact Bearer tokens
  out = out.replace(/(Bearer\s+)[A-Za-z0-9\-_\.]+/gi, '$1[redacted]');

  // Redact JWT-looking strings
  out = out.replace(/\beyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\b/g, '[jwt-redacted]');

  // Redact common key/value tokens
  out = out.replace(/\b(api[_-]?key|secret|authorization)\b\s*[:=]\s*['"]?[^'"\s]+['"]?/gi, '$1:[redacted]');

  return out;
};

const safeStringify = (value, maxLen = 2000) => {
  try {
    if (value instanceof Error) {
      return redactSensitiveText(`${value.name}: ${value.message}\n${value.stack || ''}`.slice(0, maxLen));
    }
    if (typeof value === 'string') return redactSensitiveText(value.slice(0, maxLen));
    if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
    return redactSensitiveText(JSON.stringify(value, getCircularReplacer(), 2).slice(0, maxLen));
  } catch {
    try {
      return redactSensitiveText(String(value).slice(0, maxLen));
    } catch {
      return '[unserializable]';
    }
  }
};

const getCircularReplacer = () => {
  const seen = new WeakSet();
  return (_key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[circular]';
      seen.add(val);
    }
    return val;
  };
};

const buildErrorSignature = ({ message, stack, name, route }) => {
  const base = `${name || ''}|${message || ''}|${stack ? stack.slice(0, 400) : ''}|${route || ''}`;
  // Simple hash to keep signature small
  let h = 0;
  for (let i = 0; i < base.length; i += 1) h = (h * 31 + base.charCodeAt(i)) >>> 0;
  return String(h);
};

export const createClientErrorCapture = ({ getUserContext, onErrorCaptured }) => {
  let installed = false;
  let consoleBuffer = [];
  let lastSignatures = new Map(); // signature -> lastMs
  let originalConsole = null;

  const pushConsole = (level, args) => {
    const entry = {
      ts: Date.now(),
      level,
      // Keep it compact: serialize first 3 args only
      args: Array.from(args || []).slice(0, 3).map((a) => safeStringify(a)),
    };
    consoleBuffer = [entry, ...consoleBuffer].slice(0, MAX_CONSOLE_ENTRIES);
  };

  const installConsoleHook = () => {
    if (originalConsole) return;
    originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };

    // eslint-disable-next-line no-console
    console.log = (...args) => {
      try { pushConsole('log', args); } catch {}
      originalConsole.log(...args);
    };
    // eslint-disable-next-line no-console
    console.info = (...args) => {
      try { pushConsole('info', args); } catch {}
      originalConsole.info(...args);
    };
    // eslint-disable-next-line no-console
    console.warn = (...args) => {
      try { pushConsole('warn', args); } catch {}
      originalConsole.warn(...args);
    };
    // eslint-disable-next-line no-console
    console.error = (...args) => {
      try { pushConsole('error', args); } catch {}
      originalConsole.error(...args);
    };
    // eslint-disable-next-line no-console
    console.debug = (...args) => {
      try { pushConsole('debug', args); } catch {}
      originalConsole.debug(...args);
    };
  };

  const getRoute = () => {
    try {
      return `${window.location.pathname}${window.location.search}${window.location.hash}`;
    } catch {
      return null;
    }
  };

  const logClientError = async ({ errorType, message, stack, route, extra }) => {
    const userContext = typeof getUserContext === 'function' ? getUserContext() : null;

    // Ensure insert passes RLS:
    // - For admins: is_admin() allows null nutritionist_id
    // - For non-admin: policy requires nutritionist_id = auth.uid(), so we set it to user.id for both roles.
    const nutritionistId = userContext?.id || null;
    const patientId = userContext?.type === 'patient' ? userContext?.id : null;

    const signature = buildErrorSignature({ message, stack, name: errorType, route });
    const now = Date.now();
    const last = lastSignatures.get(signature);
    if (last && now - last < DEDUPE_WINDOW_MS) return;
    lastSignatures.set(signature, now);

    // Cap signature map growth
    if (lastSignatures.size > MAX_ERROR_SIGNATURES) {
      const keys = Array.from(lastSignatures.keys());
      keys.slice(0, Math.max(0, keys.length - MAX_ERROR_SIGNATURES)).forEach((k) => lastSignatures.delete(k));
    }

    const metadata = {
      error_type: errorType || 'Error',
      route,
      stack: stack ? redactSensitiveText(String(stack).slice(0, 4000)) : null,
      ...extra,
      console: consoleBuffer.map((e) => ({
        ts: e.ts,
        level: e.level,
        args: e.args,
      })),
    };

    // Avoid huge payloads
    if (metadata.console && metadata.console.length > 0) {
      metadata.console = metadata.console.slice(0, 20);
    }

    // Envia para observabilidade original
    await logOperationalEvent({
      module: 'client',
      operation: 'client_error',
      eventType: 'error',
      latencyMs: 0,
      nutritionistId,
      patientId,
      errorMessage: message || null,
      metadata,
    });

    // Callback para o novo sistema de bugs (se fornecido)
    if (typeof onErrorCaptured === 'function') {
      try {
        await onErrorCaptured({
          errorType,
          message,
          stackTrace: stack,
          route,
          user: userContext,
          consoleLog: metadata.console,
          metadata: extra,
        });
      } catch (err) {
        console.error('[ClientErrorCapture] Erro no callback onErrorCaptured:', err);
      }
    }
  };

  const onWindowError = (event) => {
    const { message, error, lineno, colno, filename } = event || {};
    const route = getRoute();

    const errorType = error?.name || 'Error';
    const stack = error?.stack || null;

    // Fire and forget
    void logClientError({
      errorType,
      message: message ? redactSensitiveText(String(message)) : null,
      stack,
      route,
      extra: {
        source: filename || null,
        lineno: lineno || null,
        colno: colno || null,
        kind: 'window_error',
      },
    });
  };

  const onUnhandledRejection = (event) => {
    const route = getRoute();
    const reason = event?.reason;

    let errorType = 'UnhandledRejection';
    let message = null;
    let stack = null;

    if (reason instanceof Error) {
      errorType = reason.name || 'Error';
      message = reason.message;
      stack = reason.stack || null;
    } else if (reason) {
      message = typeof reason === 'string' ? reason : safeStringify(reason, 1200);
      errorType = 'UnhandledRejection';
    }

    void logClientError({
      errorType,
      message: message ? redactSensitiveText(String(message)) : 'Unhandled rejection',
      stack,
      route,
      extra: {
        kind: 'unhandledrejection',
      },
    });
  };

  const install = () => {
    if (installed) return;
    installed = true;

    installConsoleHook();

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
  };

  const uninstall = () => {
    if (!installed) return;
    installed = false;

    window.removeEventListener('error', onWindowError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);

    if (originalConsole) {
      console.log = originalConsole.log;
      console.info = originalConsole.info;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.debug = originalConsole.debug;
    }
    originalConsole = null;
    consoleBuffer = [];
  };

  return {
    install,
    uninstall,
    // Expose for React ErrorBoundary so we can include componentStack
    logNow: (payload) => logClientError(payload),
  };
};
