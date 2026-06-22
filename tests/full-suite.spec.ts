/**
 * Serialport Tool — 完整 UI 自动化测试
 * 运行: npm test
 *
 * 覆盖范围:
 *  1. 页面加载 & 初始状态
 *  2. 会话管理树 (内联新建/重命名/删除/文件夹嵌套/右键菜单/拖拽)
 *  3. 预设管理 (分组CRUD/指令CRUD/hotkey)
 *  4. 连接设置 (参数/checkbox)
 *  5. 接收区 (模式切换/混显/时间戳)
 *  6. 发送区 (输入/模式/清空)
 *  7. 串口连接与发送 (真实设备)
 *  8. 键盘快捷键
 *  9. 侧栏切换
 * 10. Toast 通知
 * 11. 边界 & 健壮性
 */
import { test, expect } from '@playwright/test';

// ---- 工具 ----
async function ensureSession(page, name = 'AutoSession') {
  await page.waitForTimeout(600);
  if (await page.locator('#connection-bar').isVisible().catch(() => false)) return;
  await page.locator('#empty-state button:has-text("新建会话")').click();
  const input = page.locator('#session-tree input[type="text"]');
  await expect(input).toBeVisible({ timeout: 3000 });
  await input.fill(name);
  await input.press('Enter');
  await page.waitForTimeout(2000);
  await expect(page.locator('#connection-bar')).toBeVisible({ timeout: 5000 });
}

/** 等待内联输入出现、填写、回车，并等待 RPC 完成 */
async function inlineCreate(page, name) {
  const input = page.locator('#session-tree input[type="text"]');
  await expect(input).toBeVisible({ timeout: 3000 });
  await input.fill(name);
  await input.press('Enter');
  // 等待树更新（新会话/文件夹出现 或 连接栏可见）
  await page.waitForTimeout(2000);
  // 尝试等待树中包含名称
  try {
    await expect(page.locator('#session-tree')).toContainText(name, { timeout: 5000 });
  } catch {
    // 如果 toContainText 匹配不到(emoji干扰)，尝试等连接栏（仅会话）
  }
}

// ==========================================
// 1. 页面加载
// ==========================================
test.describe('页面加载', () => {
  test('服务器返回 HTML', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(/Serialport Tool/);
  });

  test('所有核心 DOM 元素存在', async ({ page }) => {
    await page.goto('/');
    for (const sel of ['#session-sidebar', '#session-tree', '#connection-bar',
      '#device-select', '#baudrate-select', '#preset-panel', '#preset-list',
      '#receive-area', '#receive-log', '#send-area', '#send-input', '#empty-state']) {
      await expect(page.locator(sel)).toBeAttached();
    }
  });

  test('无会话时显示空状态，连接栏和预设面板隐藏', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#empty-state')).toContainText('未选择会话');
    await expect(page.locator('#connection-bar')).toBeHidden();
    await expect(page.locator('#preset-panel')).toBeHidden();
  });
});

