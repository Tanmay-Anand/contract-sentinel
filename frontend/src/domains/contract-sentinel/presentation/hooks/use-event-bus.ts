/**
 * Module-level WebSocket singleton — one connection per browser tab.
 * Components subscribe via useEventSubscription(); this file manages
 * lifecycle, reconnect backoff, and connection-state export.
 */

const API_URL = (import.meta.env["VITE_SENTINEL_API_URL"] as string | undefined) ?? "http://localhost:8090"
const WS_URL  = API_URL.replace(/^http/, "ws") + "/ws/events"

type ConnectionState = "connecting" | "open" | "closed"
type Listener = (payload: unknown) => void

const listeners = new Map<string, Set<Listener>>()
let socket: WebSocket | null = null
let connectionState: ConnectionState = "closed"
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let backoffMs = 1_000
const MAX_BACKOFF = 30_000

const stateListeners = new Set<(s: ConnectionState) => void>()

function notify(type: string, payload: unknown) {
  listeners.get(type)?.forEach(fn => {
    try { fn(payload) } catch { /* ignore listener errors */ }
  })
}

function setConnectionState(next: ConnectionState) {
  connectionState = next
  stateListeners.forEach(fn => {
    try { fn(next) } catch { /* ignore */ }
  })
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }

  setConnectionState("connecting")
  socket = new WebSocket(WS_URL)

  socket.onopen = () => {
    backoffMs = 1_000
    setConnectionState("open")
  }

  socket.onmessage = (event) => {
    try {
      const { type, payload } = JSON.parse(event.data as string) as { type: string; payload: unknown }
      notify(type, payload)
    } catch { /* malformed frame — ignore */ }
  }

  socket.onclose = () => {
    socket = null
    setConnectionState("closed")
    scheduleReconnect()
  }

  socket.onerror = () => {
    socket?.close()
  }
}

function scheduleReconnect() {
  if (reconnectTimer !== null) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, backoffMs)
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF)
}

/** Subscribe to a specific event type. Returns an unsubscribe function. */
export function subscribe(type: string, listener: Listener): () => void {
  if (!listeners.has(type)) listeners.set(type, new Set())
  listeners.get(type)!.add(listener)

  // Start the connection on first subscription.
  if (socket === null && reconnectTimer === null) {
    connect()
  }

  return () => {
    listeners.get(type)?.delete(listener)
  }
}

/** Subscribe to connection state changes. Returns an unsubscribe function. */
export function subscribeConnectionState(listener: (s: ConnectionState) => void): () => void {
  stateListeners.add(listener)
  listener(connectionState)
  return () => stateListeners.delete(listener)
}

export function getConnectionState(): ConnectionState {
  return connectionState
}
