// Ring-buffer operation log shared by services + UI (/api/logs).
const MAX = 4000;
const ring = [];
let seq = 0;

export function append(text, source = "sys") {
  const line = { seq: ++seq, at: new Date().toISOString(), source, text: String(text) };
  ring.push(line);
  if (ring.length > MAX) ring.splice(0, ring.length - MAX);
  return line;
}

export function tail(n = 300) {
  return ring.slice(-n);
}

export function clear() {
  ring.length = 0;
  seq = 0;
}

export function onLine(source) {
  return (line) => append(line, source);
}

/** Returns a chunk writer that pumps complete lines to the log (auto source tagging). */
export function makeLinePump(source, onLineFn) {
  const emit = onLineFn || onLine(source);
  let buf = "";
  return (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      if (line) emit(line);
    }
  };
}
