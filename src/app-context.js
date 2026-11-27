import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export const errorText = (e, L) => (e?.msg ? L(...e.msg) : e?.message || L('Something went wrong', 'कुछ गड़बड़ हुई'));

/** Screen ka data load: loading / error / retry. deps ya revision badalne par dobara. */
export function useLoad(task, deps = []) {
  const { revision } = useApp();
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const latest = useRef(0);
  const reload = useCallback(async () => {
    const id = ++latest.current;
    try {
      const data = await task();
      if (id === latest.current) setState({ loading: false, data, error: null });
    } catch (error) {
      if (id === latest.current) setState((s) => ({ ...s, loading: false, error }));
    }
  }, [revision, ...deps]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}
