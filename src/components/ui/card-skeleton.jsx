import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton para cards de estatísticas simples (números grandes)
 */
export function StatCardSkeleton() {
    return (
        <Card className="bg-card shadow-card-dark rounded-xl">
            <CardHeader className="pb-2">
                <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-10 w-20 mb-2" />
                <Skeleton className="h-3 w-40" />
            </CardContent>
        </Card>
    );
}

/**
 * Skeleton para card de alertas/notificações
 */
export function AlertCardSkeleton() {
    return (
        <Card className="bg-card shadow-card-dark rounded-xl">
            <CardHeader className="pb-3">
                <Skeleton className="h-5 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-3">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                        <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

/**
 * Skeleton para card de lista de atividades/atualizações
 */
export function ActivityListSkeleton() {
    return (
        <Card className="bg-card shadow-card-dark rounded-xl">
            <CardHeader className="pb-3">
                <Skeleton className="h-5 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-start gap-3">
                        <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-3 w-2/3" />
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

/**
 * Skeleton para card de gráfico
 */
export function ChartCardSkeleton() {
    return (
        <Card className="bg-card shadow-card-dark rounded-xl">
            <CardHeader>
                <Skeleton className="h-5 w-40 mb-2" />
                <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-64 w-full rounded-lg" />
            </CardContent>
        </Card>
    );
}

/**
 * Skeleton para card de tabela/lista com filtros
 */
export function TableCardSkeleton() {
    return (
        <Card className="bg-card shadow-card-dark rounded-xl">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between mb-3">
                    <div className="space-y-2">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-4 w-64" />
                    </div>
                    <Skeleton className="h-10 w-32" />
                </div>
                {/* Barra de pesquisa */}
                <div className="flex gap-2">
                    <Skeleton className="h-10 flex-1" />
                    <Skeleton className="h-10 w-10" />
                </div>
            </CardHeader>
            <CardContent>
                <Skeleton className="h-3 w-24 mb-3" />
                <div className="space-y-3 max-h-[400px]">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-start gap-3">
                            <Skeleton className="h-10 w-10 rounded-full" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-3 w-3/4" />
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

/**
 * Skeleton genérico para card simples
 */
export function CardSkeleton({ lines = 3 }) {
    return (
        <Card className="bg-card shadow-card-dark rounded-xl">
            <CardHeader>
                <Skeleton className="h-5 w-40 mb-2" />
                <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent className="space-y-3">
                {Array.from({ length: lines }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                ))}
            </CardContent>
        </Card>
    );
}
