import { Request, Response, NextFunction } from 'express';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });

/* ───────── Voice command – full system management ───────── */

const COMMAND_SYSTEM_PROMPT = `Jesteś asystentem głosowym systemu InfraDesk – platformy IT helpdesk.
Analizujesz polecenia głosowe po polsku i zwracasz TYLKO JSON (bez markdown, bez wyjaśnień).

Dostępne akcje i ich wymagane pola:

1. CREATE_CLIENT – załóż nową firmę/klienta
   { "action": "CREATE_CLIENT", "params": { "name": string, "clientType": "COMPANY"|"INDIVIDUAL", "taxId": string|null, "email": string|null, "phone": string|null, "address": string|null } }

2. CREATE_TICKET – utwórz zgłoszenie serwisowe
   { "action": "CREATE_TICKET", "params": { "clientName": string|null, "title": string, "description": string|null, "priority": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "type": "INCIDENT"|"REQUEST"|"MAINTENANCE"|"INSTALLATION"|"OTHER", "assigneeName": string|null } }

3. CREATE_TASK – utwórz zadanie wewnętrzne
   { "action": "CREATE_TASK", "params": { "title": string, "description": string|null, "assigneeName": string|null, "dueAt": string|null } }

4. CREATE_ORDER – utwórz zamówienie
   { "action": "CREATE_ORDER", "params": { "clientName": string|null, "items": [{ "name": string, "quantity": number }], "notes": string|null } }

5. CREATE_DELEGATION – zaplanuj delegację/wyjazd
   { "action": "CREATE_DELEGATION", "params": { "clientName": string|null, "title": string, "description": string|null, "scheduledAt": string|null, "assigneeName": string|null } }

6. CHANGE_STATUS – zmień status zgłoszenia/zadania
   { "action": "CHANGE_STATUS", "params": { "entity": "TICKET"|"TASK"|"ORDER", "identifier": string, "newStatus": string } }
   Statusy zgłoszeń: PENDING, ASSIGNED, COMPLETED, CANCELLED
   Statusy zadań: NEW, IN_PROGRESS, DONE
   Statusy zamówień: NEW, PENDING_APPROVAL, IN_PROGRESS, INSTALLED, CANCELLED

7. ASSIGN_TICKET – przypisz zgłoszenie do technika
   { "action": "ASSIGN_TICKET", "params": { "identifier": string, "assigneeName": string } }

8. ADD_COMMENT – dodaj komentarz do zgłoszenia
   { "action": "ADD_COMMENT", "params": { "identifier": string, "comment": string, "isInternal": boolean } }

9. SEARCH – wyszukaj informacje
   { "action": "SEARCH", "params": { "entity": "CLIENT"|"TICKET"|"TASK"|"DEVICE", "query": string } }

10. UNKNOWN – nie rozpoznano polecenia
    { "action": "UNKNOWN", "params": { "message": string } }

Zasady:
- "identifier" to numer/tytuł rekordu podany przez użytkownika (np. "zgłoszenie 15", "zadanie napraw serwer")
- Dla dat względnych (np. "jutro", "za tydzień") oblicz datę ISO na podstawie dzisiejszej daty
- Jeśli priorytet nie podany, domyślnie "MEDIUM"
- Jeśli typ zgłoszenia nie podany, domyślnie "INCIDENT"
- assigneeName to imię i/lub nazwisko technika
- Dla CREATE_CLIENT: jeśli podano NIP to "COMPANY", inaczej "INDIVIDUAL"
- Zawsze odpowiadaj jednym obiektem JSON`;

export async function parseCommand(req: Request, res: Response, next: NextFunction) {
  try {
    const { transcript } = req.body as { transcript: string };
    if (!transcript?.trim()) {
      res.status(400).json({ error: 'transcript required' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: COMMAND_SYSTEM_PROMPT + `\n\nDzisiejsza data: ${today}`,
      messages: [{ role: 'user', content: transcript }],
    });

    let text = message.content[0].type === 'text' ? message.content[0].text : '{}';
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
      res.json(JSON.parse(text));
    } catch {
      res.json({ action: 'UNKNOWN', params: { message: text } });
    }
  } catch (err) {
    next(err);
  }
}

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

export async function suggestSolution(req: Request, res: Response, next: NextFunction) {
  try {
    const { title, description, source, deviceInfo } = req.body as {
      title: string; description?: string; source?: string; deviceInfo?: string;
    };
    if (!title?.trim()) { res.status(400).json({ error: 'title required' }); return; }

    const context = [
      `Zgłoszenie: ${title}`,
      description && `Opis: ${description}`,
      source && `Źródło: ${source}`,
      deviceInfo && `Informacje o urządzeniu: ${deviceInfo}`,
    ].filter(Boolean).join('\n');

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `Jesteś ekspertem IT helpdesk. Analizujesz zgłoszenia serwisowe i sugerujesz rozwiązania.
Odpowiadaj KRÓTKO, po polsku, praktycznie.
Zwróć JSON (bez markdown) z polami:
- summary: string (1-2 zdania co jest problemem)
- steps: string[] (lista kroków do rozwiązania, max 5)
- canAutoFix: boolean (czy da się naprawić zdalnie automatycznie)
- autoFixType: "WINDOWS_UPDATE" | "RESTART" | "DISK_CLEANUP" | "ANTIVIRUS_SCAN" | null
- estimatedTime: string (np. "15 min", "1h")
- difficulty: "EASY" | "MEDIUM" | "HARD"`,
      messages: [{ role: 'user', content: context }],
    });

    let text = message.content[0].type === 'text' ? message.content[0].text : '{}';
    // Strip markdown code blocks
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      res.json(JSON.parse(text));
    } catch {
      res.json({ summary: text, steps: [], canAutoFix: false, autoFixType: null, estimatedTime: '—', difficulty: 'MEDIUM' });
    }
  } catch (err) {
    next(err);
  }
}
