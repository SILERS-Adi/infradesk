import { google } from 'googleapis';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { getAuthedClientForUser, loadTokensForUser } from './google.service';

export interface GmailSyncResult {
  userId: string;
  accountId?: string;
  email: string;
  newMessages: number;
  error?: string;
}

/**
 * Sync Gmail INBOX for a user who has connected Google OAuth.
 *
 * Looks up UserEmailAccount whose email matches the Google userinfo email
 * (created implicitly during OAuth), falling back to the user's primary one.
 * Writes EmailMessage rows de-duped by Gmail's `id` (stored in messageId).
 */
export async function syncGmailForUser(userId: string): Promise<GmailSyncResult> {
  const tokens = await loadTokensForUser(userId);
  if (!tokens) {
    return { userId, email: '?', newMessages: 0, error: 'not_connected' };
  }

  try {
    const oauth = await getAuthedClientForUser(userId);
    const gmail = google.gmail({ version: 'v1', auth: oauth });

    // Map Gmail mailbox to a UserEmailAccount (must exist so messages have a home).
    const account = await prisma.userEmailAccount.findFirst({
      where: { userId, email: tokens.email, isActive: true },
      select: { id: true, workspaceId: true, email: true, lastSyncAt: true },
    });

    if (!account) {
      return {
        userId,
        email: tokens.email,
        newMessages: 0,
        error: 'no_matching_UserEmailAccount — create one with provider=GMAIL first',
      };
    }

    // Query: only INBOX, newer than last sync (Gmail `after:` uses epoch seconds).
    const sinceEpoch = Math.floor(
      (account.lastSyncAt ?? new Date(Date.now() - 7 * 86_400_000)).getTime() / 1000,
    );
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: `in:inbox after:${sinceEpoch}`,
      maxResults: 100,
    });
    const ids = list.data.messages?.map((m) => m.id!).filter(Boolean) ?? [];

    if (ids.length === 0) {
      await prisma.userEmailAccount.update({
        where: { id: account.id },
        data: { lastSyncAt: new Date(), lastErrorAt: null, lastErrorMsg: null },
      });
      return { userId, accountId: account.id, email: account.email, newMessages: 0 };
    }

    // Dedupe against existing messageIds (we store Gmail's `id` there).
    const existing = await prisma.emailMessage.findMany({
      where: { accountId: account.id, messageId: { in: ids } },
      select: { messageId: true },
    });
    const seen = new Set(existing.map((m) => m.messageId!));
    let newCount = 0;

    for (const id of ids) {
      if (seen.has(id)) continue;
      const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
      const payload = msg.data.payload;
      const headers = payload?.headers ?? [];
      const header = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

      const fromRaw = header('from');
      const subject = header('subject') || null;
      const dateStr = header('date');
      const toRaw = header('to');
      const ccRaw = header('cc');

      // Primitive From-header split — "Name <addr>" or bare "addr".
      const emailRe = /<([^>]+)>/;
      const fromMatch = fromRaw.match(emailRe);
      const fromAddress = fromMatch ? fromMatch[1] : fromRaw.trim() || 'unknown@unknown';
      const fromName = fromMatch ? fromRaw.slice(0, fromRaw.indexOf('<')).trim().replace(/"/g, '') || null : null;

      const splitAddrs = (raw: string): string[] =>
        raw
          .split(',')
          .map((p) => {
            const m = p.match(emailRe);
            return (m ? m[1] : p).trim();
          })
          .filter(Boolean);

      // Body extraction — walk parts looking for text/plain then text/html.
      let bodyText = '';
      let bodyHtml = '';
      const walk = (part: { mimeType?: string | null; body?: { data?: string | null }; parts?: unknown[] } | undefined) => {
        if (!part) return;
        const data = part.body?.data;
        if (data) {
          const buf = Buffer.from(data, 'base64url').toString('utf8');
          if (part.mimeType === 'text/plain' && !bodyText) bodyText = buf;
          if (part.mimeType === 'text/html' && !bodyHtml) bodyHtml = buf;
        }
        const sub = part.parts as typeof part[] | undefined;
        if (Array.isArray(sub)) sub.forEach(walk);
      };
      walk(payload as unknown as Parameters<typeof walk>[0]);
      if (!bodyText && msg.data.snippet) bodyText = msg.data.snippet;

      await prisma.emailMessage.create({
        data: {
          workspaceId: account.workspaceId,
          accountId: account.id,
          messageId: id,
          direction: 'INBOUND',
          folder: 'INBOX',
          fromAddress,
          fromName,
          toAddresses: splitAddrs(toRaw),
          ccAddresses: splitAddrs(ccRaw),
          subject,
          bodyText: bodyText.slice(0, 49_000),
          bodyHtml: bodyHtml ? bodyHtml.slice(0, 49_000) : null,
          receivedAt: dateStr ? new Date(dateStr) : new Date(),
          addedManually: false,
        },
      });
      newCount++;
    }

    await prisma.userEmailAccount.update({
      where: { id: account.id },
      data: { lastSyncAt: new Date(), lastErrorAt: null, lastErrorMsg: null },
    });
    return { userId, accountId: account.id, email: account.email, newMessages: newCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err, userId }, '[gmail-sync] failed');
    return { userId, email: tokens.email, newMessages: 0, error: msg };
  }
}
