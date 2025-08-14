
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CartProvider } from '@/hooks/useCart';
import { ChatProvider } from '@/contexts/ChatContext';

import LoginPage from '@/pages/LoginPage.jsx';
import RegisterPage from '@/pages/RegisterPage.jsx';
import NutritionistDashboard from '@/pages/NutritionistDashboard.jsx';
import PatientDashboard from '@/pages/PatientDashboard.jsx';
import PatientProfile from '@/pages/PatientProfile.jsx';
import StorePage from '@/pages/StorePage.jsx';
import ProductDetailPage from '@/pages/ProductDetailPage.jsx';
import SuccessPage from '@/pages/SuccessPage.jsx';
import MainLayout from '@/components/MainLayout.jsx';
import ChatPage from '@/pages/ChatPage.jsx';
import AddFoodPage from '@/pages/AddFoodPage.jsx';
import PatientLayout from '@/components/patient/PatientLayout.jsx';
import PatientRecords from '@/pages/PatientRecords.jsx';
import PatientSearch from '@/pages/PatientSearch.jsx';
import NutritionistPatientDetail from '@/pages/NutritionistPatientDetail.jsx';
import MacroCalculatorPage from '@/pages/MacroCalculatorPage.jsx';
import FoodBankPage from '@/pages/FoodBankPage.jsx';
import FinancialPage from '@/pages/FinancialPage.jsx';
import AgendaPage from '@/pages/AgendaPage.jsx';

function ProtectedRoute({ children, userType }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="flex items-center justify-center h-screen">Carregando...</div>;
  }

  if (!user || !user.profile) {
    return <Navigate to="/login" replace />;
  }
  
  if (userType && user.profile.user_type !== userType) {
    return <Navigate to={user.profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient'} replace />;
  }
  
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Carregando...</div>;
  }
  
  const getRedirectPath = () => {
    if (user && user.profile) {
        return user.profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
    }
    return '/login';
  }

  return (
    <Routes>
      <Route path="/login" element={user && user.profile ? <Navigate to={getRedirectPath()} replace /> : <LoginPage />} />
      <Route path="/register" element={user && user.profile ? <Navigate to={getRedirectPath()} replace /> : <RegisterPage />} />
      
      <Route path="/nutritionist" element={
        <ProtectedRoute userType="nutritionist">
          <NutritionistDashboard />
        </ProtectedRoute>
      } />
      <Route path="/nutritionist/patient/:patientId" element={
        <ProtectedRoute userType="nutritionist">
          <NutritionistPatientDetail />
        </ProtectedRoute>
      } />
       <Route path="/chat/nutritionist/:patientId" element={
        <ProtectedRoute userType="nutritionist">
          <ChatPage />
        </ProtectedRoute>
      } />
       <Route path="/chat/patient" element={
        <ProtectedRoute userType="patient">
          <ChatPage />
        </ProtectedRoute>
      } />
      <Route path="/nutritionist/calculator" element={
        <ProtectedRoute userType="nutritionist">
          <MacroCalculatorPage />
        </ProtectedRoute>
      } />
      <Route path="/nutritionist/food-bank" element={
        <ProtectedRoute userType="nutritionist">
          <FoodBankPage />
        </ProtectedRoute>
      } />
      <Route path="/nutritionist/financial" element={
        <ProtectedRoute userType="nutritionist">
          <FinancialPage />
        </ProtectedRoute>
      } />
      <Route path="/nutritionist/agenda" element={
        <ProtectedRoute userType="nutritionist">
          <AgendaPage />
        </ProtectedRoute>
      } />

      <Route element={<ProtectedRoute userType="patient"><PatientLayout /></ProtectedRoute>}>
        <Route path="/patient" element={<PatientDashboard />} />
        <Route path="/patient/search" element={<PatientSearch />} />
        <Route path="/patient/records" element={<PatientRecords />} />
        <Route path="/patient/profile" element={<PatientProfile />} />
      </Route>
      
      <Route path="/patient/add-food/:mealId?" element={
        <ProtectedRoute userType="patient">
          <AddFoodPage />
        </ProtectedRoute>
      } />

      <Route element={<MainLayout />}>
        <Route path="/store" element={<StorePage />} />
        <Route path="/product/:id" element={<ProductDetailPage />} />
        <Route path="/success" element={<SuccessPage />} />
      </Route>

      <Route path="/" element={<Navigate to={getRedirectPath()} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <ChatProvider>
          <CartProvider>
            <Helmet>
              <title>HipoZero - Controle Nutricional Inteligente</title>
              <meta name="description" content="Plataforma moderna para nutricionistas e pacientes com controle alimentar, prescrição de dietas e acompanhamento nutricional baseado na Tabela TACO." />
            </Helmet>
            <div className="min-h-screen bg-background">
              <AppRoutes />
              <Toaster />
            </div>
          </CartProvider>
        </ChatProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
