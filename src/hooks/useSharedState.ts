import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { shareEqualValue } from '../utils/structuralSharing';

export function useSharedState<T>(initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial);
  const update = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setValue((previous) => shareEqualValue(previous, typeof next === 'function' ? (next as (value: T) => T)(previous) : next));
  }, []);
  return [value, update];
}
