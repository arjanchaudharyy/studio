import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Copy } from 'lucide-react'

interface MessageModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message: string
}

export function MessageModal({ open, onOpenChange, title, message }: MessageModalProps) {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(message)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Full message content
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-muted/30 rounded p-3 border">
            {message}
          </pre>
        </div>

        <div className="flex justify-between items-center pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={copyToClipboard}
            className="flex items-center gap-2"
          >
            <Copy className="h-4 w-4" />
            Copy to clipboard
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}