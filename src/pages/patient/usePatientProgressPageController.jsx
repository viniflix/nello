import { useCoordinatedLoader } from '@/hooks/useCoordinatedLoader';
import { classifyFailure } from '@/lib/utils/failure';
import { useResourceSnapshot } from '@/hooks/useResourceSnapshot';
import { observeResources } from '@/lib/utils/resourceReads';

import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { format, parseISO } from 'date-fns';
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { parseGlycemiaMgDl, GLYCEMIA_MIN_MG_DL, GLYCEMIA_MAX_MG_DL } from '@/lib/utils/glycemia';

import { Camera, Ruler, Droplet, Scale } from 'lucide-react';









import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/infrastructure/supabase/client';
import {
  deleteProgressPhoto,
  getProgressPhotos,
  uploadProgressPhoto,
} from '@/lib/supabase/progress-photos-queries';
import { logActivityEvent } from '@/lib/supabase/patient-queries';
import { useToast } from '@/hooks/use-toast';


import { getPatientRecordFoundation } from '@/features/clinical-records/api/record-foundation-queries';
import {
  buildProgressTimeline,
  getCurrentSharedClinicalRecords,
  hasMeasurementData,
  sortNewestFirst,
} from '@/features/patient-progress/model/progressTimeline';

import { MIME_BY_EXT, HISTORY_PAGE_SIZE, GROWTH_COLUMNS, SELF_MEASUREMENT_COLUMNS, GLYCEMIA_COLUMNS, mergeUnique } from './PatientProgressPage.model';
export function usePatientProgressPageController() {

  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const isDiabetic = true; // Glicemia disponível para todos — nutri decide se ativa
  const [activeTab, setActiveTab] = useState('peso');
  const [activeDetail, setActiveDetail] = useState(null);
  const [storedWeightdata, setWeightData] = useState([]);
  const [storedGlycemiadata, setGlycemiaData] = useState([]);
  const [storedMeasurementsdata, setMeasurementsData] = useState([]);
  const [storedPhotosdata, setPhotosData] = useState([]);
  const [storedClinicalrecords, setClinicalRecords] = useState([]);
  const growthResource = useResourceSnapshot(JSON.stringify([userId, 'growth']), []);
  const selfResource = useResourceSnapshot(JSON.stringify([userId, 'self']), []);
  const glycemiaResource = useResourceSnapshot(JSON.stringify([userId, 'glycemia']), []);
  const photosResource = useResourceSnapshot(JSON.stringify([userId, 'photos']), []);
  const clinicalResource = useResourceSnapshot(JSON.stringify([userId, 'clinical']), []);
  const {begin:beginGrowth,succeed:confirmGrowth,fail:failGrowth,current:currentGrowth}=growthResource;
  const {begin:beginSelf,succeed:confirmSelf,fail:failSelf}=selfResource;
  const {begin:beginGlycemia,succeed:confirmGlycemia,fail:failGlycemia}=glycemiaResource;
  const {begin:beginPhotos,succeed:confirmPhotos,fail:failPhotos}=photosResource;
  const {begin:beginClinical,succeed:confirmClinical,fail:failClinical}=clinicalResource;
  const reads=useMemo(()=>({
    growth:{begin:beginGrowth,succeed:confirmGrowth,fail:failGrowth},
    self:{begin:beginSelf,succeed:confirmSelf,fail:failSelf},
    glycemia:{begin:beginGlycemia,succeed:confirmGlycemia,fail:failGlycemia},
    photos:{begin:beginPhotos,succeed:confirmPhotos,fail:failPhotos},
    clinical:{begin:beginClinical,succeed:confirmClinical,fail:failClinical}
  }),[beginGrowth,confirmGrowth,failGrowth,beginSelf,confirmSelf,failSelf,beginGlycemia,confirmGlycemia,failGlycemia,beginPhotos,confirmPhotos,failPhotos,beginClinical,confirmClinical,failClinical]);
  const allResources=[growthResource,selfResource,glycemiaResource,photosResource,clinicalResource];
  const loading=allResources.every(resource=>!resource.hasSnapshot)&&allResources.some(resource=>resource.initialLoading);
  const loadError=[growthResource,selfResource,glycemiaResource,photosResource].every(resource=>!resource.hasSnapshot&&resource.error);
  const clinicalLoadError=Boolean(clinicalResource.error);
  const weightData=(growthResource.hasSnapshot||selfResource.hasSnapshot)?storedWeightdata:[];
  const measurementsData=(growthResource.hasSnapshot||selfResource.hasSnapshot)?storedMeasurementsdata:[];
  const glycemiaData=glycemiaResource.hasSnapshot?storedGlycemiadata:[];
  const photosData=photosResource.hasSnapshot?storedPhotosdata:[];
  const clinicalRecords=clinicalResource.hasSnapshot?storedClinicalrecords:[];
  const [historyPage, setHistoryPage] = useState(0);
  const historyPageRef=useRef(0);historyPageRef.current=historyPage;
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [goalWeight, setGoalWeight] = useState(null);

  // Form state para novo registro
  const [newWeight, setNewWeight] = useState('');
  const [newHeight, setNewHeight] = useState('');
  const [newHeadCircumference, setNewHeadCircumference] = useState('');
  const [newGlycemia, setNewGlycemia] = useState('');
  const [recordDate, setRecordDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [photoNotes, setPhotoNotes] = useState('');
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
  const [deletePhotoTarget, setDeletePhotoTarget] = useState(null);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  
  // Ref para AbortController e isMounted
  const isMounted = useRef(true);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const projectionRef=useRef({growth:[],self:[]});
  const projectionOwner=useRef(userId);
  if(projectionOwner.current!==userId){projectionOwner.current=userId;projectionRef.current={growth:[],self:[]};}
  const loadProgressData = useCoordinatedLoader(useCallback(async () => {
    if (!userId || !isMounted.current) return;
    abortControllerRef.current?.abort();
    const currentController=new AbortController();abortControllerRef.current=currentController;
    const tickets=Object.fromEntries(Object.entries(reads).map(([key,read])=>[key,read.begin()]));
    const requestedCount=(historyPageRef.current+1)*HISTORY_PAGE_SIZE;
    const publishWeight=()=>{
      const rows=[...projectionRef.current.growth.map(record=>({...record,source:'clinical'})),
        ...projectionRef.current.self.map(record=>({...record,id:`patient:${record.id}`,source:'patient'}))]
        .sort((a,b)=>String(a.record_date).localeCompare(String(b.record_date)));
      setWeightData(rows);setMeasurementsData(rows.filter(hasMeasurementData));
    };
    await observeResources({
      growth:()=>supabase.from('growth_records').select(GROWTH_COLUMNS).eq('patient_id',userId).eq('status','active').eq('is_latest_revision',true).order('record_date',{ascending:false}).range(0,requestedCount-1),
      self:()=>supabase.from('patient_progress_measurements').select(SELF_MEASUREMENT_COLUMNS).eq('patient_id',userId).order('record_date',{ascending:false}).range(0,requestedCount-1),
      glycemia:()=>supabase.from('glycemia_records').select(GLYCEMIA_COLUMNS).eq('patient_id',userId).order('date',{ascending:false}).range(0,requestedCount-1),
      photos:()=>getProgressPhotos({patientId:userId,limit:50}),
      clinical:()=>getPatientRecordFoundation(userId)
    },(key,result)=>{
      if (!isMounted.current||currentController.signal.aborted||!currentGrowth(tickets.growth)) return;
      const read=reads[key],ticket=tickets[key];
      if(result.error){
        read.fail(ticket,result.error);
        if(['forbidden','unauthenticated'].includes(classifyFailure(result.error))){
          if(key==='growth'||key==='self'){projectionRef.current[key]=[];publishWeight();}
          if(key==='glycemia')setGlycemiaData([]);
          if(key==='photos')setPhotosData([]);
          if(key==='clinical')setClinicalRecords([]);
        }
        return;
      }
      read.succeed(ticket,result.data||[]);
      if(key==='growth'||key==='self'){
        projectionRef.current[key]=result.data||[];publishWeight();
        setHasMoreHistory(Object.values(projectionRef.current).some(rows=>rows.length>=requestedCount));
      }
      if(key==='glycemia')setGlycemiaData([...(result.data||[])].reverse());
      if(key==='photos')setPhotosData(result.data||[]);
      if(key==='clinical')setClinicalRecords(getCurrentSharedClinicalRecords(result.data?.records));
      setGoalWeight(null);
    });
  },[userId,reads,currentGrowth]), clinicalResource.scopeKey, ['clinical']);

  const loadMoreHistory = async () => {
    if (!userId || !hasMoreHistory || loadingMoreHistory) return;
    const ownerAtStart = projectionOwner.current, refreshAtStart = abortControllerRef.current;
    setLoadingMoreHistory(true);
    const nextPage = historyPage + 1;
    const start = nextPage * HISTORY_PAGE_SIZE;
    const end = start + HISTORY_PAGE_SIZE - 1;
    try {
      const [clinical, self, glycemia] = await Promise.all([
        supabase.from('growth_records').select(GROWTH_COLUMNS).eq('patient_id', userId).eq('status', 'active').eq('is_latest_revision', true).order('record_date', { ascending: false }).range(start, end),
        supabase.from('patient_progress_measurements').select(SELF_MEASUREMENT_COLUMNS).eq('patient_id', userId).order('record_date', { ascending: false }).range(start, end),
        supabase.from('glycemia_records').select(GLYCEMIA_COLUMNS).eq('patient_id', userId).order('date', { ascending: false }).range(start, end),
      ]);
      if (!isMounted.current || ownerAtStart !== projectionOwner.current || refreshAtStart !== abortControllerRef.current) return;
      if (clinical.error || self.error || glycemia.error) throw clinical.error || self.error || glycemia.error;
      projectionRef.current.growth = mergeUnique(projectionRef.current.growth, clinical.data || [], record => record.id);
      projectionRef.current.self = mergeUnique(projectionRef.current.self, self.data || [], record => record.id);
      const moreWeights = [...(clinical.data || []).map((record) => ({ ...record, source: 'clinical' })),
        ...(self.data || []).map((record) => ({ ...record, id: `patient:${record.id}`, source: 'patient' }))];
      setWeightData((current) => mergeUnique(current, moreWeights, (record) => `${record.source}:${record.id}`)
        .sort((a, b) => String(a.record_date).localeCompare(String(b.record_date))));
      setMeasurementsData((current) => mergeUnique(current, moreWeights.filter(hasMeasurementData), (record) => `${record.source}:${record.id}`));
      setGlycemiaData((current) => mergeUnique(current, glycemia.data || [], (record) => record.id)
        .sort((a, b) => String(a.date).localeCompare(String(b.date))));
      setHistoryPage(nextPage);
      setHasMoreHistory([clinical, self, glycemia].some((result) => result.data?.length === HISTORY_PAGE_SIZE));
    } catch (error) {
      toast({ title: 'Histórico não carregado', description: toPortugueseError(error), variant: 'destructive' });
    } finally {
      setLoadingMoreHistory(false);
    }
  };

  useEffect(() => {
    loadProgressData();
  }, [loadProgressData]);

  const handleAddWeightRecord = async (e) => {
    e.preventDefault();

    if (!newWeight || !recordDate) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos.',
        variant: 'destructive'
      });
      return;
    }

    const { error } = await supabase.from('patient_progress_measurements').insert({
      patient_id: user.id,
      record_date: recordDate,
      weight: parseFloat(newWeight)
    });

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível adicionar o registro.',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Sucesso',
        description: 'Registro de peso adicionado com sucesso!'
      });
      setDialogOpen(false);
      setNewWeight('');
      setRecordDate(format(new Date(), 'yyyy-MM-dd'));
      loadProgressData();
    }
  };

  const handleAddMeasurementRecord = async (e) => {
    e.preventDefault();

    if (!newHeight || !recordDate) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos obrigatórios.',
        variant: 'destructive'
      });
      return;
    }

    const { error } = await supabase.from('patient_progress_measurements').insert({
      patient_id: user.id,
      record_date: recordDate,
      height: parseFloat(newHeight),
      head_circumference: newHeadCircumference ? parseFloat(newHeadCircumference) : null
    });

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível adicionar o registro.',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Sucesso',
        description: 'Registro de medidas adicionado com sucesso!'
      });
      setDialogOpen(false);
      setNewHeight('');
      setNewHeadCircumference('');
      setRecordDate(format(new Date(), 'yyyy-MM-dd'));
      loadProgressData();
    }
  };

  const [newGlycemiaCondition, setNewGlycemiaCondition] = useState('fasting');

  const handleAddGlycemiaRecord = async (e) => {
    e.preventDefault();

    if (!newGlycemia || !recordDate) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos.',
        variant: 'destructive'
      });
      return;
    }

    const glycemiaValue = parseGlycemiaMgDl(newGlycemia);
    if (glycemiaValue === null) {
      toast({
        title: 'Confira a glicemia',
        description: `Informe um número entre ${GLYCEMIA_MIN_MG_DL} e ${GLYCEMIA_MAX_MG_DL} mg/dL. Se o aparelho mostrar LO ou HI, confirme a leitura com sua equipe de saúde.`,
        variant: 'destructive'
      });
      return;
    }

    const { error } = await supabase.from('glycemia_records').insert({
      patient_id: user.id,
      date: new Date(recordDate + 'T12:00:00').toISOString(),
      value: glycemiaValue,
      condition: newGlycemiaCondition
    });

    if (error) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível adicionar o registro.',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Sucesso',
        description: 'Registro de glicemia adicionado com sucesso!'
      });
      setDialogOpen(false);
      setNewGlycemia('');
      setNewGlycemiaCondition('fasting');
      setRecordDate(format(new Date(), 'yyyy-MM-dd'));
      loadProgressData();
    }
  };

  const handleAddPhotoRecord = async (file, notes = '') => {
    if (!file || !recordDate) {
      toast({
        title: 'Erro',
        description: 'Selecione uma foto e uma data.',
        variant: 'destructive'
      });
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const typeOk = !file.type || allowedTypes.includes(file.type) || file.type.startsWith('image/');
    const extOk = allowedExtensions.includes(ext) || !ext;
    if (!typeOk || !extOk) {
      toast({ title: 'Erro', description: 'Use JPEG, PNG, WebP ou HEIC.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Erro', description: 'A imagem deve ter no máximo 5MB.', variant: 'destructive' });
      return;
    }

    const safeExt = allowedExtensions.includes(ext) ? ext : (file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'image/heic' ? 'heic' : file.type === 'image/heif' ? 'heif' : 'jpg');

    try {
      const { data: inserted, error: uploadError } = await uploadProgressPhoto({
        patientId: user.id,
        file,
        extension: safeExt,
        contentType: MIME_BY_EXT[safeExt] || file.type || 'application/octet-stream',
        photoDate: recordDate,
        uploadedBy: user.id,
        notes: notes?.trim() || null,
      });
      if (uploadError) throw uploadError;

      await logActivityEvent({
        eventName: 'progress_photo.added',
        sourceModule: 'progress_photos',
        patientId: user.id,
        nutritionistId: null,
        payload: { photo_id: inserted?.id, photo_date: recordDate, uploaded_by: user.id }
      });

      toast({
        title: 'Sucesso',
        description: 'Foto de progresso adicionada com sucesso!'
      });
      setDialogOpen(false);
      setRecordDate(format(new Date(), 'yyyy-MM-dd'));
      setPhotoNotes('');
      setSelectedPhotoFile(null);
      loadProgressData();
    } catch (error) {
      logDiagnostic('error', 'pages/patient/PatientProgressPage.jsx:437', '[PatientProgress][upload] erro detalhado:', error);
      toast({
        title: 'Erro ao adicionar foto',
        description: toPortugueseError(error),
        variant: 'destructive'
      });
    }
  };

  const handleDeletePhoto = async () => {
    if (!deletePhotoTarget?.id) return;
    const photoId = deletePhotoTarget.id;
    const { error } = await deleteProgressPhoto({ photoId });
    if (error) {
      toast({ 
        title: 'Erro ao remover', 
        description: toPortugueseError(error), 
        variant: 'destructive' 
      });
      return;
    }
    await logActivityEvent({
      eventName: 'progress_photo.deleted',
      sourceModule: 'progress_photos',
      patientId: user.id,
      nutritionistId: null,
      payload: { photo_id: photoId }
    });
    toast({ title: 'Foto removida' });
    setDeletePhotoTarget(null);
    loadProgressData();
  };

  // Preparar dados de glicemia para gráfico (colunas reais: date, value, condition)
  const weightOnlyData = useMemo(() => weightData.filter((record) => record?.weight != null), [weightData]);
  const sortedWeightData = useMemo(() => sortNewestFirst(weightOnlyData, 'record_date'), [weightOnlyData]);
  const sortedGlycemiaData = useMemo(() => sortNewestFirst(glycemiaData, 'date'), [glycemiaData]);
  const sortedMeasurementsData = useMemo(() => sortNewestFirst(measurementsData, 'record_date'), [measurementsData]);
  const timeline = useMemo(() => buildProgressTimeline({
    weightRecords: weightData,
    glycemiaRecords: glycemiaData,
    photos: photosData,
    clinicalRecords,
  }), [weightData, glycemiaData, photosData, clinicalRecords]);
  const weightChartData = useMemo(() => weightOnlyData.map((record) => ({
    ...record,
    record_date: /^\d{4}-\d{2}-\d{2}$/.test(record.record_date || '') ? parseISO(record.record_date) : record.record_date,
  })), [weightOnlyData]);

  const glycemiaChartData = glycemiaData.map((record) => ({
    date: record.date ? format(new Date(record.date), 'dd/MM/yy') : '?',
    value: parseFloat(record.value || 0)
  }));

  const openDetail = (detail) => {
    setActiveTab(detail);
    setActiveDetail(detail);
  };

  const combine=(primary,secondary,rows)=>({
    hasSnapshot:(primary.hasSnapshot&&secondary.hasSnapshot)||rows.length>0,
    initialLoading:primary.initialLoading&&secondary.initialLoading,
    pending:primary.pending||secondary.pending,refreshing:primary.refreshing||secondary.refreshing,
    error:primary.error||secondary.error
  });
  const resources={peso:combine(growthResource,selfResource,weightData),medidas:combine(growthResource,selfResource,measurementsData),glicemia:glycemiaResource,fotos:photosResource,clinical:clinicalResource};
  const indicatorCards = [
    { id: 'peso', label: 'PESO', icon: Scale, value: sortedWeightData[0]?.weight != null ? `${Number(sortedWeightData[0].weight).toFixed(1)} kg` : 'Sem registros' },
    { id: 'glicemia', label: 'GLICEMIA', icon: Droplet, value: sortedGlycemiaData[0]?.value != null ? `${Number(sortedGlycemiaData[0].value).toFixed(0)} mg/dL` : 'Sem registros' },
    { id: 'medidas', label: 'MEDIDAS', icon: Ruler, value: sortedMeasurementsData[0]?.height != null ? `${Number(sortedMeasurementsData[0].height).toFixed(1)} cm` : 'Sem registros' },
    { id: 'fotos', label: 'FOTOS', icon: Camera, value: photosData.length ? `${photosData.length} ${photosData.length === 1 ? 'foto' : 'fotos'}` : 'Sem registros' },
  ].map(card=>resources[card.id].hasSnapshot?card:{...card,value:resources[card.id].error?'Indisponível':'Aguardando confirmação'});

  
return {resources,activeDetail,setActiveDetail,setDialogOpen,activeTab,loading,loadError,loadProgressData,sortedWeightData,openDetail,weightOnlyData,indicatorCards,clinicalLoadError,timeline,user,setActiveTab,isDiabetic,weightChartData,goalWeight,glycemiaChartData,sortedGlycemiaData,measurementsData,sortedMeasurementsData,photosData,setLightboxPhoto,setDeletePhotoTarget,hasMoreHistory,loadingMoreHistory,loadMoreHistory,dialogOpen,handleAddWeightRecord,recordDate,setRecordDate,newWeight,setNewWeight,handleAddGlycemiaRecord,newGlycemiaCondition,setNewGlycemiaCondition,newGlycemia,setNewGlycemia,handleAddMeasurementRecord,newHeight,setNewHeight,newHeadCircumference,setNewHeadCircumference,selectedPhotoFile,handleAddPhotoRecord,photoNotes,setSelectedPhotoFile,setPhotoNotes,lightboxPhoto,deletePhotoTarget,handleDeletePhoto};
}
