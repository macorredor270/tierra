import { expect, test, type Page } from '@playwright/test';

// Calidad baja y sin extras: el render por software de CI es lento
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'sistema-solar/graficos/v1',
      JSON.stringify({
        preset: 'low',
        renderScale: 0.6,
        dynamicResolution: false,
        msaa: 0,
        bloom: false,
        bloomStrength: 0.5,
        textures: 2,
        anisotropy: false,
        shadows: true,
        stars: true,
        starLimit: 5,
        smallDensity: 0.25,
        workers: false,
        smallGpu: true,
        cometTails: false,
        fpsCap: 0,
        showStats: false,
      }),
    ),
  );
});

/** Media de brillo del canvas: 0 si no se ha dibujado nada. */
async function canvasBrightness(page: Page): Promise<number> {
  const shot = await page.locator('canvas').first().screenshot();
  let sum = 0;
  for (let i = 0; i < shot.length; i += 97) sum += shot[i];
  return sum / (shot.length / 97);
}

test('portada: presenta el proyecto y calcula el tamaño de las texturas', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: /El sistema solar/ })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Alto/ })).toContainText('MB');
});

test('instala las texturas en caché y entra al simulador', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('radio', { name: /Medio/ }).click();
  await page.getByRole('button', { name: /Instalar texturas/ }).click();
  await expect(page.getByText(/Instaladas: calidad Medio/)).toBeVisible({ timeout: 90_000 });
  const cached = await page.evaluate(async () => (await (await caches.open('sistema-solar-assets-v1')).keys()).length);
  expect(cached).toBeGreaterThan(40);

  await page
    .getByRole('button', { name: /Entrar al simulador/ })
    .first()
    .click();
  await expect(page.getByText('EN VIVO')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  expect(await canvasBrightness(page)).toBeGreaterThan(2);
});

test('un enlace compartido abre el eclipse de 2026 enfocando la Tierra', async ({ page }) => {
  await page.goto('./?t=2026-08-12T17:46Z&focus=Tierra&dist=20000');
  await expect(page.locator('article h2', { hasText: 'Tierra' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('12/08/2026', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('PAUSA').first()).toBeVisible();
});

test('el calendario lista eclipses calculados y salta a ellos', async ({ page }) => {
  await page.goto('./?t=2026-01-01T00:00Z&focus=Sol');
  await expect(page.getByText('PAUSA').first()).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press('c');
  const eclipse = page.getByRole('button', { name: /Eclipse solar total/ }).first();
  await expect(eclipse).toBeVisible();
  await eclipse.click();
  await expect(page.getByText('12/08/2026').first()).toBeVisible();
});

test('el panel de gráficos muestra la GPU y los presets', async ({ page }) => {
  await page.goto('./#/simulador');
  await expect(page.getByText('EN VIVO')).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press('g');
  await expect(page.getByRole('heading', { name: 'Gráficos' })).toBeVisible();
  await expect(page.getByText('Núcleos CPU')).toBeVisible();
  await page.getByText('Mostrar rendimiento').click();
  await expect(page.getByText('FPS', { exact: true }).first()).toBeVisible();
});
