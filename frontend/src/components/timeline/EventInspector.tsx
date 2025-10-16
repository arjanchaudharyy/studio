import { useState, useMemo, useEffect, useRef } from 'react'
import { X, ChevronDown, ChevronRight, Clock, FileText, AlertCircle, CheckCircle, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useExecutionTimelineStore, type TimelineEvent } from '@/store/executionTimelineStore'
import { cn } from '@/lib/utils'

const EVENT_ICONS = {
  STARTED: CheckCircle,
  COMPLETED: CheckCircle,
  FAILED: AlertCircle,
  RUNNING: Activity,
  WAITING: Clock,
}

const EVENT_COLORS = {
  STARTED: 'text-blue-600 bg-blue-50 border-blue-200',
  COMPLETED: 'text-green-600 bg-green-50 border-green-200',
  FAILED: 'text-red-600 bg-red-50 border-red-200',
  RUNNING: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  WAITING: 'text-gray-600 bg-gray-50 border-gray-200',
}

interface EventInspectorProps {
  className?: string
}

export function EventInspector({ className }: EventInspectorProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['details']))
  const autoSelectionSignatureRef = useRef<string | null>(null)

  const {
    selectedRunId,
    events,
    currentTime,
    nodeStates,
    dataFlows,
    selectedNodeId,
    selectedEventId,
    selectEvent,
    selectNode,
    seek
  } = useExecutionTimelineStore()

  const filteredEvents = useMemo(() => {
    if (!selectedNodeId) {
      return []
    }
    return events.filter(event => event.nodeId === selectedNodeId)
  }, [events, selectedNodeId])

  const displayEvents = filteredEvents.length > 0 ? filteredEvents : events

  const selectedEvent = useMemo(() => {
    return displayEvents.find(event => event.id === selectedEventId) ?? null
  }, [displayEvents, selectedEventId])

  const displaySignature = useMemo(() => {
    if (displayEvents.length === 0) {
      return `${selectedRunId ?? 'none'}|${selectedNodeId ?? 'all'}|empty`
    }
    const firstId = displayEvents[0].id
    const lastId = displayEvents[displayEvents.length - 1].id
    return `${selectedRunId ?? 'none'}|${selectedNodeId ?? 'all'}|${firstId}-${lastId}`
  }, [displayEvents, selectedRunId, selectedNodeId])

  useEffect(() => {
    if (displayEvents.length === 0) {
      if (selectedEventId !== null) {
        selectEvent(null)
      }
      autoSelectionSignatureRef.current = displaySignature
      return
    }

    const hasSelection = selectedEventId && displayEvents.some(event => event.id === selectedEventId)
    if (!hasSelection) {
      if (selectedEventId === null && autoSelectionSignatureRef.current === displaySignature) {
        return
      }

      const closestEvent = displayEvents.reduce<{ event: TimelineEvent; diff: number } | null>((closest, event) => {
        const diff = Math.abs(event.offsetMs - currentTime)
        if (!closest || diff < closest.diff) {
          return { event, diff }
        }
        return closest
      }, null)

      const fallbackEvent = displayEvents[displayEvents.length - 1]
      selectEvent((closestEvent?.event ?? fallbackEvent).id)
      autoSelectionSignatureRef.current = displaySignature
      return
    }

    autoSelectionSignatureRef.current = displaySignature
  }, [displayEvents, selectedEventId, currentTime, selectEvent, displaySignature])

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  const handleEventClick = (event: TimelineEvent) => {
    if (event.nodeId) {
      selectNode(event.nodeId)
    }
    selectEvent(event.id)
    // Seek to the event timestamp
    seek(event.offsetMs)
  }

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    })
  }

  const formatDuration = (start: string, end?: string): string => {
    const startTime = new Date(start).getTime()
    const endTime = end ? new Date(end).getTime() : Date.now()
    const duration = endTime - startTime
    return `${duration}ms`
  }

  if (!selectedRunId) {
    return (
      <div className={cn("p-4 text-center text-muted-foreground", className)}>
        Select a run to view events
      </div>
    )
  }

  return (
    <div className={cn("h-full flex flex-col", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">Event Inspector</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => selectEvent(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Events List */}
      <div className="flex-1 flex">
        {/* Events Sidebar */}
        <div className="w-80 border-r overflow-y-auto">
          <div className="p-4 space-y-1">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              {selectedNodeId
                ? filteredEvents.length > 0
                  ? `Events for ${selectedNodeId}`
                  : `No events for ${selectedNodeId} — showing all`
                : 'All Events'}
            </div>
            {displayEvents.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4">
                No events available.
              </div>
            ) : displayEvents.map((event) => {
              const IconComponent = EVENT_ICONS[event.type] || FileText
              const isSelected = event.id === selectedEventId
              const isCurrent = Math.abs(event.offsetMs - currentTime) < 100

              return (
                <div
                  key={event.id}
                  onClick={() => handleEventClick(event)}
                  className={cn(
                    "p-2 rounded-lg cursor-pointer transition-colors border",
                    isSelected ? "bg-blue-50 border-blue-200" : "bg-background border-border hover:bg-muted/50",
                    isCurrent && "ring-2 ring-blue-400 ring-opacity-50"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <IconComponent className={cn(
                      "h-4 w-4 mt-0.5 flex-shrink-0",
                      EVENT_COLORS[event.type]
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">
                          {event.type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(event.timestamp)}
                        </span>
                      </div>
                      {event.nodeId && (
                        <div className="text-xs text-muted-foreground truncate">
                          Node: {event.nodeId}
                        </div>
                      )}
                      {event.message && (
                        <div className="text-xs text-muted-foreground truncate mt-1">
                          {event.message}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Event Details */}
        <div className="flex-1 overflow-y-auto">
          {selectedEvent ? (
            <div className="p-4 space-y-4">
              {/* Event Header */}
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-lg border",
                  EVENT_COLORS[selectedEvent.type]
                )}>
                  {(() => {
                    const IconComponent = EVENT_ICONS[selectedEvent.type] || FileText
                    return <IconComponent className="h-5 w-5" />
                  })()}
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-lg">{selectedEvent.type}</h4>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatTimestamp(selectedEvent.timestamp)}
                  </div>
                </div>
                <Badge variant="outline">
                  {selectedEvent.level}
                </Badge>
              </div>

              {/* Details Section */}
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSection('details')}
                  className="w-full justify-between"
                >
                  <span className="font-medium">Event Details</span>
                  {expandedSections.has('details') ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>

                {expandedSections.has('details') && (
                  <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Event ID:</span>
                        <div className="font-mono text-xs text-muted-foreground mt-1">
                          {selectedEvent.id}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Node ID:</span>
                        <div className="font-mono text-xs text-muted-foreground mt-1">
                          {selectedEvent.nodeId || 'System'}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Timestamp:</span>
                        <div className="font-mono text-xs text-muted-foreground mt-1">
                          {selectedEvent.timestamp}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Level:</span>
                        <div className="mt-1">
                          <Badge variant="outline" className="text-xs">
                            {selectedEvent.level}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {selectedEvent.message && (
                      <div>
                        <span className="font-medium text-sm">Message:</span>
                        <div className="mt-1 p-2 bg-background rounded border text-sm">
                          {selectedEvent.message}
                        </div>
                      </div>
                    )}

                    </div>
                )}
              </div>

              {/* Data Section */}
              {selectedEvent.data && Object.keys(selectedEvent.data).length > 0 && (
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSection('data')}
                    className="w-full justify-between"
                  >
                    <span className="font-medium">Event Data</span>
                    {expandedSections.has('data') ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>

                  {expandedSections.has('data') && (
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <pre className="text-xs font-mono overflow-auto max-h-96">
                        {JSON.stringify(selectedEvent.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Node State Section */}
              {selectedEvent.nodeId && nodeStates[selectedEvent.nodeId] && (
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSection('nodeState')}
                    className="w-full justify-between"
                  >
                    <span className="font-medium">Node State</span>
                    {expandedSections.has('nodeState') ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>

                  {expandedSections.has('nodeState') && (
                    <div className="p-3 bg-muted/30 rounded-lg space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Status:</span>
                          <div className="mt-1">
                            <Badge variant="outline">
                              {nodeStates[selectedEvent.nodeId].status}
                            </Badge>
                          </div>
                        </div>
                        <div>
                          <span className="font-medium">Progress:</span>
                          <div className="mt-1">
                            {nodeStates[selectedEvent.nodeId].progress}%
                          </div>
                        </div>
                        <div>
                          <span className="font-medium">Event Count:</span>
                          <div className="mt-1">
                            {nodeStates[selectedEvent.nodeId].eventCount}
                          </div>
                        </div>
                        <div>
                          <span className="font-medium">Duration:</span>
                          <div className="mt-1">
                            {formatDuration(
                              new Date(nodeStates[selectedEvent.nodeId].startTime).toISOString(),
                              nodeStates[selectedEvent.nodeId].endTime
                            )}
                          </div>
                        </div>
                      </div>

                      {nodeStates[selectedEvent.nodeId].dataFlow && (
                        <div>
                          <span className="font-medium text-sm">Data Flow:</span>
                          <div className="mt-2 space-y-1">
                            <div className="text-xs text-muted-foreground">
                              Input packets: {nodeStates[selectedEvent.nodeId].dataFlow.input.length}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Output packets: {nodeStates[selectedEvent.nodeId].dataFlow.output.length}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Related Data Flows */}
              {selectedEvent.nodeId && (
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSection('dataFlows')}
                    className="w-full justify-between"
                  >
                    <span className="font-medium">Related Data Flows</span>
                    {expandedSections.has('dataFlows') ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>

                  {expandedSections.has('dataFlows') && (
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <div className="space-y-2">
                        {dataFlows
                          .filter(flow =>
                            flow.sourceNode === selectedEvent.nodeId ||
                            flow.targetNode === selectedEvent.nodeId
                          )
                          .slice(0, 10)
                          .map((flow, index) => (
                            <div key={index} className="p-2 bg-background rounded border text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{flow.type}</span>
                                <span className="text-muted-foreground">
                                  {(flow.size / 1024).toFixed(1)}KB
                                </span>
                              </div>
                              <div className="text-muted-foreground mt-1">
                                {flow.sourceNode} → {flow.targetNode}
                              </div>
                              {flow.payload && (
                                <div className="mt-1 p-1 bg-muted/50 rounded text-xs font-mono truncate">
                                  {JSON.stringify(flow.payload).slice(0, 100)}
                                  {JSON.stringify(flow.payload).length > 100 && '...'}
                                </div>
                              )}
                            </div>
                          ))}

                        {dataFlows.filter(flow =>
                          flow.sourceNode === selectedEvent.nodeId ||
                          flow.targetNode === selectedEvent.nodeId
                        ).length === 0 && (
                          <div className="text-center text-muted-foreground text-xs py-4">
                            No data flows found for this event
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-muted-foreground">
              Select an event to view details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
