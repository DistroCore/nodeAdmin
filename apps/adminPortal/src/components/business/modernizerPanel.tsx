import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/dataTable';
import { useApiClient } from '@/hooks/useApiClient';

interface AnalysisIssue {
  file: string;
  line: number;
  category: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

interface AnalysisSummary {
  total: number;
  byCategory: Record<string, number>;
}

interface AnalysisResult {
  issues: AnalysisIssue[];
  summary: AnalysisSummary;
}

const SEVERITY_VARIANT: Record<string, 'default' | 'outline' | 'destructive'> = {
  error: 'destructive',
  warning: 'outline',
  info: 'default',
};

export function ModernizerPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const [analysisTrigger, setAnalysisTrigger] = useState(0);

  const analysisQuery = useQuery<AnalysisResult>({
    queryKey: ['modernizer', 'analyze', analysisTrigger],
    queryFn: () => apiClient.get<AnalysisResult>('/api/v1/modernizer/analyze'),
    enabled: analysisTrigger > 0,
  });

  const handleRunAnalysis = () => {
    setAnalysisTrigger((prev) => prev + 1);
  };

  const issues = analysisQuery.data?.issues ?? [];
  const summary = analysisQuery.data?.summary;

  return (
    <section className="h-full overflow-y-auto">
      <Card className="p-4">
        <CardHeader className="mb-4 flex-row items-start justify-between space-y-0 p-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t({ id: 'modernizer.title' })}</CardTitle>
            <CardDescription>{t({ id: 'modernizer.desc' })}</CardDescription>
          </div>
          <Button size="sm" onClick={handleRunAnalysis} disabled={analysisQuery.isFetching}>
            {analysisQuery.isFetching ? (
              <>
                <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t({ id: 'modernizer.running' })}
              </>
            ) : (
              t({ id: 'modernizer.runAnalysis' })
            )}
          </Button>
        </CardHeader>

        {/* Summary Cards */}
        {summary && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold">{summary.total}</div>
              <div className="text-xs text-muted-foreground">{t({ id: 'modernizer.totalIssues' })}</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold text-destructive">{summary.byCategory['console-log'] ?? 0}</div>
              <div className="text-xs text-muted-foreground">{t({ id: 'modernizer.summary.consoleLog' })}</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold text-yellow-600">{summary.byCategory['missing-validation'] ?? 0}</div>
              <div className="text-xs text-muted-foreground">{t({ id: 'modernizer.missingValidation' })}</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {(summary.byCategory['todo'] ?? 0) + (summary.byCategory['unused-import'] ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground">{t({ id: 'modernizer.summary.todoUnused' })}</div>
            </div>
          </div>
        )}

        {/* Issue Table */}
        <DataTable<AnalysisIssue>
          columns={[
            {
              header: t({ id: 'modernizer.colSeverity' }),
              cell: (issue) => <Badge variant={SEVERITY_VARIANT[issue.severity] ?? 'default'}>{issue.severity}</Badge>,
            },
            {
              header: t({ id: 'modernizer.colCategory' }),
              cell: (issue) => <span className="font-mono text-sm">{issue.category}</span>,
            },
            {
              header: t({ id: 'modernizer.colFile' }),
              cell: (issue) => (
                <span className="font-mono text-sm" title={issue.file}>
                  {issue.file.length > 40 ? `...${issue.file.slice(-37)}` : issue.file}
                </span>
              ),
            },
            {
              header: t({ id: 'modernizer.colLine' }),
              cell: (issue) => <span className="font-mono text-sm">{issue.line}</span>,
            },
            {
              header: t({ id: 'modernizer.colMessage' }),
              cell: (issue) => <span className="text-sm">{issue.message}</span>,
            },
          ]}
          data={issues}
          emptyMessage={analysisTrigger === 0 ? t({ id: 'modernizer.clickToRun' }) : t({ id: 'modernizer.noIssues' })}
          errorMessage={t({ id: 'modernizer.loadFailed' })}
          isError={analysisQuery.isError}
          isLoading={analysisQuery.isFetching}
          onRetry={handleRunAnalysis}
          retryLabel={t({ id: 'common.retry' })}
          rowKey={(issue) => `${issue.file}:${issue.line}:${issue.category}`}
        />
      </Card>
    </section>
  );
}
