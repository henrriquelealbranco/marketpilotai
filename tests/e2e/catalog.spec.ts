import { expect, test } from '@playwright/test';

test('fornecedor, catálogo autorizado, produto, histórico e arquivamento persistentes', async ({
  page,
}) => {
  await page.goto('/signup');
  await page.getByLabel('Seu nome').fill('Operador catálogo');
  await page.getByLabel('Nome da operação').fill('Loja catálogo E2E');
  await page.getByLabel('E-mail', { exact: true }).fill(`e2e-catalog-${Date.now()}@example.test`);
  await page.getByLabel('Senha', { exact: true }).fill('Teste-seguro-123!');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByRole('link', { name: 'Fornecedores', exact: true }).first().click();
  await page.getByRole('button', { name: 'Novo fornecedor' }).click();
  await page.getByLabel('Nome do fornecedor').fill('Fornecedor E2E');
  await page.getByLabel('CNPJ (opcional)').fill('12.ABC.345/01DE-35');
  await page.getByRole('button', { name: 'Salvar cadastro' }).click();
  await expect(page.getByRole('heading', { name: 'Fornecedor E2E', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Importar catálogo', exact: true }).click();
  await page.getByLabel('Arquivo do catálogo').setInputFiles({
    name: 'catalogo-e2e.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('sku;name;cost;stock;category\nE2E-001;Produto catálogo E2E;19,90;12;Casa'),
  });
  await page
    .getByRole('checkbox', { name: 'Confirmo que tenho autorização para utilizar este catálogo.' })
    .check();
  await page.getByRole('button', { name: 'Validar prévia', exact: true }).click();
  await expect(page.getByText('1 produto pronto para revisão')).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Importar catálogo', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('1 novo');
  await page.getByRole('link', { name: 'Produtos', exact: true }).first().click();
  await expect(page.getByText('Produto catálogo E2E', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Ver histórico de Produto catálogo E2E', exact: true })
    .click();
  await expect(
    page.getByRole('dialog').getByRole('cell', { name: 'R$ 19,90', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Editar Produto catálogo E2E', exact: true }).click();
  await page.getByLabel('Custo do produto (R$)', { exact: true }).fill('21,50');
  await page.getByRole('button', { name: 'Salvar cadastro' }).click();
  await expect(page.getByRole('cell', { name: /R\$ 21,50/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('cell', { name: /R\$ 21,50/ })).toBeVisible();
  await page.getByRole('button', { name: 'Arquivar Produto catálogo E2E' }).click();
  await expect(page.getByText('Produto catálogo E2E', { exact: true })).toHaveCount(0);
  await page.getByLabel('Status do catálogo').selectOption('ARCHIVED');
  await expect(page.getByText('Produto catálogo E2E', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reativar Produto catálogo E2E' }).click();
  await page.getByLabel('Status do catálogo').selectOption('ACTIVE');
  await expect(page.getByText('Produto catálogo E2E', { exact: true })).toBeVisible();
});

test('demonstração edita somente memória, filtra fornecedor e funciona no celular', async ({
  page,
}) => {
  const writes: string[] = [];
  page.on('request', (r) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method()) && !r.url().includes('/v1/demo/'))
      writes.push(r.url());
  });
  await page.goto('/demo/suppliers');
  await expect(
    page.getByRole('heading', { name: 'Nexo Distribuidora', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Editar Nexo Distribuidora', exact: true }).click();
  await page.getByLabel('Nome do fornecedor').fill('Nexo demonstração editada');
  await page.getByRole('button', { name: 'Salvar na demonstração' }).click();
  await expect(
    page.getByRole('heading', { name: 'Nexo demonstração editada', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Ver catálogo' }).first().click();
  await expect(page.getByText('Fone Bluetooth Wave Pro', { exact: true })).toBeVisible();
  await expect(page.getByText('Luminária de mesa Orbit', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByText('Nexo demonstração editada', { exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});
