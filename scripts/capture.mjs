import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
await page.goto('http://localhost:3000/demo');
await page.getByTestId('revenue').filter({ hasNotText: '—' }).waitFor();
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'docs/screenshots/dashboard-dark.png', fullPage: true });
console.log(
  await page.evaluate(() => ({
    font: getComputedStyle(document.body).fontFamily,
    primary: getComputedStyle(document.documentElement).getPropertyValue('--brand-primary'),
    width: window.innerWidth,
    content: document.documentElement.scrollWidth,
  })),
);
await page.goto('http://localhost:3000/demo/operations');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'docs/screenshots/operations-dark.png', fullPage: true });
await page.goto('http://localhost:3000/demo/products');
await page.getByText('Fone Bluetooth Wave Pro', { exact: true }).waitFor();
await page.screenshot({ path: 'docs/screenshots/products-dark.png', fullPage: true });
await page.goto('http://localhost:3000/demo/suppliers');
await page.getByRole('heading', { name: 'Nexo Distribuidora', exact: true }).waitFor();
await page.screenshot({ path: 'docs/screenshots/suppliers-dark.png', fullPage: true });
await page.goto('http://localhost:3000/login');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'docs/screenshots/login-dark.png', fullPage: true });
await page.goto('http://localhost:3000/demo');
await page.getByTestId('revenue').filter({ hasNotText: '—' }).waitFor();
await page.getByRole('button', { name: 'Alternar tema' }).click();
await page.screenshot({ path: 'docs/screenshots/dashboard-light.png', fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: 'docs/screenshots/dashboard-mobile.png', fullPage: true });
await page.goto('http://localhost:3000/demo/products');
await page.getByText('Fone Bluetooth Wave Pro', { exact: true }).waitFor();
await page.screenshot({ path: 'docs/screenshots/products-mobile.png', fullPage: true });
await browser.close();
