import { useEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { Download, Loader2, PlugZap, Radio, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTerminalStream } from '@/hooks/useTerminalStream'
import { cn } from '@/lib/utils'

type TerminalChunk = {
  nodeRef: string;
  stream: string;
  chunkIndex: number;
  payload: string;
  recordedAt: string;
  deltaMs?: number;
  origin?: string;
  runnerKind?: string;
};

interface NodeTerminalPanelProps {
  nodeId: string
  stream?: 'pty' | 'stdout' | 'stderr'
  runId: string | null
  onClose: () => void
}

const decodePayload = (payload: string): string => {
  if (typeof window === 'undefined' || typeof atob !== 'function') {
    return ''
  }
  try {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return ''
  }
}

const STREAM_OPTIONS: Array<{ label: string; value: 'pty' | 'stdout' | 'stderr' }> = [
  { label: 'PTY', value: 'pty' },
  { label: 'STDOUT', value: 'stdout' },
  { label: 'STDERR', value: 'stderr' },
]

export function NodeTerminalPanel({
  nodeId,
  stream: initialStream = 'pty',
  runId,
  onClose,
}: NodeTerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const lastRenderedChunkIndex = useRef<number>(-1)
  const [activeStream, setActiveStream] = useState<'pty' | 'stdout' | 'stderr'>(initialStream)

  const { chunks, isHydrating, isStreaming, error, mode, fetchMore, exportText } = useTerminalStream({
    runId,
    nodeId,
    stream: activeStream,
  })

  // Timing-aware rendering refs
  const replayTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const replayQueueRef = useRef<TerminalChunk[]>([])
  const isReplayingRef = useRef(false)

  const session = useMemo(
    () => ({
      chunks,
    }),
    [chunks],
  )

  useEffect(() => {
    setActiveStream(initialStream)
  }, [initialStream, nodeId])

  useEffect(() => {
    if (!containerRef.current) {
      return
    }
    const term = new Terminal({
      convertEol: true,
      fontSize: 12,
      disableStdin: true,
      cursorBlink: false,
      theme: {
        background: '#0f172a',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = term
    fitAddonRef.current = fitAddon

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    setTimeout(() => fitAddon.fit(), 0)

    return () => {
      window.removeEventListener('resize', handleResize)
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null

      // Clear any pending replay timeouts
      if (replayTimeoutRef.current) {
        clearTimeout(replayTimeoutRef.current)
        replayTimeoutRef.current = null
      }
    }
  }, [])

  // Clear any pending replay timeouts when chunks or mode changes
  useEffect(() => {
    if (replayTimeoutRef.current) {
      clearTimeout(replayTimeoutRef.current)
      replayTimeoutRef.current = null
    }
    replayQueueRef.current = []
    isReplayingRef.current = false
  }, [session?.chunks, mode])

  useEffect(() => {
    if (!terminalRef.current || !session?.chunks) {
      return
    }

    const newChunks = session.chunks.filter(
      (chunk) => chunk.chunkIndex > lastRenderedChunkIndex.current,
    )
    if (newChunks.length === 0) {
      return
    }

    const processChunk = (chunk: TerminalChunk) => {
      if (!terminalRef.current) return

      const decoded = decodePayload(chunk.payload)
      terminalRef.current.write(decoded)
      lastRenderedChunkIndex.current = chunk.chunkIndex

      // Process next chunk in queue if exists
      if (replayQueueRef.current.length > 0) {
        const nextChunk = replayQueueRef.current.shift()
        if (nextChunk) {
          const delay = nextChunk.deltaMs || 100 // Default 100ms if no deltaMs
          replayTimeoutRef.current = setTimeout(() => processChunk(nextChunk), delay)
        }
      } else {
        // No more chunks, replay complete
        isReplayingRef.current = false
      }

      fitAddonRef.current?.fit()
    }

    if (mode === 'live' || isStreaming) {
      // Live mode: display chunks immediately
      newChunks.forEach((chunk) => {
        const decoded = decodePayload(chunk.payload)
        terminalRef.current?.write(decoded)
        lastRenderedChunkIndex.current = chunk.chunkIndex
      })
      fitAddonRef.current?.fit()
    } else if (mode === 'replay' && !isReplayingRef.current) {
      // Replay mode: display chunks with timing delays
      isReplayingRef.current = true
      replayQueueRef.current = newChunks

      // Start replay with first chunk
      const firstChunk = replayQueueRef.current.shift()
      if (firstChunk) {
        const delay = firstChunk.deltaMs || 100 // Default 100ms if no deltaMs
        replayTimeoutRef.current = setTimeout(() => processChunk(firstChunk), delay)
      }
    }
  }, [session?.chunks, mode, isStreaming])

  useEffect(() => {
    terminalRef.current?.reset()
    lastRenderedChunkIndex.current = -1
  }, [session, activeStream])

  const streamBadge = isStreaming ? (
    <span className="flex items-center gap-1 text-xs text-green-400">
      <Radio className="h-3 w-3 animate-pulse" /> Live
    </span>
  ) : mode === 'replay' ? (
    <span className="flex items-center gap-1 text-xs text-blue-400">
      <PlugZap className="h-3 w-3" /> {isReplayingRef.current ? 'Playing...' : 'Replay'}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs text-slate-400">
      <PlugZap className="h-3 w-3" /> Idle
    </span>
  )

  return (
    <div className="w-[520px] bg-slate-900 text-slate-100 rounded-lg shadow-2xl border border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-950/70">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-300">Terminal • {nodeId}</div>
          {streamBadge}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-slate-100"
            onClick={() => exportText()}
            disabled={!chunks.length}
          >
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="border-b border-slate-800 px-3 py-1 flex items-center gap-2">
        {STREAM_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              'text-[11px] px-2 py-0.5 rounded-full border transition-colors',
              activeStream === option.value
                ? 'bg-blue-600 text-white border-blue-500'
                : 'border-slate-700 text-slate-300',
            )}
            onClick={() => setActiveStream(option.value)}
          >
            {option.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
          {isHydrating && (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-[11px] text-slate-200"
            onClick={() => fetchMore()}
            disabled={!runId}
          >
            Load older
          </Button>
        </div>
      </div>
      <div className="relative bg-slate-950">
        <div ref={containerRef} className="h-[360px] w-full" />
        {!session?.chunks?.length && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-xs text-slate-500 space-y-2 text-center p-4">
              <div>{isHydrating ? 'Hydrating output…' : 'Waiting for terminal output…'}</div>
              <div className="font-mono text-[10px] opacity-50">
                {nodeId} • {activeStream}
              </div>
            </div>
          </div>
        )}
      </div>
      {error && (
        <div className="px-3 py-2 text-xs text-red-400 border-t border-slate-800 bg-slate-950/60">
          {error}
        </div>
      )}
    </div>
  )
}
