import { useEffect, useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { useAuthStore, DEFAULT_ORG_ID } from '@/store/authStore'

export function AuthSettingsButton() {
  const { token, organizationId, setToken, setOrganizationId, clear } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [draftToken, setDraftToken] = useState(token ?? '')
  const [draftOrg, setDraftOrg] = useState(organizationId ?? DEFAULT_ORG_ID)

  useEffect(() => {
    if (open) {
      setDraftToken(token ?? '')
      setDraftOrg(organizationId ?? DEFAULT_ORG_ID)
    }
  }, [open, token, organizationId])

  const isConfigured = useMemo(() => Boolean(token && token.length > 0), [token])

  const handleSave = () => {
    setToken(draftToken.trim().length > 0 ? draftToken.trim() : null)
    setOrganizationId(draftOrg.trim().length > 0 ? draftOrg.trim() : DEFAULT_ORG_ID)
    setOpen(false)
  }

  const handleClearToken = () => {
    clear()
    setDraftToken('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={isConfigured ? 'secondary' : 'outline'}
          size="sm"
          className="gap-2"
        >
          {isConfigured ? (
            <ShieldCheck className="h-4 w-4" />
          ) : (
            <ShieldAlert className="h-4 w-4" />
          )}
          <span>{isConfigured ? 'Auth Configured' : 'Configure Auth'}</span>
          <Badge variant="outline" className="hidden sm:inline-flex">
            {organizationId ?? DEFAULT_ORG_ID}
          </Badge>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Authentication Settings</DialogTitle>
          <DialogDescription>
            Provide a service token issued by the platform or leave the token blank for local
            development. Organization ID defaults to <code>{DEFAULT_ORG_ID}</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shipsec-auth-token">API token</Label>
            <Input
              id="shipsec-auth-token"
              type="password"
              autoComplete="off"
              value={draftToken}
              onChange={(event) => setDraftToken(event.target.value)}
              placeholder="Bearer token or service account secret"
            />
            <p className="text-xs text-muted-foreground">
              The token is added as an <code>Authorization</code> header on every API request.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shipsec-org-id">Organization ID</Label>
            <Input
              id="shipsec-org-id"
              value={draftOrg}
              onChange={(event) => setDraftOrg(event.target.value)}
              placeholder={DEFAULT_ORG_ID}
            />
            <p className="text-xs text-muted-foreground">
              Requests include this value as <code>X-Organization-Id</code>. Leave blank to use{' '}
              <code>{DEFAULT_ORG_ID}</code>.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {isConfigured && (
            <Button variant="ghost" onClick={handleClearToken}>
              Clear token
            </Button>
          )}
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
