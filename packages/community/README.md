# @agent-e/core — Community Edition

Autonomous economic balancer SDK. Observe, diagnose, simulate, plan, execute — for any digital economy.

**Community Edition** ships 5 of 60 principles under the MIT license, free forever.

## Quick Start

```bash
npm install @agent-e/core
```

```typescript
import { createCommunityAgent } from '@agent-e/core';

const agent = createCommunityAgent({
  adapter: myAdapter,
  mode: 'autonomous',
});

agent.connect(myAdapter).start();
await agent.tick();
```

Or use `COMMUNITY_PRINCIPLES` directly:

```typescript
import { AgentE, COMMUNITY_PRINCIPLES } from '@agent-e/core';

const agent = new AgentE({
  adapter: myAdapter,
  principles: COMMUNITY_PRINCIPLES,
});
```

## Community Principles (5)

| # | Principle | Category |
|---|-----------|----------|
| P1 | Production Matches Consumption | Supply Chain |
| P12 | One Primary Faucet | Currency Flow |
| P20 | Decay Prevents Accumulation | Feedback Loops |
| P33 | Fair ≠ Equal | Participant Experience |
| P43 | Simulation Minimum (100 Iterations) | Statistical |

## Upgrade to Pro

Need all 60 principles? Install `@agent-e/pro`:

```bash
npm install @agent-e/pro
```

```typescript
import { AgentE } from '@agent-e/pro';

const agent = new AgentE({ adapter: myAdapter });
// All 60 principles active by default
```

## License

MIT — free for personal and commercial use.
