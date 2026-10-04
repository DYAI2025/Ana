"use client";

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import { createInitialState, prototypeReducer, type PrototypeAction, type PrototypeState } from "@/state/prototype";

interface PrototypeValue {
  state: PrototypeState;
  dispatch: Dispatch<PrototypeAction>;
}

const PrototypeContext = createContext<PrototypeValue | null>(null);

/** In-memory prototype state for this tab only — resets on reload, never sent anywhere. */
export function PrototypeProvider({ children, initialState }: { children: ReactNode; initialState?: PrototypeState }) {
  const [state, dispatch] = useReducer(prototypeReducer, initialState ?? null, (seed) => seed ?? createInitialState());
  return <PrototypeContext.Provider value={{ state, dispatch }}>{children}</PrototypeContext.Provider>;
}

export function usePrototype(): PrototypeValue {
  const value = useContext(PrototypeContext);
  if (!value) throw new Error("usePrototype must be used inside <PrototypeProvider>");
  return value;
}
