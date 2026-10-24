# RippleRoute — Phase 1 working starter

A fictional industrial steel supply-chain navigator built in React + TypeScript + Vite. This is an **offline, browser-only demo**. Routes are computed with Dijkstra's algorithm, using the actual edge cost or travel-time weights from `src/network.ts`.

## Run

```bash
npm install
npm run dev
```

Open the Vite URL, normally http://localhost:5173/.

## Demo flow

1. Inspect hubs on the interactive network.
2. Select any intermediate hub and click **Disrupt this hub**. Steelworks and Build Site are protected endpoints.
3. Switch between **Fastest** and **Lowest cost** routes; the displayed paths and values are computed, not hard-coded.
4. Click **Apply this route** and open the **Timeline**.
5. Restore hubs individually in Hub Explorer or Disruption studio, or reset the simulation. Multiple simultaneous disruptions are supported.

## Implemented / not implemented

**Implemented:** graph routing (Dijkstra), clickable map, disruption scenario, alternative cost/time objectives, visual paths with animated flow, reset/pause visual movement, in-memory history, responsive UI.

**Not yet implemented:** backend REST API, multi-shipment capacity reservations, real shipping feeds, authenticated users, persistent database, Gemini or ElevenLabs. All data and locations are fictional examples. Do not present this as live logistics data.

## Next steps

1. Add `backend/` FastAPI and migrate the graph/routing logic from TS or expose an equivalent tested Python implementation.
2. Connect scenario and route calculation endpoints.
3. Use Gemini for grounded explanations of the computed route options.
4. Use ElevenLabs for spoken incident briefings.
5. Store time-series disruptions and routing history in Tiger Data.
6. Deploy and record a backup demo.

## Safety

Never add API secrets to the frontend. Keep credentials server-side.

## Graph semantics and checks

Connections are directed freight legs from `from` to `to`; reverse travel requires its own explicit edge. Disruptions exclude a hub and all incident legs from routing. No feasible route is shown when closures disconnect the shipment.

Run `npm test` for disruption and route regression checks, and `npm run build` for the production build.

## Phase 2 — four views, one simulation

- **Network Universe:** the original directed network map, animated route, keyboard-selectable hubs, floating Hub Explorer and routing controls.
- **Disruption Lab:** all eight intermediate hubs, independent disruption/restoration, computed fastest/cheapest comparisons and route application.
- **Shipment Journeys:** the one existing simulated RR-2048 steel-coil shipment, with computed route stages. Applied routes are marked separately from previews. There is no live shipment tracking or additional shipment data.
- **Decision Replay:** local session events with ISO timestamps, event kinds, disruption snapshots and applied-route snapshots. Reset restores the scenario and records an event; history remains until reload. No Tiger Data connection or persistence is implemented.

`App.tsx` owns navigation and invokes `useSimulation.ts` once. That hook owns hub selection, selected shipment, closures, route objective, computed routes, applied route, animation and events. `NetworkPanels.tsx` extracts the existing map, inspector and route panel; `Views.tsx` composes them into the four views. `network.ts` remains unchanged. Navigation does not remount the shared simulation.

### Manual browser checks

1. Run `npm run dev`. At a laptop viewport (for example 1440×900 and 1366×768), check the floating dock and inspect Central Junction, Allegheny Rail and Union Depot. Use Tab and Enter/Space to select map hubs.
2. Disrupt a hub in Network Universe. Visit Disruption Lab and confirm its status and selected hub persist. Restore it there, then disrupt multiple hubs. Compare both objectives and apply a route.
3. Open Shipment Journeys. Confirm RR-2048 is labeled simulated, the route is marked applied, and the stage totals match the routing panel. Click a stage to inspect that hub on the map.
4. Open Decision Replay. Confirm disruptions, restorations and applied-route details appear with their original scenario snapshots.
5. Disrupt both Allegheny Rail and Inland Yard. Confirm both objectives and the journey show no-route states, and route application is unavailable. Restore either hub to recover connectivity.
6. Select Steelworks and Build Site; confirm both are protected. Reset from the header and confirm original hub selection, fastest objective, open hubs, preview route and animation resume. Confirm the reset is recorded without changing earlier event snapshots.
7. Check at 390px width, keyboard focus visibility, and with OS/browser reduced motion enabled. Confirm particles and transitions are suppressed under reduced motion.

