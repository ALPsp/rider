/**
 * APP RIDER – Amo la Pizza di Andrea
 * Foglio Google + Apps Script: gratis, i rider entrano con link + PIN (senza account).
 *
 * Primo avvio: esegui setup() e poi installaReport() dall'editor.
 *
 * Tempi: per ogni tratta (pizzeria → cliente, cliente → cliente, cliente → pizzeria)
 * il tempo reale viene confrontato con quello di Google Maps (servizio Maps di Apps Script, gratuito).
 * Avviso se reale > Google + sosta al cliente + tolleranza.
 */

const FOGLIO_ID = '1y_QIAARjBJAY_qAK6heMKlGDiiowUwjcI2huT8jM8W8';
const PIZZERIA = 'Via Francesco Baracca 2, 24060 San Paolo d\'Argon BG';
const CENTRO = [45.6860723, 9.7990781];

const SCHEDE = {
  'Rider': ['Nome', 'PIN', 'Attivo'],
  'Accessi': ['Ruolo', 'Nome', 'PIN'],
  'Giri': ['ID', 'Data', 'Servizio', 'Rider', 'Partenza', 'Rientro', 'Minuti totali', 'Stato',
           'Ordine consigliato', 'Google percorso ottimo (min)', 'Google percorso fatto (min)',
           'Rientro reale (min)', 'Rientro Google (min)', 'Km Google', 'Avvisi', 'Percorso', 'Furgone'],
  'Consegne': ['ID', 'Giro', 'Rider', 'Indirizzo', 'Note', 'Pagamento', 'Importo', 'Orario previsto',
               'Creata', 'N. consigliato', 'Tratta Google pianificata (min)', 'Consegnata', 'N. fatto',
               'Minuti dalla partenza', 'Tratta reale (min)', 'Tratta Google (min)', 'Ritardo tratta (min)',
               'Ritardo su orario (min)', 'Avvisi', 'Cliente', 'Telefono', 'N. ordine', 'Cassiere', 'Foto ordine', 'Lat', 'Lng',
               'Paese', 'Stato', 'Cambi', 'Assegnata', 'Creata da'],
  'Turni': ['ID', 'Data', 'Servizio', 'Rider', 'Inizio', 'Km inizio', 'Km letti inizio', 'Foto inizio',
            'Fine', 'Km fine', 'Km letti fine', 'Foto fine', 'Km percorsi', 'Km Google giri', 'Avvisi', 'Furgone', 'Km a mano'],
  'Premiazioni': ['Mese', 'Posizione', 'Rider', 'Punteggio', 'Consegne', 'Puntualità %', 'Ritardo medio (min)',
                  'Avvisi', 'Km', 'Creato', 'Voto', 'Percorso %', 'Tempi %', 'Rientri %'],
  'Posizioni': ['Rider', 'Lat', 'Lng', 'Precisione (m)', 'Ora'],
  'Report': ['Data', 'Servizio', 'Creato', 'Consegne', 'Avvisi', 'Testo'],
  'Versamenti': ['ID', 'Data', 'Servizio', 'Rider', 'Contanti', 'SumUp', 'Consegne', 'Confermato da', 'Ora'],
  'Impostazioni': ['Chiave', 'Valore', 'Spiegazione']
};

const IMPOSTAZIONI = [
  ['GPS_ATTIVO', 'SI', 'Posizione solo durante il giro e solo con l\'app aperta (accordo firmato dai rider)'],
  ['GPS_OGNI_SECONDI', 15, 'Ogni quanto il telefono manda la posizione durante il giro'],
  ['INDIRIZZO_PIZZERIA', PIZZERIA, 'Punto di partenza e rientro'],
  ['LAT_PIZZERIA', CENTRO[0], 'Centro della mappa'],
  ['LNG_PIZZERIA', CENTRO[1], 'Centro della mappa'],
  ['TOLLERANZA_MIN', 3, 'Minuti oltre Google Maps prima di segnalare un ritardo'],
  ['SOSTA_CLIENTE_MIN', 2, 'Minuti concessi per la consegna alla porta'],
  ['EMAIL_REPORT', 'amolapizzadiandrea@gmail.com', 'Chi riceve il report (più email separate da virgola)'],
  ['PAESE_PREDEFINITO', 'San Paolo d\'Argon BG', 'Aggiunto all\'indirizzo se il rider non scrive il paese'],
  ['TOLLERANZA_KM', 3, 'Km in più rispetto ai giri (Google) prima di segnalare nel report'],
  ['PREMIO_MIN_CONSEGNE', 10, 'Consegne minime nel mese per entrare nella premiazione'],
  ['CARTELLA_FOTO_ID', '', 'Cartella Drive delle foto cruscotto (creata da sola)']
];

/* ================= SETUP ================= */

function setup() {
  const ss = ss_();
  Object.keys(SCHEDE).forEach(function (nome) {
    let sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
    if (sh.getLastRow() === 0) {
      sh.appendRow(SCHEDE[nome]);
      sh.getRange(1, 1, 1, SCHEDE[nome].length).setFontWeight('bold').setBackground('#eef0b3').setWrap(true);
      sh.setFrozenRows(1);
    } else {
      const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      SCHEDE[nome].forEach(function (k) {
        if (h.indexOf(k) < 0) { sh.getRange(1, sh.getLastColumn() + 1).setValue(k).setFontWeight('bold').setBackground('#eef0b3'); }
      });
    }
  });
  const rider = ss.getSheetByName('Rider');
  if (rider.getLastRow() === 1)
    ['Claudio', 'Camozzi', 'Simone', 'Duca', 'Filippo', 'Daniel'].forEach(function (n) { rider.appendRow([n, pin_(), 'SI']); });
  const acc = ss.getSheetByName('Accessi');
  if (acc.getLastRow() === 1)
    [['Titolare', 'Andrea'], ['Responsabile rider', 'Marco Anselmi'], ['Sostituto', 'Mattia Ghilardi'], ['Cassa', 'Cassa']]
      .forEach(function (r) { acc.appendRow([r[0], r[1], pin_()]); });
  Object.keys(LETTE_).forEach(function (k) { delete LETTE_[k]; });
  const imp = ss.getSheetByName('Impostazioni');
  const presenti = righe_('Impostazioni').map(function (r) { return r.Chiave; });
  IMPOSTAZIONI.forEach(function (r) { if (presenti.indexOf(r[0]) < 0) imp.appendRow(r); });
  ['Impostazioni', 'Rider', 'Accessi'].forEach(function (n) { CacheService.getScriptCache().remove('t_' + n); });
  ['Foglio1', 'Sheet1'].forEach(function (n) { const s = ss.getSheetByName(n); if (s && s.getLastRow() === 0) ss.deleteSheet(s); });
}

/** Crea i report automatici alle 14:30 e alle 22:30 (ora italiana). Eseguire una volta. */
function installaReport() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['reportPranzo', 'reportCena', 'premiazioneMensile'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('premiazioneMensile').timeBased().onMonthDay(1).atHour(10).inTimezone('Europe/Rome').create();
  ScriptApp.newTrigger('reportPranzo').timeBased().everyDays(1).atHour(14).nearMinute(30).inTimezone('Europe/Rome').create();
  ScriptApp.newTrigger('reportCena').timeBased().everyDays(1).atHour(22).nearMinute(30).inTimezone('Europe/Rome').create();
}

function pin_() { return String(Math.floor(1000 + Math.random() * 9000)); }

/* ================= PAGINE ================= */

