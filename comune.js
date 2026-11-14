/* ALP · funzioni comuni di App Rider e Centrale (calcoli istantanei sul dispositivo, senza aspettare server). */
(function () {
  const CASA = [45.6860723, 9.7990781];              // Amo la Pizza, via Francesco Baracca 2, San Paolo d'Argon
  const COLORI = { Claudio: '#1d5fd1', Camozzi: '#c2185b', Simone: '#d97100', Duca: '#6d35d6', Filippo: '#0f7a68', Daniel: '#7a5c00' };
  const RISERVA = ['#1d5fd1', '#d97100', '#6d35d6', '#0f7a68', '#c2185b', '#7a5c00', '#00838f', '#5d4037'];
  const due = n => String(n).padStart(2, '0');

  /* Orari invernali dei rider, dai PDF di Andrea (0=domenica … 6=sabato) */
  const ORARI = {
    Claudio: { 1: [['17:00', '22:00']], 6: [['18:15', '22:15']], 0: [['18:00', '20:30']] },
    Camozzi: { 1: [['11:30', '14:30']], 2: [['11:30', '14:30'], ['17:30', '22:00']], 3: [['11:30', '14:30']], 4: [['11:30', '14:30']], 5: [['11:30', '14:30']], 0: [['17:30', '21:30']] },
    Simone: { 3: [['17:30', '22:00']], 6: [['18:00', '22:00']], 0: [['18:30', '22:00']] },
    Duca: { 4: [['18:00', '21:00']], 5: [['18:30', '21:30']], 6: [['18:00', '22:30']], 0: [['18:00', '22:00']] },
    Filippo: { 4: [['17:30', '22:00']], 5: [['17:30', '22:00']], 6: [['18:30', '21:30']], 0: [['18:30', '21:30']] },
    Daniel: { 6: [['18:30', '22:00']], 0: [['18:00', '21:30']] }
  };

  const A = window.ALP = {
    ORARI,
    /** chi è di turno adesso (o sta per iniziare): [{nome, da, a, tra}] */
    attesi(quanti) {
      const d = new Date(), g = d.getDay(), m = d.getHours() * 60 + d.getMinutes(), anticipo = quanti == null ? 30 : quanti, out = [];
      Object.keys(ORARI).forEach(n => (ORARI[n][g] || []).forEach(([da, a]) => {
        const i = Number(da.slice(0, 2)) * 60 + Number(da.slice(3)), f = Number(a.slice(0, 2)) * 60 + Number(a.slice(3));
        if (m >= i - anticipo && m <= f) out.push({ nome: n, da, a, tra: Math.max(0, i - m) });
      }));
      return out.sort((x, y) => x.da.localeCompare(y.da));
    },
    FONDO: 80.05, CASA, PIZZERIA: "Via Francesco Baracca 2, 24060 San Paolo d'Argon BG", SOSTA: 3, VEL: 35, GPS_OGNI: 15,
    colore: n => COLORI[n] || RISERVA[[...String(n)].reduce((a, c) => a + c.charCodeAt(0), 0) % RISERVA.length],
    $: s => document.querySelector(s),
    tutti: s => [...document.querySelectorAll(s)],
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    euro: v => (Number(v) || 0).toFixed(2).replace('.', ',') + ' €',
    hhmm: t => t ? new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '',
    oggi: (d = new Date()) => d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()),
    mese: (d = new Date()) => d.getFullYear() + '-' + due(d.getMonth() + 1),
    servizio: (d = new Date()) => d.getHours() < 17 ? 'Pranzo' : 'Cena',
    id: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    num: v => Number(String(v == null ? '' : v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) || 0,
    ls: { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
          set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
          del: k => { try { localStorage.removeItem(k); } catch (e) {} } },

    /** "Via del Convento 38/A" -> "Convento" · "Via Aldo Moro 6" -> "Moro" */
    corto(via) {
      const stop = /^(via|viale|v\.le|v\.|piazza|p\.za|p\.zza|largo|corso|c\.so|vicolo|strada|localita|localit\u00e0|loc\.|contrada|borgo|salita|str\.)$/i;
      const w = String(via || '').replace(/[,.;].*$/, '').split(/\s+/)
        .filter(x => x && !stop.test(x) && !/^\d+[a-z]?(\/[a-z0-9]+)?$/i.test(x) && !/^(n|snc|int|sc|scala)$/i.test(x));
      return (w[w.length - 1] || String(via || '').trim() || '—').replace(/[^0-9A-Za-z\u00C0-\u017F'\-]/g, '');
    },
    /** fascia da 15 minuti: "20:07" -> "20:00" */
    fascia(hhmm) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); if (!m) return '';
      const t = Number(m[1]) * 60 + Math.floor(Number(m[2]) / 15) * 15;
      return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
    },
    /** toglie minuti a un orario "20:15" */
    meno(hhmm, min) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); if (!m) return '';
      let t = Number(m[1]) * 60 + Number(m[2]) - min; if (t < 0) t += 1440;
      return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
    },
    /** elenco delle fasce del servizio */
    fasce(servizio) {
      const [da, a] = servizio === 'Pranzo' ? [11 * 60 + 45, 14 * 60 + 15] : [18 * 60 + 15, 22 * 60];
      const out = []; for (let t = da; t <= a; t += 15) out.push(String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
      return out;
    },

    /** distanza in km in linea d'aria */
    km(a, b) {
      const R = 6371, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
      const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(x));
    },
    /** minuti di guida stimati (strada ≈ 1,35 × linea d'aria a 35 km/h) */
    minuti: (a, b) => Math.max(1, Math.round(A.km(a, b) * 1.35 / A.VEL * 60)),
    pt: c => c && c.lat ? [c.lat, c.lng] : null,

    /** Ordine migliore delle consegne partendo da "inizio" e tornando in pizzeria.
        Fino a 7 consegne prova tutte le combinazioni (istantaneo), oltre usa "la più vicina". */
    ordina(inizio, cons) {
      const con = cons.filter(c => c.lat), senza = cons.filter(c => !c.lat);
      if (con.length < 2) return con.concat(senza);
      const costo = seq => { let t = 0, p = inizio; seq.forEach(c => { t += A.minuti(p, [c.lat, c.lng]) + A.SOSTA; p = [c.lat, c.lng]; }); return t + A.minuti(p, CASA); };
      let best = null;
      if (con.length <= 7) {
        const perm = (arr, pre) => {
          if (!arr.length) { const c = costo(pre); if (!best || c < best.c) best = { c, s: pre }; return; }
          arr.forEach((x, i) => perm(arr.slice(0, i).concat(arr.slice(i + 1)), pre.concat([x])));
        };
        perm(con, []);
        return best.s.concat(senza);
      }
      const resto = con.slice(), out = []; let p = inizio;
      while (resto.length) { resto.sort((a, b) => A.km(p, [a.lat, a.lng]) - A.km(p, [b.lat, b.lng])); const c = resto.shift(); out.push(c); p = [c.lat, c.lng]; }
      return out.concat(senza);
    },
    /** Orari stimati: arrivo a ogni consegna e rientro in pizzeria */
    eta(inizio, t0, seq) {
      const tappe = {}; let t = t0, p = inizio;
      seq.forEach((c, i) => { const q = A.pt(c) || p; t += (i ? A.SOSTA : 0) * 60000 + A.minuti(p, q) * 60000; tappe[c.id] = t; p = q; });
      const rientro = t + (seq.length ? A.SOSTA * 60000 : 0) + A.minuti(p, CASA) * 60000;
      return { tappe, rientro };
    },
    /** minuti di ritardo rispetto all'orario "PER LE" (null se non c'è) */
    ritardo(previsto, arrivo) {
      if (!/^\d{1,2}:\d{2}$/.test(previsto || '') || !arrivo) return null;
      const d = new Date(arrivo), [h, m] = previsto.split(':').map(Number);
      return Math.round((d.getHours() * 60 + d.getMinutes()) - (h * 60 + m));
    },

    /** Indirizzo → coordinate (OpenStreetMap, gratis). Una richiesta per volta, in coda, e ricorda i risultati. */
    geocodifica(via, paese) {
      const k = 'geo:' + ((via || '') + ', ' + (paese || "San Paolo d'Argon") + ', BG').replace(/\s+/g, ' ').trim().toLowerCase();
      const c = A.ls.get(k); if (c) return Promise.resolve(JSON.parse(c));
      A._coda = (A._coda || Promise.resolve()).then(() => new Promise(r => setTimeout(r, 1100))).then(() => A._geo(via, paese));
      return A._coda;
    },
    async _geo(via, paese) {
      const q = (via + ', ' + (paese || "San Paolo d'Argon") + ', BG').replace(/\s+/g, ' ').trim(), k = 'geo:' + q.toLowerCase();
      const c = A.ls.get(k); if (c) return JSON.parse(c);
      const vicino = p => p && A.km(p, CASA) < 40 ? p : null;
      let p = null;
      try {
        const r = await (await fetch('https://photon.komoot.io/api/?limit=1&lang=it&lat=' + CASA[0] + '&lon=' + CASA[1] + '&q=' + encodeURIComponent(q))).json();
        const f = r.features && r.features[0]; if (f) p = vicino([f.geometry.coordinates[1], f.geometry.coordinates[0]]);
      } catch (e) {}
      if (!p) try {
        const r = await (await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=it&q=' + encodeURIComponent(q))).json();
        if (r[0]) p = vicino([Number(r[0].lat), Number(r[0].lon)]);
      } catch (e) {}
      if (p) A.ls.set(k, JSON.stringify(p));
      return p;
    },

    /** Foto ridotta (jpeg) */
    comprimi(file, max) {
      return new Promise((ok, ko) => {
        const img = new Image(), url = URL.createObjectURL(file);
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
          ok(c.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = ko; img.src = url;
      });
    },

    /** Lettura veloce della foto con Gemini (Google). tipo: 'ordine' (comanda + scontrino) o 'km' (cruscotto). */
    async leggiFoto(dataUrl, tipo, chiave, modello) {
      if (!chiave) throw new Error('Lettura foto non attiva');
      const prompt = tipo === 'km'
        ? 'Foto del cruscotto di uno scooter o di un furgone. Leggi il CONTACHILOMETRI TOTALE (il numero più grande, non il parziale/trip). Rispondi solo JSON: {"km": numero intero oppure null}'
        : 'Foto di una comanda e di uno scontrino della pizzeria Amo la Pizza (San Paolo d\'Argon, BG), affiancati. Estrai i dati e rispondi solo JSON con queste chiavi: ' +
          '{"tipo":"DOMICILIO" o "ASPORTO" o "","numero":"numero ordine dopo N:","cliente":"nome cliente","via":"via e numero civico","paese":"paese (la riga sotto la via, prima del trattino)","telefono":"","previsto":"orario PER LE in formato HH:MM","importo":numero dopo "Totale:",' +
          '"pizze":numero dopo PIZ:,"burger":numero dopo BUR:,' +
          '"pagamento":"Contanti" oppure "SumUp","cassiere":"nome dopo OP.","note":"citofono, scala, piano se scritti"}. ' +
          'Regole: "PONY POS" o "Carte di credito" = SumUp; un codice "PIENISSIMO" in fondo = ordine dall\'app, quindi SumUp; "PONY CONTANTI" o altro = Contanti. Numeri non leggibili = 0, testi non leggibili = "".';
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + (modello || 'gemini-2.5-flash') + ':generateContent?key=' + encodeURIComponent(chiave), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: dataUrl.split(',')[1] } }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } } })
      });
      const j = await r.json();
      if (!r.ok) throw new Error((j.error && j.error.message) || 'Lettura non riuscita');
      const t = j.candidates[0].content.parts.map(p => p.text || '').join('');
      return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
    },

    /** suono breve + vibrazione (nuova consegna, rider libero…) */
    suono(alto) {
      try {
        const C = A._ac || (A._ac = new (window.AudioContext || window.webkitAudioContext)());
        [0, .18].forEach((d, i) => { const o = C.createOscillator(), g = C.createGain(); o.frequency.value = (alto ? 988 : 784) + i * 200;
          g.gain.setValueAtTime(.0001, C.currentTime + d); g.gain.exponentialRampToValueAtTime(.3, C.currentTime + d + .02); g.gain.exponentialRampToValueAtTime(.0001, C.currentTime + d + .16);
          o.connect(g).connect(C.destination); o.start(C.currentTime + d); o.stop(C.currentTime + d + .18); });
      } catch (e) {}
      if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
    },
    /** messaggio veloce in basso, non blocca niente */
    toast(t, err) {
      let d = A.$('#toast'); if (!d) { d = document.createElement('div'); d.id = 'toast'; document.body.appendChild(d); }
      d.textContent = t; d.className = 'on' + (err ? ' err' : ''); clearTimeout(A._tt); A._tt = setTimeout(() => d.className = '', 2600);
    },
    /** chiamata allo script Google: SOLO per il PIN (abilita il dispositivo), mai durante il lavoro */
    async pin(fn, pin) {
      const u = await Promise.race([FB.uid(), new Promise(r => setTimeout(() => r(null), 5000))]);
      const r = await fetch(window.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn, a: [pin], u }) })
        .then(r => r.json(), () => { throw new Error('Connessione assente: riprova'); });
      if (!r.ok) throw new Error(r.e); return r.r;
    }
  };
})();
