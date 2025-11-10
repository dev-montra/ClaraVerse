import { APIClient, ChatMessage, RequestOptions } from './APIClient';
import type { Tool } from '../db';

interface ModelConfig {
  visionModel: string;
  toolModel: string;
  ragModel: string;
}

export class AssistantAPIClient extends APIClient {
  private modelConfig: ModelConfig = {
    visionModel: '',
    toolModel: '',
    ragModel: ''
  };

  constructor(baseUrl: string, config?: any) {
    super(baseUrl, config);
  }

  public setModelConfig(config: Partial<ModelConfig>) {
    this.modelConfig = { ...this.modelConfig, ...config };
  }

  public getModelConfig(): ModelConfig {
    return { ...this.modelConfig };
  }

  public async generateWithImages(
    defaultModel: string,
    prompt: string,
    images: string[],
    options: RequestOptions = {}
  ): Promise<any> {
    // Use vision model if configured, otherwise fall back to default
    const model = this.modelConfig.visionModel || defaultModel;
    return super.generateWithImages(model, prompt, images, options);
  }

  public async sendChat(
    defaultModel: string,
    messages: ChatMessage[],
    options: RequestOptions = {},
    tools?: Tool[]
  ): Promise<any> {
    // Use tool model for tool calls, RAG model for RAG, or default model
    let model = defaultModel;

    if (tools && tools.length > 0) {
      model = this.modelConfig.toolModel || defaultModel;
    } else if (options.useRag) {
      model = this.modelConfig.ragModel || defaultModel;
    }

    // Sanitize messages to remove <think> tags that cause MCP server template errors
    const sanitizedMessages = messages.map(msg => ({
      ...msg,
      content: typeof msg.content === 'string'
        ? msg.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
        : msg.content
    }));

    return super.sendChat(model, sanitizedMessages, options, tools);
  }

  public async *streamChat(
    defaultModel: string,
    messages: ChatMessage[],
    options: RequestOptions = {},
    tools?: Tool[]
  ): AsyncGenerator<any> {
    // Use tool model for tool calls, RAG model for RAG, or default model
    let model = defaultModel;

    if (tools && tools.length > 0) {
      model = this.modelConfig.toolModel || defaultModel;
    } else if (options.useRag) {
      model = this.modelConfig.ragModel || defaultModel;
    }

    // Sanitize messages to remove <think> tags that cause MCP server template errors
    const sanitizedMessages = messages.map(msg => ({
      ...msg,
      content: typeof msg.content === 'string'
        ? msg.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
        : msg.content
    }));

    yield* super.streamChat(model, sanitizedMessages, options, tools);
  }
} 