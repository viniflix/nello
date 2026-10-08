import {
	Toast,
	ToastClose,
	ToastDescription,
	ToastProvider,
	ToastTitle,
	ToastViewport,
} from '@/components/ui/toast';
import { useToast } from '@/components/ui/use-toast';
import React from 'react';

export function Toaster() {
	const { toasts } = useToast();

	return (
		<ToastProvider>
			{toasts.map(({ id, title, description, action, dismiss, ...props }) => {
				return (
					<Toast key={id} {...props} onOpenChange={open => {
						props.onOpenChange?.(open);
						if (!open) dismiss();
					}}>
						<div className="grid gap-1">
							{title && <ToastTitle>{title}</ToastTitle>}
							{description && (
								<ToastDescription>{description}</ToastDescription>
							)}
						</div>
						{action}
						<ToastClose />
					</Toast>
				);
			})}
			{/* Keep the interactive notification region available beside modal layers.
			    Radix announces each toast separately; this container adds no announcement. */}
			<div aria-live="off"><ToastViewport /></div>
		</ToastProvider>
	);
}
