'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  Check,
  CircleAlert,
  Package,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import {
  calculatePricing,
  pricingInputSchema,
  scoreOpportunity,
  type CatalogPage,
  type Identity,
  type PricingBlockReason,
  type PricingInput,
  type ProductRow,
  type SupplierRow,
} from '@marketpilot/contracts';
import { api, daysLabel, money, number } from '@/lib/utils';
import { Button } from '../ui/button';
import { initialDemoCatalog } from '../catalog/demo-data';
import { parsePricingDecimal } from './form';
import styles from './pricing.module.css';

const costs = [
  ['supplierCostCents', 'Custo do fornecedor'],
  ['shippingCostCents', 'Frete por unidade'],
  ['packagingCostCents', 'Embalagem'],
  ['fixedFeeCents', 'Tarifa fixa por venda'],
  ['operatingCostCents', 'Despesa operacional por unidade'],
] as const;
const rates = [
  ['commissionBps', 'Comissão'],
  ['taxBps', 'Impostos'],
  ['advertisingBps', 'Publicidade'],
  ['returnsBps', 'Reserva para devoluções'],
] as const;
const margins = [
  ['targetMarginBps', 'Margem alvo'],
  ['minimumMarginBps', 'Margem mínima'],
] as const;
type Field = Exclude<keyof PricingInput, 'salePriceCents'>;
type FormValues = Record<Field | 'salePriceCents', string>;
const ratio = (value: number | null) =>
  value === null ? '—' : `${(value / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const amount = (value: number | null) => (value === null ? '—' : money(value));
const blockLabels: Record<PricingBlockReason, string> = {
  RATES_EXHAUST_REVENUE: 'As taxas consomem 100% ou mais da receita.',
  TARGET_MARGIN_UNREACHABLE: 'As taxas e a margem alvo não deixam espaço para os custos.',
  NO_PROFIT: 'O preço avaliado não deixa lucro.',
  BELOW_MINIMUM_MARGIN: 'O preço avaliado fica abaixo da margem mínima.',
};

export function PricingWorkspace({ demo }: { demo: boolean }) {
  const [selectedId, setSelectedId] = useState('');
  const local = useQuery({
    queryKey: ['demo-catalog'],
    queryFn: initialDemoCatalog,
    enabled: demo,
    staleTime: Infinity,
  });
  const remote = useQuery({
    queryKey: ['pricing', 'products'],
    queryFn: () => api<CatalogPage<ProductRow>>('/v1/products?pageSize=100'),
    enabled: !demo,
  });
  const supplierQuery = useQuery({
    queryKey: ['catalog', 'supplier-options'],
    queryFn: () => api<CatalogPage<SupplierRow>>('/v1/suppliers?status=ACTIVE&pageSize=100'),
    enabled: !demo,
  });
  const identity = useQuery({
    queryKey: ['identity'],
    queryFn: () => api<Identity>('/v1/auth/me'),
    enabled: !demo,
  });
  const products =
    (demo ? local.data?.products : remote.data?.items)?.filter(
      (product) => product.status === 'ACTIVE' && product.supplier.status === 'ACTIVE',
    ) ?? [];
  const product = products.find((entry) => entry.id === selectedId) ?? products[0];
  const suppliers = demo ? local.data?.suppliers : supplierQuery.data?.items;
  const supplier = suppliers?.find((entry) => entry.id === product?.supplierId);
  const pending = demo ? local.isPending : remote.isPending;
  const error = demo ? local.error : remote.error;
  const base = demo ? '/demo' : '/app';
  const canWrite = !demo && ['ADMIN', 'OPERATOR'].includes(identity.data?.user.role ?? '');

  return (
    <div className={styles.workspace}>
      <Link className="back-link" href={base}>
        <ArrowLeft size={14} />
        Visão geral
      </Link>
      <div className="page-heading">
        <div>
          <div className="page-eyebrow">
            <Calculator size={14} />
            OPERAÇÃO · PRECIFICAÇÃO
          </div>
          <h1>
            Precificação
            <span className="heading-dot" aria-hidden="true">
              .
            </span>
          </h1>
          <p>Do custo ao lucro. Entenda o espaço de cada venda.</p>
        </div>
        <span className="source-label">{demo ? 'Demonstração' : 'Conta atual'}</span>
      </div>
      <p className={styles.contextNote}>
        <ShieldCheck size={16} />
        {demo
          ? 'Demonstração: produtos e percentuais fictícios. Os cálculos são reais e nada é salvo.'
          : 'As taxas são informadas por você, conforme seu contrato. Nenhuma tarifa oficial é presumida.'}
      </p>
      {pending ? (
        <div className="panel loading-panel" role="status">
          Carregando produtos para precificar...
        </div>
      ) : error ? (
        <div className={styles.empty} role="alert">
          <CircleAlert size={28} />
          <h2>Não foi possível carregar o catálogo</h2>
          <p>{error.message}</p>
          <Button
            variant="outline"
            onClick={() => void (demo ? local.refetch() : remote.refetch())}
          >
            Tentar novamente
          </Button>
        </div>
      ) : !product ? (
        <section className={`panel ${styles.empty}`}>
          <Package size={32} />
          <h2>Comece com um produto</h2>
          <p>Adicione um produto e mantenha seu fornecedor ativo para calcular custos e margens.</p>
          <Button asChild>
            <Link href={`${base}/products`}>
              Abrir produtos
              <ArrowRight size={16} />
            </Link>
          </Button>
        </section>
      ) : (
        <>
          <section className={`panel ${styles.productBar}`} aria-label="Produto selecionado">
            <span className={styles.productIcon}>
              <Package size={21} />
            </span>
            <label className={styles.productSelect}>
              <span>Produto do catálogo</span>
              <select value={product.id} onChange={(event) => setSelectedId(event.target.value)}>
                {products.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} · {entry.sku}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.productMeta}>
              <span>{product.supplier.name}</span>
              <strong>
                {number(product.stock)} em estoque <i aria-hidden="true">·</i>{' '}
                {daysLabel(product.shippingDays)}
              </strong>
            </div>
          </section>
          {!demo && remote.data && remote.data.total > 100 && (
            <p className={styles.contextNote}>
              Exibindo os primeiros 100 produtos. Abra o catálogo para consultar os demais.
            </p>
          )}
          <PricingCalculator
            key={`${product.id}-${product.version}`}
            product={product}
            supplierRating={supplier?.rating || null}
            demo={demo}
            canWrite={canWrite}
          />
        </>
      )}
    </div>
  );
}

function initialValues(product: ProductRow, demo: boolean): FormValues {
  return {
    supplierCostCents: (product.costCents / 100).toFixed(2),
    shippingCostCents: (product.shippingCostCents / 100).toFixed(2),
    packagingCostCents: demo ? '3.00' : '0.00',
    fixedFeeCents: demo ? '5.00' : '0.00',
    operatingCostCents: demo ? '2.00' : '0.00',
    commissionBps: demo ? '12' : '0',
    taxBps: demo ? '6' : '0',
    advertisingBps: demo ? '5' : '0',
    returnsBps: demo ? '2' : '0',
    targetMarginBps: '25',
    minimumMarginBps: '10',
    salePriceCents: '',
  };
}

function PricingCalculator({
  product,
  supplierRating,
  demo,
  canWrite,
}: {
  product: ProductRow;
  supplierRating: number | null;
  demo: boolean;
  canWrite: boolean;
}) {
  const [values, setValues] = useState(() => initialValues(product, demo));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const decimalFields = [...costs, ...rates, ...margins];
  const parsed = pricingInputSchema.safeParse({
    ...Object.fromEntries(decimalFields.map(([key]) => [key, parsePricingDecimal(values[key])])),
    ...(values.salePriceCents.trim()
      ? { salePriceCents: parsePricingDecimal(values.salePriceCents) }
      : {}),
  });
  const result = parsed.success ? calculatePricing(parsed.data) : null;
  const fieldErrors = parsed.success
    ? []
    : parsed.error.issues.map((issue) => String(issue.path[0]));
  const invalidDecimal =
    decimalFields.some(([key]) => parsePricingDecimal(values[key]) === null) ||
    (values.salePriceCents.trim() !== '' && parsePricingDecimal(values.salePriceCents) === null);
  const validationMessage = parsed.success
    ? ''
    : invalidDecimal
      ? 'Preencha os valores com até duas casas decimais, sem sinal ou separador de milhar.'
      : parsed.error.issues.some(
            (issue) => issue.path[0] === 'minimumMarginBps' && issue.code === 'custom',
          )
        ? 'A margem mínima deve ser menor ou igual à margem alvo.'
        : 'Informe custo do fornecedor maior que zero, custos até R$ 999.999,99 e percentuais entre 0% e 100% (margens até 99,99%).';
  const completeFields = [
    product.name,
    product.sku,
    product.category,
    product.sourceUrl,
    product.updatedAt,
  ].filter(Boolean).length;
  const opportunity = scoreOpportunity({
    marginBps: result?.marginBps ?? null,
    minimumMarginBps: parsed.success ? parsed.data.minimumMarginBps : 0,
    stock: product.stock,
    shippingDays: product.shippingDays,
    catalogQualityBps: completeFields * 2000,
    supplierRating,
  });
  function change(key: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setMessage('');
    setSaveError('');
  }
  async function save() {
    if (demo || !canWrite || !parsed.success || result?.blocked || saving) return;
    setSaving(true);
    setSaveError('');
    setMessage('');
    try {
      await api('/v1/pricing/quotes', {
        method: 'POST',
        body: JSON.stringify({ productId: product.id, input: parsed.data }),
      });
      setMessage('Cotação salva com os custos e percentuais desta simulação.');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar a cotação.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={styles.calculatorGrid}>
        <section className={`panel ${styles.inputs}`} aria-labelledby="pricing-input-title">
          <div className={styles.sectionHeading}>
            <div>
              <SlidersHorizontal size={17} />
              <h2 id="pricing-input-title">Composição da venda</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setValues(initialValues(product, demo));
                setMessage('');
                setSaveError('');
              }}
            >
              <RotateCcw size={13} />
              Restaurar
            </Button>
          </div>
          <p className={styles.help}>
            Valores por unidade. Alterar aqui cria uma simulação e preserva o cadastro do produto.
          </p>
          <fieldset className={styles.fieldset}>
            <legend>Custos fixos por unidade</legend>
            <div className={styles.fields}>
              {costs.map(([key, label]) => (
                <DecimalField
                  key={key}
                  id={key}
                  label={label}
                  unit="R$"
                  value={values[key]}
                  invalid={fieldErrors.includes(key)}
                  onChange={(value) => change(key, value)}
                />
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.fieldset}>
            <legend>Percentuais sobre o preço de venda</legend>
            <p className={styles.help}>
              {demo
                ? 'Hipóteses ilustrativas; edite para experimentar.'
                : 'Os percentuais começam em zero. Preencha as taxas aplicáveis à sua venda.'}
            </p>
            <div className={styles.fields}>
              {rates.map(([key, label]) => (
                <DecimalField
                  key={key}
                  id={key}
                  label={label}
                  unit="%"
                  value={values[key]}
                  invalid={fieldErrors.includes(key)}
                  onChange={(value) => change(key, value)}
                />
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.fieldset}>
            <legend>Margem e preço</legend>
            <div className={styles.fields}>
              {margins.map(([key, label]) => (
                <DecimalField
                  key={key}
                  id={key}
                  label={label}
                  unit="%"
                  value={values[key]}
                  invalid={fieldErrors.includes(key)}
                  onChange={(value) => change(key, value)}
                />
              ))}
              <div className={styles.fullWidth}>
                <DecimalField
                  id="salePriceCents"
                  label="Preço para avaliar (opcional)"
                  unit="R$"
                  value={values.salePriceCents}
                  invalid={fieldErrors.includes('salePriceCents')}
                  placeholder="Usar preço recomendado"
                  onChange={(value) => change('salePriceCents', value)}
                />
              </div>
            </div>
          </fieldset>
          {validationMessage && (
            <p className={styles.validation} role="alert">
              <CircleAlert size={15} />
              {validationMessage}
            </p>
          )}
        </section>

        <div className={styles.results}>
          <section className={`panel ${styles.quote}`} aria-labelledby="pricing-result-title">
            <div className={styles.resultHeading}>
              <Calculator size={18} />
              <h2 id="pricing-result-title">Preço recomendado</h2>
            </div>
            <div className={styles.recommended}>
              {amount(result?.recommendedPriceCents ?? null)}
            </div>
            <p className={styles.help}>
              Para uma margem alvo de {ratio(parsed.success ? parsed.data.targetMarginBps : null)}{' '}
              sobre a receita.
            </p>
            <div className={styles.priceMarkers}>
              <div>
                <span>Ponto de equilíbrio</span>
                <strong>{amount(result?.breakEvenPriceCents ?? null)}</strong>
              </div>
              <div>
                <span>Preço com margem mínima</span>
                <strong>{amount(result?.minimumMarginPriceCents ?? null)}</strong>
              </div>
            </div>
            <div className={styles.evaluated}>
              <span>Preço avaliado</span>
              <strong>{amount(result?.evaluatedPriceCents ?? null)}</strong>
            </div>
            <div className={styles.metrics}>
              <div>
                <span>Lucro estimado / unidade</span>
                <strong>{amount(result?.estimatedProfitCents ?? null)}</strong>
              </div>
              <div>
                <span>Margem sobre receita</span>
                <strong>{ratio(result?.marginBps ?? null)}</strong>
              </div>
              <div>
                <span>ROI sobre custo total</span>
                <strong>{ratio(result?.roiBps ?? null)}</strong>
              </div>
            </div>
            {result ? (
              <div className={result.blocked ? styles.blocked : styles.viable} role="status">
                {result.blocked ? <CircleAlert size={17} /> : <Check size={17} />}
                <div>
                  <strong>{result.blocked ? 'Cotação bloqueada' : 'Margem mínima atendida'}</strong>
                  {result.blocked ? (
                    result.blockReasons.map((reason) => <p key={reason}>{blockLabels[reason]}</p>)
                  ) : (
                    <p>Confira os custos e as hipóteses antes de usar este preço.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className={styles.help}>Complete os valores para calcular a cotação.</p>
            )}
            <Button
              className={styles.save}
              onClick={() => void save()}
              disabled={demo || !canWrite || !result || result.blocked || saving}
            >
              <Save size={15} />
              {saving ? 'Salvando...' : demo ? 'Demonstração sem gravação' : 'Salvar cotação'}
            </Button>
            {!demo && !canWrite && (
              <p className={styles.help}>Administradores e operadores podem salvar cotações.</p>
            )}
            {message && (
              <p className={styles.saved} role="status">
                <Check size={14} />
                {message}
              </p>
            )}
            {saveError && (
              <p className={styles.validation} role="alert">
                {saveError}
              </p>
            )}
          </section>

          <section
            className={`panel ${styles.waterfall}`}
            aria-labelledby="pricing-breakdown-title"
          >
            <h2 id="pricing-breakdown-title">Para onde vai o preço</h2>
            <dl>
              <div>
                <dt>Custos fixos por unidade</dt>
                <dd>{amount(result?.fixedCostCents ?? null)}</dd>
              </div>
              <div>
                <dt>
                  Taxas variáveis <span>({ratio(result?.totalRateBps ?? null)})</span>
                </dt>
                <dd>{amount(result?.variableCostCents ?? null)}</dd>
              </div>
              <div>
                <dt>Lucro estimado</dt>
                <dd>{amount(result?.estimatedProfitCents ?? null)}</dd>
              </div>
              <div>
                <dt>Preço de venda</dt>
                <dd>{amount(result?.evaluatedPriceCents ?? null)}</dd>
              </div>
            </dl>
            <p className={styles.help}>
              Lucro após os custos informados. A despesa operacional deve ser rateada por unidade; o
              ROI usa o custo total da venda.
            </p>
          </section>
        </div>
      </div>

      <section className={`panel ${styles.scenarios}`} aria-labelledby="pricing-scenarios-title">
        <div className={styles.sectionHeading}>
          <div>
            <TrendingUp size={18} />
            <h2 id="pricing-scenarios-title">Sensibilidade de preço</h2>
          </div>
          <span>Custos e taxas constantes</span>
        </div>
        <p className={styles.help}>
          Compare uma variação de 10% no preço avaliado. Cada cenário usa o mesmo motor financeiro.
        </p>
        {result?.scenarios.length ? (
          <div className={styles.scenarioGrid}>
            {result.scenarios.map((scenario) => (
              <article
                key={scenario.adjustmentBps}
                className={scenario.adjustmentBps === 0 ? styles.baseScenario : ''}
              >
                <div className={styles.scenarioTop}>
                  <h3>
                    {scenario.adjustmentBps < 0
                      ? 'Preço −10%'
                      : scenario.adjustmentBps > 0
                        ? 'Preço +10%'
                        : 'Preço base'}
                  </h3>
                  <span className={scenario.blocked ? styles.warningPill : styles.successPill}>
                    {scenario.blocked ? 'Abaixo do limite' : 'Margem atendida'}
                  </span>
                </div>
                <strong className={styles.scenarioPrice}>{money(scenario.priceCents)}</strong>
                <dl>
                  <div>
                    <dt>Lucro por unidade</dt>
                    <dd>{money(scenario.estimatedProfitCents)}</dd>
                  </div>
                  <div>
                    <dt>Margem</dt>
                    <dd>{ratio(scenario.marginBps)}</dd>
                  </div>
                  <div>
                    <dt>ROI</dt>
                    <dd>{ratio(scenario.roiBps)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.scenarioEmpty}>
            Os cenários aparecem quando existe um preço calculável.
          </p>
        )}
      </section>

      <section className={`panel ${styles.opportunity}`} aria-labelledby="opportunity-title">
        <div className={styles.opportunityScore}>
          <span>Score operacional</span>
          <strong>
            {opportunity.score}
            <small>/100</small>
          </strong>
          <span>
            {opportunity.eligible && !result?.blocked
              ? 'Elegível para análise'
              : 'Revisão necessária'}
          </span>
        </div>
        <div className={styles.opportunityBody}>
          <h2 id="opportunity-title">Oportunidade com evidências</h2>
          <p className={styles.help}>
            Triagem por margem, estoque, prazo, completude do catálogo e avaliação interna. O score
            não prevê vendas.
          </p>
          <div className={styles.evidenceGrid}>
            <span>
              Estoque<strong>{number(product.stock)} unidades</strong>
            </span>
            <span>
              Prazo<strong>{daysLabel(product.shippingDays)}</strong>
            </span>
            <span>
              Completude<strong>{completeFields}/5 campos</strong>
            </span>
            <span>
              Avaliação interna
              <strong>{supplierRating === null ? 'Desconhecida' : `${supplierRating}/5`}</strong>
            </span>
          </div>
          <p className={styles.unknown}>
            Demanda: desconhecida <i aria-hidden="true">·</i> Concorrência: desconhecida
          </p>
          <p className={styles.help}>
            Completude: nome, SKU, categoria, referência de origem e data. Cobertura operacional:{' '}
            {ratio(opportunity.evidenceCoverageBps)}.
          </p>
        </div>
      </section>
      <p className={styles.footer}>
        <ShieldCheck size={15} />
        Cálculo em centavos e percentuais exatos. Custos variáveis e preços arredondados para cima;
        margens e ROI arredondados para baixo.
      </p>
    </>
  );
}

function DecimalField({
  id,
  label,
  unit,
  value,
  invalid,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  invalid: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field} htmlFor={`pricing-${id}`}>
      <span>{label}</span>
      <span className={styles.inputWrap}>
        <span aria-hidden="true">{unit}</span>
        <input
          id={`pricing-${id}`}
          type="text"
          inputMode="decimal"
          value={value}
          maxLength={15}
          aria-invalid={invalid}
          placeholder={placeholder ?? '0,00'}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}
