import { chooseAction, type Difficulty } from './ai';
import type { State } from './engine';

self.onmessage = (event: MessageEvent<{ state: State; level: Difficulty; id: number; strength?: [number, number] }>) => {
  try {
    const { state, level, id, strength } = event.data;
    self.postMessage({ id, action: chooseAction(state, 1, level, Math.random, strength) });
  } catch (error) {
    self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : 'The computer could not choose an order.' });
  }
};
