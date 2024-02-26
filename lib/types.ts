type HotKey = string | {
  sequence: string;
  action: string;
};
type HotKeyMap = Record<string, HotKey | HotKey[]>;

interface SequenceHandler {
  callback: (event?: KeyboardEvent, sequence?: string) => void;
  action?: string;
  sequence: string;
}

export type {
  HotKey,
  HotKeyMap,
  SequenceHandler,
};
