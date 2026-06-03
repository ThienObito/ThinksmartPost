/**
 * AI Client — Gemini API wrapper.
 * Replaces direct DeepSeek calls across all API modules.
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

  return response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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

  return response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

module.exports = { callGemini, callGeminiWithSystem };
