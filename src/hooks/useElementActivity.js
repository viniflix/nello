import { useEffect, useRef, useState } from 'react';

// One observer/listener for all decorative owners, never a polling/security gate.
const owners = new Map();
let observer;
function publish() {
  for (const owner of owners.values()) owner.notify(owner.inView && !document.hidden);
}
export function observeElementActivity(element, notify) {
  if (!element) return () => {};
  if (!owners.size) {
    document.addEventListener('visibilitychange', publish);
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          const owner = owners.get(entry.target);
          if (owner) { owner.inView = entry.isIntersecting; owner.notify(owner.inView && !document.hidden); }
        }
      });
    }
  }
  const owner = { notify, inView: !observer };
  owners.set(element, owner);
  notify(owner.inView && !document.hidden);
  observer?.observe(element);
  return () => {
    owners.delete(element);
    observer?.unobserve(element);
    if (!owners.size) {
      observer?.disconnect(); observer = undefined;
      document.removeEventListener('visibilitychange', publish);
    }
  };
}
export function useElementActivity() {
  const ref = useRef(null);
  const [active, setActive] = useState(false);
  useEffect(() => observeElementActivity(ref.current, setActive), []);
  return { ref, active };
}
