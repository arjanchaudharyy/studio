import { ShieldAlert } from 'lucide-react'
import { useMemo } from 'react'
import { useAuthStore } from '@/store/authStore'

/**
 * AuthStatusBanner
 *
 * Surfaces when Studio is running without a configured platform token.
 * Encourages local developers to supply an API key while keeping OSS usage simple.
 */
export function AuthStatusBanner() {
  const token = useAuthStore((state) => state.token)
  const organizationId = useAuthStore((state) => state.organizationId)

  const isLocalMode = useMemo(() => !token || token.trim().length === 0, [token])

  if (!isLocalMode) {
    return null
  }

  return (
    <div className="mb-4 rounded-md border border-dashed border-yellow-400/60 bg-yellow-950/20 px-4 py-3 text-sm text-yellow-100">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-200" />
        <div className="space-y-1">
          <p className="font-medium text-yellow-50">Local auth mode active</p>
          <p className="text-xs text-yellow-100/90">
            Requests use the default organization <code className="rounded bg-black/30 px-1 py-0.5 text-[11px]">{organizationId}</code>.
            Provide a platform-issued token via the Auth menu to access organization-specific data.
          </p>
        </div>
      </div>
    </div>
  )
}
