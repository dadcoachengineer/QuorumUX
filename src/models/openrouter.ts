/**
 * OpenRouter API Adapter
 *
 * Provides a simple, consistent interface for calling OpenRouter's chat completion API.
 * Handles request formatting, error handling, and response parsing.
 */

/**
 * Redact OpenRouter API keys from error text to prevent leaking secrets in logs.
 */
function redactApiKey(text: string): string {
  return text.replace(/sk-or-v1-[a-zA-Z0-9]+/g, 'sk-or-***').replace(/sk-or-[a-zA-Z0-9]+/g, 'sk-or-***');
}

/**
 * Parameters for OpenRouter API call
 */
export interface OpenRouterParams {
  /** OpenRouter model ID (e.g., "anthropic/claude-sonnet-4.6") */
  model: string;

  /** Message history for the conversation */
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: any;
  }>;

  /** Maximum tokens in response (optional) */
  maxTokens?: number;

  /** Referer header for tracking (optional) */
  referer?: string;

  /** Request title/label for tracking (optional) */
  title?: string;
}

/**
 * Response from OpenRouter API call
 */
export interface OpenRouterResponse {
  /** The content of the model's response */
  content: string;

  /** Token usage information (optional) */
  usage?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Call OpenRouter chat completion API
 *
 * Reads OPENROUTER_API_KEY from environment variables.
 * Returns the parsed text content and token usage metrics.
 *
 * @throws Error if API key is not set, request fails, or response is invalid
 */
export async function callOpenRouter(params: OpenRouterParams): Promise<OpenRouterResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable not set');
  }

  const url = 'https://openrouter.ai/api/v1/chat/completions';

  const requestBody = {
    model: params.model,
    messages: params.messages,
    max_tokens: params.maxTokens || 4096,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  // Add optional headers for tracking
  if (params.referer) {
    headers['HTTP-Referer'] = params.referer;
  }
  if (params.title) {
    headers['X-Title'] = params.title;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `OpenRouter API error: ${response.status} ${response.statusText}`;

      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage += ` - ${redactApiKey(errorJson.error.message)}`;
        }
      } catch {
        // Use generic error if JSON parsing fails
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0]) {
      throw new Error('Invalid OpenRouter response: missing choices');
    }

    const choice = data.choices[0];
    if (!choice.message || typeof choice.message.content !== 'string') {
      throw new Error('Invalid OpenRouter response: missing or invalid message content');
    }

    return {
      content: choice.message.content,
      usage: data.usage
        ? {
            prompt: data.usage.prompt_tokens,
            completion: data.usage.completion_tokens,
            total: data.usage.total_tokens,
          }
        : undefined,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`OpenRouter API call failed: ${String(error)}`);
  }
}
