// The shell's output, minus OSC 52 clipboard reads (devil amendment 2, T7). VS Code's terminal loads
// xterm's clipboard addon with `readText` wired to the clipboard service, and answers
// `ESC ] 52 ; <sel> ; ? BEL` by typing the clipboard back into the pty (xterm-addons-common
// xtermTerminal.js:304-316, @xterm/addon-clipboard ClipboardAddon.ts:32-52); no setting gates it.
// Whatever is at the other end of the pty, a remote host over ssh included, would read this
// computer's clipboard. So the page drops the query before VS Code sees it. Writes (`52;c;<base64>`)
// pass: copying from the shell keeps working.
// Caveat: the filter errs toward dropping. It treats C1 introducers (0x9d, 0x9c) and ESC, CAN or
// SUB inside the query as its end even where xterm would not, and drops a sequence whose selection
// field passes 1024 characters; each of those loses only a malformed clipboard sequence. The prefix
// of a possible query is held until the next chunk decides it, so output that pauses mid-sequence
// shows late.

const ESC = "\x1b";
const BEL = "\x07";
const C1_OSC = "\x9d";
const C1_ST = "\x9c";
const CAN = "\x18";
const SUB = "\x1a";
const MAX_HELD = 1024;

/** Where the filter is in a sequence that may still turn out to be a clipboard read. */
type Phase = "text" | "escape" | "ident" | "selection" | "query" | "afterQuery" | "dropping";

export interface FilteredOutput {
  text: string;
  /** Characters removed; the caller acknowledges them, since VS Code never renders them (C7). */
  dropped: number;
}

const endsSequence = (char: string) => char === BEL || char === C1_ST || char === ESC || char === CAN || char === SUB;

export function createOsc52ReadFilter() {
  let phase: Phase = "text";
  let held = "";
  let ident = "";

  return {
    push(chunk: string): FilteredOutput {
      let text = "";
      let dropped = 0;
      const pass = () => { text += held; held = ""; phase = "text"; };
      // A read is replaced by CAN, which xterm executes as "abort any sequence in progress": an
      // earlier OSC that this one's ESC had ended cannot run on into the text that follows. CAN
      // stands in for one dropped character, so acknowledgements still add up to what was sent.
      const refuse = (then: Phase) => { text += CAN; dropped += held.length - 1; held = ""; phase = then; };

      for (let at = 0; at < chunk.length; at++) {
        const char = chunk[at];
        if (phase === "text") {
          if (char === ESC) { held = char; phase = "escape"; }
          else if (char === C1_OSC) { held = char; ident = ""; phase = "ident"; }
          else text += char;
        } else if (phase === "dropping") {
          if (char === ESC) { phase = "text"; at -= 1; }
          else { dropped += 1; if (endsSequence(char)) phase = "text"; }
        } else if (phase === "escape") {
          if (char === "]") { held += char; ident = ""; phase = "ident"; }
          else { pass(); at -= 1; }
        } else if (phase === "ident") {
          if (char >= "0" && char <= "9") { held += char; ident += char; }
          else if (char === ";" && ident.replace(/^0+/, "") === "52") { held += char; phase = "selection"; }
          else { pass(); at -= 1; }
        } else if (phase === "selection") {
          if (char === ";") { held += char; phase = "query"; }
          else if (endsSequence(char)) { pass(); at -= 1; }
          else held += char;
        } else if (phase === "query") {
          if (char === "?") { held += char; phase = "afterQuery"; }
          else { pass(); at -= 1; }
        } else if (char === ";") {
          // afterQuery: `?` alone in the second field is a read, whatever follows it.
          held += char;
          refuse("dropping");
        } else if (char === ESC) {
          refuse("text");
          at -= 1;
        } else if (endsSequence(char)) {
          held += char;
          refuse("text");
        } else {
          pass();
          at -= 1;
        }
        if (held.length > MAX_HELD) refuse("dropping");
      }
      return { text, dropped };
    },
  };
}
