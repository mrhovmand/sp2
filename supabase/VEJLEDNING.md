# Opsætning af deling (Supabase) – SP2 Dåsekontrol

Det tager ca. 10 minutter og er nemmest fra computeren. Du skal kun gøre det én gang.

1. **Opret konto:** Gå til supabase.com, tryk **Start your project**, og vælg **Continue with GitHub** (du har allerede en GitHub-konto).
2. **Opret projekt:** Tryk **New project**.
   - Name: `sp2`
   - Database password: tryk **Generate a password** og gem den et sikkert sted (den skal ikke bruges i appen).
   - Region: **Central EU (Frankfurt)**
   - Plan: **Free**. Tryk **Create new project**, og vent 1–2 minutter.
3. **Opret tabeller:** Venstre menu → **SQL Editor** → **New query**. Åbn
   https://raw.githubusercontent.com/mrhovmand/sp2/main/supabase/opsaetning.sql,
   kopiér alt, sæt det ind og tryk **Run**. Der skal stå "Success. No rows returned".
4. **Luk for nye brugere:** Venstre menu → **Authentication** → **Sign In / Providers**. Slå **Allow new users to sign up** fra, og tryk **Save**.
5. **Opret den fælles bruger:** **Authentication** → **Users** → **Add user** → **Create new user**.
   - Email: `team@sp2-daasekontrol.dk` (præcis sådan – der sendes ingen mail)
   - Password: **den fælles kode** I vil bruge (mindst 6 tegn, fx et ord og et tal)
   - Sæt flueben i **Auto Confirm User** → **Create user**.
6. **Send to værdier til Claude:**
   - **Project URL** (ser ud som `https://abcdefgh.supabase.co`) – findes under **Project Settings → Data API** eller via **Connect** øverst.
   - **Publishable key** (starter med `sb_publishable_`) – findes under **Project Settings → API Keys**. Har projektet kun den gamle slags, så brug **anon public**.
   - Send **aldrig** "secret"/"service_role"-nøglen eller database-adgangskoden.

Den fælles kode skal du ikke sende til Claude – den skriver I selv i appen.

## Godt at vide
- **Skift kode:** Authentication → Users → klik på brugeren → skift password. Herefter skal alle skrive den nye kode.
- **Pause:** Gratis projekter sættes på pause efter en uges inaktivitet. Så længe I bruger appen, sker det ikke. Sker det alligevel, så log ind på supabase.com og tryk **Restore**. Appen virker imens videre på telefonerne og deler, når projektet kører igen.
- **Plads:** Gratisplanen har 1 GB til billeder. Appens billeder fylder typisk 150–350 kB.
