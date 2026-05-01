import React, { useRef, useState } from 'react';
import { Upload, X, FileText, Image, Loader2, Eye, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Componente de upload de arquivo para o motor de anamnese.
 *
 * FIX A7: Não exibe mais signed_url do banco.
 * O botão "Ver Arquivo" chama onRequestUrl(storagePath) que
 * gera a URL assinada sob demanda e abre em nova aba.
 */
export function FileUploadField({
    fieldId,
    fieldLabel,
    existingAttachments = [],
    onUpload,
    onDelete,
    onRequestUrl, // async (storagePath) => signedUrl
    uploading = false,
    disabled = false,
}) {
    const inputRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [openingId, setOpeningId] = useState(null); // track which file is loading URL

    const fieldAttachments = existingAttachments.filter((a) => a.field_id === fieldId);

    const handleFiles = (files) => {
        const file = files[0];
        if (!file) return;
        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!validTypes.includes(file.type)) {
            alert('Apenas imagens (JPG, PNG, WebP) e PDFs são permitidos.');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            alert('O arquivo não pode ultrapassar 10MB.');
            return;
        }
        onUpload({ file, fieldId, fieldLabel });
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
    };

    const handleViewFile = async (attachment) => {
        if (!onRequestUrl) return;
        setOpeningId(attachment.id);
        try {
            const url = await onRequestUrl(attachment.storage_path);
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch {
            alert('Não foi possível abrir o arquivo. Tente novamente.');
        } finally {
            setOpeningId(null);
        }
    };

    const isImage = (type) => type?.startsWith('image/');
    const formatSize = (bytes) =>
        bytes < 1024 * 1024
            ? `${(bytes / 1024).toFixed(0)} KB`
            : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

    return (
        <div className="space-y-3">
            {/* Arquivos existentes */}
            {fieldAttachments.length > 0 && (
                <div className="space-y-2">
                    {fieldAttachments.map((attachment) => (
                        <div
                            key={attachment.id}
                            className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl group hover:border-slate-300 transition-colors"
                        >
                            <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                                {isImage(attachment.file_type) ? (
                                    <Image className="w-4 h-4 text-blue-500" />
                                ) : (
                                    <FileText className="w-4 h-4 text-red-500" />
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-700 truncate">
                                    {attachment.file_name}
                                </p>
                                <p className="text-xs text-slate-400">
                                    {formatSize(attachment.file_size)}
                                    {attachment.uploaded_by === 'patient' && (
                                        <span className="ml-2 text-blue-500">• enviado pelo paciente</span>
                                    )}
                                </p>
                            </div>

                            <div className="flex items-center gap-1">
                                {/* Botão Ver — gera URL sob demanda */}
                                {onRequestUrl && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => handleViewFile(attachment)}
                                        disabled={openingId === attachment.id}
                                        title="Ver arquivo"
                                    >
                                        {openingId === attachment.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                                        ) : (
                                            <ExternalLink className="w-4 h-4 text-slate-500" />
                                        )}
                                    </Button>
                                )}

                                {/* Botão Remover */}
                                {!disabled && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() =>
                                            onDelete({
                                                attachmentId: attachment.id,
                                                storagePath: attachment.storage_path,
                                            })
                                        }
                                        title="Remover arquivo"
                                    >
                                        <X className="w-4 h-4 text-red-400" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Área de Drop/Upload */}
            {!disabled && (
                <div
                    className={cn(
                        'border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer select-none',
                        dragging
                            ? 'border-blue-500 bg-blue-50 scale-[1.01]'
                            : 'border-slate-200 bg-slate-50/80 hover:border-slate-300 hover:bg-white'
                    )}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => !uploading && inputRef.current?.click()}
                >
                    {uploading ? (
                        <div className="flex flex-col items-center gap-2 text-slate-500">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                            <p className="text-sm font-medium">Enviando com segurança...</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                            <Upload className="w-6 h-6" />
                            <p className="text-sm font-semibold text-slate-600">
                                Arraste o arquivo ou clique para selecionar
                            </p>
                            <p className="text-xs">JPG, PNG, WebP, PDF • máx. 10MB</p>
                        </div>
                    )}
                    <input
                        ref={inputRef}
                        type="file"
                        className="hidden"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(e) => handleFiles(e.target.files)}
                    />
                </div>
            )}
        </div>
    );
}
