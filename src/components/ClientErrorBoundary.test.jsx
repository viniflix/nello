import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,fireEvent,cleanup} from '@testing-library/react';
import ClientErrorBoundary from './ClientErrorBoundary';
vi.mock('@/infrastructure/observability/telemetry',()=>({captureOperationalError:()=> '00000000-0000-4000-8000-000000000000'}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function Broken(){throw Error('PRIVATE_CLINICAL token=secret');}
it('contains raw data and bounds retries; navigating resets the incident',()=>{
 const expectedError=event=>{if(event.error?.message==='PRIVATE_CLINICAL token=secret')event.preventDefault();};window.addEventListener('error',expectedError);
 vi.spyOn(console,'error').mockImplementation(()=>{});
 const ui=render(<><nav>Navigation remains</nav><ClientErrorBoundary resetKey="a"><Broken/></ClientErrorBoundary></>);
 expect(ui.getByText('Navigation remains')).toBeTruthy();expect(ui.container.textContent).not.toContain('PRIVATE_CLINICAL');expect(ui.container.textContent).not.toContain('secret');
 fireEvent.click(ui.getByText('Tentar novamente'));fireEvent.click(ui.getByText('Tentar novamente'));expect(ui.getByText('Tentar novamente').disabled).toBe(true);
 ui.rerender(<ClientErrorBoundary resetKey="b"><p>Recovered route</p></ClientErrorBoundary>);expect(ui.getByText('Recovered route')).toBeTruthy();
 window.removeEventListener('error',expectedError);
});
