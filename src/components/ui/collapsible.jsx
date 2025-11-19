import * as React from "react"
import { cn } from "@/lib/utils"

const CollapsibleContext = React.createContext({})

const Collapsible = ({ open, onOpenChange, children, className, ...props }) => {
  const handleToggle = () => {
    if (onOpenChange) {
      onOpenChange(!open)
    }
  }

  return (
    <CollapsibleContext.Provider value={{ open, onToggle: handleToggle }}>
      <div className={cn("w-full", className)} {...props}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  )
}

const CollapsibleTrigger = React.forwardRef(({ className, children, ...props }, ref) => {
  const { onToggle } = React.useContext(CollapsibleContext)

  return (
    <div
      ref={ref}
      className={cn("cursor-pointer", className)}
      onClick={onToggle}
      {...props}
    >
      {children}
    </div>
  )
})
CollapsibleTrigger.displayName = "CollapsibleTrigger"

const CollapsibleContent = React.forwardRef(({ className, children, ...props }, ref) => {
  const { open } = React.useContext(CollapsibleContext)

  if (!open) return null

  return (
    <div
      ref={ref}
      className={cn("overflow-hidden transition-all", className)}
      {...props}
    >
      {children}
    </div>
  )
})
CollapsibleContent.displayName = "CollapsibleContent"

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
