import prisma from '../../lib/prisma';

export async function getSalesReport(workspaceId: string) {
  // All documents for workspace
  const docs = await prisma.invoiceDocument.findMany({
    where: { workspaceId },
    select: {
      id: true, status: true, type: true, contractorName: true,
      totalNet: true, totalVat: true, totalGross: true, issuedAt: true,
    },
    orderBy: { issuedAt: 'desc' },
  });

  // Totals
  let totalNet = 0, totalVat = 0, totalGross = 0;
  docs.forEach(d => {
    totalNet += Number(d.totalNet);
    totalVat += Number(d.totalVat);
    totalGross += Number(d.totalGross);
  });

  // By status
  const statusMap: Record<string, { count: number; gross: number }> = {};
  docs.forEach(d => {
    const s = d.status.toLowerCase();
    if (!statusMap[s]) statusMap[s] = { count: 0, gross: 0 };
    statusMap[s].count++;
    statusMap[s].gross += Number(d.totalGross);
  });
  const byStatus = Object.entries(statusMap).map(([status, v]) => ({ status, ...v }));

  // Daily sales (last 30 days)
  const daily: Record<string, { count: number; gross: number; net: number }> = {};
  docs.forEach(d => {
    const day = d.issuedAt.toISOString().slice(0, 10);
    if (!daily[day]) daily[day] = { count: 0, gross: 0, net: 0 };
    daily[day].count++;
    daily[day].gross += Number(d.totalGross);
    daily[day].net += Number(d.totalNet);
  });
  const dailySales = Object.entries(daily)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top contractors
  const contractorMap: Record<string, { count: number; gross: number }> = {};
  docs.forEach(d => {
    const name = d.contractorName;
    if (!contractorMap[name]) contractorMap[name] = { count: 0, gross: 0 };
    contractorMap[name].count++;
    contractorMap[name].gross += Number(d.totalGross);
  });
  const topContractors = Object.entries(contractorMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.gross - a.gross)
    .slice(0, 10);

  return {
    totalDocuments: docs.length,
    totalNet: parseFloat(totalNet.toFixed(2)),
    totalVat: parseFloat(totalVat.toFixed(2)),
    totalGross: parseFloat(totalGross.toFixed(2)),
    byStatus,
    dailySales,
    topContractors,
  };
}
