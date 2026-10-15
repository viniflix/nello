import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './routeGuards';
import AdminAccessGate from '@/portals/admin/components/AdminAccessGate.jsx';
import { lazyWithReload } from '@/lib/utils/lazyWithReload';
const AdminLayout = lazyWithReload(() => import('@/portals/admin/layouts/AdminLayout.jsx'), 'admin:layout');

const route = (key, importer) => lazyWithReload(importer, `admin:${key}`);
const AdminDashboard = route('dashboard', () => import('@/pages/admin/AdminDashboard.jsx'));
const AdminBugReportsPage = route('bugs', () => import('@/pages/admin/AdminBugReportsPage.jsx'));
const AdminUsersPage = route('users', () => import('@/pages/admin/AdminUsersPage.jsx'));
const AdminFinancialPage = route('financial', () => import('@/pages/admin/AdminFinancialPage.jsx'));
const AdminNutritionistDetailPage = route('nutritionist-detail', () => import('@/pages/admin/AdminNutritionistDetailPage.jsx'));
const AdminStudyPage = route('study', () => import('@/pages/admin/AdminStudyPage.jsx'));
const AdminOperationsPage = route('operations', () => import('@/pages/admin/AdminOperationsPage.jsx'));
const AdminSecurityPage = route('security', () => import('@/pages/admin/AdminSecurityPage.jsx'));
const AdminVerificationsPage = route('verifications', () => import('@/pages/admin/AdminVerificationsPage.jsx'));
const AdminPrivacyRequestsPage = route('privacy', () => import('@/pages/admin/AdminPrivacyRequestsPage.jsx'));
const AdminIntegrationsPage = route('integrations', () => import('@/pages/admin/AdminIntegrationsPage.jsx'));
const AdminAnalyticsPage = route('analytics', () => import('@/pages/admin/AdminAnalyticsPage.jsx'));
const AdminSupportPage = route('support', () => import('@/pages/admin/AdminSupportPage.jsx'));
const AdminIntelligencePage = route('intelligence', () => import('@/pages/admin/AdminIntelligencePage.jsx'));

export const adminRoutes = (
  <>
    <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
    <Route element={<ProtectedRoute><AdminAccessGate><AdminLayout /></AdminAccessGate></ProtectedRoute>}>
      <Route path="/admin/dashboard" element={<AdminDashboard />} />
      <Route path="/admin/bugs" element={<AdminBugReportsPage />} />
      <Route path="/admin/users" element={<AdminUsersPage />} />
      <Route path="/admin/users/:id" element={<AdminNutritionistDetailPage />} />
      <Route path="/admin/financial" element={<AdminFinancialPage />} />
      <Route path="/admin/study" element={<AdminStudyPage />} />
      <Route path="/admin/operations" element={<AdminOperationsPage />} />
      <Route path="/admin/security" element={<AdminSecurityPage />} />
      <Route path="/admin/verifications" element={<AdminVerificationsPage />} />
      <Route path="/admin/privacy" element={<AdminPrivacyRequestsPage />} />
      <Route path="/admin/integrations" element={<AdminIntegrationsPage />} />
      <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
      <Route path="/admin/support" element={<AdminSupportPage />} />
      <Route path="/admin/intelligence" element={<AdminIntelligencePage />} />
    </Route>
  </>
);
