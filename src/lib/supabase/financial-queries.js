import { supabase } from '@/lib/customSupabaseClient';
import { format, startOfMonth, endOfMonth, addDays, parseISO, startOfDay } from 'date-fns';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

/**
 * Get financial summary for a specific month/year
 * @param {Date} monthDate - Date object representing the month/year to query
 * @param {string} nutritionistId - Nutritionist UUID (required for RLS)
 * @returns {Promise<{income: number, expenses: number, netResult: number, overdue: number}>}
 */
export async function getFinancialSummary(monthDate, nutritionistId) {
    if (!nutritionistId) {
        throw new Error('nutritionistId is required for getFinancialSummary');
    }
    
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    
    // Try to select net_amount, but fallback to amount if column doesn't exist
    const { data, error } = await supabase
        .from('financial_transactions')
        .select('type, amount, status')
        .eq('nutritionist_id', nutritionistId)
        .gte('transaction_date', format(start, 'yyyy-MM-dd'))
        .lte('transaction_date', format(end, 'yyyy-MM-dd'));

    if (error) {
        logSupabaseError('Error fetching financial summary', error);
        throw error;
    }

    // Calculate gross and net income (use amount for both if net_amount doesn't exist)
    const income = (data || [])
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    // For now, netIncome = income (net_amount column may not exist yet)
    const netIncome = income;

    const expenses = (data || [])
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    const overdue = (data || [])
        .filter(t => t.status === 'overdue')
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    return {
        income,
        netIncome,
        expenses,
        netResult: netIncome - expenses,
        overdue
    };
}

/**
 * Get transactions with filters, pagination, and sorting
 * @param {string} nutritionistId - Nutritionist UUID
 * @param {Object} filters - { type, status, search, month, year }
 * @param {Object} pagination - { page, pageSize }
 * @param {Object} sorting - { field, order: 'asc' | 'desc' }
 * @returns {Promise<{data: Array, total: number}>}
 */
export async function getTransactions(nutritionistId, filters = {}, pagination = {}, sorting = {}) {
    let query = supabase
        .from('financial_transactions')
        .select(`
            *,
            patient:user_profiles!financial_transactions_patient_id_fkey(
                id,
                name
            )
        `, { count: 'exact' })
        .eq('nutritionist_id', nutritionistId);

    // Apply filters
    if (filters.type) {
        query = query.eq('type', filters.type);
    }

    if (filters.status) {
        query = query.eq('status', filters.status);
    }

    if (filters.search) {
        query = query.ilike('description', `%${filters.search}%`);
    }

    if (filters.month && filters.year) {
        const start = startOfMonth(new Date(filters.year, filters.month - 1, 1));
        const end = endOfMonth(new Date(filters.year, filters.month - 1, 1));
        query = query
            .gte('transaction_date', format(start, 'yyyy-MM-dd'))
            .lte('transaction_date', format(end, 'yyyy-MM-dd'));
    }

    // Apply sorting
    const sortField = sorting.field || 'transaction_date';
    const sortOrder = sorting.order || 'desc';
    query = query.order(sortField, { ascending: sortOrder === 'asc' });

    // Apply pagination
    if (pagination.page && pagination.pageSize) {
        const from = (pagination.page - 1) * pagination.pageSize;
        const to = from + pagination.pageSize - 1;
        query = query.range(from, to);
    }

    const { data, error, count } = await query;

    if (error) {
        logSupabaseError('Error fetching transactions', error);
        throw error;
    }

    return {
        data: data || [],
        total: count || 0
    };
}

/**
 * Save a transaction (create or update)
 * @param {Object} transactionData - Transaction data object
 * @returns {Promise<Object>}
 */
