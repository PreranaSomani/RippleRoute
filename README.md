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
