import { test, expect, type Page } from '@playwright/test';

async function deploy(page: Page, card: string, front: string) {
  await page.getByRole('button', { name: `Play ${card}`, exact: true }).click();
  await page.getByRole('button', { name: `Choose front ${front}`, exact: true }).click();
  await page.getByRole('button', { name: 'Lock order', exact: true }).click();
}
async function turn(page: Page, n: number) {
  await expect(page.locator('.cc-game')).not.toHaveClass(/cc-revealing/);
  await expect(page.locator('.cc-turn > strong')).toHaveText(`${n} / 12`);
}

test('solo actions, checkpoint, explicit resume and a complete game', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Casual', exact: true }).click();
  await page.getByRole('button', { name: 'Play vs AI', exact: false }).first().click();
  await expect(page.getByRole('button', { name: 'Lock order', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Shift', exact: true })).toBeDisabled();
  await deploy(page, 'King', 'Sea');
  await turn(page, 2);
  await page.getByRole('button', { name: 'Shift', exact: true }).click();
  await page.getByRole('button', { name: 'Select your King at Sea', exact: true }).click();
  await page.getByRole('button', { name: 'Choose front Land', exact: true }).click();
  await page.getByRole('button', { name: 'Lock order', exact: true }).click();
  await turn(page, 3);
  await page.getByRole('button', { name: 'Recall', exact: true }).click();
  await page.getByRole('button', { name: 'Select your King at Land', exact: true }).click();
  await page.getByRole('button', { name: 'Lock order', exact: true }).click();
  await turn(page, 4);
  await expect(page.getByRole('button', { name: 'Play King', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Ace', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play 2', exact: true })).toHaveCount(0);
  await deploy(page, 'King', 'Air');
  await turn(page, 5);
  await expect(page.locator('.cc-checkpoint-result')).toContainText('Checkpoint:');
  await page.reload();
  await expect(page.locator('.landing')).toBeVisible();
  await page.getByRole('button', { name: 'Continue saved solo game', exact: false }).first().click();
  await turn(page, 5);
  await page.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(page.locator('dialog[open]')).toContainText('no replacement is removed');
  await page.getByRole('button', { name: 'Close rules' }).click();
  for (let t = 5; t <= 12; t++) {
    await page.locator('.cc-hand-card:enabled').first().click();
    await page.getByRole('button', { name: 'Choose front Sea', exact: true }).click();
    await page.getByRole('button', { name: 'Lock order', exact: true }).click();
    if (t < 12) await turn(page, t + 1);
  }
  await expect(page.locator('.cc-result')).toBeVisible();
  await expect(page.locator('.cc-turn > strong')).toHaveText('12 / 12');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Play again', exact: false }).click();
  await turn(page, 1);
});

test('private rooms hide pending orders and recover both seats', async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const host = await a.newPage();
  const guest = await b.newPage();
  try {
    await host.goto('http://127.0.0.1:4173/');
    await host.getByRole('button', { name: 'Invite a friend', exact: false }).click();
    const invitation = await host.getByRole('textbox', { name: 'Invitation link', exact: true }).inputValue();
    await guest.goto(invitation);
    await guest.getByRole('button', { name: 'Join table', exact: true }).click();
    await expect(host.locator('.cc-invite')).toHaveCount(0);
    await deploy(host, 'King', 'Sea');
    await expect(host.getByRole('button', { name: 'Locked', exact: true })).toBeDisabled();
    await expect(guest.locator('.cc-enemy-zone .cc-piece')).toHaveCount(0);
    await expect(guest.locator('.cc-reveal')).toHaveCount(0);
    await deploy(guest, 'Queen', 'Land');
    await turn(host, 2); await turn(guest, 2);
    await expect(host.locator('.cc-reveal')).toContainText('Deploy K');
    await expect(guest.locator('.cc-reveal')).toContainText('Deploy K');
    await host.reload(); await guest.reload();
    for (const page of [host, guest]) {
      await expect(page.locator('.landing')).toBeVisible();
      await page.getByRole('button', { name: 'Rejoin private table', exact: false }).click();
      await turn(page, 2);
    }
    await host.locator('.cc-details > summary').click();
    await host.getByRole('button', { name: 'Reconnect', exact: true }).last().click();
    await deploy(host, 'Jack', 'Land');
    await deploy(guest, 'King', 'Air');
    await turn(host, 3); await turn(guest, 3);
  } finally { await a.close(); await b.close(); }
});

test('local two-player conceals both orders and reveals together', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Local 2-player', exact: false }).click();
  await expect(page.locator('.handoff')).toContainText('Player 1');
  await page.getByRole('button', { name: 'I’m ready', exact: false }).click();
  await deploy(page, 'King', 'Sea');
  await expect(page.locator('.handoff')).toContainText('Player 2');
  await expect(page.locator('.handoff')).not.toContainText('King');
  await page.getByRole('button', { name: 'I’m ready', exact: false }).click();
  await expect(page.locator('.cc-board .cc-piece')).toHaveCount(0);
  await deploy(page, 'Queen', 'Land');
  await page.getByRole('button', { name: 'Reveal together', exact: false }).click();
  await expect(page.locator('.cc-game')).not.toHaveClass(/cc-revealing/);
  await expect(page.locator('.cc-board .cc-piece')).toHaveCount(2);
  await page.getByRole('button', { name: 'Next turn', exact: false }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Continue local game', exact: false }).click();
  await page.getByRole('button', { name: 'I’m ready', exact: false }).click();
  await turn(page, 2);
  await expect(page.locator('.cc-reveal')).toContainText('Deploy K');
});

test('invalid invitation and failed room creation preserve solo access', async ({ page }) => {
  await page.goto('/');
  await page.locator('.join-form > summary').click();
  await page.getByLabel('Your friend’s invitation link').fill('not-an-invitation');
  await page.getByRole('button', { name: 'Join table', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('complete invitation');
  await page.route('**/api/rooms', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Table service unavailable' }) }));
  await page.getByRole('button', { name: 'Invite a friend', exact: false }).click();
  await expect(page.getByRole('alert')).toContainText('unavailable');
  await page.getByRole('button', { name: 'Play vs AI', exact: false }).first().click();
  await deploy(page, 'King', 'Sea');
  await turn(page, 2);
});
