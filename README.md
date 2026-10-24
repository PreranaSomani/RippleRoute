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
