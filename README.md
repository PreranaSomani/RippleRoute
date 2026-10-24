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
