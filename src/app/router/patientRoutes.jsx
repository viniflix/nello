import React from 'react';
import { Route } from 'react-router-dom';
import { ProtectedRoute } from './routeGuards';
import PatientLayout from '@/portals/patient/layouts/PatientLayout.jsx';
import { lazyWithReload } from '@/lib/utils/lazyWithReload';

// Lazy load das páginas do paciente
const route = (key, importer) => lazyWithReload(importer, `patient:${key}`);
const PatientHomePage = route('home', () => import('@/pages/patient/PatientHomePage.jsx'));
const PatientDiaryPage = route('diary', () => import('@/pages/patient/PatientDiaryPage.jsx'));
const PatientProgressPage = route('progress', () => import('@/pages/patient/PatientProgressPage.jsx'));
const PatientProfilePage = route('profile', () => import('@/pages/patient/PatientProfilePage.jsx'));
const PatientEditProfilePage = route('edit-profile', () => import('@/pages/patient/PatientEditProfilePage.jsx'));
const PatientAchievementsPage = route('achievements', () => import('@/pages/patient/PatientAchievementsPage.jsx'));
const AddMealPage = route('add-meal', () => import('@/pages/patient/AddMealPage.jsx'));
const AddFoodPage = route('add-food', () => import('@/pages/patient/AddFoodPage.jsx'));
const ChatPage = route('chat', () => import('@/pages/shared/ChatPage.jsx'));
const PatientInvitesPage = route('invites', () => import('@/pages/patient/PatientInvitesPage.jsx'));
const CheckinResponsePage = route('checkin-response', () => import('@/pages/patient/CheckinResponsePage.jsx'));
const PatientClinicalRecordsPage = route('clinical-records', () => import('@/pages/patient/PatientClinicalRecordsPage.jsx'));

export const patientRoutes = (
    <>
        {/* Rotas dentro do layout mobile */}
        <Route element={<ProtectedRoute userType="patient"><PatientLayout /></ProtectedRoute>}>
            <Route path="/patient" element={<PatientHomePage />} />
            <Route path="/patient/invites" element={<PatientInvitesPage />} />
            <Route path="/patient/diario" element={<PatientDiaryPage />} />
            <Route path="/patient/progresso" element={<PatientProgressPage />} />
            <Route path="/patient/chat" element={<ChatPage />} />
            <Route path="/patient/perfil" element={<PatientProfilePage />} />
            <Route path="/patient/editar-perfil" element={<PatientEditProfilePage />} />
            <Route path="/patient/conquistas" element={<PatientAchievementsPage />} />
            <Route path="/patient/registros-clinicos" element={<PatientClinicalRecordsPage />} />
        </Route>

        {/* Rotas do Paciente (Fora do layout - páginas completas) */}
        <Route path="/patient/add-food/:mealId?" element={<ProtectedRoute userType="patient"><AddFoodPage /></ProtectedRoute>} />
        <Route path="/patient/add-meal" element={<ProtectedRoute userType="patient"><AddMealPage /></ProtectedRoute>} />
        <Route path="/patient/checkin/:sessionId" element={<ProtectedRoute userType="patient"><CheckinResponsePage /></ProtectedRoute>} />
    </>
);
