/* ================= SINCRONIZZAZIONE FIREBASE → FOGLIO (dietro le quinte) =================
   Le app scrivono direttamente su Firebase (istantaneo). Ogni minuto, durante il servizio, questo script
   copia nel Foglio consegne, giri, turni e versamenti, calcola i tempi Google e gli avvisi.
   Report delle 14:30/22:30, pagella e km del mese continuano a leggere il Foglio come prima. */

const SYNC_ORARI = [[10, 30, 15, 30], [17, 0, 24, 0]]; // fasce in cui gira (ora italiana)

/** Da eseguire UNA volta dall'editor: aggiunge le colonne nuove e crea i trigger. */
function installaSync() {
  setup();
  aggiornaImpostazioni_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['syncFirebase', 'kmMensile'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncFirebase').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('kmMensile').timeBased().onMonthDay(1).atHour(10).nearMinute(15).inTimezone('Europe/Rome').create();
  PropertiesService.getScriptProperties().setProperty('sync_t', '0');
  syncFirebase(true);
  console.log('Sincronizzazione attiva ✓');
}

function inServizio_() {
  const d = new Date(), m = Number(Utilities.formatDate(d, 'Europe/Rome', 'H')) * 60 + Number(Utilities.formatDate(d, 'Europe/Rome', 'm'));
  return SYNC_ORARI.some(function (f) { return m >= f[0] * 60 + f[1] && m <= f[2] * 60 + f[3]; });
}

function syncFirebase(sempre) {
  if (sempre !== true && !inServizio_()) return;
  const lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return;
  try {
    const pr = PropertiesService.getScriptProperties(), dal = Number(pr.getProperty('sync_t') || 0) - 120000, ora = Date.now();
    const cons = fbCambiati_('consegne', dal), giri = fbCambiati_('giri', dal), turni = fbCambiati_('turni', dal), vers = fbCambiati_('versamenti', dal);
    if (!cons.length && !giri.length && !turni.length && !vers.length) { pr.setProperty('sync_t', String(ora)); return; }
    const imp = imp_();
    giri.forEach(function (g) { syncGiro_(g); });
    cons.forEach(function (c) { syncConsegna_(c, imp); });
    vers.forEach(function (v) { if (v.stato === 'ok') syncVersamento_(v); });
    analizzaConsegne_(imp);
    chiudiGiri_(giri, imp);
    turni.forEach(function (t) { syncTurno_(t, imp); });
    pr.setProperty('sync_t', String(ora));
  } catch (e) { console.log('Sync: ' + (e && e.stack || e)); }
  finally { lock.releaseLock(); }
}

/* ---------- lettura da Firebase ---------- */
function fbCambiati_(coll, dal) {
  const url = 'https://firestore.googleapis.com/v1/projects/' + FB_PROGETTO + '/databases/(default)/documents:runQuery';
  const q = { structuredQuery: { from: [{ collectionId: coll }], where: { fieldFilter: { field: { fieldPath: 'agg' }, op: 'GREATER_THAN', value: { integerValue: String(Math.max(0, Math.floor(dal))) } } } } };
  const r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, payload: JSON.stringify(q) });
  if (r.getResponseCode() >= 300) { console.log('Firebase ' + coll + ': ' + r.getContentText().slice(0, 300)); return []; }
  return JSON.parse(r.getContentText()).filter(function (x) { return x.document; }).map(function (x) {
    const o = {}; Object.keys(x.document.fields || {}).forEach(function (k) { o[k] = fbVal_(x.document.fields[k]); });
    o.id = o.id || x.document.name.split('/').pop(); return o;
  });
}
function fbVal_(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fbVal_);
  if ('mapValue' in v) { const o = {}; Object.keys(v.mapValue.fields || {}).forEach(function (k) { o[k] = fbVal_(v.mapValue.fields[k]); }); return o; }
  return null;
}
const dt_ = function (ms) { return ms ? new Date(Number(ms)) : ''; };
function riga_(scheda, id) { return righe_(scheda).filter(function (r) { return String(r.ID) === String(id); })[0]; }
function salvaRiga_(scheda, id, valori) {
  const r = riga_(scheda, id);
  if (r) scrivi_(scheda, r._riga, valori); else aggiungi_(scheda, Object.assign({ ID: id }, valori));
}

