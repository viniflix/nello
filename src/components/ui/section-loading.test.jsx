import React from'react';import{it,expect,vi,afterEach}from'vitest';import{render,screen,act,cleanup}from'@testing-library/react';import{SectionLoading}from'./section-loading';
afterEach(()=>{cleanup();vi.useRealTimers()});
it('avoids a loading-label flash below 400ms and announces a longer wait',()=>{vi.useFakeTimers();render(<SectionLoading/>);expect(screen.queryByRole('status')).toBeNull();act(()=>vi.advanceTimersByTime(399));expect(screen.queryByRole('status')).toBeNull();act(()=>vi.advanceTimersByTime(1));expect(screen.getByRole('status')).toHaveTextContent('Carregando esta área');});
it('cleans the pending indicator timer on unmount',()=>{vi.useFakeTimers();const ui=render(<SectionLoading/>);ui.unmount();expect(vi.getTimerCount()).toBe(0)});
