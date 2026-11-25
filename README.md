# Stejlepladsen etape 2

Web-app (PWA) til kontrol af indstøbte el-dåser og rør på Stejlepladsen (SP2).
Ren statisk app: ingen server, intet login. Alle registreringer og billeder gemmes lokalt på telefonen.

## Læg appen på GitHub Pages

GitHub tillader højst 100 filer pr. upload i browseren. Derfor er filerne delt i fire mapper.

1. Opret en gratis konto på github.com, hvis du ikke har en.
2. Tryk **New repository**. Giv det fx navnet `sp2`, vælg **Public** og tryk **Create repository**.
3. Tryk **uploading an existing file**.
4. **Upload 1:** Åbn mappen `1-app`. Markér alt indhold (index.html, app.js, data.js, style.css, sw.js, manifest.webmanifest, README.md og mappen `ikoner`) og træk det ind på GitHub. Tryk **Commit changes**.
5. **Upload 2–4:** Tryk **Add file → Upload files**. Åbn `2-tegninger-F` og træk mappen `tegninger` ind. Tryk **Commit changes**. Gør det samme med `3-tegninger-I-J1` og `4-tegninger-resten`. GitHub samler filerne i én `tegninger`-mappe.
6. Gå til **Settings → Pages**. Vælg **Deploy from a branch**, branch **main**, mappe **/(root)**, og tryk **Save**.
7. Efter 1–2 minutter ligger appen på `https://DIT-BRUGERNAVN.github.io/sp2/`.

Hvis du hellere vil bruge **GitHub Desktop**, kan du kopiere indholdet af de fire mapper sammen i én mappe og committe det hele på én gang.

**Bemærk:** En gratis GitHub Pages-side er offentlig. Alle, der kender adressen, kan se tegningerne. Dine registreringer og billeder bliver derimod aldrig lagt på nettet; de ligger kun på telefonen.

## Installér på iPhone

1. Åbn adressen i **Safari**.
2. Tryk **Del** (firkanten med pil op) og vælg **Føj til hjemmeskærm**. Navnet "Stejlepladsen" er udfyldt på forhånd.
3. Åbn appen fra **ikonet på hjemmeskærmen**, og brug den kun derfra. Safari og hjemmeskærmsappen har hver deres lager, så registreringer foretaget i Safari ses ikke i appen.
4. Gå til **Menu → Hent alle tegninger**. Det er ca. 55 MB, så gør det på wifi. Derefter virker alt uden dækning.

## Daglig brug

- Vælg opgang, så etage og så bolig, og tryk **＋ Ny registrering**. Alt gemmes automatisk.
- **‹** går ét niveau op: dåse → bolig → etage → opgang → oversigt. **Hjem** går direkte til oversigten over alle opgange.
- Du kan vælge flere typer på samme dåse, fx Lampeudtag + Stikkontakt. "Generelt" og "Alle rum" kan bruges til ting, der gælder hele boligen.
- Ikke afkrydset betyder OK. Sæt flueben ved "Afvigelse dåse", "Afvigelse rør/udsparing" eller "Anden afvigelse", og skriv en note.
- **Tegning** åbner boligens tegning zoomet ind på planen. Brug to fingre til at zoome, træk for at flytte og dobbelttryk for at zoome ind/ud. **Hele ark** viser hele arket med titelfeltet, og **Signatur** viser signaturforklaringen.
- Boligernes navne (tv./th. osv.) er **foreslåede**, fordi tegningerne ikke viser siden. Ret dem på stedet med **Ret navn**, eller tryk **Navnet er rigtigt**.
- Noter om tag findes på hver opgang og under etagen "Tag".
- Hver etage har også "Trappe / fællesareal", og kælder har "Kælder / fællesareal".
- **📏 Mål** i tegningsviseren: sigtekorset står hele tiden på tegningen. Sæt fingeren lige under det sted, du vil måle fra – så forstørrer sigtekorset 3x, indtil du slipper og punktet sættes. Gør det samme for punkt 2. Afstand og vinkel vises, og målingen låser let (med en lille vibration) ved 0°, 45°, 90° og 135°. **🧲 Fang streg** (slået til som standard) trækker sigtet ind på midten af den nærmeste streg på tegningen – man kan glide langs stregen – og på hjørner/kryds, når sigtet står på dem. Sigtet bliver blåt, når det har fanget en streg, og grønt ved vinkellås; begge kan virke samtidig. Vælg **Punkt til punkt** (ét mål) eller **Rute** (hvert tryk tilføjer et punkt; længden på hvert stykke står ved stregen og den samlede længde øverst, **Fortryd** fjerner sidste punkt). Flyt og zoom med to fingre, og flyt et punkt ved at tage fat lige under det og trække. Målestokken er indbygget pr. tegning (1:50, 1:100, 1:200, 1:500). **Kalibrér** kan rette efter et påskrevet mål, og det huskes pr. tegning på telefonen.
- Etager med en etage- eller kældertegning viser 📐-knapper øverst. I tegningsviseren skifter **Tegninger ▾** mellem boligtegning, etageplan, kælder, oversigtsplan og signaturforklaring. **Hele ark** viser hele arket med signaturer og titelfelt.

