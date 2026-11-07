'use client';
import { useState, useId } from 'react';
import { FileUp, FileCheck, Download, CircleAlert, ArrowRight } from 'lucide-react';
import type { CatalogFormat, CatalogPreview, SupplierRow } from '@marketpilot/contracts';
import { api, money } from '@/lib/utils';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
type Upload = {
  supplierId: string;
  format: CatalogFormat;
  content: string;
  fileName: string;
  authorized: true;
};
export function ImportDialog({
  suppliers,
  demo,
  onClose,
  onApply,
}: {
  suppliers: SupplierRow[];
  demo: boolean;
  onClose: () => void;
  onApply: (input: Upload, preview: CatalogPreview) => Promise<unknown>;
}) {
  const id = useId();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [encoding, setEncoding] = useState('utf-8');
  const [authorized, setAuthorized] = useState(false);
  const [preview, setPreview] = useState<CatalogPreview | null>(null);
  const [payload, setPayload] = useState<Upload | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const invalidate = () => {
    setPreview(null);
    setPayload(null);
    setError('');
  };
  async function check() {
    if (!file || !supplierId || !authorized) return;
    setPending(true);
    setError('');
    try {
      if (file.size > 524288) throw new Error('O arquivo excede o limite de 512 KiB.');
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension !== 'csv' && extension !== 'xml')
        throw new Error('Selecione um arquivo CSV ou XML.');
      const content = new TextDecoder(encoding, { fatal: true }).decode(await file.arrayBuffer());
      const input: Upload = {
        supplierId,
        format: extension.toUpperCase() as CatalogFormat,
        content,
        fileName: file.name,
        authorized: true,
      };
      const result = await api<CatalogPreview>(`/v1/${demo ? 'demo/' : ''}catalog/preview`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setPreview(result);
      setPayload(input);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? 'Não foi possível decodificar o arquivo. Confira a codificação selecionada.'
          : e instanceof Error
            ? e.message
            : 'Não foi possível validar o arquivo.',
      );
    } finally {
      setPending(false);
    }
  }
  async function apply() {
    if (!preview?.valid || !payload) return;
    setPending(true);
    setError('');
    try {
      await onApply(payload, preview);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível importar.');
    } finally {
      setPending(false);
    }
  }
  function template() {
    const csv =
      'sku;name;cost;stock;category;shipping_days;shipping_cost;source_url\r\nEXEMPLO-001;Produto de exemplo;19,90;10;Casa;2;5,00;\r\n';
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'marketpilot-modelo-catalogo.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="catalog-dialog import-dialog">
        <DialogTitle>Importar catálogo</DialogTitle>
        <DialogDescription>
          {demo
            ? 'Prévia validada no servidor; aplicação somente na memória da demonstração.'
            : 'Revise os dados antes de criar ou atualizar produtos do fornecedor.'}
        </DialogDescription>
        <div className="import-step-label">
          <span className={!preview ? 'selected' : ''}>1. Escolher fonte</span>
          <ArrowRight size={13} />
          <span className={preview ? 'selected' : ''}>2. Revisar e importar</span>
        </div>
        <div className="catalog-form-grid">
          <div className="catalog-field full-width">
            <label htmlFor={`${id}-supplier`}>Fornecedor do catálogo</label>
            <select
              id={`${id}-supplier`}
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                invalidate();
              }}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="catalog-field">
            <label htmlFor={`${id}-encoding`}>Codificação do arquivo</label>
            <select
              id={`${id}-encoding`}
              value={encoding}
              onChange={(e) => {
                setEncoding(e.target.value);
                invalidate();
              }}
            >
              <option value="utf-8">UTF-8</option>
              <option value="windows-1252">Windows-1252 (Excel antigo)</option>
            </select>
          </div>
          <div className="import-template">
            <Button type="button" variant="outline" onClick={template}>
              <Download size={15} />
              Baixar modelo CSV
            </Button>
          </div>
          <label className="catalog-upload full-width" htmlFor={`${id}-file`}>
            <FileUp size={28} />
            <strong>{file ? file.name : 'Escolha um catálogo CSV ou XML'}</strong>
            <span>Até 512 KiB · 500 produtos · sem busca em sites externos</span>
            <input
              id={`${id}-file`}
              type="file"
              accept=".csv,.xml"
              aria-label="Arquivo do catálogo"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                invalidate();
              }}
            />
          </label>
        </div>
        <label className="catalog-authorization">
          <input
            type="checkbox"
            checked={authorized}
            onChange={(e) => {
              setAuthorized(e.target.checked);
              invalidate();
            }}
          />
          Confirmo que tenho autorização para utilizar este catálogo.
        </label>
        <p className="catalog-help">
          O modelo contém um produto fictício. Substitua os dados antes de importar. Campos
          obrigatórios: <code>sku, name, cost, stock</code>. Valores como 19,90 ou 19.90, sem
          milhar. XML: <code>catalog &gt; product &gt; campo</code>.
        </p>
        {preview && (
          <div className="import-preview">
            <div className={preview.valid ? 'import-result-success' : 'import-result-error'}>
              {preview.valid ? <FileCheck size={18} /> : <CircleAlert size={18} />}
              <strong>
                {preview.valid
                  ? `${preview.totalRows} ${preview.totalRows === 1 ? 'produto pronto' : 'produtos prontos'} para revisão`
                  : 'O arquivo contém erros'}
              </strong>
              <span>
                {preview.valid
                  ? 'A importação será aplicada em um único lote.'
                  : 'Nenhum produto foi salvo.'}
              </span>
            </div>
            {preview.issues.length > 0 && (
              <ul className="import-issues">
                {preview.issues.map((issue, i) => (
                  <li key={i}>
                    {issue.row ? `Linha ${issue.row} · ` : ''}
                    {issue.field}: {issue.message}
                  </li>
                ))}
              </ul>
            )}
            {preview.rows.length > 0 && (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Produto</th>
                      <th>Custo</th>
                      <th>Estoque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 8).map((row, i) => (
                      <tr key={i}>
                        <td>{row.sku}</td>
                        <td>{row.name}</td>
                        <td>{money(row.costCents)}</td>
                        <td>{row.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 8 && (
                  <p className="catalog-help">
                    Exibindo 8 de {preview.rows.length} produtos na prévia.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="form-error">
            <CircleAlert size={16} />
            {error}
          </p>
        )}
        <div className="catalog-dialog-actions">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={preview?.valid ? 'outline' : 'default'}
            disabled={pending || !file || !authorized || !supplierId}
            onClick={check}
          >
            <FileCheck size={15} />
            {pending ? 'Processando...' : 'Validar prévia'}
          </Button>
          {preview?.valid && (
            <Button disabled={pending || !authorized} onClick={apply}>
              <FileUp size={15} />
              {demo ? 'Aplicar na demonstração' : 'Importar catálogo'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
