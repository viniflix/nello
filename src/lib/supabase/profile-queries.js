import { readReference, invalidateReference, referenceScope } from '@/lib/utils/referenceCache';
import {readRequest} from './readRequest';
import {readPolicies} from '@/lib/utils/readPolicy';
import { patientClient as supabase } from '@/infrastructure/supabase/domainClients';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { invalidateDomain } from '@/infrastructure/realtime/events';

/**
 * Update clinic settings (stored in preferences JSONB or clinic_settings JSONB)
 * @param {string} userId - User UUID
 * @param {Object} settingsObject - Settings object to merge
 * @returns {Promise<Object>}
 */
export async function updateClinicSettings(userId, settingsObject) {
    const cacheScope = referenceScope(userId);
    // First, get current preferences
    const { data: currentProfile, error: fetchError } = await supabase
        .from('user_profiles')
        .select('preferences, clinic_settings')
        .eq('id', userId)
        .single();

    if (fetchError) {
        logSupabaseError('Error fetching current settings', fetchError);
        throw fetchError;
    }

    // Merge with existing clinic_settings or preferences
    const currentSettings = currentProfile.clinic_settings || currentProfile.preferences?.clinic_settings || {};
    const updatedSettings = { ...currentSettings, ...settingsObject };

    // The reconstructed schema provides clinic_settings. One scoped write returns
    // only the settings needed by consumers; authorization failures remain errors.
    const { data, error } = await supabase
        .from('user_profiles')
        .update({ clinic_settings: updatedSettings })
        .eq('id', userId)
        .select('id,clinic_settings,preferences')
        .single();

    if (error) {
        logSupabaseError('Error updating clinic settings', error);
        throw error;
    }

    void invalidateReference('clinic', userId, {scope:cacheScope});
    invalidateDomain(userId, 'profile');
    return data;
}

/**
 * Get clinic settings
 * @param {string} userId - User UUID
 * @returns {Promise<Object>}
 */
async function loadClinicSettings(userId, readOptions = {}) {
    const { data, error } = await readRequest(() => supabase
        .from('user_profiles')
        .select('clinic_settings, preferences')
        .eq('id', userId)
        .single(), {signal:readOptions?.signal,policy:readPolicies.reference});

    if (error) {
        logSupabaseError('Error fetching clinic settings', error);
        throw error;
    }

    // Return clinic_settings if exists, otherwise return from preferences
    return data.clinic_settings || data.preferences?.clinic_settings || {};
}

/**
 * Get recurring expenses for a nutritionist
 * @param {string} userId - User UUID
 * @returns {Promise<Array>}
 */
export async function getRecurringExpenses(userId) {
    const settings = await getClinicSettings(userId);
    return settings.recurring_expenses || [];
}

/**
 * Save a recurring expense
 * @param {string} userId - User UUID
 * @param {Object} expenseData - { id?, description, value, day_of_month }
 * @returns {Promise<Object>}
 */
export async function saveRecurringExpense(userId, expenseData) {
    const settings = await getClinicSettings(userId, {force:true});
    const expenses = settings.recurring_expenses || [];
    
    let updatedExpenses;
    if (expenseData.id) {
        // Update existing
        updatedExpenses = expenses.map(exp => 
            exp.id === expenseData.id ? { ...expenseData } : exp
        );
    } else {
        // Add new
        const newExpense = {
            id: Date.now().toString(), // Simple ID generation
            ...expenseData
        };
        updatedExpenses = [...expenses, newExpense];
    }

    await updateClinicSettings(userId, {
        recurring_expenses: updatedExpenses
    });

    return updatedExpenses;
}

/**
 * Delete a recurring expense
 * @param {string} userId - User UUID
 * @param {string} expenseId - Expense ID
 * @returns {Promise<Array>}
 */
export async function deleteRecurringExpense(userId, expenseId) {
    const settings = await getClinicSettings(userId, {force:true});
    const expenses = settings.recurring_expenses || [];
    const updatedExpenses = expenses.filter(exp => exp.id !== expenseId);

    await updateClinicSettings(userId, {
        recurring_expenses: updatedExpenses
    });

    return updatedExpenses;
}


export function getClinicSettings(userId, options = {}) {
  return readReference('clinic', userId, null, signal => loadClinicSettings(userId, {signal}), options);
}