Automated interaction checks exercise component callbacks using a lightweight hook harness; they do not replace browser layout, focus, or animation checks.

## Interactive UX upgrade

The existing graph and Dijkstra implementation are unchanged. No dependencies, API calls, backend, deployment or database were added.

- **Network Universe:** larger keyboard-selectable hubs, coral disruption connections, a sequential demo shipment marker on the current computed route, and visible inspector/routing panels without nested card scrolling. The movement control pauses the marker in place.
- **Disruption Lab:** the same interactive graph, a hub picker, real fastest/cheapest comparison buttons that update the highlighted path, individual restore chips, and before/after values captured at the last disruption/restoration for both objectives. Equal or worse results are shown truthfully. Reset clears the experiment.
- **Shipment Journeys:** one RR-2048 simulated record with a spatial journey, time-weighted demo marker, play/pause/scrub controls, selectable checkpoints, source segment costs/durations and checkpoint details. The demo clock resets when the route changes. Source edges have no transport-mode field, so hub-type transfers are shown with “mode not recorded.” Route Segments includes an explanation of directed consecutive connections.
- **Decision Replay:** chronological event selection, play/pause, previous/next and scrubbing inspect immutable recorded closures and applied routes. New events include the affected hub ID. Events without recorded routes explicitly omit historical path highlighting. Replay selection is separate from the current simulation and cannot mutate it. Prior applied decisions are compared using recorded totals, with a warning that their scenarios can differ.

`usePlayback.ts` owns timer lifecycle, pause/seek/end behavior and reduced-motion preferences. `replay.ts` maps actual segment durations to visual positions. `PlaybackControls.tsx` is shared by the two replays. `ShipmentJourney.tsx` and `IncidentReplay.tsx` keep those experiences independent of the application shell. `interactions.css` refines contrast, responsive sizing, state accents and motion while retaining the original styles.

### Additional manual browser checks

- At 1280×800 and 1440×900, verify full visibility of inspector controls, route metrics and the bottom dock, with no inner card scrollbars. Check mobile stacking at 390px. The page can scroll when content genuinely requires it.
- In the lab, choose Lowest Cost and disrupt Inland Yard. Baseline values should change from 37 hours / $1,570 to 35 hours / $1,770. Restore it, switch objectives, and verify highlighted edges follow the chosen calculation.
- Pause/resume network movement. In Journeys, scrub from 0% to 100%, play/pause, select a checkpoint and inspect it on the network. Verify the marker follows segments and a changed route restarts the demo clock.
- In Decision Replay, select a saved route event, then a disruption event. Confirm only the saved route event highlights a historical route, while both show their recorded closures. Step backward/forward, play to the end, and scrub. Return to the current network and verify it was not changed.
- Test Tab, Enter/Space and arrow keys on buttons, map checkpoints and range inputs. Enable reduced motion: automatic movement must stop, decorative transitions must disappear, and manually requested replay must remain available.

Automated checks cover all 256 closure combinations, existing hub/route behaviors, lab path selection and before/after values, replay callbacks, checkpoint details, empty history, history isolation, duration-weighted position math, timer cleanup, final-event stopping, route-change resets and reduced-motion autoplay suppression. They use a lightweight React hook/component harness rather than a browser. Layout, visual transitions, actual keyboard focus and screen-reader behavior still require browser verification.

## Core product update — endpoint planning, automatic journeys, incident storyboard

The active planning endpoints now belong to shared simulation state. `EndpointPlanner.tsx` appears in Network Universe and Disruption Lab with origin/destination selectors, swap and the RR-2048 demo preset. Identical and unknown pairs are rejected. The graph remains directed and Dijkstra still uses the original edge weights. Active endpoints are protected from new disruptions; a previously closed hub selected as an endpoint stays closed and can be restored. Other closures remain intact across endpoint changes.

RR-2048 remains the immutable Steelworks → Build Site simulated source example. Other endpoint pairs are labeled **Custom plan**, create no shipment record, clear stale applied routes, and update route highlighting, metrics, journey labels and event context. Loading the demo preset changes the planning endpoints without clearing closures; Reset restores the complete baseline.

