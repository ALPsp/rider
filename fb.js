/* ALP HUB · collegamento al database in tempo reale (Firebase, progetto alp-hub-9cfb0).
   Le chiavi qui sotto sono pubbliche per natura: chi può leggere cosa lo decidono le regole del database
   e l'elenco "accessi", che scrive solo lo script Google dopo aver controllato il PIN. */
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
  const leggi = s => { const d = s.data() || {}; return d.json ? JSON.parse(d.json) : d; };

  function avvia() {
    return pronto || (pronto = (async () => {
      const [a, au, fs] = await Promise.all([import(U('app')), import(U('auth')), import(U('firestore'))]);
      const app = a.initializeApp(CONFIG), auth = au.getAuth(app);
      let db;
      try { db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache() }); } catch (e) { db = fs.getFirestore(app); }
      let u = await new Promise(r => { const stop = au.onAuthStateChanged(auth, x => { stop(); r(x); }); });
      if (!u) u = (await au.signInAnonymously(auth)).user;
      return { uid: u.uid, db, fs };
    })().catch(e => { pronto = null; throw e; }));
  }

  window.FB = {
    avvia,
    /** id anonimo di questo telefono (serve allo script per abilitarlo dopo il PIN); null se Firebase non risponde */
    uid: () => avvia().then(x => x.uid, () => null),
    /** ascolta un documento: cb(dati) a ogni modifica, subito anche offline */
    ascolta: async (percorso, cb) => {
      const { db, fs } = await avvia();
      return fs.onSnapshot(fs.doc(db, percorso), s => { if (s.exists()) try { cb(leggi(s)); } catch (e) {} }, () => {});
    },
    /** ascolta una raccolta intera: cb({id: dati}) */
    ascoltaTutti: async (raccolta, cb) => {
      const { db, fs } = await avvia();
      return fs.onSnapshot(fs.collection(db, raccolta), q => { const o = {}; q.forEach(s => { o[s.id] = leggi(s); }); cb(o); }, () => {});
    },
    scrivi: async (percorso, dati) => { const { db, fs } = await avvia(); return fs.setDoc(fs.doc(db, percorso), dati); }
  };
})();