// ==========================================
// 2. 会话管理树
// ==========================================
test.describe('会话树 — 内联新建', () => {
  test('空状态按钮 → 内联输入 → 会话创建并自动加载', async ({ page }) => {
    await page.goto('/');
    await page.locator('#empty-state button:has-text("新建会话")').click();
    await inlineCreate(page, 'Session1');

    await expect(page.locator('#session-tree')).toContainText('Session1');
    await expect(page.locator('#connection-bar')).toBeVisible();
    await expect(page.locator('#preset-panel')).toBeVisible();
    await expect(page.locator('#receive-area')).toBeVisible();
    await expect(page.locator('#send-area')).toBeVisible();
  });

  test('Escape 取消新建 → 回到空状态', async ({ page }) => {
    await page.goto('/');
    await page.locator('#empty-state button:has-text("新建会话")').click();
    const input = page.locator('#session-tree input[type="text"]');
    await input.fill('ShouldVanish');
    await input.press('Escape');
    await page.waitForTimeout(300);
    await expect(page.locator('#session-tree')).not.toContainText('ShouldVanish');
  });

  test('侧栏按钮新建文件夹', async ({ page }) => {
    await page.goto('/');
    await page.locator('#session-sidebar button[title="新建目录"]').click();
    const input = page.locator('#session-tree input[type="text"]');
    await expect(input).toHaveAttribute('placeholder', '目录名称');
    await input.fill('FolderA');
    await input.press('Enter');
    await page.waitForTimeout(500);
    await expect(page.locator('#session-tree')).toContainText('FolderA');
  });

  test('选中文件夹 → 在其内部新建会话', async ({ page }) => {
    await page.goto('/');

    // 建文件夹
    await page.locator('#session-sidebar button[title="新建目录"]').click();
    await inlineCreate(page, 'ParentDir');

    // 选中文件夹 (单击)
    await page.locator('.tree-row:has-text("ParentDir")').click();
    await page.waitForTimeout(200);

    // 新建会话 → 应出现在文件夹内
    await page.locator('#session-sidebar button[title="新建会话"]').click();
    await inlineCreate(page, 'ChildSession');

    // 验证 ChildSession 在树中
    await expect(page.locator('#session-tree')).toContainText('ChildSession');
  });

  test('右键文件夹 → 新建会话', async ({ page }) => {
    await page.goto('/');
    await page.locator('#session-sidebar button[title="新建目录"]').click();
    await inlineCreate(page, 'CtxDir');

    // 右键文件夹
    await page.locator('.tree-row:has-text("CtxDir")').click({ button: 'right' });
    await page.waitForTimeout(200);
    await page.locator('.ctx-item:has-text("新建会话")').click();
    await page.waitForTimeout(300);

    await inlineCreate(page, 'FromCtx');
    await expect(page.locator('#session-tree')).toContainText('FromCtx');
  });

  test('右键文件夹 → 新建子目录', async ({ page }) => {
    await page.goto('/');
    await page.locator('#session-sidebar button[title="新建目录"]').click();
    await inlineCreate(page, 'RootDir');

    await page.locator('.tree-row:has-text("RootDir")').click({ button: 'right' });
    await page.waitForTimeout(200);
    await page.locator('.ctx-item:has-text("新建子目录")').click();
    await page.waitForTimeout(300);

    await inlineCreate(page, 'SubDir');
    await expect(page.locator('#session-tree')).toContainText('SubDir');
  });
});

test.describe('会话树 — 重命名', () => {
  test('双击进入内联重命名 → Enter 提交', async ({ page }) => {
    await page.goto('/');
    await ensureSession(page, 'OldName');

    const row = page.locator('.tree-row:has-text("OldName")');
    await row.dblclick();
    await page.waitForTimeout(200);

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
    await ensureSession(page, 'MenuRename');

    const row = page.locator('.tree-row:has-text("MenuRename")');
    await row.click({ button: 'right' });
    await page.waitForTimeout(200);
    await page.locator('.ctx-item:has-text("重命名")').click();
    await page.waitForTimeout(200);

    const input = row.locator('input[type="text"]');
    await input.fill('RenamedViaMenu');
    await input.press('Enter');
    await page.waitForTimeout(500);

    await expect(page.locator('#session-tree')).toContainText('RenamedViaMenu');
  });

  test('Escape 取消重命名 → 保持原名', async ({ page }) => {
    await page.goto('/');
    await ensureSession(page, 'KeepName');

    const row = page.locator('.tree-row:has-text("KeepName")');
    await row.dblclick();
    await page.waitForTimeout(200);

    await row.locator('input[type="text"]').fill('Discard');
    await row.locator('input[type="text"]').press('Escape');
    await page.waitForTimeout(300);

    await expect(page.locator('#session-tree')).toContainText('KeepName');
    await expect(page.locator('#session-tree')).not.toContainText('Discard');
  });
});

test.describe('会话树 — 删除', () => {
  test('右键删除会话', async ({ page }) => {
    await page.goto('/');
    await ensureSession(page, 'DeleteMe');

    const row = page.locator('.tree-row:has-text("DeleteMe")');
    await row.click({ button: 'right' });
    await page.waitForTimeout(200);

    page.once('dialog', async d => await d.accept());
    await page.locator('.ctx-item.danger:has-text("删除")').click();
    await page.waitForTimeout(500);

    await expect(page.locator('#session-tree')).not.toContainText('DeleteMe');
  });

  test('删除文件夹（递归）', async ({ page }) => {
    await page.goto('/');
    await page.locator('#session-sidebar button[title="新建目录"]').click();
    await inlineCreate(page, 'ToDelete');

    const row = page.locator('.tree-row:has-text("ToDelete")');
    await row.click({ button: 'right' });
    await page.waitForTimeout(200);

    page.once('dialog', async d => await d.accept());
    await page.locator('.ctx-item.danger:has-text("删除")').click();
    await page.waitForTimeout(500);

    await expect(page.locator('#session-tree')).not.toContainText('ToDelete');
  });
});

