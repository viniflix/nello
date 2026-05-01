import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ClipboardList, Edit2, Trash2, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAnamnesisTemplates } from '@/hooks/useAnamnesisTemplates';

export default function TemplatesList() {
    const navigate = useNavigate();
    const { useTemplates, deleteTemplate, seedBaseTemplates } = useAnamnesisTemplates();
    const { data: templates, isLoading } = useTemplates();

    const handleDelete = async (id) => {
        if(window.confirm("Deseja realmente excluir este formulário? Essa ação não afeta pacientes que já responderam, mas o molde será perdido.")) {
            await deleteTemplate.mutateAsync(id);
        }
    };

    return (
        <div className="container mx-auto p-4 sm:p-6 max-w-7xl space-y-6 sm:space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                        Biblioteca de Formulários
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                        Gerencie seus moldes e templates personalizados de anamnese.
                    </p>
                </div>
                <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto" onClick={() => navigate('new')}>
                    <Plus className="w-4 h-4" />
                    Novo Formulário
                </Button>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
            ) : templates && templates.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {templates.map(template => (
                        <div key={template.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all flex flex-col h-full p-5 gap-3">
                            <div className="flex justify-between items-start">
                                <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                    <ClipboardList className="w-5 h-5" />
                                </div>
                                {template.is_system_default && (
                                    <span className="text-xs font-semibold px-2 py-1 bg-slate-100 text-slate-600 rounded-full">Global</span>
                                )}
                            </div>
                            <div className="flex-1">
                                <h3 className="text-base font-bold text-slate-800 line-clamp-1">{template.title}</h3>
                                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{template.description || "Sem descrição"}</p>
                            </div>
                            <div className="pt-4 mt-auto border-t border-slate-100 flex items-center justify-between">
                                <span className="text-xs text-slate-400">
                                    {template.sections?.length || 0} seções
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => navigate(`${template.id}/edit`)}
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                        title="Editar"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    {!template.is_system_default && (
                                        <button
                                            onClick={() => handleDelete(template.id)}
                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                            title="Excluir"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 sm:p-12 text-center flex flex-col items-center mx-auto max-w-2xl">
                    <ClipboardList className="w-10 h-10 sm:w-12 sm:h-12 text-slate-300 mb-4" />
                    <h3 className="text-base sm:text-lg font-medium text-slate-700 mb-2">Sua biblioteca está vazia</h3>
                    <p className="text-xs sm:text-sm text-slate-500 max-w-md mb-6">
                        Você pode criar formulários do zero ou iniciar rapidamente adicionando nossos templates base ao seu consultório.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                        <Button variant="outline" className="gap-2 w-full sm:w-auto" onClick={() => navigate('new')}>
                            <Plus className="w-4 h-4" />
                            Criar do zero
                        </Button>
                        <Button 
                            className="gap-2 bg-slate-800 hover:bg-slate-900 text-white w-full sm:w-auto" 
                            onClick={() => seedBaseTemplates.mutate()}
                            disabled={seedBaseTemplates.isPending}
                        >
                            {seedBaseTemplates.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            Adicionar Templates Base
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
