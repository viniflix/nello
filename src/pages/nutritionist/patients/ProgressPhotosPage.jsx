import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { ArrowLeft, Camera, Plus, Trash2, Scale, Calendar, Loader2, Edit2, X, User, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DateInputWithCalendar } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { patientHubRoute } from '@/lib/utils/patientRoutes';
import {
    getProgressPhotos,
    addProgressPhoto,
    updateProgressPhoto,
    deleteProgressPhoto
} from '@/lib/supabase/progress-photos-queries';
import { logActivityEvent } from '@/lib/supabase/patient-queries';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const BUCKET = 'patient-photos';
/** Path: {patient_id}/progress_photos/{uuid}.ext - first folder must be patient_id for RLS */
function getStoragePath(patientId) {
    return `${patientId}/progress_photos/${crypto.randomUUID()}`;
}
const MIME_BY_EXT = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif'
};

export default function ProgressPhotosPage() {
    const { patientId, loading: resolveLoading, error: resolveError, paramValue } = useResolvedPatientId();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { user } = useAuth();
    const [patientName, setPatientName] = useState('');
    const [patientSlug, setPatientSlug] = useState('');
    const [photos, setPhotos] = useState([]);
    const [weights, setWeights] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [photoDate, setPhotoDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [uploading, setUploading] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [photoNotes, setPhotoNotes] = useState('');
    const [editTarget, setEditTarget] = useState(null);
    const [editDate, setEditDate] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [lightboxPhoto, setLightboxPhoto] = useState(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (!patientId) return;
        (async () => {
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('name, slug')
                .eq('id', patientId)
                .single();
            if (profile) {
                setPatientName(profile.name || 'Paciente');
                setPatientSlug(profile.slug || '');
            }
        })();
    }, [patientId]);

    const loadData = async () => {
        if (!patientId) return;
        setLoading(true);
        try {
            const { data: photosData } = await getProgressPhotos({ patientId });
            setPhotos(photosData || []);

            const { data: weightData } = await supabase
                .from('growth_records')
                .select('record_date, weight')
                .eq('patient_id', patientId)
                .not('weight', 'is', null)
                .order('record_date', { ascending: false })
                .limit(100);
            setWeights(weightData || []);
        } catch (e) {
            console.error(e);
            toast({ title: 'Erro ao carregar dados', description: e.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!patientId) return;
        loadData();
    }, [patientId]);

    const handleFileSelect = (e) => {
        setSelectedFile(e?.target?.files?.[0] ?? null);
    };

    const handleUpload = async () => {
        const file = selectedFile;
        if (!file || !patientId || !user?.id) return;
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const typeOk = !file.type || allowedTypes.includes(file.type) || file.type.startsWith('image/');
        const extOk = allowedExtensions.includes(ext) || !ext;
        if (!typeOk || !extOk) {
            toast({ title: 'Formato não suportado. Use JPEG, PNG, WebP ou HEIC.', variant: 'destructive' });
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast({ title: 'Imagem deve ter no máximo 5MB', variant: 'destructive' });
            return;
        }
        setUploading(true);
        try {
            const safeExt = allowedExtensions.includes(ext) ? ext : (file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'image/heic' ? 'heic' : file.type === 'image/heif' ? 'heif' : 'jpg');
            const path = `${getStoragePath(patientId)}.${safeExt}`;
            const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
                upsert: false,
                contentType: MIME_BY_EXT[safeExt] || file.type || 'application/octet-stream'
            });
            if (upErr) throw upErr;
            const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
            const { data: row, error: insertErr } = await addProgressPhoto({
                patientId,
                photoUrl: publicUrl,
                photoDate,
                uploadedBy: user.id,
                notes: photoNotes?.trim() || null
            });
            if (insertErr) throw insertErr;
            await logActivityEvent({
                eventName: 'progress_photo.added',
                sourceModule: 'progress_photos',
                patientId,
                nutritionistId: user.id,
                payload: { photo_id: row?.id, photo_date: photoDate, uploaded_by: user.id }
            });
            toast({ title: 'Foto adicionada' });
            setModalOpen(false);
            setPhotoDate(format(new Date(), 'yyyy-MM-dd'));
            setPhotoNotes('');
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            loadData();
        } catch (err) {
            console.error('[ProgressPhotos][upload] erro detalhado:', err);
            const fullMsg = err?.message || err?.error_description || err?.details || err?.hint || JSON.stringify(err);
            toast({
                title: 'Erro ao enviar foto',
                description: fullMsg || 'Não foi possível enviar a imagem. Tente novamente.',
                variant: 'destructive'
            });
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        const photoId = deleteTarget.id;
        const { error } = await deleteProgressPhoto({ photoId });
        if (error) {
            toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
            return;
        }
        await logActivityEvent({
            eventName: 'progress_photo.deleted',
            sourceModule: 'progress_photos',
            patientId,
            nutritionistId: user.id,
            payload: { photo_id: photoId }
        });
        toast({ title: 'Foto removida' });
        setDeleteTarget(null);
        loadData();
    };

    const openEdit = (photo) => {
        setEditTarget(photo);
        setEditDate(photo.photo_date);
        setEditNotes(photo.notes || '');
    };

    const handleSaveEdit = async () => {
        if (!editTarget) return;
        setSavingEdit(true);
        try {
            const { error } = await updateProgressPhoto({
                photoId: editTarget.id,
                photoDate: editDate,
                notes: editNotes?.trim() || null
            });
            if (error) throw error;
            await logActivityEvent({
                eventName: 'progress_photo.edited',
                sourceModule: 'progress_photos',
                patientId,
                nutritionistId: user.id,
                payload: { photo_id: editTarget.id, photo_date: editDate }
            });
            toast({ title: 'Foto atualizada' });
            setEditTarget(null);
            loadData();
        } catch (err) {
            toast({ title: 'Erro ao atualizar', description: err.message, variant: 'destructive' });
        } finally {
            setSavingEdit(false);
        }
    };

    const patient = { id: patientId, slug: patientSlug || paramValue };

    if (resolveLoading || !patientId) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }
    if (resolveError) {
        return (
            <div className="min-h-screen bg-background p-4">
                <p className="text-destructive">Paciente não encontrado.</p>
                <Button variant="outline" onClick={() => navigate('/nutritionist/patients')}>Voltar</Button>
            </div>
        );
    }

    const sortedPhotos = [...photos].sort(
        (a, b) => new Date(a.photo_date) - new Date(b.photo_date)
    );

    return (
        <div className="min-h-screen bg-background overflow-x-hidden">
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8 min-w-0">
                <div className="flex items-center gap-2 md:gap-4 mb-6 min-w-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(patientHubRoute(patient, 'body'))}
                        className="shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="min-w-0">
                        <h1 className="text-2xl md:text-3xl font-bold break-words flex items-center gap-2">
                            <Camera className="w-7 h-7 text-[#b99470] shrink-0" />
                            Fotos de Progresso
                        </h1>
                        <p className="text-muted-foreground text-sm md:text-base truncate">
                            {patientName} — Antes e depois
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="space-y-8">
                        {weights.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Scale className="w-5 h-5" />
                                        Peso registrado
                                    </CardTitle>
                                    <CardDescription>Registros de peso para referência no período das fotos</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-wrap gap-2">
                                        {weights.slice(0, 15).map((w, i) => (
                                            <span
                                                key={i}
                                                className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm"
                                            >
                                                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                                                {format(new Date(w.record_date), 'dd/MM/yy', { locale: ptBR })}: {Number(w.weight).toFixed(1)} kg
                                            </span>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        <Card>
                            <CardHeader>
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <CardTitle>Timeline de fotos</CardTitle>
                                        <CardDescription className="mt-1">
                                            Ordem cronológica das fotos enviadas pelo paciente ou por você. Clique para ampliar; use o lápis para editar data ou legenda.
                                        </CardDescription>
                                        {sortedPhotos.length > 0 && (
                                            <p className="text-sm text-muted-foreground mt-2">
                                                <span className="font-medium text-foreground">{sortedPhotos.length}</span> foto{sortedPhotos.length !== 1 ? 's' : ''}
                                                <span className="mx-1">·</span>
                                                {format(new Date(sortedPhotos[0].photo_date), 'dd/MM/yy', { locale: ptBR })} → {format(new Date(sortedPhotos[sortedPhotos.length - 1].photo_date), 'dd/MM/yy', { locale: ptBR })}
                                            </p>
                                        )}
                                    </div>
                                    <Button
                                        className="shrink-0 bg-[#b99470] hover:bg-[#a08060]"
                                        onClick={() => setModalOpen(true)}
                                    >
                                        <Plus className="w-4 h-4 mr-2" />
                                        Adicionar foto
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {sortedPhotos.length === 0 ? (
                                    <div className="text-center py-12 border-2 border-dashed border-muted rounded-lg">
                                        <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                                        <p className="text-muted-foreground">Nenhuma foto ainda</p>
                                        <p className="text-sm text-muted-foreground mt-1">Clique em &quot;Adicionar foto&quot; para enviar a primeira</p>
                                        <Button className="mt-4" onClick={() => setModalOpen(true)}>
                                            <Plus className="w-4 h-4 mr-2" />
                                            Adicionar foto
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                        {sortedPhotos.map((photo) => {
                                            const isFromPatient = photo.uploaded_by === patientId;
                                            return (
                                                <div
                                                    key={photo.id}
                                                    className="relative group rounded-lg overflow-hidden border border-border bg-muted aspect-[3/4]"
                                                >
                                                    <img
                                                        src={photo.photo_url}
                                                        alt={format(new Date(photo.photo_date), 'dd/MM/yyyy')}
                                                        className="w-full h-full object-cover cursor-pointer"
                                                        onClick={() => setLightboxPhoto(photo)}
                                                    />
                                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3">
                                                        <div className="flex items-center justify-between gap-1 mb-0.5">
                                                            <p className="text-xs font-medium text-white">
                                                                {format(new Date(photo.photo_date), "dd/MM/yyyy", { locale: ptBR })}
                                                            </p>
                                                            <Badge
                                                                variant="secondary"
                                                                className="text-[10px] h-5 px-1.5 bg-white/20 text-white border-0"
                                                            >
                                                                {isFromPatient ? (
                                                                    <><User className="w-2.5 h-2.5 mr-0.5" /> Paciente</>
                                                                ) : (
                                                                    <><Stethoscope className="w-2.5 h-2.5 mr-0.5" /> Você</>
                                                                )}
                                                            </Badge>
                                                        </div>
                                                        {photo.notes && (
                                                            <p className="text-[10px] text-white/90 line-clamp-2">{photo.notes}</p>
                                                        )}
                                                    </div>
                                                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            variant="secondary"
                                                            size="icon"
                                                            className="h-8 w-8 bg-black/50 hover:bg-black/70"
                                                            onClick={(e) => { e.stopPropagation(); openEdit(photo); }}
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="destructive"
                                                            size="icon"
                                                            className="h-8 w-8"
                                                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(photo); }}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}
            </main>

            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Adicionar foto de progresso</DialogTitle>
                        <DialogDescription>
                            A foto será associada à data escolhida (útil para comparar com o peso do período).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Data da foto</Label>
                            <DateInputWithCalendar
                                value={photoDate}
                                onChange={(v) => setPhotoDate(v)}
                            />
                        </div>
                        <div>
                            <Label>Imagem</Label>
                            <Input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,image/webp"
                                onChange={handleFileSelect}
                                disabled={uploading}
                                className="hidden"
                            />
                            <div className="mt-2 flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={uploading}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    Escolher arquivo
                                </Button>
                                <span className="text-sm text-muted-foreground truncate">
                                    {selectedFile?.name || 'Nenhum arquivo selecionado'}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">JPEG, PNG, WebP, HEIC/HEIF (iOS/Android)</p>
                            {uploading && (
                                <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Enviando...
                                </p>
                            )}
                        </div>
                        <div>
                            <Label>Legenda ou nota (opcional)</Label>
                            <Textarea
                                placeholder="Ex: Avaliação mensal, peso 76 kg"
                                value={photoNotes}
                                onChange={(e) => setPhotoNotes(e.target.value)}
                                rows={2}
                                className="resize-none"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setModalOpen(false)}>Fechar</Button>
                        <Button
                            onClick={() => handleUpload()}
                            disabled={!selectedFile || uploading}
                        >
                            {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Enviar foto
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Editar data/nota da foto */}
            <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar foto</DialogTitle>
                        <DialogDescription>
                            Altere a data ou a legenda associada a esta foto.
                        </DialogDescription>
                    </DialogHeader>
                    {editTarget && (
                        <div className="space-y-4">
                            <div>
                                <Label>Data da foto</Label>
                                <DateInputWithCalendar
                                    value={editDate}
                                    onChange={(v) => setEditDate(v)}
                                />
                            </div>
                            <div>
                                <Label>Legenda ou nota</Label>
                                <Textarea
                                    placeholder="Ex: Avaliação mensal"
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    rows={2}
                                    className="resize-none"
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
                        <Button onClick={handleSaveEdit} disabled={savingEdit}>
                            {savingEdit ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Salvar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Lightbox */}
            <Dialog open={!!lightboxPhoto} onOpenChange={(open) => !open && setLightboxPhoto(null)}>
                <DialogContent className="max-w-4xl w-[95vw] p-2">
                    {lightboxPhoto && (
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-2 top-2 z-10 bg-background/80"
                                onClick={() => setLightboxPhoto(null)}
                            >
                                <X className="w-5 h-5" />
                            </Button>
                            <img
                                src={lightboxPhoto.photo_url}
                                alt={format(new Date(lightboxPhoto.photo_date), 'dd/MM/yyyy')}
                                className="w-full max-h-[85vh] object-contain rounded-lg"
                            />
                            <div className="text-center py-2 space-y-1">
                                <p className="font-medium">{format(new Date(lightboxPhoto.photo_date), "dd/MM/yyyy", { locale: ptBR })}</p>
                                {lightboxPhoto.uploaded_by === patientId ? (
                                    <Badge variant="secondary" className="text-xs">Enviada pelo paciente</Badge>
                                ) : (
                                    <Badge variant="secondary" className="text-xs">Enviada por você</Badge>
                                )}
                                {lightboxPhoto.notes && (
                                    <p className="text-sm text-muted-foreground mt-1">{lightboxPhoto.notes}</p>
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remover esta foto?</AlertDialogTitle>
                        <AlertDialogDescription>
                            A foto será removida do progresso. O arquivo no servidor pode permanecer.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                            Remover
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
