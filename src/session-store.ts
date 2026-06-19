/**
 * 会话存储 - 对应原 SerialMate Core/SessionStore.swift
 * 会话保存到 ~/.serial_tool/sessions/<id>.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, renameSync, rmSync } from "fs";
import { join, basename, dirname, extname } from "path";
import { homedir } from "os";
import type { AppConfigData } from "./app-config";
import { createDefaultPresetGroups, type PresetGroup } from "./preset-store";

// ---- 树节点模型 ----

export type NodeKind = "folder" | "session" | "file";

export interface TreeNode {
  id: string;
  name: string;
  kind: NodeKind;
  sessionId?: string;       // only for sessions
  filePath: string;          // absolute path on disk
  children: TreeNode[];
  expanded: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: string;  // ISO string
  direction: "RX" | "TX" | "--";
  data: number[];     // byte array for JSON
}

export interface SessionConfigSnapshot {
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: string;
  flowControl: string;
  lastDevicePath: string | null;
  presetPanelVisible: boolean;
  sessionPanelVisible: boolean;
  receiveDisplayMode: string;
  receiveShowMixed: boolean;
  receiveShowTimestamp: boolean;
  receiveAutoScroll: boolean;
  sendMode: string;
  sendAppendCRLF: boolean;
  localEcho: boolean;
  sendInputText: string;
  autoConnect: boolean;
}

export interface SessionData {
  version: string;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  config: SessionConfigSnapshot;
  presetGroups: PresetGroup[];
  entries: LogEntry[];
  __serial_session?: string;
}

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const CONFIG_DIR = join(homedir(), ".serial_tool");
const TEMPLATE_FILE = join(CONFIG_DIR, "template.json");

export class SessionStore {
  private baseURL: string;

  constructor() {
    this.baseURL = join(CONFIG_DIR, "sessions");
    if (!existsSync(this.baseURL)) {
      mkdirSync(this.baseURL, { recursive: true });
    }
  }

  get storagePath(): string {
    return this.baseURL;
  }

  private ensureDir(): void {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    if (!existsSync(this.baseURL)) {
      mkdirSync(this.baseURL, { recursive: true });
    }
  }

  /** 递归扫描构建树 */
  buildTree(): TreeNode[] {
    return this._buildTree(this.baseURL);
  }

  private _buildTree(dir: string): TreeNode[] {
    const nodes: TreeNode[] = [];
    let entries: string[];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return nodes;
    }

    for (const name of entries) {
      const fullPath = join(dir, name);
      let st;
      try {
        st = statSync(fullPath);
      } catch {
        continue;
      }

      if (st.isDirectory()) {
        const folder: TreeNode = {
          id: uuid(),
          name,
          kind: "folder",
          filePath: fullPath,
          children: this._buildTree(fullPath),
          expanded: true,
        };
        nodes.push(folder);
      } else {
        // 尝试解析为会话
        const parsed = this._parseFile(fullPath);
        if (parsed) {
          const session: TreeNode = {
            id: uuid(),
            name: basename(name, extname(name)),
            kind: "session",
            sessionId: parsed.id,
            filePath: fullPath,
            children: [],
            expanded: true,
          };
          nodes.push(session);
        } else {
          // 普通文件
          const file: TreeNode = {
            id: uuid(),
            name,
            kind: "file",
            filePath: fullPath,
            children: [],
            expanded: true,
          };
          nodes.push(file);
        }
      }
    }
    return this.sortTree(nodes);
  }

  /** 按类型和名称排序: 目录 -> 会话 -> 普通文件 */
  sortTree(tree: TreeNode[]): TreeNode[] {
    const kindOrder: Record<NodeKind, number> = { folder: 0, session: 1, file: 2 };
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
  findNode(tree: TreeNode[], id: string): TreeNode | null {
    for (const n of tree) {
      if (n.id === id) return n;
      const r = this.findNode(n.children, id);
      if (r) return r;
    }
    return null;
  }

  /** 在树中查找会话节点 */
  findBySessionId(tree: TreeNode[], sid: string): TreeNode | null {
    for (const n of tree) {
      if (n.kind === "session" && n.sessionId === sid) return n;
      const r = this.findBySessionId(n.children, sid);
      if (r) return r;
    }
    return null;
  }

  /** 按文件路径查找节点 */
  findByFilePath(tree: TreeNode[], filePath: string): TreeNode | null {
    for (const n of tree) {
      if (n.filePath === filePath) return n;
      const r = this.findByFilePath(n.children, filePath);
      if (r) return r;
    }
    return null;
  }

  /** 查找父节点 */
  findParent(tree: TreeNode[], id: string): TreeNode | null {
    for (const n of tree) {
      if (n.children.some((c) => c.id === id)) return n;
      const r = this.findParent(n.children, id);
      if (r) return r;
    }
    return null;
  }

  // ---- 新建 ----

  /** 新建会话 */
  newSession(name: string, parentId: string | null, config: AppConfigData,
             _presetGroups: PresetGroup[], tree: TreeNode[]): { node: TreeNode; tree: TreeNode[] } {
    const parentDir = parentId ? this.findNode(tree, parentId)?.filePath ?? this.baseURL : this.baseURL;
    const sessionId = uuid();
    const fileName = `${name}.json`;
    let filePath = join(parentDir, fileName);

    // 防重名
    if (existsSync(filePath)) {
      let idx = 2;
      while (true) {
        filePath = join(parentDir, `${name} ${idx}.json`);
        if (!existsSync(filePath)) break;
        idx++;
      }
    }
    const displayName = basename(filePath, extname(filePath));
    const template = this._loadTemplate(config);

    const data: SessionData = {
      version: "2.0",
      id: sessionId,
      name: displayName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config: JSON.parse(JSON.stringify(template.config)),
      presetGroups: JSON.parse(JSON.stringify(template.presetGroups)),
      entries: JSON.parse(JSON.stringify(template.entries)),
      __serial_session: new Date().toISOString(),
    };
    this._writeFile(filePath, data);

    const node: TreeNode = {
      id: uuid(),
      name: displayName,
      kind: "session",
      sessionId,
      filePath,
      children: [],
      expanded: true,
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
  newFolder(name: string, parentId: string | null, tree: TreeNode[]): { node: TreeNode; tree: TreeNode[] } {
    const parentDir = parentId ? this.findNode(tree, parentId)?.filePath ?? this.baseURL : this.baseURL;
    let dirPath = join(parentDir, name);
    if (existsSync(dirPath)) {
      let idx = 2;
      while (true) {
        dirPath = join(parentDir, `${name} ${idx}`);
        if (!existsSync(dirPath)) break;
        idx++;
      }
    }
    mkdirSync(dirPath, { recursive: true });

    const node: TreeNode = {
      id: uuid(),
      name: basename(dirPath),
      kind: "folder",
      filePath: dirPath,
      children: [],
      expanded: true,
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

  loadSession(node: TreeNode): { session: SessionData } | null {
    if (node.kind !== "session") return null;
    const data = this._readFile(node.filePath);
    if (!data) return null;
    return { session: data };
  }

  /** 从会话数据恢复配置和预设 */
  applySession(config: AppConfigData, presetGroups: PresetGroup[], session: SessionData): void {
    // 恢复配置
    const s = session.config;
    config.baudRate = (s.baudRate as any) ?? config.baudRate;
    config.dataBits = (s.dataBits as any) ?? config.dataBits;
    config.stopBits = (s.stopBits as any) ?? config.stopBits;
    config.parity = (s.parity as any) ?? config.parity;
    config.flowControl = (s.flowControl as any) ?? config.flowControl;
    config.lastDevicePath = s.lastDevicePath ?? null;
    config.presetPanelVisible = s.presetPanelVisible ?? true;
    config.sessionPanelVisible = s.sessionPanelVisible ?? true;
    config.receiveDisplayMode = (s.receiveDisplayMode as any) ?? "text";
    config.receiveShowMixed = s.receiveShowMixed ?? true;
    config.receiveShowTimestamp = s.receiveShowTimestamp ?? true;
    config.receiveAutoScroll = s.receiveAutoScroll ?? true;
    config.sendMode = (s.sendMode as any) ?? "ascii";
    config.sendAppendCRLF = s.sendAppendCRLF ?? true;
    config.localEcho = s.localEcho ?? true;
    config.sendInputText = s.sendInputText ?? "";
    config.autoConnect = s.autoConnect ?? false;

    // 恢复预设
    presetGroups.length = 0;
    for (const g of session.presetGroups) {
      presetGroups.push(JSON.parse(JSON.stringify(g)));
    }
  }

  // ---- 保存 ----

  saveSession(node: TreeNode, config: AppConfigData, presetGroups: PresetGroup[],
              entries?: LogEntry[]): boolean {
    if (node.kind !== "session" || !node.sessionId) return false;
    const existing = this._readFile(node.filePath);
    const data: SessionData = {
      version: "2.0",
      id: node.sessionId,
      name: node.name,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      config: this._captureConfig(config),
      presetGroups: JSON.parse(JSON.stringify(presetGroups)),
      entries: entries ?? existing?.entries ?? [],
      __serial_session: existing?.__serial_session ?? new Date().toISOString(),
    };
    this._writeFile(node.filePath, data);
    return true;
  }

  // ---- 删除 ----

  deleteNode(node: TreeNode, tree: TreeNode[]): TreeNode[] {
    // 递归删除目录
    if (node.kind === "folder") {
      try { rmSync(node.filePath, { recursive: true, force: true }); } catch {}
    } else {
      try { rmSync(node.filePath); } catch {}
    }
    return this.sortTree(this._removeFromTree(tree, node.id));
  }

  // ---- 重命名 ----

  renameNode(node: TreeNode, newName: string, tree: TreeNode[]): TreeNode[] {
    const trimmed = newName.trim();
    if (!trimmed) return tree;

    const parentDir = dirname(node.filePath);
    let newPath: string;
    if (node.kind === "folder") {
      newPath = join(parentDir, trimmed);
    } else {
      const ext = extname(node.filePath);
      newPath = join(parentDir, ext ? `${trimmed}${ext}` : trimmed);
    }

    try { renameSync(node.filePath, newPath); } catch (e) {
      console.error("[SessionStore] rename failed:", e);
      return tree;
    }

    // 更新 JSON 中的 name
    if (node.kind === "session") {
      const data = this._readFile(newPath);
      if (data) {
        data.name = trimmed;
        data.updatedAt = new Date().toISOString();
        this._writeFile(newPath, data);
      }
    }

    // 更新子节点的路径
    if (node.kind === "folder") {
      this._updateChildPaths(node, node.filePath, newPath);
    }

    node.name = trimmed;
    node.filePath = newPath;
    return this.sortTree(tree);
  }

  // ---- 移动(拖拽) ----

  moveNode(node: TreeNode, targetId: string | null, tree: TreeNode[]): TreeNode[] {
    const target = targetId ? this.findNode(tree, targetId) : null;
    if (target && target.kind !== "folder") return tree;
    if (target && target.id === node.id) return tree;
    if (target && node.kind === "folder" && this._containsNode(node, target.id)) return tree;

    const destDir = target?.filePath ?? this.baseURL;
    const destPath = join(destDir, basename(node.filePath));

    try { renameSync(node.filePath, destPath); } catch (e) {
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

  readFileContent(filePath: string): string {
    try {
      return readFileSync(filePath, "utf-8");
    } catch {
      return "";
    }
  }

  writeFileContent(filePath: string, content: string): void {
    try {
      writeFileSync(filePath, content, "utf-8");
    } catch (e) {
      console.error("[SessionStore] write file failed:", e);
    }
  }

  // ---- 内部方法 ----

  private _captureConfig(config: AppConfigData): SessionConfigSnapshot {
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
      autoConnect: config.autoConnect,
    };
  }

  private _loadTemplate(config: AppConfigData): { config: SessionConfigSnapshot; presetGroups: PresetGroup[]; entries: LogEntry[] } {
    const defaults = {
      version: "2.0",
      config: this._captureConfig(config),
      presetGroups: createDefaultPresetGroups(),
      entries: [],
    };

    this.ensureDir();
    if (!existsSync(TEMPLATE_FILE)) {
      try {
        writeFileSync(TEMPLATE_FILE, JSON.stringify(defaults, null, 2), "utf-8");
      } catch (e) {
        console.error("[SessionStore] template save failed:", e);
      }
      return defaults;
    }

    try {
      const raw = readFileSync(TEMPLATE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        config: { ...defaults.config, ...(parsed.config ?? {}) },
        presetGroups: Array.isArray(parsed.presetGroups) ? parsed.presetGroups : defaults.presetGroups,
        entries: Array.isArray(parsed.entries) ? parsed.entries : defaults.entries,
      };
    } catch (e) {
      console.error("[SessionStore] template load failed:", e);
      return defaults;
    }
  }

  private _readFile(path: string): SessionData | null {
    try {
      const raw = readFileSync(path, "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private _writeFile(path: string, data: SessionData): void {
    try {
      writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error("[SessionStore] write failed:", e);
    }
  }

  private _parseFile(path: string): SessionData | null {
    try {
      const raw = readFileSync(path, "utf-8");
      const data = JSON.parse(raw);
      // 验证是否为有效的会话文件
      if (data && data.version && data.id && data.config) {
        return data;
      }
      return null;
    } catch {
      return null;
    }
  }

  private _removeFromTree(tree: TreeNode[], id: string): TreeNode[] {
    return tree.filter((n) => {
      if (n.id === id) return false;
      n.children = this._removeFromTree(n.children, id);
      return true;
    });
  }

  private _updateChildPaths(node: TreeNode, oldParent: string, newParent: string): void {
    for (const child of node.children) {
      const relative = child.filePath.slice(oldParent.length);
      child.filePath = newParent + relative;
      if (child.kind === "folder") {
        this._updateChildPaths(child, oldParent, newParent);
      }
    }
  }

  private _containsNode(node: TreeNode, id: string): boolean {
    for (const child of node.children) {
      if (child.id === id || this._containsNode(child, id)) return true;
    }
    return false;
  }
}
