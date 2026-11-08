# jimbo-ui

This app uses jimbo-ui. Before creating a new UI component, check registry/components.json in jimbo-ui (and `node scripts/inventory.mjs --json` there) for an existing one with the same purpose. All brand, theme and style options belong in the jimbo-ui config section (/jimbo-ui), admin-only if this app has auth. After adding or changing a UI component, update `components` in this app's jimbo-ui.json — it's the only record; don't write app details into jimbo-ui.

This repo's docs follow jimbo-explain (`docs/explain/`, `jimbo-explain.json`). When a change adds, removes or changes a feature,
dependency, integration, roadmap item or key decision, update the matching doc and facts in the same change, and move `synced` to
HEAD. Check with the jimbo-explain skill's `scripts/check.mjs`.
