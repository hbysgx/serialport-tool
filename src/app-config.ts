/**
 * 应用配置管理 - 对应原 SerialMate Core/AppConfig.swift
 * 持久化到 ~/.serial_tool/config.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { SerialConfig, BaudRate, DataBits, StopBits, Parity, FlowControl, LineEnding } from "./serial-port";

export interface AppConfigData {
  // 串口参数
  baudRate: BaudRate;
  dataBits: DataBits;
  stopBits: StopBits;
  parity: Parity;
  flowControl: FlowControl;
  lastDevicePath: string | null;

  // 视图设置
  presetPanelVisible: boolean;
  sessionPanelVisible: boolean;
  receiveDisplayMode: "text" | "hex";
  receiveShowMixed: boolean;
  receiveShowTimestamp: boolean;
  receiveAutoScroll: boolean;
  sendMode: "ascii" | "hex";
  sendAppendCRLF: boolean;
  localEcho: boolean;
  sendInputText: string;

  // 行为
  autoConnect: boolean;
}

const DEFAULT_CONFIG: AppConfigData = {
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
  autoConnect: false,
};

const CONFIG_DIR = join(homedir(), ".serial_tool");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export class AppConfig {
  data: AppConfigData;

  constructor() {
    this.data = { ...DEFAULT_CONFIG };
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(CONFIG_FILE)) {
        const raw = readFileSync(CONFIG_FILE, "utf-8");
        const saved = JSON.parse(raw);
        this.data = { ...DEFAULT_CONFIG, ...saved };
      }
    } catch {
      // 使用默认值
    }
    this.ensureDir();
  }

  save(): void {
    this.ensureDir();
    try {
      writeFileSync(CONFIG_FILE, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (e) {
      console.error("[AppConfig] save failed:", e);
    }
  }

  private ensureDir(): void {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  /** 转换为 SerialConfig */
  toSerialConfig(): SerialConfig {
    return {
      baudRate: this.data.baudRate,
      dataBits: this.data.dataBits,
      stopBits: this.data.stopBits,
      parity: this.data.parity,
      flowControl: this.data.flowControl,
      lineEnding: this.data.sendAppendCRLF ? "crlf" : "none",
      localEcho: this.data.localEcho,
      showTimestamp: this.data.receiveShowTimestamp,
    };
  }

  /** 从 SerialConfig 更新 */
  updateFromSerialConfig(cfg: SerialConfig): void {
    this.data.baudRate = cfg.baudRate;
    this.data.dataBits = cfg.dataBits;
    this.data.stopBits = cfg.stopBits;
    this.data.parity = cfg.parity;
    this.data.flowControl = cfg.flowControl;
  }

  /** 重置为默认值 */
  resetAll(): void {
    this.data = { ...DEFAULT_CONFIG };
    this.save();
  }

  /** 获取存储目录路径 */
  get configDir(): string {
    return CONFIG_DIR;
  }

  /** 获取会话存储目录 */
  get sessionsDir(): string {
    return join(CONFIG_DIR, "sessions");
  }
}
