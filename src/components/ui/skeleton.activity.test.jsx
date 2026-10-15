import React, { createRef } from 'react';
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { Skeleton } from './skeleton';
let instances;
beforeEach(() => {
  instances=[]; vi.spyOn(document,'hidden','get').mockReturnValue(false);
  vi.stubGlobal('IntersectionObserver',class {
    constructor(callback){this.callback=callback;this.disconnect=vi.fn();this.unobserve=vi.fn();instances.push(this)}
    observe(){}
  });
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()});
it('avoids offscreen pulse while preserving the placeholder DOM',()=>{
  const ui=render(<Skeleton data-testid="wait" />);
  expect(ui.getByTestId('wait').style.animationPlayState).toBe('paused');
});
it('shares an observer, resumes in view and releases the last subscription',()=>{
  const ref=createRef();const ui=render(<><Skeleton ref={ref}data-testid="a"style={{height:24}}/><Skeleton data-testid="b"/></>);
  expect(instances).toHaveLength(1);const a=ui.getByTestId('a');expect(ref.current).toBe(a);
  act(()=>instances[0].callback([{target:a,isIntersecting:true}]));expect(a.style.animationPlayState).toBe('');expect(a.style.height).toBe('24px');
  vi.spyOn(document,'hidden','get').mockReturnValue(true);act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(a.style.animationPlayState).toBe('paused');
  vi.spyOn(document,'hidden','get').mockReturnValue(false);act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(a.style.animationPlayState).toBe('');
  ui.unmount();expect(instances[0].unobserve).toHaveBeenCalledTimes(2);expect(instances[0].disconnect).toHaveBeenCalledOnce();
});
it('falls back to document visibility without IntersectionObserver and retains caller pause',()=>{
  vi.stubGlobal('IntersectionObserver',undefined);const ui=render(<Skeleton data-testid="wait" style={{animationPlayState:'paused'}}/>);
  expect(ui.getByTestId('wait').style.animationPlayState).toBe('paused');expect(ui.getByTestId('wait')).toHaveClass('motion-reduce:animate-none');
});
