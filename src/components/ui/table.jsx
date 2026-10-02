import * as React from "react"

import { cn } from "@/lib/utils"

const MobileTableContext = React.createContext(null);
const Table = React.forwardRef(({ className, mobileLabels, children, ...props }, ref) => (
  <div className="relative w-full min-w-0 overflow-auto focus-visible:outline-ring" tabIndex={0} role="region" aria-label={props['aria-label'] || 'Tabela: use as setas para rolar quando necessário'}>
    <MobileTableContext.Provider value={mobileLabels}>
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
      data-responsive={mobileLabels ? 'cards' : undefined}
    >{children}</table>
    </MobileTableContext.Provider>
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef(({ className, children, ...props }, ref) => {
  const labels = React.useContext(MobileTableContext);
  return (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  >{React.Children.map(children, (child, index) => labels && React.isValidElement(child) && child.type === TableCell ? React.cloneElement(child, { 'data-label': labels[index], 'data-span': child.props.colSpan > 1 ? 'all' : undefined }) : child)}</tr>
  );
})
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef(({ className, ...props }, ref) => (
  <th
    scope="col"
    ref={ref}
    className={cn(
      "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
