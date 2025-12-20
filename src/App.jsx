import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import SmartToaster from '@/components/SmartToaster';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ChatProvider } from '@/contexts/ChatContext';
import { AdminModeProvider } from '@/contexts/AdminModeContext';
import { Loader2 } from 'lucide-react';

// Mantém imports críticos para auth e layouts (não lazy load)
import MainLayout from '@/components/MainLayout.jsx';
import PatientMobileLayout from '@/components/patient/PatientMobileLayout.jsx';
import AdminLayout from '@/components/admin/AdminLayout.jsx';

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
const NutritionistFoodsPage = lazy(() => import('@/pages/nutritionist/NutritionistFoodsPage.jsx'));

// Páginas Admin
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard.jsx'));

// Anamnese
const PatientAnamnesePage = lazy(() => import('@/pages/PatientAnamnesePage.jsx'));
const PatientAnamnesisList = lazy(() => import('@/pages/PatientAnamnesisList.jsx'));
const PatientAnamnesisForm = lazy(() => import('@/pages/PatientAnamnesisFormV2.jsx'));

// Antropometria e Plano Alimentar
const AnthropometryPage = lazy(() => import('@/pages/AnthropometryPage.jsx'));
const MealPlanPage = lazy(() => import('@/pages/MealPlanPage.jsx'));
const MealPlanSummaryPage = lazy(() => import('@/pages/MealPlanSummaryPage.jsx'));
const EnergyExpenditurePage = lazy(() => import('@/pages/EnergyExpenditurePage.jsx'));
const LabResultsPage = lazy(() => import('@/pages/LabResultsPage.jsx'));
const GoalsPage = lazy(() => import('@/pages/GoalsPage.jsx'));
const FoodDiaryPage = lazy(() => import('@/pages/FoodDiaryPage.jsx'));

// Ferramentas
const FoodBankPage = lazy(() => import('@/pages/FoodBankPage.jsx'));

// Chat
const ChatPage = lazy(() => import('@/pages/ChatPage.jsx'));

// Páginas do Paciente (Antigas - mantidas para compatibilidade)
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


const ProtectedRoute = ({ children, userType, requireAdmin = false, allowAnyUserType = false }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageLoadingFallback />;
  }

  if (!user || !user.profile) {
    return <Navigate to="/login" replace />;
  }

  const isAdmin = user.profile.is_admin === true;

  // CRITICAL: If user is admin, allow access to ANY route (God Mode)
  // The AdminModeContext will handle the visual masking
  if (isAdmin) {
    console.log('[ProtectedRoute] Admin access granted, bypassing user_type check');
    return children;
  }

  // Admin-only routes: require admin flag
  if (requireAdmin) {
    const correctDashboard = user.profile.user_type === 'nutritionist' ? '/nutritionist' : '/patient';
    return <Navigate to={correctDashboard} replace />;
  }

  // Regular routes: check user_type
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
              <Route path="/nutritionist/patients/:patientId/energy-expenditure" element={<EnergyExpenditurePage />} />
              <Route path="/nutritionist/patients/:patientId/lab-results" element={<LabResultsPage />} />
              <Route path="/nutritionist/patients/:patientId/goals" element={<GoalsPage />} />
              <Route path="/nutritionist/patients/:patientId/food-diary" element={<FoodDiaryPage />} />
              <Route path="/nutritionist/alerts" element={<AlertsPage />} />
              <Route path="/chat/nutritionist/:patientId" element={<ChatPage />} />
              <Route path="/nutritionist/food-bank" element={<FoodBankPage />} />
              <Route path="/nutritionist/financial" element={<FinancialPage />} />
              <Route path="/nutritionist/agenda" element={<AgendaPage />} />
              {/* Admin-only routes (nutritionist layout) */}
              <Route 
                path="/nutritionist/foods" 
                element={
                  <ProtectedRoute userType="nutritionist" requireAdmin={true}>
                    <NutritionistFoodsPage />
                  </ProtectedRoute>
                } 
              />
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

            {/* --- ROTAS ADMIN (Layout dedicado, não aninhado em outros layouts) --- */}
            <Route 
              path="/admin" 
              element={<Navigate to="/admin/dashboard" replace />} 
            />
            <Route 
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route 
                path="/admin/dashboard" 
                element={<AdminDashboard />} 
              />
            </Route>

            {/* Rotas do Paciente (Fora do layout - páginas completas) */}
            <Route path="/patient/add-food/:mealId?" element={<ProtectedRoute userType="patient"><AddFoodPage /></ProtectedRoute>} />
            <Route path="/patient/add-meal" element={<ProtectedRoute userType="patient"><AddMealPage /></ProtectedRoute>} />

            {/* --- ROTAS DE REDIRECIONAMENTO (Sem mudança) --- */}
            <Route path="/" element={<Navigate to={getHomePath()} replace />} />
            <Route path="*" element={<Navigate to={getHomePath()} replace />} />
          </Routes>
          </Suspense>
        </div>
    </ChatProvider>
  );
}

const App = () => {
  return (
    <Router>
      <AuthProvider>
        <AdminModeProvider>
          <Helmet>
            <title>HipoZero - Controle Nutricional Inteligente</title>
            <meta name="description" content="Plataforma moderna para nutricionistas e pacientes com controle alimentar, prescrição de dietas e acompanhamento nutricional baseado na Tabela TACO." />
          </Helmet>
          <AppLayout />
          {/* Smart Toaster with dynamic positioning based on admin state */}
          <SmartToaster />
        </AdminModeProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;