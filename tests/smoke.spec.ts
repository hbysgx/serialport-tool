/**
 * Smoke test — VS Code 风格内联编辑 (无系统弹窗)
 */
import { test, expect } from '@playwright/test';

/** 通过 RPC 创建会话并等待加载 */
async function ensureSessionLoaded(page, name = 'TestSession') {
  await page.waitForTimeout(600);
  const connVisible = await page.locator('#connection-bar').isVisible().catch(() => false);
  if (connVisible) return;

  // 内联新建
  await page.locator('#empty-state button:has-text("新建会话")').click();
  const input = page.locator('#session-tree input[type="text"]');
  await expect(input).toBeVisible({ timeout: 2000 });
  await input.fill(name);
  await input.press('Enter');
  await page.waitForTimeout(2000);
  await expect(page.locator('#connection-bar')).toBeVisible({ timeout: 5000 });
}

// ==============================
// 1. 页面加载
// ==============================
test.describe('页面加载', () => {
  test('页面基本元素可见', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#session-sidebar')).toBeVisible();
    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#empty-state')).toContainText('未选择会话');
  });
});

// ==============================
// 2. 内联新建
// ==============================
test.describe('内联新建', () => {
  test('新建会话 → 自动加载', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#empty-state');

    await page.locator('#empty-state button:has-text("新建会话")').click();
    const input = page.locator('#session-tree input[type="text"]');
    await expect(input).toBeVisible({ timeout: 2000 });
    await input.fill('HelloSerial');
    await input.press('Enter');
    await page.waitForTimeout(2000);

    await expect(page.locator('#connection-bar')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#session-tree')).toContainText('HelloSerial');
    await expect(page.locator('#preset-panel')).toBeVisible();
    await expect(page.locator('#receive-area')).toBeVisible();
    await expect(page.locator('#send-area')).toBeVisible();
  });

  test('Escape 取消新建', async ({ page }) => {
    await page.goto('/');

    await page.locator('#empty-state button:has-text("新建会话")').click();
    const input = page.locator('#session-tree input[type="text"]');
    await expect(input).toBeVisible({ timeout: 2000 });
    await input.fill('ShouldNotExist');
    await input.press('Escape');
    await page.waitForTimeout(500);

    await expect(page.locator('#session-tree')).not.toContainText('ShouldNotExist');
    await expect(page.locator('#empty-state')).toBeVisible();
  });

  test('新建文件夹', async ({ page }) => {
    await page.goto('/');

    await page.locator('#session-sidebar button[title="新建目录"]').click();
    const input = page.locator('#session-tree input[type="text"]');
    await expect(input).toBeVisible({ timeout: 2000 });
    await expect(input).toHaveAttribute('placeholder', '目录名称');
    await input.fill('MyFolder');
    await input.press('Enter');
    await page.waitForTimeout(500);

    await expect(page.locator('#session-tree')).toContainText('MyFolder');
  });

  test('选中文件夹后新建会话在其内部', async ({ page }) => {
    await page.goto('/');

    // 先建文件夹
    await page.locator('#session-sidebar button[title="新建目录"]').click();
    let input = page.locator('#session-tree input[type="text"]');
    await input.fill('Projects');
    await input.press('Enter');
    await page.waitForTimeout(300);

    // 选中文件夹
    await page.locator('.tree-row:has-text("Projects")').click();
    await page.waitForTimeout(200);

    // 新建会话
    await page.locator('#session-sidebar button[title="新建会话"]').click();
    input = page.locator('#session-tree input[type="text"]');
    await expect(input).toBeVisible({ timeout: 2000 });
    await input.fill('SubSession');
    await input.press('Enter');
    await page.waitForTimeout(1500);

    // 应该出现在树内
    await expect(page.locator('#session-tree')).toContainText('SubSession');
  });
});

// ==============================
// 3. 内联重命名
// ==============================
test.describe('内联重命名', () => {
  test('双击进入重命名', async ({ page }) => {
    await page.goto('/');
    await ensureSessionLoaded(page, 'OldName');

    const row = page.locator('.tree-row:has-text("OldName")');
    await row.dblclick();
    await page.waitForTimeout(300);

    const input = row.locator('input[type="text"]');
    await expect(input).toBeVisible({ timeout: 2000 });
    await input.fill('NewName');
    await input.press('Enter');
    await page.waitForTimeout(500);

    await expect(page.locator('#session-tree')).toContainText('NewName');
    await expect(page.locator('#session-tree')).not.toContainText('OldName');
  });

  test('右键菜单 → 重命名', async ({ page }) => {
    await page.goto('/');
    await ensureSessionLoaded(page, 'RenameMe');

    const row = page.locator('.tree-row:has-text("RenameMe")');
    await row.click({ button: 'right' });
    await page.waitForTimeout(200);

    await page.locator('.ctx-item:has-text("重命名")').click();
    await page.waitForTimeout(300);

    const input = row.locator('input[type="text"]');
    await expect(input).toBeVisible({ timeout: 2000 });
    await input.fill('RenamedOK');
    await input.press('Enter');
    await page.waitForTimeout(500);

    await expect(page.locator('#session-tree')).toContainText('RenamedOK');
  });

  test('Escape 取消重命名', async ({ page }) => {
    await page.goto('/');
    await ensureSessionLoaded(page, 'KeepThis');

    const row = page.locator('.tree-row:has-text("KeepThis")');
    await row.dblclick();
    await page.waitForTimeout(300);

    const input = row.locator('input[type="text"]');
    await input.fill('DiscardMe');
    await input.press('Escape');
    await page.waitForTimeout(300);

    // 名称应保持不变
    await expect(page.locator('#session-tree')).toContainText('KeepThis');
    await expect(page.locator('#session-tree')).not.toContainText('DiscardMe');
  });
});

