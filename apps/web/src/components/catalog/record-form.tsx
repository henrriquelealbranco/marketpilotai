'use client';
import { useState, useId } from 'react';
import { ZodError } from 'zod';
import type { ProductRow, SupplierRow, ProductInput, SupplierInput } from '@marketpilot/contracts';
import { supplierInputSchema, productInputSchema } from '@marketpilot/contracts';
import { Save, CircleAlert } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';

export function RecordForm({
  kind,
  item,
  suppliers,
  onSave,
  onClose,
  demo,
}: {
  kind: 'products' | 'suppliers';
  item?: ProductRow | SupplierRow;
  suppliers: SupplierRow[];
  onSave: (
    input: ProductInput | SupplierInput,
    existing?: ProductRow | SupplierRow,
  ) => Promise<void>;
  onClose: () => void;
  demo: boolean;
}) {
  const prefix = useId();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const product = item && 'sku' in item ? item : undefined;
  const supplier = item && 'cnpj' in item ? item : undefined;
  const amount = (value: FormDataEntryValue | null) => {
    const text = String(value ?? '').trim();
    if (!/^(0|[1-9]\d{0,5})([.,]\d{1,2})?$/.test(text))
      throw new Error('Informe um valor monetário como 19,90, sem separador de milhar.');
    const [whole, fraction = ''] = text.split(/[.,]/);
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  };
  function field(
    name: string,
    label: string,
    value: string | number | undefined,
    options: {
      required?: boolean;
      type?: string;
      min?: number;
      max?: number;
      maxLength?: number;
      disabled?: boolean;
      helper?: string;
    } = {},
  ) {
    return (
      <div className="catalog-field" key={name}>
        <label htmlFor={`${prefix}-${name}`}>{label}</label>
        <input
          id={`${prefix}-${name}`}
          name={name}
          defaultValue={value ?? ''}
          type={options.type ?? 'text'}
          required={options.required}
          min={options.min}
          max={options.max}
          maxLength={options.maxLength ?? 160}
          disabled={options.disabled}
          inputMode={options.type === 'number' ? 'numeric' : undefined}
        />
        {options.helper && <small>{options.helper}</small>}
      </div>
    );
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '');
    try {
      const input =
        kind === 'suppliers'
          ? supplierInputSchema.parse({
              name: text('name'),
              cnpj: text('cnpj'),
              contactName: text('contactName'),
              email: text('email'),
              phone: text('phone'),
              sourceUrl: text('sourceUrl'),
              notes: text('notes'),
              shippingDays: Number(text('shippingDays')),
              shippingCostCents: amount(form.get('shippingCost')),
              rating: Number(text('rating')),
            })
          : productInputSchema.parse({
              supplierId: product?.supplierId ?? text('supplierId'),
              sku: text('sku'),
              name: text('name'),
              category: text('category'),
              costCents: amount(form.get('cost')),
              stock: Number(text('stock')),
              shippingDays: Number(text('shippingDays')),
              shippingCostCents: amount(form.get('shippingCost')),
              sourceUrl: text('sourceUrl'),
            });
      await onSave(input, item);
      onClose();
    } catch (e) {
      setError(
        e instanceof ZodError
          ? e.issues
              .map((i) => i.message)
              .slice(0, 3)
              .join(' ')
          : e instanceof Error
            ? e.message
            : 'Não foi possível salvar.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="catalog-dialog">
        <DialogTitle>
          {item ? 'Editar' : 'Novo'} {kind === 'suppliers' ? 'fornecedor' : 'produto'}
        </DialogTitle>
        <DialogDescription>
          {demo
            ? 'Alterações ficam somente nesta demonstração e serão descartadas ao recarregar.'
            : 'Dados salvos no workspace atual. Nenhuma operação externa será executada.'}
        </DialogDescription>
        <form onSubmit={submit} className="catalog-form">
          <div className="catalog-form-grid">
            {kind === 'products' && (
              <div className="catalog-field full-width">
                <label htmlFor={`${prefix}-supplierId`}>Fornecedor</label>
                <select
                  id={`${prefix}-supplierId`}
                  name="supplierId"
                  required
                  defaultValue={product?.supplierId ?? ''}
                  disabled={!!product}
                >
                  <option value="" disabled>
                    Selecione um fornecedor
                  </option>
                  {product && !suppliers.some((s) => s.id === product.supplierId) && (
                    <option value={product.supplierId}>{product.supplier.name} · arquivado</option>
                  )}
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {field(
              'name',
              kind === 'suppliers' ? 'Nome do fornecedor' : 'Nome do produto',
              item?.name,
              { required: true, maxLength: kind === 'suppliers' ? 120 : 160 },
            )}
            {kind === 'suppliers' ? (
              <>
                {field('cnpj', 'CNPJ (opcional)', supplier?.cnpj ?? '', {
                  maxLength: 30,
                  helper: 'Numérico ou alfanumérico. Validação local dos dígitos.',
                })}
                {field('contactName', 'Contato', supplier?.contactName ?? '', { maxLength: 100 })}
                {field('email', 'E-mail de contato', supplier?.email ?? '', {
                  type: 'email',
                  maxLength: 254,
                })}
                {field('phone', 'Telefone', supplier?.phone ?? '', { type: 'tel', maxLength: 40 })}
                <div className="catalog-field">
                  <label htmlFor={`${prefix}-rating`}>Avaliação interna</label>
                  <select
                    id={`${prefix}-rating`}
                    name="rating"
                    defaultValue={supplier?.rating ?? 0}
                  >
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n === 0 ? 'Não avaliado' : `${n} de 5`}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <>
                {field('sku', 'SKU', product?.sku, { required: true, maxLength: 80 })}
                {field('category', 'Categoria', product?.category ?? 'Sem categoria', {
                  required: true,
                  maxLength: 80,
                })}
                {field(
                  'cost',
                  'Custo do produto (R$)',
                  ((product?.costCents ?? 0) / 100).toFixed(2).replace('.', ','),
                  { required: true },
                )}
                {field('stock', 'Estoque disponível', product?.stock ?? 0, {
                  type: 'number',
                  min: 0,
                  max: 10000000,
                  required: true,
                })}
              </>
            )}
            {field('shippingDays', 'Prazo de postagem (dias)', item?.shippingDays ?? 2, {
              type: 'number',
              min: 0,
              max: 365,
              required: true,
            })}
            {field(
              'shippingCost',
              'Custo logístico (R$)',
              ((item?.shippingCostCents ?? 0) / 100).toFixed(2).replace('.', ','),
              { required: true },
            )}
            <div className="catalog-field full-width">
              {field('sourceUrl', 'Referência da fonte (opcional)', item?.sourceUrl ?? '', {
                type: 'url',
                maxLength: 1000,
                helper:
                  'A URL é apenas uma referência. O sistema não acessa ou baixa conteúdo desta fonte.',
              })}
            </div>
            {kind === 'suppliers' && (
              <div className="catalog-field full-width">
                <label htmlFor={`${prefix}-notes`}>Observações</label>
                <textarea
                  id={`${prefix}-notes`}
                  name="notes"
                  maxLength={2000}
                  rows={3}
                  defaultValue={supplier?.notes ?? ''}
                />
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className="form-error">
              <CircleAlert size={16} />
              {error}
            </p>
          )}
          <div className="catalog-dialog-actions">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              <Save size={15} />
              {pending ? 'Salvando...' : demo ? 'Salvar na demonstração' : 'Salvar cadastro'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