Journey playback automatically starts when its view opens unless reduced motion is enabled. It follows curved, duration-weighted segments, marks the active segment/next checkpoint, loops, and supports pause/play, replay and scrubbing. Changed endpoints/routes reset its clock. Timers are suspended while the document is hidden or their view is inactive, and listeners/timers clean up on unmount.

Decision Replay now uses a map-free storyboard. Significant local events show narrative moments, recorded before/after route strips and actual totals. Missing historical snapshots are labeled explicitly. Playback appears only with at least two meaningful events. Setup/reset records are compactly grouped, and repeated baseline resets do not create duplicate events. Existing historical records remain intact and independent of current planning state. No external integrations were added.

### Browser checklist for this update

1. In Network Universe, set **Harbor East → Build Site**. Both route objectives should recalculate. Swap them and confirm the reverse direction shows a friendly no-route state; swap back. Confirm identical endpoint options are disabled.
2. Switch to Disruption Lab and verify the endpoints stayed synchronized. Disrupt an intermediate hub, then select that closed hub as an endpoint. Confirm it stays unavailable, can be restored, and becomes protected from new disruptions once reopened.
3. Apply a custom route and open Shipment Journeys. Confirm the heading uses the chosen endpoints, labels it a custom plan, and keeps the saved RR-2048 example labeled Steelworks → Build Site. The marker should start without clicking Play, highlight the current segment/next checkpoint, and follow the curved path.
4. Pause, scrub, replay and click checkpoints. Return to planning, change an endpoint, and reopen Journeys: the demo clock should start at the new route. Load the RR-2048 preset and confirm the demo context returns.
5. Change browser tabs while playing, then return: the demo should resume from the paused hidden-tab position rather than advance in the background. Enable reduced motion and confirm there is no automatic movement.
6. In Decision Replay, check recorded before/after route strips for disruptions and endpoint changes. Apply a route to create a decision event. Select events, step and scrub, then return to the current plan and verify its endpoints and closures did not change.
7. Reload to get initial-only history; Decision Replay should show its helpful start state without playback. Repeated resets at baseline should not produce a row of duplicate cards.
8. Check at 1280×800 and mobile widths: dropdowns, primary actions and the dock must remain usable. Verify keyboard focus and range-input arrow keys.

Automated regression tests now cover endpoint validity, directed no-route pairs, dynamic protection/restoration, synchronized planning UI, unchanged demo metadata, storyboard isolation and trivial history, journey reset/autoplay/looping, reduced motion, inactive-view timers and hidden-document cleanup. Visual browser verification remains manual.

## Real Gemini incident advisor

The local Express backend uses the official `@google/genai` SDK. The default model is `gemini-3.5-flash-lite`, chosen from Google's current [model catalog](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) and [pricing documentation](https://ai.google.dev/gemini-api/docs/pricing) as a cost-efficient Flash model. It requests [structured JSON output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output). Model access and quota depend on your Gemini project.

Use Node.js **22.18 or newer** (Node 24 is recommended). The server directly imports the existing TypeScript graph using Node's native type stripping. The graph data, Dijkstra implementation and simulation state remain unchanged by this integration.

### Start locally

From the repository root:

```bash
npm install
cp server/.env.example server/.env
```

Edit `server/.env` and replace the `GEMINI_API_KEY` placeholder with your actual API key. Never use a `VITE_` variable for this secret. The backend explicitly reads only `server/.env`; it does not take the key from frontend settings or the root `.env`. The file is gitignored; `server/.env.example` is safe to commit.

Start the backend in one terminal:

```bash
npm run server
```

Start the frontend in another terminal:

```bash
npm run dev
```

Open the Vite URL, then Disruption Lab → **Analyze with Gemini**. Vite proxies `/api` to `http://127.0.0.1:3001`, avoiding a cross-origin browser request. Keep PORT at 3001 unless you also change the proxy. `npm run preview` only serves the frontend build; it does not provide the development API proxy. The backend binds to loopback and is intended for local development, not public hosting.

Check backend configuration without making a paid model call:

```bash
curl http://127.0.0.1:3001/api/health
```

`status: "ok"` means the server runs. `advisorConfigured: true` means a non-placeholder key is present, not that Google has accepted it. Restart the server after changing its environment file.

### Request and response contract

