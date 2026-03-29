import { test, expect } from '@playwright/test';

test.describe('RaceTrack Game', () => {
  test('home screen loads with buttons', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await expect(page.locator('#screen-home')).toBeVisible();
    await expect(page.locator('#btn-create')).toBeVisible();
    await expect(page.locator('#btn-join')).toBeVisible();
    await expect(page.locator('#btn-shop')).toBeVisible();
    await expect(page.locator('#btn-profile')).toBeVisible();
  });

  test('screen navigation works', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.click('#btn-shop');
    await expect(page.locator('#screen-shop')).toBeVisible();
    await page.click('#btn-shop-back');
    await expect(page.locator('#screen-home')).toBeVisible();
  });

  test('physics module is exposed and works', async ({ page }) => {
    await page.goto('http://localhost:3000');
    const result = await page.evaluate(() => {
      const { calculateNewPosition } = (window as any).RaceTrack.physics;
      return calculateNewPosition({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0 });
    });
    expect(result.newPosition).toEqual({ x: 1, y: 1 });
  });

  test('circuit generation produces valid circuit', async ({ page }) => {
    await page.goto('http://localhost:3000');
    const result = await page.evaluate(() => {
      const { generateCircuit, validateCircuit } = (window as any).RaceTrack.circuit;
      const c = generateCircuit(30, 40);
      return { valid: validateCircuit(c), hasStart: c.startPositions.length >= 2 };
    });
    expect(result.valid).toBe(true);
    expect(result.hasStart).toBe(true);
  });
});
