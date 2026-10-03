import { cn } from '@/lib/utils';
import React from 'react';

const Input = React.forwardRef(({ className, type, value, onChange, onFocus, onBlur, ...props }, ref) => {
  // Numeric consumers often coerce an empty value to zero. Keep the text being
  // edited until blur so deleting a digit or replacing a number stays possible.
  const [editingValue, setEditingValue] = React.useState(null);
  const ownChange = React.useRef(false);
  const previousValue = React.useRef(value);
  const numeric = type === 'number' && value !== undefined;
  React.useLayoutEffect(() => {
    if (!ownChange.current && previousValue.current !== value && editingValue !== null) setEditingValue(String(value ?? ''));
    ownChange.current = false;
    previousValue.current = value;
  });
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background file:border-0 file:bg-transparent file:text-base md:file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
      value={numeric && editingValue !== null ? editingValue : value}
      onFocus={(event) => { if (numeric) setEditingValue(event.target.value); onFocus?.(event); }}
      onChange={(event) => { if (numeric) { ownChange.current = true; setEditingValue(event.target.value); } onChange?.(event); }}
      onBlur={(event) => { setEditingValue(null); onBlur?.(event); }}
    />
  );
});
Input.displayName = 'Input';

export { Input };
