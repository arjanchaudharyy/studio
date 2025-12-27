-- Create approval_status enum
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'expired', 'cancelled');

-- Create approval_requests table
CREATE TABLE IF NOT EXISTS approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id TEXT NOT NULL,
    workflow_id UUID NOT NULL,
    node_ref TEXT NOT NULL,
    status approval_status NOT NULL DEFAULT 'pending',
    title TEXT NOT NULL,
    description TEXT,
    context JSONB DEFAULT '{}',
    approve_token TEXT NOT NULL UNIQUE,
    reject_token TEXT NOT NULL UNIQUE,
    timeout_at TIMESTAMP WITH TIME ZONE,
    responded_at TIMESTAMP WITH TIME ZONE,
    responded_by TEXT,
    response_note TEXT,
    organization_id VARCHAR(191),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes for common queries
CREATE INDEX idx_approval_requests_run_id ON approval_requests(run_id);
CREATE INDEX idx_approval_requests_status ON approval_requests(status);
CREATE INDEX idx_approval_requests_org_id ON approval_requests(organization_id);
CREATE INDEX idx_approval_requests_approve_token ON approval_requests(approve_token);
CREATE INDEX idx_approval_requests_reject_token ON approval_requests(reject_token);
