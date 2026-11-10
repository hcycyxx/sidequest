/**
 * WorkBuddy promotion & tier badges — the upstream's own "this model is on
 * offer" annotation, parsed and resolved against the wall clock.
 *
 * WHY A SEPARATE MODULE, AND WHY IT COSTS NO REQUEST. The upstream ships the
 * badges inside the SAME `/v3/config` document that already carries the model
 * roster: `data.modelPromotions` and `data.modelTiers` sit beside
 * `data.models` (observed on the global feed, 2026-10-21). The plugin already
 * reads that document for the roster, so drawing a promotion badge adds ZERO
 * upstream traffic — it only adds a parser, because the document is not a
 * clean list of promotions: the same `modelPromotions` array also carries
 * NON-promotion entries (`hy-image-3.5`, `kling-video-v3` — entries with
 * `tags` / `videoGeneration` and no `modelIds` and no `badge`). Those must be
 * dropped, not rendered.
 *
 * WHY THE RESOLUTION LIVES HERE AND NOT IN THE FETCHER. A badge is a function
 * of the clock, not of the fetch: the upstream's windows are wall-clock
 * windows in a named zone (`schedule.daily`, e.g. `23:00`–`7:50` in
 * `Asia/Shanghai`) and absolute windows (`schedule.validFrom` /
 * `schedule.validUntil`). Picking the badge once, at parse time, FREEZES it —
 * a badge read at 22:59 would still claim "night discount" at 08:00 the next
 * morning. So the parser keeps EVERY candidate and the RENDERER asks for the
 * one that holds at the moment it draws. The card re-renders at least once a
 * minute while it is open (it polls the usage route), so a window edge is
 * picked up within a minute without a second timer.
 *
 * THE SHAPES THIS PARSER ACCEPTS (all observed on the global feed's
 * `/v3/config`, 2026-10-21 — the CN feed publishes the same two arrays, with
 * Chinese labels and the extra fields listed at the end of this header):
 *
 *   {
 *     id: 'hy3-free-trial-202608',
 *     kind: 'discount',
 *     enabled: true,
 *     priority: 200,
 *     modelIds: ['hy3'],
 *     badge: { label: 'Free now', color: '#FF0000', display: 'activeOnly' },
 *     discount: { discountedCredits: '0x', displayMode: 'replace', factor: 0 },
 *     hover: { textZh: 'Aug 6 – Oct 31: Free daily use with unlimited credits.' },
 *     schedule: {
 *       timezone: 'Asia/Shanghai',
 *       validFrom: '2026-07-06T00:00:00+08:00',
 *       validUntil: '2026-11-01T00:00:00+08:00',
 *     },
 *   }
 *
 * and the tier shape (`data.modelTiers`), which has the same `badge` /
 * `modelIds` / `priority` core, no `schedule`, and a `requiredUserType`:
 *
 *   {
 *     id: 'gpt-pro-only',
 *     badge: { label: 'Pro Only', labelEn: 'Pro Only', color: '#009273' },
 *     hover: { textEn: 'Exclusive to Pro subscribers.', textZh: '模型仅面向 Pro 用户开放。' },
 *     modelIds: ['gpt-6-astra', …],
 *     priority: 200,
 *     requiredUserType: 'standard',
 *     tier: 'standard',
 *   }
 *
 * THE CN FEED IS THE SAME FEED, READ AS THE APP READS IT. The CN gateway
 * publishes `modelPromotions` (8 entries, measured 2026-10-21) and
 * `modelTiers` (1 entry) in the SAME `/v3/config` document — with Chinese
 * labels (`夜间折扣` / `限时免费` / `夜间免费` / `独家限免` / `限时折扣` /
 * `订阅优先`), a `schedule.daily` night window, a base64 `badge.icon` and an
 * optional `badge.display: 'activeOnly'`. Those richer shapes are exactly what
 * this parser accepts below.
 *
 * They are visible only to the APP's product identity: the CLI channel's
 * answer to the same URL publishes neither array, because it is a strict
 * subset of the app channel's document. The plugin therefore reads the
 * product configuration as the app does (`PRODUCT_UA` in `src/upstream.ts`) —
 * which is why a CN account sees the same badges here as in the WorkBuddy
 * app, without a second upstream request.
 *
 * @module dsh-connect-workbuddy/promo
 */

