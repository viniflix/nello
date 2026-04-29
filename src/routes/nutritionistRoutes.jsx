import React, { lazy } from 'react';
import { Route, Navigate } from 'react-router-dom';
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
const NutritionistPatientAchievementsPage = lazy(() => import('@/pages/nutritionist/patients/NutritionistPatientAchievementsPage.jsx'));
const ProgressPhotosPage = lazy(() => import('@/pages/nutritionist/patients/ProgressPhotosPage.jsx'));
const AlertsPage = lazy(() => import('@/pages/nutritionist/alerts/AlertsPage.jsx'));
const FoodBankPage = lazy(() => import('@/pages/nutritionist/tools/FoodBankPage.jsx'));
const FinancialPage = lazy(() => import('@/pages/nutritionist/tools/FinancialPage.jsx'));
const AgendaPage = lazy(() => import('@/pages/nutritionist/tools/AgendaPage.jsx'));
const NutritionistFoodsPage = lazy(() => import('@/pages/nutritionist/tools/NutritionistFoodsPage.jsx'));
const MessageTemplatesPage = lazy(() => import('@/pages/nutritionist/tools/MessageTemplatesPage.jsx'));
const ChatPage = lazy(() => import('@/pages/shared/ChatPage.jsx'));
const ChatDashboardPage = lazy(() => import('@/pages/shared/ChatDashboardPage.jsx'));
const CheckinManagerPage = lazy(() => import('@/pages/nutritionist/tools/CheckinManagerPage.jsx'));
const TemplatesPage = lazy(() => import('@/pages/nutritionist/tools/TemplatesPage.jsx'));
const TemplateBuilder = lazy(() => import('@/pages/nutritionist/tools/TemplateBuilder.jsx'));

// Sprint 1 UX Shell - Formbuilder e Configs de Anamnese
const AnamnesisTemplatesList = lazy(() => import('@/pages/nutritionist/settings/anamnesis-templates/TemplatesList.jsx'));
const AnamnesisTemplateBuilder = lazy(() => import('@/pages/nutritionist/settings/anamnesis-templates/TemplateBuilder.jsx'));

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
        <Route path="/nutritionist/patients/:patientId/achievements" element={<NutritionistPatientAchievementsPage />} />
        <Route path="/nutritionist/patients/:patientId/photos" element={<ProgressPhotosPage />} />
        <Route path="/nutritionist/alerts" element={<AlertsPage />} />
        <Route path="/nutritionist/chat" element={<ChatDashboardPage />} />
        <Route path="/nutritionist/chat/:patientId" element={<ChatDashboardPage />} />
        <Route path="/nutritionist/food-bank" element={<Navigate to="/nutritionist/templates" replace />} />
        <Route path="/nutritionist/financial" element={<FinancialPage />} />
        <Route path="/nutritionist/agenda" element={<AgendaPage />} />
        <Route path="/nutritionist/message-templates" element={<Navigate to="/nutritionist/templates" replace />} />
        <Route path="/nutritionist/checkins" element={<CheckinManagerPage />} />
        <Route path="/nutritionist/templates" element={<TemplatesPage />} />
        <Route path="/nutritionist/templates/new/:type" element={<TemplateBuilder />} />
        <Route path="/nutritionist/templates/edit/:id" element={<TemplateBuilder />} />
        
        {/* Settings Globais da Clinica - Módulo Anamnese */}
        <Route path="/nutritionist/settings/anamnesis-templates" element={<AnamnesisTemplatesList />} />
        <Route path="/nutritionist/settings/anamnesis-templates/new" element={<AnamnesisTemplateBuilder />} />
        <Route path="/nutritionist/settings/anamnesis-templates/:templateId/edit" element={<AnamnesisTemplateBuilder />} />
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