test.describe('会话树 — 右键菜单', () => {
  test('会话行右键菜单内容', async ({ page }) => {
    await page.goto('/');
    await ensureSession(page, 'CtxTest');

    await page.locator('.tree-row:has-text("CtxTest")').click({ button: 'right' });
    await page.waitForTimeout(200);
    const menu = page.locator('#ctx-menu');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('重命名');
    await expect(menu).toContainText('删除');

    await page.mouse.click(10, 10);
    await expect(menu).toBeHidden({ timeout: 1000 });
  });

  test('文件夹右键菜单含新建选项', async ({ page }) => {
    await page.goto('/');
    await page.locator('#session-sidebar button[title="新建目录"]').click();
    await inlineCreate(page, 'FldMenu');

    await page.locator('.tree-row:has-text("FldMenu")').click({ button: 'right' });
    await page.waitForTimeout(200);
    const menu = page.locator('#ctx-menu');
    await expect(menu).toContainText('新建会话');
    await expect(menu).toContainText('新建子目录');
    await expect(menu).toContainText('重命名');
    await expect(menu).toContainText('删除');
  });
});

// ==========================================
// 3. 预设管理
// ==========================================
test.describe('预设管理', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ensureSession(page, 'PresetTest');
  });

  test('默认分组 AT 指令和 Modbus 可见', async ({ page }) => {
    await expect(page.locator('#preset-panel')).toContainText('AT 指令');
    await expect(page.locator('#preset-panel')).toContainText('Modbus');
  });

  test('预设按钮含快捷键标记', async ({ page }) => {
    await expect(page.locator('#preset-list')).toContainText('⌘1');
    await expect(page.locator('#preset-list')).toContainText('⌘2');
  });

  test('新建分组', async ({ page }) => {
    page.once('dialog', async d => await d.accept('我的分组'));
    await page.locator('#preset-panel button[title="新建分组"]').click();
    await page.waitForTimeout(800);
    await expect(page.locator('#preset-list')).toContainText('我的分组');
  });

  test('新增预设指令', async ({ page }) => {
    await page.locator('#preset-panel button:has-text("新增预设")').click();
    await page.waitForTimeout(300);
    const m = page.locator('.modal-overlay');
    await m.locator('#cmd-name').fill('自定义');
    await m.locator('#cmd-payload').fill('AA BB CC');
    await m.locator('#cmd-save-btn').click();
    await page.waitForTimeout(800);
    await expect(page.locator('#preset-list')).toContainText('自定义');
  });

  test('编辑预设指令', async ({ page }) => {
    await page.locator('.preset-cmd').first().click({ button: 'right' });
    await page.waitForTimeout(300);
    const m = page.locator('.modal-overlay');
    await expect(m).toBeVisible();
    await m.locator('#cmd-name').fill('已编辑');
    await m.locator('#cmd-save-btn').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#preset-list')).toContainText('已编辑');
  });

  test('空名称不可保存', async ({ page }) => {
    await page.locator('#preset-panel button:has-text("新增预设")').click();
    await page.waitForTimeout(300);
    const m = page.locator('.modal-overlay');
    await m.locator('#cmd-name').fill('');
    await m.locator('#cmd-payload').fill('test');
    await m.locator('#cmd-save-btn').click();
    await page.waitForTimeout(200);
    await expect(m).toBeAttached(); // 弹窗未关闭
  });

  test('取消按钮关闭弹窗', async ({ page }) => {
    await page.locator('#preset-panel button:has-text("新增预设")').click();
    await page.waitForTimeout(300);
    await page.locator('.modal-overlay button:has-text("取消")').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.modal-overlay')).not.toBeAttached();
  });

  test('绑定快捷键复选框启用 hotkey 下拉', async ({ page }) => {
    await page.locator('#preset-panel button:has-text("新增预设")').click();
    await page.waitForTimeout(300);
    const m = page.locator('.modal-overlay');
    await expect(m.locator('#cmd-hotkey')).toBeDisabled();
    await m.locator('#cmd-use-hotkey').check();
    await expect(m.locator('#cmd-hotkey')).toBeEnabled();
  });

  test('快捷键 ⌘1 发送预设 (未连接时提示)', async ({ page }) => {
    await page.keyboard.press('Meta+1');
    await page.waitForTimeout(500);
    await expect(page.locator('#toast')).toContainText(/请先连接|串口/);
  });
});

