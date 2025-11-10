-- ClaraVerse Agent Runner - Database Schema
-- Version: 1.0.0
-- Description: Workflow deployment and execution tracking

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Deployed Workflows Table
CREATE TABLE IF NOT EXISTS deployed_workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    workflow_json JSONB NOT NULL,
    schema_json JSONB NOT NULL,
    user_id VARCHAR(255),
    api_key_hash VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    execution_count INTEGER DEFAULT 0,
    last_executed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Indexes for performance
    CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9-]+$')
);

CREATE INDEX idx_deployed_workflows_slug ON deployed_workflows(slug);
CREATE INDEX idx_deployed_workflows_user_id ON deployed_workflows(user_id);
CREATE INDEX idx_deployed_workflows_created_at ON deployed_workflows(created_at DESC);
CREATE INDEX idx_deployed_workflows_api_key_hash ON deployed_workflows(api_key_hash);

-- Workflow Executions Table
CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES deployed_workflows(id) ON DELETE CASCADE,
    inputs JSONB NOT NULL,
    outputs JSONB,
    status VARCHAR(50) NOT NULL, -- 'success', 'error', 'timeout'
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Index for querying executions
    CONSTRAINT status_check CHECK (status IN ('success', 'error', 'timeout', 'running'))
);

CREATE INDEX idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_workflow_executions_created_at ON workflow_executions(created_at DESC);

-- API Rate Limiting Table (optional for future use)
CREATE TABLE IF NOT EXISTS api_rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_hash VARCHAR(255) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    request_count INTEGER DEFAULT 0,
    window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(api_key_hash, endpoint, window_start)
);

CREATE INDEX idx_api_rate_limits_key_endpoint ON api_rate_limits(api_key_hash, endpoint);
CREATE INDEX idx_api_rate_limits_window_start ON api_rate_limits(window_start);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_deployed_workflows_updated_at
    BEFORE UPDATE ON deployed_workflows
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- View for deployment statistics
CREATE OR REPLACE VIEW deployment_stats AS
SELECT
    dw.id,
    dw.name,
    dw.slug,
    dw.execution_count,
    dw.last_executed_at,
    dw.created_at,
    COUNT(we.id) AS total_executions,
    COUNT(CASE WHEN we.status = 'success' THEN 1 END) AS successful_executions,
    COUNT(CASE WHEN we.status = 'error' THEN 1 END) AS failed_executions,
    AVG(CASE WHEN we.status = 'success' THEN we.duration_ms END) AS avg_duration_ms
FROM deployed_workflows dw
LEFT JOIN workflow_executions we ON dw.id = we.workflow_id
GROUP BY dw.id, dw.name, dw.slug, dw.execution_count, dw.last_executed_at, dw.created_at;

-- Comments for documentation
COMMENT ON TABLE deployed_workflows IS 'Stores deployed agent workflows with their schemas and API keys';
COMMENT ON TABLE workflow_executions IS 'Tracks all workflow execution attempts with inputs, outputs, and performance metrics';
COMMENT ON TABLE api_rate_limits IS 'Rate limiting data for API key-based throttling';
COMMENT ON VIEW deployment_stats IS 'Aggregated statistics for deployed workflows';

-- Sample cleanup function (optional - for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_executions(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM workflow_executions
    WHERE created_at < CURRENT_TIMESTAMP - (days_to_keep || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_executions IS 'Deletes workflow execution records older than specified days (default: 30)';
