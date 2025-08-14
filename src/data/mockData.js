// This file is deprecated. All data operations should go through Supabase.
// The functions and mock data are kept for reference during transition but are no longer used.

export const mockUsers = [];
export const mockFoods = [];
export const mockDietTemplates = [];
export const mockPrescriptions = [];
export const mockFoodEntries = [];
export const mockChats = [];

export function getStoredData(key, defaultValue = []) {
  console.warn(`getStoredData for key '${key}' is deprecated. Use Supabase API calls.`);
  return defaultValue;
}

export function setStoredData(key, data) {
  console.warn(`setStoredData for key '${key}' is deprecated. Use Supabase API calls.`);
}

export function initializeData() {
  console.warn("initializeData is deprecated.");
}