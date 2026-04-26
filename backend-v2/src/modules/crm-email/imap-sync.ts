import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { prismaBg as prisma } from "../../lib/prisma-bg";
import { logger } from '../../lib/logger';
import { decrypt } from '../../lib/crypto';
import { syncGmailForUser } from '../auth-google/gmail-sync';
import { loadTokensForUser } from '../auth-google/google.service';

export interface SyncResult {
  accountId: string;
  email: string;
  newMessages: number;
  error?: string;
}

/**
 * Sync a single mailbox.
 *
 * Dispatch order:
 *   1. If the account's owning user has Google OAuth tokens AND the account's
 *      email matches the connected Google email → use Gmail API (no IMAP password needed).
 *   2. Otherwise fall back to classic IMAP (requires imapHost + encrypted password).
 *
 * IMAP path left intact so non-Gmail providers keep working.
 */
export async function syncMailbox(accountId: string): Promise<SyncResult> {
  const account = await prisma.userEmailAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true, email: true, workspaceId: true, userId: true,
      imapHost: true, imapPort: true, imapUsername: true,
      imapPasswordEnc: true, imapPasswordIv: true, imapPasswordAuthTag: true,
      imapUseTls: true, lastSyncAt: true,
    },
  });
  if (!account) return { accountId, email: '?', newMessages: 0, error: 'account_not_found' };

  // Sprint 6: try Gmail OAuth branch first if the account's user has tokens
  // for this exact mailbox. Falls through to IMAP on any error.
  if (account.userId) {
    try {
      const tokens = await loadTokensForUser(account.userId);
      if (tokens && tokens.email.toLowerCase() === account.email.toLowerCase()) {
        const r = await syncGmailForUser(account.userId);
        if (!r.error) {
          return { accountId, email: account.email, newMessages: r.newMessages };
        }
        logger.warn({ accountId, err: r.error }, '[sync] gmail branch failed, falling back to IMAP');
      }
    } catch (err) {
      logger.warn({ err, accountId }, '[sync] gmail check failed, falling back to IMAP');
    }
  }

  if (!account.imapHost || !account.imapUsername || !account.imapPasswordEnc) {
    return { accountId, email: account.email, newMessages: 0, error: 'imap_not_configured' };
  }

  let client: ImapFlow | null = null;
  try {
    const password = decrypt({
      ciphertext: account.imapPasswordEnc,
      iv: account.imapPasswordIv!,
      authTag: account.imapPasswordAuthTag!,
    });

    client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort ?? 993,
      secure: account.imapUseTls,
      auth: { user: account.imapUsername, pass: password },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    let newCount = 0;
    try {
      // First sync: ostatnie 50 wiadomości. Kolejne: since lastSyncAt.
      const since = account.lastSyncAt ?? new Date(Date.now() - 7 * 86_400_000);
      const search = await client.search({ since });
      if (!search || search.length === 0) {
        await prisma.userEmailAccount.update({
          where: { id: account.id },
          data: { lastSyncAt: new Date(), lastErrorAt: null, lastErrorMsg: null },
        });
        return { accountId, email: account.email, newMessages: 0 };
      }

      // Limit per-run to 100 (safety)
      const uids = search.slice(-100);

      // Fetch existing messageIds to dedup
      const existingMsgIds = await prisma.emailMessage.findMany({
        where: {
          accountId: account.id,
          messageId: { not: null },
        },
        select: { messageId: true },
        take: 500,
      });
      const seen = new Set(existingMsgIds.map((m) => m.messageId!));

      for (const uid of uids) {
        const msgStream = await client.fetchOne(String(uid), { source: true, envelope: true });
        if (!msgStream || !msgStream.source) continue;
        const parsed: ParsedMail = await simpleParser(msgStream.source);
        const messageId = parsed.messageId ?? null;
        if (messageId && seen.has(messageId)) continue;

        const toList = Array.isArray(parsed.to) ? parsed.to.flatMap((a) => a.value.map((v) => v.address ?? '')) : (parsed.to?.value.map((v) => v.address ?? '') ?? []);
        const ccList = Array.isArray(parsed.cc) ? parsed.cc.flatMap((a) => a.value.map((v) => v.address ?? '')) : (parsed.cc?.value.map((v) => v.address ?? '') ?? []);
        const fromAddr = parsed.from?.value?.[0]?.address ?? 'unknown@unknown';
        const fromName = parsed.from?.value?.[0]?.name ?? null;

        await prisma.emailMessage.create({
          data: {
            workspaceId: account.workspaceId,
            accountId: account.id,
            messageId,
            direction: 'INBOUND',
            folder: 'INBOX',
            fromAddress: fromAddr,
            fromName,
            toAddresses: toList.filter(Boolean),
            ccAddresses: ccList.filter(Boolean),
            subject: parsed.subject ?? null,
            bodyText: (parsed.text ?? '').slice(0, 49_000),
            bodyHtml: parsed.html ? String(parsed.html).slice(0, 49_000) : null,
            receivedAt: parsed.date ?? new Date(),
            addedManually: false,
          },
        });
        if (messageId) seen.add(messageId);
        newCount++;
      }

      await prisma.userEmailAccount.update({
        where: { id: account.id },
        data: { lastSyncAt: new Date(), lastErrorAt: null, lastErrorMsg: null },
      });
    } finally {
      lock.release();
    }

    return { accountId, email: account.email, newMessages: newCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err, accountId, email: account.email }, '[imap-sync] failed');
    await prisma.userEmailAccount.update({
      where: { id: account.id },
      data: { lastErrorAt: new Date(), lastErrorMsg: msg.slice(0, 500) },
    });
    return { accountId, email: account.email, newMessages: 0, error: msg };
  } finally {
    if (client) {
      try { await client.logout(); } catch { /* ignore */ }
    }
  }
}

/**
 * Sync all active mailboxes with IMAP config. Called by scheduler every 2 min.
 */
export async function syncAllMailboxes(): Promise<SyncResult[]> {
  const accounts = await prisma.userEmailAccount.findMany({
    where: {
      isActive: true,
      imapHost: { not: null },
      imapPasswordEnc: { not: null },
    },
    select: { id: true },
  });
  const results: SyncResult[] = [];
  // Sekwencyjnie żeby nie zawalić serwera IMAP klienta paralelnymi połączeniami
  for (const a of accounts) {
    const r = await syncMailbox(a.id);
    results.push(r);
  }
  return results;
}

let schedulerHandle: NodeJS.Timeout | null = null;
const SYNC_INTERVAL_MS = 2 * 60_000; // co 2 min

export function startImapScheduler(): void {
  if (schedulerHandle) return;
  logger.info('[imap-sync] scheduler started — interval 120s');
  // Pierwszy run po 30s od startu (żeby backend się ustabilizował), potem co 2 min
  schedulerHandle = setTimeout(async function tick() {
    try {
      const results = await syncAllMailboxes();
      const total = results.reduce((s, r) => s + r.newMessages, 0);
      if (total > 0) logger.info({ count: results.length, total }, '[imap-sync] synced');
    } catch (err) {
      logger.warn({ err }, '[imap-sync] scheduler tick error');
    } finally {
      schedulerHandle = setTimeout(tick, SYNC_INTERVAL_MS);
    }
  }, 30_000);
}

export function stopImapScheduler(): void {
  if (schedulerHandle) {
    clearTimeout(schedulerHandle);
    schedulerHandle = null;
    logger.info('[imap-sync] scheduler stopped');
  }
}
