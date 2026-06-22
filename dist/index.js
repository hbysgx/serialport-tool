// src/app-config.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
var DEFAULT_CONFIG = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  flowControl: "none",
  lastDevicePath: null,
  presetPanelVisible: true,
  sessionPanelVisible: true,
  receiveDisplayMode: "text",
  receiveShowMixed: true,
  receiveShowTimestamp: true,
  receiveAutoScroll: true,
  sendMode: "ascii",
  sendAppendCRLF: true,
  localEcho: true,
  sendInputText: "",
  autoConnect: false
};
var CONFIG_DIR = join(homedir(), ".serial_tool");
var CONFIG_FILE = join(CONFIG_DIR, "config.json");
var AppConfig = class {
  data;
  constructor() {
    this.data = { ...DEFAULT_CONFIG };
    this.load();
  }
  load() {
    try {
      if (existsSync(CONFIG_FILE)) {
        const raw = readFileSync(CONFIG_FILE, "utf-8");
        const saved = JSON.parse(raw);
        this.data = { ...DEFAULT_CONFIG, ...saved };
      }
    } catch {
    }
    this.ensureDir();
  }
  save() {
    this.ensureDir();
    try {
      writeFileSync(CONFIG_FILE, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (e) {
      console.error("[AppConfig] save failed:", e);
    }
  }
  ensureDir() {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }
  /** 转换为 SerialConfig */
  toSerialConfig() {
    return {
      baudRate: this.data.baudRate,
      dataBits: this.data.dataBits,
      stopBits: this.data.stopBits,
      parity: this.data.parity,
      flowControl: this.data.flowControl,
      lineEnding: this.data.sendAppendCRLF ? "crlf" : "none",
      localEcho: this.data.localEcho,
      showTimestamp: this.data.receiveShowTimestamp
    };
  }
  /** 从 SerialConfig 更新 */
  updateFromSerialConfig(cfg) {
    this.data.baudRate = cfg.baudRate;
    this.data.dataBits = cfg.dataBits;
    this.data.stopBits = cfg.stopBits;
    this.data.parity = cfg.parity;
    this.data.flowControl = cfg.flowControl;
  }
  /** 重置为默认值 */
  resetAll() {
    this.data = { ...DEFAULT_CONFIG };
    this.save();
  }
  /** 获取存储目录路径 */
  get configDir() {
    return CONFIG_DIR;
  }
  /** 获取会话存储目录 */
  get sessionsDir() {
    return join(CONFIG_DIR, "sessions");
  }
};

// src/preset-store.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "fs";
import { join as join2 } from "path";
import { homedir as homedir2 } from "os";
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
var CONFIG_DIR2 = join2(homedir2(), ".serial_tool");
var PRESETS_FILE = join2(CONFIG_DIR2, "presets.json");
function createDefaultPresetGroups() {
  return [
    {
      id: uuid(),
      name: "AT",
      commands: [
        { id: uuid(), name: "AT \u6D4B\u8BD5", payload: "AT", displayMode: "ascii", hotkey: 1, appendNewline: true },
        { id: uuid(), name: "\u5173\u95ED\u56DE\u663E", payload: "ATE0", displayMode: "ascii", hotkey: 2, appendNewline: true },
        { id: uuid(), name: "\u6A21\u5757\u4FE1\u606F", payload: "ATI", displayMode: "ascii", hotkey: 3, appendNewline: true },
        { id: uuid(), name: "\u67E5\u8BE2\u7248\u672C", payload: "AT+GMR", displayMode: "ascii", hotkey: 4, appendNewline: true },
        { id: uuid(), name: "\u67E5\u8BE2\u4FE1\u53F7", payload: "AT+CSQ", displayMode: "ascii", hotkey: null, appendNewline: true },
        { id: uuid(), name: "\u6CE8\u518C\u72B6\u6001", payload: "AT+CREG?", displayMode: "ascii", hotkey: null, appendNewline: true },
        { id: uuid(), name: "\u9644\u7740\u72B6\u6001", payload: "AT+CGATT?", displayMode: "ascii", hotkey: null, appendNewline: true },
        { id: uuid(), name: "\u67E5\u8BE2 IMEI", payload: "AT+CGSN", displayMode: "ascii", hotkey: null, appendNewline: true },
        { id: uuid(), name: "\u91CD\u542F\u6A21\u5757", payload: "AT+CFUN=1,1", displayMode: "ascii", hotkey: null, appendNewline: true }
      ]
    },
    {
      id: uuid(),
      name: "Modbus",
      commands: [
        { id: uuid(), name: "\u8BFB\u4FDD\u6301\u5BC4\u5B58\u5668 0x0001", payload: "01 03 00 01 00 01 D5 CA", displayMode: "hex", hotkey: 5, appendNewline: false },
        { id: uuid(), name: "\u5199\u5355\u4E2A\u5BC4\u5B58\u5668", payload: "01 06 00 01 00 0A 9A 0B", displayMode: "hex", hotkey: 6, appendNewline: false }
      ]
    }
  ];
}
var PresetStore = class {
  groups = [];
  constructor() {
    this.load();
    if (this.groups.length === 0) {
      this.groups = createDefaultPresetGroups();
      this.save();
    }
  }
  ensureDir() {
    if (!existsSync2(CONFIG_DIR2)) {
      mkdirSync2(CONFIG_DIR2, { recursive: true });
    }
  }
  load() {
    try {
      if (existsSync2(PRESETS_FILE)) {
        const raw = readFileSync2(PRESETS_FILE, "utf-8");
        this.groups = JSON.parse(raw);
      }
    } catch {
    }
  }
  save() {
    this.ensureDir();
    try {
      writeFileSync2(PRESETS_FILE, JSON.stringify(this.groups, null, 2), "utf-8");
    } catch (e) {
      console.error("[PresetStore] save failed:", e);
    }
  }
  addGroup(name) {
    const g = { id: uuid(), name, commands: [] };
    this.groups.push(g);
    this.save();
    return g;
  }
  removeGroup(id) {
    this.groups = this.groups.filter((g) => g.id !== id);
    this.save();
  }
  addCommand(cmd, groupId) {
    const g = this.groups.find((g2) => g2.id === groupId);
    if (!g) return null;
    const c = { ...cmd, id: uuid() };
    g.commands.push(c);
    this.save();
    return c;
  }
  updateCommand(cmd, groupId) {
    const g = this.groups.find((g2) => g2.id === groupId);
    if (!g) return false;
    const idx = g.commands.findIndex((c) => c.id === cmd.id);
    if (idx === -1) return false;
    g.commands[idx] = cmd;
    this.save();
    return true;
  }
  removeCommand(cmdId, groupId) {
    const g = this.groups.find((g2) => g2.id === groupId);
    if (!g) return;
    g.commands = g.commands.filter((c) => c.id !== cmdId);
    this.save();
  }
  /** 在所有分组中查找 hotkey == n 的命令 */
  findByHotkey(n) {
    for (const g of this.groups) {
      const cmd = g.commands.find((c) => c.hotkey === n);
      if (cmd) return cmd;
    }
    return null;
  }
};

// src/session-store.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync3, readdirSync, statSync, renameSync, rmSync } from "fs";
import { join as join3, basename, dirname, extname } from "path";
import { homedir as homedir3 } from "os";
function uuid2() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
var CONFIG_DIR3 = join3(homedir3(), ".serial_tool");
var TEMPLATE_FILE = join3(CONFIG_DIR3, "template.json");
var SessionStore = class {
  baseURL;
  constructor() {
    this.baseURL = join3(CONFIG_DIR3, "sessions");
    if (!existsSync3(this.baseURL)) {
      mkdirSync3(this.baseURL, { recursive: true });
    }
  }
  get storagePath() {
    return this.baseURL;
  }
  ensureDir() {
    if (!existsSync3(CONFIG_DIR3)) {
      mkdirSync3(CONFIG_DIR3, { recursive: true });
    }
    if (!existsSync3(this.baseURL)) {
      mkdirSync3(this.baseURL, { recursive: true });
    }
  }
  /** 递归扫描构建树 */
  buildTree() {
    return this._buildTree(this.baseURL);
  }
  _buildTree(dir) {
    const nodes = [];
    let entries;
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return nodes;
    }
    for (const name of entries) {
      const fullPath = join3(dir, name);
      let st;
      try {
        st = statSync(fullPath);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        const folder = {
          id: uuid2(),
          name,
          kind: "folder",
          filePath: fullPath,
          children: this._buildTree(fullPath),
          expanded: true
        };
        nodes.push(folder);
      } else {
        const parsed = this._parseFile(fullPath);
        if (parsed) {
          const session = {
            id: uuid2(),
            name: basename(name, extname(name)),
            kind: "session",
            sessionId: parsed.id,
            filePath: fullPath,
            children: [],
            expanded: true
          };
          nodes.push(session);
        } else {
          const file = {
            id: uuid2(),
            name,
            kind: "file",
            filePath: fullPath,
            children: [],
            expanded: true
          };
          nodes.push(file);
        }
      }
    }
    return this.sortTree(nodes);
  }
  /** 按类型和名称排序: 目录 -> 会话 -> 普通文件 */
  sortTree(tree) {
    const kindOrder = { folder: 0, session: 1, file: 2 };
    for (const node of tree) {
      if (node.children.length > 0) node.children = this.sortTree(node.children);
    }
    return tree.sort((a, b) => {
      const byKind = kindOrder[a.kind] - kindOrder[b.kind];
      if (byKind !== 0) return byKind;
      return a.name.localeCompare(b.name, "zh-CN", { numeric: true, sensitivity: "base" });
    });
  }
  /** 在树中查找节点 */
  findNode(tree, id) {
    for (const n of tree) {
      if (n.id === id) return n;
      const r = this.findNode(n.children, id);
      if (r) return r;
    }
    return null;
  }
  /** 在树中查找会话节点 */
  findBySessionId(tree, sid) {
    for (const n of tree) {
      if (n.kind === "session" && n.sessionId === sid) return n;
      const r = this.findBySessionId(n.children, sid);
      if (r) return r;
    }
    return null;
  }
  /** 按文件路径查找节点 */
  findByFilePath(tree, filePath) {
    for (const n of tree) {
      if (n.filePath === filePath) return n;
      const r = this.findByFilePath(n.children, filePath);
      if (r) return r;
    }
    return null;
  }
  /** 查找父节点 */
  findParent(tree, id) {
    for (const n of tree) {
      if (n.children.some((c) => c.id === id)) return n;
      const r = this.findParent(n.children, id);
      if (r) return r;
    }
    return null;
  }
  // ---- 新建 ----
  /** 新建会话 */
  newSession(name, parentId, config, _presetGroups, tree) {
    const parentDir = parentId ? this.findNode(tree, parentId)?.filePath ?? this.baseURL : this.baseURL;
    const sessionId = uuid2();
    const fileName = `${name}.json`;
    let filePath = join3(parentDir, fileName);
    if (existsSync3(filePath)) {
      let idx = 2;
      while (true) {
        filePath = join3(parentDir, `${name} ${idx}.json`);
        if (!existsSync3(filePath)) break;
        idx++;
      }
    }
    const displayName = basename(filePath, extname(filePath));
    const template = this._loadTemplate(config);
    const data = {
      version: "2.0",
      id: sessionId,
      name: displayName,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      config: JSON.parse(JSON.stringify(template.config)),
      presetGroups: JSON.parse(JSON.stringify(template.presetGroups)),
      entries: JSON.parse(JSON.stringify(template.entries)),
      __serial_session: (/* @__PURE__ */ new Date()).toISOString()
    };
    this._writeFile(filePath, data);
    const node = {
      id: uuid2(),
      name: displayName,
      kind: "session",
      sessionId,
      filePath,
      children: [],
      expanded: true
    };
    if (parentId) {
      const parent = this.findNode(tree, parentId);
      if (parent) {
        parent.children.push(node);
        parent.expanded = true;
      }
    } else {
      tree.push(node);
    }
    return { node, tree: this.sortTree(tree) };
  }
  /** 新建目录 */
  newFolder(name, parentId, tree) {
    const parentDir = parentId ? this.findNode(tree, parentId)?.filePath ?? this.baseURL : this.baseURL;
    let dirPath = join3(parentDir, name);
    if (existsSync3(dirPath)) {
      let idx = 2;
      while (true) {
        dirPath = join3(parentDir, `${name} ${idx}`);
        if (!existsSync3(dirPath)) break;
        idx++;
      }
    }
    mkdirSync3(dirPath, { recursive: true });
    const node = {
      id: uuid2(),
      name: basename(dirPath),
      kind: "folder",
      filePath: dirPath,
      children: [],
      expanded: true
    };
    if (parentId) {
      const parent = this.findNode(tree, parentId);
      if (parent) {
        parent.children.push(node);
        parent.expanded = true;
      }
    } else {
      tree.push(node);
    }
    return { node, tree: this.sortTree(tree) };
  }
  // ---- 加载会话 ----
  loadSession(node) {
    if (node.kind !== "session") return null;
    const data = this._readFile(node.filePath);
    if (!data) return null;
    return { session: data };
  }
  /** 从会话数据恢复配置和预设 */
  applySession(config, presetGroups, session) {
    const s = session.config;
    config.baudRate = s.baudRate ?? config.baudRate;
    config.dataBits = s.dataBits ?? config.dataBits;
    config.stopBits = s.stopBits ?? config.stopBits;
    config.parity = s.parity ?? config.parity;
    config.flowControl = s.flowControl ?? config.flowControl;
    config.lastDevicePath = s.lastDevicePath ?? null;
    config.presetPanelVisible = s.presetPanelVisible ?? true;
    config.sessionPanelVisible = s.sessionPanelVisible ?? true;
    config.receiveDisplayMode = s.receiveDisplayMode ?? "text";
    config.receiveShowMixed = s.receiveShowMixed ?? true;
    config.receiveShowTimestamp = s.receiveShowTimestamp ?? true;
    config.receiveAutoScroll = s.receiveAutoScroll ?? true;
    config.sendMode = s.sendMode ?? "ascii";
    config.sendAppendCRLF = s.sendAppendCRLF ?? true;
    config.localEcho = s.localEcho ?? true;
    config.sendInputText = s.sendInputText ?? "";
    config.autoConnect = s.autoConnect ?? false;
    presetGroups.length = 0;
    for (const g of session.presetGroups) {
      presetGroups.push(JSON.parse(JSON.stringify(g)));
    }
  }
  // ---- 保存 ----
  saveSession(node, config, presetGroups, entries) {
    if (node.kind !== "session" || !node.sessionId) return false;
    const existing = this._readFile(node.filePath);
    const data = {
      version: "2.0",
      id: node.sessionId,
      name: node.name,
      createdAt: existing?.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      config: this._captureConfig(config),
      presetGroups: JSON.parse(JSON.stringify(presetGroups)),
      entries: entries ?? existing?.entries ?? [],
      __serial_session: existing?.__serial_session ?? (/* @__PURE__ */ new Date()).toISOString()
    };
    this._writeFile(node.filePath, data);
    return true;
  }
  // ---- 删除 ----
  deleteNode(node, tree) {
    if (node.kind === "folder") {
      try {
        rmSync(node.filePath, { recursive: true, force: true });
      } catch {
      }
    } else {
      try {
        rmSync(node.filePath);
      } catch {
      }
    }
    return this.sortTree(this._removeFromTree(tree, node.id));
  }
  // ---- 重命名 ----
  renameNode(node, newName, tree) {
    const trimmed = newName.trim();
    if (!trimmed) return tree;
    const parentDir = dirname(node.filePath);
    let newPath;
    if (node.kind === "folder") {
      newPath = join3(parentDir, trimmed);
    } else {
      const ext = extname(node.filePath);
      newPath = join3(parentDir, ext ? `${trimmed}${ext}` : trimmed);
    }
    try {
      renameSync(node.filePath, newPath);
    } catch (e) {
      console.error("[SessionStore] rename failed:", e);
      return tree;
    }
    if (node.kind === "session") {
      const data = this._readFile(newPath);
      if (data) {
        data.name = trimmed;
        data.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        this._writeFile(newPath, data);
      }
    }
    if (node.kind === "folder") {
      this._updateChildPaths(node, node.filePath, newPath);
    }
    node.name = trimmed;
    node.filePath = newPath;
    return this.sortTree(tree);
  }
  // ---- 移动(拖拽) ----
  moveNode(node, targetId, tree) {
    const target = targetId ? this.findNode(tree, targetId) : null;
    if (target && target.kind !== "folder") return tree;
    if (target && target.id === node.id) return tree;
    if (target && node.kind === "folder" && this._containsNode(node, target.id)) return tree;
    const destDir = target?.filePath ?? this.baseURL;
    const destPath = join3(destDir, basename(node.filePath));
    try {
      renameSync(node.filePath, destPath);
    } catch (e) {
      console.error("[SessionStore] move failed:", e);
      return tree;
    }
    if (node.kind === "folder") {
      this._updateChildPaths(node, node.filePath, destPath);
    }
    node.filePath = destPath;
    tree = this._removeFromTree(tree, node.id);
    if (target) {
      target.children.push(node);
    } else {
      tree.push(node);
    }
    return this.sortTree(tree);
  }
  // ---- 文件操作 ----
  readFileContent(filePath) {
    try {
      return readFileSync3(filePath, "utf-8");
    } catch {
      return "";
    }
  }
  writeFileContent(filePath, content) {
    try {
      writeFileSync3(filePath, content, "utf-8");
    } catch (e) {
      console.error("[SessionStore] write file failed:", e);
    }
  }
  // ---- 内部方法 ----
  _captureConfig(config) {
    return {
      baudRate: config.baudRate,
      dataBits: config.dataBits,
      stopBits: config.stopBits,
      parity: config.parity,
      flowControl: config.flowControl,
      lastDevicePath: config.lastDevicePath,
      presetPanelVisible: config.presetPanelVisible,
      sessionPanelVisible: config.sessionPanelVisible,
      receiveDisplayMode: config.receiveDisplayMode,
      receiveShowMixed: config.receiveShowMixed,
      receiveShowTimestamp: config.receiveShowTimestamp,
      receiveAutoScroll: config.receiveAutoScroll,
      sendMode: config.sendMode,
      sendAppendCRLF: config.sendAppendCRLF,
      localEcho: config.localEcho,
      sendInputText: config.sendInputText,
      autoConnect: config.autoConnect
    };
  }
  _loadTemplate(config) {
    const defaults = {
      version: "2.0",
      config: this._captureConfig(config),
      presetGroups: createDefaultPresetGroups(),
      entries: []
    };
    this.ensureDir();
    if (!existsSync3(TEMPLATE_FILE)) {
      try {
        writeFileSync3(TEMPLATE_FILE, JSON.stringify(defaults, null, 2), "utf-8");
      } catch (e) {
        console.error("[SessionStore] template save failed:", e);
      }
      return defaults;
    }
    try {
      const raw = readFileSync3(TEMPLATE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        config: { ...defaults.config, ...parsed.config ?? {} },
        presetGroups: Array.isArray(parsed.presetGroups) ? parsed.presetGroups : defaults.presetGroups,
        entries: Array.isArray(parsed.entries) ? parsed.entries : defaults.entries
      };
    } catch (e) {
      console.error("[SessionStore] template load failed:", e);
      return defaults;
    }
  }
  _readFile(path) {
    try {
      const raw = readFileSync3(path, "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  _writeFile(path, data) {
    try {
      writeFileSync3(path, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error("[SessionStore] write failed:", e);
    }
  }
  _parseFile(path) {
    try {
      const raw = readFileSync3(path, "utf-8");
      const data = JSON.parse(raw);
      if (data && data.version && data.id && data.config) {
        return data;
      }
      return null;
    } catch {
      return null;
    }
  }
  _removeFromTree(tree, id) {
    return tree.filter((n) => {
      if (n.id === id) return false;
      n.children = this._removeFromTree(n.children, id);
      return true;
    });
  }
  _updateChildPaths(node, oldParent, newParent) {
    for (const child of node.children) {
      const relative = child.filePath.slice(oldParent.length);
      child.filePath = newParent + relative;
      if (child.kind === "folder") {
        this._updateChildPaths(child, oldParent, newParent);
      }
    }
  }
  _containsNode(node, id) {
    for (const child of node.children) {
      if (child.id === id || this._containsNode(child, id)) return true;
    }
    return false;
  }
};

// src/serial-port.ts
import { EventEmitter } from "events";
var LINE_ENDING_BYTES = {
  none: [],
  lf: [10],
  cr: [13],
  crlf: [13, 10]
};
var serialportModule = null;
var serialportAvailable = false;
var serialportReason = "";
async function getSerialPort() {
  if (serialportModule) return serialportModule;
  if (!serialportAvailable && serialportReason) return null;
  try {
    serialportModule = await import("serialport");
    serialportAvailable = true;
    console.log("[serial] serialport \u6A21\u5757\u52A0\u8F7D\u6210\u529F");
    return serialportModule;
  } catch (e) {
    serialportReason = "serialport \u6A21\u5757\u52A0\u8F7D\u5931\u8D25: " + (e.message || e);
    console.warn("[serial]", serialportReason);
    return null;
  }
}
function isSerialPortAvailable() {
  return serialportAvailable;
}
var SerialPortManager = class extends EventEmitter {
  port = null;
  _isOpen = false;
  _currentDevice = null;
  _currentConfig = null;
  _lastError = null;
  get isOpen() {
    return this._isOpen;
  }
  get currentDevice() {
    return this._currentDevice;
  }
  get currentConfig() {
    return this._currentConfig;
  }
  get lastError() {
    return this._lastError;
  }
  /** 枚举可用串口设备 */
  static async listDevices() {
    const sp = await getSerialPort();
    if (!sp) return [];
    try {
      const ports = await sp.SerialPort.list();
      return ports.map((p) => ({
        path: p.path,
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber,
        pnpId: p.pnpId
      }));
    } catch {
      return [];
    }
  }
  /** 返回串口不可用的原因 */
  static unavailableReason() {
    return serialportReason;
  }
  /** 打开串口 */
  async open(device, config) {
    const sp = await getSerialPort();
    if (!sp) throw new Error(serialportReason || "serialport \u6A21\u5757\u4E0D\u53EF\u7528\uFF0C\u8BF7\u5728 Node.js \u73AF\u5883\u4E0B\u8FD0\u884C");
    if (this._isOpen) throw new Error("\u4E32\u53E3\u5DF2\u6253\u5F00");
    this._lastError = null;
    return new Promise((resolve, reject) => {
      const port = new sp.SerialPort({
        path: device.path,
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        stopBits: config.stopBits,
        parity: config.parity,
        rtscts: config.flowControl === "rtscts",
        xon: config.flowControl === "xonxoff",
        xoff: config.flowControl === "xonxoff"
      }, (err) => {
        if (err) {
          this._lastError = `\u6253\u5F00\u4E32\u53E3\u5931\u8D25: ${device.path} (${err.message})`;
          reject(err);
          return;
        }
        this.port = port;
        this._isOpen = true;
        this._currentDevice = device;
        this._currentConfig = config;
        port.on("data", (data) => {
          this.emit("data", { direction: "RX", data: Array.from(data), timestamp: (/* @__PURE__ */ new Date()).toISOString() });
        });
        port.on("error", (err2) => {
          this._lastError = err2.message;
          this.emit("error", err2.message);
        });
        port.on("close", () => {
          this._isOpen = false;
          this._currentDevice = null;
          this.port = null;
          this.emit("close");
        });
        this.emit("open", device);
        resolve();
      });
    });
  }
  /** 关闭串口 */
  async close() {
    if (!this._isOpen || !this.port) return;
    return new Promise((resolve) => {
      this.port.close(() => {
        this._isOpen = false;
        this._currentDevice = null;
        this.port = null;
        this.emit("close");
        resolve();
      });
    });
  }
  /** 发送数据 */
  async send(data) {
    if (!this._isOpen || !this.port) {
      this._lastError = "\u4E32\u53E3\u672A\u6253\u5F00";
      return false;
    }
    return new Promise((resolve) => {
      this.port.write(Buffer.from(data), (err) => {
        if (err) {
          this._lastError = `\u5199\u5165\u5931\u8D25: ${err.message}`;
          resolve(false);
        } else this.port.drain(() => resolve(true));
      });
    });
  }
  /** 发送字符串 + 行尾符 */
  async sendString(text, lineEnding) {
    const bytes = Array.from(new TextEncoder().encode(text));
    bytes.push(...LINE_ENDING_BYTES[lineEnding]);
    return this.send(bytes);
  }
  /** 编译预设指令为字节数组 */
  compilePayload(payload, mode) {
    if (mode === "ascii") return Array.from(new TextEncoder().encode(payload));
    const bytes = [];
    const tokens = payload.split(/[\s,\n\t]+/).filter(Boolean);
    for (const tok of tokens) {
      const b = parseInt(tok, 16);
      if (isNaN(b) || b < 0 || b > 255) return null;
      bytes.push(b);
    }
    return bytes;
  }
};

// src/index.ts
import http from "http";
import { readFileSync as readFileSync4 } from "fs";
import { WebSocketServer } from "ws";
var appConfig = new AppConfig();
var presetStore = new PresetStore();
var sessionStore = new SessionStore();
var serialPort = new SerialPortManager();
var currentTree = sessionStore.buildTree();
var activeSessionId = null;
var activeSessionPath = null;
var activeFilePath = null;
var logEntries = [];
function uuid3() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
async function handleMessage(ws, msg) {
  const { id, method, params } = msg;
  try {
    let result;
    switch (method) {
      // ---- 串口操作 ----
      case "list_devices": {
        const devices = await SerialPortManager.listDevices();
        result = {
          devices,
          serialPortStatus: { available: isSerialPortAvailable(), reason: SerialPortManager.unavailableReason() }
        };
        break;
      }
      case "open_port": {
        const { device, config } = params;
        await serialPort.open(device, config);
        appConfig.data.lastDevicePath = device.path;
        appConfig.updateFromSerialConfig(config);
        appConfig.save();
        result = { success: true, device };
        break;
      }
      case "close_port": {
        await serialPort.close();
        result = { success: true };
        break;
      }
      case "send_data": {
        const { text, mode, appendNewline, localEcho } = params;
        const le = appendNewline ? "crlf" : "none";
        let bytes;
        if (mode === "hex") {
          const compiled = serialPort.compilePayload(text, "hex");
          if (!compiled) {
            result = { error: "HEX \u683C\u5F0F\u9519\u8BEF" };
            break;
          }
          bytes = compiled;
          if (appendNewline) bytes.push(13, 10);
        } else {
          bytes = Array.from(new TextEncoder().encode(text));
          if (appendNewline) bytes.push(13, 10);
        }
        const ok = await serialPort.send(bytes);
        if (ok && localEcho) {
          const entry = {
            id: uuid3(),
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            direction: "TX",
            data: bytes
          };
          logEntries.push(entry);
          broadcast({ type: "log_entry", entry });
        }
        result = { success: ok };
        break;
      }
      case "send_preset": {
        const { command, appendNewline } = params;
        const compiled = serialPort.compilePayload(command.payload, command.displayMode);
        if (!compiled) {
          result = { error: "HEX \u683C\u5F0F\u9519\u8BEF" };
          break;
        }
        let bytes = compiled;
        if (appendNewline !== void 0 ? appendNewline : command.appendNewline) {
          bytes = [...bytes, 13, 10];
        }
        const ok = await serialPort.send(bytes);
        if (ok && appConfig.data.localEcho) {
          const entry = {
            id: uuid3(),
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            direction: "TX",
            data: bytes
          };
          logEntries.push(entry);
          broadcast({ type: "log_entry", entry });
        }
        result = { success: ok };
        break;
      }
      case "get_state": {
        result = getFullState();
        break;
      }
      // ---- 配置操作 ----
      case "update_config": {
        Object.assign(appConfig.data, params);
        appConfig.save();
        if (activeSessionId) {
          const node = activeSessionPath ? sessionStore.findByFilePath(currentTree, activeSessionPath) : sessionStore.findBySessionId(currentTree, activeSessionId);
          if (node) {
            sessionStore.saveSession(node, appConfig.data, presetStore.groups);
          }
        }
        broadcast({ type: "config_updated", config: appConfig.data });
        result = { success: true };
        break;
      }
      case "reset_config": {
        appConfig.resetAll();
        broadcast({ type: "config_updated", config: appConfig.data });
        result = { success: true };
        break;
      }
      // ---- 预设操作 ----
      case "add_group": {
        const g = presetStore.addGroup(params.name);
        broadcast({ type: "presets_updated", groups: presetStore.groups });
        result = { group: g };
        break;
      }
      case "remove_group": {
        presetStore.removeGroup(params.id);
        broadcast({ type: "presets_updated", groups: presetStore.groups });
        result = { success: true };
        break;
      }
      case "add_command": {
        const c = presetStore.addCommand(params.command, params.groupId);
        broadcast({ type: "presets_updated", groups: presetStore.groups });
        result = { command: c };
        break;
      }
      case "update_command": {
        presetStore.updateCommand(params.command, params.groupId);
        broadcast({ type: "presets_updated", groups: presetStore.groups });
        result = { success: true };
        break;
      }
      case "remove_command": {
        presetStore.removeCommand(params.cmdId, params.groupId);
        broadcast({ type: "presets_updated", groups: presetStore.groups });
        result = { success: true };
        break;
      }
      // ---- 会话操作 ----
      case "get_tree": {
        currentTree = sessionStore.buildTree();
        if (activeSessionPath && !sessionStore.findByFilePath(currentTree, activeSessionPath)) {
          activeSessionId = null;
          activeSessionPath = null;
          logEntries = [];
        }
        if (activeFilePath && !sessionStore.findByFilePath(currentTree, activeFilePath)) {
          activeFilePath = null;
        }
        result = { tree: currentTree, activeSessionId, activeFilePath, logEntries };
        break;
      }
      case "new_session": {
        const { node, tree } = sessionStore.newSession(
          params.name,
          params.parentId ?? null,
          appConfig.data,
          presetStore.groups,
          currentTree
        );
        currentTree = sessionStore.buildTree();
        if (node.sessionId) {
          activeSessionId = node.sessionId;
          activeSessionPath = node.filePath;
          activeFilePath = null;
          logEntries = [];
          const sessionData = sessionStore.loadSession(node);
          if (sessionData) {
            sessionStore.applySession(appConfig.data, presetStore.groups, sessionData.session);
          }
        }
        result = { node, tree: currentTree, activeSessionId };
        broadcast({
          type: "session_loaded",
          config: appConfig.data,
          presets: presetStore.groups,
          logEntries,
          activeSessionId,
          activeFilePath: null,
          tree: currentTree,
          serialOpen: serialPort.isOpen,
          serialDevice: serialPort.currentDevice,
          serialConfig: serialPort.currentConfig,
          serialError: serialPort.lastError
        });
        break;
      }
      case "new_folder": {
        const { node, tree } = sessionStore.newFolder(
          params.name,
          params.parentId ?? null,
          currentTree
        );
        currentTree = sessionStore.buildTree();
        result = { node, tree: currentTree };
        broadcast({ type: "tree_updated", tree: currentTree });
        break;
      }
      case "load_session": {
        const node = sessionStore.findNode(currentTree, params.nodeId);
        if (!node || node.kind !== "session") {
          result = { error: "\u4F1A\u8BDD\u4E0D\u5B58\u5728" };
          break;
        }
        if (activeSessionId) {
          const prevNode = activeSessionPath ? sessionStore.findByFilePath(currentTree, activeSessionPath) : sessionStore.findBySessionId(currentTree, activeSessionId);
          if (prevNode) {
            sessionStore.saveSession(prevNode, appConfig.data, presetStore.groups, logEntries);
          }
        }
        const data = sessionStore.loadSession(node);
        if (!data) {
          result = { error: "\u52A0\u8F7D\u4F1A\u8BDD\u5931\u8D25" };
          break;
        }
        sessionStore.applySession(appConfig.data, presetStore.groups, data.session);
        logEntries = data.session.entries ?? [];
        activeSessionId = node.sessionId;
        activeSessionPath = node.filePath;
        activeFilePath = null;
        sessionStore.saveSession(node, appConfig.data, presetStore.groups, logEntries);
        currentTree = sessionStore.buildTree();
        if (serialPort.isOpen) {
          await serialPort.close();
        }
        let autoOpenError = null;
        if (appConfig.data.autoConnect && appConfig.data.lastDevicePath) {
          try {
            await serialPort.open(
              { path: appConfig.data.lastDevicePath },
              appConfig.toSerialConfig()
            );
          } catch (err) {
            autoOpenError = err.message || String(err);
            broadcast({ type: "serial_error", message: `\u81EA\u52A8\u6253\u5F00\u4E32\u53E3\u5931\u8D25: ${autoOpenError}` });
          }
        }
        result = {
          session: data.session,
          config: appConfig.data,
          presets: presetStore.groups,
          logEntries,
          activeSessionId,
          activeFilePath: null,
          tree: currentTree,
          serialOpen: serialPort.isOpen,
          serialDevice: serialPort.currentDevice,
          serialConfig: serialPort.currentConfig,
          serialError: serialPort.lastError,
          autoOpenError
        };
        broadcast({ type: "session_loaded", ...result });
        break;
      }
      case "save_session": {
        const node = activeSessionId ? activeSessionPath ? sessionStore.findByFilePath(currentTree, activeSessionPath) : sessionStore.findBySessionId(currentTree, activeSessionId) : null;
        if (node) {
          sessionStore.saveSession(node, appConfig.data, presetStore.groups, logEntries);
        }
        result = { success: true };
        break;
      }
      case "delete_node": {
        const node = sessionStore.findNode(currentTree, params.nodeId);
        if (node) {
          if (activeSessionPath === node.filePath || !activeSessionPath && activeSessionId === node.sessionId) {
            activeSessionId = null;
            activeSessionPath = null;
          }
          if (activeFilePath === node.filePath) {
            activeFilePath = null;
          }
          currentTree = sessionStore.deleteNode(node, currentTree);
          currentTree = sessionStore.buildTree();
        }
        result = { tree: currentTree };
        broadcast({ type: "tree_updated", tree: currentTree });
        break;
      }
      case "rename_node": {
        const node = sessionStore.findNode(currentTree, params.nodeId);
        if (node) {
          const oldPath = node.filePath;
          currentTree = sessionStore.renameNode(node, params.newName, currentTree);
          if (activeSessionPath === oldPath) activeSessionPath = node.filePath;
          currentTree = sessionStore.buildTree();
        }
        result = { tree: currentTree };
        broadcast({ type: "tree_updated", tree: currentTree });
        break;
      }
      case "move_node": {
        const node = sessionStore.findNode(currentTree, params.nodeId);
        if (node) {
          const oldPath = node.filePath;
          currentTree = sessionStore.moveNode(node, params.targetId ?? null, currentTree);
          if (activeSessionPath === oldPath) activeSessionPath = node.filePath;
          currentTree = sessionStore.buildTree();
        }
        result = { tree: currentTree };
        broadcast({ type: "tree_updated", tree: currentTree });
        break;
      }
      // ---- 文件操作 ----
      case "open_file": {
        const node = sessionStore.findNode(currentTree, params.nodeId);
        if (!node || node.kind !== "file") {
          result = { error: "\u6587\u4EF6\u4E0D\u5B58\u5728" };
          break;
        }
        activeFilePath = node.filePath;
        activeSessionId = null;
        activeSessionPath = null;
        const content = sessionStore.readFileContent(node.filePath);
        result = {
          filePath: node.filePath,
          fileName: node.name,
          content,
          activeFilePath,
          activeSessionId: null
        };
        break;
      }
      case "save_file": {
        if (!activeFilePath) {
          result = { error: "\u6CA1\u6709\u6253\u5F00\u7684\u6587\u4EF6" };
          break;
        }
        sessionStore.writeFileContent(activeFilePath, params.content);
        result = { success: true };
        break;
      }
      // ---- 日志操作 ----
      case "clear_logs": {
        logEntries = [];
        broadcast({ type: "logs_cleared" });
        result = { success: true };
        break;
      }
      case "export_logs": {
        result = { entries: logEntries };
        break;
      }
      // ---- 获取存储路径 ----
      case "open_config_dir": {
        result = { path: appConfig.configDir, sessionsPath: sessionStore.storagePath };
        break;
      }
      default:
        result = { error: `\u672A\u77E5\u65B9\u6CD5: ${method}` };
    }
    if (id !== void 0) {
      ws.send(JSON.stringify({ id, result }));
    }
  } catch (err) {
    if (id !== void 0) {
      ws.send(JSON.stringify({ id, error: err.message }));
    }
  }
}
function getFullState() {
  return {
    config: appConfig.data,
    presets: presetStore.groups,
    tree: currentTree,
    logEntries,
    activeSessionId,
    activeFilePath,
    serialOpen: serialPort.isOpen,
    serialDevice: serialPort.currentDevice,
    serialConfig: serialPort.currentConfig,
    serialError: serialPort.lastError,
    serialPortStatus: { available: isSerialPortAvailable(), reason: SerialPortManager.unavailableReason() }
  };
}
var clients = /* @__PURE__ */ new Set();
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    try {
      ws.send(msg);
    } catch {
    }
  }
}
var HTML_PATH = new URL("./public/index.html", import.meta.url).pathname;
var HTML_CONTENT = readFileSync4(HTML_PATH, "utf-8");
serialPort.on("data", (evt) => {
  const entry = {
    id: uuid3(),
    timestamp: evt.timestamp,
    direction: evt.direction,
    data: evt.data
  };
  logEntries.push(entry);
  if (logEntries.length > 5e3) logEntries = logEntries.slice(-5e3);
  broadcast({ type: "log_entry", entry });
});
serialPort.on("error", (err) => broadcast({ type: "serial_error", message: err }));
serialPort.on("close", () => broadcast({ type: "serial_closed" }));
serialPort.on("open", (device) => broadcast({ type: "serial_opened", device }));
var PORT = 8765;
var ADDR = `http://localhost:${PORT}`;
var httpServer = http.createServer((req, res) => {
  if (req.method === "GET" && req.url !== "/ws") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML_CONTENT);
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});
var wss = new WebSocketServer({ server: httpServer, path: "/ws" });
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "initial_state", ...getFullState() }));
  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      await handleMessage(ws, msg);
    } catch (e) {
      console.error("[WS] message error:", e);
    }
  });
  ws.on("close", () => clients.delete(ws));
});
httpServer.listen(PORT, () => {
  console.log("");
  console.log("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
  console.log("\u2551   \u{1F50C} Serialport Tool - \u4E32\u53E3\u8C03\u8BD5\u52A9\u624B      \u2551");
  console.log("\u2551\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2551");
  console.log(`\u2551   \u5730\u5740: ${ADDR}              \u2551`);
  console.log("\u2551   \u6309 Ctrl+C \u9000\u51FA                     \u2551");
  console.log("\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D");
  console.log("");
  import("child_process").then((cp) => {
    const platform = process.platform;
    const openCmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
    cp.exec(`${openCmd} ${ADDR}`);
  });
});
