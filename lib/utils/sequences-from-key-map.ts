import type { HotKey, HotKeyMap } from '../types';

const sequencesFromKeyMap = (hotKeyMap: HotKeyMap | null, hotKeyName: string): HotKey[] => {
  if (!hotKeyMap) return [];

  const sequences = hotKeyMap[hotKeyName];

  if (!sequences) {
    /**
     * If no sequence is found with this name we assume the user is passing a
     * hard-coded sequence as a key
     */
    return [hotKeyName];

  } else if (Array.isArray(sequences)) {
    return sequences;
  } else {
    return [sequences];
  }

};

export default sequencesFromKeyMap;
