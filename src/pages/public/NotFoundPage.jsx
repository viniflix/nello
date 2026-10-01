import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
    <h1 className="text-3xl font-semibold">Página não encontrada</h1>
    <p>Confira o endereço ou volte para o início.</p>
    <Link className="underline" to="/">Voltar ao início</Link>
  </main>;
}
