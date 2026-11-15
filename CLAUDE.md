# APP RIDER – Amo la Pizza · istruzioni per Claude

Proprietario: Andrea Colnago (non programmatore). Rispondi in italiano, conciso, chiedi prima delle scelte che costano,
consuma pochi token, mostra un mock-up prima di cambiare la grafica, metti la stima token in fondo.

## Dove sta cosa
- Sito (GitHub Pages, repo `ALPsp/rider`, branch `main`): `rider/` app rider · `centrale/` centrale cassa (iPad) ·
  `manuale/` · `comune.js` funzioni comuni · `fb.js` Firebase. Copie di riserva: `rider-vecchia/`, `centrale-vecchia/`.
- Database in tempo reale: Firebase progetto `alp-hub-9cfb0` (consegne, rider, giri, versamenti, indirizzi, stato).
- Motore pesante: Apps Script "APP RIDER – Amo la Pizza" (account amolapizzadiandrea),
  id `16YeNCF-BdIs8-KkRIEDsKCR1TY1dedwCZo_Xcu9D8ID3Ywg6n9P8oF2D`.
  File nel progetto: `Codice.gs` (= `script/Codice-v6.gs` del repo) e `Sync.gs` (= `script/Sync.gs`).
  `script/Codice.gs` e `script/Firebase.gs` del repo sono vecchi: non usarli.
- Web app (doPost): deployment `AKfycbwzKqDFmwR66rYvYyHV4Ih1mdb4jtuXlwYGJskz69RNnCKwuONjjDLgIU8nRQBmYwJf` (versione 10 del 15/11/2026).
- Foglio "APP RIDER – Amo la Pizza" id `1y_QIAARjBJAY_qAK6heMKlGDiiowUwjcI2huT8jM8W8`
  (schede Rider, Accessi, Giri, Consegne, Turni, Versamenti, Premiazioni, Report, Impostazioni). Leggibile col connettore Google Sheets.

## Aggiornare il sito (centrale / rider)
1. Clona il repo, modifica, controlla la sintassi JS (estrai gli `<script>` e `new Function(...)`).
2. Alza la versione cache in `centrale/sw.js` (o `rider/sw.js`): `alp-vN` → `alp-vN+1`.
3. Commit + `git push` su `main`: GitHub Pages pubblica in 1–2 minuti. Il sandbox non apre github.io: verifica dal browser della app.

## Aggiornare lo script Google (senza incollare il codice a mano)
1. Modifica `script/Codice-v6.gs` / `script/Sync.gs` nel repo, controlla la sintassi (`cat Sync.gs Codice-v6.gs` → `new Function`), push.
2. Browser della app (built-in): apri `https://script.google.com/u/1/home/projects/<id>/edit` (account /u/1/).
3. Con `javascript_tool`: `monaco.editor.getModels()` → `file_1.js` = Codice.gs, `file_4.js` = Sync.gs.
   - PRIMA confronta l'online col repo (può essere stato cambiato a mano): calcola nel browser solo le righe diverse,
     non scaricare il file intero (supera i limiti).
   - Se identico a parte le tue modifiche: `fetch('https://raw.githubusercontent.com/ALPsp/rider/<commit>/script/...')`
     e `model.pushEditOperations` con tutto il testo. Altrimenti applica solo sostituzioni esatte (ognuna trovata 1 volta).
4. Salva: pulsante "Salva progetto su Drive". Trigger e report usano subito il codice salvato.
5. Se cambia `doPost`/`api_()` (funzioni chiamate dalle pagine): Esegui il deployment → Gestisci deployment → Modifica (matita)
   → Versione: Nuova versione → Esegui il deployment. Imposta prima il viewport a 1280x800, poi rimettilo "desktop".
6. Verifica: chiama l'exec URL dal browser con `fetch(POST, text/plain, {fn, a})`; per le funzioni interne aggiungi una
   funzione temporanea, eseguila dall'editor (seleziona il file giusto, poi la funzione), controlla il Foglio, poi TOGLILA e risalva.
7. Allinea il repo all'online alla fine.

## Regole di Amo la Pizza da rispettare
- "PER LE 19:00" = arrivo tra 19:00 e 19:15. Fasce da 15 min; limite 20 pizze o 20 burger per fascia (consigliato 15).
- Sosta al cliente 3 min (Impostazioni SOSTA_CLIENTE_MIN). Fondo cassa rider 80,05 €, versano tutto a fine turno.
- Voto tempi per giro intero: Google andata + 3 min a consegna + Google ritorno contro partenza→rientro; in linea = 8, ±0,5 al minuto (0–10).
- Puntualità: se il rider esce già in ritardo (partenza + Google non entra nella fascia) la consegna NON conta per lui.
  Causa dell'uscita in ritardo (colonne Consegne "Uscita in ritardo (min)", "Causa ritardo uscita"):
  1) Cassiere se la fascia era già piena quando ha preso l'ordine; 2) Rider se era ancora in giro; 3) Pizzeria / Cucina.
- Report 14:30 e 22:30 via email: per rider km, contanti, SumUp, discrepanze (Versamenti: Atteso/Differenza);
  sezione USCITA PRODOTTI CUCINA (per reparto); classifica mensile nella pagella del giorno 1.
- Centrale: striscia consegne scorrevole, filtro per fascia (si apre su quella attuale) + stato
  (Da assegnare, In giro, Consegnate, 🥡 Asporto, Cestino). Elimina = cestino recuperabile, resta chi/quando.
  Tutti i cassieri possono modificare/riaprire/cambiare rider anche dopo la consegna; i rider no.
- Indirizzi: prima OpenStreetMap, poi Google tramite lo script (`geocodifica`, solo paese giusto ed entro 25 km);
  le vie trovate restano in Firebase `indirizzi/` per tutti.
- Nei materiali per i dipendenti non deve mai comparire la chiave Gemini. Non guardare mai le password di Andrea.
- Prima di cancellare dati chiedi conferma; prima di dire che una cosa esiste, controlla.