export async function saveTransaction(transactionData) {
    const { id, ...data } = transactionData;

    // Ensure status is set correctly
    if (!data.status) {
        data.status = data.isPaid ? 'paid' : 'pending';
    }

    // If pending and no due_date, set due_date to transaction_date
    if (data.status === 'pending' && !data.due_date) {
        data.due_date = data.transaction_date;
    }

    // Remove isPaid from data (it's only for UI)
    delete data.isPaid;

    // Ensure payment_method, fee_percentage, and attachment_url are included
    // (net_amount is calculated by DB trigger based on amount and fee_percentage)

    let query;
    if (id) {
        // Update existing transaction
        query = supabase
            .from('financial_transactions')
            .update(data)
            .eq('id', id)
            .select()
            .single();
    } else {
        // Create new transaction
        query = supabase
            .from('financial_transactions')
            .insert(data)
            .select()
            .single();
    }

    const { data: result, error } = await query;

    if (error) {
        logSupabaseError('Error saving transaction', error);
        throw error;
    }

    return result;
}

/**
 * Delete a transaction
 * @param {number} transactionId - Transaction ID
 * @returns {Promise<void>}
 */
export async function deleteTransaction(transactionId) {
    const { error } = await supabase
        .from('financial_transactions')
        .delete()
        .eq('id', transactionId);

    if (error) {
        logSupabaseError('Error deleting transaction', error);
        throw error;
    }
}

/**
 * Get cash flow data for chart (daily or weekly aggregation)
 * @param {string} nutritionistId - Nutritionist UUID
 * @param {Date} monthDate - Month to query
 * @param {string} aggregation - 'day' or 'week'
 * @returns {Promise<Array>}
 */
export async function getCashFlowData(nutritionistId, monthDate, aggregation = 'day') {
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);

    const { data, error } = await supabase
        .from('financial_transactions')
        .select('transaction_date, type, amount')
        .eq('nutritionist_id', nutritionistId)
        .gte('transaction_date', format(start, 'yyyy-MM-dd'))
        .lte('transaction_date', format(end, 'yyyy-MM-dd'))
        .order('transaction_date', { ascending: true });

    if (error) {
        logSupabaseError('Error fetching cash flow data', error);
        throw error;
    }

    // Group by day or week
    const grouped = {};
    data.forEach(transaction => {
        const date = new Date(transaction.transaction_date);
        let key;
        
        if (aggregation === 'week') {
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay()); // Sunday
            key = format(weekStart, 'yyyy-MM-dd');
        } else {
            key = format(date, 'yyyy-MM-dd');
        }

        if (!grouped[key]) {
            grouped[key] = { date: key, income: 0, expenses: 0 };
        }

        if (transaction.type === 'income') {
            grouped[key].income += parseFloat(transaction.amount || 0);
        } else {
            grouped[key].expenses += parseFloat(transaction.amount || 0);
        }
    });

    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get expense distribution by category
 * @param {string} nutritionistId - Nutritionist UUID
 * @param {Date} monthDate - Month to query
 * @returns {Promise<Array>}
 */
export async function getExpenseDistribution(nutritionistId, monthDate) {
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);

    const { data, error } = await supabase
        .from('financial_transactions')
        .select('category, amount')
        .eq('nutritionist_id', nutritionistId)
        .eq('type', 'expense')
        .gte('transaction_date', format(start, 'yyyy-MM-dd'))
        .lte('transaction_date', format(end, 'yyyy-MM-dd'));

    if (error) {
        logSupabaseError('Error fetching expense distribution', error);
        throw error;
    }

    // Group by category
    const grouped = {};
    data.forEach(transaction => {
        const category = transaction.category || 'outros';
        if (!grouped[category]) {
            grouped[category] = 0;
        }
        grouped[category] += parseFloat(transaction.amount || 0);
    });

    return Object.entries(grouped).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1).replace('_', ' '),
        value: value
    }));
}

/**
 * Get projected cash flow for the next 30 days
 * Calculates balance evolution based on current balance and pending transactions
 * @param {string} nutritionistId - Nutritionist UUID
 * @param {Date} startDate - Starting date (usually today)
 * @returns {Promise<Array>} Array of { date, balance } objects
 */
