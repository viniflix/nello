import React, { lazy } from 'react';
import { Route } from 'react-router-dom';
import { ProtectedRoute } from './routeGuards';
import MainLayout from '@/components/MainLayout.jsx';

// Lazy load das páginas do nutricionista
const NutritionistDashboard = lazy(() => import('@/pages/nutritionist/dashboard/NutritionistDashboard.jsx'));
const NutritionistProfilePage = lazy(() => import('@/pages/nutritionist/profile/NutritionistProfilePage.jsx'));
const NotificationsPage = lazy(() => import('@/pages/nutritionist/notifications/NotificationsPage.jsx'));
const CalculationInfoPage = lazy(() => import('@/pages/nutritionist/tools/CalculationInfoPage.jsx'));
const PatientsPage = lazy(() => import('@/pages/nutritionist/patients/PatientsPage.jsx'));
const PatientHubPage = lazy(() => import('@/pages/nutritionist/patients/PatientHubPage.jsx'));
const PatientAnamnesePage = lazy(() => import('@/pages/nutritionist/patients/PatientAnamnesePage.jsx'));
const PatientAnamnesisList = lazy(() => import('@/pages/nutritionist/patients/PatientAnamnesisList.jsx'));
const PatientAnamnesisForm = lazy(() => import('@/pages/nutritionist/patients/PatientAnamnesisForm.jsx'));
const AnthropometryPage = lazy(() => import('@/pages/nutritionist/patients/AnthropometryPage.jsx'));
const MealPlanPage = lazy(() => import('@/pages/nutritionist/patients/MealPlanPage.jsx'));
const MealPlanSummaryPage = lazy(() => import('@/pages/nutritionist/patients/MealPlanSummaryPage.jsx'));
const EnergyExpenditurePage = lazy(() => import('@/pages/nutritionist/patients/EnergyExpenditurePage.jsx'));
const LabResultsPage = lazy(() => import('@/pages/nutritionist/patients/LabResultsPage.jsx'));
const GoalsPage = lazy(() => import('@/pages/nutritionist/patients/GoalsPage.jsx'));
const FoodDiaryPage = lazy(() => import('@/pages/nutritionist/patients/FoodDiaryPage.jsx'));
const AlertsPage = lazy(() => import('@/pages/nutritionist/alerts/AlertsPage.jsx'));
const FoodBankPage = lazy(() => import('@/pages/nutritionist/tools/FoodBankPage.jsx'));
const FinancialPage = lazy(() => import('@/pages/nutritionist/tools/FinancialPage.jsx'));
const AgendaPage = lazy(() => import('@/pages/nutritionist/tools/AgendaPage.jsx'));
const NutritionistFoodsPage = lazy(() => import('@/pages/nutritionist/tools/NutritionistFoodsPage.jsx'));
const ChatPage = lazy(() => import('@/pages/shared/ChatPage.jsx'));

export const nutritionistRoutes = (
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
);

