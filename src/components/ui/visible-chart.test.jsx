import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,act,cleanup} from '@testing-library/react';
import {VisibleChart} from './visible-chart';
vi.mock('recharts',()=>({ResponsiveContainer:({children,width,height})=><div data-testid="chart" data-size={`${width}:${height}`}>{children}</div>}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('does not mount hidden charts and handles repeated zero/nonzero resize without feedback loops',()=>{
 let resize;const disconnect=vi.fn();vi.stubGlobal('ResizeObserver',class{constructor(fn){resize=fn;}observe(){}disconnect=disconnect;});
 let size={width:0,height:0};vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(()=>size);
 const ui=render(<VisibleChart><span>content</span></VisibleChart>);expect(ui.queryByTestId('chart')).toBeNull();
 act(()=>{size={width:500.9,height:300.1};resize();resize();});expect(ui.getByTestId('chart').dataset.size).toBe('500:300');
 act(()=>{size={width:0,height:0};resize();});expect(ui.queryByTestId('chart')).toBeNull();
 act(()=>{size={width:390,height:300};resize();});expect(ui.getByTestId('chart').dataset.size).toBe('390:300');
 ui.unmount();expect(disconnect).toHaveBeenCalledOnce();
});
