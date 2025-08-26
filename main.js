
import WebSocket from "ws";

export {
  onInitialize,
  emitUpdate as onUpdate,
  emitUpdate as onGet
}

let ws;
let retryTimeout;

async function onInitialize(config, runApi) {
  console.log('[websockets] Initializing WebSocket client');
  if (config.verbose) {
    console.log('[websockets] Config:', { serverUrl: config.serverUrl, websocketPrefix: config.websocketPrefix });
  }

  connect(config, runApi);
}

function connect(config, runApi) {
  const serverUrl = "ws://" + config.serverUrl;
  console.log('[websockets] Connecting to server:', serverUrl);
  
  ws = new WebSocket(serverUrl);

  ws.on("open", () => {
    console.log("[websockets] Connected to server:", config.serverUrl);
    if (config.verbose) {
      console.log("[websockets] WebSocket connection established");
    }
  });

  ws.on("close", (code, reason) => {
    console.log("[websockets] Disconnected from server:", code, reason?.toString());
    if (config.verbose) {
      console.log("[websockets] Close details - code:", code, "reason:", reason?.toString());
    }
    scheduleReconnect(config, runApi);
  });

  ws.on("error", (error) => {
    console.error("[websockets] Connection error:", error.message || error);
    if (config.verbose) {
      console.error("[websockets] Full connection error:", error);
    }
    scheduleReconnect(config, runApi);
  });

  ws.on("message", async (data) => {
    const message = data.toString();
    console.log("[websockets] Received message:", message);
    
    if (config.verbose) {
      console.log("[websockets] Raw message data:", message);
      console.log("[websockets] Checking prefix filter:", config.websocketPrefix);
    }

    try {
      const separatorIndex = message.indexOf('|');
      if (separatorIndex === -1) {
        if (config.verbose) {
          console.log("[websockets] Message ignored - no separator found");
        }
        return;
      }

      let key = message.substring(0, separatorIndex);
      const value = message.substring(separatorIndex + 1);

      if (!key.startsWith(config.websocketPrefix || '')) {
        if (config.verbose) {
          console.log("[websockets] Message ignored - prefix mismatch");
        }
        return;
      }

      const originalKey = key;
      key = key.slice(config.websocketPrefix?.length || 0);

      let [plugin, api, ...target] = key.split("/");
      const eventName = plugin + "/" + api;
      target = target.join("/");

      console.log("[websockets] Processing API call:", eventName, "target:", target);
      if (config.verbose) {
        console.log("[websockets] API call details - original key:", originalKey, "parsed plugin:", plugin, "parsed api:", api, "parsed target:", target, "value:", value);
        console.log("[websockets] Calling runApi...");
      }

      let parsedValue;
      try {
        parsedValue = JSON.parse(value);
      } catch (e) {
        parsedValue = value;
      }

      await runApi(eventName, target, parsedValue);

      if (config.verbose) {
        console.log("[websockets] API call completed successfully");
      }
    } catch (error) {
      console.error("[websockets] Error handling incoming message:", error.message || error);
      if (config.verbose) {
        console.error("[websockets] Full error details:", error);
        console.error("[websockets] Error stack:", error.stack);
      }
    }
  });
}

function scheduleReconnect(config, runApi) {
  if (retryTimeout) return;
  
  console.log("[websockets] Scheduling reconnect in 3 seconds...");
  retryTimeout = setTimeout(() => {
    retryTimeout = null;
    connect(config, runApi);
  }, 3000);
}

async function emitUpdate(config, runApi, id, data) {
  console.log("[websockets] Emitting update for ID:", id);
  if (config.verbose) {
    console.log("[websockets] Emit details - websocket ready:", ws?.readyState === WebSocket.OPEN, "data:", data);
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      const key = (config.websocketPrefix || '') + id;
      const value = typeof data === 'string' ? data : JSON.stringify(data);
      const message = key + '|' + value;
      
      if (config.verbose) {
        console.log("[websockets] Sending message:", message, "with prefix:", config.websocketPrefix);
      }

      ws.send(message);
      console.log("[websockets] Successfully sent message for key:", key);

      if (config.verbose) {
        console.log("[websockets] Send completed - key:", key, "value:", value);
      }
    } catch (error) {
      console.error("[websockets] Error emitting update:", error.message || error);
      if (config.verbose) {
        console.error("[websockets] Full emit error:", error);
        console.error("[websockets] Error stack:", error.stack);
      }
    }
  } else {
    console.log("[websockets] Cannot emit - websocket not connected");
    if (config.verbose) {
      console.log("[websockets] WebSocket state - exists:", !!ws, "readyState:", ws?.readyState);
    }
  }
  return data;
}
