import { useEffect, useRef, useState } from "react"
import { subscribe, subscribeConnectionState } from "./use-event-bus"

type ConnectionState = "connecting" | "open" | "closed"

/**
 * Subscribe to a WebSocket event type for the lifetime of the component.
 * The callback is stable via ref — no need to memoize at the call site.
 */
export function useEventSubscription(type: string, callback: (payload: unknown) => void) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    return subscribe(type, (payload) => callbackRef.current(payload))
  }, [type])
}

/** Returns the current WebSocket connection state and re-renders on change. */
export function useConnectionState(): ConnectionState {
  const [state, setState] = useState<ConnectionState>("closed")
  useEffect(() => subscribeConnectionState(setState), [])
  return state
}
