import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ChatProvider } from '@/contexts/ChatContext';
import LoginPage from '@/pages/LoginPage.jsx';
import RegisterPage from '@/pages/RegisterPage.jsx';
import NutritionistDashboard from '@/pages/NutritionistDashboard.jsx';
import PatientDashboard from '@/pages/PatientDashboard.jsx';
import PatientProfile from '@/pages/PatientProfile.jsx';
import MainLayout from '@/components/MainLayout.jsx';
import ChatPage from '@/pages/ChatPage.jsx';
import AddFoodPage from '@/pages/AddFoodPage.jsx';
import PatientLayout from '@/components/patient/PatientLayout.jsx';
import PatientRecords from '@/pages/PatientRecords.jsx';
import PatientSearch from '@/pages/PatientSearch.jsx';
import PatientsPage from '@/pages/PatientsPage.jsx';
import PatientHubPage from '@/pages/PatientHubPage.jsx';
import AlertsPage from '@/pages/AlertsPage.jsx';
import PatientAnamnesePage from '@/pages/PatientAnamnesePage.jsx';
import PatientAnamnesisList from '@/pages/PatientAnamnesisList.jsx';
import PatientAnamnesisForm from '@/pages/PatientAnamnesisForm.jsx';
import AnthropometryPage from '@/pages/AnthropometryPage.jsx';
import MealPlanPage from '@/pages/MealPlanPage.jsx';
import MealPlanSummaryPage from '@/pages/MealPlanSummaryPage.jsx';
import MacroCalculatorPage from '@/pages/MacroCalculatorPage.jsx';
import FoodBankPage from '@/pages/FoodBankPage.jsx';
import FinancialPage from '@/pages/FinancialPage.jsx';
import AgendaPage from '@/pages/AgendaPage.jsx';
import NutritionistProfilePage from '@/pages/NutritionistProfilePage.jsx';
import CalculationInfoPage from '@/pages/CalculationInfoPage.jsx';
import NotificationsPage from '@/pages/NotificationsPage.jsx';
import UpdatePasswordPage from './pages/UpdatePasswordPage';


const AuthWrapper = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return <div className="flex items-center justify-center h-screen">Carregando...</div>;
    }

    if (user) {
        const redirectPath = user.profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
        return <Navigate to={redirectPath} replace />;
    }

    return children;
};

const ProtectedRoute = ({ children, userType }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="flex items-center justify-center h-screen">Carregando...</div>;
  }

  if (!user || !user.profile) {
    return <Navigate to="/login" replace />;
  }
  
  if (userType && user.profile.user_type !== userType) {
    const correctDashboard = user.profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
    return <Navigate to={correctDashboard} replace />;
  }
  
  return children;
};

const AppLayout = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Carregando...</div>;
  }

  const getHomePath = () => {
    if (!user) return "/login";
    return user.profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
  };

  return (
    <ChatProvider>
        <div className="min-h-screen bg-background">
          <Routes>
            <Route path="/login" element={<AuthWrapper><LoginPage /></AuthWrapper>} />
            <Route path="/register" element={<AuthWrapper><RegisterPage /></AuthWrapper>} />
            <Route path="/update-password" element={<UpdatePasswordPage />} />
            {/* --- ROTAS DO NUTRICIONISTA --- */}
            <Route 
              element={
                <ProtectedRoute userType="nutritionist">
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/nutritionist" element={<NutritionistDashboard />} />
              <Route path="/nutritionist/profile" element={<NutritionistProfilePage />} />
              <Route path="/nutritionist/notifications" element={<NotificationsPage />} />
              <Route path="/nutritionist/calculations" element={<CalculationInfoPage />} />
              <Route path="/nutritionist/patients" element={<PatientsPage />} />
              <Route path="/nutritionist/patients/:patientId/hub" element={<PatientHubPage />} />
              <Route path="/nutritionist/patients/:patientId/anamnese" element={<PatientAnamnesePage />} />
              <Route path="/nutritionist/patients/:patientId/anamnesis" element={<PatientAnamnesisList />} />
              <Route path="/nutritionist/patients/:patientId/anamnesis/new" element={<PatientAnamnesisForm />} />
              <Route path="/nutritionist/patients/:patientId/anamnesis/:anamnesisId/edit" element={<PatientAnamnesisForm />} />
              <Route path="/nutritionist/patients/:patientId/anthropometry" element={<AnthropometryPage />} />
              <Route path="/nutritionist/patients/:patientId/meal-plan" element={<MealPlanPage />} />
              <Route path="/nutritionist/patients/:patientId/meal-plan/:planId/summary" element={<MealPlanSummaryPage />} />
              <Route path="/nutritionist/alerts" element={<AlertsPage />} />  
              <Route path="/chat/nutritionist/:patientId" element={<ChatPage />} />
              <Route path="/nutritionist/calculator" element={<MacroCalculatorPage />} />
              <Route path="/nutritionist/food-bank" element={<FoodBankPage />} />
              <Route path="/nutritionist/financial" element={<FinancialPage />} />
              <Route path="/nutritionist/agenda" element={<AgendaPage />} />
            </Route>

            {/* --- ROTAS DO PACIENTE --- */}
            <Route element={<ProtectedRoute userType="patient"><PatientLayout /></ProtectedRoute>}>
              <Route path="/patient" element={<PatientDashboard />} />
              <Route path="/patient/search" element={<PatientSearch />} />
              <Route path="/patient/records" element={<PatientRecords />} />
              <Route path="/patient/profile" element={<PatientProfile />} />
              <Route path="/patient/notifications" element={<NotificationsPage />} />
            </Route>
            
            <Route path="/chat/patient" element={<ProtectedRoute userType="patient"><ChatPage /></ProtectedRoute>} />
            <Route path="/patient/add-food/:mealId?" element={<ProtectedRoute userType="patient"><AddFoodPage /></ProtectedRoute>} />

            {/* --- ROTAS DE REDIRECIONAMENTO (Sem mudança) --- */}
            <Route path="/" element={<Navigate to={getHomePath()} replace />} />
            <Route path="*" element={<Navigate to={getHomePath()} replace />} />
          </Routes>
          <Toaster />
        </div>
    </ChatProvider>
  );
}

const App = () => {
  return (
    <Router>
      <AuthProvider>
        <Helmet>
          <title>HipoZero - Controle Nutricional Inteligente</title>
          <meta name="description" content="Plataforma moderna para nutricionistas e pacientes com controle alimentar, prescrição de dietas e acompanhamento nutricional baseado na Tabela TACO." />
        </Helmet>
        <AppLayout />
      </AuthProvider>
    </Router>
  );
}

export default App;