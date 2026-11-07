'use client';
import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  ArrowDownUp,
  Headphones,
  LampDesk,
  Watch,
  CupSoda,
  Luggage,
  ArrowUpRight,
} from 'lucide-react';
import Link from 'next/link';
import type { Dashboard } from '@marketpilot/contracts';
import { money, percent } from '@/lib/utils';
type Product = Dashboard['ranking'][number];
const icons = [Headphones, LampDesk, CupSoda, Watch, Luggage];
export function ProductRanking({ rows, base }: { rows: Product[]; base: string }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'revenueCents', desc: true }]);
  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Produto',
        cell: ({ row }) => {
          const Icon = icons[(Number(row.original.id.split('-')[1]) - 1) % 5] || Headphones;
          return (
            <div className="product-cell">
              <span className={`product-icon tone-${row.index % 5}`}>
                <Icon size={22} strokeWidth={1.5} />
              </span>
              <span>
                <strong>{row.original.name}</strong>
                <small>{row.original.category}</small>
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'units',
        header: 'Vendas',
        cell: ({ getValue }) => <span className="tabular">{String(getValue())}</span>,
      },
      {
        accessorKey: 'revenueCents',
        header: 'Receita',
        cell: ({ getValue }) => (
          <strong className="table-money">{money(Number(getValue()))}</strong>
        ),
      },
      {
        accessorKey: 'marginPercent',
        header: 'Margem est.',
        cell: ({ getValue }) => <span className="margin-badge">{percent(Number(getValue()))}</span>,
      },
    ],
    [],
  );
  // TanStack Table owns stable table state; memoizing its return would make sorting stale.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  return (
    <section className="panel ranking-panel">
      <div className="panel-heading">
        <div>
          <h2>Produtos em destaque</h2>
          <p>Os produtos com maior receita no período</p>
        </div>
        <Link className="text-link" href={`${base}/products`}>
          Ver produtos <ArrowUpRight size={14} />
        </Link>
      </div>
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th key={header.id}>
                      <button onClick={header.column.getToggleSortingHandler()}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <ArrowDownUp size={11} />
                      </button>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="inline-empty">
          <Headphones size={28} />
          <strong>Seu ranking começa com a primeira venda</strong>
          <p>Produtos e catálogos serão conectados na Fase 2.</p>
        </div>
      )}
    </section>
  );
}