/** How the upstream wants the badge to appear. */
































/** One daily window, as wall-clock times in `schedule.timezone`. */












/** When a promotion runs. */
























/**
 * The upstream's own discounted price for a promotion, when it publishes one.
 *
 * This is what makes a "night discount" badge more than decoration: the badge
 * says the model is on offer, and this field says HOW MUCH less it costs during
 * the offer. The plugin used to drop it, so a model could wear a "night
 * discount" badge while still showing its full price — the card and the
 * composer readout then disagreed with what the user was actually charged.
 *
 * Shapes observed on the CN feed (2026-10-21, `docs/PROMO_BADGE.md`):
 *
 *   { discountedCredits: "0x", displayMode: "replace", factor: 0 }
 *
 * `discountedCredits` is a STRING with the unit glued on ("0x", "0.06x"), not
 * a number: `Number("0.06x")` is `NaN`, so it must be parsed, not coerced.
 * `factor` is a ratio the upstream sometimes supplies (0.545 = "55% of the
 * normal price"); it is used only when `discountedCredits` cannot be read, and
 * the two disagreeing means the string wins — it is the figure the user will
 * be charged.
 */



































/** The upstream's explanatory copy for the badge. */







/** One upstream promotion or tier, resolved into the shape this plugin uses. */
























/** A record-ish value, or undefined for anything else. */
function record(value         )                                      {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : undefined
}

