import React from 'react';
import {it,expect,vi} from 'vitest';
import {render,fireEvent} from '@testing-library/react';
import MeasureLoadError from './MeasureLoadError';
it('offers an accessible retry without exposing backend text or submitting the enclosing form',()=>{
 const retry=vi.fn(),submit=vi.fn();const ui=render(<form onSubmit={submit}><MeasureLoadError error={{message:'PRIVATE_PATIENT token=secret',status:401}} onRetry={retry}/></form>);
 expect(ui.getByRole('alert')).toHaveTextContent('Sua sessão expirou');expect(ui.container.textContent).not.toContain('PRIVATE_PATIENT');
 fireEvent.click(ui.getByRole('button'));expect(retry).toHaveBeenCalledOnce();expect(submit).not.toHaveBeenCalled();
 ui.rerender(<MeasureLoadError error={{status:503}} onRetry={retry} loading/>);expect(ui.getByRole('button')).toBeDisabled();
 ui.rerender(<MeasureLoadError error={null} onRetry={retry}/>);expect(ui.queryByRole('alert')).toBeNull();
});
