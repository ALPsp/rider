/* ================= FIREBASE (database in tempo reale, progetto alp-hub-9cfb0) =================
   doPost chiama fbDopo_ dopo ogni chiamata riuscita: abilita il telefono che ha dato il PIN giusto,
   pubblica lo stato del rider e i dati della centrale. Il Foglio resta l'archivio di tutto. */
const FB_PROGETTO = 'alp-hub-9cfb0';
const FB_STATO = { riderStato: 1, riderConfermaKm: 1, riderAggiungi: 1, riderTogli: 1, riderParto: 1, riderConsegnato: 1, riderRientrato: 1, riderVersa: 1 };

function fbDopo_(e, out) {
  try {
    if (!out || !out.ok || !out.r || typeof out.r !== 'object') return;
    const q = JSON.parse(e.postData.contents), r = out.r;
    if (q.u && /^[A-Za-z0-9]{10,64}$/.test(q.u)) {
      if (q.fn === 'riderStato') fbScrivi_('accessi/' + q.u, { ruolo: 'rider', nome: r.nome });
      if (q.fn === 'hubDati') fbScrivi_('accessi/' + q.u, { ruolo: 'hub', nome: r.chi });
    }
    if (FB_STATO[q.fn] && r.nome) {
      fbScrivi_('stato/' + r.nome, { json: JSON.stringify(r) });
      if (q.fn !== 'riderStato') fbHub_();
    }
  } catch (err) { console.log('Firebase: ' + err); }
}

/** Ricalcola i dati della centrale e li pubblica (usa il primo PIN della scheda Accessi). */
function fbHub_() {
  const a = piccola_('Accessi')[0];
  if (a) fbScrivi_('hub/dati', { json: JSON.stringify(hubDati(a.PIN)) });
}

function fbScrivi_(percorso, campi) {
  const f = {};
  Object.keys(campi).forEach(function (k) { f[k] = { stringValue: String(campi[k]) }; });
  f.t = { timestampValue: new Date().toISOString() };
  const r = UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' + FB_PROGETTO + '/databases/(default)/documents/' + percorso, {
    method: 'patch', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, payload: JSON.stringify({ fields: f })
  });
  if (r.getResponseCode() >= 300) console.log('Firebase ' + percorso + ': ' + r.getContentText().slice(0, 300));
  return r.getResponseCode();
}

/** Da lanciare una volta dall'editor: chiede il permesso per il database e prova la scrittura. */
function provaFirebase() {
  console.log('Prova: ' + fbScrivi_('hub/prova', { ok: 'si' }));
  fbHub_();
}
