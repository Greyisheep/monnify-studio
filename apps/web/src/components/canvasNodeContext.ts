"use client";

import { createContext, useContext } from "react";

/** Lets custom canvas nodes (e.g. an editable Code Block) write back into the
 *  app's controlled nodes state, since React Flow's own updateNodeData targets
 *  its internal store and is clobbered by the controlled `nodes` prop (#153). */
export type UpdateNodeConfig = (
  nodeId: string,
  patch: Record<string, unknown>,
) => void;

export const CanvasNodeContext = createContext<{
  updateNodeConfig: UpdateNodeConfig;
} | null>(null);

export function useCanvasNode() {
  return useContext(CanvasNodeContext);
}
