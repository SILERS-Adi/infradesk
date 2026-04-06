import PDFDocument from 'pdfkit';
import prisma from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';

export async function generateAuditReport(agentId: string, workspaceId: string): Promise<Buffer> {
  const agent = await prisma.agentRegistration.findFirst({
    where: { id: agentId },
    include: { workspace: { select: { name: true, logoUrl: true } } },
  });
  if (!agent) throw new AppError('Agent not found', 404);

  const sm = agent.serverMetrics as any;
  const audit = sm?.securityAudit;
  const scan = sm?.networkScan;
  const disks = sm?.smartDisks || [];
  const services = sm?.services || [];

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  // ── Header ──
  doc.fontSize(22).font('Helvetica-Bold').text('Raport Audytu IT', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica').fillColor('#666')
    .text(`Wygenerowano: ${new Date().toLocaleDateString('pl-PL')} ${new Date().toLocaleTimeString('pl-PL')}`, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).text(`Agent: ${agent.hostname || agentId} | IP: ${agent.ipAddress || '-'} | OS: ${agent.windowsVersion || agent.osInfo || '-'}`, { align: 'center' });
  if (agent.workspace) {
    doc.text(`Firma: ${agent.workspace.name}`, { align: 'center' });
  }
  doc.moveDown(1);

  // ── Line ──
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
  doc.moveDown(1);

  // ── Audit Score ──
  if (audit) {
    const sc = audit.score;
    const color = sc >= 80 ? '#22C55E' : sc >= 60 ? '#F59E0B' : '#EF4444';
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Audyt bezpieczenstwa');
    doc.moveDown(0.3);
    doc.fontSize(36).font('Helvetica-Bold').fillColor(color).text(`${sc}/100`, { align: 'left' });
    doc.moveDown(0.5);

    const passed = audit.checks.filter((c: any) => c.status === 'pass').length;
    const failed = audit.checks.filter((c: any) => c.status === 'fail').length;
    doc.fontSize(10).font('Helvetica').fillColor('#333')
      .text(`Zaliczone: ${passed} | Niezdane: ${failed} | Lacznie: ${audit.checks.length}`);
    doc.moveDown(0.5);

    // Checks table
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#666');
    doc.text('Status', 50, doc.y, { width: 50, continued: false });

    for (const check of audit.checks) {
      if (doc.y > 720) { doc.addPage(); }
      const icon = check.status === 'pass' ? '[OK]' : '[X]';
      const clr = check.status === 'pass' ? '#22C55E' : '#EF4444';
      doc.fontSize(9).font('Helvetica-Bold').fillColor(clr).text(icon, 50, doc.y, { width: 35, continued: true });
      doc.font('Helvetica').fillColor('#333').text(`${check.name}`, { width: 200, continued: true });
      doc.fillColor('#888').text(`  [${check.severity}] ${check.detail}`, { width: 260 });
      doc.moveDown(0.1);
    }
    doc.moveDown(1);
  }

  // ── Network Scan ──
  if (scan && scan.devices?.length > 0) {
    if (doc.y > 600) doc.addPage();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Skan sieci');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#666')
      .text(`Podsiec: ${scan.subnet} | Brama: ${scan.gateway} | Urzadzen: ${scan.devices.length}`);
    doc.moveDown(0.5);

    // Devices table header
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#888');
    const y0 = doc.y;
    doc.text('Typ', 50, y0, { width: 60 });
    doc.text('IP', 110, y0, { width: 90 });
    doc.text('MAC', 200, y0, { width: 110 });
    doc.text('Hostname', 310, y0, { width: 120 });
    doc.text('Porty', 430, y0, { width: 115 });
    doc.moveDown(0.5);

    for (const d of scan.devices) {
      if (doc.y > 720) doc.addPage();
      const dy = doc.y;
      doc.fontSize(8).font('Helvetica').fillColor('#333');
      doc.text(d.type, 50, dy, { width: 60 });
      doc.text(d.ip, 110, dy, { width: 90 });
      doc.text(d.mac || '-', 200, dy, { width: 110 });
      doc.text(d.hostname || '-', 310, dy, { width: 120 });
      doc.text(d.ports?.join(', ') || '-', 430, dy, { width: 115 });
      doc.moveDown(0.3);
    }
    doc.moveDown(1);
  }

  // ── Disks ──
  if (disks.length > 0) {
    if (doc.y > 650) doc.addPage();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('S.M.A.R.T. Dyski');
    doc.moveDown(0.3);

    for (const d of disks) {
      const healthy = d.health?.toLowerCase() === 'healthy' || d.health?.toLowerCase() === 'ok';
      doc.fontSize(9).font('Helvetica').fillColor(healthy ? '#22C55E' : '#EF4444')
        .text(`${healthy ? '[OK]' : '[!]'} ${d.name} — ${d.type} — ${d.sizeGb} GB — ${d.health}`);
      doc.moveDown(0.1);
    }
    doc.moveDown(1);
  }

  // ── Services ──
  if (services.length > 0) {
    if (doc.y > 650) doc.addPage();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Uslugi Windows');
    doc.moveDown(0.3);

    const running = services.filter((s: any) => s.status === 'Running').length;
    const stopped = services.filter((s: any) => s.status !== 'Running').length;
    doc.fontSize(10).font('Helvetica').fillColor('#666').text(`Dzialajace: ${running} | Zatrzymane: ${stopped}`);
    doc.moveDown(0.3);

    for (const s of services) {
      if (doc.y > 720) doc.addPage();
      const clr = s.status === 'Running' ? '#22C55E' : '#EF4444';
      doc.fontSize(8).font('Helvetica').fillColor(clr)
        .text(`${s.status === 'Running' ? '[+]' : '[-]'} ${s.displayName || s.name}`);
      doc.moveDown(0.05);
    }
  }

  // ── Footer ──
  doc.moveDown(2);
  doc.fontSize(8).font('Helvetica').fillColor('#aaa')
    .text('Wygenerowano automatycznie przez InfraDesk — infradesk.pl', 50, 770, { align: 'center' });

  doc.end();
  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
