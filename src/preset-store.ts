/**
 * 预设指令管理
 * 持久化到 ~/.serial_tool/presets.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ---- 模型 ----

export interface PresetCommand {
  id: string;
  name: string;
  payload: string;
  displayMode: "ascii" | "hex";
  hotkey: number | null;  // 1-9 or null
  appendNewline: boolean;
}

export interface PresetGroup {
  id: string;
  name: string;
  commands: PresetCommand[];
}

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const CONFIG_DIR = join(homedir(), ".serial_tool");
const PRESETS_FILE = join(CONFIG_DIR, "presets.json");

export function createDefaultPresetGroups(): PresetGroup[] {
  return [
    {
      id: uuid(),
      name: "AT",
      commands: [
        { id: uuid(), name: "AT 测试", payload: "AT", displayMode: "ascii", hotkey: 1, appendNewline: true },
        { id: uuid(), name: "关闭回显", payload: "ATE0", displayMode: "ascii", hotkey: 2, appendNewline: true },
        { id: uuid(), name: "模块信息", payload: "ATI", displayMode: "ascii", hotkey: 3, appendNewline: true },
        { id: uuid(), name: "查询版本", payload: "AT+GMR", displayMode: "ascii", hotkey: 4, appendNewline: true },
        { id: uuid(), name: "查询信号", payload: "AT+CSQ", displayMode: "ascii", hotkey: null, appendNewline: true },
        { id: uuid(), name: "注册状态", payload: "AT+CREG?", displayMode: "ascii", hotkey: null, appendNewline: true },
        { id: uuid(), name: "附着状态", payload: "AT+CGATT?", displayMode: "ascii", hotkey: null, appendNewline: true },
        { id: uuid(), name: "查询 IMEI", payload: "AT+CGSN", displayMode: "ascii", hotkey: null, appendNewline: true },
        { id: uuid(), name: "重启模块", payload: "AT+CFUN=1,1", displayMode: "ascii", hotkey: null, appendNewline: true },
      ],
    },
    {
      id: uuid(),
      name: "Modbus",
      commands: [
        { id: uuid(), name: "读保持寄存器 0x0001", payload: "01 03 00 01 00 01 D5 CA", displayMode: "hex", hotkey: 5, appendNewline: false },
        { id: uuid(), name: "写单个寄存器", payload: "01 06 00 01 00 0A 9A 0B", displayMode: "hex", hotkey: 6, appendNewline: false },
      ],
    },
  ];
}

export class PresetStore {
  groups: PresetGroup[] = [];

  constructor() {
    this.load();
    if (this.groups.length === 0) {
      this.groups = createDefaultPresetGroups();
      this.save();
    }
  }

  private ensureDir(): void {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  private load(): void {
    try {
      if (existsSync(PRESETS_FILE)) {
        const raw = readFileSync(PRESETS_FILE, "utf-8");
        this.groups = JSON.parse(raw);
      }
    } catch {
      // 使用默认值
    }
  }

  save(): void {
    this.ensureDir();
    try {
      writeFileSync(PRESETS_FILE, JSON.stringify(this.groups, null, 2), "utf-8");
    } catch (e) {
      console.error("[PresetStore] save failed:", e);
    }
  }

  addGroup(name: string): PresetGroup {
    const g: PresetGroup = { id: uuid(), name, commands: [] };
    this.groups.push(g);
    this.save();
    return g;
  }

  removeGroup(id: string): void {
    this.groups = this.groups.filter((g) => g.id !== id);
    this.save();
  }

  addCommand(cmd: Omit<PresetCommand, "id">, groupId: string): PresetCommand | null {
    const g = this.groups.find((g) => g.id === groupId);
    if (!g) return null;
    const c: PresetCommand = { ...cmd, id: uuid() };
    g.commands.push(c);
    this.save();
    return c;
  }

  updateCommand(cmd: PresetCommand, groupId: string): boolean {
    const g = this.groups.find((g) => g.id === groupId);
    if (!g) return false;
    const idx = g.commands.findIndex((c) => c.id === cmd.id);
    if (idx === -1) return false;
    g.commands[idx] = cmd;
    this.save();
    return true;
  }

  removeCommand(cmdId: string, groupId: string): void {
    const g = this.groups.find((g) => g.id === groupId);
    if (!g) return;
    g.commands = g.commands.filter((c) => c.id !== cmdId);
    this.save();
  }

  /** 在所有分组中查找 hotkey == n 的命令 */
  findByHotkey(n: number): PresetCommand | null {
    for (const g of this.groups) {
      const cmd = g.commands.find((c) => c.hotkey === n);
      if (cmd) return cmd;
    }
    return null;
  }
}