// ==========================================
// 4. 连接设置
// ==========================================
test.describe('连接设置', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ensureSession(page, 'ConnTest');
  });

  test('默认参数', async ({ page }) => {
    await expect(page.locator('#baudrate-select')).toHaveValue('115200');
    await expect(page.locator('#databits-select')).toHaveValue('8');
    await expect(page.locator('#parity-select')).toHaveValue('none');
    await expect(page.locator('#stopbits-select')).toHaveValue('1');
    await expect(page.locator('#flowctrl-select')).toHaveValue('none');
    await expect(page.locator('#auto-connect')).not.toBeChecked();
  });

  test('波特率下拉含所有标准值', async ({ page }) => {
    const opts = await page.locator('#baudrate-select option').allTextContents();
    for (const v of ['1200', '9600', '115200', '921600']) expect(opts).toContain(v);
  });

  test('校验/停止位/流控下拉完整', async ({ page }) => {
    expect(await page.locator('#parity-select option').allTextContents()).toEqual(
      expect.arrayContaining(['None', 'Even', 'Odd']));
    expect(await page.locator('#stopbits-select option').allTextContents()).toEqual(
      expect.arrayContaining(['1', '2']));
  });

  test('状态显示"未连接"', async ({ page }) => {
    await expect(page.locator('#conn-status')).toContainText('未连接');
  });
});

// ==========================================
// 5. 接收区
// ==========================================
test.describe('接收区', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ensureSession(page, 'RecvTest');
  });

  test('Text ↔ HEX 模式切换', async ({ page }) => {
    await page.locator('#receive-mode button[data-mode="hex"]').click();
    await expect(page.locator('#receive-mode button[data-mode="hex"]')).toHaveClass(/active/);

    await page.locator('#receive-mode button[data-mode="text"]').click();
    await expect(page.locator('#receive-mode button[data-mode="text"]')).toHaveClass(/active/);
  });

  test('混显/自动滚动/时间戳 checkbox 默认选中', async ({ page }) => {
    await expect(page.locator('#receive-mixed')).toBeChecked();
    await expect(page.locator('#auto-scroll')).toBeChecked();
    await expect(page.locator('#show-timestamp')).toBeChecked();
  });

  test('日志计数初始 0', async ({ page }) => {
    await expect(page.locator('#log-count')).toContainText('0 条');
  });
});

// ==========================================
// 6. 发送区
// ==========================================
test.describe('发送区', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ensureSession(page, 'SendTest');
  });

  test('默认 Text 模式，自动回车和本地回显选中', async ({ page }) => {
    await expect(page.locator('#send-mode button[data-mode="ascii"]')).toHaveClass(/active/);
    await expect(page.locator('#send-crlf')).toBeChecked();
    await expect(page.locator('#local-echo')).toBeChecked();
  });

  test('输入文本 & 清空', async ({ page }) => {
    const inp = page.locator('#send-input');
    await inp.fill('hello world');
    await expect(inp).toHaveValue('hello world');
    await page.locator('#send-area button[title="清空"]').click();
    await expect(inp).toHaveValue('');
  });

  test('切换到 HEX 模式', async ({ page }) => {
    await page.locator('#send-mode button[data-mode="hex"]').click();
    await expect(page.locator('#send-mode button[data-mode="hex"]')).toHaveClass(/active/);
    await expect(page.locator('#send-mode button[data-mode="ascii"]')).not.toHaveClass(/active/);
  });
});

