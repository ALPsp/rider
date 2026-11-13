/* ALP · funzioni comuni di App Rider e Centrale (calcoli istantanei sul dispositivo, senza aspettare server). */
(function () {
  const CASA = [45.6860723, 9.7990781];              // Amo la Pizza, via Francesco Baracca 2, San Paolo d'Argon
  const COLORI = { Claudio: '#1d5fd1', Camozzi: '#c2185b', Simone: '#d97100', Duca: '#6d35d6', Filippo: '#0f7a68', Daniel: '#7a5c00' };
  const RISERVA = ['#1d5fd1', '#d97100', '#6d35d6', '#0f7a68', '#c2185b', '#7a5c00', '#00838f', '#5d4037'];
  const due = n => String(n).padStart(2, '0');

  const A = window.ALP = {
    CASA, PIZZERIA: "Via Francesco Baracca 2, 24060 San Paolo d'Argon BG", SOSTA: 3, VEL: 35, GPS_OGNI: 15,
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

    /** Indirizzo → coordinate (OpenStreetMap, gratis). Ricorda i risultati per non chiedere due volte. */
    async geocodifica(via, paese) {
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
          '{"tipo":"DOMICILIO" o "ASPORTO" o "","numero":"numero ordine","cliente":"nome cliente","via":"via e numero civico","paese":"paese","telefono":"","previsto":"orario PER LE in formato HH:MM","importo":numero totale da incassare (dallo scontrino),' +
          '"pagamento":"Contanti" oppure "SumUp","cassiere":"nome dopo OP. in basso a destra","note":"citofono, scala, piano se scritti"}. ' +
          'Regole: "Carte di credito" sullo scontrino = SumUp; un codice "PIENISSIMO" in fondo alla comanda = ordine dall\'app, quindi SumUp; altrimenti Contanti. Campi non leggibili = "".';
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