/* ---------- consegne ---------- */
function syncConsegna_(c, imp) {
  const storia = (c.storia || []).filter(function (s) { return s && s.da; });
  const cambi = storia.map(function (s) { return ora_(dt_(s.t)) + ' ' + s.da + ' → ' + s.a + ' (' + (s.tipo || '') + (s.chi ? ', ' + s.chi : '') + ')'; }).join(' · ');
  const v = {
    Giro: c.giro || '', Rider: c.stato === 'annullata' ? '' : (c.rider || ''), Indirizzo: indirizzo_(c.via + (c.paese ? ', ' + c.paese : ''), imp),
    Note: c.note || '', Pagamento: c.pagamento === 'SumUp' ? 'SumUp' : 'Contanti', Importo: c.importo || '',
    'Orario previsto': c.previsto ? "'" + c.previsto : '', Creata: dt_(c.creata), 'N. consigliato': c.n || '',
    Consegnata: c.stato === 'consegnata' ? dt_(c.consegnata) : '', 'N. fatto': c.nFatto || '',
    Cliente: c.cliente || '', Telefono: c.telefono ? "'" + c.telefono : '', 'N. ordine': c.numero || '', Cassiere: c.cassiere || '',
    Lat: c.lat || '', Lng: c.lng || '', Paese: c.paese || '', Stato: c.stato || '', Cambi: cambi, Assegnata: dt_(c.assegnata), 'Creata da': c.creataDa || ''
  };
  const r = riga_('Consegne', c.id);
  // cambio dopo la consegna (forzato) o scambio: va negli avvisi, una volta sola
  const extra = storia.filter(function (s) { return /forzata|scambio/.test(s.tipo || ''); })
    .map(function (s) { return (/forzata/.test(s.tipo) ? 'Cambio forzato dopo la consegna: ' : 'Passata tra rider: ') + s.da + ' → ' + s.a; });
  if (extra.length) {
    const prima = r ? String(r.Avvisi || '').split(' · ').filter(function (a) { return a && !/^(Cambio forzato|Passata tra rider)/.test(a); }) : [];
    v.Avvisi = prima.concat(extra).join(' · ');
  }
  if (r && r.Consegnata && v.Consegnata && String(new Date(r.Consegnata).getTime()) !== String(v.Consegnata.getTime())) v['Tratta reale (min)'] = '';
  salvaRiga_('Consegne', c.id, v);
}

