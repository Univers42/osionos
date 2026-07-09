/**
 * A tiny module-level latch so the keyboard dispatcher stands down while the user
 * is recording a new combo in the manager (both are document capture listeners;
 * without this the dispatcher would swallow the very key being recorded).
 */
let recording = false;

export function setComboRecording(value: boolean): void {
  recording = value;
}

export function isComboRecording(): boolean {
  return recording;
}
