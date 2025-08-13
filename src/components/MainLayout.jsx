import React, { useState, useMemo } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShoppingCart as ShoppingCartIcon, Leaf } from 'lucide-react';
import ShoppingCart from '@/components/ShoppingCart';
import { useCart } from '@/hooks/useCart';

const Header = ({ onCartClick, totalItems }) => (
  <header className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-emerald-100">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center h-16">
        <Link to="/store" className="flex items-center gap-2 group">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
            <Leaf className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold gradient-text">HipoZero Store</span>
        </Link>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onCartClick}
          className="relative text-gray-700 hover:text-emerald-600 transition-colors"
          aria-label="Open shopping cart"
        >
          <ShoppingCartIcon size={28} />
          {totalItems > 0 && (
            <motion.span 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-2 bg-pink-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold"
            >
              {totalItems}
            </motion.span>
          )}
        </motion.button>
      </div>
    </div>
  </header>
);

const MainLayout = () => {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { cartItems } = useCart();
  const totalItems = useMemo(() => cartItems.reduce((sum, item) => sum + item.quantity, 0), [cartItems]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50">
      <Header onCartClick={() => setIsCartOpen(true)} totalItems={totalItems} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Outlet />
      </main>
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />
    </div>
  );
};

export default MainLayout;