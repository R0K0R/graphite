import { useState, useEffect } from 'react';
import { getAwareness, getPeers, onRoomChange } from './doc.js';

export function usePeers() {
  const [peers, setPeers] = useState([]);

  useEffect(() => {
    let unsubAw = null;

    function connectToRoom() {
      if (unsubAw) { unsubAw(); unsubAw = null; }
      const aw = getAwareness();
      if (!aw) { setPeers([]); return; }
      const sync = () => setPeers(getPeers());
      aw.on('change', sync);
      sync();
      unsubAw = () => aw.off('change', sync);
    }

    connectToRoom();
    const unsubRoom = onRoomChange(connectToRoom);

    return () => {
      unsubAw?.();
      unsubRoom();
    };
  }, []);

  return peers;
}
