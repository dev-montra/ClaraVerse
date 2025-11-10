/**
 * Task Completion Verifier Service
 * Uses LLM-based structured output to verify if autonomous agent tasks are truly complete
 */

import { AssistantAPIClient } from '../utils/AssistantAPIClient';
import type { ChatMessage } from '../utils/APIClient';

/**
 * Result of task completion verification
 */
export interface VerificationResult {
  /** Whether the task is fully complete */
  isComplete: boolean;

  /** Confidence level (0-100) that the assessment is correct */
  confidence: number;

  /** Reasoning for the completion assessment */
  reasoning: string;

  /** List of remaining work items if task is incomplete */
  remainingWork: string[];

  /** Whether the agent should continue iterating */
  shouldContinue: boolean;
}

/**
 * Service for verifying task completion using LLM analysis
 */
export class TaskCompletionVerifier {
  /**
   * Verify if a task is complete by analyzing the original request and execution results
   */
  async verifyCompletion(
    client: AssistantAPIClient,
    modelId: string,
    originalTask: string,
    toolsExecuted: string[],
    toolResults: any[],
    currentResponse: string
  ): Promise<VerificationResult> {
    try {
      console.log('🔍 Starting task completion verification...');

      // Build verification prompt
      const verificationPrompt = this.buildVerificationPrompt(
        originalTask,
        toolsExecuted,
        toolResults,
        currentResponse
      );

      // Always use prompt-based verification (works for all providers)
      return await this.verifyWithPromptBased(client, modelId, verificationPrompt);
    } catch (error) {
      console.error('❌ Verification failed:', error);

      // On error, default to continuing (safer than premature stop)
      return {
        isComplete: false,
        confidence: 0,
        reasoning: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        remainingWork: ['Verification error - continuing for safety'],
        shouldContinue: true
      };
    }
  }

  /**
   * Build the verification prompt
   */
  private buildVerificationPrompt(
    originalTask: string,
    toolsExecuted: string[],
    toolResults: any[],
    currentResponse: string
  ): string {
    // Format tool execution summary
    const toolSummary = toolsExecuted.length > 0
      ? toolsExecuted.map((tool, i) => {
          const result = toolResults[i];
          const success = result?.success !== false;
          const resultPreview = this.formatResultPreview(result);
          return `• ${tool}: ${success ? '✅ Success' : '❌ Failed'} - ${resultPreview}`;
        }).join('\n')
      : 'No tools executed';

    return `You are evaluating whether an autonomous agent has FULLY completed a task.

ORIGINAL TASK REQUEST:
${originalTask}

TOOLS EXECUTED:
${toolSummary}

CURRENT AGENT RESPONSE:
${currentResponse}

Your job is to critically evaluate if the ORIGINAL TASK is completely satisfied based on:
1. The tool execution results
2. The agent's current response
3. Whether all aspects of the original request are addressed

Be strict in your evaluation:
- If ANY part of the task is incomplete, mark isComplete as false
- If tool results show errors or missing data, mark isComplete as false
- If the agent needs to do more work, mark shouldContinue as true
- List specific remaining work items if task is incomplete

Return your assessment as JSON with this structure:
{
  "isComplete": true or false,
  "confidence": 0-100 (how confident you are in this assessment),
  "reasoning": "Detailed explanation of why task is/isn't complete",
  "remainingWork": ["specific item 1", "specific item 2"] or [],
  "shouldContinue": true or false
}`;
  }

  /**
   * Format tool result for display
   */
  private formatResultPreview(result: any): string {
    if (!result) return 'No result';

    if (result.error) {
      return `Error: ${result.error}`;
    }

    if (result.result) {
      const resultStr = typeof result.result === 'string'
        ? result.result
        : JSON.stringify(result.result);
      return resultStr.length > 100
        ? resultStr.substring(0, 100) + '...'
        : resultStr;
    }

    return 'Completed';
  }

  /**
   * Verify using prompt-based structured output
   */
  private async verifyWithPromptBased(
    client: AssistantAPIClient,
    modelId: string,
    verificationPrompt: string
  ): Promise<VerificationResult> {
    console.log('🔍 Using prompt-based verification');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a task completion evaluator. Always respond with valid JSON matching the requested structure. Do not include any text outside the JSON object.'
      },
      {
        role: 'user',
        content: verificationPrompt
      }
    ];

    const options = {
      temperature: 0.3,
      max_tokens: 1000
    };

    const response = await client.sendChat(modelId, messages, options);
    const content = response.message?.content || '';

    // Parse JSON from response
    const parsed = this.parseVerificationResponse(content);

    console.log(`🔍 Verification result: ${parsed.isComplete ? '✅ Complete' : '❌ Incomplete'} (confidence: ${parsed.confidence}%)`);
    console.log(`   Reasoning: ${parsed.reasoning}`);

    return parsed;
  }

  /**
   * Parse verification response from text (handles both JSON and text responses)
   */
  private parseVerificationResponse(content: string): VerificationResult {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (typeof parsed.isComplete !== 'boolean') {
        throw new Error('Missing or invalid isComplete field');
      }

      // Provide defaults for missing fields
      return {
        isComplete: parsed.isComplete,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided',
        remainingWork: Array.isArray(parsed.remainingWork) ? parsed.remainingWork : [],
        shouldContinue: typeof parsed.shouldContinue === 'boolean' ? parsed.shouldContinue : !parsed.isComplete
      };
    } catch (error) {
      console.error('❌ Failed to parse verification response:', error);
      console.log('   Response content:', content);

      // If parsing fails, analyze response text heuristically
      const lowerContent = content.toLowerCase();
      const seemsComplete = lowerContent.includes('complete') || lowerContent.includes('done') || lowerContent.includes('finished');
      const seemsIncomplete = lowerContent.includes('incomplete') || lowerContent.includes('not done') || lowerContent.includes('remaining');

      return {
        isComplete: seemsComplete && !seemsIncomplete,
        confidence: 30, // Low confidence for heuristic parsing
        reasoning: 'Failed to parse JSON response, used text analysis',
        remainingWork: seemsIncomplete ? ['Could not parse specific remaining work'] : [],
        shouldContinue: !seemsComplete || seemsIncomplete
      };
    }
  }
}

// Export singleton instance
export const taskCompletionVerifier = new TaskCompletionVerifier();
