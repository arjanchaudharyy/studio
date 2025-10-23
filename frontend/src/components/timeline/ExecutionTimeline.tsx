import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  EyeOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useExecutionTimelineStore } from '@/store/executionTimelineStore'
import { cn } from '@/lib/utils'

const PLAYBACK_SPEEDS = [
  { label: '0.1x', value: 0.1 },
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
  { label: '5x', value: 5 },
  { label: '10x', value: 10 },
]

const formatTime = (ms: number): string => {
  if (ms < 1000) return `0:${String(Math.floor(ms / 100)).padStart(2, '0')}`
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp)
  const base = date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  return `${base}.${String(date.getMilliseconds()).padStart(3, '0')}`
}

export function ExecutionTimeline() {
  const [isDragging, setIsDragging] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [timelineStart, setTimelineStart] = useState(0) // Start position of visible viewport (0-1)
  const timelineRef = useRef<HTMLDivElement>(null)
  const timelineContentRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number | undefined>(undefined)

  const {
    selectedRunId,
    events,
    totalDuration,
    currentTime,
    playbackMode,
    isPlaying,
    playbackSpeed,
    isSeeking,
    nodeStates,
    showTimeline,
    timelineZoom,
    play,
    pause,
    seek,
    setPlaybackSpeed,
    stepForward,
    stepBackward,
    toggleTimeline,
    setTimelineZoom,
  } = useExecutionTimelineStore()

  // Animation loop for playback with auto-follow
  useEffect(() => {
    if (isPlaying && playbackMode === 'replay' && !isDragging) {
      const animate = () => {
        const newState = useExecutionTimelineStore.getState()
        const newTime = newState.currentTime + (16.67 * playbackSpeed) // 60fps timing

        if (newTime >= totalDuration) {
          pause()
          seek(totalDuration)
        } else {
          seek(newTime)

          // Auto-follow: keep current position in viewport during playback
          const currentProgress = newTime / totalDuration
          const viewportWidth = 1 / timelineZoom
          const viewportEnd = timelineStart + viewportWidth

          // If current position is outside viewport, center it
          if (currentProgress < timelineStart || currentProgress > viewportEnd) {
            const newStart = Math.max(0, Math.min(1 - viewportWidth, currentProgress - viewportWidth / 2))
            setTimelineStart(newStart)
          }

          animationFrameRef.current = requestAnimationFrame(animate)
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isPlaying, playbackMode, playbackSpeed, isDragging, totalDuration, seek, pause, timelineZoom, timelineStart])

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || playbackMode === 'live') return

    const rect = timelineRef.current.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const viewportPercentage = Math.max(0, Math.min(1, clickX / rect.width))

    // Convert viewport position to timeline position considering zoom and pan
    const viewportWidth = 1 / timelineZoom
    const timelinePercentage = timelineStart + (viewportPercentage * viewportWidth)
    const newTime = Math.max(0, Math.min(1, timelinePercentage)) * totalDuration

    seek(newTime)
  }, [totalDuration, seek, playbackMode, timelineStart, timelineZoom])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()

      const delta = e.deltaY > 0 ? -0.5 : 0.5 // Zoom out with scroll down, in with scroll up
      const newZoom = Math.max(1.0, Math.min(100.0, timelineZoom + delta))

      if (newZoom !== timelineZoom) {
        setTimelineZoom(newZoom)

        // When zooming in, center on current position
        if (newZoom > timelineZoom && timelineRef.current) {
          const currentProgress = currentTime / totalDuration
          const viewportWidth = 1 / newZoom
          const newStart = Math.max(0, Math.min(1 - viewportWidth, currentProgress - viewportWidth / 2))
          setTimelineStart(newStart)
        }
      }
    } else if (timelineZoom > 1.0) {
      // Regular scroll for horizontal panning when zoomed in
      e.preventDefault()
      const viewportWidth = 1 / timelineZoom
      const panAmount = (e.deltaY / 1000) * viewportWidth
      setTimelineStart(prev => Math.max(0, Math.min(1 - viewportWidth, prev - panAmount)))
    }
  }, [timelineZoom, setTimelineZoom, currentTime, totalDuration])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (playbackMode === 'live') return

    // Check if middle mouse button (for panning) or regular click
    if (e.button === 1) {
      setIsPanning(true)
      e.preventDefault()
    } else {
      setIsDragging(true)
      pause()
    }
  }, [pause, playbackMode])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning && timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect()
      const deltaX = e.movementX / rect.width
      const viewportWidth = 1 / timelineZoom
      const newStart = Math.max(0, Math.min(1 - viewportWidth, timelineStart - deltaX))
      setTimelineStart(newStart)
    }
  }, [isPanning, timelineStart, timelineZoom])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsPanning(false)
  }, [])

  const handlePlayPause = useCallback(() => {
    if (playbackMode === 'live') return

    if (isPlaying) {
      pause()
    } else {
      play()
    }
  }, [isPlaying, play, pause, playbackMode])

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed)
  }, [setPlaybackSpeed])

  // Calculate progress percentage
  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0

  // Generate event markers
  const eventMarkers = events.map((event) => {
    const percentage = totalDuration > 0
      ? Math.min(100, Math.max(0, (event.offsetMs / totalDuration) * 100))
      : 0

    // Determine if event is within current visible timeline range
    const viewportWidth = 1 / timelineZoom
    const isWithinViewport = timelineZoom > 1.0 
      ? (percentage / 100) >= timelineStart && (percentage / 100) <= (timelineStart + viewportWidth)
      : true // Show all events when zoomed out
      
    // Determine if event is close to current seeker position (within 1% of timeline)
    const isNearSeeker = Math.abs(percentage - progress) <= 1

    let markerColor = isNearSeeker ? 'bg-purple-500' : 'bg-gray-400' // Highlight events near seeker
    if (event.type === 'COMPLETED') markerColor = isNearSeeker ? 'bg-green-600' : 'bg-green-500'
    else if (event.type === 'FAILED') markerColor = isNearSeeker ? 'bg-red-600' : 'bg-red-500'
    else if (event.type === 'STARTED') markerColor = isNearSeeker ? 'bg-blue-600' : 'bg-blue-500'

    return { 
      percentage, 
      color: markerColor, 
      event,
      isWithinViewport,
      isNearSeeker
    }
  })

  // Filter markers to only show those in viewport when zoomed in
  const visibleEventMarkers = timelineZoom > 1.0 
    ? eventMarkers.filter(marker => marker.isWithinViewport) 
    : eventMarkers

  if (!selectedRunId || !showTimeline) {
    return null
  }

  return (
    <div className="border-t bg-background">
      <div className="p-4 space-y-4">
        {/* Header with controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Playback Controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={stepBackward}
                disabled={playbackMode === 'live' || currentTime <= 0}
              >
                <SkipBack className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={handlePlayPause}
                disabled={playbackMode === 'live'}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={stepForward}
                disabled={playbackMode === 'live' || currentTime >= totalDuration}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>

            {/* Speed Control */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={playbackMode === 'live'}
                  className="w-16 justify-between"
                >
                  {playbackSpeed}x
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {PLAYBACK_SPEEDS.map((speed) => (
                  <DropdownMenuItem
                    key={speed.value}
                    onClick={() => handleSpeedChange(speed.value)}
                    className={cn(
                      playbackSpeed === speed.value && "bg-accent"
                    )}
                  >
                    {speed.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mode Indicator */}
            <Badge
              variant={playbackMode === 'live' ? 'default' : 'secondary'}
              className="flex items-center gap-1"
            >
              {playbackMode === 'live' ? (
                <>
                  <div className="w-2 h-2 bg-current rounded-full animate-pulse" />
                  LIVE
                </>
              ) : (
                'EXECUTION'
              )}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* Hide Timeline */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTimeline}
            >
              <EyeOff className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-2">
          {/* Time display */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {playbackMode === 'live' ? (
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  LIVE
                </span>
              ) : timelineZoom > 1.0 ? (
                formatTime(timelineStart * totalDuration)
              ) : (
                formatTime(currentTime)
              )}
            </span>
            <span>
              {timelineZoom > 1.0
                ? `${formatTime((timelineStart + (1 / timelineZoom)) * totalDuration)}`
                : formatTime(totalDuration)
              }
            </span>
          </div>

          {/* Main Timeline Track */}
          <div
            ref={timelineRef}
            className="relative h-12 bg-muted rounded-lg border transition-all hover:border-blue-300/50 overflow-hidden"
            onWheel={handleWheel}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            title="Ctrl/Cmd + Scroll to zoom • Scroll to pan • Click to seek"
          >
            {/* Timeline Content (scrollable) */}
            <div
              ref={timelineContentRef}
              className="relative h-full cursor-pointer"
              onClick={handleTimelineClick}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              style={{
                width: `${Math.max(100, 100 * timelineZoom)}%`,
                transform: `translateX(-${timelineStart * 100}%)`,
                transition: isPanning ? 'none' : 'transform 0.1s'
              }}
            >
              {/* Progress Bar */}
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-400/20 to-blue-500/30 transition-all duration-150"
                style={{
                  width: `${progress}%`,
                  left: `${timelineStart * 100}%`
                }}
              />

              {/* Event Markers - Clickable */}
              {visibleEventMarkers.map((marker) => (
                <div
                  key={marker.event.id}
                  className={cn(
                    "absolute rounded-full cursor-pointer hover:scale-125 transition-all duration-150",
                    marker.color,
                    "hover:ring-2 hover:ring-white/50",
                    "top-2 bottom-2 w-2"
                  )}
                  style={{
                    left: `${marker.percentage}%`,
                    transform: 'translateX(-50%)',
                  }}
                  title={`${marker.event.type} - ${marker.event.nodeId || 'System'} - ${formatTimestamp(marker.event.timestamp)}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    seek(marker.event.offsetMs)
                  }}
                />
              ))}

              {/* Main Scrubber/Playhead */}
              {playbackMode === 'replay' && (
                <div
                  className="absolute top-0 bottom-0 w-1 bg-white border-2 border-blue-500 rounded-full cursor-grab active:cursor-grabbing shadow-lg transition-all hover:w-1.5"
                  style={{
                    left: `${progress}%`,
                    transform: 'translateX(-50%)',
                  }}
                  onMouseDown={handleMouseDown}
                >
                  <div className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-blue-500 rounded-full shadow-md" />
                  <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap shadow-md">
                    {formatTime(currentTime)}
                  </div>
                </div>
              )}

              {/* Live Mode Indicator */}
              {playbackMode === 'live' && (
                <div
                  className="absolute top-0 bottom-0 w-1 bg-red-500"
                  style={{
                    left: '100%',
                    transform: 'translateX(-50%)',
                  }}
                >
                  <div className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-red-500 rounded-full animate-pulse shadow-md" />
                  <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-red-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap shadow-md">
                    LIVE
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Timeline Preview Pane */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Timeline Overview</span>
            <span className="text-blue-600 dark:text-blue-400">
              {timelineZoom > 1.0 ? `Zoom: ${Math.round(timelineZoom * 100)}%` : ''}
            </span>
          </div>
          <div
            ref={timelineContentRef}
            className="relative h-8 bg-muted rounded-lg border cursor-pointer overflow-hidden"
            onClick={(e) => {
              if (!isPanning) {
                const rect = e.currentTarget.getBoundingClientRect()
                const clickX = e.clientX - rect.left
                const percentage = clickX / rect.width

                if (timelineZoom > 1.0) {
                  // Center viewport on clicked position
                  const viewportWidth = 1 / timelineZoom
                  const newStart = Math.max(0, Math.min(1 - viewportWidth, percentage - viewportWidth / 2))
                  setTimelineStart(newStart)
                }
              }
            }}
            onMouseMove={(e) => {
              if (isPanning && timelineZoom > 1.0) {
                const rect = e.currentTarget.getBoundingClientRect()
                const clickX = e.clientX - rect.left
                const percentage = clickX / rect.width
                const viewportWidth = 1 / timelineZoom
                const newStart = Math.max(0, Math.min(1 - viewportWidth, percentage - viewportWidth / 2))
                setTimelineStart(newStart)
              }
            }}
            onMouseUp={() => {
              if (isPanning) {
                setIsPanning(false)
              }
            }}
            onMouseLeave={() => {
              if (isPanning) {
                setIsPanning(false)
              }
            }}
            title="Click to jump to section • Drag blue area to select view"
          >
            {/* Full timeline events (miniature) - show all events in preview but highlight those in current view */}
            {eventMarkers.map((marker) => (
              <div
                key={`preview-${marker.event.id}`}
                className={cn(
                  "absolute top-2 bottom-2 w-1 rounded-full",
                  marker.color.replace('500', '300'), // Use lighter shade for preview
                  marker.isWithinViewport ? "opacity-60" : "opacity-30",  // Highlight events in current viewport
                  marker.isNearSeeker ? "opacity-100" : ""  // Extra highlight for events near seeker
                )}
                style={{
                  left: `${marker.percentage}%`,
                  transform: 'translateX(-50%)',
                }}
              />
            ))}

            {/* Viewport indicator (selectable area) */}
            {timelineZoom > 1.0 && (
              <div
                className="absolute top-0 bottom-0 bg-blue-500/20 border border-blue-400/50 rounded cursor-move"
                style={{
                  left: `${timelineStart * 100}%`,
                  width: `${(1 / timelineZoom) * 100}%`
                }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  setIsPanning(true)
                }}
              />
            )}

            {/* Current position indicator */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500"
              style={{
                left: `${(currentTime / totalDuration) * 100}%`,
                transform: 'translateX(-50%)'
              }}
            >
              <div className="absolute -top-1 -left-1 w-2 h-2 bg-red-500 rounded-full" />
            </div>
          </div>
        </div>

        {/* Additional info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>{events.length} events</span>
            <span>{Object.keys(nodeStates).length} nodes</span>
            {playbackMode === 'replay' && (
              <span>Speed: {playbackSpeed}x</span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {isSeeking && (
              <span className="text-blue-500">Seeking...</span>
            )}
            {isPlaying && playbackMode === 'replay' && (
              <span className="text-green-500">Playing...</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
