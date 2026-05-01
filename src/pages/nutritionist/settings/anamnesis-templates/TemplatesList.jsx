import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ClipboardList, Edit2, Trash2, Loader2, Play, Search, Globe, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAnamnesisTemplates } from '@/hooks/useAnamnesisTemplates';

// ─── Card de Formulário ─────────────────────────────────────────────────────────
const FormCard = ({ template, onEdit, onDelete, isGlobal }) => (
    <div className={`rounded-2xl border shadow-sm hover:shadow-md transition-all flex flex-col h-full p-5 gap-3 ${
        isGlobal
            ? 'bg-slate-50 border-slate-200 hover:border-slate-300'
            : 'bg-white border-slate-200 hover:border-emerald-200'
    }`}>
        <div className="flex justify-between items-start">
            <div className={`p-2 rounded-lg ${isGlobal ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'}`}>
                <ClipboardList className="w-5 h-5" />
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${
                isGlobal
                    ? 'bg-slate-200 text-slate-600'
                    : 'bg-emerald-100 text-emerald-700'
            }`}>
                {isGlobal
                    ? <><Globe className="w-3 h-3" /> Nello</>
                    : <><User className="w-3 h-3" /> Personalizado</>
                }
            </span>
        </div>
        <div className="flex-1">
            <h3 className="text-base font-bold text-slate-800 line-clamp-1">{template.title}</h3>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{template.description || 'Sem descrição'}</p>
        </div>
        <div className="pt-4 mt-auto border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400">
                {template.sections?.length || 0} seções
            </span>
            <div className="flex items-center gap-1">
                <button
                    onClick={() => onEdit(template.id)}
                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                    title={isGlobal ? 'Usar como base' : 'Editar'}
                >
                    <Edit2 className="w-4 h-4" />
                </button>
                {!isGlobal && (
                    <button
                        onClick={() => onDelete(template.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Excluir"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    </div>
);

// ─── Seção de Grupo ─────────────────────────────────────────────────────────────
const GroupSection = ({ title, subtitle, icon: Icon, iconClass, children, count }) => (
    <div>
        <div className="flex items-center gap-3 mb-4">
            <div className={`p-1.5 rounded-lg ${iconClass}`}>
                <Icon className="w-4 h-4" />
            </div>
            <div>
                <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
                <p className="text-xs text-slate-400">{subtitle}</p>
            </div>
            <span className="ml-auto text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{count}</span>
        </div>
        {children}
    </div>
);

export default function TemplatesList() {
    const navigate = useNavigate();
    const { useTemplates, deleteTemplate, seedBaseTemplates } = useAnamnesisTemplates();
    const { data: templates, isLoading } = useTemplates();
    const [searchTerm, setSearchTerm] = React.useState('');

    const filtered = React.useMemo(() => {
        if (!templates) return [];
        return templates.filter(t =>
            t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [templates, searchTerm]);

    const globalTemplates = filtered.filter(t => t.is_system_default);
    const myTemplates    = filtered.filter(t => !t.is_system_default);

    const handleDelete = async (id) => {
        if (window.confirm('Deseja realmente excluir este formulário? Essa ação não afeta pacientes que já responderam, mas o molde será perdido.')) {
            await deleteTemplate.mutateAsync(id);
        }
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
                        Biblioteca de Formulários
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                        Gerencie seus moldes e templates personalizados de anamnese.
                    </p>
                </div>
                <div className="flex gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-slate-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar formulário..."
                            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0" onClick={() => navigate('/nutritionist/settings/anamnesis-templates/new')}>
                        <Plus className="w-4 h-4" />
                        Novo Formulário
                    </Button>
                </div>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                </div>
            ) : filtered.length > 0 ? (
                <div className="space-y-8">
                    {/* Meus Formulários */}
                    {myTemplates.length > 0 && (
                        <GroupSection
                            title="Meus Formulários"
                            subtitle="Criados e personalizados por você"
                            icon={User}
                            iconClass="bg-emerald-100 text-emerald-600"
                            count={myTemplates.length}
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {myTemplates.map(t => (
                                    <FormCard
                                        key={t.id}
                                        template={t}
                                        isGlobal={false}
                                        onEdit={(id) => navigate(`/nutritionist/settings/anamnesis-templates/${id}/edit`)}
                                        onDelete={handleDelete}
                                    />
                                ))}
                            </div>
                        </GroupSection>
                    )}

                    {/* Divisor */}
                    {myTemplates.length > 0 && globalTemplates.length > 0 && (
                        <hr className="border-slate-200" />
                    )}

                    {/* Formulários da Plataforma */}
                    {globalTemplates.length > 0 && (
                        <GroupSection
                            title="Formulários da Plataforma"
                            subtitle="Templates base disponíveis para todos os nutricionistas"
                            icon={Globe}
                            iconClass="bg-slate-200 text-slate-600"
                            count={globalTemplates.length}
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {globalTemplates.map(t => (
                                    <FormCard
                                        key={t.id}
                                        template={t}
                                        isGlobal={true}
                                        onEdit={(id) => navigate(`/nutritionist/settings/anamnesis-templates/${id}/edit`)}
                                        onDelete={handleDelete}
                                    />
                                ))}
                            </div>
                        </GroupSection>
                    )}
                </div>
            ) : (
                <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 sm:p-12 text-center flex flex-col items-center mx-auto max-w-2xl">
                    <ClipboardList className="w-10 h-10 sm:w-12 sm:h-12 text-slate-300 mb-4" />
                    <h3 className="text-base sm:text-lg font-medium text-slate-700 mb-2">
                        {searchTerm ? 'Nenhum formulário encontrado' : 'Sua biblioteca está vazia'}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 max-w-md mb-6">
                        {searchTerm
                            ? `Nenhum resultado para "${searchTerm}".`
                            : 'Crie formulários do zero ou adicione os templates base da plataforma ao seu consultório.'}
                    </p>
                    {!searchTerm && (
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            <Button variant="outline" className="gap-2 w-full sm:w-auto" onClick={() => navigate('/nutritionist/settings/anamnesis-templates/new')}>
                                <Plus className="w-4 h-4" />
                                Criar do zero
                            </Button>
                            <Button
                                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
                                onClick={() => seedBaseTemplates.mutate()}
                                disabled={seedBaseTemplates.isPending}
                            >
                                {seedBaseTemplates.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                Adicionar Templates Base
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
