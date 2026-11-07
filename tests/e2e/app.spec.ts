import { expect, test } from '@playwright/test';

test('demo filtra os valores, navega, troca tema e funciona em mobile', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await expect(page.getByTestId('demo-banner')).toBeVisible();
  const revenue = page.getByTestId('revenue');
  await expect(revenue).not.toHaveText('—');
  const before = await revenue.innerText();
  await page.getByRole('button', { name: '7 dias', exact: true }).click();
  await expect(revenue).not.toHaveText(before);
  await page.getByRole('button', { name: 'Alternar tema' }).click();
  await expect(page.locator('html')).toHaveClass(/light/);
  await page.getByRole('link', { name: 'Integrações', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Integrações', exact: true })).toBeVisible();
  await expect(page.getByText('Configuração pendente').first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Abrir navegação' }).click();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(failures).toEqual([]);
});

test('cadastro, configuração persistente, conta vazia e logout', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Seu nome').fill('Operador de teste');
  await page.getByLabel('Nome da operação').fill('Loja E2E');
  await page.getByLabel('E-mail', { exact: true }).fill(`e2e-${Date.now()}@example.test`);
  await page.getByLabel('Senha', { exact: true }).fill('Teste-seguro-123!');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId('revenue')).toHaveText(/0,00/);
  await expect(page.getByTestId('demo-banner')).toHaveCount(0);
  await page.getByRole('link', { name: 'Configurações', exact: true }).first().click();
  await page.getByLabel('Nome da operação').fill('Loja atualizada');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('status')).toContainText('Configurações salvas');
  await page.reload();
  await expect(page.getByLabel('Nome da operação')).toHaveValue('Loja atualizada');
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login$/);
});

test('central informa ausência de execuções, busca páginas e exporta dados identificados', async ({
  page,
}) => {
  await page.goto('/demo/operations');
  await expect(page.getByRole('progressbar')).toHaveCount(7);
  await expect(page.getByText('Apresentação interativa', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Simular análise', exact: true }).click();
  await page.getByRole('tab', { name: 'Agentes' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Atividades' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Decisões' }).click();
  await expect(page.getByText(/Potencial observado/)).toBeVisible();
  await page.getByRole('tab', { name: 'Aprovações' }).click();
  await expect(page.getByRole('button', { name: 'Aprovar ação', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Buscar página' }).fill('precificação');
  await page
    .getByRole('dialog')
    .getByRole('link', { name: /Precificação/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Precificação', exact: true })).toBeVisible();
  await page.goto('/demo');
  await expect(page.getByTestId('revenue')).not.toHaveText('—');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar dados' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toContain('demo-30dias.csv');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toContain('Simulado;');
});