/** A trimmed non-empty string, or undefined. */
function text(value         )                     {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * `'HH:mm'` → minutes since midnight, or undefined for anything else.
 *
 * `24:00` is accepted and means exactly 1440 — the END of a day. The upstream
 * writes "all day" as `0:00`–`23:59` today, which leaves a one-minute hole
 * between 23:59 and midnight where a standing campaign reads as not running.
 * Accepting `24:00` lets such a window be expressed (and lets a future upstream
 * fix it) without that hole; as a START it is rejected, because a day that
 * begins at 24:00 is the next day and that is a different statement.
 *
 * Any other malformed value is left to the caller to drop — a wrong window
 * would hide a live promotion, and guessing is not this parser's job.
 *
 * THE TYPE GUARD IS LOAD-BEARING, NOT DEFENSIVE DECORATION (issue #139). The
 * upstream feeds a string, and `parseDaily`'s own `text()` would already have
 * dropped a number — but the SAVED `lastCatalog` is a second, independent
 * entrance to this function, and nothing on that path type-checks. A promotion
 * object rides through `toPersistedWorkBuddyModel` untouched (the settings
 * schema keeps unknown keys), survives `resolveRoster`, and reaches the
 * renderer's `selectPromoBadge`. A numeric `start` there used to throw
 * `value.trim is not a function` DURING RENDER, which the host's slot error
 * boundary turned into a blank configuration section — the page looked as if
 * the plugin had never installed.
 *
 * Refusing a non-string is the same answer the parser already gives every
 * other unreadable shape: drop the window rather than guess. Interpreting a
 * number as "minutes since midnight" was considered and rejected — `1380`
 * happens to mean 23:00, but no upstream has ever published that shape, and
 * inventing hours for a promotion the upstream never described is exactly the
 * overstatement this module exists to prevent.
 */
function minutesOfClock(value         )                     {
  if (typeof value !== 'string') return undefined
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (match === null) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return undefined
  if (minutes > 59) return undefined
  if (hours > 24) return undefined
  if (hours === 24) return minutes === 0 ? 24 * 60 : undefined
  return hours * 60 + minutes
}

/** An ISO-8601 instant → epoch milliseconds. Numbers are refused on purpose. */
function parseInstant(value         )                     {
  const raw = text(value)
  if (raw === undefined) return undefined
  const ms = Date.parse(raw)
  return Number.isNaN(ms) ? undefined : ms
}

/** The upstream's `modelIds` → the model's ids, de-duplicated. */
function parseModelIds(value         )                       {
  if (!Array.isArray(value)) return undefined
  const ids           = []
  for (const entry of value) {
    const id = text(entry)
    if (id !== undefined && !ids.includes(id)) ids.push(id)
  }
  return ids.length === 0 ? undefined : ids
}

/** The upstream's `badge` → this plugin's badge shape. */
function parseBadge(value         )                                  {
  const raw = record(value)
  if (raw === undefined) return undefined
  // The label is REQUIRED: an entry without one has nothing to draw, and the
  // upstream's `modelPromotions` array contains entries (image and video
  // models) that are not promotions at all. Dropping them here is what keeps
  // them out of the card.
  const label = text(raw['label']) ?? text(raw['labelEn']) ?? text(raw['shortLabel']) ?? text(raw['shortLabelEn'])
  if (label === undefined) return undefined
  const labelEn = text(raw['labelEn'])
  const shortLabel = text(raw['shortLabel'])
  const shortLabelEn = text(raw['shortLabelEn'])
  const color = text(raw['color'])
  const display = raw['display'] === 'activeOnly' ? 'activeOnly'          : undefined
  return {
    label,
    ...labelEn === undefined ? {} : { labelEn },
    ...shortLabel === undefined ? {} : { shortLabel },
    ...shortLabelEn === undefined ? {} : { shortLabelEn },
    ...color === undefined ? {} : { color },
    ...display === undefined ? {} : { display },
  }
}

/** The upstream's `hover` → this plugin's copy shape. */
function parseHover(value         )                                  {
  const raw = record(value)
  if (raw === undefined) return undefined
  const textZh = text(raw['textZh'])
  const textEn = text(raw['textEn'])
  if (textZh === undefined && textEn === undefined) return undefined
  return {
    ...textZh === undefined ? {} : { textZh },
    ...textEn === undefined ? {} : { textEn },
  }
}

/**
 * What an unreadable endpoint actually was, for the one diagnostic line below.
 *
 * Deliberately coarse: a NUMBER is the shape a future upstream format change
 * would plausibly take (minutes since midnight), so it is named separately
 * from "some other non-string". Reporting the typeof is enough to tell the two
 * apart in a log without ever echoing upstream content into the console.
 */
function shapeOf(value         )         {
  if (typeof value === 'number') return 'number'
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/**
 * The upstream's `schedule.daily` → the windows this plugin can evaluate.
 *
 * `label` names the entry for the diagnostic line and is passed in rather than
 * read from `value`: the entry id lives one level up, in `parsePromo`.
 */
function parseDaily(value         , label        )                                     {
  if (!Array.isArray(value)) return undefined
  const windows                         = []
  for (const entry of value) {
    const raw = record(entry)
    if (raw === undefined) continue
    const start = text(raw['start'])
    const end = text(raw['end'])
    // A window whose endpoints are not clock times cannot be evaluated, so it
    // is dropped rather than guessed at. Dropping the LAST one, however, must
    // not quietly turn "night only" into "always" — `parseSchedule` records
    // that the list was published-but-unusable (see `dailyUnusable`).
    //
    // THE LOG LIVES HERE, ON THE HOST SIDE, ON PURPOSE. This function runs
    // once per upstream document (see `withPromos`), not once per render, so a
    // line per dropped window cannot become a per-minute console flood. The
    // CLIENT evaluates the same windows on every poll (60s) via
    // `withinDailyWindows`; logging there would print one line per model per
    // minute. Issue #139 is what happens when this rejection is silent: the
    // badge simply stops appearing and nothing anywhere says why.
    if (start === undefined || end === undefined || minutesOfClock(start) === undefined || minutesOfClock(end) === undefined) {
      try {
        console.warn(
          `[dsh-connect-workbuddy] promotion "${label}": dropped an unreadable daily window `
          + `(start: ${shapeOf(raw['start'])}, end: ${shapeOf(raw['end'])}); `
          + 'the upstream may have changed the time format',
        )
      } catch { /* a host without console must still parse */ }
      continue
    }
    windows.push({ start, end })
  }
  return windows.length === 0 ? undefined : windows
}

/**
 * Read a multiplier out of the upstream's `discountedCredits` string.
 *
 * The upstream writes the unit INTO the value ("0x", "0.06x", "0.06"), so the
 * trailing `x` is stripped rather than handed to `Number()`. A value that does
 * not become a finite non-negative number is refused — a wrong price shown to
 * the user is worse than the normal price, because the normal price is at least
 * true.
 */
function multiplierOfCredits(value         )                     {
  const raw = text(value)
  if (raw === undefined) return undefined
  const stripped = raw.replace(/x$/i, '').trim()
  if (stripped === '') return undefined
  const parsed = Number(stripped)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

/** The upstream's `discount` → this plugin's discount shape. */
function parseDiscount(value         )                                     {
  const raw = record(value)
  if (raw === undefined) return undefined
  const fromString = multiplierOfCredits(raw['discountedCredits'])
  const fromFactor = typeof raw['factor'] === 'number' && Number.isFinite(raw['factor']) && raw['factor'] >= 0
    ? raw['factor']
    : undefined
  // The string wins: it is the figure the user is charged. `factor` only fills
  // in when the string is absent or unreadable.
  const multiplier = fromString ?? fromFactor
  const displayMode = raw['displayMode'] === 'replace' || raw['displayMode'] === 'strikethrough'
    ? raw['displayMode']
    : undefined
  if (multiplier === undefined && displayMode === undefined) return undefined
  return {
    ...multiplier === undefined ? {} : { multiplier },
    ...displayMode === undefined ? {} : { displayMode },
  }
}

/** The upstream's `schedule` → this plugin's schedule shape. */
function parseSchedule(value         , label        )                                     {
  const raw = record(value)
  if (raw === undefined) return undefined
  const timezone = text(raw['timezone'])
  const validFrom = parseInstant(raw['validFrom'])
  const validUntil = parseInstant(raw['validUntil'])
  const daily = parseDaily(raw['daily'], label)
  // The upstream DID publish `daily` (it is an array with at least one entry)
  // and yet nothing survived parsing. That is a parse failure, not "no hours":
  // report it so the promotion is treated as never-running rather than as a
  // 24-hour campaign. An EMPTY array is the upstream saying nothing, which is
  // indistinguishable from an absent one and stays "always".
  const dailyUnusable = daily === undefined
    && Array.isArray(raw['daily'])
    && raw['daily'].length > 0
  if (timezone === undefined && validFrom === undefined && validUntil === undefined && daily === undefined && !dailyUnusable) return undefined
  return {
    ...timezone === undefined ? {} : { timezone },
    ...validFrom === undefined ? {} : { validFrom },
    ...validUntil === undefined ? {} : { validUntil },
    ...daily === undefined ? {} : { daily },
    ...dailyUnusable ? { dailyUnusable: true          } : {},
  }
}

/** One upstream entry → this plugin's promo shape, or undefined if it is not one. */
function parsePromo(value         , source                      )                             {
  const raw = record(value)
  if (raw === undefined) return undefined
  // An explicitly disabled entry is not a promotion. Absent `enabled` means
  // enabled — the upstream only writes the field when it turns one off.
  if (raw['enabled'] === false) return undefined
  const modelIds = parseModelIds(raw['modelIds'])
  if (modelIds === undefined) return undefined
  const badge = parseBadge(raw['badge'])
  if (badge === undefined) return undefined
  const hover = parseHover(raw['hover'])
  // The id is resolved BEFORE the schedule so that a dropped window can name
  // the entry it belonged to. `parseSchedule` never reads the id; it only
  // forwards it to the diagnostic line.
  const id = text(raw['id']) ?? `${source}:${modelIds.join(',')}`
  const schedule = parseSchedule(raw['schedule'], id)
  const discount = parseDiscount(raw['discount'])
  const priority = typeof raw['priority'] === 'number' && Number.isFinite(raw['priority']) ? raw['priority'] : 0
  return {
    id,
    source,
    modelIds,
    badge,
    ...hover === undefined ? {} : { hover },
    ...schedule === undefined ? {} : { schedule },
    ...discount === undefined ? {} : { discount },
    priority,
  }
}

/**
 * Parse the upstream's promotion and tier lists.
 *
 * Both lists are read from the SAME document the roster comes from, so this
 * never costs a request. Entries that are not promotions — no `modelIds`, no
 * `badge`, or `enabled: false` — are dropped here rather than downstream, so
 * that everything downstream can assume a promo is drawable.
 *
 * The promotions come first, so that a TIE on `priority` is broken in the
 * promotions' favour: a price badge ("Free now") is more actionable to a user
 * than an access-tier badge ("Pro Only"), and the upstream numbers them
 * equally (both 200 on the observed feed).
 */
export function parseWorkBuddyPromos(rawPromotions         , rawTiers         )                   {
  const promos                   = []
  for (const entry of Array.isArray(rawPromotions) ? rawPromotions : []) {
    const promo = parsePromo(entry, 'promotion')
    if (promo !== undefined) promos.push(promo)
  }
  for (const entry of Array.isArray(rawTiers) ? rawTiers : []) {
    const tier = parsePromo(entry, 'tier')
    if (tier !== undefined) promos.push(tier)
  }
  return promos
}

/**
 * Attach the promotions that name each model.
 *
 * The result is UNRESOLVED on purpose: every candidate that names the model
 * rides along, so the badge can be chosen at render time against the clock
 * (see {@link selectPromoBadge}). Resolving here would freeze the answer at
 * fetch time — the defect that makes a "night discount" badge keep claiming
 * the night after the night is over.
 */
export function attachPromos                          (
  models              ,
  promos                           ,
)                                                 {
  if (promos.length === 0) return [...models]
  const byModel = new Map                          ()
  for (const promo of promos) {
    for (const modelId of promo.modelIds) {
      const list = byModel.get(modelId)
      if (list === undefined) byModel.set(modelId, [promo])
      else list.push(promo)
    }
  }
  return models.map(model => {
    const list = byModel.get(model.id)
    if (list === undefined) return model
    // Highest priority first, so the renderer can take the first match.
    return { ...model, promos: [...list].sort((a, b) => b.priority - a.priority) }
  })
}

/**
 * Minutes since local midnight in `timeZone` at `nowMs`.
 *
 * `Intl` does the zone maths, because the upstream's windows are written in
 * the zone IT names (Asia/Shanghai for the CN feed) and the user's own clock
 * is not necessarily in that zone. An unusable zone falls back to UTC rather
 * than throwing: a badge that cannot be placed is a missing badge, not a
 * broken card.
 */
function zonedMinutes(nowMs        , timeZone                    )         {
  const zone = timeZone ?? 'UTC'
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(nowMs))
    const hour = Number(parts.find(part => part.type === 'hour')?.value ?? '0')
    const minute = Number(parts.find(part => part.type === 'minute')?.value ?? '0')
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0
    return hour * 60 + minute
  } catch {
    return 0
  }
}

/** Whether `nowMinutes` falls inside one of the daily windows. */
function withinDailyWindows(windows                                 , nowMinutes        )          {
  return windows.some(window => {
    const start = minutesOfClock(window.start)
    const end = minutesOfClock(window.end)
    if (start === undefined || end === undefined) return false
    // Equal endpoints are a 24-HOUR window (`[X:00, X:00+24h)`), not an empty
    // one: the end is exclusive and the start inclusive, so a window that
    // begins and ends at the same clock time covers the whole day. This is the
    // one place where "start inclusive, end exclusive" cannot be read as an
    // empty interval; docs/PROMO_BADGE.md states the same rule.
    if (start === end) return true
    if (end > start) return nowMinutes >= start && nowMinutes < end
    // Crossing midnight: `23:00`–`7:50` is the observed CN night window.
    return nowMinutes >= start || nowMinutes < end
  })
}

/**
 * Whether the promotion's ABSOLUTE window holds now.
 *
 * The absolute window (`validFrom` / `validUntil`) is the promotion's own
 * lifetime. It gates the badge on its own: a promotion whose lifetime has
 * ended must not keep advertising itself, whatever its daily hours say.
 */
export function promoWithinAbsoluteWindow(promo                , nowMs        )          {
  const schedule = promo.schedule
  if (schedule === undefined) return true
  if (schedule.validFrom !== undefined && nowMs < schedule.validFrom) return false
  if (schedule.validUntil !== undefined && nowMs >= schedule.validUntil) return false
  return true
}

/**
 * Whether the promotion's DAILY window holds now.
 *
 * The daily window is the discount's own hours — it is what makes a
 * promotion a "night discount" — and a promotion without one is running
 * whenever its absolute window holds.
 *
 * A schedule whose `daily` was published but could not be evaluated
 * ({@link WorkBuddyPromoSchedule.dailyUnusable}) is NOT running: the upstream
 * did say the campaign has hours, we just cannot read them, and assuming
 * "always" is the one guess that overstates the offer.
 */
export function promoWithinDailyWindow(promo                , nowMs        )          {
  const schedule = promo.schedule
  if (schedule === undefined) return true
  if (schedule.dailyUnusable === true) return false
  if (schedule.daily === undefined || schedule.daily.length === 0) return true
  return withinDailyWindows(schedule.daily, zonedMinutes(nowMs, schedule.timezone))
}

/**
 * Whether the promotion is running right now: its absolute window AND its
 * daily hours both hold.
 */
export function promoActiveAt(promo                , nowMs        )          {
  return promoWithinAbsoluteWindow(promo, nowMs) && promoWithinDailyWindow(promo, nowMs)
}

/**
 * Whether the promotion carries ANY temporal statement of its own.
 *
 * A tier badge ("Pro Only") has no `schedule` at all: it describes the model
 * unconditionally, so `promoActiveAt` is trivially true for it. That is
 * correct on its own, but it made such a badge eligible for step 1, where it
 * could shadow a lower-priority campaign whose window really is open.
 * "Running" should mean "this entry says it runs now", and an entry with no
 * schedule never does — it only ever "stands". Entries WITH a schedule (a
 * lifetime, hours, or both) are the ones that can be running.
 */
function hasSchedule(promo                )          {
  return promo.schedule !== undefined
}

/**
 * The badge to draw for a model right now, or undefined when there is none.
 *
 * The order of the two answers is the whole point:
 *
 * 1. A promotion RUNNING NOW wins — highest `priority` first. "Running" means
 *    its absolute window AND its daily hours both hold.
 * 2. Otherwise a STANDING badge (one the upstream did not mark `activeOnly`)
 *    describes the model for as long as the promotion itself lasts. It is
 *    offered only inside the promotion's absolute window, so an expired
 *    promotion stops advertising itself even though its badge was standing.
 *
 * TWO RULES KEEP STEP 2 FROM STATING SOMETHING THE UPSTREAM DID NOT:
 *
 * a. An entry that publishes daily hours may stand outside them (that is what
 *    "the hours govern the discount, not the badge" means), but an entry whose
 *    hours could not be parsed cannot stand at all — see `dailyUnusable`.
 * b. A standing entry with NO schedule at all must not outrank a promotion
 *    that is genuinely running. `promoActiveAt` returns true for a
 *    schedule-less tier, which is correct on its own, but it made a
 *    high-priority tier shadow a lower-priority campaign whose window really
 *    is open. Step 1 is therefore restricted to entries that carry a
 *    `schedule`; the schedule-less badges compete only in step 2, where they
 *    belong.
 *
 * The upstream's own `priority` orders entries. Ties are broken toward the
 * promotion: a price badge ("Free now") is more actionable than an access-tier
 * badge ("Pro Only"), and the upstream numbers them equally.
 *
 * Only ONE badge is drawn per model: a model row is one line wide, and two
 * badges would push the model name and the image/think checkboxes out of it.
 */
/**
 * The multiplier to DRAW for a model right now: the promotion's discounted
 * price when a discount is running, otherwise the catalog's own figure.
 *
 * WHY THIS IS SEPARATE FROM THE BADGE. The badge answers "is this model on
 * offer"; this answers "at what price". They usually agree, but not always —
 * and when they disagreed the user saw a "night discount" badge next to the
 * full price (issue #120). The discount lives in the SAME entry that carries
 * the badge, so the two can be answered from one document and one clock.
 *
 * TWO RULES, both about not overstating an offer:
 *
 *   1. Only a promotion that is RUNNING at `nowMs` discounts the price. A
 *      standing badge (the daytime half of a night-discount pair) is drawn
 *      outside the discount hours, and it must NOT discount them — that is
 *      exactly the bug this function exists to prevent. The badge admits
 *      standing entries through `selectPromoBadge`; the price does not.
 *   2. `displayMode` must say `'replace'`, and the value must parse. An entry
 *      with a badge but no readable discount changes nothing, so the catalog's
 *      figure stands.
 *
 * The result is `undefined` when the catalog figure should be used unchanged —
 * the caller then keeps whatever it already draws. Returning the base value
 * from here would make a caller that has no base figure (a model whose
 * `credits` was absent) invent one.
 */
export function selectPromoMultiplier(
  promos                                       ,
  nowMs        ,
)                     {
  if (promos === undefined || promos.length === 0) return undefined
  const sorted = [...promos].sort((a, b) =>
    b.priority - a.priority
    || (a.source === b.source ? 0 : a.source === 'promotion' ? -1 : 1))
  for (const promo of sorted) {
    const discount = promo.discount
    if (discount === undefined || discount.multiplier === undefined) continue
    // Both observed modes mean "the discounted figure is the price" (see
    // `WorkBuddyPromoDiscount.displayMode`). An unlabelled discount is skipped:
    // its absence says nothing about how to read the figure.
    if (discount.displayMode !== 'replace' && discount.displayMode !== 'strikethrough') continue
    // Rule 1: the DISCOUNT runs on the daily window, so a standing badge
    // outside it must not discount anything.
    if (!promoActiveAt(promo, nowMs)) continue
    return discount.multiplier
  }
  return undefined
}

export function selectPromoBadge(
  promos                                       ,
  nowMs        ,
)                             {
  if (promos === undefined || promos.length === 0) return undefined
  const sorted = [...promos].sort((a, b) =>
    b.priority - a.priority
    || (a.source === b.source ? 0 : a.source === 'promotion' ? -1 : 1))
  const running = sorted.find(promo => hasSchedule(promo) && promoActiveAt(promo, nowMs))
  if (running !== undefined) return running
  return sorted.find(promo =>
    promo.badge.display !== 'activeOnly'
    && promoWithinAbsoluteWindow(promo, nowMs)
    // Hours that could not be parsed never justify a standing badge.
    && promo.schedule?.dailyUnusable !== true)
}

/**
 * The chip's colour, when the upstream published a usable one.
 *
 * Only a hex colour is accepted: the value reaches an inline style, and the
 * upstream's feed publishes hex (`#009273`, `#FF0000`). Anything else is
 * refused rather than passed through, and the card falls back to its own
 * brand colour.
 */
export function promoBadgeColor(promo                )                     {
  const color = promo.badge.color
  if (color === undefined) return undefined
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : undefined
}

/** The four semantic tones the host's badge field accepts (DSH 0.2.2+). */


/**
 * The host's own badge tone for a promotion, for the 0.2.2+ `model.badge` field.
 *
 * WHY A TONE AND NOT A COLOUR. From 0.2.2 the host's model directory accepts a
 * per-model `badge` (`LlmModelBadge = { text, tone }`) and draws it itself, in
 * the same place and shape as the picker's own labels. `tone` is one of four
 * semantic slots (`neutral | info | success | warning`), NOT an arbitrary
 * colour: the shell paints it from theme tokens so it stays legible in every
 * theme, which an upstream hex value cannot guarantee.
 *
 * The upstream's hex colour is therefore mapped onto the CLOSEST tone rather
 * than passed through. Green — the value every CN promotion here uses for "free
 * for now" — reads as `success`; blues as `info`; amber/red as `warning`;
 * anything else stays `neutral` rather than inventing a meaning.
 *
 * WHY IT LIVES IN THIS MODULE, not in `client/promo-badge.ts` beside the other
 * chip helpers. The consumer that needs it is `src/adapter.ts` — the HOST half,
 * which fills `LlmModelInfo.badge` and cannot import from `src/client/` (that
 * directory is a separate build, and the host bundle never reaches it). This
 * module is the one place both halves already share, and it stays DOM-free so
 * the host can load it. `client/promo-badge.ts` re-exports it for the card.
 *
 * @param promo - The resolved promotion.
 * @returns The host tone to stamp on `model.badge`.
 */
export function promoBadgeTone(promo                )                     {
  const color = promoBadgeColor(promo)
  if (color === undefined) return 'neutral'
  // #RRGGBB only (promoBadgeColor already refuses anything else).
  const hex = color.replace('#', '')
  if (hex.length !== 6) return 'neutral'
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return 'neutral'
  // Green dominates when it is clearly the strongest channel: that is the
  // "免费 / 折扣" green and it must not be read as a warning.
  if (g > r + 24 && g > b + 24) return 'success'
  // Blue: a "members only / tier" badge rather than a price event.
  if (b > r + 24 && b > g + 8) return 'info'
  // Warm: amber and red both mean "read this before choosing".
  if (r > b + 24) return 'warning'
  return 'neutral'
}
