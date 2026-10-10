import { createClient } from "@connectrpc/connect";
import {
  createConnectTransport,
  createGrpcWebTransport,
} from "@connectrpc/connect-web";
import { EchoService } from "./gen/lab_pb.js";
const output = document.querySelector("#output");
let controller;
const log = (message) => {
  output.textContent += `\n${new Date().toLocaleTimeString()} ${message}`;
};
const client = () =>
  createClient(
    EchoService,
    document.querySelector("#mode").value === "connect"
      ? createConnectTransport({
          baseUrl: "http://127.0.0.1:8090",
          //, useBinaryFormat: true
        })
      : createGrpcWebTransport({ baseUrl: document.querySelector("#mode").value === "armeria" ? "http://127.0.0.1:8093" : "http://127.0.0.1:8091" }),
  );
async function run(stream, failAfter = 0) {
  controller?.abort();
  const active = new AbortController();
  controller = active;
  const started = performance.now();
  log(
    `시작 ${document.querySelector("#mode").value} ${stream ? "Watch" : "Echo"}`,
  );
  try {
    if (document.querySelector("#mode").value === "rest") {
      if (stream) { log("이번 REST 실습은 단일 응답만 지원합니다."); return; }
      const response = await fetch("http://127.0.0.1:8092/api/echo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "hello proto" }), signal: active.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      log(`HTTP ${response.status} ${JSON.stringify(await response.json())}`);
    } else if (stream) {
      for await (const message of client().watch(
        { count: 5, intervalMs: 1000, failAfter },
        { signal: active.signal },
      ))
        log(
          `+${Math.round(performance.now() - started)}ms ${JSON.stringify(message)}`,
        );
    } else
      log(
        JSON.stringify(
          await client().echo(
            { text: "hello proto" },
            { signal: active.signal },
          ),
        ),
      );
    log("정상 종료");
  } catch (error) {
    log(`종료 code=${error.code} ${error.message}`);
  }
}
document.querySelector("#unary").onclick = () => run(false);
document.querySelector("#stream").onclick = () => run(true);
document.querySelector("#failure").onclick = () => run(true, 3);
document.querySelector("#cancel").onclick = () => controller?.abort();
document.querySelector("#clear").onclick = () => {
  output.textContent = "호출 대기";
};