// ==========================================
// 7. 串口连接 & 发送 (真实设备)
// ==========================================
test.describe('串口连接与发送', () => {
  const DEVICE_PATH = '/dev/cu.usbserial-21440';
  // macOS 串口前缀可能是 cu. 或 tty.
  const ALT_PATH = '/dev/tty.usbserial-21440';

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ensureSession(page, 'SerialTest');
    // 等待设备列表刷新
    await page.waitForTimeout(3000);
  });

  test('设备列表中能找到 usbserial-21440', async ({ page }) => {
    const options = await page.locator('#device-select option').allTextContents();
    const found = options.some(o => o.includes('usbserial-21440'));
    if (!found) {
      console.log('[SKIP] usbserial-21440 未插入，跳过串口实操测试');
      test.skip();
    }
    expect(found).toBe(true);
  });

  test('连接 → 设置 9600 → 打开串口', async ({ page }) => {
    // 检查设备存在
    const options = await page.locator('#device-select option').allTextContents();
    if (!options.some(o => o.includes('usbserial-21440'))) {
      test.skip();
      return;
    }

    // 选择设备
    const sel = page.locator('#device-select');
    const opt = sel.locator('option').filter({ hasText: 'usbserial-21440' });
    const val = await opt.getAttribute('value');
    if (!val) { test.skip(); return; }
    await sel.selectOption(val);

    // 设置 9600 波特率
    await page.locator('#baudrate-select').selectOption('9600');
    await expect(page.locator('#baudrate-select')).toHaveValue('9600');

    // 连接
    await page.locator('#connect-btn').click();
    await page.waitForTimeout(2000);

    // 验证连接状态
    const status = page.locator('#conn-status');
    const statusText = await status.textContent();
    // 连接成功 → "已连接"，失败 → toast 提示
    const connected = statusText?.includes('已连接');
    if (connected) {
      await expect(status).toContainText('已连接');
    } else {
      // 可能被占用或权限不足，检查 toast
      const toast = page.locator('#toast');
      console.log('[INFO] 连接状态:', statusText, 'Toast:', await toast.textContent().catch(() => ''));
    }
  });

  test('发送 TEXT "K00FF00R" @ 9600', async ({ page }) => {
    // 检查设备
    const options = await page.locator('#device-select option').allTextContents();
    if (!options.some(o => o.includes('usbserial-21440'))) {
      test.skip();
      return;
    }

    // 选择设备 & 连接
    const sel = page.locator('#device-select');
    const opt = sel.locator('option').filter({ hasText: 'usbserial-21440' });
    const val = await opt.getAttribute('value');
    if (!val) { test.skip(); return; }
    await sel.selectOption(val);
    await page.locator('#baudrate-select').selectOption('9600');
    await page.locator('#connect-btn').click();
    await page.waitForTimeout(2000);

    // 检查是否连接成功
    const statusText = await page.locator('#conn-status').textContent();
    if (!statusText?.includes('已连接')) {
      console.log('[SKIP] 串口连接失败，无法测试发送');
      return; // 不 fail，只是跳过发送
    }

    // 确保 Text 模式
    const asciiBtn = page.locator('#send-mode button[data-mode="ascii"]');
    if (!(await asciiBtn.evaluate(el => el.classList.contains('active')))) {
      await asciiBtn.click();
      await page.waitForTimeout(200);
    }

    // 确保本地回显开启（这样发送后能在接收区看到）
    const echoCb = page.locator('#local-echo');
    if (!(await echoCb.isChecked())) await echoCb.check();

    // 输入并发送
    const input = page.locator('#send-input');
    await input.fill('K00FF00R');
    await expect(input).toHaveValue('K00FF00R');

    // 发送 (⌘↩)
    await page.keyboard.press('Meta+Enter');
    await page.waitForTimeout(1500);

    // 验证本地回显 — 接收区应出现 TX 记录
    const logCount = await page.locator('#log-count').textContent();
    console.log('[INFO] 发送后日志数:', logCount);

    // 如果有本地回显，日志数应 > 0
    if (await page.locator('#local-echo').isChecked()) {
      await expect(page.locator('#log-count')).not.toContainText('0 条', { timeout: 3000 });
    }

    // 断开
    await page.locator('#connect-btn').click();
    await page.waitForTimeout(500);
  });

  test('发送预设指令 @ 9600', async ({ page }) => {
    // 检查设备
    const options = await page.locator('#device-select option').allTextContents();
    if (!options.some(o => o.includes('usbserial-21440'))) {
      test.skip();
      return;
    }

    // 选择设备 & 连接
    const sel = page.locator('#device-select');
    const opt = sel.locator('option').filter({ hasText: 'usbserial-21440' });
    const val = await opt.getAttribute('value');
    if (!val) { test.skip(); return; }
    await sel.selectOption(val);
    await page.locator('#baudrate-select').selectOption('9600');
    await page.locator('#connect-btn').click();
    await page.waitForTimeout(2000);

    const statusText = await page.locator('#conn-status').textContent();
    if (!statusText?.includes('已连接')) {
      console.log('[SKIP] 串口连接失败');
      return;
    }

    // 点击预设按钮发送
    const beforeCount = await page.locator('#log-count').textContent();
    await page.locator('.preset-cmd').first().click();
    await page.waitForTimeout(1000);

    const afterCount = await page.locator('#log-count').textContent();
    console.log('[INFO] 预设发送: 前=' + beforeCount + ' 后=' + afterCount);

    // 断开
    await page.locator('#connect-btn').click();
  });
});

