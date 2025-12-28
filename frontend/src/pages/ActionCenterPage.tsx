import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import {
    CheckCircle,
    XCircle,
    RefreshCw,
    Search,
    Clock,
    Zap,
    ExternalLink,
} from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { api } from '@/services/api'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { MarkdownView } from '@/components/ui/markdown'



interface HumanInputRequest {
    id: string
    runId: string
    workflowId: string
    nodeRef: string
    status: 'pending' | 'resolved' | 'expired' | 'cancelled'
    inputType: string
    title: string
    description: string | null
    context: Record<string, unknown> | null
    resolveToken: string
    timeoutAt: string | null
    respondedAt: string | null
    respondedBy: string | null
    responseData: Record<string, unknown> | null
    createdAt: string
    updatedAt: string
}

const STATUS_OPTIONS = [
    { value: 'all', label: 'All statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'expired', label: 'Expired' },
]

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pending: 'default',
    approved: 'secondary',
    rejected: 'destructive',
    expired: 'outline',
    cancelled: 'outline',
}

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
    pending: Clock,
    approved: CheckCircle,
    rejected: XCircle,
    expired: Clock,
    cancelled: XCircle,
}

const formatDateTime = (value?: string | null) => {
    if (!value) return '—'
    const date = new Date(value)
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        timeZoneName: 'short',
    }).format(date)
}

const formatRelativeTime = (value?: string | null) => {
    if (!value) return ''
    const date = new Date(value)
    const now = new Date()
    const diff = date.getTime() - now.getTime()

    if (diff < 0) return 'Expired'

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 24) {
        const days = Math.floor(hours / 24)
        return `${days}d ${hours % 24}h left`
    }
    if (hours > 0) {
        return `${hours}h ${minutes}m left`
    }
    return `${minutes}m left`
}

