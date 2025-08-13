import React, { useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart as ShoppingCartIcon, X, Plus, Minus } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { Button } from '@/components/ui/button';
import { initializeCheckout, formatCurrency } from '@/api/EcommerceApi';
import { useToast } from '@/components/ui/use-toast';

const CartItem = ({ item, onUpdate, onRemove }) => (
  <div className="flex items-center gap-4 bg-white/5 p-3 rounded-lg border border-white/10">
    <img src={item.product.image} alt={item.product.title} className="w-20 h-20 object-cover rounded-md" />
    <div className="flex-grow">
      <h3 className="font-semibold text-white">{item.product.title}</h3>
      <p className="text-sm text-gray-300">{item.variant.title}</p>
      <p className="text-sm text-purple-400 font-bold">
        {formatCurrency(item.variant.sale_price_in_cents ?? item.variant.price_in_cents, item.variant.currency)}
      </p>
    </div>
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center border border-white/20 rounded-md">
        <Button onClick={() => onUpdate(item.variant.id, Math.max(1, item.quantity - 1))} size="sm" variant="ghost" className="px-2 text-white hover:bg-white/10 h-7 w-7"><Minus size={14}/></Button>
        <span className="px-2 text-white text-sm w-8 text-center">{item.quantity}</span>
        <Button onClick={() => onUpdate(item.variant.id, item.quantity + 1)} size="sm" variant="ghost" className="px-2 text-white hover:bg-white/10 h-7 w-7"><Plus size={14} /></Button>
      </div>
      <Button onClick={() => onRemove(item.variant.id)} size="sm" variant="ghost" className="text-red-400 hover:text-red-300 text-xs h-auto py-0 px-1">Remove</Button>
    </div>
  </div>
);

const ShoppingCart = ({ isCartOpen, setIsCartOpen }) => {
  const { toast } = useToast();
  const { cartItems, removeFromCart, updateQuantity, getCartTotal, clearCart } = useCart();

  const handleCheckout = useCallback(async () => {
    if (cartItems.length === 0) {
      toast({
        title: 'Seu carrinho está vazio',
        description: 'Adicione produtos antes de finalizar a compra.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const items = cartItems.map(item => ({
        variant_id: item.variant.id,
        quantity: item.quantity,
      }));

      const successUrl = `${window.location.origin}/success`;
      const cancelUrl = window.location.href;

      const { url } = await initializeCheckout({ items, successUrl, cancelUrl });

      window.location.href = url;
    } catch (error) {
      toast({
        title: 'Erro no Checkout',
        description: 'Houve um problema ao iniciar o checkout. Tente novamente.',
        variant: 'destructive',
      });
    }
  }, [cartItems, clearCart, toast]);
  
  const cartTotalFormatted = useMemo(() => {
    const total = getCartTotal();
    const currencyInfo = cartItems.length > 0 ? cartItems[0].variant.currency : null;
    return formatCurrency(total, { code: currencyInfo });
  }, [getCartTotal, cartItems]);

  return (
    <AnimatePresence>
      {isCartOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 z-50"
          onClick={() => setIsCartOpen(false)}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute right-0 top-0 h-full w-full max-w-md bg-gray-800/80 backdrop-blur-xl shadow-2xl flex flex-col text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-2xl font-bold">Carrinho</h2>
              <Button onClick={() => setIsCartOpen(false)} variant="ghost" size="icon" className="text-white hover:bg-white/10">
                <X />
              </Button>
            </div>
            <div className="flex-grow p-6 overflow-y-auto space-y-4">
              {cartItems.length === 0 ? (
                <div className="text-center text-gray-400 h-full flex flex-col items-center justify-center">
                  <ShoppingCartIcon size={48} className="mb-4" />
                  <p>Seu carrinho está vazio.</p>
                </div>
              ) : (
                cartItems.map(item => (
                  <CartItem key={item.variant.id} item={item} onUpdate={updateQuantity} onRemove={removeFromCart} />
                ))
              )}
            </div>
            {cartItems.length > 0 && (
              <div className="p-6 border-t border-white/10">
                <div className="flex justify-between items-center mb-4 text-white">
                  <span className="text-lg font-medium">Total</span>
                  <span className="text-2xl font-bold text-purple-400">{cartTotalFormatted}</span>
                </div>
                <Button onClick={handleCheckout} className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 text-base">
                  Finalizar Compra
                </Button>
                 <Button onClick={clearCart} variant="link" className="w-full text-center text-xs mt-2 text-gray-400 hover:text-red-400">
                    Limpar carrinho
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ShoppingCart;