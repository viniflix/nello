import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

const CollapsibleContext = React.createContext({})

const Collapsible = ({ open, onOpenChange, children, className, ...props }) => {
  const contentId = React.useId()
  const handleToggle = () => {
    if (onOpenChange) {
      onOpenChange(!open)
    }
  }

  return (
    <CollapsibleContext.Provider value={{ open, contentId, onToggle: handleToggle }}>
      <div className={cn("w-full", className)} {...props}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  )
}

const CollapsibleTrigger = React.forwardRef(({ className, children, asChild = false, ...props }, ref) => {
  const { open, contentId, onToggle } = React.useContext(CollapsibleContext)
  const Component = asChild ? Slot : 'button'

  return (
    <Component type="button" aria-expanded={open} aria-controls={contentId}
      ref={ref}
      className={cn("cursor-pointer", className)}
      onClick={onToggle}
      {...props}
    >
      {children}
    </Component>
  )
})
CollapsibleTrigger.displayName = "CollapsibleTrigger"

const CollapsibleContent = React.forwardRef(({ className, children, ...props }, ref) => {
  const { open, contentId } = React.useContext(CollapsibleContext)

  if (!open) return null

  return (
    <div
      id={contentId}
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
