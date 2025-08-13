import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

function SuccessPage() {
  return (
    <>
      <Helmet>
        <title>Compra Realizada com Sucesso! - HipoZero</title>
        <meta name="description" content="Sua compra na loja HipoZero foi concluída com sucesso." />
      </Helmet>
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, type: 'spring' }}
        >
          <Card className="w-full max-w-lg text-center shadow-2xl glass-card border-gray-200/80">
            <CardHeader>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                className="mx-auto w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center mb-4"
              >
                <CheckCircle className="w-12 h-12 text-white" />
              </motion.div>
              <CardTitle className="text-3xl font-bold text-gray-800">Pagamento Aprovado!</CardTitle>
              <CardDescription className="text-lg text-gray-600 mt-2">
                Obrigado pela sua compra.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-8">
                Seu pedido foi processado com sucesso. Em breve, você receberá um e-mail com os detalhes da sua compra.
              </p>
              <Link to="/store">
                <Button size="lg" className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold text-base">
                  <ShoppingBag className="mr-2 h-5 w-5" />
                  Continuar Comprando
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
}

export default SuccessPage;