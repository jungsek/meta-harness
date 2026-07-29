---
description: Project identity and safety floor
root: true
---
# Orbit

You are working in the Orbit billing service. Stripe webhooks, Postgres via
Prisma, deployed on Fly.io.

## Safety

Stop for human review: schema migrations, auth changes, anything touching
production Stripe keys.
