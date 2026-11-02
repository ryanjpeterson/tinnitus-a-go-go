# jimbo-ui

This app uses jimbo-ui. Before creating a new UI component, check registry/components.json in jimbo-ui (and `node scripts/inventory.mjs --json` there) for an existing one with the same purpose. All brand, theme and style options belong in the jimbo-ui config section (/jimbo-ui), admin-only if this app has auth. After adding or changing a UI component, update `components` in this app's jimbo-ui.json — it's the only record; don't write app details into jimbo-ui.
