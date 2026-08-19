import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './routeGuards';
import NutritionistLayout from '@/portals/nutritionist/layouts/NutritionistLayout.jsx';
import { lazyWithReload } from '@/lib/utils/lazyWithReload';

// Lazy load das páginas do nutricionista
const route = (key, importer) => lazyWithReload(importer, `nutritionist:${key}`);
const NutritionistDashboard = route('dashboard', () => import('@/pages/nutritionist/dashboard/NutritionistDashboard.jsx'));
const NutritionistProfilePage = route('profile', () => import('@/pages/nutritionist/profile/NutritionistProfilePage.jsx'));
const NotificationsPage = route('notifications', () => import('@/pages/nutritionist/notifications/NotificationsPage.jsx'));
const CalculationInfoPage = route('calculations', () => import('@/pages/nutritionist/tools/CalculationInfoPage.jsx'));
const PatientsPage = route('patients', () => import('@/pages/nutritionist/patients/PatientsPage.jsx'));
const PatientHubPage = route('patient-hub', () => import('@/pages/nutritionist/patients/PatientHubPage.jsx'));
const PatientAnamnesePage = route('anamnese', () => import('@/pages/nutritionist/patients/PatientAnamnesePage.jsx'));
const PatientAnamnesisForm = route('anamnesis-form', () => import('@/pages/nutritionist/patients/PatientAnamnesisForm.jsx'));
const AnthropometryPage = route('anthropometry', () => import('@/pages/nutritionist/patients/AnthropometryPage.jsx'));
const MealPlanPage = route('meal-plan', () => import('@/pages/nutritionist/patients/MealPlanPage.jsx'));
const MealPlanSummaryPage = route('meal-plan-summary', () => import('@/pages/nutritionist/patients/MealPlanSummaryPage.jsx'));
const EnergyExpenditurePage = route('energy-expenditure', () => import('@/pages/nutritionist/patients/EnergyExpenditurePage.jsx'));
const LabResultsPage = route('lab-results', () => import('@/pages/nutritionist/patients/LabResultsPage.jsx'));
const GoalsPage = route('goals', () => import('@/pages/nutritionist/patients/GoalsPage.jsx'));
const FoodDiaryPage = route('food-diary', () => import('@/pages/nutritionist/patients/FoodDiaryPage.jsx'));
const NutritionistPatientAchievementsPage = route('achievements', () => import('@/pages/nutritionist/patients/NutritionistPatientAchievementsPage.jsx'));
const ProgressPhotosPage = route('progress-photos', () => import('@/pages/nutritionist/patients/ProgressPhotosPage.jsx'));
const AlertsPage = route('alerts', () => import('@/pages/nutritionist/alerts/AlertsPage.jsx'));
const FinancialPage = route('financial', () => import('@/pages/nutritionist/tools/FinancialPage.jsx'));
const AgendaPage = route('agenda', () => import('@/pages/nutritionist/tools/AgendaPage.jsx'));
const NutritionistFoodsPage = route('foods', () => import('@/pages/nutritionist/tools/NutritionistFoodsPage.jsx'));
const ChatDashboardPage = route('chat', () => import('@/pages/shared/ChatDashboardPage.jsx'));
// Removed CheckinManagerPage as it's now part of TemplatesPage
const TemplatesPage = route('templates', () => import('@/pages/nutritionist/tools/TemplatesPage.jsx'));
const TemplateBuilder = route('template-builder', () => import('@/pages/nutritionist/tools/TemplateBuilder.jsx'));

// Sprint 1 UX Shell - Formbuilder e Configs de Anamnese
const AnamnesisTemplateBuilder = route('anamnesis-template-builder', () => import('@/pages/nutritionist/settings/anamnesis-templates/TemplateBuilder.jsx'));

// Check-ins
const CheckinEditorPage = route('checkin-editor', () => import('@/pages/nutritionist/settings/checkin-templates/CheckinEditorPage.jsx'));

export const nutritionistRoutes = (
    <Route 
        element={
            <ProtectedRoute userType="nutritionist">
                <NutritionistLayout />
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
        <Route path="/nutritionist/patients/:patientId/anamnese/new" element={<PatientAnamnesisForm />} />
        <Route path="/nutritionist/patients/:patientId/anamnese/:anamnesisId/edit" element={<PatientAnamnesisForm />} />
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
        <Route path="/nutritionist/checkins" element={<Navigate to="/nutritionist/templates?group=forms&ftab=checkins" replace />} />
        <Route path="/nutritionist/templates" element={<TemplatesPage />} />
        <Route path="/nutritionist/templates/new/:type" element={<TemplateBuilder />} />
        <Route path="/nutritionist/templates/edit/:type/:id" element={<TemplateBuilder />} />
        {/* Formulários de Anamnese */}
        <Route path="/nutritionist/templates/forms/new" element={<AnamnesisTemplateBuilder />} />
        <Route path="/nutritionist/templates/forms/:templateId/edit" element={<AnamnesisTemplateBuilder />} />
        
        {/* Templates de Check-in */}
        <Route path="/nutritionist/templates/checkins/new" element={<CheckinEditorPage />} />
        <Route path="/nutritionist/templates/checkins/:templateId/edit" element={<CheckinEditorPage />} />

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
