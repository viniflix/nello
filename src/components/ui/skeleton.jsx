import { cn } from "@/lib/utils"
import { forwardRef, useCallback } from 'react';
import { useElementActivity } from '@/hooks/useElementActivity';

const Skeleton = forwardRef(function Skeleton({
  className,
  style,
  ...props
}, forwardedRef) {
  const { ref, active } = useElementActivity();
  const assignRef = useCallback(element => {
    ref.current = element;
    if (typeof forwardedRef === 'function') forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  }, [ref, forwardedRef]);
  return (
    <div
      {...props}
      ref={assignRef}
      className={cn("animate-pulse motion-reduce:animate-none rounded-md bg-muted", className)}
      style={{ ...style, animationPlayState: active ? style?.animationPlayState : 'paused' }}
    />
  )
});

export { Skeleton }
