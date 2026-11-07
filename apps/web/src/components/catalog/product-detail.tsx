'use client';
import { useQuery } from '@tanstack/react-query';
import type { ProductRow, CostSnapshot } from '@marketpilot/contracts';
import { Package, History, CircleAlert } from 'lucide-react';
import { money, daysLabel } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
export function ProductDetail({
  item,
  onClose,
  loadHistory,
  demo,
}: {
  item: ProductRow;
  onClose: () => void;
  loadHistory: (id: string) => Promise<CostSnapshot[]>;
  demo: boolean;
}) {
  const { data, error, isPending } = useQuery({
    queryKey: ['catalog', 'product-history', demo, item.id, item.version],
    queryFn: () => loadHistory(item.id),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="catalog-dialog">
        <DialogTitle>{item.name}</DialogTitle>
        <DialogDescription>
          {item.sku} · {item.supplier.name}
          {demo ? ' · Dados fictícios' : ''}
        </DialogDescription>
        <div className="catalog-detail-summary">
          <div>
            <Package size={18} />
            <span>
              Custo atual<strong>{money(item.costCents)}</strong>
            </span>
          </div>
          <div>
            <span>
              Estoque informado<strong>{item.stock} unidades</strong>
            </span>
          </div>
          <div>
            <span>
              Postagem<strong>{daysLabel(item.shippingDays)}</strong>
            </span>
          </div>
        </div>
        <h3 className="catalog-history-heading">
          <History size={16} />
          Histórico de custo e disponibilidade
        </h3>
        <p className="catalog-help">
          Snapshots de alterações conhecidas. Estoque informado pelo catálogo; sincronização
          automática entra na Fase 4.
        </p>
        {isPending ? (
          <p className="loading-panel">Carregando histórico...</p>
        ) : error ? (
          <p role="alert" className="form-error">
            <CircleAlert size={16} />
            {error.message}
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Atualização</th>
                  <th>Custo</th>
                  <th>Estoque</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((snapshot) => (
                  <tr key={snapshot.id}>
                    <td>
                      {new Intl.DateTimeFormat('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: 'America/Sao_Paulo',
                      }).format(new Date(snapshot.createdAt))}
                    </td>
                    <td>{money(snapshot.costCents)}</td>
                    <td>{snapshot.stock}</td>
                    <td>{snapshot.source === 'MANUAL' ? 'Cadastro manual' : snapshot.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="catalog-source-note">
          <strong>Fonte da informação</strong>
          <span>
            {item.source === 'MANUAL'
              ? 'Cadastro manual no workspace'
              : `Importação ${item.source}`}
          </span>
          {item.sourceUrl && <span>{item.sourceUrl}</span>}
          <small>
            Última alteração:{' '}
            {new Intl.DateTimeFormat('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
              timeZone: 'America/Sao_Paulo',
            }).format(new Date(item.updatedAt))}
          </small>
        </div>
      </DialogContent>
    </Dialog>
  );
}
