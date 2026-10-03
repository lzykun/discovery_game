const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.PSYNET_BASE_URL || 'http://127.0.0.1:5000';
const PARTICIPANT_URL = `${BASE_URL}/ad?generate_tokens=true&recruiter=hotair`;
const evidenceDir = path.resolve(__dirname, '../../../evidence');
const screenshotDir = path.join(evidenceDir, 'screenshots');
const videoDir = path.join(evidenceDir, 'playwright-video');

async function clickFirstEnabledButton(page) {
  const locator = page.locator('button:visible:not([disabled]), input[type="submit"]:visible:not([disabled]), .push-button:visible:not([disabled]), .btn:visible:not([disabled])');
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) {
      await item.click();
      await page.waitForTimeout(800);
      return true;
    }
  }
  return false;
}

async function reachDiscoveryInstruction(page) {
  await page.goto(PARTICIPANT_URL, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 30; i += 1) {
    if (await page.locator('#instruction').isVisible().catch(() => false)) return;
    await clickFirstEnabledButton(page);
  }
  await expect(page.locator('#instruction')).toBeVisible({ timeout: 10000 });
}

async function performScriptedGame(page) {
  await page.locator('#task-grid').click();
  async function moveTo(x, y) {
    let position = await page.evaluate(() => ({ ...playerPosition }));
    while (position.x < x) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120); position = await page.evaluate(() => ({ ...playerPosition })); }
    while (position.x > x) { await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(120); position = await page.evaluate(() => ({ ...playerPosition })); }
    while (position.y < y) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(120); position = await page.evaluate(() => ({ ...playerPosition })); }
    while (position.y > y) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(120); position = await page.evaluate(() => ({ ...playerPosition })); }
  }
  async function nextPair() {
    return page.evaluate(() => {
      const visible = items.filter((item) => {
        const cell = document.querySelector(`.grid-cell[data-x="${item.x}"][data-y="${item.y}"]`);
        return cell && cell.querySelector(`#${item.item_name}`);
      });
      for (const held of visible) {
        for (const target of visible) {
          if (held.item_name !== target.item_name && isSameShape([held.item_name, target.item_name])) {
            return { held, target };
          }
        }
      }
      return { held: visible[0], target: visible[1] };
    });
  }
  for (let i = 0; i < 2; i += 1) {
    const pair = await nextPair();
    await moveTo(pair.held.x, pair.held.y);
    await page.evaluate(() => handleSpacePress());
    await page.waitForTimeout(220);
    await moveTo(pair.target.x, pair.target.y);
    await page.evaluate(() => handleSpacePress());
    await page.waitForTimeout(220);
    await page.evaluate(() => handleSpacePress());
    await page.waitForTimeout(220);
  }
  await expect(page.locator('#task-info-points')).not.toHaveText('0');
  await expect(page.locator('#task-info-actions')).not.toHaveText('40');
  await expect(page.locator('#action-progress-label')).not.toHaveText('Actions remaining: 40 / 40');
  await expect(page.locator('#action-progress-bar')).not.toHaveCSS('width', '0px');
  await page.evaluate(() => window.discoveryPsyNetAdapter.finishGameForReview());
  await expect(page.locator('#task-composer')).toBeVisible({ timeout: 5000 });
}

