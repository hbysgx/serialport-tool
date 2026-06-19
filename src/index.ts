/**
 * Serial Tool - 串口调试助手 Web 版
 * 主入口: HTTP 服务器 + WebSocket 实时通信
 */

import { AppConfig } from "./app-config";
import { PresetStore } from "./preset-store";
import { SessionStore, type LogEntry, type TreeNode } from "./session-store";
import { SerialPortManager, isSerialPortAvailable, type SerialConfig, type LineEnding } from "./serial-port";

// ---- 初始化 ----

const appConfig = new AppConfig();
const presetStore = new PresetStore();
const sessionStore = new SessionStore();
const serialPort = new SerialPortManager();

let currentTree = sessionStore.buildTree();
let activeSessionId: string | null = null;
let activeSessionPath: string | null = null;
let activeFilePath: string | null = null;
let logEntries: LogEntry[] = [];

// ---- 工具函数 ----

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---- WebSocket 消息处理 ----

type WSMessage = {
  id?: number;
  method: string;
  params?: any;
};

async function handleMessage(ws: any, msg: WSMessage): Promise<void> {
  const { id, method, params } = msg;

  try {
    let result: any;

    switch (method) {
      // ---- 串口操作 ----
      case "list_devices": {
        const devices = await SerialPortManager.listDevices();
        result = {
          devices,
          serialPortStatus: { available: isSerialPortAvailable(), reason: SerialPortManager.unavailableReason() },
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
        const le: LineEnding = appendNewline ? "crlf" : "none";
        let bytes: number[];

        if (mode === "hex") {
          const compiled = serialPort.compilePayload(text, "hex");
          if (!compiled) {
            result = { error: "HEX 格式错误" };
            break;
          }
          bytes = compiled;
          if (appendNewline) bytes.push(0x0D, 0x0A);
        } else {
          bytes = Array.from(new TextEncoder().encode(text));
          if (appendNewline) bytes.push(0x0D, 0x0A);
        }

        const ok = await serialPort.send(bytes);
        if (ok && localEcho) {
          const entry: LogEntry = {
            id: uuid(),
            timestamp: new Date().toISOString(),
            direction: "TX",
            data: bytes,
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
          result = { error: "HEX 格式错误" };
          break;
        }
        let bytes = compiled;
        if (appendNewline !== undefined ? appendNewline : command.appendNewline) {
          bytes = [...bytes, 0x0D, 0x0A];
        }
        const ok = await serialPort.send(bytes);
        if (ok && appConfig.data.localEcho) {
          const entry: LogEntry = {
            id: uuid(),
            timestamp: new Date().toISOString(),
            direction: "TX",
            data: bytes,
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
          const node = activeSessionPath
            ? sessionStore.findByFilePath(currentTree, activeSessionPath)
            : sessionStore.findBySessionId(currentTree, activeSessionId);
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
          params.name, params.parentId ?? null,
          appConfig.data, presetStore.groups, currentTree
        );
        currentTree = sessionStore.buildTree();

        // 自动加载新创建的会话
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
          serialError: serialPort.lastError,
        });
        break;
      }

      case "new_folder": {
        const { node, tree } = sessionStore.newFolder(
          params.name, params.parentId ?? null, currentTree
        );
        currentTree = sessionStore.buildTree();
        result = { node, tree: currentTree };
        broadcast({ type: "tree_updated", tree: currentTree });
        break;
      }

      case "load_session": {
        const node = sessionStore.findNode(currentTree, params.nodeId);
        if (!node || node.kind !== "session") {
          result = { error: "会话不存在" };
          break;
        }

        // 保存当前会话
        if (activeSessionId) {
          const prevNode = activeSessionPath
            ? sessionStore.findByFilePath(currentTree, activeSessionPath)
            : sessionStore.findBySessionId(currentTree, activeSessionId);
          if (prevNode) {
            sessionStore.saveSession(prevNode, appConfig.data, presetStore.groups, logEntries);
          }
        }

        const data = sessionStore.loadSession(node);
        if (!data) {
          result = { error: "加载会话失败" };
          break;
        }

        sessionStore.applySession(appConfig.data, presetStore.groups, data.session);
        logEntries = data.session.entries ?? [];
        activeSessionId = node.sessionId!;
        activeSessionPath = node.filePath;
        activeFilePath = null;

        // 自动保存
        sessionStore.saveSession(node, appConfig.data, presetStore.groups, logEntries);
        currentTree = sessionStore.buildTree();

        // 关闭当前串口
        if (serialPort.isOpen) {
          await serialPort.close();
        }

        let autoOpenError: string | null = null;
        if (appConfig.data.autoConnect && appConfig.data.lastDevicePath) {
          try {
            await serialPort.open(
              { path: appConfig.data.lastDevicePath },
              appConfig.toSerialConfig()
            );
          } catch (err: any) {
            autoOpenError = err.message || String(err);
            broadcast({ type: "serial_error", message: `自动打开串口失败: ${autoOpenError}` });
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
          autoOpenError,
        };
        broadcast({ type: "session_loaded", ...result });
        break;
      }

      case "save_session": {
        const node = activeSessionId
          ? (activeSessionPath
              ? sessionStore.findByFilePath(currentTree, activeSessionPath)
              : sessionStore.findBySessionId(currentTree, activeSessionId))
          : null;
        if (node) {
          sessionStore.saveSession(node, appConfig.data, presetStore.groups, logEntries);
        }
        result = { success: true };
        break;
      }

      case "delete_node": {
        const node = sessionStore.findNode(currentTree, params.nodeId);
        if (node) {
          if (activeSessionPath === node.filePath || (!activeSessionPath && activeSessionId === node.sessionId)) {
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
          result = { error: "文件不存在" };
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
          activeSessionId: null,
        };
        break;
      }

      case "save_file": {
        if (!activeFilePath) {
          result = { error: "没有打开的文件" };
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
        result = { error: `未知方法: ${method}` };
    }

    if (id !== undefined) {
      ws.send(JSON.stringify({ id, result }));
    }
  } catch (err: any) {
    if (id !== undefined) {
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
    serialPortStatus: { available: isSerialPortAvailable(), reason: SerialPortManager.unavailableReason() },
  };
}

// ---- WebSocket 广播 ----

const clients = new Set<any>();

function broadcast(data: any): void {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    try { ws.send(msg); } catch {}
  }
}

// ---- HTTP + WebSocket 服务器 ----

import http from "http";
import { readFileSync } from "fs";
import { WebSocketServer } from "ws";

const HTML_PATH = new URL("./public/index.html", import.meta.url).pathname;
const HTML_CONTENT = readFileSync(HTML_PATH, "utf-8");

// 监听串口数据事件
serialPort.on("data", (evt: { direction: "RX" | "TX"; data: number[]; timestamp: string }) => {
  const entry: LogEntry = {
    id: uuid(),
    timestamp: evt.timestamp,
    direction: evt.direction,
    data: evt.data,
  };
  logEntries.push(entry);
  if (logEntries.length > 5000) logEntries = logEntries.slice(-5000);
  broadcast({ type: "log_entry", entry });
});
serialPort.on("error", (err: string) => broadcast({ type: "serial_error", message: err }));
serialPort.on("close", () => broadcast({ type: "serial_closed" }));
serialPort.on("open", (device: any) => broadcast({ type: "serial_opened", device }));

const PORT = 8765;
const ADDR = `http://localhost:${PORT}`;

// HTTP server
const httpServer = http.createServer((req, res) => {
  if (req.method === "GET" && req.url !== "/ws") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML_CONTENT);
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

// WebSocket server (附着在 HTTP server 上)
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
wss.on("connection", (ws) => {
  clients.add(ws);
  // 发送完整初始状态
  ws.send(JSON.stringify({ type: "initial_state", ...getFullState() }));

  ws.on("message", async (data) => {
    try {
      const msg: WSMessage = JSON.parse(data.toString());
      await handleMessage(ws, msg);
    } catch (e) {
      console.error("[WS] message error:", e);
    }
  });

  ws.on("close", () => clients.delete(ws));
});

httpServer.listen(PORT, () => {
  console.log("");
  console.log("╔══════════════════════════════════════╗");
  console.log("║   🔌 Serial Tool - 串口调试助手      ║");
  console.log("║──────────────────────────────────────║");
  console.log(`║   地址: ${ADDR}              ║`);
  console.log("║   按 Ctrl+C 退出                     ║");
  console.log("╚══════════════════════════════════════╝");
  console.log("");

  // 自动打开浏览器
  import("child_process").then(cp => {
    const platform = process.platform;
    const openCmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
    cp.exec(`${openCmd} ${ADDR}`);
  });
});
