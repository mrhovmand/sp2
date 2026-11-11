# SP2 Dåsekontrol

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
2. Tryk **Del** (firkanten med pil op) og vælg **Føj til hjemmeskærm**. Navnet "SP2 Dåsekontrol" er udfyldt på forhånd.
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
- Etager med en etage- eller kældertegning viser 📐-knapper øverst. I tegningsviseren skifter **Tegninger ▾** mellem boligtegning, etageplan, kælder, oversigtsplan og signaturforklaring. **Hele ark** viser hele arket med signaturer og titelfelt.

## Deling med holdet og materialeliste

- Appen kan dele registreringer, billeder, navne, tagnoter og materialelisten mellem flere telefoner via Supabase (gratis). Opsætning: se `supabase/VEJLEDNING.md`. Derefter udfyldes `config.js` med Project URL og publishable key.
- Hver bruger skriver sit navn og den fælles kode én gang på forsiden. Alt gemmes stadig først på telefonen og deles, når der er dækning.
- Materialelisten ligger øverst på forsiden. Tryk på den for at tilføje, krydse af eller slette linjer.

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
