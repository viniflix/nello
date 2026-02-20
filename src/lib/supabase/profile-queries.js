import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

/**
 * Update clinic settings (stored in preferences JSONB or clinic_settings JSONB)
 * @param {string} userId - User UUID
 * @param {Object} settingsObject - Settings object to merge
 * @returns {Promise<Object>}
 */
export async function updateClinicSettings(userId, settingsObject) {
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

    // Try to update clinic_settings first, if column exists, otherwise use preferences
    const updateData = {};
    
    // Check if clinic_settings column exists by trying to update it
    const { error: clinicSettingsError } = await supabase
        .from('user_profiles')
        .update({ clinic_settings: updatedSettings })
        .eq('id', userId);

    if (clinicSettingsError) {
        // If clinic_settings column doesn't exist, use preferences
        const currentPreferences = currentProfile.preferences || {};
        updateData.preferences = {
            ...currentPreferences,
            clinic_settings: updatedSettings
        };
    } else {
        updateData.clinic_settings = updatedSettings;
    }

    const { data, error } = await supabase
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();

    if (error) {
        logSupabaseError('Error updating clinic settings', error);
        throw error;
    }

    return data;
}

/**
 * Get clinic settings
 * @param {string} userId - User UUID
 * @returns {Promise<Object>}
 */
export async function getClinicSettings(userId) {
    const { data, error } = await supabase
        .from('user_profiles')
        .select('clinic_settings, preferences')
        .eq('id', userId)
        .single();

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
    const settings = await getClinicSettings(userId);
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
    const settings = await getClinicSettings(userId);
    const expenses = settings.recurring_expenses || [];
    const updatedExpenses = expenses.filter(exp => exp.id !== expenseId);

    await updateClinicSettings(userId, {
        recurring_expenses: updatedExpenses
    });

    return updatedExpenses;
}

