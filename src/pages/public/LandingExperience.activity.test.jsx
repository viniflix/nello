import React from 'react';
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { useLandingMotion } from './LandingExperience';
vi.mock('./usePublicReveal',()=>({usePublicReveal:()=>{}}));
let observers, reduced;
beforeEach(()=>{
  vi.useFakeTimers();observers=[];reduced=false;
  vi.spyOn(document,'hidden','get').mockReturnValue(false);
  vi.stubGlobal('matchMedia',vi.fn(()=>({get matches(){return reduced},addEventListener(){},removeEventListener(){}})));
  vi.stubGlobal('IntersectionObserver',class{constructor(callback){this.callback=callback;this.disconnect=vi.fn();observers.push(this)}observe(){}disconnect(){}});
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals()});
function Scene(){const{root}=useLandingMotion();return <main ref={root}><section className="landing-journey"><div className="landing-journey-grid"><article><span className="landing-journey-node"/></article><article><span className="landing-journey-node"/></article></div></section></main>}
it('avoids journey layout reads while the scene is offscreen',()=>{
  const rect=vi.spyOn(HTMLElement.prototype,'getBoundingClientRect');render(<Scene/>);act(()=>vi.advanceTimersByTime(100));expect(rect).not.toHaveBeenCalled();
  act(()=>{window.dispatchEvent(new Event('scroll'));vi.advanceTimersByTime(100)});expect(rect).not.toHaveBeenCalled();
});
it('resumes on intersection, stops again on exit and cancels hidden or unmounted frames',()=>{
  const rect=vi.spyOn(HTMLElement.prototype,'getBoundingClientRect');const ui=render(<Scene/>);const scene=ui.container.querySelector('section');
  act(()=>{observers[0].callback([{target:scene,isIntersecting:true}]);vi.advanceTimersByTime(100)});expect(rect).toHaveBeenCalledTimes(2);expect(ui.container.querySelector('[data-care-active]')).not.toBeNull();
  act(()=>{observers[0].callback([{target:scene,isIntersecting:false}]);vi.advanceTimersByTime(100)});expect(rect).toHaveBeenCalledTimes(2);
  act(()=>window.dispatchEvent(new Event('scroll')));vi.spyOn(document,'hidden','get').mockReturnValue(true);act(()=>document.dispatchEvent(new Event('visibilitychange')));act(()=>vi.advanceTimersByTime(100));expect(rect).toHaveBeenCalledTimes(2);
  ui.unmount();expect(observers[0].disconnect).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});
it('does not activate care progress with reduced motion',()=>{
  reduced=true;const ui=render(<Scene/>);const scene=ui.container.querySelector('section');act(()=>{observers[0].callback([{target:scene,isIntersecting:true}]);vi.advanceTimersByTime(100)});expect(ui.container.querySelector('[data-care-active]')).toBeNull();
});
