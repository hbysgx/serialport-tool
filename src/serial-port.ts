/**
 * 串口管理 - 基于 serialport 库 (动态导入,兼容 Bun)
 * 对应原 SerialMate Core/SerialPort.swift
 */

import { EventEmitter } from "events";

// ---- 类型定义 ----

export interface SerialDevice {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
}

export type Parity = "none" | "even" | "odd";
export type FlowControl = "none" | "rtscts" | "xonxoff";
export type LineEnding = "none" | "lf" | "cr" | "crlf";
export type BaudRate = 1200 | 2400 | 4800 | 9600 | 19200 | 38400 | 57600 | 115200 | 230400 | 460800 | 921600;
export type DataBits = 5 | 6 | 7 | 8;
export type StopBits = 1 | 2;

export interface SerialConfig {
  baudRate: BaudRate;
  dataBits: DataBits;
  stopBits: StopBits;
  parity: Parity;
  flowControl: FlowControl;
  lineEnding: LineEnding;
  localEcho: boolean;
  showTimestamp: boolean;
}

export const BAUD_RATES: BaudRate[] = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
export const DATA_BITS: DataBits[] = [5, 6, 7, 8];
export const STOP_BITS: StopBits[] = [1, 2];
export const PARITIES: Parity[] = ["none", "even", "odd"];
export const FLOW_CONTROLS: FlowControl[] = ["none", "rtscts", "xonxoff"];
export const LINE_ENDINGS: LineEnding[] = ["none", "lf", "cr", "crlf"];

export const LINE_ENDING_BYTES: Record<LineEnding, number[]> = {
  none: [], lf: [0x0A], cr: [0x0D], crlf: [0x0D, 0x0A],
};

export function lineEndingDisplay(le: LineEnding): string {
  switch (le) { case "none": return "无"; case "lf": return "\\n"; case "cr": return "\\r"; case "crlf": return "\\r\\n"; }
}

// ---- 是否可用 ----

let serialportModule: any = null;
let serialportAvailable = false;
let serialportReason = "";

async function getSerialPort(): Promise<any> {
  if (serialportModule) return serialportModule;
  if (!serialportAvailable && serialportReason) return null; // 已尝试过且失败

  try {
    serialportModule = await import("serialport");
    serialportAvailable = true;
    console.log("[serial] serialport 模块加载成功");
    return serialportModule;
  } catch (e: any) {
    serialportReason = "serialport 模块加载失败: " + (e.message || e);
    console.warn("[serial]", serialportReason);
    return null;
  }
}

export function isSerialPortAvailable(): boolean {
  return serialportAvailable;
}

export function getSerialPortStatus(): { available: boolean; reason: string } {
  return { available: serialportAvailable, reason: serialportReason };
}

// ---- 串口管理器 ----

export class SerialPortManager extends EventEmitter {
  private port: any = null;
  private _isOpen = false;
  private _currentDevice: SerialDevice | null = null;
  private _currentConfig: SerialConfig | null = null;
  private _lastError: string | null = null;

  get isOpen() { return this._isOpen; }
  get currentDevice() { return this._currentDevice; }
  get currentConfig() { return this._currentConfig; }
  get lastError() { return this._lastError; }

  /** 枚举可用串口设备 */
  static async listDevices(): Promise<SerialDevice[]> {
    const sp = await getSerialPort();
    if (!sp) return [];  // 不可用时返回空数组，UI 会显示提示
    try {
      const ports = await sp.SerialPort.list();
      return ports.map((p: any) => ({
        path: p.path,
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber,
        pnpId: p.pnpId,
      }));
    } catch {
      return [];
    }
  }

  /** 返回串口不可用的原因 */
  static unavailableReason(): string {
    return serialportReason;
  }

  /** 打开串口 */
  async open(device: SerialDevice, config: SerialConfig): Promise<void> {
    const sp = await getSerialPort();
    if (!sp) throw new Error(serialportReason || "serialport 模块不可用，请在 Node.js 环境下运行");
    if (this._isOpen) throw new Error("串口已打开");
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
        xoff: config.flowControl === "xonxoff",
      }, (err: any) => {
        if (err) { this._lastError = `打开串口失败: ${device.path} (${err.message})`; reject(err); return; }
        this.port = port;
        this._isOpen = true;
        this._currentDevice = device;
        this._currentConfig = config;
        port.on("data", (data: Buffer) => {
          this.emit("data", { direction: "RX" as const, data: Array.from(data), timestamp: new Date().toISOString() });
        });
        port.on("error", (err: Error) => { this._lastError = err.message; this.emit("error", err.message); });
        port.on("close", () => { this._isOpen = false; this._currentDevice = null; this.port = null; this.emit("close"); });
        this.emit("open", device);
        resolve();
      });
    });
  }

  /** 关闭串口 */
  async close(): Promise<void> {
    if (!this._isOpen || !this.port) return;
    return new Promise((resolve) => {
      this.port!.close(() => { this._isOpen = false; this._currentDevice = null; this.port = null; this.emit("close"); resolve(); });
    });
  }

  /** 发送数据 */
  async send(data: number[]): Promise<boolean> {
    if (!this._isOpen || !this.port) { this._lastError = "串口未打开"; return false; }
    return new Promise((resolve) => {
      this.port!.write(Buffer.from(data), (err: any) => {
        if (err) { this._lastError = `写入失败: ${err.message}`; resolve(false); }
        else this.port!.drain(() => resolve(true));
      });
    });
  }

  /** 发送字符串 + 行尾符 */
  async sendString(text: string, lineEnding: LineEnding): Promise<boolean> {
    const bytes = Array.from(new TextEncoder().encode(text));
    bytes.push(...LINE_ENDING_BYTES[lineEnding]);
    return this.send(bytes);
  }

  /** 编译预设指令为字节数组 */
  compilePayload(payload: string, mode: "ascii" | "hex"): number[] | null {
    if (mode === "ascii") return Array.from(new TextEncoder().encode(payload));
    const bytes: number[] = [];
    const tokens = payload.split(/[\s,\n\t]+/).filter(Boolean);
    for (const tok of tokens) {
      const b = parseInt(tok, 16);
      if (isNaN(b) || b < 0 || b > 255) return null;
      bytes.push(b);
    }
    return bytes;
  }
}
