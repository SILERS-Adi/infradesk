import { Request, Response, NextFunction } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function parseVoice(req: Request, res: Response, next: NextFunction) {
  try {
    const { transcript } = req.body as { transcript: string };
    if (!transcript?.trim()) {
      res.status(400).json({ error: 'transcript required' });
      return;
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: `Jesteś asystentem systemu zarządzania zgłoszeniami serwisowymi.
Analizujesz polecenia głosowe po polsku i wyciągasz dane strukturalne.
Zwróć TYLKO JSON (bez markdown, bez wyjaśnień) z polami:
- clientName: string lub null (nazwa firmy/klienta)
- type: "SERVICE" | "ORDER" | "DELEGATION" | "OTHER"
- title: string lub null (tytuł/temat)
- description: string lub null
- priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" lub null
- assigneeName: string lub null (imię pracownika do przydzielenia)`,
      messages: [{ role: 'user', content: transcript }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (err) {
    next(err);
  }
}
