import React, { lazy } from 'react';
import { Route } from 'react-router-dom';
import { ProtectedRoute } from './routeGuards';
import PatientMobileLayout from '@/components/patient/PatientMobileLayout.jsx';

// Lazy load das páginas do paciente
const PatientHomePage = lazy(() => import('@/pages/patient/PatientHomePage.jsx'));
const PatientDiaryPage = lazy(() => import('@/pages/patient/PatientDiaryPage.jsx'));
const PatientProgressPage = lazy(() => import('@/pages/patient/PatientProgressPage.jsx'));
const PatientProfilePage = lazy(() => import('@/pages/patient/PatientProfilePage.jsx'));
const PatientEditProfilePage = lazy(() => import('@/pages/patient/PatientEditProfilePage.jsx'));
const PatientAchievementsPage = lazy(() => import('@/pages/patient/PatientAchievementsPage.jsx'));
const AddMealPage = lazy(() => import('@/pages/patient/AddMealPage.jsx'));
const AddFoodPage = lazy(() => import('@/pages/patient/AddFoodPage.jsx'));
const ChatPage = lazy(() => import('@/pages/shared/ChatPage.jsx'));
const PatientInvitesPage = lazy(() => import('@/pages/patient/PatientInvitesPage.jsx'));

export const patientRoutes = (
    <>
        {/* Rotas dentro do layout mobile */}
        <Route element={<ProtectedRoute userType="patient"><PatientMobileLayout /></ProtectedRoute>}>
            <Route path="/patient" element={<PatientHomePage />} />
            <Route path="/patient/invites" element={<PatientInvitesPage />} />
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
    </>
);