export async function getProjectedCashFlow(nutritionistId, startDate) {
    const today = startOfDay(startDate);
    const endDate = addDays(today, 30);
    
    // Get current balance (sum of all paid transactions)
    // Use amount only (net_amount may not exist)
    const { data: paidTransactions, error: paidError } = await supabase
        .from('financial_transactions')
        .select('type, amount')
        .eq('nutritionist_id', nutritionistId)
        .eq('status', 'paid');

    if (paidError) {
        logSupabaseError('Error fetching paid transactions for balance', paidError);
        throw paidError;
    }

    // Calculate current balance (income - expenses)
    let currentBalance = 0;
    (paidTransactions || []).forEach(transaction => {
        const value = parseFloat(transaction.amount || 0);
        if (transaction.type === 'income') {
            currentBalance += value;
        } else {
            currentBalance -= value;
        }
    });

    // Get all pending transactions with due dates
    // First, get transactions with due_date in range
    const { data: pendingWithDueDate, error: pendingError1 } = await supabase
        .from('financial_transactions')
        .select('type, amount, due_date, transaction_date')
        .eq('nutritionist_id', nutritionistId)
        .eq('status', 'pending')
        .gte('due_date', format(today, 'yyyy-MM-dd'))
        .lte('due_date', format(endDate, 'yyyy-MM-dd'));

    // Get transactions without due_date but with transaction_date in range
    const { data: pendingWithoutDueDate, error: pendingError2 } = await supabase
        .from('financial_transactions')
        .select('type, amount, due_date, transaction_date')
        .eq('nutritionist_id', nutritionistId)
        .eq('status', 'pending')
        .is('due_date', null)
        .gte('transaction_date', format(today, 'yyyy-MM-dd'))
        .lte('transaction_date', format(endDate, 'yyyy-MM-dd'));

    if (pendingError1 || pendingError2) {
        logSupabaseError('Error fetching pending transactions', pendingError1 || pendingError2);
        throw pendingError1 || pendingError2;
    }

    const pendingTransactions = [...(pendingWithDueDate || []), ...(pendingWithoutDueDate || [])];

    // Group pending transactions by date
    const transactionsByDate = {};
    pendingTransactions.forEach(transaction => {
        // Use due_date if available, otherwise use transaction_date
        const dateKey = transaction.due_date || transaction.transaction_date;
        if (!dateKey) return;
        
        const date = format(parseISO(dateKey), 'yyyy-MM-dd');
        if (!transactionsByDate[date]) {
            transactionsByDate[date] = { income: 0, expenses: 0 };
        }
        
        const value = parseFloat(transaction.amount || 0);
        if (transaction.type === 'income') {
            transactionsByDate[date].income += value;
        } else {
            transactionsByDate[date].expenses += value;
        }
    });

    // Generate projection for next 30 days
    const projection = [];
    let runningBalance = currentBalance;

    for (let i = 0; i <= 30; i++) {
        const date = addDays(today, i);
        const dateKey = format(date, 'yyyy-MM-dd');
        
        // Add transactions for this date
        if (transactionsByDate[dateKey]) {
            runningBalance += transactionsByDate[dateKey].income;
            runningBalance -= transactionsByDate[dateKey].expenses;
        }

        projection.push({
            date: dateKey,
            balance: Math.round(runningBalance * 100) / 100 // Round to 2 decimals
        });
    }

    return projection;
}

/**
 * Get patients list for autocomplete
 * @param {string} nutritionistId - Nutritionist UUID
 * @returns {Promise<Array>}
 */
export async function getPatientsForAutocomplete(nutritionistId) {
    const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name')
        .eq('nutritionist_id', nutritionistId)
        .order('name', { ascending: true });

    if (error) {
        logSupabaseError('Error fetching patients', error);
        throw error;
    }

    return data || [];
}

/**
 * Get all services for a nutritionist
 * @param {string} nutritionistId - Nutritionist UUID
 * @returns {Promise<Array>}
 */