`POST /api/ai/analyze` accepts `origin`, `destination`, `scenario` (`RR-2048` or `Custom plan`), the selected routing `objective`, `disruptedHubIds`, `originalRoute` when available, and the actual `options` (`fastest`/`cheapest`, path IDs, edge IDs, hours and cost). The backend reuses Dijkstra to verify both options, verifies the original directed path and totals, supplies canonical hub labels, and rejects inconsistent or forged inputs. No deadline or shipment-priority data exists, so none is manufactured or sent.

Successful responses contain `source: "gemini"`, `model`, and a validated `analysis` with `incidentSummary`, `recommendedRouteId`, `explanation`, `tradeoffs` and `warnings`. Gemini must choose a supplied feasible ID; with no routes it must return null. This no-route analysis still invokes Gemini. A route ID outside the allowed set, malformed output or invalid schema causes an explicit API error. Numeric/currency claims in prose are rejected: exact route facts are rendered from verified graph data. Model instructions prohibit invented paths, deadlines, live infrastructure claims and unspecified facts; qualitative AI explanations still need human review.

The advisor runs only on button clicks, blocks duplicate requests, cancels stale requests when its input changes or the view closes, and hides responses that do not match the current scenario. It never applies a route automatically. Request timeout, provider errors, missing keys and quota failures appear with retry controls. There is **no deterministic fallback represented as Gemini**, no automatic provider retries, and no external search/grounding tools.

Implementation is isolated in `server/` (HTTP app, validation, SDK invocation, server-only config), `src/advisor.ts` (request contract/client) and `src/AIAdvisor.tsx` (lavender panel). Existing product views and interactions are retained.

### Verification

```bash
npm run build
npm test
```

Tests use injected provider responses rather than calling Google. They cover invalid data, forged routes, missing keys, malformed output, invalid recommendations, no-route output, provider failures, HTTP health/errors/success/concurrency, and advisor click/loading/duplicate/error/retry behavior, in addition to the original 17 regressions.

A genuine external Gemini response has **not been verified in this workspace** because no `server/.env` API key is configured. After adding your key, click Analyze and confirm a response with the configured model label; then change a disruption while analyzing, exercise retry, and test a no-route scenario. Never treat provider-injected test responses as live-call verification.

## Multi-shipment capacity-aware planning

**Disruption Lab → Fleet planning → Optimize Fleet** runs a deterministic simulated dispatch cohort. Single shipment planning, its directed Dijkstra routes, animations, route application, custom endpoints and Gemini controls are preserved. Existing single exploration assumes a 35-tonne booking and makes no fleet reservations. Changing its endpoints does not rewrite fleet records.

### Domain and units

`src/fleet.ts` defines the typed `Shipment` model (`id`, `origin`, `destination`, `cargo`, `cargoQuantityTonnes`, `priority`, `deadlineHours`, `status`, `simulated`) and five fictional industrial records. RR-2048 remains the original 35-tonne Steelworks → Build Site example. The other four have distinct endpoint pairs, demands, priorities and deadlines; they are explicitly seeded fictional data, not live freight.

Every directed edge's `capacity` is **tonnes admitted for one shared 48-hour dispatch cohort**, not tonnes/hour, shipment count or truck count. A shipment consumes its full cargo quantity on every segment. Reservations persist for the entire allocation run; shipments cannot split, share a partial booking or reuse capacity later. This is a conservative cohort-booking model, not a time-expanded transport schedule. Route arrival can extend beyond the dispatch window; the window defines dispatch admissions rather than rolling physical throughput. `capacityPolicy` is returned with every comparison.

Existing edge costs remain **fixed USD booking charges per shipment per segment**, independent of tonnage. Route costs add those weights directly; they are not silently multiplied by cargo demand. Travel times are hours from a common simulated dispatch at time zero. Deadlines are relative arrival-hour limits, not fabricated calendar dates. Deadlines and priorities now exist for the seeded fleet and are passed to fleet AI analysis.

Four directed segments have explicit lower capacities (all in tonnes): Central Junction → Union Depot 90, Central Junction → Bluewater Port 90, Bluewater Port → Union Depot 80, Union Depot → Midway Hub 90. Other segments retain 120. All remain large enough for the original single-shipment 35-tonne routing behavior.

### Allocation and comparisons

