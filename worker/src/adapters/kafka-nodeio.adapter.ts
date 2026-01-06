import { Kafka, logLevel as KafkaLogLevel, type Producer } from 'kafkajs';
import type { INodeIOService, NodeIOStartEvent, NodeIOCompletionEvent, IFileStorageService } from '@shipsec/component-sdk';
import { ConfigurationError } from '@shipsec/component-sdk';
import { randomUUID } from 'node:crypto';

interface KafkaNodeIOAdapterConfig {
  brokers: string[];
  topic: string;
  clientId?: string;
  logLevel?: keyof typeof KafkaLogLevel;
}

type SerializedNodeIOEvent = {
  type: 'NODE_IO_START' | 'NODE_IO_COMPLETION';
  runId: string;
  nodeRef: string;
  workflowId?: string;
  organizationId?: string | null;
  componentId?: string;
  inputs?: Record<string, unknown>;
  inputsSize?: number;
  inputsSpilled?: boolean;
  inputsStorageRef?: string | null;
  outputs?: Record<string, unknown>;
  outputsSize?: number;
  outputsSpilled?: boolean;
  outputsStorageRef?: string | null;
  status?: 'completed' | 'failed' | 'skipped';
  errorMessage?: string;
  timestamp: string;
};

// Size threshold for spilling to object storage (100KB)
const SPILL_THRESHOLD_BYTES = 100 * 1024;
// Maximum Kafka message size (900KB)
const MAX_KAFKA_MESSAGE_BYTES = 900 * 1024;

/**
 * Kafka adapter for publishing node I/O events.
 * Events are consumed by the backend and persisted to the node_io table.
 */
export class KafkaNodeIOAdapter implements INodeIOService {
  private readonly producer: Producer;
  private readonly connectPromise: Promise<void>;

  constructor(
    private readonly config: KafkaNodeIOAdapterConfig,
    private readonly storage?: any, // Using any for now to avoid circular dependency or complex type issues with FileStorageAdapter
    private readonly logger: Pick<Console, 'log' | 'error'> = console,
  ) {
    if (!config.brokers.length) {
      throw new ConfigurationError('KafkaNodeIOAdapter requires at least one broker', {
        configKey: 'brokers',
        details: { brokers: config.brokers },
      });
    }

    const kafka = new Kafka({
      clientId: config.clientId ?? 'shipsec-worker-nodeio',
      brokers: config.brokers,
      logLevel: config.logLevel ? KafkaLogLevel[config.logLevel] : KafkaLogLevel.NOTHING,
    });

    this.producer = kafka.producer({
      allowAutoTopicCreation: true,
    });

    this.connectPromise = this.producer.connect().catch((error) => {
      this.logger.error('[KafkaNodeIOAdapter] Failed to connect to brokers', error);
      throw error;
    });
  }

  recordStart(data: NodeIOStartEvent): void {
    const payload: SerializedNodeIOEvent = {
      type: 'NODE_IO_START',
      runId: data.runId,
      nodeRef: data.nodeRef,
      workflowId: data.workflowId,
      organizationId: data.organizationId ?? null,
      componentId: data.componentId,
      inputs: data.inputs,
      timestamp: new Date().toISOString(),
    };

    void this.processAndSend(payload);
  }

  recordCompletion(data: NodeIOCompletionEvent): void {
    const payload: SerializedNodeIOEvent = {
      type: 'NODE_IO_COMPLETION',
      runId: data.runId,
      nodeRef: data.nodeRef,
      outputs: data.outputs,
      status: data.status,
      errorMessage: data.errorMessage,
      timestamp: new Date().toISOString(),
    };

    void this.processAndSend(payload);
  }

  private async processAndSend(payload: SerializedNodeIOEvent): Promise<void> {
    try {
      // 1. Handle Spilling if necessary
      if (payload.inputs) {
        const inputsStr = JSON.stringify(payload.inputs);
        const size = Buffer.byteLength(inputsStr, 'utf8');
        payload.inputsSize = size;
        
        if (size > SPILL_THRESHOLD_BYTES && this.storage) {
          const fileId = randomUUID();
          const storageRef = `node-io/${payload.runId}/${payload.nodeRef}/inputs.json`;
          
          await this.storage.uploadFile(
            fileId,
            'inputs.json',
            Buffer.from(inputsStr),
            'application/json'
          );
          
          payload.inputsSpilled = true;
          payload.inputsStorageRef = storageRef;
          // Replace large inputs with marker for Kafka
          payload.inputs = { _spilled: true, size };
        }
      }

      if (payload.outputs) {
        const outputsStr = JSON.stringify(payload.outputs);
        const size = Buffer.byteLength(outputsStr, 'utf8');
        payload.outputsSize = size;
        
        if (size > SPILL_THRESHOLD_BYTES && this.storage) {
          const fileId = randomUUID();
          const storageRef = `node-io/${payload.runId}/${payload.nodeRef}/outputs.json`;
          
          await this.storage.uploadFile(
            fileId,
            'outputs.json',
            Buffer.from(outputsStr),
            'application/json'
          );
          
          payload.outputsSpilled = true;
          payload.outputsStorageRef = storageRef;
          // Replace large outputs with marker for Kafka
          payload.outputs = { _spilled: true, size };
        }
      }

      // 2. Final safety check for Kafka message size
      const message = JSON.stringify(payload);
      const messageSize = Buffer.byteLength(message, 'utf8');

      if (messageSize > MAX_KAFKA_MESSAGE_BYTES) {
        this.logger.error(
          `[KafkaNodeIOAdapter] Even after spilling, payload too large (${messageSize} bytes) for ${payload.nodeRef}, truncating payloads`,
        );

        const truncated: SerializedNodeIOEvent = {
          ...payload,
          inputs: payload.inputsSpilled ? payload.inputs : { _truncated: true, _originalSize: messageSize },
          outputs: payload.outputsSpilled ? payload.outputs : { _truncated: true, _originalSize: messageSize },
        };

        await this.sendRaw(JSON.stringify(truncated));
        return;
      }

      await this.sendRaw(message);
    } catch (error) {
      this.logger.error('[KafkaNodeIOAdapter] Failed to process or send node I/O event', error);
    }
  }

  private async sendRaw(message: string): Promise<void> {
    await this.connectPromise;
    await this.producer.send({
      topic: this.config.topic,
      messages: [{ value: message }],
    });
  }
}
