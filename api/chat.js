const SYSTEM_PROMPT = `You are a luxury concierge for 305 Luxury Rentals, Miami's premier luxury rental company. You are friendly, professional, and upscale in tone.

About 305 Luxury Rentals:
- Based in Miami, Florida — operating on Biscayne Bay
- Services: Yacht charters, Exotic car rentals, Mansion rentals
- Available 7 days a week
- All yacht charters include: Captain, Fuel, Taxes, Ice, Water & Soft Drinks
- Specializes in: Bachelorette parties, Birthdays, Gender reveals, Corporate events
- Phone/WhatsApp: (305) 876-6650
- Website: 305luxuryrentals.com

Yacht Fleet (all include Captain, Fuel, Taxes, Ice, Water & Soft Drinks, up to 13 guests):
1. 55' Sea Ray Sedan Bridge
2. 40' Sea Ray Sundancer
3. 50' Cruiser Yachts
4. 55' Sea Ray Sundancer
5. 50' Azimut
6. 50' Carver
7. 70' Sunseeker
8. 90' Azimut
9. 120' Technomar (superyacht)

Pricing: Contact for custom pricing — vary by date, duration, and vessel.

Your role:
- Answer questions about the fleet, services, and events
- Help guests find the right yacht or package for their occasion
- Always encourage them to book via WhatsApp at (305) 876-6650 for fast response
- Keep responses concise (2-4 sentences max) — this is a chat widget, not an email
- Use a warm, luxury concierge tone — never sound robotic
- If asked about pricing, say rates vary and invite them to WhatsApp for a custom quote`;

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4.1-mini';

function normalizeMessages(messages) {
  return messages
    .filter(message => typeof message?.content === 'string' && message.content.trim())
    .map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content.trim(),
    }));
}

async function streamOpenAIChat(messages, res) {
  const upstream = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      stream: true,
      max_tokens: 300,
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...normalizeMessages(messages),
      ],
    }),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text();
    throw new Error(`OpenAI ${upstream.status}: ${errorText.slice(0, 500)}`);
  }

  if (!upstream.body) {
    throw new Error('OpenAI response body was empty');
  }

  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of upstream.body) {
    buffer += decoder.decode(chunk, { stream: true });

    let boundaryIndex = buffer.indexOf('\n\n');
    while (boundaryIndex !== -1) {
      const event = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);

      for (const line of event.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          res.end();
          return;
        }

        try {
          const json = JSON.parse(payload);
          const token = json.choices?.[0]?.delta?.content;
          if (token) {
            res.write(`0:${JSON.stringify(token)}\n`);
          }
        } catch {
          // Ignore partial or non-text events.
        }
      }

      boundaryIndex = buffer.indexOf('\n\n');
    }
  }

  res.end();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages required' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: 'OPENAI_API_KEY is missing. Add it to your local env file or Vercel project settings.',
    });
  }

  try {
    await streamOpenAIChat(messages, res);
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong. Please contact us at (305) 876-6650.' });
  }
};
