/**
 * AI Client — Gemini API wrapper (chính thức).
 * Dùng GEMINI_API_KEY từ .env.
 *
 * Usage:
 *   const { callGemini, callGeminiWithSystem } = require('../utils/ai-client');
 *   const text = await callGemini(prompt, { temperature: 0.7, max_tokens: 2000 });
 *   const text = await callGeminiWithSystem(systemPrompt, userMsg, { temperature: 0.7 });
 */

const axios = require('axios');

const GEMINI_MODEL = 'gemini-2.5-flash';
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function getApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('Missing GEMINI_API_KEY in .env file');
  }
  return key;
}

/**
 * Parse Gemini response, handling API errors and empty responses.
 */
function parseGeminiResponse(responseData) {
  // Check for Gemini API error
  if (responseData?.error) {
    const err = responseData.error;
    throw new Error(`Gemini API error: ${err.message || JSON.stringify(err)}`);
  }
  const text = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text === undefined || text === null) {
    // Check if response was blocked
    const finishReason = responseData?.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      throw new Error(`Gemini response blocked: ${finishReason}`);
    }
    throw new Error('Gemini returned empty response (no text content)');
  }
  return text;
}

/**
 * Call Gemini with a plain user prompt (no system instruction).
 * Returns the full text response.
 * Option: responseMimeType = 'application/json' for structured JSON output.
 */
async function callGemini(prompt, options = {}) {
  const { temperature = 0.7, max_tokens = 2000, timeout = 30000, responseMimeType } = options;
  const url = `${BASE_URL}?key=${getApiKey()}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: max_tokens,
    },
  };
  if (responseMimeType) {
    body.generationConfig.responseMimeType = responseMimeType;
  }

  const response = await axios.post(url, body, { timeout });
  return parseGeminiResponse(response.data);
}

/**
 * Call Gemini with a system instruction + user message.
 * System instruction is passed via Gemini's system_instruction field.
 * Option: responseMimeType = 'application/json' for structured JSON output.
 */
async function callGeminiWithSystem(systemPrompt, userMessage, options = {}) {
  const { temperature = 0.7, max_tokens = 2000, timeout = 30000, responseMimeType } = options;
  const url = `${BASE_URL}?key=${getApiKey()}`;

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: max_tokens,
    },
  };
  if (responseMimeType) {
    body.generationConfig.responseMimeType = responseMimeType;
  }

  const response = await axios.post(url, body, { timeout });
  return parseGeminiResponse(response.data);
}

module.exports = { callGemini, callGeminiWithSystem };