/** tempi reali contro Google per le consegne fatte e non ancora analizzate (come prima faceva "Consegnato") */
function analizzaConsegne_(imp) {
  const tol = Number(imp.TOLLERANZA_MIN) || 3, sosta = Number(imp.SOSTA_CLIENTE_MIN) || 3, piz = imp.INDIRIZZO_PIZZERIA || PIZZERIA;
  const giri = {}; righe_('Giri').forEach(function (g) { giri[g.ID] = g; });
  const perGiro = {};
  righe_('Consegne').forEach(function (c) { if (c.Giro && c.Consegnata) (perGiro[c.Giro] = perGiro[c.Giro] || []).push(c); });
  Object.keys(perGiro).forEach(function (idg) {
    const g = giri[idg]; if (!g || !g.Partenza) return;
    const fatte = perGiro[idg].sort(function (a, b) { return new Date(a.Consegnata) - new Date(b.Consegnata); });
    fatte.forEach(function (c, i) {
      if (!vuoto_(c['Tratta reale (min)'])) return;
      const prec = i ? fatte[i - 1] : null;
      const reale = min_(prec ? prec.Consegnata : g.Partenza, c.Consegnata), goo = google_(prec ? prec.Indirizzo : piz, c.Indirizzo);
      const avvisi = String(c.Avvisi || '').split(' · ').filter(function (a) { return a && !/^(Lento|In ritardo)/.test(a); });
      let ritTratta = '';
      if (goo !== null) { ritTratta = reale - goo - (prec ? sosta : 0); if (ritTratta > tol) avvisi.push('Lento: ' + reale + ' min invece di ' + goo + ' (Google)'); }
      let ritOrario = '';
      const prev = String(c['Orario previsto'] instanceof Date ? ora_(c['Orario previsto']) : c['Orario previsto'] || '').replace(/^'/, '');
      if (/^\d{1,2}:\d{2}$/.test(prev)) {
        const d = new Date(c.Consegnata), p = prev.split(':');
        ritOrario = Number(Utilities.formatDate(d, 'Europe/Rome', 'H')) * 60 + Number(Utilities.formatDate(d, 'Europe/Rome', 'm')) - (Number(p[0]) * 60 + Number(p[1]));
        if (ritOrario > tol) avvisi.push('In ritardo di ' + ritOrario + ' min sull\'orario ' + prev);
      }
      scrivi_('Consegne', c._riga, { 'N. fatto': i + 1, 'Minuti dalla partenza': min_(g.Partenza, c.Consegnata), 'Tratta reale (min)': reale,
        'Tratta Google (min)': goo === null ? '' : goo, 'Ritardo tratta (min)': ritTratta, 'Ritardo su orario (min)': ritOrario, Avvisi: avvisi.join(' · ') });
    });
  });
}

/* ---------- giri ---------- */
function syncGiro_(g) {
  const r = riga_('Giri', g.id);
  const v = { Data: g.data, Servizio: g.servizio, Rider: g.rider, Partenza: dt_(g.partenza), Furgone: g.furgone ? 'SI' : '' };
  if (!r || r.Stato !== 'Chiuso') v.Stato = 'In consegna';
  salvaRiga_('Giri', g.id, v);
}
function chiudiGiri_(giri, imp) {
  const piz = imp.INDIRIZZO_PIZZERIA || PIZZERIA;
  giri.forEach(function (g) {
    const r = riga_('Giri', g.id); if (!r) return;
    // percorso consigliato da Google (una volta, alla partenza)
    if (vuoto_(r['Ordine consigliato'])) {
      const cons = righe_('Consegne').filter(function (c) { return c.Giro === g.id; });
      if (cons.length) {
        const ott = percorsoOttimo_(piz, cons.map(function (c) { return c.Indirizzo; }));
        if (ott) {
          ott.ordine.forEach(function (idx, pos) { scrivi_('Consegne', cons[idx]._riga, { 'Tratta Google pianificata (min)': ott.legs[pos] }); });
          scrivi_('Giri', r._riga, { 'Ordine consigliato': ott.ordine.map(function (i) { return String(cons[i].Indirizzo).split(',')[0]; }).join(' → '),
            'Google percorso ottimo (min)': ott.totale, Percorso: ott.linea });
        }
      }
    }
    if (g.rientro) { const r2 = riga_('Giri', g.id); if (r2.Stato !== 'Chiuso') chiudiGiro_(r2, imp, dt_(g.rientro)); }
  });
}

/* ---------- turni e km ---------- */
function syncTurno_(t, imp) {
  const avvisi = [];
  if (t.manualeInizio) avvisi.push('Km di inizio scritti a mano (senza foto)');
  if (t.correttoInizio) avvisi.push('Km di inizio corretti a mano (foto: ' + t.kmLettiInizio + ', scritti: ' + t.kmInizio + ')');
  if (t.manualeFine) avvisi.push('Km di fine scritti a mano (senza foto)');
  if (t.correttoFine) avvisi.push('Km di fine corretti a mano (foto: ' + t.kmLettiFine + ', scritti: ' + t.kmFine + ')');
  const v = { Data: t.data, Servizio: t.servizio, Rider: t.rider, Inizio: dt_(t.inizio), 'Km inizio': t.kmInizio || '', 'Km letti inizio': t.kmLettiInizio || '',
    Furgone: t.furgone ? 'SI' : '', 'Km a mano': t.manualeInizio || t.correttoInizio || t.manualeFine || t.correttoFine ? 'SI' : '' };
  if (t.fine) {
    Object.assign(v, { Fine: dt_(t.fine), 'Km fine': t.kmFine || '', 'Km letti fine': t.kmLettiFine || '', 'Km percorsi': t.km === undefined ? '' : t.km });
    const kmG = kmGoogleTurno_(t.rider, dt_(t.inizio), dt_(t.fine)), tolKm = Number(imp.TOLLERANZA_KM) || 3;
    v['Km Google giri'] = kmG === null ? '' : kmG;
    if (kmG !== null && t.km - kmG > tolKm) avvisi.push(t.km + ' km dichiarati contro ' + kmG + ' km dei giri (Google)');
  }
  if (t.furgone) avvisi.push('Furgone di Amo la Pizza: km nel contatore del furgone');
  v.Avvisi = avvisi.join(' · ');
  salvaRiga_('Turni', t.id, v);
}

function syncVersamento_(v) {
  salvaRiga_('Versamenti', v.id, { Data: v.data, Servizio: v.servizio, Rider: v.rider, Contanti: v.contanti || 0, SumUp: v.sumup || '', Consegne: v.consegne || '',
    'Confermato da': v.confermatoDa || '', Ora: dt_(v.confermato || v.ora) });
}

/** Il giorno 1: km del mese appena finito per ogni rider e per il furgone (dal Foglio, scheda Turni), via email. */
function kmMensile() {
  const ieri = new Date(Date.now() - 24 * 3600e3), mese = Utilities.formatDate(ieri, 'Europe/Rome', 'yyyy-MM');
  const nomeMese = Utilities.formatDate(ieri, 'Europe/Rome', 'MMMM yyyy'), km = {}; let furgone = 0;
  righe_('Turni').forEach(function (t) {
    if (!t.Inizio || Utilities.formatDate(new Date(t.Inizio), 'Europe/Rome', 'yyyy-MM') !== mese || vuoto_(t['Km percorsi'])) return;
    if (String(t.Furgone).toUpperCase() === 'SI') furgone += Number(t['Km percorsi']) || 0;
    else km[t.Rider] = (km[t.Rider] || 0) + (Number(t['Km percorsi']) || 0);
  });
  const imp = imp_(); if (!imp.EMAIL_REPORT) return;
  const righe = Object.keys(km).sort(function (a, b) { return km[b] - km[a]; })
    .map(function (n) { return '<tr><td style="padding:6px 10px"><b>' + n + '</b></td><td style="padding:6px 10px;text-align:right">' + Math.round(km[n]) + ' km</td></tr>'; }).join('');
  MailApp.sendEmail({ to: String(imp.EMAIL_REPORT), subject: '🛵 Km dei rider · ' + nomeMese,
    htmlBody: '<div style="font-family:-apple-system,Arial,sans-serif;max-width:520px"><div style="background:#CCD231;padding:14px 18px;border-radius:14px 14px 0 0">' +
      '<b style="color:#C6413C;font-size:20px">AMO LA PIZZA</b><div style="font-weight:700">Km del mese · ' + nomeMese + '</div></div>' +
      '<table style="border-collapse:collapse;width:100%;font-size:15px">' + (righe || '<tr><td>Nessun km registrato</td></tr>') +
      '<tr style="border-top:2px solid #333"><td style="padding:6px 10px"><b>🚐 Furgone di Amo la Pizza</b></td><td style="padding:6px 10px;text-align:right"><b>' + Math.round(furgone) + ' km</b></td></tr></table>' +
      '<p style="color:#888;font-size:12px">Dalle foto del cruscotto e dai km inseriti dai rider. I contatori nell\'app ripartono da zero.</p></div>' });
}

/** Allinea le impostazioni alle scelte di novembre 2026 (sosta 3 minuti, posizione corretta della pizzeria). */
function aggiornaImpostazioni_() {
  const nuove = { SOSTA_CLIENTE_MIN: 3, LAT_PIZZERIA: CENTRO[0], LNG_PIZZERIA: CENTRO[1] };
  righe_('Impostazioni').forEach(function (r) { if (nuove[r.Chiave] !== undefined) scrivi_('Impostazioni', r._riga, { Valore: nuove[r.Chiave] }); });
}
