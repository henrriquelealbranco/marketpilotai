import { expect, test } from '@playwright/test';
test('operação real: catálogo, cotação, agente, pedido, relatório e aprovação', async ({
  page,
}) => {
  test.setTimeout(180000);
  const origin = 'http://localhost:3000';
  const post = async (path: string, input: unknown) => {
    const response = await page.request.post(`/api/v1${path}`, {
      headers: { origin },
      data: input,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  await post('/auth/register', {
    email: `e2e-ops-${Date.now()}@example.test`,
    password: 'Teste-seguro-123!',
    name: 'Operador E2E',
    workspaceName: 'Operação financeira E2E',
  });
  const supplier = await post('/suppliers', { name: 'Fornecedor financeiro E2E' });
  const product = await post('/products', {
    supplierId: supplier.id,
    sku: 'OPS-E2E',
    name: 'Produto financeiro E2E',
    costCents: 5000,
    stock: 20,
  });
  await page.goto('/app/pricing');
  await page.getByLabel('Produto do catálogo').selectOption(product.id);
  await page.getByRole('textbox', { name: 'Comissão', exact: true }).fill('10');
  await page
    .getByRole('textbox', { name: 'Preço para avaliar (opcional)', exact: true })
    .fill('100');
  await page.getByRole('button', { name: 'Salvar cotação', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cotação salva' })).toBeVisible();
  await page.goto('/app/operations');
  await page.getByRole('button', { name: 'Executar análise', exact: true }).first().click();
  await expect(page.getByText('Solicitação registrada.', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Decisões', exact: true }).click();
  await expect(page.getByText('Produto financeiro E2E:', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Aprovar recomendação' }).click();
  await expect(page.getByText('Aprovado', { exact: true }).first()).toBeVisible();
  await page.goto('/app/orders');
  await page.getByRole('button', { name: 'Registrar pedido', exact: true }).click();
  await page.getByRole('combobox', { name: 'Produto', exact: true }).selectOption(product.id);
  await page.getByLabel('Identificador do pedido').fill('E2E-ORDER-1');
  await page.getByLabel('Valor total (R$)').fill('100');
  await page.getByLabel('Custo total, incluindo taxas e frete (R$)').fill('70');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('delivered');
  await page.getByLabel('Custos completos conferidos').check();
  await page.getByRole('button', { name: 'Salvar pedido', exact: true }).click();
  await expect(page.getByText('E2E-ORDER-1', { exact: true })).toBeVisible();
  await page.goto('/app/analytics');
  await expect(page.getByText('R$ 30,00', { exact: true }).first()).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Exportar PDF', exact: true }).click();
  expect((await download).suggestedFilename()).toContain('.pdf');
  await post('/listings', {
    productId: product.id,
    title: 'Produto financeiro E2E autorizado',
    priceCents: 10000,
    stock: 2,
    categoryId: 'MLB123',
    listingTypeId: 'gold_special',
    pictures: ['https://example.test/image.jpg'],
  });
  await page.goto('/app/listings');
  await page.getByRole('button', { name: 'Solicitar aprovação', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Alteração registrada');
  await page.goto('/app/operations');
  await page.getByRole('tab', { name: /Aprovações/ }).click();
  await page.getByRole('button', { name: 'Aprovar ação', exact: true }).click();
  await page.getByRole('button', { name: 'Executar ação aprovada', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Conecte uma conta Mercado Livre' }),
  ).toBeVisible();
});
test('demonstração navega por todas as áreas sem endpoints privados', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  const privateRequests: string[] = [];
  page.on('request', (r) => {
    if (
      r.url().includes('/api/v1/') &&
      !r.url().includes('/api/v1/demo/') &&
      !r.url().includes('/api/v1/config')
    )
      privateRequests.push(r.url());
  });
  for (const section of [
    'hunter',
    'market',
    'pricing',
    'listings',
    'orders',
    'agents',
    'automations',
    'analytics',
    'alerts',
    'assistant',
    'integrations',
  ]) {
    await page.goto(`/demo/${section}`);
    await expect(page.getByTestId('demo-banner')).toBeVisible();
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByText('Esta área será implementada', { exact: false })).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo/automations');
  await page.getByRole('button', { name: 'Simular', exact: true }).first().click();
  await expect(page.getByText('Concluído', { exact: true }).first()).toBeVisible();
  await page.goto('/demo/operations');
  await page.getByRole('button', { name: 'Simular análise', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('tab', { name: 'Aprovações (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Aprovar ação', exact: true }).click();
  await page.getByRole('button', { name: 'Simular execução aprovada' }).click();
  await expect(page.getByText('Executado', { exact: true })).toBeVisible();
  expect(privateRequests).toEqual([]);
  expect(failures).toEqual([]);
});
test('landing usa captura real, marca e navegação para demonstração', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Sua operação/ })).toBeVisible();
  await expect(
    page.getByAltText('Captura real da central de operações MarketPilot AI em modo demonstração'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Explorar demonstração', exact: false }).first().click();
  await expect(page).toHaveURL(/\/demo$/);
});
