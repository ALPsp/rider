/* ALP HUB · database in tempo reale (Firebase, progetto alp-hub-9cfb0) — versione 2.
   Tutte le scritture si vedono SUBITO sullo schermo (cache locale) e partono verso il server in sottofondo.
   Chi può leggere/scrivere cosa lo decidono le regole del database e l'elenco "accessi" (scritto dallo script dopo il PIN). */
(function () {
  const V = '12.19.0', U = n => `https://www.gstatic.com/firebasejs/${V}/firebase-${n}.js`;
  const CONFIG = {
    apiKey: 'AIzaSyDApK4qokDsEMAaFMVM1kuiI_OztAdAS4I',
    authDomain: 'alp-hub-9cfb0.firebaseapp.com',
    projectId: 'alp-hub-9cfb0',
    storageBucket: 'alp-hub-9cfb0.firebasestorage.app',
    messagingSenderId: '684372220619',
    appId: '1:684372220619:web:06344ca3871f5542ec594e'
  };
  let pronto = null;
  const dati = s => { const d = s.data() || {}; return d.json ? JSON.parse(d.json) : d; };

  function avvia() {
    return pronto || (pronto = (async () => {
      const [a, au, fs] = await Promise.all([import(U('app')), import(U('auth')), import(U('firestore'))]);
      const app = a.initializeApp(CONFIG), auth = au.getAuth(app);
      let db;
      try { db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
      catch (e) { db = fs.getFirestore(app); }
      let u = await new Promise(r => { const stop = au.onAuthStateChanged(auth, x => { stop(); r(x); }); });
      if (!u) u = (await au.signInAnonymously(auth)).user;
      return { uid: u.uid, db, fs };
    })().catch(e => { pronto = null; throw e; }));
  }
  const rif = (db, fs, p) => fs.doc(db, ...p.split('/'));

  window.FB = {
    avvia,
    uid: () => avvia().then(x => x.uid, () => null),
    /** ascolta un documento: cb(dati|null) a ogni modifica, subito anche offline */
    doc: async (p, cb) => { const { db, fs } = await avvia(); return fs.onSnapshot(rif(db, fs, p), s => cb(s.exists() ? dati(s) : null), e => console.log(p, e)); },
    /** ascolta una raccolta con filtri [[campo, op, valore], ...]: cb([{id, ...dati}]) */
    lista: async (coll, filtri, cb) => {
      const { db, fs } = await avvia();
      const q = fs.query(fs.collection(db, coll), ...(filtri || []).map(f => fs.where(f[0], f[1], f[2])));
      return fs.onSnapshot(q, { includeMetadataChanges: false }, s => { const o = []; s.forEach(d => o.push(Object.assign({ id: d.id }, dati(d)))); cb(o); }, e => console.log(coll, e));
    },
    leggi: async p => { const { db, fs } = await avvia(); const s = await fs.getDoc(rif(db, fs, p)); return s.exists() ? dati(s) : null; },
    /** scritture: NON aspettarle per aggiornare lo schermo, i listener ricevono subito il cambiamento */
    scrivi: async (p, d, unisci) => { const { db, fs } = await avvia(); return fs.setDoc(rif(db, fs, p), d, unisci ? { merge: true } : {}); },
    cambia: async (p, d) => { const { db, fs } = await avvia(); return fs.updateDoc(rif(db, fs, p), d); },
    togli: async p => { const { db, fs } = await avvia(); return fs.deleteDoc(rif(db, fs, p)); },
    /** più scritture insieme, tutte o nessuna: ops = [['set'|'merge'|'update'|'delete', percorso, dati]] */
    insieme: async ops => {
      const { db, fs } = await avvia(), b = fs.writeBatch(db);
      ops.forEach(([t, p, d]) => t === 'delete' ? b.delete(rif(db, fs, p)) : t === 'update' ? b.update(rif(db, fs, p), d) : b.set(rif(db, fs, p), d, t === 'merge' ? { merge: true } : {}));
      return b.commit();
    },
    /** valori speciali (servono dopo avvia) */
    aggiungiA: async v => { const { fs } = await avvia(); return fs.arrayUnion(v); },
    incrementa: async n => { const { fs } = await avvia(); return fs.increment(n); }
  };
})();