## Deling med holdet og materialeliste

- Appen kan dele registreringer, billeder, navne, tagnoter og materialelisten mellem flere telefoner via Supabase (gratis). Opsætning: se `supabase/VEJLEDNING.md`. Derefter udfyldes `config.js` med Project URL og publishable key.
- Hver bruger skriver sit navn og den fælles kode én gang på forsiden. Alt gemmes stadig først på telefonen og deles, når der er dækning.
- Materialelisten ligger øverst på forsiden. Tryk på den for at tilføje, krydse af eller slette linjer.
- **Opgaver** ligger lige under: ét kort pr. person (Morten, Tommy, Daniel, Stephan – flere kan tilføjes) og et fælles kort. Alle kan se og krydse alle opgaver af, og der står hvem og hvornår. Morten kan lægge opgaver på alle lister, de andre på den fælles. **📋 Indsæt opgaver** tager tekst som `Tommy: hjælp Daniel i kælderen` (én pr. linje) og fordeler dem; linjer uden navn går på Fælles.

## Rapport, CSV og backup

- **Menu → Rapport:** Vælg omfang, hvilke afvigelser der skal med (dåse, rør/udsparing, anden afvigelse), om registreringer uden afvigelse skal med, og billeder. Tryk så **Udskriv / gem som PDF**. Virker print ikke, så brug "Gem rapport som fil" og åbn filen i Safari.
- **Menu → Eksportér CSV:** Filen åbner direkte i Excel.
- **Menu → Tag backup:** Laver en .zip med alle data og billeder. Gem den i Filer/iCloud eller mail den til dig selv, og gør det jævnligt. Appen minder dig om det efter 7 dage.
- **Gendan** fletter backup'en ind uden at slette noget. Det kan også bruges til at flytte data til en ny telefon.

## Ny version af appen

1. Ret filerne.
2. Ret `VERSION` øverst i `sw.js` (fx `"1.0.0"` → `"1.0.1"`). Uden denne ændring opdager telefonen ikke den nye version.
3. Upload. Telefonen viser så "Der er en ny version" med knappen **Opdater nu**.

Registreringer, billeder og tegninger bevares altid ved opdatering. Databasen må kun udvides, aldrig nulstilles.
Hvis tegningerne bliver revideret: læg de nye PNG-filer i `tegninger/`, og ret `DRAW_CACHE` i både `sw.js` og `app.js` til `"sp2-tegninger-v2"`. Brugerne trykker derefter **Hent alle** igen.

## Indhold

