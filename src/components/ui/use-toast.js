import { useState, useEffect } from "react"
import { toPortugueseError } from "@/lib/utils/errorMessages"

const TOAST_LIMIT = 1

let count = 0
function generateId() {
  count = (count + 1) % Number.MAX_VALUE
  return count.toString()
}

const toastStore = {
  state: {
    toasts: [],
  },
  listeners: [],
  
  getState: () => toastStore.state,
  
  setState: (nextState) => {
    if (typeof nextState === 'function') {
      toastStore.state = nextState(toastStore.state)
    } else {
      toastStore.state = { ...toastStore.state, ...nextState }
    }
    
    toastStore.listeners.forEach(listener => listener(toastStore.state))
  },
  
  subscribe: (listener) => {
    toastStore.listeners.push(listener)
    return () => {
      toastStore.listeners = toastStore.listeners.filter(l => l !== listener)
    }
  }
}

const classifyToastLevel = ({ title, description, variant }) => {
  const titleText = typeof title === "string" ? title : ""
  const descText = typeof description === "string" ? description : ""
  const joined = `${titleText} ${descText}`.toLowerCase()

  if (
    variant === "destructive" ||
    /(erro|falha|não foi possível|inval|inválid|obrigat|expirad|permiss|failed|error|invalid|forbidden|not found|denied)/i.test(joined)
  ) {
    return "error"
  }

  if (/(aviso|atenção|warning|pendente|conflito|alerta)/i.test(joined)) {
    return "warning"
  }

  if (/(sucesso|conclu|criad|atualiz|exclu|salv|exportad|enviad|adicionad|realizad|desbloquead|confirmad)/i.test(joined)) {
    return "success"
  }

  return "neutral"
}

const normalizeToastPayload = (props) => {
  const normalized = { ...props }
  const level = classifyToastLevel(normalized)

  if (level === "error") {
    normalized.title = "Erro"
  } else if (level === "warning") {
    normalized.title = "Aviso"
  } else if (level === "success") {
    normalized.title = "Sucesso"
  }

  if (typeof normalized.description === "string" && level === "error") {
    normalized.description = toPortugueseError(
      normalized.description,
      "Ocorreu um erro. Tente novamente."
    )
  }

  return normalized
}

export const toast = ({ ...props }) => {
  const id = generateId()
  const normalizedProps = normalizeToastPayload(props)

  const update = (props) =>
    toastStore.setState((state) => ({
      ...state,
      toasts: state.toasts.map((t) =>
        t.id === id ? { ...t, ...props } : t
      ),
    }))

  const dismiss = () => toastStore.setState((state) => ({
    ...state,
    toasts: state.toasts.filter((t) => t.id !== id),
  }))

  toastStore.setState((state) => ({
    ...state,
    toasts: [
      { ...normalizedProps, id, dismiss },
      ...state.toasts,
    ].slice(0, TOAST_LIMIT),
  }))

  return {
    id,
    dismiss,
    update,
  }
}

export function useToast() {
  const [state, setState] = useState(toastStore.getState())
  
  useEffect(() => {
    const unsubscribe = toastStore.subscribe((state) => {
      setState(state)
    })
    
    return unsubscribe
  }, [])
  
  useEffect(() => {
    const timeouts = []

    state.toasts.forEach((toast) => {
      if (toast.duration === Infinity) {
        return
      }

      const timeout = setTimeout(() => {
        toast.dismiss()
      }, toast.duration || 5000)

      timeouts.push(timeout)
    })

    return () => {
      timeouts.forEach((timeout) => clearTimeout(timeout))
    }
  }, [state.toasts])

  return {
    toast,
    toasts: state.toasts,
  }
}