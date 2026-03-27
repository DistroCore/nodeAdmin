-- PostgreSQL initialization script for nodeAdmin
-- This script runs automatically when the container is first created

-- Enable pg_stat_statements extension for query performance monitoring
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Log message for verification
DO $$
BEGIN
  RAISE NOTICE 'pg_stat_statements extension enabled successfully';
END $$;
