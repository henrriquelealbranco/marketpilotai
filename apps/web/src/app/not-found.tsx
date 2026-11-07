import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="global-message">
      <span className="page-eyebrow">404</span>
      <h1>Esta página não foi encontrada.</h1>
      <p>Volte ao dashboard para continuar explorando.</p>
      <Link className="button button-primary" href="/demo">
        Abrir dashboard
      </Link>
    </div>
  );
}
