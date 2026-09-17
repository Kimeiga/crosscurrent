import { chooseAction, type Difficulty } from './ai';
import type { State } from './engine';

self.onmessage = (event: MessageEvent<{ state: State; level: Difficulty; id: number }>) => {
  try {
    const { state, level, id } = event.data;
    self.postMessage({ id, action: chooseAction(state, 1, level) });
  } catch (error) {
    self.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : 'Computer could not choose an order.' });
  }
};
