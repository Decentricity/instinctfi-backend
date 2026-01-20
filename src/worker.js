const UPSTREAM_WS_URL = "https://dlob.drift.trade/ws";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    const upgradeHeader = (request.headers.get("Upgrade") || "").toLowerCase();
    if (upgradeHeader !== "websocket") {
      console.log("HTTP request", pathname);
      if (pathname === "/health") {
        return Response.json({
          ok: true,
          now: new Date().toISOString()
        });
      }
      if (pathname === "/") {
        return new Response(
          "InstictFi DLOB WebSocket proxy. Connect via WebSocket to this endpoint.",
          { status: 200 }
        );
      }
      return new Response("Expected WebSocket upgrade.", { status: 426 });
    }

    const pair = new WebSocketPair();
    const clientSocket = pair[0];
    const serverSocket = pair[1];
    serverSocket.accept();

    const handleProxy = async () => {
      let upstreamSocket;
      const pendingMessages = [];
      let upstreamReady = false;
      const sendUpstream = (data) => {
        if (upstreamReady && upstreamSocket) {
          upstreamSocket.send(data);
        } else {
          pendingMessages.push(data);
        }
      };

      serverSocket.addEventListener("message", (event) => {
        try {
          sendUpstream(event.data);
        } catch (err) {
          try {
            serverSocket.close(1011, "Upstream send failed");
          } catch (err2) {}
        }
      });

      try {
        const protocolHeader = request.headers.get("Sec-WebSocket-Protocol");
        const upstreamHeaders = {
          Upgrade: "websocket",
          Connection: "Upgrade",
          Origin: "https://instinctfi.xyz",
          "User-Agent": "Mozilla/5.0 (Cloudflare Worker)"
        };
        if (protocolHeader) {
          upstreamHeaders["Sec-WebSocket-Protocol"] = protocolHeader;
        }
        console.log("WS connect -> upstream");
        const upstreamResp = await fetch(UPSTREAM_WS_URL, {
          headers: upstreamHeaders
        });
        if (!upstreamResp.webSocket) {
          console.error("Upstream upgrade failed", upstreamResp.status);
          serverSocket.send(JSON.stringify({
            type: "proxy_error",
            message: "Upstream upgrade failed",
            status: upstreamResp.status
          }));
          serverSocket.close(1011, "Upstream upgrade failed");
          return;
        }
        upstreamSocket = upstreamResp.webSocket;
        upstreamSocket.accept();
        console.log("WS upstream open");
        upstreamReady = true;
        while (pendingMessages.length > 0) {
          upstreamSocket.send(pendingMessages.shift());
        }
        serverSocket.send(JSON.stringify({
          type: "proxy_info",
          message: "upstream_open"
        }));
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        console.error("Upstream connection error", msg);
        serverSocket.send(JSON.stringify({
          type: "proxy_error",
          message: "Upstream connection error: " + msg
        }));
        serverSocket.close(1011, "Upstream connection error");
        return;
      }

      const closeBoth = (code, reason) => {
        try {
          serverSocket.close(code, reason);
        } catch (err) {}
        try {
          upstreamSocket.close(code, reason);
        } catch (err) {}
      };

      upstreamSocket.addEventListener("message", (event) => {
        try {
          serverSocket.send(event.data);
        } catch (err) {
          closeBoth(1011, "Client send failed");
        }
      });

      serverSocket.addEventListener("close", (event) => {
        console.log("Client closed", event.code, event.reason);
        closeBoth(event.code || 1000, event.reason || "Client closed");
      });
      upstreamSocket.addEventListener("close", (event) => {
        console.log("Upstream closed", event.code, event.reason);
        closeBoth(event.code || 1000, event.reason || "Upstream closed");
      });
      serverSocket.addEventListener("error", () => {
        console.error("Client socket error");
        closeBoth(1011, "Client error");
      });
      upstreamSocket.addEventListener("error", () => {
        console.error("Upstream socket error");
        closeBoth(1011, "Upstream error");
      });
    };

    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(handleProxy());
    } else {
      handleProxy();
    }

    return new Response(null, { status: 101, webSocket: clientSocket });
  }
};
