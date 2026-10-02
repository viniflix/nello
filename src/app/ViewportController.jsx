import { useEffect } from 'react';
export default function ViewportController() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      // A keyboard reduces the visual viewport. Pinch zoom must remain scrollable.
      const height = viewport && viewport.scale === 1 ? viewport.height : window.innerHeight;
      document.documentElement.style.setProperty('--app-viewport-height', `${height}px`);
    };
    update(); viewport?.addEventListener('resize', update); window.addEventListener('resize', update);
    return () => { viewport?.removeEventListener('resize', update); window.removeEventListener('resize', update); document.documentElement.style.removeProperty('--app-viewport-height'); };
  }, []);
  return null;
}
