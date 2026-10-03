import { forwardRef } from 'react';
import { usePrivateStorageUrl } from '@/hooks/usePrivateStorageUrl';

export const PrivateImage = forwardRef(({ src, alt = '', fetchPriority, ...props }, ref) => {
  const resolved = usePrivateStorageUrl(src);
  return <img {...props} fetchpriority={fetchPriority} src={resolved} alt={alt} ref={ref} />;
});
PrivateImage.displayName = 'PrivateImage';
