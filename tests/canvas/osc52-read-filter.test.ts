// T7 (devil amendment 2, groot .out-of-scope/desktop-terminal-osc52-clipboard-read.md): a program in
// the terminal, or a host at the other end of `ssh`, must not read this computer's clipboard. VS
// Code's terminal answers `ESC ] 52 ; c ; ?` with the clipboard (xtermTerminal.js:304-316 loads
// the clipboard addon with readText, and no setting gates it), so the page drops that query from
// the shell's output before VS Code sees it. OSC 52 writes (copy from the shell) still pass.
import test from "node:test";
import assert from "node:assert/strict";

import { createOsc52ReadFilter } from "../../src/features/ide/model/osc52ReadFilter.ts";

const ESC = "\x1b";
const CAN = "\x18";
const BEL = "\x07";
const ST = `${ESC}\\`;

function run(chunks: string[]) {
  const filter = createOsc52ReadFilter();
  let text = "";
  let dropped = 0;
  for (const chunk of chunks) {
    const out = filter.push(chunk);
    text += out.text;
    dropped += out.dropped;
  }
  return { text, dropped };
}

test("a clipboard read is dropped, with BEL or ST, and the text around it passes", () => {
  for (const query of [`${ESC}]52;c;?${BEL}`, `${ESC}]52;c;?${ST}`, `${ESC}]52;;?${BEL}`, `${ESC}]52;p;?${BEL}`, `${ESC}]0052;c;?${BEL}`, `\x9d52;c;?\x9c`]) {
    const { text, dropped } = run([`before${query}after`]);
    // ST's ESC ends the read, and the ST then passes on its own, which xterm ignores.
    assert.equal(text.replace(`${CAN}${ST}`, CAN), `before${CAN}after`, JSON.stringify(query));
    // Every character VS Code will not render is acknowledged: CAN stands in for one of them.
    assert.equal(dropped + (text.length - "beforeafter".length), query.length, JSON.stringify(query));
  }
});

test("a read whose query field is followed by more fields is still a read", () => {
  assert.equal(run([`a${ESC}]52;c;?;x${BEL}b`]).text, `a${CAN}b`);
});

test("a read split across chunks at every position is dropped", () => {
  const stream = `x${ESC}]52;c;?${BEL}y`;
  for (let cut = 0; cut <= stream.length; cut++) {
    assert.equal(run([stream.slice(0, cut), stream.slice(cut)]).text, `x${CAN}y`, `cut at ${cut}`);
  }
  assert.equal(run([...stream]).text, `x${CAN}y`);
});

test("clipboard writes and other OSC sequences pass untouched", () => {
  for (const sequence of [`${ESC}]52;c;aGVsbG8=${BEL}`, `${ESC}]52;c;?x${BEL}`, `${ESC}]0;title${BEL}`, `${ESC}]633;A${BEL}`, `${ESC}]5;x${BEL}`, `${ESC}]520;c;?${BEL}`, `${ESC}[31mred`, `${ESC}]52${BEL}`]) {
    const stream = `a${sequence}b`;
    assert.deepEqual(run([stream]), { text: stream, dropped: 0 }, JSON.stringify(sequence));
    assert.equal(run([...stream]).text, stream, `char by char: ${JSON.stringify(sequence)}`);
  }
});

test("a read that ESC ends early (xterm runs it) is dropped, and the next sequence passes", () => {
  assert.equal(run([`a${ESC}]52;c;?${ESC}[31mb`]).text, `a${CAN}${ESC}[31mb`);
  assert.equal(run([`a${ESC}]52;c;${ESC}]52;c;?${BEL}b`]).text, `a${ESC}]52;c;${CAN}b`);
});

// Without the CAN, the OSC that the dropped read's ESC had ended would run on into `?BEL`: a read.
test("dropping a read never splices the text around it into a new read", () => {
  const { text } = run([`${ESC}]52;c;${ESC}]52;c;?${BEL}?${BEL}`]);
  assert.equal(text, `${ESC}]52;c;${CAN}?${BEL}`);
});

test("only the prefix of a possible read is held, and it comes out once it cannot be one", () => {
  const filter = createOsc52ReadFilter();
  assert.deepEqual(filter.push(`ok${ESC}]52;c;`), { text: "ok", dropped: 0 });
  assert.deepEqual(filter.push("aGk="), { text: `${ESC}]52;c;aGk=`, dropped: 0 });
  assert.deepEqual(filter.push(`${BEL}`), { text: BEL, dropped: 0 });
  assert.deepEqual(filter.push("plain"), { text: "plain", dropped: 0 });
});

test("a selection field longer than 1024 characters is dropped, never held without bound", () => {
  const { text, dropped } = run([`a${ESC}]52;${"c".repeat(5000)};?${BEL}b`]);
  assert.equal(text, `a${CAN}b`);
  assert.equal(dropped, 5000 + 8 - 1);
});

// Seeded, so a failure reproduces: streams drawn from the pieces that build these sequences.
function* randomStreams(count: number) {
  let seed = 52;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const alphabet = [`${ESC}]52;`, `${ESC}]`, "\x9d52;", "52;", "0", ";", "c", "?", "?", BEL, ESC, ST, "\x9c", CAN, "a", "[m"];
  for (let i = 0; i < count; i++) {
    const length = 1 + Math.floor(next() * 16);
    yield { stream: Array.from({ length }, () => alphabet[Math.floor(next() * alphabet.length)]).join(""), cut: next };
  }
}

// What xterm would answer, by its rules: OSC ends at BEL, ST, or ESC (all run it), CAN or SUB
// (abort it); ident 52 with "?" alone in the second field reads the clipboard.
function readsIn(stream: string): number {
  let reads = 0;
  for (let at = 0; at < stream.length; at++) {
    const isOsc = stream.startsWith(`${ESC}]`, at) || stream[at] === "\x9d";
    if (!isOsc) continue;
    const start = at + (stream[at] === ESC ? 2 : 1);
    let end = start;
    while (end < stream.length && ![BEL, ESC, "\x9c", CAN, "\x1a"].includes(stream[end])) end++;
    const aborted = end < stream.length && (stream[end] === CAN || stream[end] === "\x1a");
    if (end === stream.length || aborted) continue;
    const [id, , pd] = /^(\d*)(;([^;]*))?/.exec(stream.slice(start, end)) ?? [];
    const args = stream.slice(start, end).split(";");
    if (id !== undefined && Number(args[0]) === 52 && args.length >= 3 && args[2] === "?" && pd !== undefined) reads++;
  }
  return reads;
}

test("over 20000 random streams and chunkings: the output holds no read, and chunking never changes it", () => {
  assert.equal(readsIn(`a${ESC}]52;c;?${BEL}${ESC}]52;c;${ESC}]0052;;?;x${BEL}`), 2);
  let streamsWithReads = 0;
  for (const { stream, cut } of randomStreams(20000)) {
    if (readsIn(stream) > 0) streamsWithReads++;
    const whole = run([stream]);
    assert.equal(readsIn(whole.text), 0, JSON.stringify(stream));
    const at = Math.floor(cut() * (stream.length + 1));
    assert.deepEqual(run([stream.slice(0, at), stream.slice(at)]), whole, `${JSON.stringify(stream)} cut at ${at}`);
    // Nothing is invented: CAN replaces one dropped character, and a held prefix is still to come.
    assert.ok(whole.dropped >= 0 && whole.dropped + whole.text.length <= stream.length);
  }
  // The streams do carry reads, so "no read in the output" is not vacuous.
  assert.ok(streamsWithReads > 100, `only ${streamsWithReads} streams held a read`);
});