// ==============================
// 4. 右键菜单
// ==============================
test.describe('右键菜单', () => {
  test('会话行右键菜单内容', async ({ page }) => {
    await page.goto('/');
    await ensureSessionLoaded(page, 'CtxSession');

    const row = page.locator('.tree-row:has-text("CtxSession")');
    await row.click({ button: 'right' });
    await page.waitForTimeout(200);

    const menu = page.locator('#ctx-menu');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('重命名');
    await expect(menu).toContainText('删除');

    // 点击空白关闭
    await page.mouse.click(10, 10);
    await expect(menu).toBeHidden({ timeout: 1000 });
  });

  test('文件夹右键菜单含新建选项', async ({ page }) => {
    await page.goto('/');

    await page.locator('#session-sidebar button[title="新建目录"]').click();
    let input = page.locator('#session-tree input[type="text"]');
    await input.fill('MyDir');
    await input.press('Enter');
    await page.waitForTimeout(300);

    const row = page.locator('.tree-row:has-text("MyDir")');
    await row.click({ button: 'right' });
    await page.waitForTimeout(200);

    const menu = page.locator('#ctx-menu');
    await expect(menu).toContainText('新建会话');
    await expect(menu).toContainText('新建子目录');
  });

  test('删除会话 (confirm dialog)', async ({ page }) => {
    await page.goto('/');
    await ensureSessionLoaded(page, 'DeleteMe');

    const row = page.locator('.tree-row:has-text("DeleteMe")');
    await row.click({ button: 'right' });
    await page.waitForTimeout(200);

    page.once('dialog', async d => await d.accept());
    await page.locator('.ctx-item.danger:has-text("删除")').click();
    await page.waitForTimeout(500);

    await expect(page.locator('#session-tree')).not.toContainText('DeleteMe');
  });

  test('右键文件夹 → 新建会话', async ({ page }) => {
    await page.goto('/');

    // 创建目录
    await page.locator('#session-sidebar button[title="新建目录"]').click();
    let input = page.locator('#session-tree input[type="text"]');
    await input.fill('TargetDir');
    await input.press('Enter');
    await page.waitForTimeout(300);

    // 右键目录 → 新建会话
    const row = page.locator('.tree-row:has-text("TargetDir")');
    await row.click({ button: 'right' });
    await page.waitForTimeout(200);
    await page.locator('.ctx-item:has-text("新建会话")').click();
    await page.waitForTimeout(300);

    input = page.locator('#session-tree input[type="text"]');
    await expect(input).toBeVisible({ timeout: 2000 });
    await input.fill('ChildViaCtx');
    await input.press('Enter');
    await page.waitForTimeout(1000);

    await expect(page.locator('#session-tree')).toContainText('ChildViaCtx');
  });
});

// ==============================
// 5. 侧栏切换
// ==============================
test.describe('侧栏切换', () => {
  test('⌘⇧S 隐藏和恢复会话侧栏', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Meta+Shift+S');
    await page.waitForTimeout(500);
    await expect(page.locator('#session-sidebar')).toBeHidden();
    await expect(page.locator('#session-hidden-bar')).toBeVisible();

    await page.locator('#session-hidden-bar').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#session-sidebar')).toBeVisible();
  });
});

// ==============================
// 6. 串口模块不可用 (Bun 环境)
// ==============================
test.describe('串口模块兼容性', () => {
  test('Bun 环境下设备下拉显示不可用提示', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000); // 等待首次设备刷新

    // 设备下拉应显示不可用提示
    const sel = page.locator('#device-select');
    const text = await sel.locator('option').first().textContent();
    // 在 Bun 环境下显示不可用，在 Node 环境下显示"未找到设备"
    expect(text || '').toMatch(/不可用|未找到设备/);
  });

  test('点击连接按钮不导致服务器崩溃', async ({ page }) => {
    await page.goto('/');
    await ensureSessionLoaded(page, 'SerialTest');

    // 等待设备刷新
    await page.waitForTimeout(2000);

    // 点击连接按钮
    await page.locator('#connect-btn').click();
    await page.waitForTimeout(1000);

    // 服务器不应崩溃 — toast 应显示错误信息
    const toast = page.locator('#toast');
    const toastVisible = await toast.isVisible().catch(() => false);
    if (toastVisible) {
      const toastText = await toast.textContent();
      // 应包含错误提示（串口不可用 或 请选择设备）
      expect(toastText).toMatch(/串口|设备/);
    }

    // 关键是：页面仍在运行
    await expect(page.locator('#app')).toBeAttached();
  });
});
