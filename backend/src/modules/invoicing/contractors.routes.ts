import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { withWorkspaceMembership, authorizeWorkspace, requirePermission, requireWorkspace } from '../../middleware/workspace';
import { validate } from '../../middleware/validate';
import { createContractorSchema, updateContractorSchema } from './contractors.validation';
import * as ctrl from './contractors.controller';

const router = Router();
router.use(authenticate, requireWorkspace);

// GUS/NIP lookup — MF White List + REGON BIR for full company name
router.get('/nip-lookup/:nip', async (req, res, next) => {
  try {
    const nip = req.params.nip.replace(/[-\s]/g, '');
    if (!/^\d{10}$/.test(nip)) { res.status(400).json({ error: 'Nieprawidłowy NIP (10 cyfr)' }); return; }

    // 1. MF White List API (free, no key) — basic info + VAT status
    const today = new Date().toISOString().slice(0, 10);
    const mfUrl = `https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${today}`;
    let mfSubj: any = null;
    try {
      const mfResp = await fetch(mfUrl, { signal: AbortSignal.timeout(8000) });
      if (mfResp.ok) {
        const mfData = await mfResp.json();
        mfSubj = mfData?.result?.subject;
      }
    } catch {}

    // 2. REGON BIR1 API — full company name for JDG (sole traders)
    let regonName: string | null = null;
    try {
      // Login to BIR (test key works for production too since 2023)
      const BIR_URL = 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzworniki.svc';
      const BIR_KEY = process.env.REGON_API_KEY || 'abcde12345abcde12345';

      const loginXml = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07">
        <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing"><wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIR/Zaloguj</wsa:Action><wsa:To>${BIR_URL}</wsa:To></soap:Header>
        <soap:Body><ns:Zaloguj><ns:pKluczUzytkownika>${BIR_KEY}</ns:pKluczUzytkownika></ns:Zaloguj></soap:Body></soap:Envelope>`;

      const loginResp = await fetch(BIR_URL, {
        method: 'POST', body: loginXml,
        headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
        signal: AbortSignal.timeout(6000),
      });
      const loginBody = await loginResp.text();
      const sidMatch = loginBody.match(/<ZalogujResult>(.*?)<\/ZalogujResult>/);
      const sid = sidMatch?.[1];

      if (sid) {
        // Search by NIP
        const searchXml = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07" xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract">
          <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing"><wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIR/DaneSzukajPodmioty</wsa:Action><wsa:To>${BIR_URL}</wsa:To></soap:Header>
          <soap:Body><ns:DaneSzukajPodmioty><ns:pParametryWyszukiwania><dat:Nip>${nip}</dat:Nip></ns:pParametryWyszukiwania></ns:DaneSzukajPodmioty></soap:Body></soap:Envelope>`;

        const searchResp = await fetch(BIR_URL, {
          method: 'POST', body: searchXml,
          headers: { 'Content-Type': 'application/soap+xml; charset=utf-8', 'sid': sid },
          signal: AbortSignal.timeout(6000),
        });
        const searchBody = await searchResp.text();
        const nameMatch = searchBody.match(/<Nazwa>(.*?)<\/Nazwa>/);
        if (nameMatch?.[1]) regonName = nameMatch[1];
      }
    } catch (e) {
      // REGON API optional — don't fail if it's down
    }

    if (mfSubj) {
      const addr = mfSubj.workingAddress || mfSubj.residenceAddress || '';
      const addrParts = addr.split(',').map((s: string) => s.trim());
      const streetPart = addrParts[0] || '';
      const cityPart = addrParts.length > 1 ? addrParts[addrParts.length - 1] : '';
      const postalMatch = cityPart.match(/^(\d{2}-\d{3})\s*(.*)/);
      const city = postalMatch ? postalMatch[2] : cityPart;
      const postalCode = postalMatch ? postalMatch[1] : null;

      // Use REGON name if available (more complete for JDG), else MF name
      const name = regonName || mfSubj.name;
      // Detect if MF returned only person name (no company name for JDG)
      const isPersonName = !regonName && !mfSubj.krs && name === name.toUpperCase() && name.split(' ').length <= 3;

      res.json({
        name,
        isPersonName,
        nip: mfSubj.nip,
        regon: mfSubj.regon || null,
        street: streetPart || null,
        city: city || null,
        postalCode,
        bankAccounts: mfSubj.accountNumbers?.slice(0, 5) || [],
        statusVat: mfSubj.statusVat || null,
        krs: mfSubj.krs || null,
      });
      return;
    }

    res.status(404).json({ error: 'Nie znaleziono firmy o podanym NIP' });
  } catch (err: any) {
    if (err.name === 'TimeoutError') {
      res.status(504).json({ error: 'Serwer nie odpowiada — spróbuj ponownie' });
    } else {
      next(err);
    }
  }
});

router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(createContractorSchema), ctrl.create);
router.put('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN', 'TECHNICIAN'), validate(updateContractorSchema), ctrl.update);
router.delete('/:id', withWorkspaceMembership, authorizeWorkspace('OWNER', 'ADMIN'), requirePermission('invoicing.contractors', 'DELETE'), ctrl.remove);

export default router;
