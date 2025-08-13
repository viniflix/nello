import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import ProductsList from '@/components/ProductsList';

function StorePage() {
  return (
    <>
      <Helmet>
        <title>Loja - HipoZero</title>
        <meta name="description" content="Explore nossa seleção de produtos saudáveis na loja HipoZero." />
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-gray-800">
            Nossos Produtos
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Descubra uma seleção de produtos escolhidos para complementar sua jornada de bem-estar.
          </p>
        </div>
        <ProductsList />
      </motion.div>
    </>
  );
}

export default StorePage;