function doGet(e) {
  const hub = e && e.parameter && e.parameter.p === 'hub';
  return HtmlService.createTemplateFromFile(hub ? 'Hub' : 'Rider').evaluate()
    .setTitle(hub ? 'Dashboard Rider · Amo la Pizza' : 'Rider · Amo la Pizza')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ================= ACCESSO DALL'APP DA HOME ================= */
/** Le pagine pubblicate fuori da Google chiamano qui: {fn, a}. Solo le funzioni in elenco, tutte protette da PIN. */
function api_() {
  return { riderStato: riderStato, riderFotoCruscotto: riderFotoCruscotto, riderConfermaKm: riderConfermaKm, riderScansiona: riderScansiona,
    riderAggiungi: riderAggiungi, riderTogli: riderTogli, riderParto: riderParto, riderConsegnato: riderConsegnato, riderRientrato: riderRientrato,
    riderPosizione: riderPosizione, riderIndicazioni: riderIndicazioni, riderVersa: riderVersa, hubDati: hubDati };
}
function doPost(e) {
  let out;
  try {
    const q = JSON.parse(e.postData.contents);
    const f = api_()[q.fn];
    if (typeof f !== 'function') throw new Error('Funzione non consentita');
    out = { ok: true, r: f.apply(null, q.a || []) };
  } catch (err) { out = { ok: false, e: String(err && err.message || err) }; }
  fbDopo_(e, out);
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ================= UTILITÀ ================= */

let SS_ = null;
function ss_() { return SS_ || (SS_ = SpreadsheetApp.openById(FOGLIO_ID)); }
function sh_(n) { return ss_().getSheetByName(n); }
// Ogni scheda si legge una volta sola per richiesta; dopo una scrittura si rilegge.
const LETTE_ = {};
function tabella_(n) {
  if (!LETTE_[n]) { const v = sh_(n).getDataRange().getValues(); LETTE_[n] = { h: v.shift() || [], v: v }; }
  return LETTE_[n];
}
function righe_(n) {
  const t = tabella_(n);
  return t.v.map(function (r, i) { const o = { _riga: i + 2 }; t.h.forEach(function (k, j) { o[k] = r[j]; }); return o; });
}
function scrivi_(n, riga, valori) { // valori: {Intestazione: valore} — una sola scrittura per riga
  const sh = sh_(n), h = tabella_(n).h, w = h.length;
  const rg = sh.getRange(riga, 1, 1, w), r = rg.getValues()[0];
  Object.keys(valori).forEach(function (k) { const c = h.indexOf(k); if (c >= 0) r[c] = valori[k]; });
  rg.setValues([r]);
  delete LETTE_[n];
  if (n === 'Impostazioni' || n === 'Rider' || n === 'Accessi') CacheService.getScriptCache().remove('t_' + n);
}
function aggiungi_(n, valori) {
  const h = tabella_(n).h;
  sh_(n).appendRow(h.map(function (k) { return valori[k] === undefined ? '' : valori[k]; }));
  delete LETTE_[n];
}
/** Impostazioni, rider e accessi cambiano di rado: restano in memoria 2 minuti. */
function piccola_(n) {
  const c = CacheService.getScriptCache(), k = 't_' + n, x = c.get(k);
  if (x) return JSON.parse(x);
  const r = righe_(n); c.put(k, JSON.stringify(r), 120);
  return r;
}
function imp_() { const o = {}; piccola_('Impostazioni').forEach(function (r) { o[r.Chiave] = r.Valore; }); return o; }
function data_(d) { return Utilities.formatDate(d || new Date(), 'Europe/Rome', 'yyyy-MM-dd'); }
function ora_(d) { return d ? Utilities.formatDate(new Date(d), 'Europe/Rome', 'HH:mm') : ''; }
function servizio_(d) { return Number(Utilities.formatDate(d || new Date(), 'Europe/Rome', 'H')) < 17 ? 'Pranzo' : 'Cena'; }
function iso_(d) { return d instanceof Date ? d.toISOString() : (d || ''); }
function min_(a, b) { return Math.round((new Date(b) - new Date(a)) / 60000); }
function id_() { return Utilities.getUuid().slice(0, 8); }
function vuoto_(v) { return v === '' || v === null || v === undefined; }

function indirizzo_(s, imp) {
  s = String(s || '').trim();
  return /\b(BG|bergamo|\d{5})\b/i.test(s) || s.indexOf(',') > 0 && /[a-z]{4,}\s*$/i.test(s.split(',').pop()) ? s
       : s + ', ' + (imp.PAESE_PREDEFINITO || 'San Paolo d\'Argon BG');
}

/** Minuti di guida secondo Google Maps tra due punti (null se Google non risponde). */
function google_(da, a) { const t = tratta_(da, a); return t ? t.min : null; }
function tratta_(da, a) {
  try {
    const l = Maps.newDirectionFinder().setOrigin(da).setDestination(a)
      .setMode(Maps.DirectionFinder.Mode.DRIVING).setLanguage('it').getDirections().routes[0].legs[0];
    return { min: Math.round(l.duration.value / 60), km: l.distance.value / 1000 };
  } catch (e) { return null; }
}

/** Percorso ottimo pizzeria → tutte le consegne → pizzeria. */
function percorsoOttimo_(pizzeria, indirizzi) {
  try {
    const f = Maps.newDirectionFinder().setOrigin(pizzeria).setDestination(pizzeria)
      .setMode(Maps.DirectionFinder.Mode.DRIVING).setLanguage('it').setOptimizeWaypoints(true);
    indirizzi.forEach(function (a) { f.addWaypoint(a); });
    const r = f.getDirections().routes[0];
    const legs = r.legs.map(function (l) { return Math.round(l.duration.value / 60); });
    return { ordine: r.waypoint_order, legs: legs, totale: legs.reduce(function (a, b) { return a + b; }, 0),
             punti: r.legs.map(function (l) { return [l.end_location.lat, l.end_location.lng]; }),
             linea: r.overview_polyline ? r.overview_polyline.points : '' };
  } catch (e) { return null; }
}

function rider_(pin) {
  const r = piccola_('Rider').filter(function (x) { return String(x.PIN) === String(pin) && String(x.Attivo).toUpperCase() !== 'NO'; })[0];
  if (!r) throw new Error('PIN non valido');
  return r.Nome;
}
function hub_(pin) {
  const r = piccola_('Accessi').filter(function (x) { return String(x.PIN) === String(pin); })[0];
  if (!r) throw new Error('PIN non valido');
  return r;
}
function giroAperto_(nome) { return righe_('Giri').filter(function (g) { return g.Rider === nome && g.Stato !== 'Chiuso'; }).pop(); }
function consegneGiro_(idGiro) {
  return righe_('Consegne').filter(function (c) { return c.Giro === idGiro; })
    .sort(function (a, b) { return (Number(a['N. consigliato']) || 99) - (Number(b['N. consigliato']) || 99); });
}

/* ================= API RIDER ================= */

function riderStato(pin) {
  const nome = rider_(pin), imp = imp_(), g = giroAperto_(nome);
  return {
    nome: nome,
    giro: g ? { id: g.ID, partenza: iso_(g.Partenza), stato: g.Stato, percorso: g.Percorso || '' } : null,
    casa: [Number(imp.LAT_PIZZERIA) || CENTRO[0], Number(imp.LNG_PIZZERIA) || CENTRO[1]],
    consegne: g ? consegneGiro_(g.ID).map(pulisci_) : [],
    pizzeria: imp.INDIRIZZO_PIZZERIA || PIZZERIA,
    gps: String(imp.GPS_ATTIVO).toUpperCase() === 'SI',
    gpsOgni: Number(imp.GPS_OGNI_SECONDI) || 30,
    turno: turnoInfo_(turnoAperto_(nome)),
    portafoglio: portafoglio_(nome),
    premio: ultimoPremio_()
  };
}

/* ---------- turno e foto cruscotto ---------- */

function turnoAperto_(nome) {
  const oggi = data_();
  return righe_('Turni').filter(function (t) {
    return t.Rider === nome && vuoto_(t.Fine) && (t.Data instanceof Date ? data_(t.Data) : String(t.Data)) === oggi;
  }).pop();
}
function turnoInfo_(t) { return t ? { inizio: iso_(t.Inizio), km: t['Km inizio'] } : null; }

function cartellaFoto_() {
  const imp = imp_();
  if (imp.CARTELLA_FOTO_ID) { try { return DriveApp.getFolderById(imp.CARTELLA_FOTO_ID); } catch (e) {} }
  const f = DriveApp.createFolder('APP RIDER – Foto cruscotto');
  const r = righe_('Impostazioni').filter(function (x) { return x.Chiave === 'CARTELLA_FOTO_ID'; })[0];
  if (r) scrivi_('Impostazioni', r._riga, { Valore: f.getId() });
  return f;
}

/** Salva la foto, la legge con l'OCR di Google Drive e propone i km. */
function riderFotoCruscotto(pin, tipo, dataUrl) {
  const nome = rider_(pin);
  const b64 = String(dataUrl).split(',')[1];
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg',
    nome + ' ' + Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyy-MM-dd HH.mm') + ' ' + tipo + '.jpg');
  const foto = cartellaFoto_().createFile(blob);
  let testo = '';
  try {
    const doc = Drive.Files.create({ name: 'ocr-temp', mimeType: MimeType.GOOGLE_DOCS }, blob, { ocrLanguage: 'it' });
    testo = DocumentApp.openById(doc.id).getBody().getText();
    DriveApp.getFileById(doc.id).setTrashed(true);
  } catch (e) { testo = ''; }
  // numeri da 3 a 7 cifre (ignora i decimali del contachilometri parziale)
  const numeri = (testo.replace(/(\d)[.\s'](\d{3})\b/g, '$1$2').match(/\b\d{3,7}\b/g) || []).map(Number);
  const ultimo = ultimiKm_(nome);
  let proposta = null;
  if (numeri.length) {
    const validi = ultimo ? numeri.filter(function (n) { return n >= ultimo && n - ultimo < 2000; }) : [];
    proposta = validi.length ? validi.sort(function (a, b) { return (a - ultimo) - (b - ultimo); })[0]
                             : numeri.sort(function (a, b) { return b - a; })[0];
  }
  return { fotoId: foto.getId(), proposta: proposta, ultimo: ultimo };
}

function ultimiKm_(nome) {
  const t = righe_('Turni').filter(function (x) { return x.Rider === nome; }).pop();
  if (!t) return null;
  return Number(t['Km fine']) || Number(t['Km inizio']) || null;
}

function riderConfermaKm(pin, tipo, km, letti, fotoId) {
  const nome = rider_(pin);
  km = Number(String(km).replace(/[.\s]/g, '').replace(',', '.'));
  if (!km) throw new Error('Scrivi i km del cruscotto');
  const link = fotoId ? 'https://drive.google.com/file/d/' + fotoId + '/view' : '';
  if (tipo === 'inizio') {
    if (turnoAperto_(nome)) return riderStato(pin);
    aggiungi_('Turni', { ID: id_(), Data: data_(), Servizio: servizio_(), Rider: nome, Inizio: new Date(),
      'Km inizio': km, 'Km letti inizio': letti || '', 'Foto inizio': link });
    return riderStato(pin);
  }
  const t = turnoAperto_(nome);
  if (!t) throw new Error('Nessun servizio aperto');
  if (giroAperto_(nome)) throw new Error('Chiudi prima il giro in corso');
  if (km < Number(t['Km inizio'])) throw new Error('I km di fine sono meno di quelli di inizio (' + t['Km inizio'] + ')');
  const percorsi = Math.round((km - Number(t['Km inizio'])) * 10) / 10;
  const kmG = kmGoogleTurno_(nome, t.Inizio, new Date());
  const tolKm = Number(imp_().TOLLERANZA_KM) || 3;
  const avvisi = [];
  if (kmG !== null && percorsi - kmG > tolKm) avvisi.push(percorsi + ' km dichiarati contro ' + kmG + ' km dei giri (Google)');
  if (letti && Math.abs(Number(letti) - km) > 1) avvisi.push('Km corretti a mano (foto: ' + letti + ', scritti: ' + km + ')');
  scrivi_('Turni', t._riga, { Fine: new Date(), 'Km fine': km, 'Km letti fine': letti || '', 'Foto fine': link,
    'Km percorsi': percorsi, 'Km Google giri': kmG === null ? '' : kmG, Avvisi: avvisi.join(' · ') });
  const s = riderStato(pin);
  s.chiuso = { km: percorsi, kmGoogle: kmG };
  return s;
}

function kmGoogleTurno_(nome, da, a) {
  let km = 0, trovati = false;
  righe_('Giri').forEach(function (g) {
    if (g.Rider === nome && g.Partenza && new Date(g.Partenza) >= new Date(da) && new Date(g.Partenza) <= new Date(a) && !vuoto_(g['Km Google'])) {
      km += Number(g['Km Google']); trovati = true;
    }
  });
  return trovati ? Math.round(km * 10) / 10 : null;
}

function ultimoPremio_() {
  const p = righe_('Premiazioni').filter(function (r) { return Number(r.Posizione) === 1; }).pop();
  return p ? { mese: String(p.Mese), rider: p.Rider } : null;
}

function pulisci_(c) {
  return { id: c.ID, indirizzo: c.Indirizzo, note: c.Note, pagamento: c.Pagamento, importo: c.Importo,
           previsto: c['Orario previsto'] instanceof Date ? ora_(c['Orario previsto']) : String(c['Orario previsto'] || '').replace(/^'/, ''),
           eta: c['Tratta Google pianificata (min)'], consegnata: iso_(c.Consegnata),
           cliente: c.Cliente || '', telefono: String(c.Telefono || '').replace(/^'/, ''), numero: c['N. ordine'] || '',
           cassiere: c.Cassiere || '', lat: Number(c.Lat) || null, lng: Number(c.Lng) || null };
}

function riderAggiungi(pin, c) {
  const nome = rider_(pin), imp = imp_();
  if (!c || !String(c.indirizzo || '').trim()) throw new Error('Manca l\'indirizzo');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    let g = giroAperto_(nome);
    if (!turnoAperto_(nome)) throw new Error('Prima inizia il servizio con la foto del cruscotto');
    if (g && g.Partenza) throw new Error('Sei già partito: chiudi il giro prima di aggiungere consegne');
    if (!g) { const idg = id_(); aggiungi_('Giri', { ID: idg, Data: data_(), Servizio: servizio_(), Rider: nome, Stato: 'In preparazione' }); g = { ID: idg }; }
    aggiungi_('Consegne', {
      ID: id_(), Giro: g.ID, Rider: nome, Indirizzo: indirizzo_(c.indirizzo, imp), Note: String(c.note || '').trim(),
      Pagamento: /sumup|pos|cart/i.test(c.pagamento || '') ? 'SumUp' : 'Contanti',
      Cliente: String(c.cliente || '').trim(), Telefono: c.telefono ? "'" + String(c.telefono).replace(/\s/g, '') : '',
      'N. ordine': c.numero || '', Cassiere: String(c.cassiere || '').trim(),
      'Foto ordine': c.fotoId ? 'https://drive.google.com/file/d/' + c.fotoId + '/view' : '',
      Importo: Number(String(c.importo || 0).replace(',', '.')) || '',
      'Orario previsto': c.previsto ? "'" + c.previsto : '', Creata: new Date()
    });
  } finally { lock.releaseLock(); }
  return riderStato(pin);
}

function riderTogli(pin, idc) {
  const nome = rider_(pin);
  const c = righe_('Consegne').filter(function (x) { return x.ID === idc && x.Rider === nome && !x.Consegnata; })[0];
  if (c) { sh_('Consegne').deleteRow(c._riga); delete LETTE_.Consegne; }
  const g = giroAperto_(nome);
  if (g && !g.Partenza && !consegneGiro_(g.ID).length) { sh_('Giri').deleteRow(g._riga); delete LETTE_.Giri; }
  return riderStato(pin);
}

/** Partenza: Google calcola l'ordine migliore e i tempi di ogni tratta. */
function riderParto(pin) {
  const nome = rider_(pin), imp = imp_(), g = giroAperto_(nome);
  if (!g) throw new Error('Aggiungi prima almeno una consegna');
  if (g.Partenza) return riderStato(pin);
  const cons = consegneGiro_(g.ID);
  const piz = imp.INDIRIZZO_PIZZERIA || PIZZERIA;
  const ott = percorsoOttimo_(piz, cons.map(function (c) { return c.Indirizzo; }));
  if (ott) {
    ott.ordine.forEach(function (idx, pos) {
      scrivi_('Consegne', cons[idx]._riga, { 'N. consigliato': pos + 1, 'Tratta Google pianificata (min)': ott.legs[pos],
        Lat: ott.punti[pos][0], Lng: ott.punti[pos][1] });
    });
  }
  scrivi_('Giri', g._riga, {
    Partenza: new Date(), Stato: 'In consegna',
    'Ordine consigliato': ott ? ott.ordine.map(function (i) { return cons[i].Indirizzo.split(',')[0]; }).join(' → ') : '',
    'Google percorso ottimo (min)': ott ? ott.totale : '',
    Percorso: ott ? ott.linea : ''
  });
  return riderStato(pin);
}

function riderConsegnato(pin, idc) {
  const nome = rider_(pin), imp = imp_(), g = giroAperto_(nome);
  if (!g || !g.Partenza) throw new Error('Premi prima "Parto"');
  const tutte = consegneGiro_(g.ID);
  const c = tutte.filter(function (x) { return x.ID === idc; })[0];
  if (!c || c.Consegnata) return riderStato(pin);
  const fatte = tutte.filter(function (x) { return x.Consegnata; })
    .sort(function (a, b) { return new Date(a.Consegnata) - new Date(b.Consegnata); });
  const prec = fatte.length ? fatte[fatte.length - 1] : null;
  const ora = new Date();
  const da = prec ? prec.Indirizzo : (imp.INDIRIZZO_PIZZERIA || PIZZERIA);
  const reale = min_(prec ? prec.Consegnata : g.Partenza, ora);
  const goo = google_(da, c.Indirizzo);
  const tol = Number(imp.TOLLERANZA_MIN) || 3, sosta = Number(imp.SOSTA_CLIENTE_MIN) || 2;
  const avvisi = [];
  let ritTratta = '';
  if (goo !== null) {
    ritTratta = reale - goo - (prec ? sosta : 0);
    if (ritTratta > tol) avvisi.push('Lento: ' + reale + ' min invece di ' + goo + ' (Google)');
  }
  let ritOrario = '';
  const prev = String(c['Orario previsto'] instanceof Date ? ora_(c['Orario previsto']) : c['Orario previsto'] || '').replace(/^'/, '');
  if (/^\d{1,2}:\d{2}$/.test(prev)) {
    const p = prev.split(':'), atteso = new Date(ora);
    const hNow = Number(Utilities.formatDate(ora, 'Europe/Rome', 'H')), mNow = Number(Utilities.formatDate(ora, 'Europe/Rome', 'm'));
    ritOrario = (hNow * 60 + mNow) - (Number(p[0]) * 60 + Number(p[1]));
    if (ritOrario > tol) avvisi.push('In ritardo di ' + ritOrario + ' min sull\'orario ' + prev);
  }
  scrivi_('Consegne', c._riga, {
    Consegnata: ora, 'N. fatto': fatte.length + 1, 'Minuti dalla partenza': min_(g.Partenza, ora),
    'Tratta reale (min)': reale, 'Tratta Google (min)': goo === null ? '' : goo,
    'Ritardo tratta (min)': ritTratta, 'Ritardo su orario (min)': ritOrario, Avvisi: avvisi.join(' · ')
  });
  if (tutte.length === fatte.length + 1) scrivi_('Giri', g._riga, { Stato: 'Rientro' });
  return riderStato(pin);
}

function riderRientrato(pin) {
  const nome = rider_(pin), imp = imp_(), g = giroAperto_(nome);
  if (g) chiudiGiro_(g, imp, new Date());
  return riderStato(pin);
}

function chiudiGiro_(g, imp, ora, dimenticato) {
  const tutte = consegneGiro_(g.ID);
  const fatte = tutte.filter(function (x) { return x.Consegnata; })
    .sort(function (a, b) { return new Date(a.Consegnata) - new Date(b.Consegnata); });
  const piz = imp.INDIRIZZO_PIZZERIA || PIZZERIA, tol = Number(imp.TOLLERANZA_MIN) || 3;
  const avvisi = [];
  const val = { Rientro: dimenticato ? '' : ora, Stato: 'Chiuso' };
  if (g.Partenza && !dimenticato) val['Minuti totali'] = min_(g.Partenza, ora);
  if (fatte.length && !dimenticato) {
    const ult = fatte[fatte.length - 1];
    const reale = min_(ult.Consegnata, ora), goo = google_(ult.Indirizzo, piz);
    val['Rientro reale (min)'] = reale; val['Rientro Google (min)'] = goo === null ? '' : goo;
    if (goo !== null && reale - goo > tol) avvisi.push('Rientro lungo: ' + reale + ' min invece di ' + goo);
  }
  // percorso fatto (minuti e km Google) vs percorso ottimo
  if (fatte.length) {
    const tappe = [piz].concat(fatte.map(function (c) { return c.Indirizzo; })).concat([piz]);
    let tot = 0, km = 0, ok = true;
    for (let i = 0; i < tappe.length - 1; i++) { const t = tratta_(tappe[i], tappe[i + 1]); if (!t) { ok = false; break; } tot += t.min; km += t.km; }
    if (ok) {
      val['Google percorso fatto (min)'] = tot;
      val['Km Google'] = Math.round(km * 10) / 10;
      if (fatte.length > 1 && !vuoto_(g['Google percorso ottimo (min)']) && tot - Number(g['Google percorso ottimo (min)']) > tol)
        avvisi.push('Percorso non ottimizzato: +' + (tot - Number(g['Google percorso ottimo (min)'])) + ' min (consigliato: ' + g['Ordine consigliato'] + ')');
    }
  }
  if (dimenticato) avvisi.push('Giro non chiuso dal rider');
  if (fatte.length < tutte.length) avvisi.push((tutte.length - fatte.length) + ' consegne non segnate come consegnate');
  val.Avvisi = avvisi.join(' · ');
  scrivi_('Giri', g._riga, val);
}

function riderPosizione(pin, lat, lng, acc) {
  const nome = rider_(pin);
  if (String(imp_().GPS_ATTIVO).toUpperCase() !== 'SI') return false;
  const g = giroAperto_(nome);
  if (!g || !g.Partenza) return false; // solo durante il giro
  const pr = PropertiesService.getScriptProperties(), ora = new Date();
  pr.setProperty('pos_' + nome, JSON.stringify({ lat: lat, lng: lng, acc: Math.round(acc || 0), ora: ora.toISOString(), giro: g.ID }));
  const ult = Number(pr.getProperty('log_' + nome) || 0);
  if (ora.getTime() - ult > 60000) {
    aggiungi_('Posizioni', { Rider: nome, Lat: lat, Lng: lng, 'Precisione (m)': Math.round(acc || 0), Ora: ora });
    pr.setProperty('log_' + nome, String(ora.getTime()));
  }
  return true;
}

/* ================= SCANSIONE COMANDA + SCONTRINO ================= */

/** Una foto con comanda e scontrino affiancati: salva la foto, la legge con l'OCR di Drive e compila la consegna. */
function riderScansiona(pin, dataUrl) {
  const nome = rider_(pin);
  const blob = Utilities.newBlob(Utilities.base64Decode(String(dataUrl).split(',')[1]), 'image/jpeg',
    nome + ' ' + Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyy-MM-dd HH.mm.ss') + ' ordine.jpg');
  const foto = cartellaFoto_().createFile(blob);
  let testo = '';
  try {
    const doc = Drive.Files.create({ name: 'ocr-ordine', mimeType: MimeType.GOOGLE_DOCS }, blob, { ocrLanguage: 'it' });
    testo = DocumentApp.openById(doc.id).getBody().getText();
    DriveApp.getFileById(doc.id).setTrashed(true);
  } catch (e) { testo = ''; }
  const o = leggiOrdine_(testo);
  o.fotoId = foto.getId();
  return o;
}

/** Estrae i dati da testo OCR di comanda e/o scontrino di Amo la Pizza. */
function leggiOrdine_(testo) {
  const t = String(testo || '').replace(/\r/g, '');
  const T = t.toUpperCase();
  const righe = t.split('\n').map(function (r) { return r.trim(); }).filter(String);
  const R = righe.map(function (r) { return r.toUpperCase(); });
  const o = { letto: !!t.trim(), tipo: '', numero: '', previsto: '', cliente: '', indirizzo: '', paese: '', telefono: '',
              importo: '', pagamento: '', cassiere: '', avvisi: [] };
  if (/DOMICILIO/.test(T)) o.tipo = 'DOMICILIO'; else if (/ASPORTO\s*N/.test(T)) o.tipo = 'ASPORTO';
  let m = T.match(/(?:DOMICILIO|ASPORTO)\s*N\s*[:.]?\s*(\d{1,4})/) || T.match(/NUMERO\s*ORDINE\s*[:.]?\s*0*(\d{1,4})/);
  if (m) o.numero = m[1];
  m = T.match(/PER\s*L\.?\s*E\.?\s*[:.]?\s*(\d{1,2})\s*[:.]\s*(\d{2})/);
  if (m) o.previsto = ('0' + m[1]).slice(-2) + ':' + m[2];
  m = T.match(/TEL\s*[:.]?\s*(\+?\s*\d[\d ]{7,15}\d)/);
  if (m) o.telefono = m[1].replace(/\s/g, '').replace(/^\+39/, '');
  // indirizzo: prima riga che inizia come una via (non quella della pizzeria)
  const via = /^(VIA|V\.|VIALE|PIAZZA|P\.?ZZA|PIAZZALE|LARGO|CORSO|C\.SO|STRADA|VICOLO|LOC\.?|LOCALIT)/;
  let iv = -1;
  for (let i = 0; i < R.length; i++) if (via.test(R[i]) && !/BARACCA/.test(R[i])) { iv = i; break; }
  if (iv >= 0) {
    let riga = righe[iv].replace(/\s+/g, ' '), pr = R[iv + 1] || '';
    // via e paese sulla stessa riga: "VIA DEI CILIEGI 17 SAN PAOLO D ARGON - SAN PAOLO"
    const vm = riga.match(/^(.*?\d+\s*[A-Za-z]?)\s+([A-Za-z].{2,})$/);
    if (vm) { riga = vm[1]; pr = vm[2].toUpperCase(); }
    o.indirizzo = cap_(riga);
    if (pr && !/^(TEL|OPERATORE|PONY|PIZ|TOTALE)/.test(pr)) o.paese = paese_(pr.split(' - ')[0]);
    // nome cliente: fino a due righe sopra l'indirizzo, saltando date e intestazioni
    for (let k = iv - 1; k >= Math.max(0, iv - 3); k--) {
      const r = R[k];
      if (/^[\d\s.:\/-]+$/.test(r)) continue;
      if (/(PER\s*L|DOMICILIO|ASPORTO|ORDINE|----|DESCRIZIONE|CONSEGNA|COMANDE)/.test(r)) break;
      if (/[A-Z]{3}/.test(r)) { o.cliente = cap_(righe[k]); break; }
    }
  }
  if (!o.paese && /SAN PAOLO/.test(T)) o.paese = 'San Paolo d\'Argon';
  // totale: l'importo che compare più spesso dopo "TOTALE COMPLESSIVO" (l'OCR spesso lo stacca dall'etichetta)
  const it = T.search(/TOTALE\s*COMPLESSIVO/);
  if (it >= 0) {
    const conta = {};
    (T.slice(it).match(/\d{1,4}[.,]\d{2}(?!\s*%)/g) || []).slice(0, 8).forEach(function (v) { v = v.replace(',', '.'); conta[v] = (conta[v] || 0) + 1; });
    const best = Object.keys(conta).sort(function (a, b) { return conta[b] - conta[a] || Number(b) - Number(a); })[0];
    if (best) o.importo = best;
  }
  if (!o.importo) {
    m = T.match(/PONY\s*CONTANT\w*\s*(\d{1,4}[.,]\d{2})/) || T.match(/PONY\s*(?:POS|CART\w*|ELETTR\w*)\s*(\d{1,4}[.,]\d{2})/);
    if (m) o.importo = m[1].replace(',', '.');
  }
  if (/PAGAMENTO\s*CONTANT|PONY\s*CONTANT/.test(T)) o.pagamento = 'Contanti';
  else if (/CARTE?\s*DI\s*CREDITO|PONY\s*POS|PAGAMENTO\s*(ELETTR|CART|POS)|SUMUP/.test(T)) o.pagamento = 'SumUp';
  m = t.match(/OP\.?[ \t]*:[ \t]*([A-Za-zÀ-ú'][A-Za-zÀ-ú' ]{2,40})/) || t.match(/Operatore[ \t]*:?[ \t]*([A-Za-zÀ-ú'][A-Za-zÀ-ú' ]{2,40})/i);
  if (m) o.cassiere = cap_(m[1].trim());
  if (/PIENISSIMO/.test(T)) o.avvisi.push('Ordine dall\'app Pienissimo');
  if (o.tipo === 'ASPORTO') o.avvisi.push('È un ASPORTO: il cliente ritira, non va consegnato');
  if (!o.indirizzo) o.avvisi.push('Indirizzo non letto: scrivilo a mano');
  if (!o.importo) o.avvisi.push('Totale non letto: guarda lo scontrino');
  if (!o.pagamento) o.avvisi.push('Pagamento non letto: scegli contanti o SumUp');
  return o;
}
function cap_(s) { return String(s).toLowerCase().replace(/(^|[\s'.-])([a-zà-ú])/g, function (a, b, c) { return b + c.toUpperCase(); }); }
function paese_(s) {
  s = String(s).replace(/\s+/g, ' ').trim();
  if (/SAN\s*PAOLO/i.test(s)) return 'San Paolo d\'Argon';
  return cap_(s);
}

/* ================= ORARI DI ARRIVO STIMATI ================= */

function km_(a, b) {
  const R = 6371, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  const x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Per ogni consegna non fatta: orario previsto di arrivo. Usa la posizione dal vivo se c'è, altrimenti i tempi Google. */
function etaGiro_(g, cg, pos, adesso, sosta, imp) {
  const out = { tappe: {}, rientro: '' };
  if (!g.Partenza) return out;
  const fatte = cg.filter(function (c) { return c.Consegnata; }).sort(function (a, b) { return new Date(a.Consegnata) - new Date(b.Consegnata); });
  const da = cg.filter(function (c) { return !c.Consegnata; });
  let t = new Date(fatte.length ? fatte[fatte.length - 1].Consegnata : g.Partenza).getTime();
  let primo = true;
  da.forEach(function (c) {
    let min = Number(c['Tratta Google pianificata (min)']) || 8;
    if (primo && pos && c.Lat) {
      // dal punto in cui si trova adesso: distanza in linea d'aria x1,35 a 35 km/h
      t = adesso.getTime();
      min = Math.max(1, Math.round(km_([pos.lat, pos.lng], [Number(c.Lat), Number(c.Lng)]) * 1.35 / 35 * 60));
    } else {
      if (!primo || fatte.length) min += sosta;
      if (primo) t = Math.max(t + min * 60000, adesso.getTime()) - min * 60000;
    }
    t += min * 60000; primo = false;
    out.tappe[c.ID] = new Date(t).toISOString();
  });
  // rientro: ultimo tratto verso la pizzeria
  const ult = cg.filter(function (c) { return c.Lat; }).slice(-1)[0];
  const casa = [Number(imp.LAT_PIZZERIA) || CENTRO[0], Number(imp.LNG_PIZZERIA) || CENTRO[1]];
  let rit = ult ? Math.max(2, Math.round(km_([Number(ult.Lat), Number(ult.Lng)], casa) * 1.35 / 35 * 60)) : 8;
  if (!da.length && pos) { t = adesso.getTime(); rit = Math.max(1, Math.round(km_([pos.lat, pos.lng], casa) * 1.35 / 35 * 60)); }
  else if (!da.length) t = Math.max(t, adesso.getTime() - rit * 60000);
  out.rientro = new Date(t + (da.length ? sosta * 60000 : 0) + rit * 60000).toISOString();
  return out;
}

/* ================= PORTAFOGLIO ================= */

/** Incassi di oggi del rider: contanti, SumUp, contanti già lasciati in cassa e contanti ancora in tasca. */
function portafoglio_(nome, cons, vers) {
  const oggi = data_();
  cons = cons || righe_('Consegne');
  vers = vers || righe_('Versamenti');
  const p = { contanti: 0, sumup: 0, consegne: 0, versato: 0, inTasca: 0, ultimoVersamento: '', voci: [] };
  cons.forEach(function (c) {
    if (c.Rider !== nome || vuoto_(c.Consegnata) || data_(new Date(c.Consegnata)) !== oggi) return;
    const imp = Number(c.Importo) || 0;
    if (c.Pagamento === 'Contanti') p.contanti += imp; else p.sumup += imp;
    p.consegne++;
    p.voci.push({ ora: iso_(c.Consegnata), cliente: c.Cliente || String(c.Indirizzo).split(',')[0], importo: imp, pagamento: c.Pagamento });
  });
  vers.forEach(function (v) {
    if (v.Rider !== nome || (v.Data instanceof Date ? data_(v.Data) : String(v.Data)) !== oggi) return;
    p.versato += Number(v.Contanti) || 0; p.ultimoVersamento = iso_(v.Ora);
  });
  const r2 = function (x) { return Math.round(x * 100) / 100; };
  p.contanti = r2(p.contanti); p.sumup = r2(p.sumup); p.versato = r2(p.versato);
  p.inTasca = r2(Math.max(0, p.contanti - p.versato));
  p.voci.reverse();
  return p;
}

/** Il rider lascia i contanti in cassa: conferma chi è in cassa con il suo PIN della centrale. */
function riderVersa(pin, pinCassa) {
  const nome = rider_(pin);
  let chi;
  try { chi = hub_(pinCassa); } catch (e) { throw new Error('PIN della cassa non valido'); }
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const p = portafoglio_(nome);
    if (p.inTasca <= 0) throw new Error('Non hai contanti da lasciare');
    aggiungi_('Versamenti', { ID: id_(), Data: data_(), Servizio: servizio_(), Rider: nome, Contanti: p.inTasca,
      SumUp: p.sumup, Consegne: p.consegne, 'Confermato da': chi.Nome, Ora: new Date() });
  } finally { lock.releaseLock(); }
  return riderStato(pin);
}

/* ================= NAVIGATORE ================= */

/** Indicazioni svolta per svolta (Google Maps, in italiano) dalla posizione del rider alla prossima consegna o alla pizzeria. */
function riderIndicazioni(pin, lat, lng) {
  const nome = rider_(pin), imp = imp_(), g = giroAperto_(nome);
  if (!g || !g.Partenza) throw new Error('Nessun giro in corso');
  const tutte = consegneGiro_(g.ID);
  const fatte = tutte.filter(function (c) { return c.Consegnata; }).sort(function (a, b) { return new Date(a.Consegnata) - new Date(b.Consegnata); });
  const prossima = tutte.filter(function (c) { return !c.Consegnata; })[0];
  const piz = imp.INDIRIZZO_PIZZERIA || PIZZERIA;
  const dest = prossima ? prossima.Indirizzo : piz;
  const orig = lat && lng ? lat + ',' + lng : (fatte.length ? fatte[fatte.length - 1].Indirizzo : piz);
  const r = Maps.newDirectionFinder().setOrigin(orig).setDestination(dest).setMode(Maps.DirectionFinder.Mode.DRIVING)
    .setLanguage('it').setRegion('it').getDirections().routes[0];
  if (!r) throw new Error('Percorso non trovato');
  const l = r.legs[0];
  const txt = function (h) {
    return String(h || '').replace(/<div[^>]*>/g, '. ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').replace(/\s+\./g, '.').trim();
  };
  return {
    meta: prossima ? prossima.ID : 'casa', linea: r.overview_polyline.points, dur: l.duration.value, dist: l.distance.value,
    arrivo: [l.end_location.lat, l.end_location.lng],
    passi: l.steps.map(function (st) {
      return { t: txt(st.html_instructions), d: st.distance.value, s: st.duration.value, m: st.maneuver || '',
               a: [st.start_location.lat, st.start_location.lng], b: [st.end_location.lat, st.end_location.lng] };
    })
  };
}

/* ================= DASHBOARD ================= */

/** Più schermi della centrale insieme: i dati si preparano una volta ogni 10 secondi e si condividono. */
function hubDati(pin) {
  const chi = hub_(pin), c = CacheService.getScriptCache(), x = c.get('hub_dati');
  if (x) { const d = JSON.parse(x); d.chi = chi.Nome; return d; }
  const d = hubDatiCalcola_(chi);
  try { const j = JSON.stringify(d); if (j.length < 95000) c.put('hub_dati', j, 10); } catch (e) {}
  return d;
}
function hubDatiCalcola_(chi) {
  const imp = imp_(), oggi = data_();
  const tol = Number(imp.TOLLERANZA_MIN) || 3, sosta = Number(imp.SOSTA_CLIENTE_MIN) || 2;
  const giri = righe_('Giri').filter(function (g) {
    return (g.Data instanceof Date ? data_(g.Data) : String(g.Data)) === oggi || g.Stato !== 'Chiuso';
  });
  const ids = {}; giri.forEach(function (g) { ids[g.ID] = true; });
  const cons = righe_('Consegne').filter(function (c) { return ids[c.Giro]; });
  const gps = String(imp.GPS_ATTIVO).toUpperCase() === 'SI';
  const pos = {};
  if (gps) {
    const props = PropertiesService.getScriptProperties().getProperties();
    Object.keys(props).forEach(function (k) {
      if (k.indexOf('pos_') !== 0) return;
      const p = JSON.parse(props[k]);
      if (Date.now() - new Date(p.ora).getTime() < 2 * 3600e3) pos[k.slice(4)] = p;
    });
  }
  const adesso = new Date();
  const attivi = giri.filter(function (g) { return g.Stato !== 'Chiuso'; }).map(function (g) {
    const cg = cons.filter(function (c) { return c.Giro === g.ID; })
      .sort(function (a, b) { return (Number(a['N. consigliato']) || 99) - (Number(b['N. consigliato']) || 99); });
    const fatte = cg.filter(function (c) { return c.Consegnata; })
      .sort(function (a, b) { return new Date(a.Consegnata) - new Date(b.Consegnata); });
    const prossima = cg.filter(function (c) { return !c.Consegnata; })[0];
    // stima live: dall'ultimo evento + tratta Google pianificata
    let ritardo = null;
    if (g.Partenza && prossima && !vuoto_(prossima['Tratta Google pianificata (min)'])) {
      const da = fatte.length ? fatte[fatte.length - 1].Consegnata : g.Partenza;
      ritardo = min_(da, adesso) - Number(prossima['Tratta Google pianificata (min)']) - (fatte.length ? sosta : 0);
    }
    const p = pos[g.Rider] && pos[g.Rider].giro === g.ID ? pos[g.Rider] : null;
    const eta = etaGiro_(g, cg, p, adesso, sosta, imp);
    return {
      rider: g.Rider, stato: g.Stato, partenza: iso_(g.Partenza), ordine: g['Ordine consigliato'], percorso: g.Percorso || '',
      consegne: cg.map(function (c) { const o = pulisci_(c); o.avvisi = c.Avvisi; o.etaOra = eta.tappe[c.ID] || ''; return o; }),
      rientro: eta.rientro, ritardo: ritardo, inRitardo: ritardo !== null && ritardo > tol, pos: p
    };
  });
  const stat = {};
  const s_ = function (n) { return stat[n] = stat[n] || { rider: n, consegne: 0, minuti: 0, contanti: 0, pos: 0, giri: 0, minGiro: 0, avvisi: 0 }; };
  cons.forEach(function (c) {
    if (vuoto_(c.Consegnata)) return;
    const s = s_(c.Rider); s.consegne++; s.minuti += Number(c['Tratta reale (min)']) || 0;
    if (c.Pagamento === 'Contanti') s.contanti += Number(c.Importo) || 0; else s.pos += Number(c.Importo) || 0;
    if (c.Avvisi) s.avvisi += String(c.Avvisi).split(' · ').length;
  });
  giri.forEach(function (g) {
    if (g.Stato !== 'Chiuso') return;
    const s = s_(g.Rider); s.giri++; s.minGiro += Number(g['Minuti totali']) || 0;
    if (g.Avvisi) s.avvisi += String(g.Avvisi).split(' · ').length;
  });
  const tutteCons = righe_('Consegne'), tuttiVers = righe_('Versamenti');
  Object.keys(stat).forEach(function (n) {
    const p = portafoglio_(n, tutteCons, tuttiVers);
    stat[n].versato = p.versato; stat[n].inTasca = p.inTasca; stat[n].ultimoVersamento = p.ultimoVersamento;
  });
  const report = righe_('Report').slice(-6).reverse().map(function (r) {
    return { data: r.Data instanceof Date ? data_(r.Data) : String(r.Data), servizio: r.Servizio, avvisi: r.Avvisi, consegne: r.Consegne, testo: r.Testo };
  });
  return {
    chi: chi.Nome, gps: gps, casa: [Number(imp.LAT_PIZZERIA) || CENTRO[0], Number(imp.LNG_PIZZERIA) || CENTRO[1]],
    centro: [Number(imp.LAT_PIZZERIA) || CENTRO[0], Number(imp.LNG_PIZZERIA) || CENTRO[1]],
    attivi: attivi, stat: Object.keys(stat).map(function (k) { return stat[k]; }),
    report: report, tolleranza: tol, ora: adesso.toISOString(),
    turni: righe_('Turni').filter(function (t) { return (t.Data instanceof Date ? data_(t.Data) : String(t.Data)) === oggi; })
      .map(function (t) { return { rider: t.Rider, inizio: iso_(t.Inizio), fine: iso_(t.Fine), km: t['Km percorsi'], kmG: t['Km Google giri'], avvisi: t.Avvisi, foto: t['Foto fine'] || t['Foto inizio'] }; }),
    classifica: classifica_(new Date()).slice(0, 6),
    premio: ultimoPremio_()
  };
}

/* ================= PREMIAZIONE MENSILE ================= */
/**
 * Punteggio (0-100) = 60% puntualità (consegne senza avvisi) + 25% volume (consegne rispetto al primo)
 *                   + 15% giri puliti (giri senza avvisi su percorso/rientro). Minimo PREMIO_MIN_CONSEGNE consegne.
 */
function classifica_(rif) {
  const mese = Utilities.formatDate(rif, 'Europe/Rome', 'yyyy-MM');
  const nelMese = function (d) { return d && Utilities.formatDate(new Date(d), 'Europe/Rome', 'yyyy-MM') === mese; };
  const min = Number(imp_().PREMIO_MIN_CONSEGNE) || 10;
  const r = {};
  const s_ = function (n) {
    return r[n] = r[n] || { rider: n, consegne: 0, conOrario: 0, inOrario: 0, tratte: 0, tratteOk: 0, giri: 0, giriMulti: 0, percorsiOk: 0,
                            rientri: 0, rientriOk: 0, ritardo: 0, avvisi: 0, km: 0 };
  };
  righe_('Consegne').forEach(function (c) {
    if (!nelMese(c.Consegnata)) return;
    const s = s_(c.Rider), a = String(c.Avvisi || '');
    s.consegne++;
    if (a) s.avvisi += a.split(' · ').length;
    if (!vuoto_(c['Ritardo su orario (min)'])) { s.conOrario++; if (!/In ritardo/.test(a)) s.inOrario++; }
    if (!vuoto_(c['Tratta Google (min)'])) { s.tratte++; if (!/Lento/.test(a)) s.tratteOk++; }
    s.ritardo += Math.max(0, Number(c['Ritardo tratta (min)']) || 0);
  });
  righe_('Giri').forEach(function (g) {
    if (!nelMese(g.Partenza) || g.Stato !== 'Chiuso') return;
    const s = s_(g.Rider), a = String(g.Avvisi || '');
    s.giri++;
    if (a) s.avvisi += a.split(' · ').length;
    if (!vuoto_(g['Google percorso fatto (min)']) && String(g['Ordine consigliato']).indexOf('→') > 0) { s.giriMulti++; if (!/non ottimizzato/.test(a)) s.percorsiOk++; }
    if (!vuoto_(g['Rientro Google (min)'])) { s.rientri++; if (!/Rientro lungo/.test(a)) s.rientriOk++; }
  });
  righe_('Turni').forEach(function (t) { if (nelMese(t.Inizio) && !vuoto_(t['Km percorsi'])) s_(t.Rider).km += Number(t['Km percorsi']); });
  const pc = function (a, b) { return b ? Math.round(a / b * 100) : 100; };
  const lista = Object.keys(r).map(function (k) { return r[k]; });
  lista.forEach(function (x) {
    x.percorso = pc(x.percorsiOk, x.giriMulti);   // ha seguito l'ordine consigliato
    x.puntualita = pc(x.inOrario, x.conOrario);   // arrivato entro l'orario PER LE
    x.tempi = pc(x.tratteOk, x.tratte);           // tratte entro il tempo di Google
    x.rientro = pc(x.rientriOk, x.rientri);       // rientri senza giri lunghi
    x.ritardoMedio = x.consegne ? Math.round(x.ritardo / x.consegne * 10) / 10 : 0;
    x.punteggio = Math.round(0.30 * x.percorso + 0.30 * x.puntualita + 0.25 * x.tempi + 0.15 * x.rientro);
    x.voto = Math.round(x.punteggio / 10 * 10) / 10;
    x.inGara = x.consegne >= min;
    x.km = Math.round(x.km);
  });
  return lista.sort(function (a, b) { return (b.inGara - a.inGara) || (b.punteggio - a.punteggio) || (b.consegne - a.consegne); });
}

/** Il giorno 1 alle 10: premia il mese appena finito. */
function premiazioneMensile() {
  const ieri = new Date(Date.now() - 24 * 3600e3);
  const mese = Utilities.formatDate(ieri, 'Europe/Rome', 'yyyy-MM');
  const nomeMese = Utilities.formatDate(ieri, 'Europe/Rome', 'MMMM yyyy');
  const lista = classifica_(ieri).filter(function (x) { return x.inGara; });
  if (!lista.length) return;
  lista.forEach(function (x, i) {
    aggiungi_('Premiazioni', { Mese: "'" + mese, Posizione: i + 1, Rider: x.rider, Punteggio: x.punteggio, Consegne: x.consegne,
      'Puntualità %': x.puntualita, 'Ritardo medio (min)': x.ritardoMedio, Voto: x.voto, 'Percorso %': x.percorso, 'Tempi %': x.tempi, 'Rientri %': x.rientro, Avvisi: x.avvisi, Km: x.km, Creato: new Date() });
  });
  const imp = imp_();
  if (!imp.EMAIL_REPORT) return;
  const medaglie = ['🥇', '🥈', '🥉'];
  const cella = function (v) { return '<td style="text-align:center;color:' + (v >= 90 ? '#2e7d32' : v >= 75 ? '#b26a00' : '#C6413C') + '">' + v + '%</td>'; };
  MailApp.sendEmail({
    to: String(imp.EMAIL_REPORT),
    subject: '🏆 Pagella rider ' + nomeMese + ' · migliore: ' + lista[0].rider,
    htmlBody: '<div style="font-family:-apple-system,Arial,sans-serif;max-width:680px">' +
      '<div style="background:#CCD231;padding:16px 20px;border-radius:14px 14px 0 0"><b style="color:#C6413C;font-size:22px">AMO LA PIZZA</b>' +
      '<div style="color:#302F31;font-weight:700">Pagella rider · ' + nomeMese + '</div></div>' +
      '<table style="border-collapse:collapse;width:100%;font-size:14px"><tr style="color:#888"><th>#</th><th align="left">Rider</th><th>Voto</th>' +
      '<th>Percorso</th><th>Puntualità</th><th>Tempi</th><th>Rientri</th><th>Consegne</th><th>Km</th></tr>' +
      lista.map(function (x, i) {
        return '<tr style="border-top:1px solid #eee"><td align="center">' + (medaglie[i] || i + 1) + '</td><td><b>' + x.rider + '</b></td>' +
          '<td align="center"><b>' + x.voto + '</b>/10</td>' + cella(x.percorso) + cella(x.puntualita) + cella(x.tempi) + cella(x.rientro) +
          '<td align="center">' + x.consegne + '</td><td align="center">' + x.km + '</td></tr>';
      }).join('') + '</table><p style="color:#888;font-size:12px">Voto: 30% percorso consigliato seguito, 30% puntualità sull\'orario PER LE, ' +
      '25% tempi entro Google Maps, 15% rientri senza giri lunghi. Minimo ' + (imp.PREMIO_MIN_CONSEGNE || 10) + ' consegne nel mese.</p></div>'
  });
}

/* ================= REPORT FINE SERVIZIO ================= */

function reportPranzo() { report_('Pranzo'); }
function reportCena() { report_('Cena'); }

function report_(servizio) {
  try { syncFirebase(true); } catch (e) { console.log('Sync prima del report: ' + e); }
  const imp = imp_(), oggi = data_(), ora = new Date();
  // chiude i giri rimasti aperti di questo servizio
  righe_('Giri').filter(function (g) {
    return (g.Data instanceof Date ? data_(g.Data) : String(g.Data)) === oggi && g.Servizio === servizio && g.Stato !== 'Chiuso' && g.Partenza;
  }).forEach(function (g) { chiudiGiro_(g, imp, ora, true); });

  const giri = righe_('Giri').filter(function (g) {
    return (g.Data instanceof Date ? data_(g.Data) : String(g.Data)) === oggi && g.Servizio === servizio && g.Partenza;
  });
  // turni di questo servizio senza foto di fine
  const turni = righe_('Turni').filter(function (t) {
    return (t.Data instanceof Date ? data_(t.Data) : String(t.Data)) === oggi && t.Servizio === servizio;
  });
  turni.forEach(function (t) {
    if (vuoto_(t.Fine)) scrivi_('Turni', t._riga, { Fine: ora, Avvisi: 'Foto cruscotto di fine servizio non mandata' });
  });
  if (!giri.length && !turni.length) return; // servizio senza consegne (es. domenica a pranzo): niente report
  const ids = {}; giri.forEach(function (g) { ids[g.ID] = g; });
  const cons = righe_('Consegne').filter(function (c) { return ids[c.Giro] && c.Consegnata; });

  const perRider = {};
  giri.forEach(function (g) {
    const r = perRider[g.Rider] = perRider[g.Rider] || { giri: 0, consegne: 0, reale: 0, google: 0, avvisi: [] };
    r.giri++;
    if (g.Avvisi) String(g.Avvisi).split(' · ').forEach(function (a) { r.avvisi.push(ora_(g.Partenza) + ' giro – ' + a); });
  });
  righe_('Turni').filter(function (t) {
    return (t.Data instanceof Date ? data_(t.Data) : String(t.Data)) === oggi && t.Servizio === servizio;
  }).forEach(function (t) {
    const r = perRider[t.Rider] = perRider[t.Rider] || { giri: 0, consegne: 0, reale: 0, google: 0, avvisi: [] };
    r.km = vuoto_(t['Km percorsi']) ? null : t['Km percorsi'];
    r.kmG = vuoto_(t['Km Google giri']) ? null : t['Km Google giri'];
    if (t.Avvisi) String(t.Avvisi).split(' · ').forEach(function (a) { r.avvisi.push('Km – ' + a); });
  });
  cons.forEach(function (c) {
    const r = perRider[c.Rider]; r.consegne++;
    if (!vuoto_(c['Tratta Google (min)'])) { r.reale += Number(c['Tratta reale (min)']) || 0; r.google += Number(c['Tratta Google (min)']) || 0; }
    if (c.Avvisi) String(c.Avvisi).split(' · ').forEach(function (a) { r.avvisi.push(ora_(c.Consegnata) + ' ' + c.Indirizzo.split(',')[0] + ' – ' + a); });
  });

  const tc = righe_('Consegne'), tv = righe_('Versamenti');
  Object.keys(perRider).forEach(function (n) {
    const p = portafoglio_(n, tc, tv), r = perRider[n];
    r.soldi = ' · 💶 ' + p.contanti.toFixed(2) + ' € contanti · 💳 ' + p.sumup.toFixed(2) + ' € SumUp' +
      (p.contanti ? (p.inTasca > 0 ? ' · ' : ' · contanti lasciati in cassa ✓') : '');
    if (p.inTasca > 0) r.avvisi.push('Contanti non lasciati in cassa: ' + p.inTasca.toFixed(2) + ' €');
  });
  let totAvvisi = 0, testo = '', html = '';
  Object.keys(perRider).sort().forEach(function (n) {
    const r = perRider[n]; totAvvisi += r.avvisi.length;
    const conf = (r.google ? ' · ' + r.reale + ' min reali contro ' + r.google + ' di Google' : '') +
      (r.km !== undefined && r.km !== null ? ' · ' + r.km + ' km' + (r.kmG !== null ? ' (giri Google: ' + r.kmG + ' km)' : '') : '') + (r.soldi || '');
    testo += n + ': ' + r.consegne + ' consegne in ' + r.giri + ' giri' + conf + (r.avvisi.length ? '\n  - ' + r.avvisi.join('\n  - ') : ' · tutto ok') + '\n';
    html += '<h3 style="margin:16px 0 4px">' + (r.avvisi.length ? '⚠️ ' : '✅ ') + n + '</h3><div style="color:#555">' +
      r.consegne + ' consegne in ' + r.giri + ' giri' + conf + '</div>' +
      (r.avvisi.length ? '<ul>' + r.avvisi.map(function (a) { return '<li>' + a + '</li>'; }).join('') + '</ul>' : '');
  });

  aggiungi_('Report', { Data: oggi, Servizio: servizio, Creato: ora, Consegne: cons.length, Avvisi: totAvvisi, Testo: testo });

  if (imp.EMAIL_REPORT) {
    MailApp.sendEmail({
      to: String(imp.EMAIL_REPORT),
      subject: (totAvvisi ? '⚠️ ' + totAvvisi + ' avvisi' : '✅ Tutto ok') + ' · Rider ' + servizio + ' ' + Utilities.formatDate(ora, 'Europe/Rome', 'dd/MM'),
      htmlBody: '<div style="font-family:-apple-system,Arial,sans-serif;max-width:600px">' +
        '<h2 style="color:#C6413C;margin:0">Report rider · ' + servizio + ' ' + Utilities.formatDate(ora, 'Europe/Rome', 'dd/MM/yyyy') + '</h2>' +
        '<p>' + cons.length + ' consegne · ' + totAvvisi + ' avvisi · tolleranza ' + (imp.TOLLERANZA_MIN || 3) + ' min su Google Maps</p>' +
        html + '<p style="color:#888;font-size:12px;margin-top:20px">Dettaglio nel Foglio, schede Giri e Consegne.</p></div>'
    });
  }
}

/** Prova: legge la foto "prova-ordine.jpg" dalla cartella APP RIDER codice e mostra cosa capisce. */
function provaLettura() {
  const f = DriveApp.getFolderById('1HZPDo8IvpzPs7WeSAVQxr86MZ7Nj3UwS').getFilesByName('prova-ordine.jpg').next();
  const doc = Drive.Files.create({ name: 'ocr-prova', mimeType: MimeType.GOOGLE_DOCS }, f.getBlob(), { ocrLanguage: 'it' });
  const testo = DocumentApp.openById(doc.id).getBody().getText();
  DriveApp.getFileById(doc.id).setTrashed(true);
  console.log('RISULTATO ' + JSON.stringify(leggiOrdine_(testo)));
  console.log('TESTO ' + testo.slice(0, 1500));
}

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
  const url = 'https://firestore.googleapis.com/v1/projects/' + FB_PROGETTO + '/databases/(default)/documents/' + percorso.split('/').map(encodeURIComponent).join('/');
  const r = UrlFetchApp.fetch(url, {
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
