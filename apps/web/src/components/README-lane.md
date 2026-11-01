# Lane and InstantScanCard

```jsx
import Lane from './components/Lane.jsx';
import InstantScanCard from './components/InstantScanCard.jsx';

<InstantScanCard scan={report.instantScan} loading={!report.instantScan} />
{tasks.map((t) => <Lane key={t.taskId} task={t} onShotClick={setLightboxUrl} />)}
```
- `Lane` props: `task` (TaskResult, undefined = waiting), `label` (optional override), `onShotClick(url)`, `startedAt` (ms, optional timer start).
- Status comes from `task.status` (+ `task.verdict` for Blocked). Imports only `@agentready/engine/goals` (browser-safe).
- `InstantScanCard` props: `scan` (InstantScan), `loading`.
