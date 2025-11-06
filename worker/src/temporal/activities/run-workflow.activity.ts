import '../../components'; // Register all components
import { executeWorkflow } from '../workflow-runner';
import type {
  RunWorkflowActivityInput,
  RunWorkflowActivityOutput,
  WorkflowLogSink,
} from '../types';
import type { IFileStorageService, ITraceService, ISecretsService } from '@shipsec/component-sdk';
import { TraceAdapter } from '../../adapters';

// Global service container (set by worker initialization)
let globalStorage: IFileStorageService | undefined;
let globalTrace: ITraceService | undefined;
let globalLogs: WorkflowLogSink | undefined;
let globalSecrets: ISecretsService | undefined;

export function initializeActivityServices(
  storage: IFileStorageService,
  trace: ITraceService,
  logs?: WorkflowLogSink,
  secrets?: ISecretsService,
) {
  globalStorage = storage;
  globalTrace = trace;
  globalLogs = logs;
  globalSecrets = secrets;
}

export async function runWorkflowActivity(
  input: RunWorkflowActivityInput,
): Promise<RunWorkflowActivityOutput> {
  console.log(`🔧 [ACTIVITY] runWorkflow started for run: ${input.runId}`);
  console.log(`🔧 [ACTIVITY] Workflow: ${input.workflowId}, Actions: ${input.definition.actions.length}`);

  try {
    if (globalTrace instanceof TraceAdapter) {
      globalTrace.setRunMetadata(input.runId, {
        workflowId: input.workflowId,
        organizationId: input.organizationId ?? null,
      });
    }

    const result = await executeWorkflow(
      input.definition,
      {
        inputs: input.inputs,
        organizationId: input.organizationId ?? null,
      },
      {
        runId: input.runId,
        storage: globalStorage,
        secrets: globalSecrets,
        trace: globalTrace,
        logs: globalLogs,
        organizationId: input.organizationId ?? null,
      },
    );

    console.log(`✅ [ACTIVITY] runWorkflow completed for run: ${input.runId}`);
    return result;
  } catch (error) {
    console.error(`❌ [ACTIVITY] runWorkflow failed for run: ${input.runId}`, error);
    throw error;
  } finally {
    if (globalTrace instanceof TraceAdapter) {
      globalTrace.finalizeRun(input.runId);
    }
  }
}