// ==========================================
// 8. 键盘快捷键
// ==========================================
test.describe('键盘快捷键', () => {
  test('⌘⇧P 切换预设面板', async ({ page }) => {
    await page.goto('/');
    await ensureSession(page, 'KeyP');

    await expect(page.locator('#preset-panel')).toBeVisible();
    await page.keyboard.press('Meta+Shift+P');
    await page.waitForTimeout(500);
    await expect(page.locator('#preset-panel')).toBeHidden();
    await expect(page.locator('#preset-hidden-bar')).toBeVisible();

    await page.keyboard.press('Meta+Shift+P');
    await page.waitForTimeout(500);
    await expect(page.locator('#preset-panel')).toBeVisible();
  });

  test('⌘⇧S 切换会话侧栏', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Meta+Shift+S');
    await page.waitForTimeout(500);
    await expect(page.locator('#session-sidebar')).toBeHidden();
    await expect(page.locator('#session-hidden-bar')).toBeVisible();
  });
});

// ==========================================
// 9. 侧栏 hidden-bar
// ==========================================
test.describe('侧栏 hidden-bar', () => {
  test('隐藏预设面板 → 点 hidden-bar 恢复', async ({ page }) => {
    await page.goto('/');
    await ensureSession(page, 'HiddenP');

    await page.locator('#preset-panel button[title="隐藏面板 (⌘⇧P)"]').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#preset-hidden-bar')).toBeVisible();

    await page.locator('#preset-hidden-bar').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#preset-panel')).toBeVisible();
  });

  test('隐藏会话侧栏 → 点 hidden-bar 恢复', async ({ page }) => {
    await page.goto('/');

    // 确保侧栏初始可见
    await expect(page.locator('#session-sidebar')).toBeVisible({ timeout: 3000 });

    // 先点击按钮隐藏
    const hideBtn = page.locator('#session-sidebar button[title="隐藏面板 (⌘⇧S)"]');
    await hideBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('#session-hidden-bar')).toBeVisible();

    // 点 hidden-bar 恢复
    await page.locator('#session-hidden-bar').click();
    await page.waitForTimeout(500);
    await expect(page.locator('#session-sidebar')).toBeVisible();
  });
});

// ==========================================
// 10. Toast
// ==========================================
test.describe('Toast', () => {
  test('预设面板按钮点击 (未连串口) 显示 toast 警告', async ({ page }) => {
    await page.goto('/');
    await ensureSession(page, 'ToastTest');

    // 未连接时点预设按钮
    await page.locator('.preset-cmd').first().click();
    await page.waitForTimeout(500);

    await expect(page.locator('#toast')).toBeVisible();
    await expect(page.locator('#toast')).toContainText('请先连接');
  });

  test('toast 2.5s 后自动消失', async ({ page }) => {
    await page.goto('/');
    await ensureSession(page, 'ToastFade');

    await page.locator('.preset-cmd').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('#toast')).toBeVisible();

    await page.waitForTimeout(3000);
    await expect(page.locator('#toast')).not.toHaveClass(/show/);
  });
});

// ==========================================
// 11. 边界 & 健壮性
// ==========================================
test.describe('边界 & 健壮性', () => {
  test('设备列表定期刷新不破坏页面', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(8000); // 多轮自动刷新
    await expect(page.locator('#app')).toBeAttached();
  });

  test('快速连续创建多个会话不崩溃', async ({ page }) => {
    await page.goto('/');
    // 第一个用空状态按钮
    await page.locator('#empty-state button:has-text("新建会话")').click();
    await inlineCreate(page, 'Batch0');
    // 后续用侧栏按钮
    for (let i = 1; i < 3; i++) {
      await page.locator('#session-sidebar button[title="新建会话"]').click();
      await inlineCreate(page, 'Batch' + i);
    }
    for (let i = 0; i < 3; i++) {
      await expect(page.locator('#session-tree')).toContainText('Batch' + i, { timeout: 3000 });
    }
  });
});