The ten-hub graph permits enumerating all simple directed paths with cycle protection. `candidateRoutes` returns distinct routes whose every edge can individually carry a shipment. All such candidates are retained, including alternatives beyond the independently fastest and cheapest paths. This exhaustive enumeration is deliberately scoped to the small demo; it is exponential and should be replaced for a much larger network.

`allocateFleet` sorts critical/high/normal priority, earliest deadline, then stable shipment ID. It selects a route fitting **remaining shared capacity**, preferring on-time arrival, then the selected time/cost objective, the other metric, then route ID. It reserves capacity before processing the next shipment. It never assumes independently shortest routes are simultaneously feasible. Late-but-routed shipments get explicit deadline-violation flags. `no-route` means no directed path under closures; `insufficient-capacity` distinguishes physical cargo limits from previously reserved shared capacity. Invalid records and impossible reservations are rejected or reported, never silently overbooked.

This is a **priority/deadline first-fit baseline heuristic, not a global optimum**. `compareFleet` returns the undisrupted capacity-aware baseline, current capacity-aware plan, independent plans, independent overbooked segments, candidate routes, allocation order, failure reasons and per-edge reserved/remaining capacity. It is a reproducible starting point for future optimization comparisons, not a claim of cost savings.

Metric definitions:

- Routed/unallocated counts use actual successful reservations.
- Total route cost sums allocated bookings only, with unallocated freight reported alongside it.
- Estimated delivery time is the latest arrival among allocated shipments; it is null when none are allocated. Total transit hours is the sum of allocated shipment-hours.
- Deadline violations count allocated shipments arriving after their deadlines. Unallocated shipments are separately unresolved, not presumed on-time.
- Disrupted shipment count means undisrupted capacity-aware baseline assignments whose paths touch a currently closed hub, whether rerouted or unallocated afterward.
- Total added cost sums positive increases only for shipments routed in **both** baseline/current plans. Signed matched cost change, matched population and newly unallocated IDs are separate. Lost allocations are never presented as savings.

For the default fastest cohort, independent plans demand **105 tonnes on Central Junction → Union Depot**, exceeding its 90-tonne limit. The heuristic instead routes all five without overbooking: computed total $6,790, last allocated arrival hour 36. These are reproducible demo outputs, not performance or optimality claims.

### Integration and validation

`useSimulation.ts` stores planning mode and signed fleet results. Optimize Fleet records a local immutable event snapshot. Changed closures/objective invalidate the result, hide stale AI advice and require a re-run. Reset restores single mode, clears the run, and preserves recorded history. The fleet workspace reuses existing controls and shared disruptions; current single-plan endpoints keep their existing protection policy. Fleet records themselves can have disrupted origins/destinations, in which case their allocations become no-route.

`FleetWorkspace.tsx` provides the mode comparison, objective, cohort table, computed metrics, candidate details and reservation table. Journey animations continue to preview the selected single plan. Decision Replay can inspect recorded fleet metrics without changing current reservations.

Gemini fleet requests contain the canonical seeded shipment records and the actual full computed comparison. The server uses the same domain module to recompute and validate the report; stale or forged metrics/routes/reservations are rejected. Fleet analysis requires `recommendedRouteId: null` because a fleet allocation is not one single route ID. The existing single-route request contract and API protections remain supported. Neither Gemini nor a view toggle changes reservations; no solver, database or sponsor integration was added.

Run `npm run build` and `npm test`. Regression coverage includes individual candidate feasibility, independently overbooked routes, shared reservations, priority/deadline ordering, no-route versus capacity failures, deterministic ordering, all 256 intermediate-disruption combinations, metrics, stale-run UI, fleet Gemini validation and the existing single-plan/API/playback tests. Provider tests use injected responses; this change does not certify a live external Gemini call.

Manual check: optimize the default fleet; inspect the 90-tonne bottleneck and alternate routes; disrupt Union Depot and re-run; compare failures/added cost; request fleet Gemini analysis; restore the hub and re-run. Switch back to single planning and confirm its endpoints, routing controls, journey animation and AI workflow still work. Check the cohort table at laptop/mobile widths.

Next: introduce editable/versioned shipment inputs and capacity scenarios; compare a second allocation strategy using these same matched-cohort metrics; replace exhaustive paths with bounded k-shortest/residual-path search as graph size grows; add time-window scheduling only when a temporal capacity model is explicitly defined.
