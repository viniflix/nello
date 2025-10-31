import { create } from 'zustand';

const initialState = {
    name: '',
    email: '',
    birth_date: null,
    gender: '',
    phone: '',
    cpf: '',
    occupation: '',
    civil_status: '',
    observations: '',
    phone: '',
    cpf: '',
    occupation: '',
    civil_status: '',
    observations: '',

    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
};

export const usePatientFormStore = create((set) => ({
    formData: initialState,
    
    updateField: (field, value) => set(state => ({
        formData: { ...state.formData, [field]: value }
    })),
    
    fillAddress: (addressData) => set(state => ({
        formData: {
            ...state.formData,
            street: addressData.logradouro || '',
            neighborhood: addressData.bairro || '',
            city: addressData.localidade || '',
            state: addressData.uf || '',
        }
    })),

    resetForm: () => set({ formData: initialState }),
}));