export async function getServices(nutritionistId) {
    // Try to fetch all services first, then filter in memory
    // This handles cases where the column name might be different
    const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('nutritionist_id', nutritionistId)
        .order('name', { ascending: true });

    if (error) {
        logSupabaseError('Error fetching services', error);
        throw error;
    }

    // Filter active services in memory (handle both is_active and active column names)
    const activeServices = (data || []).filter(service => {
        // Try is_active first, then active, then default to true if neither exists
        return service.is_active !== false && service.active !== false;
    });

    return activeServices;
}

/**
 * Save a service (create or update)
 * @param {Object} serviceData - Service data object
 * @returns {Promise<Object>}
 */
export async function saveService(serviceData) {
    const { id, ...data } = serviceData;
    data.updated_at = new Date().toISOString();

    let query;
    if (id) {
        query = supabase
            .from('services')
            .update(data)
            .eq('id', id)
            .select()
            .single();
    } else {
        query = supabase
            .from('services')
            .insert(data)
            .select()
            .single();
    }

    const { data: result, error } = await query;

    if (error) {
        logSupabaseError('Error saving service', error);
        throw error;
    }

    return result;
}

/**
 * Delete a service (soft delete)
 * @param {number} serviceId - Service ID
 * @returns {Promise<void>}
 */
export async function deleteService(serviceId) {
    // Try to update is_active, if that fails, try active
    let updateData = { updated_at: new Date().toISOString() };
    
    // Try is_active first
    updateData.is_active = false;
    
    const { error } = await supabase
        .from('services')
        .update(updateData)
        .eq('id', serviceId);

    if (error) {
        // If is_active doesn't work, try active
        if (error.message && error.message.includes('is_active')) {
            delete updateData.is_active;
            updateData.active = false;
            
            const { error: error2 } = await supabase
                .from('services')
                .update(updateData)
                .eq('id', serviceId);
            
            if (error2) {
                logSupabaseError('Error deleting service', error2);
                throw error2;
            }
        } else {
            logSupabaseError('Error deleting service', error);
            throw error;
        }
    }
}

/**
 * Save multiple transactions (for installments)
 * @param {Array} transactions - Array of transaction objects
 * @returns {Promise<Array>}
 */
export async function saveMultipleTransactions(transactions) {
    const { data, error } = await supabase
        .from('financial_transactions')
        .insert(transactions)
        .select();

    if (error) {
        logSupabaseError('Error saving multiple transactions', error);
        throw error;
    }

    return data || [];
}

/**
 * Get pending income transactions that are due or past due
 * @param {string} nutritionistId - Nutritionist UUID
 * @returns {Promise<Array>}
 */
export async function getPendingPayments(nutritionistId) {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    const { data, error } = await supabase
        .from('financial_transactions')
        .select(`
            *,
            patient:user_profiles!financial_transactions_patient_id_fkey(
                id,
                name
            )
        `)
        .eq('nutritionist_id', nutritionistId)
        .eq('type', 'income')
        .eq('status', 'pending')
        .lte('transaction_date', today)
        .order('transaction_date', { ascending: true });

    if (error) {
        logSupabaseError('Error fetching pending payments', error);
        throw error;
    }

    return data || [];
}

/**
 * Update transaction status
 * @param {number} transactionId - Transaction ID
 * @param {string} status - New status ('paid', 'cancelled', 'pending')
 * @returns {Promise<Object>}
 */
export async function updateTransactionStatus(transactionId, status) {
    const { data, error } = await supabase
        .from('financial_transactions')
        .update({ status })
        .eq('id', transactionId)
        .select()
        .single();

    if (error) {
        logSupabaseError('Error updating transaction status', error);
        throw error;
    }

    return data;
}

/**
 * Reschedule transaction date
 * @param {number} transactionId - Transaction ID
 * @param {string} newDate - New date in 'yyyy-MM-dd' format
 * @returns {Promise<Object>}
 */
export async function rescheduleTransaction(transactionId, newDate) {
    const { data, error } = await supabase
        .from('financial_transactions')
        .update({ 
            transaction_date: newDate,
            due_date: newDate
        })
        .eq('id', transactionId)
        .select()
        .single();

    if (error) {
        logSupabaseError('Error rescheduling transaction', error);
        throw error;
    }

    return data;
}

