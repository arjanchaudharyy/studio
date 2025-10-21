declare module 'ai' {
  export interface GenerateTextToolCall {
    toolCallId: string;
    toolName: string;
    args?: unknown;
  }

  export interface GenerateTextToolResult {
    toolCallId: string;
    toolName: string;
    args?: unknown;
    result?: unknown;
  }

  export interface GenerateTextStep {
    text: string;
    finishReason?: string;
    toolCalls?: GenerateTextToolCall[];
    toolResults?: GenerateTextToolResult[];
  }

  export interface GenerateTextResult {
    text: string;
    finishReason?: string | null;
    response: {
      messages?: unknown;
      [key: string]: unknown;
    };
    usage?: unknown;
    toolCalls?: GenerateTextToolCall[];
    toolResults?: GenerateTextToolResult[];
    steps?: GenerateTextStep[];
  }

  export interface GenerateTextParams {
    model: unknown;
    prompt?: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
    messages?: Array<{ role: string; content: unknown }>;
    tools?: Record<string, unknown>;
    maxSteps?: number;
  }

  export function generateText(params: GenerateTextParams): Promise<GenerateTextResult>;
  export function tool(definition: unknown): unknown;
}

declare module '@ai-sdk/openai' {
  export interface OpenAIClientOptions {
    apiKey: string;
    baseURL?: string;
  }

  export type OpenAIModelFactory = (model: string) => unknown;

  export function createOpenAI(options: OpenAIClientOptions): OpenAIModelFactory;
}
