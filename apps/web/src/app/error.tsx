'use client';
import Link from 'next/link';
import { CircleAlert } from 'lucide-react';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="global-message">
      <CircleAlert size={32} />
      <h1>Não foi possível carregar esta página.</h1>
      <p>Verifique se a API e o banco estão disponíveis e tente novamente.</p>
      <button className="button button-primary" onClick={reset}>
        Tentar novamente
      </button>
      <Link href="/demo">Abrir demonstração</Link>
    </div>
  );
}
