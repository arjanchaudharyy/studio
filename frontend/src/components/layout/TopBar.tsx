import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Save, Play, StopCircle } from 'lucide-react'
import { useExecutionStore } from '@/store/executionStore'
import { useWorkflowStore } from '@/store/workflowStore'

interface TopBarProps {
  workflowId?: string
  isNew?: boolean
  onRun?: () => void
  onSave?: () => void
}

export function TopBar({ onRun, onSave }: TopBarProps) {
  const navigate = useNavigate()
  const [isSaving, setIsSaving] = useState(false)

  const { metadata, isDirty, setWorkflowName } = useWorkflowStore()
  const { status, runStatus, reset } = useExecutionStore()
  const isRunning = status === 'running' || status === 'queued'

  const handleSave = async () => {
    if (onSave) {
      setIsSaving(true)
      try {
        await onSave()
      } finally {
        setIsSaving(false)
      }
    } else {
      setIsSaving(true)
      // TODO: Implement save logic
      setTimeout(() => setIsSaving(false), 1000)
    }
  }

  const handleRun = () => {
    if (onRun) {
      onRun()
    }
  }

  const handleStop = () => {
    reset()
  }

  return (
    <div className="h-[60px] border-b bg-background flex items-center px-4 gap-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate('/')}
        aria-label="Back to workflows"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      <div className="flex-1 max-w-md">
        <Input
          value={metadata.name}
          onChange={(e) => setWorkflowName(e.target.value)}
          className="font-semibold"
          placeholder="Workflow name"
        />
      </div>

      <div className="flex gap-2 ml-auto">
        {isDirty && (
          <span className="text-xs text-muted-foreground self-center">
            Unsaved changes
          </span>
        )}
        <Button
          onClick={handleSave}
          disabled={isSaving || isRunning}
          variant="outline"
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save'}
        </Button>

        {isRunning ? (
          <Button
            onClick={handleStop}
            variant="destructive"
            className="gap-2"
          >
            <StopCircle className="h-4 w-4" />
            Stop
          </Button>
        ) : (
          <Button
            onClick={handleRun}
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            Run
          </Button>
        )}

        {status === 'queued' && (
          <span className="text-sm text-muted-foreground font-medium">
            Queued…
          </span>
        )}

        {runStatus?.progress && (
          <span className="text-sm text-muted-foreground font-medium">
            {runStatus.progress.completedActions}/{runStatus.progress.totalActions} actions
          </span>
        )}

        {status === 'completed' && (
          <span className="text-sm text-green-600 font-medium">
            ✓ Completed
          </span>
        )}

        {status === 'failed' && (
          <span className="text-sm text-red-600 font-medium">
            ✗ Failed
          </span>
        )}
        {status === 'failed' && runStatus?.failure?.reason && (
          <span className="text-sm text-red-600">
            {runStatus.failure.reason}
          </span>
        )}
      </div>
    </div>
  )
}
