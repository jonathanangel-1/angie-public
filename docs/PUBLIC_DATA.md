# Public data boundary

This is a separate public edition with fresh Git history. The private repository's history, account associations, and deployment configuration were not imported.

## Retained

Application screens, API routes, recommendation and learning logic, provider adapters, database schemas/migrations, and selected sanitized regression checks remain inspectable. The public review uses the original pipeline with explicit adapters for external services.

## Replaced or excluded

- Participant identity, measurements, preferences, purchase history, fit outcomes, personal notes, products, and catalog records were independently fictionalized.
- Personal images, original product imagery, embeddings, browser captures, private evaluation artifacts, and local runtime state were excluded. Public garment illustrations are synthetic.
- Credentials, access codes, environment files, site/account identifiers, provider associations, and private development history were excluded or replaced with placeholders.

## Runtime behavior

`npm run demo` enables the synthetic adapters and local D1/R2 emulation. Public-demo configuration forces the QA session even when a live learning mode is inherited. Service credentials are not forwarded into demo worker bindings. The participant and administrator demo codes are local conveniences; outside explicit demo mode, access requires configured codes.

A supplied image can be stored in the local emulated bucket; image interpretation is simulated and does not send it to an AI provider. Feedback and outcomes persist in the local QA workspace. The public participant baseline stays separate. `.wrangler/`, environment files, build output, and other runtime artifacts are ignored by Git.

The demo contains no purchasable products and provides no real stock or fit verification. Live provider implementations require independent configuration with `PUBLIC_DEMO=0`.

## Future updates

Export reviewed source changes into this public copy. Do not merge private history or copy personal images, original catalogs, runtime state, private evaluation material, or credential files. A clean secret scan alone cannot determine whether an image or business record is private; content review remains part of preparing an export.
