import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// --- Page & Header Skeletons ---

export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 md:mb-8">
      <div className="flex flex-col gap-2 w-full sm:w-1/2">
        <Skeleton className="h-8 w-3/4 sm:w-1/2" />
        <Skeleton className="h-4 w-full sm:w-3/4" />
      </div>
      <div className="flex shrink-0 gap-2 w-full sm:w-auto">
        <Skeleton className="h-10 w-full sm:w-32" />
        <Skeleton className="h-10 w-full sm:w-32" />
      </div>
    </div>
  );
}

// --- Card & Grid Skeletons ---

export function CardSkeleton() {
  return (
    <Card className="overflow-hidden h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

export function GridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

// --- Table & List Skeletons ---

export function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-border/50 px-4">
      <div className="flex items-center gap-3 flex-1 min-w-[200px]">
        <Skeleton className="h-10 w-10 rounded-full shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="hidden md:block flex-1 min-w-[100px]">
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="hidden lg:block flex-1 min-w-[100px]">
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="hidden lg:block flex-1 min-w-[100px]">
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="shrink-0 flex justify-end min-w-[80px]">
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="rounded-md border bg-background overflow-hidden">
      {/* Table Header Mock */}
      <div className="flex items-center gap-4 py-3 border-b bg-muted/40 px-4">
        <Skeleton className="h-4 w-20 flex-1 min-w-[200px]" />
        <Skeleton className="h-4 w-16 hidden md:block flex-1 min-w-[100px]" />
        <Skeleton className="h-4 w-24 hidden lg:block flex-1 min-w-[100px]" />
        <Skeleton className="h-4 w-24 hidden lg:block flex-1 min-w-[100px]" />
        <Skeleton className="h-4 w-12 shrink-0 justify-end min-w-[80px] ml-auto" />
      </div>
      {/* Table Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} />
      ))}
    </div>
  );
}

export function SimpleListSkeleton({ count = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md shrink-0" />
        </div>
      ))}
    </div>
  );
}

// --- Form & Input Skeletons ---

export function FormFieldSkeleton() {
  return (
    <div className="space-y-2 w-full">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export function FormSkeleton({ fields = 4, withSubmit = true }) {
  return (
    <div className="space-y-6 w-full">
      <div className="space-y-4">
        {Array.from({ length: fields }).map((_, i) => (
          <FormFieldSkeleton key={i} />
        ))}
      </div>
      {withSubmit && (
        <div className="flex justify-end pt-4">
          <Skeleton className="h-10 w-32" />
        </div>
      )}
    </div>
  );
}

// --- Chat Skeletons ---

export function ChatMessageSkeleton({ isSent = false }) {
  return (
    <div className={`flex w-full ${isSent ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex gap-2 max-w-[70%] ${isSent ? 'flex-row-reverse' : 'flex-row'}`}>
        {!isSent && <Skeleton className="h-8 w-8 rounded-full shrink-0" />}
        <Skeleton 
          className={`h-12 rounded-2xl ${
            isSent 
              ? 'rounded-tr-sm bg-primary/20 w-[200px]' 
              : 'rounded-tl-sm w-[250px]'
          }`} 
        />
      </div>
    </div>
  );
}

export function ChatAreaSkeleton({ messages = 6 }) {
  return (
    <div className="flex flex-col h-full w-full p-4">
      {Array.from({ length: messages }).map((_, i) => (
        <ChatMessageSkeleton key={i} isSent={i % 2 !== 0} />
      ))}
    </div>
  );
}