export function ActionCenterPage() {
    const { toast } = useToast()
    const [approvals, setApprovals] = useState<HumanInputRequest[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'resolved' | 'expired'>('pending')
    const [actionState, setActionState] = useState<Record<string, 'approve' | 'reject' | 'view'>>({})

    // Resolve dialog state
    const [resolveDialogOpen, setResolveDialogOpen] = useState(false)
    const [resolveAction, setResolveAction] = useState<'approve' | 'reject' | 'view'>('approve')
    const [selectedApproval, setSelectedApproval] = useState<HumanInputRequest | null>(null)
    const [responseNote, setResponseNote] = useState('')

    const fetchApprovals = async () => {
        setIsLoading(true)
        setError(null)
        try {
            const status = statusFilter === 'all' ? undefined : statusFilter
            const data = await api.humanInputs.list({ status })
            setApprovals(data as HumanInputRequest[])
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load approvals')
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchApprovals()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter])

    const filteredApprovals = useMemo(() => {
        const query = search.trim().toLowerCase()
        return approvals.filter((approval) => {
            const matchesSearch =
                query.length === 0 ||
                approval.title.toLowerCase().includes(query) ||
                approval.nodeRef.toLowerCase().includes(query) ||
                approval.runId.toLowerCase().includes(query)
            return matchesSearch
        })
    }, [search, approvals])

    const pendingCount = approvals.filter(a => a.status === 'pending').length

    const markAction = (id: string, action: 'approve' | 'reject' | 'view') => {
        setActionState((state) => ({ ...state, [id]: action }))
    }

    const clearAction = (id: string) => {
        setActionState((state) => {
            const next = { ...state }
            delete next[id]
            return next
        })
    }

    const openResolveDialog = (approval: HumanInputRequest, action: 'approve' | 'reject' | 'view') => {
        setSelectedApproval(approval)
        setResolveAction(action)
        setResponseNote('')
        setResolveDialogOpen(true)
    }

    const handleResolve = async () => {
        if (!selectedApproval) return

        markAction(selectedApproval.id, resolveAction)
        setResolveDialogOpen(false)

        try {
            await api.humanInputs.resolve(selectedApproval.id, {
                status: 'resolved',
                responseData: {
                    status: resolveAction === 'approve' ? 'approved' : 'rejected',
                    comment: responseNote || undefined
                },
                comment: responseNote || undefined
            })

            toast({
                title: resolveAction === 'approve' ? 'Approved' : 'Rejected',
                description: `"${selectedApproval.title}" has been ${resolveAction}d.`,
            })

            // Refresh the list
            await fetchApprovals()
        } catch (err) {
            toast({
                title: 'Action failed',
                description: err instanceof Error ? err.message : 'Try again in a moment.',
                variant: 'destructive',
            })
        } finally {
            clearAction(selectedApproval.id)
            setSelectedApproval(null)
        }
    }

    const handleRefresh = async () => {
        await fetchApprovals()
        toast({
            title: 'Requests refreshed',
            description: 'Latest status have been loaded.',
        })
    }

    const isActionBusy = (id: string) => Boolean(actionState[id])

    const renderStatusBadge = (approval: HumanInputRequest) => {
        let status = approval.status as string
        if (status === 'resolved' && approval.responseData?.status) {
            status = approval.responseData.status as string
        }

        const variant = STATUS_VARIANTS[status] || 'outline'
        const label = status.charAt(0).toUpperCase() + status.slice(1)
        const Icon = STATUS_ICONS[status] || Clock
        return (
            <Badge variant={variant} className="gap-1">
                <Icon className="h-3 w-3" />
                {label}
            </Badge>
        )
    }

    const hasData = filteredApprovals.length > 0

    return (
        <TooltipProvider>
            <div className="flex-1 bg-background">
                <div className="container mx-auto px-3 md:px-4 py-4 md:py-8 space-y-4 md:space-y-6">
                    {/* Header */}
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <Zap className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold">Action Center</h1>
                                <p className="text-sm text-muted-foreground">
                                    Review and respond to workflow requests
                                </p>
                            </div>
                        </div>
                        {pendingCount > 0 && (
                            <Badge variant="default" className="text-base px-3 py-1">
                                {pendingCount} pending
                            </Badge>
                        )}
                    </div>

                    {/* Filters */}
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div className="flex-1 space-y-2">
                            <label className="text-xs uppercase text-muted-foreground flex items-center gap-2">
                                <Search className="h-3.5 w-3.5" />
                                Search requests
                            </label>
                            <Input
                                placeholder="Filter by title, node, or run ID"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    {STATUS_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                variant="outline"
                                className="gap-2"
                                onClick={handleRefresh}
                                disabled={isLoading}
                            >
                                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                                <span className="hidden sm:inline">Refresh</span>
                            </Button>
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
                            <span>{error}</span>
                            <Button variant="outline" size="sm" onClick={handleRefresh}>
                                Try again
                            </Button>
                        </div>
                    )}

                    {/* Table */}
                    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="min-w-[200px]">Title</TableHead>
                                        <TableHead className="min-w-[120px] hidden md:table-cell">Node</TableHead>
                                        <TableHead className="min-w-[150px] hidden lg:table-cell">Run ID</TableHead>
                                        <TableHead className="min-w-[130px] hidden sm:table-cell">Created</TableHead>
                                        <TableHead className="min-w-[100px] hidden lg:table-cell">Timeout</TableHead>
                                        <TableHead className="min-w-[100px]">Status</TableHead>
                                        <TableHead className="text-right min-w-[180px]">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading && !hasData
                                        ? Array.from({ length: 4 }).map((_, index) => (
                                            <TableRow key={`skeleton-${index}`}>
                                                {Array.from({ length: 7 }).map((_, cell) => (
                                                    <TableCell key={`cell-${cell}`}>
                                                        <Skeleton className="h-5 w-full" />
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                        : null}
                                    {!isLoading && hasData
                                        ? filteredApprovals.map((approval) => {
                                            const isPending = approval.status === 'pending'

                                            return (
                                                <TableRow key={approval.id}>
                                                    <TableCell className="font-medium">
                                                        <div className="flex flex-col">
                                                            <span className="truncate max-w-[200px]">{approval.title}</span>
                                                            {approval.description && (
                                                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                                                    {approval.description}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="hidden md:table-cell">
                                                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                                            {approval.nodeRef}
                                                        </code>
                                                    </TableCell>
                                                    <TableCell className="hidden lg:table-cell">
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <a
                                                                    href={`/workflows/${approval.workflowId}/runs/${approval.runId}`}
                                                                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                                                >
                                                                    {approval.runId.substring(0, 12)}...
                                                                    <ExternalLink className="h-3 w-3" />
                                                                </a>
                                                            </TooltipTrigger>
                                                            <TooltipContent>View run details</TooltipContent>
                                                        </Tooltip>
                                                    </TableCell>
                                                    <TableCell className="text-sm hidden sm:table-cell">
                                                        {formatDateTime(approval.createdAt)}
                                                    </TableCell>
                                                    <TableCell className="text-sm hidden lg:table-cell">
                                                        {approval.timeoutAt ? (
                                                            <span className={approval.status === 'pending' ? 'text-warning' : ''}>
                                                                {formatRelativeTime(approval.timeoutAt)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground">No timeout</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>{renderStatusBadge(approval)}</TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {isPending ? (
                                                                <>
                                                                    <Button
                                                                        variant="default"
                                                                        size="sm"
                                                                        className="gap-1 h-8"
                                                                        onClick={() => openResolveDialog(approval, 'approve')}
                                                                        disabled={isActionBusy(approval.id)}
                                                                    >
                                                                        <CheckCircle className="h-4 w-4" />
                                                                        Approve
                                                                    </Button>
                                                                    <Button
                                                                        variant="destructive"
                                                                        size="sm"
                                                                        className="gap-1 h-8"
                                                                        onClick={() => openResolveDialog(approval, 'reject')}
                                                                        disabled={isActionBusy(approval.id)}
                                                                    >
                                                                        <XCircle className="h-4 w-4" />
                                                                        Reject
                                                                    </Button>
                                                                </>
                                                            ) : (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="gap-1 h-8"
                                                                    onClick={() => openResolveDialog(approval, 'view')}
                                                                >
                                                                    <ExternalLink className="h-4 w-4" />
                                                                    View Details
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })
                                        : null}
                                    {!isLoading && !hasData && (
                                        <TableRow>
                                            <TableCell colSpan={7}>
                                                <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                                                    <Zap className="h-12 w-12 text-muted-foreground/30" />
                                                    <p className="font-medium">No pending actions</p>
                                                    <p className="text-sm text-muted-foreground max-w-lg">
                                                        {statusFilter === 'pending'
                                                            ? 'All requests have been handled. Check back later or view all statuses.'
                                                            : 'No requests match your filters. Try adjusting the search or status filter.'}
                                                    </p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Resolve Dialog */}
            <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {resolveAction === 'approve' ? 'Approve Request' :
                                resolveAction === 'reject' ? 'Reject Request' : 'Request Details'}
                        </DialogTitle>
                        <DialogDescription>
                            {selectedApproval?.title}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
                        {selectedApproval?.description && (
                            <div className="space-y-2">
                                <Label className="text-muted-foreground">Description</Label>
                                <div className="border rounded-md p-4 bg-muted/30">
                                    <MarkdownView content={selectedApproval.description} className="prose prose-sm dark:prose-invert max-w-none" />
                                </div>
                            </div>
                        )}

                        {selectedApproval?.status === 'resolved' && (
                            <Card className="border-primary/20 bg-primary/5">
                                <CardHeader className="py-3 px-4">
                                    <div className="flex items-center justify-between">
                                        <CardDescription className="text-primary font-medium">Response Details</CardDescription>
                                        <Badge variant="outline" className="bg-background">
                                            Resolved {selectedApproval.respondedAt && formatDateTime(selectedApproval.respondedAt)}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="py-3 px-4 space-y-3">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-[10px] uppercase text-muted-foreground">Status</Label>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                {renderStatusBadge(selectedApproval)}
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-[10px] uppercase text-muted-foreground">Responded By</Label>
                                            <div className="text-sm font-medium mt-0.5">{selectedApproval.respondedBy || 'System'}</div>
                                        </div>
                                    </div>

                                    {selectedApproval.responseData && Object.keys(selectedApproval.responseData).length > 0 && (
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] uppercase text-muted-foreground">Submitted Data</Label>
                                            <pre className="text-xs bg-background/50 p-2.5 rounded border border-primary/10 overflow-auto">
                                                {JSON.stringify(selectedApproval.responseData, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {selectedApproval?.context && Object.keys(selectedApproval.context).length > 0 && (
                            <div className="space-y-2">
                                <Label className="text-muted-foreground">Input Context</Label>
                                <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32 border">
                                    {JSON.stringify(selectedApproval.context, null, 2)}
                                </pre>
                            </div>
                        )}

                        {selectedApproval?.status === 'pending' && (
                            <div className="space-y-2">
                                <Label htmlFor="response-note">Add a note (optional)</Label>
                                <Textarea
                                    id="response-note"
                                    placeholder="Explain your decision..."
                                    value={responseNote}
                                    onChange={(e) => setResponseNote(e.target.value)}
                                />
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
                            {selectedApproval?.status === 'pending' ? 'Cancel' : 'Close'}
                        </Button>
                        {selectedApproval?.status === 'pending' && (
                            <Button
                                variant={resolveAction === 'approve' ? 'default' : 'destructive'}
                                onClick={handleResolve}
                            >
                                {resolveAction === 'approve' ? (
                                    <>
                                        <CheckCircle className="h-4 w-4 mr-2" />
                                        Approve
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="h-4 w-4 mr-2" />
                                        Reject
                                    </>
                                )}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </TooltipProvider>
    )
}