async function completeSeedParticipant(browser, { exhaustBoard = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await reachDiscoveryInstruction(page);
  await page.locator('#instruction-btn-1').click();
  await expect(page.locator('#task-grid')).toBeVisible({ timeout: 10000 });
  if (exhaustBoard) {
    await page.evaluate(() => {
      document.querySelectorAll('#task-grid .item-image').forEach((item) => item.remove());
      items.forEach((item) => { item.x = -1; item.y = -1; });
      currentlyCarrying = null;
      handleSpacePress();
    });
    await expect(page.locator('#task-composer')).toBeVisible({ timeout: 5000 });
  } else {
    await performScriptedGame(page);
  }
  await page.locator('#composer-text-how').fill('Seed participant found same-shape fusions and harvested the upgraded crystals.');
  await page.locator('#composer-text-rules').fill('Same-shape crystals fused in this easy condition. Harvest after each successful fusion.');
  await page.locator('#composer-submit').click();
  await page.waitForTimeout(1000);
  await context.close();
}

async function advanceAfterInstructionsToMessages(page) {
  await page.locator('#instruct-page-1 .primary').click();
  await page.waitForTimeout(600);
  await page.locator('#instruct-page-2 .primary').click();
  await page.waitForTimeout(600);
  await page.locator('#instruct-page-3 .primary').click();
  await page.waitForTimeout(600);
  await page.locator('#instruct-page-4 .primary').click();
}

test('participant sees aggregated messages and plays upstream discovery game', async ({ browser }) => {
  test.setTimeout(120000);
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.mkdirSync(videoDir, { recursive: true });

  await completeSeedParticipant(browser, { exhaustBoard: true });
  await completeSeedParticipant(browser);
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  await reachDiscoveryInstruction(page);
  await page.screenshot({ path: path.join(screenshotDir, '01-instructions.png'), fullPage: true });
  await page.waitForTimeout(1200);

  await advanceAfterInstructionsToMessages(page);
  await expect(page.locator('#leaderboard')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.lb-row')).toHaveCount(2);
  await page.screenshot({ path: path.join(screenshotDir, '02-aggregated-messages.png'), fullPage: true });
  await page.waitForTimeout(2200);

  await page.locator('.lb-icon-btn').first().click();
  await expect(page.locator('#msg-modal-overlay')).toBeVisible();
  await page.evaluate(() => {
    const el = document.querySelector('#msg-modal-rules');
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.locator('#msg-save-btn').click();
  await page.locator('button', { hasText: 'Close' }).click();
  await expect(page.locator('#messages-btn')).toBeEnabled();
  await page.screenshot({ path: path.join(screenshotDir, '03-notebook-note.png'), fullPage: true });
  await page.waitForTimeout(1800);

  await page.locator('#messages-btn').click();
  await page.locator('#reflect-text').fill('Fuse same-shape crystals, then harvest upgraded crystals.');
  await expect(page.locator('#reflect-btn')).toBeEnabled();
  await page.waitForTimeout(1200);
  await page.locator('#reflect-btn').click();
  await expect(page.locator('#task-grid')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#task-strategy-text')).toContainText('upgraded crystals');
  await page.screenshot({ path: path.join(screenshotDir, '04-game-grid.png'), fullPage: true });
  await page.waitForTimeout(1600);

  await performScriptedGame(page);
  await page.screenshot({ path: path.join(screenshotDir, '05-outgoing-messages.png'), fullPage: true });
  await page.waitForTimeout(2200);
  await page.locator('#composer-text-how').fill('I used the previous messages and fused same-shape crystals for points.');
  await page.locator('#composer-text-rules').fill('Same-shape crystals fuse in the easy condition; harvest the upgraded crystal.');
  await page.waitForTimeout(1200);
  await page.locator('#composer-submit').click();
  await page.waitForTimeout(1000);

  const video = await page.video().path();
  await context.close();
  fs.copyFileSync(video, path.join(evidenceDir, 'participant.webm'));

  const manifest = {
    captions: {
      'screenshots/01-instructions.png': 'Generation 1 upstream instruction screen before reading aggregated messages.',
      'screenshots/02-aggregated-messages.png': 'Generation 1 receives two ranked messages aggregated from generation 0.',
      'screenshots/03-notebook-note.png': 'Participant reads an upstream message modal and saves highlighted text to the notebook.',
      'screenshots/04-game-grid.png': 'Upstream crystal grid with rover, points, actions remaining, carrying/current-tile status, hints, and logs.',
      'screenshots/05-outgoing-messages.png': 'Upstream outgoing strategy and rule message composition after game play.',
    }
  };
  fs.writeFileSync(path.join(screenshotDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
});
