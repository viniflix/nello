import { supabase } from '@/lib/customSupabaseClient';
import { format, startOfMonth, endOfMonth, addDays, parseISO, startOfDay } from 'date-fns';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { summarizeFinancialTransactions, buildFinancialCashFlow, buildFinancialExpenseDistribution } from '@/lib/utils/financial-math';

/** Fetch every row touching the month by competence, payment or refund date. */
export async function getFinancialMonthRows(nutritionistId, monthDate) {
    if (!nutritionistId) throw new Error('nutritionistId is required');
    const start = format(startOfMonth(monthDate), 'yyyy-MM-dd');
    const end = format(endOfMonth(monthDate), 'yyyy-MM-dd');
    const select = '*, patient:user_profiles!financial_transactions_patient_id_fkey(id,name,cpf)';
    const fetchColumn = async (column) => {
        const rows = [];
        for (let offset = 0; ; offset += 1000) {
            const { data, error } = await supabase.from('financial_transactions')
                .select(select).eq('nutritionist_id', nutritionistId)
                .gte(column, start).lte(column, end)
                .order('id', { ascending: true }).range(offset, offset + 999);
            if (error) throw error;
            rows.push(...(data || []));
            if (!data || data.length < 1000) break;
        }
        return rows;
    };
    const groups = await Promise.all(['transaction_date', 'paid_at', 'refunded_at'].map(fetchColumn));
    return [...new Map(groups.flat().map((row) => [row.id, row])).values()];
}

export async function getFinancialSummary(monthDate, nutritionistId) {
    const rows = await getFinancialMonthRows(nutritionistId, monthDate);
    return summarizeFinancialTransactions(
        rows, format(startOfMonth(monthDate), 'yyyy-MM-dd'),
        format(endOfMonth(monthDate), 'yyyy-MM-dd'), format(new Date(), 'yyyy-MM-dd')
    );
}

export async function getTransactions(nutritionistId, filters = {}, pagination = {}, sorting = {}) {
    const monthDate = filters.month && filters.year ? new Date(filters.year, filters.month - 1, 1) : new Date();
    const rows = await getFinancialMonthRows(nutritionistId, monthDate);
    const search = String(filters.search || '').trim().toLocaleLowerCase('pt-BR');
    const filtered = rows.filter((row) =>
        (!filters.type || row.type === filters.type) &&
        (!filters.status || row.status === filters.status) &&
        (!search || String(row.description || '').toLocaleLowerCase('pt-BR').includes(search))
    );
    const field = ['transaction_date', 'paid_at', 'refunded_at', 'amount'].includes(sorting.field) ? sorting.field : 'transaction_date';
    const direction = sorting.order === 'asc' ? 1 : -1;
    filtered.sort((a, b) => direction * String(a[field] ?? '').localeCompare(String(b[field] ?? '')) || direction * (a.id - b.id));
    const page = Math.max(1, pagination.page || 1);
    const pageSize = pagination.pageSize || filtered.length;
    return { data: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length };
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

/** Cash flow and paid expense distribution follow paid_at/refunded_at. */
export async function getCashFlowData(nutritionistId, monthDate, aggregation = 'day') {
    const rows = await getFinancialMonthRows(nutritionistId, monthDate);
    return buildFinancialCashFlow(
        rows, format(startOfMonth(monthDate), 'yyyy-MM-dd'),
        format(endOfMonth(monthDate), 'yyyy-MM-dd'), aggregation
    );
}

export async function getExpenseDistribution(nutritionistId, monthDate) {
    const rows = await getFinancialMonthRows(nutritionistId, monthDate);
    return buildFinancialExpenseDistribution(
        rows, format(startOfMonth(monthDate), 'yyyy-MM-dd'),
        format(endOfMonth(monthDate), 'yyyy-MM-dd')
    );
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
    
    // Reconcile the projection with the same net cash used by the dashboard.
    const { data: paidTransactions, error: paidError } = await supabase
        .from('financial_transactions')
        .select('type, amount, net_amount, status')
        .eq('nutritionist_id', nutritionistId)
        .in('status', ['paid', 'refunded']);

    if (paidError) {
        logSupabaseError('Error fetching paid transactions for balance', paidError);
        throw paidError;
    }

    // Calculate current balance (income - expenses)
    let currentBalance = 0;
    (paidTransactions || []).forEach(transaction => {
        const value = parseFloat(transaction.type === 'income' ? transaction.net_amount ?? transaction.amount : transaction.amount || 0);
        const refund = transaction.status === 'refunded' ? parseFloat(transaction.amount || 0) : 0;
        if (transaction.type === 'income') {
            currentBalance += value - refund;
        } else {
            currentBalance -= value - refund;
        }
    });

    // Get all pending transactions with due dates
    // First, get transactions with due_date in range
    const { data: pendingWithDueDate, error: pendingError1 } = await supabase
        .from('financial_transactions')
        .select('type, amount, net_amount, due_date, transaction_date')
        .eq('nutritionist_id', nutritionistId)
        .in('status', ['pending', 'overdue'])
        .gte('due_date', format(today, 'yyyy-MM-dd'))
        .lte('due_date', format(endDate, 'yyyy-MM-dd'));

    // Get transactions without due_date but with transaction_date in range
    const { data: pendingWithoutDueDate, error: pendingError2 } = await supabase
        .from('financial_transactions')
        .select('type, amount, net_amount, due_date, transaction_date')
        .eq('nutritionist_id', nutritionistId)
        .in('status', ['pending', 'overdue'])
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
        
        const value = parseFloat(transaction.type === 'income' ? transaction.net_amount ?? transaction.amount : transaction.amount || 0);
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
 * Tabela services: id, nutritionist_id, name, price, duration_minutes, active, created_at
 * @param {Object} serviceData - Service data object
 * @returns {Promise<Object>}
 */
export async function saveService(serviceData) {
    const { id, nutritionist_id, name, price, duration_minutes, description, category, ...rest } = serviceData;
    // Enviar apenas colunas existentes na tabela services
    const data = { nutritionist_id, name, price };
    if (duration_minutes != null) data.duration_minutes = duration_minutes;
    if (rest.active != null) data.active = rest.active;

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
    // Tabela services usa coluna "active" (não is_active)
    const { error } = await supabase
        .from('services')
        .update({ active: false })
        .eq('id', serviceId);

    if (error) {
        logSupabaseError('Error deleting service', error);
        throw error;
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
        .in('status', ['pending', 'overdue'])
        .order('due_date', { ascending: true, nullsFirst: false });

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
    if (status !== 'paid') throw new Error('Use o formulário para editar um lançamento.');
    const { data, error } = await supabase
        .from('financial_transactions')
        .update({ status, paid_at: format(new Date(), 'yyyy-MM-dd') })
        .eq('id', transactionId)
        .in('status', ['pending', 'overdue'])
        .select()
        .single();

    if (error) {
        logSupabaseError('Error updating transaction status', error);
        throw error;
    }

    return data;
}

export async function refundTransaction(transactionId, refundDate = format(new Date(), 'yyyy-MM-dd')) {
    const { error } = await supabase.rpc('refund_financial_transaction', {
        p_id: transactionId, p_refunded_at: refundDate,
    });
    if (error) throw error;
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
        .update({ due_date: newDate, status: 'pending' })
        .eq('id', transactionId)
        .in('status', ['pending', 'overdue'])
        .select()
        .single();

    if (error) {
        logSupabaseError('Error rescheduling transaction', error);
        throw error;
    }

    return data;
}

