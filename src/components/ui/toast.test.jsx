import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {Toast,ToastProvider,ToastViewport,ToastTitle,ToastClose} from './toast';

it('keeps notifications as list items and exposes an operable named dismissal',()=>{
 const changed=vi.fn();
 render(<ToastProvider><Toast open variant="success" onOpenChange={changed}><ToastTitle>Alterações salvas</ToastTitle><ToastClose/></Toast><ToastViewport/></ToastProvider>);
 expect(screen.getByRole('listitem')).toHaveClass('bg-green-700');
 const close=screen.getByRole('button',{name:'Fechar aviso'});fireEvent.click(close);
 expect(changed).toHaveBeenCalledWith(false);
});
