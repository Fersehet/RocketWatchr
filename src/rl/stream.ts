import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';

export type RlEvent = { Event: string; Data: any };

/**
 * Splits a stream of JSON objects that follow each other without separators
 * ({"Event":...}{"Event":...}) into single messages. Strings may contain braces.
 */
export class JsonSplitter {
  private buf = '';
  private depth = 0;
  private inStr = false;
  private esc = false;
  private start = -1;
  private pos = 0;

  push(chunk: string): unknown[] {
    this.buf += chunk;
    const out: unknown[] = [];
    for (; this.pos < this.buf.length; this.pos++) {
      const ch = this.buf[this.pos];
      if (this.inStr) {
        if (this.esc) this.esc = false;
        else if (ch === '\\') this.esc = true;
        else if (ch === '"') this.inStr = false;
        continue;
      }
      if (ch === '"') { this.inStr = true; continue; }
      if (ch === '{') { if (this.depth++ === 0) this.start = this.pos; continue; }
      if (ch === '}' && this.depth > 0 && --this.depth === 0) {
        const text = this.buf.slice(this.start, this.pos + 1);
        try { out.push(JSON.parse(text)); } catch { /* broken message: skip it */ }
        this.buf = this.buf.slice(this.pos + 1);
        this.pos = -1;
        this.start = -1;
      }
    }
    // Junk outside of an object is dropped; an unfinished object stays in the buffer (max 4 MB)
    if (this.depth === 0) { this.buf = ''; this.pos = 0; }
    else if (this.buf.length > 4_000_000) { this.buf = ''; this.pos = 0; this.depth = 0; this.inStr = false; }
    return out;
  }
}

/**
 * Connects to Rocket League's Stats API (TCP, port 49123 by default) and keeps trying while the game is closed.
 * Emits 'event' for every message and 'status' when the connection comes or goes.
 */
export class RlStream extends EventEmitter {
  private socket: Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  connected = false;

  private host: string;
  private port: number;

  constructor(host: string, port: number) {
    super();
    this.host = host;
    this.port = port;
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.socket?.destroy();
  }

  private connect() {
    const split = new JsonSplitter();
    const s = new Socket();
    this.socket = s;
    s.setEncoding('utf8');
    s.setNoDelay(true);
    s.on('connect', () => this.setConnected(true));
    s.on('data', (chunk: string) => {
      for (const msg of split.push(chunk)) {
        const m = msg as Partial<RlEvent>;
        if (typeof m?.Event !== 'string') continue;
        // Data is a JSON object; should a build ever send it as a string, it is parsed as well
        let data = m.Data;
        if (typeof data === 'string') { try { data = JSON.parse(data); } catch { /* keep the string */ } }
        this.emit('event', { Event: m.Event, Data: data ?? {} } satisfies RlEvent);
      }
    });
    s.on('error', () => { /* ECONNREFUSED while the game is closed: handled in close */ });
    s.on('close', () => {
      this.setConnected(false);
      if (!this.stopped) this.timer = setTimeout(() => this.connect(), 3000);
    });
    s.connect(this.port, this.host);
  }

  private setConnected(v: boolean) {
    if (this.connected === v) return;
    this.connected = v;
    this.emit('status', v);
  }
}
