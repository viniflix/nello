import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTemplates } from '@/hooks/useTemplates';
import { 
  FileText, 
  Coffee, 
  UtensilsCrossed, 
  Plus, 
  Search, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  Loader2 
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const TemplateCard = ({ template, type, onDelete, toast }) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (window.confirm('Tem certeza que deseja excluir este template? Esta ação não pode ser desfeita.')) {
      setIsDeleting(true);
      const success = await onDelete(template.id);
      if (success) {
        toast({ title: 'Sucesso', description: 'Template excluído com sucesso!' });
      } else {
        toast({ title: 'Erro', description: 'Erro ao excluir template.', variant: 'destructive' });
        setIsDeleting(false);
      }
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow group flex flex-col h-full">
      <div className="flex justify-between items-start mb-3">
        <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
          {type === 'diet' && <FileText className="w-5 h-5" />}
          {type === 'meal' && <Coffee className="w-5 h-5" />}
          {type === 'recipe' && <UtensilsCrossed className="w-5 h-5" />}
        </div>
        <div className="relative">
          <button className="text-slate-400 hover:text-slate-600 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreVertical className="w-5 h-5" />
          </button>
          <div className="absolute right-0 mt-1 w-36 bg-white rounded-md shadow-lg border border-slate-100 hidden group-hover:block z-10 overflow-hidden">
            <button className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
              <Edit2 className="w-4 h-4" /> Editar
            </button>
            <button 
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} 
              Excluir
            </button>
          </div>
        </div>
      </div>
      
      <h3 className="text-lg font-semibold text-slate-800 mb-1 line-clamp-1" title={template.name}>
        {template.name}
      </h3>
      
      <p className="text-sm text-slate-500 mb-4 line-clamp-2 flex-grow" title={template.description}>
        {template.description || 'Sem descrição'}
      </p>
      
      {template.tags && template.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-auto">
          {template.tags.slice(0, 3).map((tag, idx) => (
            <span key={idx} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
              {tag}
            </span>
          ))}
          {template.tags.length > 3 && (
            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
              +{template.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default function TemplatesPage() {
  const [activeTab, setActiveTab] = useState('diet');
  const [searchTerm, setSearchTerm] = useState('');
  const { templates, loading, deleteTemplate } = useTemplates(activeTab);
  const navigate = useNavigate();
  const { toast } = useToast();

  const tabs = [
    { id: 'diet', label: 'Dietas Padrão', icon: FileText },
    { id: 'meal', label: 'Refeições', icon: Coffee },
    { id: 'recipe', label: 'Receitas', icon: UtensilsCrossed },
  ];

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <Helmet>
        <title>Meus Templates - HipoZero</title>
      </Helmet>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Meus Templates</h1>
          <p className="text-slate-500">Gerencie suas dietas, refeições e receitas reutilizáveis.</p>
        </div>
        <button 
          onClick={() => navigate(`/nutritionist/templates/new/${activeTab}`)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-colors font-medium"
        >
          <Plus className="w-5 h-5" />
          <span>Novo Template</span>
        </button>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl w-full md:w-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  isActive 
                    ? 'bg-white text-emerald-600 shadow-sm' 
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-200/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Buscar templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition-shadow"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-4" />
          <p className="text-slate-500">Carregando templates...</p>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4">
            {activeTab === 'diet' && <FileText className="w-8 h-8" />}
            {activeTab === 'meal' && <Coffee className="w-8 h-8" />}
            {activeTab === 'recipe' && <UtensilsCrossed className="w-8 h-8" />}
          </div>
          <h3 className="text-lg font-medium text-slate-800 mb-1">
            Nenhum template encontrado
          </h3>
          <p className="text-slate-500 max-w-sm mb-6">
            {searchTerm 
              ? `Nenhum resultado para "${searchTerm}". Tente outros termos.` 
              : `Você ainda não possui ${tabs.find(t => t.id === activeTab)?.label.toLowerCase()} cadastrados. Crie seu primeiro template para agilizar seus atendimentos.`}
          </p>
          {!searchTerm && (
            <button 
              onClick={() => navigate(`/nutritionist/templates/new/${activeTab}`)}
              className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Criar Novo Template
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredTemplates.map(template => (
            <TemplateCard 
              key={template.id} 
              template={template} 
              type={activeTab} 
              onDelete={deleteTemplate}
              toast={toast}
            />
          ))}
        </div>
      )}
    </div>
  );
}
