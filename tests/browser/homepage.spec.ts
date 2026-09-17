import { test, expect } from '@playwright/test';

test('play action stays above the fold at phone and desktop widths', async ({ page }) => {
  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const box = await page.locator('.hero-play').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.locator('.game-demo [data-card]')).toHaveCount(26);
  }
});

test('full match uses persistent moving cards, pauses, ends and loops', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.locator('.game-demo').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Pause demo', exact: true }).click();
  await page.getByRole('button', { name: 'Restart demo', exact: true }).click();
  await page.evaluate(() => {
    (window as Window & { originalDemoCard?: Element }).originalDemoCard = document.querySelector('[data-card="0:13"]')!;
  });
  await page.getByRole('button', { name: 'Play demo', exact: true }).click();
  await page.clock.runFor(1700);
  const card = page.locator('[data-card="0:13"]');
  const moving = await card.getAttribute('transform');
  await page.clock.runFor(180);
  expect(await card.getAttribute('transform')).not.toBe(moving);
  expect(await card.evaluate(node => getComputedStyle(node).opacity)).toBe('1');
  expect(await page.evaluate(() => (window as Window & { originalDemoCard?: Element }).originalDemoCard === document.querySelector('[data-card="0:13"]'))).toBe(true);
  await page.getByRole('button', { name: 'Pause demo', exact: true }).click();
  const paused = await card.getAttribute('transform');
  await page.clock.runFor(2000);
  expect(await card.getAttribute('transform')).toBe(paused);
  await page.getByRole('button', { name: 'Restart demo', exact: true }).click();
  await page.getByRole('button', { name: 'Play demo', exact: true }).click();
  await page.clock.runFor(47000);
  await expect(page.locator('.game-demo')).toHaveAttribute('data-phase', 'winner');
  await expect(page.locator('[data-score="0"]')).toHaveText('10');
  await expect(page.locator('[data-score="1"]')).toHaveText('8');
  await page.clock.runFor(4300);
  await expect(page.locator('.game-demo')).toHaveAttribute('data-turn', '1');
  await expect(page.locator('[data-score="0"]')).toHaveText('0');
});

test('reduced motion starts still and can be stepped through all twelve turns', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/');
  const demo = page.locator('.game-demo');
  await expect(demo).toHaveAttribute('data-paused', 'true');
  await expect(demo).toHaveAttribute('data-turn', '4');
  const before = await demo.innerHTML();
  await page.clock.runFor(60000);
  expect(await demo.innerHTML()).toBe(before);
  await page.getByRole('button', { name: 'Restart demo', exact: true }).click();
  for (let turn = 1; turn <= 12; turn++) {
    await page.getByRole('button', { name: 'Next demo turn', exact: true }).click();
    await expect(demo).toHaveAttribute('data-turn', String(turn));
  }
  await page.getByRole('button', { name: 'Next demo turn', exact: true }).click();
  await expect(demo).toHaveAttribute('data-turn', '0');
});
