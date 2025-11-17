import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ChatProvider } from '@/contexts/ChatContext';
import { Loader2 } from 'lucide-react';

// Mantém imports críticos para auth e layouts (não lazy load)
import MainLayout from '@/components/MainLayout.jsx';
import PatientLayout from '@/components/patient/PatientLayout.jsx';
import PatientMobileLayout from '@/components/patient/PatientMobileLayout.jsx';

// CODE SPLITTING: Lazy load de todas as páginas
const LoginPage = lazy(() => import('@/pages/LoginPage.jsx'));
const RegisterPage = lazy(() => import('@/pages/RegisterPage.jsx'));
const UpdatePasswordPage = lazy(() => import('./pages/UpdatePasswordPage'));

// Dashboards
const NutritionistDashboard = lazy(() => import('@/pages/NutritionistDashboard.jsx'));
const PatientDashboard = lazy(() => import('@/pages/PatientDashboard.jsx'));

// Páginas do Nutricionista
const PatientsPage = lazy(() => import('@/pages/PatientsPage.jsx'));
const PatientHubPage = lazy(() => import('@/pages/PatientHubPage.jsx'));
const AlertsPage = lazy(() => import('@/pages/AlertsPage.jsx'));
const NutritionistProfilePage = lazy(() => import('@/pages/NutritionistProfilePage.jsx'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage.jsx'));
const CalculationInfoPage = lazy(() => import('@/pages/CalculationInfoPage.jsx'));
const AgendaPage = lazy(() => import('@/pages/AgendaPage.jsx'));
const FinancialPage = lazy(() => import('@/pages/FinancialPage.jsx'));

// Anamnese
const PatientAnamnesePage = lazy(() => import('@/pages/PatientAnamnesePage.jsx'));
const PatientAnamnesisList = lazy(() => import('@/pages/PatientAnamnesisList.jsx'));
const PatientAnamnesisForm = lazy(() => import('@/pages/PatientAnamnesisFormV2.jsx'));

// Antropometria e Plano Alimentar
const AnthropometryPage = lazy(() => import('@/pages/AnthropometryPage.jsx'));
const MealPlanPage = lazy(() => import('@/pages/MealPlanPage.jsx'));
const MealPlanSummaryPage = lazy(() => import('@/pages/MealPlanSummaryPage.jsx'));

// Ferramentas
const MacroCalculatorPage = lazy(() => import('@/pages/MacroCalculatorPage.jsx'));
const FoodBankPage = lazy(() => import('@/pages/FoodBankPage.jsx'));

// Chat
const ChatPage = lazy(() => import('@/pages/ChatPage.jsx'));

// Páginas do Paciente (Antigas - mantidas para compatibilidade)
const PatientProfile = lazy(() => import('@/pages/PatientProfile.jsx'));
const PatientRecords = lazy(() => import('@/pages/PatientRecords.jsx'));
const PatientSearch = lazy(() => import('@/pages/PatientSearch.jsx'));
const AddFoodPage = lazy(() => import('@/pages/AddFoodPage.jsx'));

// Páginas do Paciente (Nova Arquitetura Mobile-First)
const PatientHomePage = lazy(() => import('@/pages/patient/PatientHomePage.jsx'));
const PatientDiaryPage = lazy(() => import('@/pages/patient/PatientDiaryPage.jsx'));
const PatientProgressPage = lazy(() => import('@/pages/patient/PatientProgressPage.jsx'));
const PatientProfilePage = lazy(() => import('@/pages/patient/PatientProfilePage.jsx'));
const PatientEditProfilePage = lazy(() => import('@/pages/patient/PatientEditProfilePage.jsx'));
const PatientAchievementsPage = lazy(() => import('@/pages/patient/PatientAchievementsPage.jsx'));
const AddMealPage = lazy(() => import('@/pages/patient/AddMealPage.jsx'));


// Fallback de carregamento para Suspense
const PageLoadingFallback = () => (
    <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
    </div>
);

const AuthWrapper = ({ children }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return <PageLoadingFallback />;
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
    return <PageLoadingFallback />;
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
    return <PageLoadingFallback />;
  }

  const getHomePath = () => {
    if (!user) return "/login";
    return user.profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
  };

  return (
    <ChatProvider>
        <div className="min-h-screen bg-background">
          <Suspense fallback={<PageLoadingFallback />}>
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

            {/* --- ROTAS DO PACIENTE (Nova Arquitetura Mobile-First) --- */}
            <Route element={<ProtectedRoute userType="patient"><PatientMobileLayout /></ProtectedRoute>}>
              <Route path="/patient" element={<PatientHomePage />} />
              <Route path="/patient/diario" element={<PatientDiaryPage />} />
              <Route path="/patient/progresso" element={<PatientProgressPage />} />
              <Route path="/patient/chat" element={<ChatPage />} />
              <Route path="/patient/perfil" element={<PatientProfilePage />} />
              <Route path="/patient/editar-perfil" element={<PatientEditProfilePage />} />
              <Route path="/patient/conquistas" element={<PatientAchievementsPage />} />
            </Route>

            {/* Rotas do Paciente (Fora do layout - páginas completas) */}
            <Route path="/patient/add-food/:mealId?" element={<ProtectedRoute userType="patient"><AddFoodPage /></ProtectedRoute>} />
            <Route path="/patient/add-meal" element={<ProtectedRoute userType="patient"><AddMealPage /></ProtectedRoute>} />

            {/* Rotas Antigas do Paciente (mantidas para compatibilidade) */}
            <Route element={<ProtectedRoute userType="patient"><PatientLayout /></ProtectedRoute>}>
              <Route path="/patient/search" element={<PatientSearch />} />
              <Route path="/patient/records" element={<PatientRecords />} />
              <Route path="/patient/profile" element={<PatientProfile />} />
              <Route path="/patient/notifications" element={<NotificationsPage />} />
            </Route>

            {/* --- ROTAS DE REDIRECIONAMENTO (Sem mudança) --- */}
            <Route path="/" element={<Navigate to={getHomePath()} replace />} />
            <Route path="*" element={<Navigate to={getHomePath()} replace />} />
          </Routes>
          </Suspense>
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