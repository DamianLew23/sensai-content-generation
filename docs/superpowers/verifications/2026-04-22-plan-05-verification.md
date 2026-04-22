# Plan 05 — Verification

**Data:** 2026-04-22
**Smoke script:** `scripts/smoke-plan-05.ts`
**Templatka użyta:** „Blog SEO — deep research" v1
**Run ID:** `12464e5f-68d1-4cf0-a9be-cd499179437f`

## Wynik smoke testu

- [x] `deepResearch` step completed
- [x] `output.content.length`: **19215** znaków
- [x] `output.sources.length`: **45** źródeł
- [x] `tool_calls.cost_usd` (for effort=deep): **$0.15** (provisional, z tabeli env)
- [x] `tool_calls.latency_ms`: **76478** ms (~76s)
- [x] `tool_calls.from_cache`: `false` (miss, live call)
- [x] `tool_calls.error`: `null` (sukces)
- [ ] Response headers contain `X-Cost-*`: **nie sprawdzono** (do fold-inu — wymaga tymczasowego `console.log` w `YoucomClient.research`)

### Input testowy

```
topic: "How to learn Rust programming for backend developers"
mainKeyword: "learn rust programming"
intent: "informational"
contentType: "blog-seo"
research_effort: "deep" (default)
```

### Output wysokopoziomowo

- Markdown z cytatami inline `[1]`, `[2]`, ...
- 45 źródeł z URL + (opcjonalny) title + snippets
- Zawartość merytoryczna: fakty, recent developments, expert perspectives (zgodnie z promptem)

## Aktualizacja pricing

- Faktyczny koszt `deep` z portalu you.com: **TODO — zweryfikować w https://you.com/platform po zalogowaniu**
- Zaktualizowano `.env.example`: NO (na razie provisional values, aktualizacja po weryfikacji w portalu)
- Zaktualizowano domyślne wartości w `apps/api/src/config/env.ts`: NO (j.w.)

**Akcja:** zalogować się na https://you.com/platform, sprawdzić usage/billing po 2026-04-22 11:47 UTC i porównać z `YOUCOM_COST_DEEP=0.15`. Jeśli rozbieżność > 20%, update defaults.

## Follow-upy (do kolejnych planów)

- [ ] Jeśli `X-Cost-*` headery istnieją — fold-in: czytaj koszt z response zamiast tabeli env
- [ ] Jakość outputu (1-5): **TODO — ręczna ocena po inspekcji treści briefingu**
- [ ] Czy deep research dostarczył wiedzę, której SERP+scrape same nie dawały?: **TODO — po uruchomieniu pełnego pipeline'u (deepResearch → SERP → scrape → brief) i porównaniu z runem bez deepResearch**
- [ ] Pre-insert `tool_call` z statusem `pending` dla lepszej idempotencji pod timeouty (znany kompromis z decyzji 8A w specu) — fold-in jeśli problem wystąpi
- [ ] Brak `brief.handler.test.ts` regression test (flagged przez final reviewer jako minor) — dodać gdy pokrycie BriefHandlera stanie się istotne

## Notatki

- Latency `76s` dla `deep` jest zdecydowanie w granicach 300s timeoutu; bufor ma sens również dla `exhaustive`, który może trwać dłużej
- Smoke script wykrył dublujący się wpis `API_BEARER_TOKEN` w `apps/api/.env` (user ma dwa przypisania) — grep w smoke był naprawiony przez `tail -1` żeby wziąć ostatni; warto uporządkować `.env` lokalny
- API lata na porcie `:8000` (z ENV `PORT=8000` w `apps/api/.env`), nie domyślnym `:4000` — smoke dostaje `API_BASE_URL=http://localhost:8000`
- Smoke zatrzymał się na kroku `deepResearch` (completed) — nie ruszył dalej przez pipeline bo następny krok `scrape` ma `auto:false` (checkpoint wyboru URL-i z Plan 03), więc run przechodzi w `awaiting_approval` po SERP