- 240 boliger fra Artelia N930 (I1, J1, J2, K1, K3) og N931 rev. 1 (F1, F2, F3, F5, F6), 10 oversigtsplaner og signaturforklaringen.
- Etageplaner (N900–N906) for alle bygninger: F1, F2, F3, F5/F6 (fælles ark), I1, J1, J2, K1 og K3, fra stue til tag. Stueplanerne viser også den udvendige belysning på facaden.
- Brandplaner (M08) for stueetagen i F1, F2, F3, I1, J1 og K1 samt kældrene under F1–F3 og J1–J2. De vises med 🔥 på etagen.
- Kældre: under F1/F2/F3 (N911 føringsveje/kraft/svagstrøm og N411 lys, rev. 2) og under J1/J2 (N912 føringsveje/kraft/svagstrøm). Tegningerne ligger i `tegninger/plan/`, og koblingen til bygning og etage står i `SP2_PLANS` i `data.js`.
- Tegningerne er konverteret til PNG i 250 dpi, så de er skarpe ved zoom.
- `data.js` kobler bolig, opgang, etage og tegningsside.

## Nyt i 2.0
- **Forsiden**: materialeliste, opgaver, orienteringsplan over byggepladsen (tryk på en bygning for at gå til opgangen – ved flere opgange vælger man, fx K1-A/K1-B; tryk ved siden af for at åbne hele planen), derefter bygningerne, **🗺️ Terræn, diagrammer og fællesrum** og nederst *Hent alle tegninger*.
- **Terræn, diagrammer og fællesrum**: orienteringsplan, kabelskabe i terræn, hovedledningsdiagram, beskyttende hovedudligning og fællesarealer.
- **Fællesrum** ligger også på de etager, hvor de er (👥), fx miljøstationen i F3-A stue.
- **Boligsiden** viser selve boligtegningen; tryk på den for stor visning med zoom og måling.
- **Måling**: et tryk sætter altid et nyt punkt (også tæt på et andet). Hold fingeren stille på et punkt i et halvt sekund for at flytte det – det hopper op over fingeren. *Fang streg* tager altid den streg, der er nærmest sigtet.

## Nyt i 2.3
- Appen hedder nu **Stejlepladsen etape 2** (på hjemmeskærmen "Stejlepladsen"). Ikonet beholder det gamle navn, til appen lægges på hjemmeskærmen igen.
- **Menu → 📦 Dalux-pakke**: sæt flueben ved opgangene og hent en zip-fil med én mappe pr. opgang og én undermappe pr. bolig. Billederne hedder fx `K1-B_1-th_1.jpg`, og hver bolig har en tekstfil med registreringerne. Kun registreringer med afvigelse eller billeder kommer med. Øverst ligger `oversigt.csv` til Excel.
- **Ekstraarbejde** på forsiden: alle kan oprette en seddel (nummereres automatisk fra 1) med overskrift, dato/uge, beskrivelse, materialer, timer og billeder. Den der oprettede og Morten kan rette; kun Morten kan slette. *Kopiér som tekst* giver en færdig tekst til mail. **Oversigt (timer)** er låst med en ekstra kode, som Morten vælger første gang; herfra kan den hentes som Excel (CSV).

## Nyt i 2.5 – styr på hvad der er i Dalux
- Når Dalux-pakken er hentet, spørger appen, om registreringerne skal markeres som oprettet i Dalux. Markerede kommer ikke med i næste pakke (medmindre man sætter flueben ved *Medtag også dem, der allerede er oprettet i Dalux*).
- På boligsiden står **✓ I Dalux** eller **⚠ Ændret efter Dalux** (indholdet er rettet, efter den blev oprettet – ret manglen i Dalux). Inde i registreringen kan markeringen fjernes eller sættes igen.

## Nyt i 2.6
- **Deadline på opgaver**: inde i opgaven trykkes *Vælg deadline* – en enkel kalender med pile mellem månederne. I listen står kun deadline i den grå linje (orange når den er tæt på, rød når den er overskredet). Hvem der oprettede opgaven, ses inde i opgaven.
- **Opgaver som ekstraarbejde**: sæt flueben ved *Det er ekstraarbejde* inde i opgaven. Når den krydses af – også direkte i listen – spørger appen "Hvor mange timer har du brugt?" og opretter selv en ekstraarbejdsseddel. Ellers kan man trykke *Overfør til ekstraarbejde*. Opgaven bliver stående, og sedlen lever videre, selvom opgaven slettes.
- PDF for ekstraarbejde: dato, timer og hvem står på én linje i et bredt felt, fx "28.11.2026 – 2 timer – Tommy".
