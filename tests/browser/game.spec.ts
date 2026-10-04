import { test, expect, type Page } from '@playwright/test';

async function idle(page: Page) {
  await expect(page.locator('.table')).not.toHaveClass(/busy/);
}
async function deploy(page: Page, card: string, front: string) {
  await page.getByRole('button', { name: `${card} in your hand`, exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${front} front`) }).click();
  await page.getByRole('button', { name: 'Lock in', exact: true }).click();
}
async function turn(page: Page, n: number) {
  await idle(page);
  await expect(page.locator('.stakes')).toContainText(`Turn ${n} of 12`);
}

test('solo game: deploy, shift, recall, scoring, resume and a full game', async ({ page }) => {
  test.setTimeout(150000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Easy', exact: true }).click();
  await page.getByRole('button', { name: 'Play the computer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lock in', exact: true })).toBeDisabled();
  await deploy(page, 'King', 'Left');
  await turn(page, 2);
  await page.getByRole('button', { name: 'Your King on Left', exact: true }).click();
  await expect(page.locator('.command')).toContainText('pays your lowest card');
  await page.getByRole('button', { name: /^Middle front/ }).click();
  await page.getByRole('button', { name: 'Lock in', exact: true }).click();
  await turn(page, 3);
  await expect(page.getByRole('button', { name: 'Ace in your hand', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Your King on Middle', exact: true }).click();
  await page.getByRole('button', { name: 'Recall', exact: true }).click();
  await page.getByRole('button', { name: 'Lock in', exact: true }).click();
  await turn(page, 4);
  await expect(page.getByRole('button', { name: 'King in your hand', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '2 in your hand', exact: true })).toHaveCount(0);
  await expect(page.locator('.stakes')).toContainText('scores 2 per front');
  await deploy(page, 'King', 'Right');
  await turn(page, 5);
  await page.getByRole('button', { name: 'Moves so far', exact: true }).click();
  await expect(page.locator('.log')).toContainText('Deploy K to Right');
  await page.reload();
  await expect(page.locator('.home')).toBeVisible();
  await page.getByRole('button', { name: /Continue your game against the computer/ }).click();
  await turn(page, 5);
  await page.getByRole('button', { name: 'Rules', exact: true }).click();
  await expect(page.locator('dialog[open]')).toContainText('nothing else is removed');
  await page.getByRole('button', { name: 'Close the rules' }).click();
  for (let t = 5; t <= 12; t++) {
    await page.locator('.in-hand:enabled').first().click();
    await page.getByRole('button', { name: /^Left front/ }).click();
    await page.getByRole('button', { name: 'Lock in', exact: true }).click();
    if (t < 12) await turn(page, t + 1);
  }
  await expect(page.locator('.result')).toBeVisible();
  await expect(page.locator('.stakes')).toContainText('Final score');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Play again', exact: true }).click();
  await turn(page, 1);
});

test('online table hides pending orders and both seats can rejoin', async ({ browser }) => {
  test.setTimeout(90000);
  const a = await browser.newContext();
  const b = await browser.newContext();
  const host = await a.newPage();
  const guest = await b.newPage();
  try {
    await host.goto('http://127.0.0.1:4173/');
    await host.getByRole('button', { name: 'Play a friend online', exact: true }).click();
    const invitation = await host.getByRole('textbox', { name: 'Invitation link', exact: true }).inputValue();
    await guest.goto(invitation);
    await guest.getByRole('button', { name: 'Join the game', exact: true }).click();
    await expect(host.getByRole('textbox', { name: 'Invitation link' })).toHaveCount(0);
    await deploy(host, 'King', 'Left');
    await expect(host.locator('.command')).toContainText('Waiting for your friend');
    await expect(guest.locator('.pile.theirs .placed')).toHaveCount(0);
    await expect(guest.getByRole('button', { name: 'Moves so far', exact: true })).toHaveCount(0);
    await expect(guest.locator('.log li:not(.head)')).toHaveCount(0);
    await deploy(guest, 'Queen', 'Middle');
    await turn(host, 2); await turn(guest, 2);
    await host.getByRole('button', { name: 'Moves so far', exact: true }).click();
    await expect(host.locator('.log')).toContainText('Deploy K to Left');
    await guest.getByRole('button', { name: 'Moves so far', exact: true }).click();
    await expect(guest.locator('.log')).toContainText('Deploy K to Left');
    await host.reload(); await guest.reload();
    for (const page of [host, guest]) {
      await expect(page.locator('.home')).toBeVisible();
      await page.getByRole('button', { name: 'Rejoin your online table', exact: true }).click();
      await turn(page, 2);
    }
    await host.getByRole('button', { name: 'Reconnect', exact: true }).click();
    await deploy(host, 'Jack', 'Middle');
    await deploy(guest, 'King', 'Right');
    await turn(host, 3); await turn(guest, 3);
  } finally { await a.close(); await b.close(); }
});

test('pass and play keeps both orders private until the reveal', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pass and play on this device', exact: true }).click();
  await expect(page.locator('.center')).toContainText('Player 1');
  await page.getByRole('button', { name: /I’m Player 1/ }).click();
  await deploy(page, 'King', 'Left');
  await expect(page.locator('.center')).toContainText('Player 2');
  await expect(page.locator('.center')).not.toContainText('King');
  await page.getByRole('button', { name: /I’m Player 2/ }).click();
  await expect(page.locator('.pile .placed')).toHaveCount(0);
  await deploy(page, 'Queen', 'Middle');
  await page.getByRole('button', { name: 'Reveal both orders', exact: true }).click();
  await idle(page);
  await expect(page.locator('.pile .placed')).toHaveCount(2);
  await page.getByRole('button', { name: 'Next turn', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /Continue your pass-and-play game/ }).click();
  await page.getByRole('button', { name: /I’m Player 1/ }).click();
  await turn(page, 2);
  await page.getByRole('button', { name: 'Moves so far', exact: true }).click();
  await expect(page.locator('.log')).toContainText('Deploy K to Left');
});

test('a missing table and a failed room service leave solo play available', async ({ page }) => {
  await page.goto(`/#/join/does-not-exist/${'a'.repeat(64)}`);
  await page.getByRole('button', { name: 'Join the game', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/missing|expired|access/);
  await page.getByRole('button', { name: /Back to the start screen/ }).click();
  await page.route('**/api/rooms', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Table service unavailable' }) }));
  await page.getByRole('button', { name: 'Play a friend online', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('unavailable');
  await page.getByRole('button', { name: 'Play the computer', exact: true }).click();
  await deploy(page, 'King', 'Left');
  await turn(page, 2);
  // An invitation opened in the same tab changes only the hash.
  await page.evaluate(() => { location.hash = `#/join/another-table/${'b'.repeat(64)}`; });
  await expect(page.getByRole('button', { name: 'Join the game', exact: true })).toBeVisible();
});

test('the guided lessons teach each order and end with the final-turn puzzle', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Learn by playing', exact: true }).click();
  await expect(page.locator('.lesson-head')).toContainText('Lesson 1 of 5');
  await page.getByRole('button', { name: 'King in your hand', exact: true }).click();
  await page.getByRole('button', { name: /^Left front/ }).click();
  await expect(page.locator('.command')).toContainText('Not this time');
  await deploy(page, '9', 'Middle');
  await idle(page);
  await page.getByRole('button', { name: 'Next lesson', exact: true }).click();
  await deploy(page, '3', 'Right');
  await idle(page);
  await page.getByRole('button', { name: 'Next lesson', exact: true }).click();
  await page.getByRole('button', { name: 'Your 7 on Middle', exact: true }).click();
  await page.getByRole('button', { name: /^Right front/ }).click();
  await page.getByRole('button', { name: 'Lock in', exact: true }).click();
  await idle(page);
  await page.getByRole('button', { name: 'Next lesson', exact: true }).click();
  await page.getByRole('button', { name: 'Your King on Right', exact: true }).click();
  await page.getByRole('button', { name: 'Recall', exact: true }).click();
  await page.getByRole('button', { name: 'Lock in', exact: true }).click();
  await idle(page);
  await page.getByRole('button', { name: 'Next lesson', exact: true }).click();
  await page.getByRole('button', { name: 'Your 6 on Middle', exact: true }).click();
  await page.getByRole('button', { name: /^Left front/ }).click();
  await page.getByRole('button', { name: 'Lock in', exact: true }).click();
  await idle(page);
  await expect(page.locator('.coach')).toContainText('shift your Jack from Right to Left');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('button', { name: 'Your Jack on Right', exact: true }).click();
  await page.getByRole('button', { name: /^Left front/ }).click();
  await page.getByRole('button', { name: 'Lock in', exact: true }).click();
  await idle(page);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.getByRole('button', { name: 'Play the computer (Easy)', exact: true }).click();
  await turn(page, 1);
});
