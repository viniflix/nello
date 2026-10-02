import {useAnthropometryFormController} from './useAnthropometryFormController';
import { getTodayIsoDate } from '@/lib/utils/date';
import React, { useState, useEffect, useMemo } from 'react';
import { Save, X, Calculator, Ruler, Scissors, Image as ImageIcon, AlertCircle, Bone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInputWithCalendar } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getLatestAnthropometryRecord } from '@/lib/supabase/anthropometry-queries';
import { getLatestAnamnesis } from '@/lib/supabase/anamnesis-queries';
import PhotoGallery from './PhotoGallery';
import { differenceInYears, parseISO } from 'date-fns';
import {
  calculateFrameSize,
  calculateSomatotype,
  getSomatotypeDescription,
  calculateBodyDensity,
  calculateBodyFatPercent,
  calculatePollockComposition,
  getPollockSex,
  DURNIN_REFERENCE,
  POLLOCK_SITES
} from '@/lib/utils/anthropometry-calculations';
import { classifyBMI, getBMICuts, calculateBMI } from '@/lib/utils/bmi-classification';

const AnthropometryForm = ({
    patientId,
    initialData = null,
    onSubmit,
    onCancel,
    loading = false,
    patientGender = null,
    patientBirthDate = null,
    patientEthnicity = null
}) => {
const {handleSubmit,errors,activeTab,setActiveTab,lastRecord,formData,handleChange,setFormData,setErrors,calculatedBMI,imcCategory,idealWeightRange,handleNestedChange,calculatedRCQ,rcqCategory,protocol,setProtocol,pollockSex,manualAge,setManualAge,ageAtRecord,compositionResults,somatotype,frameSize,handlePhotosChange,handleReset}=useAnthropometryFormController({patientId:patientId,initialData:initialData,onSubmit:onSubmit,onCancel:onCancel,loading:loading,patientGender:patientGender,patientBirthDate:patientBirthDate,patientEthnicity:patientEthnicity});
return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg md:text-xl tracking-wide" style={{ wordSpacing: '0.16em' }}>
                    {initialData ? 'Revisão de Registro' : 'Registro Antropométrico'}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {errors.form && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{errors.form}</AlertDescription>
                        </Alert>
                    )}

                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        Você pode registrar tudo de uma vez ou apenas as seções avaliadas nesta consulta.
                    </div>

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        {/* Mobile: seletor único de seção (mais limpo que grade de botões) */}
                        <div className="md:hidden mb-3">
                            <Label className="text-xs text-muted-foreground mb-1.5 block">
                                Seção do registro
                            </Label>
                            <Select name="active-tab" value={activeTab} onValueChange={setActiveTab}>
                                <SelectTrigger className="h-10">
                                    <SelectValue placeholder="Selecione uma seção" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="basico">Básico</SelectItem>
                                    <SelectItem value="circunferencias">Circunferências</SelectItem>
                                    <SelectItem value="dobras">Dobras & Composição</SelectItem>
                                    <SelectItem value="diametros">Diâmetros Ósseos</SelectItem>
                                    <SelectItem value="fotos">Fotos</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Desktop: mantém abas clássicas */}
                        <TabsList className="hidden md:grid w-full md:grid-cols-5 gap-1 h-auto p-1">
                            <TabsTrigger value="basico" className="text-sm px-3 py-2 text-center whitespace-nowrap">
                                Básico
                            </TabsTrigger>
                            <TabsTrigger value="circunferencias" className="text-sm px-3 py-2 text-center whitespace-nowrap">
                                Circunferências
                            </TabsTrigger>
                            <TabsTrigger value="dobras" className="text-sm px-3 py-2 text-center whitespace-nowrap">
                                Dobras & Composição
                            </TabsTrigger>
                            <TabsTrigger value="diametros" className="text-sm px-3 py-2 text-center whitespace-nowrap">
                                Diâmetros Ósseos
                            </TabsTrigger>
                            <TabsTrigger value="fotos" className="text-sm px-3 py-2 text-center whitespace-nowrap">
                                Fotos
                            </TabsTrigger>
                        </TabsList>

                        {/* TAB 1: Básico */}
                        <TabsContent value="basico" className="space-y-4 mt-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Peso */}
                                <div className="space-y-2">
                                    <Label htmlFor="weight">Peso (kg)</Label>
                                    <Input
                                        id="weight"
                                        name="weight"
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        placeholder={lastRecord?.weight ? `Último: ${lastRecord.weight} kg` : "Ex: 70.5"}
                                        value={formData.weight}
                                        onChange={handleChange}
                                        className={errors.weight ? 'border-destructive' : ''}
                                        disabled={loading}
                                    />
                                    {errors.weight && (
                                        <p className="text-xs text-destructive">{errors.weight}</p>
                                    )}
                                </div>
                                {/* Peso Usual */}
                                <div className="space-y-2">
                                    <Label htmlFor="peso_usual">
                                        Peso Usual (kg)
                                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                                            (Opcional)
                                        </span>
                                    </Label>
                                    <Input
                                        id="peso_usual"
                                        name="peso_usual"
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        placeholder="Ex: 72"
                                        value={formData.peso_usual}
                                        onChange={handleChange}
                                        className={errors.peso_usual ? 'border-destructive' : ''}
                                        disabled={loading}
                                    />
                                    <p className="text-xs text-muted-foreground leading-tight">
                                        Peso habitual do paciente antes de qualquer processo intencional de perda ou ganho de peso.
                                    </p>
                                </div>

                                {/* Altura */}
                                <div className="space-y-2">
                                    <Label htmlFor="height">Altura (cm)</Label>
                                    <Input
                                        id="height"
                                        name="height"
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        placeholder={lastRecord?.height ? `Último: ${lastRecord.height} cm` : "Ex: 170"}
                                        value={formData.height}
                                        onChange={handleChange}
                                        className={errors.height ? 'border-destructive' : ''}
                                        disabled={loading}
                                    />
                                    {errors.height && (
                                        <p className="text-xs text-destructive">{errors.height}</p>
                                    )}
                                </div>

                                {/* Data */}
                                <div className="space-y-2">
                                    <Label htmlFor="record_date">
                                        Data <span className="text-destructive">*</span>
                                    </Label>
                                    <DateInputWithCalendar
                                        id="record_date"
                                        name="record_date"
                                        value={formData.record_date}
                                        onChange={(value) => {
                                            setFormData(prev => ({ ...prev, record_date: value }));
                                            if (errors.record_date) {
                                                setErrors(prev => ({ ...prev, record_date: null }));
                                            }
                                        }}
                                        className={errors.record_date ? 'border-destructive' : ''}
                                        disabled={loading}
                                    />
                                    {errors.record_date && (
                                        <p className="text-xs text-destructive">{errors.record_date}</p>
                                    )}
                                </div>
                            </div>



                            {/* ── Cards de Resultados ── */}
                            {calculatedBMI && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                                    {/* IMC */}
                                    <Alert className="bg-muted/50">
                                        <Calculator className="h-4 w-4" />
                                        <AlertDescription>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-semibold">IMC:</span>
                                                    <span
                                                        className="text-lg font-bold cursor-help underline decoration-dotted"
                                                        title={`Fórmula: ${formData.weight} ÷ (${formData.height} ÷ 100)² = ${calculatedBMI.toFixed(2)}`}
                                                    >
                                                        {calculatedBMI.toFixed(1)}
                                                    </span>
                                                    {imcCategory && (
                                                        <Badge variant="outline" className={imcCategory.color}>
                                                            {imcCategory.label}
                                                        </Badge>
                                                    )}
                                                </div>
                                                {imcCategory?.detail && (
                                                    <p className="text-xs text-muted-foreground">{imcCategory.detail}</p>
                                                )}
                                                <p className="text-xs text-muted-foreground italic">Passe o mouse no valor para ver a fórmula</p>
                                            </div>
                                        </AlertDescription>
                                    </Alert>

                                    {/* Faixa de referência: não é meta nem peso ideal */}
                                    {idealWeightRange && (
                                        <Alert className="bg-muted/30 border-muted">
                                            <Calculator className="h-4 w-4 text-muted-foreground" />
                                            <AlertDescription>
                                                <div className="space-y-1">
                                                    <div className="font-semibold text-sm">
                                                        Faixa de referência do IMC ({idealWeightRange.low}–{idealWeightRange.high})
                                                    </div>
                                                    <div className="text-sm">
                                                        {idealWeightRange.min.toFixed(1)} – {idealWeightRange.max.toFixed(1)} kg
                                                    </div>
                                                    {idealWeightRange.current && (
                                                        <div className="text-xs text-muted-foreground">
                                                            Peso atual: {idealWeightRange.current.toFixed(1)} kg
                                                            {idealWeightRange.current < idealWeightRange.min && <span className="ml-1 text-blue-600">(Abaixo da faixa)</span>}
                                                            {idealWeightRange.current > idealWeightRange.max && <span className="ml-1 text-yellow-600">(Acima da faixa)</span>}
                                                            {idealWeightRange.current >= idealWeightRange.min && idealWeightRange.current <= idealWeightRange.max && <span className="ml-1 text-green-600">(Na faixa)</span>}
                                                        </div>
                                                    )}
                                                    <p className="text-xs text-muted-foreground">APOIO À AVALIAÇÃO — NÃO REPRESENTA META OU “PESO IDEAL”.</p>
                                                </div>
                                            </AlertDescription>
                                        </Alert>
                                    )}
                                </div>
                            )}

                            {/* Observações */}
                            <div className="space-y-2">
                                <Label htmlFor="notes">Observações (opcional)</Label>
                                <Textarea
                                    id="notes"
                                    name="notes"
                                    rows={3}
                                    placeholder="Adicione observações sobre o registro..."
                                    value={formData.notes}
                                    onChange={handleChange}
                                    disabled={loading}
                                />
                            </div>
                        </TabsContent>

                        {/* TAB 2: Circunferências */}
                        <TabsContent value="circunferencias" className="space-y-6 mt-4">
                            <div className="space-y-6">
                                {/* Tronco */}
                                <div>
                                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                        <Ruler className="w-4 h-4" />
                                        Tronco
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                                        {['ombro', 'peito', 'cintura', 'abdomen', 'quadril'].map(field => (
                                            <div key={field} className="space-y-2">
                                                <Label htmlFor={`circ_${field}`}>
                                                    {field.charAt(0).toUpperCase() + field.slice(1).replace('_', ' ')} (cm)
                                                </Label>
                                                <Input
                                                    id={`circ_${field}`}
                                                    name={`circ_${field}`}
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    placeholder="0.0"
                                                    value={formData.circumferences[field] || ''}
                                                    onChange={(e) => handleNestedChange('circumferences', field, e.target.value)}
                                                    disabled={loading}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Membros */}
                                <div>
                                    <h3 className="text-sm font-semibold mb-3">Membros (E/D)</h3>
                                    <div className="space-y-4">
                                        {[
                                            { key: 'braco_relaxado', label: 'Braço Relaxado' },
                                            { key: 'braco_contraido', label: 'Braço Contraído' },
                                            { key: 'coxa_proximal', label: 'Coxa Proximal' },
                                            { key: 'coxa_medial', label: 'Coxa Medial' },
                                            { key: 'panturrilha', label: 'Panturrilha' }
                                        ].map(({ key, label }) => (
                                            <div key={key} className="grid grid-cols-3 gap-4">
                                                <Label className="col-span-3 text-xs text-muted-foreground">{label}</Label>
                                                <div className="space-y-2">
                                                    <Label htmlFor={`circ_${key}_e`}>Esquerdo (cm)</Label>
                                                    <Input
                                                        id={`circ_${key}_e`}
                                                        name={`circ_${key}_e`}
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        placeholder="0.0"
                                                        value={formData.circumferences[`${key}_e`] || ''}
                                                        onChange={(e) => handleNestedChange('circumferences', `${key}_e`, e.target.value)}
                                                        disabled={loading}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor={`circ_${key}_d`}>Direito (cm)</Label>
                                                    <Input
                                                        id={`circ_${key}_d`}
                                                        name={`circ_${key}_d`}
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        placeholder="0.0"
                                                        value={formData.circumferences[`${key}_d`] || ''}
                                                        onChange={(e) => handleNestedChange('circumferences', `${key}_d`, e.target.value)}
                                                        disabled={loading}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor={`circ_${key}_media`}>Média (cm)</Label>
                                                    <Input
                                                        id={`circ_${key}_media`}
                                                        name={`circ_${key}_media`}
                                                        type="number"
                                                        step="0.1"
                                                        disabled
                                                        value={
                                                            formData.circumferences[`${key}_e`] && formData.circumferences[`${key}_d`]
                                                                ? ((parseFloat(formData.circumferences[`${key}_e`]) + parseFloat(formData.circumferences[`${key}_d`])) / 2).toFixed(1)
                                                                : ''
                                                        }
                                                        className="bg-muted"
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Diâmetros Ósseos */}
                                <div>
                                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                        <Bone className="w-4 h-4" />
                                        Diâmetros Ósseos (cm)
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="bone_punho">Punho (cm)</Label>
                                            <Input
                                                id="bone_punho"
                                                name="bone_punho"
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                placeholder="0.0"
                                                value={formData.bone_diameters?.punho || ''}
                                                onChange={(e) => handleNestedChange('bone_diameters', 'punho', e.target.value)}
                                                disabled={loading}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="bone_femur">Fêmur (cm)</Label>
                                            <Input
                                                id="bone_femur"
                                                name="bone_femur"
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                placeholder="0.0"
                                                value={formData.bone_diameters?.femur || ''}
                                                onChange={(e) => handleNestedChange('bone_diameters', 'femur', e.target.value)}
                                                disabled={loading}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="bone_umero">Úmero (cm)</Label>
                                            <Input
                                                id="bone_umero"
                                                name="bone_umero"
                                                type="number"
                                                step="0.1"
                                                min="0"
                                                placeholder="0.0"
                                                value={formData.bone_diameters?.umero || ''}
                                                onChange={(e) => handleNestedChange('bone_diameters', 'umero', e.target.value)}
                                                disabled={loading}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* RCQ Calculado */}
                                {calculatedRCQ && (
                                    <Alert className="bg-muted/50">
                                        <Calculator className="h-4 w-4" />
                                        <AlertDescription>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold">RCQ (Relação Cintura-Quadril):</span>
                                                <span className="text-lg font-bold">{calculatedRCQ.toFixed(2)}</span>
                                                {rcqCategory && (
                                                    <Badge variant="outline" className={rcqCategory.color}>
                                                        {rcqCategory.label}
                                                    </Badge>
                                                )}
                                            </div>
                                        </AlertDescription>
                                    </Alert>
                                )}

                            </div>
                        </TabsContent>

                        {/* TAB 3: Dobras & Composição */}
                        <TabsContent value="dobras" className="space-y-6 mt-4">
                            {/* Seletor de Protocolo */}
                            <div className="space-y-2">
                                <Label htmlFor="protocol">Protocolo de Cálculo</Label>
                                <Select name="protocol" value={protocol} onValueChange={setProtocol}>
                                    <SelectTrigger id="protocol">
                                        <SelectValue placeholder="Selecione o protocolo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pollock3">Pollock 3 Dobras (locais conforme sexo)</SelectItem>
                                        <SelectItem value="pollock7">Pollock 7 Dobras (Peito, Axilar, Tríceps, Subescapular, Abdominal, Suprailíaca, Coxa)</SelectItem>
                                        <SelectItem value="durnin">Durnin & Womersley 4 Dobras (Tríceps, Bíceps, Subescapular, Suprailíaca)</SelectItem>
                                        <SelectItem value="bioimpedance">Bioimpedância (Direto)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    {protocol === 'pollock3' && (pollockSex === 'male' ? 'Requer: Peito, Abdômen, Coxa, idade e sexo' : pollockSex === 'female' ? 'Requer: Tríceps, Suprailíaca, Coxa, idade e sexo' : 'Informe o sexo do paciente no cadastro para escolher as dobras corretas')}
                                    {protocol === 'pollock7' && 'Requer: Peito, Axilar, Tríceps, Subescapular, Abdominal, Suprailíaca, Coxa, Idade, Gênero'}
                                    {protocol === 'durnin' && 'Requer: Tríceps, Bíceps, Subescapular, Suprailíaca, Idade, Gênero'}
                                    {protocol === 'bioimpedance' && 'Use os valores de bioimpedância diretamente'}
                                </p>
                            </div>

                            {protocol !== 'bioimpedance' && (
                                <div className="space-y-2 max-w-xs">
                                    <Label htmlFor="manualAge">Idade na data do registro (anos)</Label>
                                    <Input
                                        id="manualAge"
                                        name="manualAge"
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={manualAge}
                                        onChange={(e) => setManualAge(e.target.value)}
                                        placeholder={patientBirthDate ? `Calculada: ${ageAtRecord ?? 'indisponível'}` : 'Informe a idade'}
                                    />
                                    <p className="text-xs text-muted-foreground">{patientBirthDate ? 'Calculada pela data de nascimento e do registro. Preencha para corrigir.' : 'Obrigatória porque não há data de nascimento cadastrada.'}</p>
                                </div>
                            )}

                            {/* Inputs Dinâmicos baseados no Protocolo */}
                            {protocol !== 'bioimpedance' && (
                                <div>
                                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                        <Scissors className="w-4 h-4" />
                                        Dobras Cutâneas (mm)
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {/* Pollock 3 */}
                                        {protocol === 'pollock3' && (POLLOCK_SITES.pollock3[pollockSex] || []).map((key) => (
                                            <div key={key} className="space-y-2">
                                                <Label htmlFor={`fold_${key}`}>
                                                    {({ peito: 'Peito', abdominal: 'Abdômen', coxa: 'Coxa', triceps: 'Tríceps', suprailiaca: 'Suprailíaca' })[key]} (mm) <span className="text-destructive">*</span>
                                                </Label>
                                                <Input
                                                    id={`fold_${key}`}
                                                    name={`fold_${key}`}
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    placeholder="0.0"
                                                    value={formData.skinfolds[key] || ''}
                                                    onChange={(e) => handleNestedChange('skinfolds', key, e.target.value)}
                                                    disabled={loading}
                                                />
                                            </div>
                                        ))}

                                        {/* Pollock 7 */}
                                        {protocol === 'pollock7' && [
                                            { key: 'peito', label: 'Peito', required: true },
                                            { key: 'axilar', label: 'Axilar', required: true },
                                            { key: 'triceps', label: 'Tríceps', required: true },
                                            { key: 'subescapular', label: 'Subescapular', required: true },
                                            { key: 'abdominal', label: 'Abdominal', required: true },
                                            { key: 'suprailiaca', label: 'Suprailíaca', required: true },
                                            { key: 'coxa', label: 'Coxa', required: true }
                                        ].map(({ key, label, required }) => (
                                            <div key={key} className="space-y-2">
                                                <Label htmlFor={`fold_${key}`}>
                                                    {label} (mm) {required && <span className="text-destructive">*</span>}
                                                </Label>
                                                <Input
                                                    id={`fold_${key}`}
                                                    name={`fold_${key}`}
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    placeholder="0.0"
                                                    value={formData.skinfolds[key] || ''}
                                                    onChange={(e) => handleNestedChange('skinfolds', key, e.target.value)}
                                                    disabled={loading}
                                                />
                                            </div>
                                        ))}

                                        {/* Durnin */}
                                        {protocol === 'durnin' && [
                                            { key: 'triceps', label: 'Tríceps', required: true },
                                            { key: 'biceps', label: 'Bíceps', required: true },
                                            { key: 'subescapular', label: 'Subescapular', required: true },
                                            { key: 'suprailiaca', label: 'Suprailíaca', required: true }
                                        ].map(({ key, label, required }) => (
                                            <div key={key} className="space-y-2">
                                                <Label htmlFor={`fold_${key}`}>
                                                    {label} (mm) {required && <span className="text-destructive">*</span>}
                                                </Label>
                                                <Input
                                                    id={`fold_${key}`}
                                                    name={`fold_${key}`}
                                                    type="number"
                                                    step="0.1"
                                                    min="0"
                                                    placeholder="0.0"
                                                    value={formData.skinfolds[key] || ''}
                                                    onChange={(e) => handleNestedChange('skinfolds', key, e.target.value)}
                                                    disabled={loading}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Bioimpedância */}
                            <div>
                                <h3 className="text-sm font-semibold mb-3">Bioimpedância</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="bio_percent_gordura">
                                            % Gordura Corporal {protocol === 'bioimpedance' && <span className="text-destructive">*</span>}
                                        </Label>
                                        <Input
                                            id="bio_percent_gordura"
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            max="100"
                                            placeholder="0.0"
                                            value={formData.bioimpedance.percent_gordura || ''}
                                            onChange={(e) => handleNestedChange('bioimpedance', 'percent_gordura', e.target.value)}
                                            disabled={loading}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="bio_percent_massa_magra">% Massa Magra</Label>
                                        <Input
                                            id="bio_percent_massa_magra"
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            max="100"
                                            placeholder="0.0"
                                            value={formData.bioimpedance.percent_massa_magra || ''}
                                            onChange={(e) => handleNestedChange('bioimpedance', 'percent_massa_magra', e.target.value)}
                                            disabled={loading}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="bio_gordura_visceral">Gordura Visceral</Label>
                                        <Input
                                            id="bio_gordura_visceral"
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            placeholder="0.0"
                                            value={formData.bioimpedance.gordura_visceral || ''}
                                            onChange={(e) => handleNestedChange('bioimpedance', 'gordura_visceral', e.target.value)}
                                            disabled={loading}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Resultados Calculados em Tempo Real */}
                            <Card className="bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-emerald-950/20 dark:to-blue-950/20 border-emerald-200 dark:border-emerald-800">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <Calculator className="w-5 h-5 text-emerald-600" />
                                        Resultados Calculados em Tempo Real
                                    </CardTitle>
                                    <p className="text-sm text-muted-foreground">
                                        Protocolo: {protocol === 'pollock3' ? 'Pollock 3 Dobras' : protocol === 'pollock7' ? 'Pollock 7 Dobras' : protocol === 'durnin' ? 'Durnin & Womersley 4 Dobras' : 'Bioimpedância'}
                                    </p>
                                </CardHeader>
                                <CardContent>
                                    {compositionResults ? (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                                <div className="space-y-1 p-3 bg-white/50 dark:bg-black/20 rounded-lg">
                                                    <p className="text-xs text-muted-foreground">Densidade Corporal</p>
                                                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                                                        {compositionResults.body_density?.toFixed(4) || 'N/A'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">g/cm³</p>
                                                </div>
                                                <div className="space-y-1 p-3 bg-white/50 dark:bg-black/20 rounded-lg">
                                                    <p className="text-xs text-muted-foreground">% Gordura Corporal</p>
                                                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                                                        {compositionResults.body_fat_percent?.toFixed(1) || 'N/A'}%
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">Percentual de gordura</p>
                                                </div>
                                                <div className="space-y-1 p-3 bg-white/50 dark:bg-black/20 rounded-lg">
                                                    <p className="text-xs text-muted-foreground">Massa Gorda</p>
                                                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                                                        {compositionResults.fat_mass_kg?.toFixed(1) || 'N/A'} kg
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">Peso de gordura</p>
                                                </div>
                                                <div className="space-y-1 p-3 bg-white/50 dark:bg-black/20 rounded-lg">
                                                    <p className="text-xs text-muted-foreground">Massa Magra</p>
                                                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                                                        {compositionResults.lean_mass_kg?.toFixed(1) || 'N/A'} kg
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">Peso sem gordura</p>
                                                </div>
                                            </div>
                                            <div className="pt-4 border-t border-emerald-200 dark:border-emerald-800">
                                                <p className="text-xs text-muted-foreground">
                                                    *Cálculos baseados em {protocol === 'pollock3' || protocol === 'pollock7' ? 'Jackson & Pollock (1978, homens) / Jackson, Pollock & Ward (1980, mulheres)' : protocol === 'durnin' ? 'Durnin & Womersley (1974)' : 'Bioimpedância direta'} e equação de Siri (1961) para conversão de densidade em % de gordura.
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                            <p className="text-sm">
                                                Preencha os dados necessários para ver os resultados calculados
                                            </p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Aviso se faltar dados */}
                            {!compositionResults && protocol !== 'bioimpedance' && (
                                <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                                    <AlertCircle className="h-4 w-4 text-amber-600" />
                                    <AlertDescription>
                                        <p className="text-sm text-amber-900 dark:text-amber-100">
                                            {(!pollockSex) ? 'Informe o sexo do paciente no cadastro para calcular a composição corporal.' : (protocol === 'pollock3' || protocol === 'pollock7') && (ageAtRecord === null || ageAtRecord < 18 || ageAtRecord > (pollockSex === 'male' ? 61 : 55)) ? `Informe uma idade válida na data do registro (18 a ${pollockSex === 'male' ? 61 : 55} anos para esta equação).` : 'Preencha peso e todas as dobras necessárias com valores positivos. Confira medidas e idade se o resultado continuar indisponível.'}
                                        </p>
                                    </AlertDescription>
                                </Alert>
                            )}

                            {/* Resultados Avançados: Somatotipo */}
                            {somatotype && (
                                <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 border-purple-200 dark:border-purple-800">
                                    <CardHeader>
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <Calculator className="w-5 h-5 text-purple-600" />
                                            Somatotipo (Heath-Carter)
                                        </CardTitle>
                                        <p className="text-sm text-muted-foreground">
                                            Classificação da composição corporal
                                        </p>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="space-y-1 text-center p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
                                                    <p className="text-xs text-muted-foreground">Endomorfia</p>
                                                    <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                                                        {somatotype.endo}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">Gordura relativa</p>
                                                </div>
                                                <div className="space-y-1 text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                                                    <p className="text-xs text-muted-foreground">Mesomorfia</p>
                                                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                                                        {somatotype.meso}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">Massa muscular/óssea</p>
                                                </div>
                                                <div className="space-y-1 text-center p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                                                    <p className="text-xs text-muted-foreground">Ectomorfia</p>
                                                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                                                        {somatotype.ecto}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">Linearidade</p>
                                                </div>
                                            </div>
                                            <div className="pt-4 border-t border-purple-200 dark:border-purple-800">
                                                <p className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2">
                                                    Classificação:
                                                </p>
                                                <p className="text-lg font-bold text-purple-800 dark:text-purple-200">
                                                    {getSomatotypeDescription(somatotype.endo, somatotype.meso, somatotype.ecto)}
                                                </p>
                                                <p className="text-xs text-purple-700 dark:text-purple-300 mt-2">
                                                    Coordenadas para Somatochart: X = {somatotype.x}, Y = {somatotype.y}
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>

                        {/* TAB 4: Diâmetros Ósseos */}
                        <TabsContent value="diametros" className="space-y-6 mt-4">
                            <div>
                                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                    <Ruler className="w-4 h-4" />
                                    Diâmetros Ósseos (cm)
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="bone_punho">Punho (Estiloide) (cm)</Label>
                                        <Input
                                            id="bone_punho"
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            placeholder="0.0"
                                            value={formData.bone_diameters?.punho || ''}
                                            onChange={(e) => handleNestedChange('bone_diameters', 'punho', e.target.value)}
                                            disabled={loading}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Medida do processo estilóide do rádio
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="bone_femur">Fêmur (Biepicondilar) (cm)</Label>
                                        <Input
                                            id="bone_femur"
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            placeholder="0.0"
                                            value={formData.bone_diameters?.femur || ''}
                                            onChange={(e) => handleNestedChange('bone_diameters', 'femur', e.target.value)}
                                            disabled={loading}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Largura biepicondilar do fêmur
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="bone_umero">Úmero (Biepicondilar) (cm)</Label>
                                        <Input
                                            id="bone_umero"
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            placeholder="0.0"
                                            value={formData.bone_diameters?.umero || ''}
                                            onChange={(e) => handleNestedChange('bone_diameters', 'umero', e.target.value)}
                                            disabled={loading}
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Largura biepicondilar do úmero
                                        </p>
                                    </div>
                                </div>

                                {/* Frame Size Calculado */}
                                {frameSize && (
                                    <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 mt-4">
                                        <Calculator className="h-4 w-4 text-blue-600" />
                                        <AlertDescription>
                                            <div className="space-y-1">
                                                <div className="font-semibold text-blue-900 dark:text-blue-100">
                                                    Compleição Óssea (Frame Size):
                                                </div>
                                                <div className="text-lg font-bold text-blue-800 dark:text-blue-200">
                                                    {frameSize.label}
                                                </div>
                                                <div className="text-xs text-blue-700 dark:text-blue-300">
                                                    Ratio Altura/Punho: {frameSize.ratio.toFixed(2)}
                                                </div>
                                            </div>
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        </TabsContent>

                        {/* TAB 5: Fotos */}
                        <TabsContent value="fotos" className="mt-4">
                            <PhotoGallery
                                patientId={patientId}
                                recordId={initialData?.id || `temp-${Date.now()}`}
                                initialPhotos={formData.photos}
                                onPhotosChange={handlePhotosChange}
                            />
                        </TabsContent>
                    </Tabs>

                    {/* Botões */}
                    <div className="flex gap-2 justify-end pt-4 border-t">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleReset}
                            disabled={loading}
                        >
                            <X className="w-4 h-4 mr-2" />
                            {initialData ? 'Cancelar' : 'Limpar'}
                        </Button>
                        <Button type="submit" disabled={loading}>
                            <Save className="w-4 h-4 mr-2" />
                            {loading ? 'Salvando...' : initialData ? 'Atualizar' : 'Salvar'}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};

export default AnthropometryForm;
