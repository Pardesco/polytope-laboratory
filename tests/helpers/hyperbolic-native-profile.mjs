import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { EnginePool } from '../../desktop/engine-pool.cjs';

export function createHyperbolicProfileBridge() {
  const records = new Map(),
    queue = [];
  let next = 0,
    errors = '',
    closed = false;
  const key = (request) => {
    const source = request.params?.source ?? request.params?.parameters?.source;
    return source?.pqr?.join('') ?? (source?.type === 'manifold' ? 'small-cover' : null);
  };
  const pool = new EnginePool({
    spawnWorker: () => {
      const spawnedAt = performance.now();
      const proc = spawn('python', ['-u', 'engine/server.py'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONUTF8: '1',
          PYTHONIOENCODING: 'utf-8',
          OPENBLAS_NUM_THREADS: '1',
          OMP_NUM_THREADS: '1',
          POLYTOPE_STARTUP_PROFILE: '1',
          POLYTOPE_HYPERBOLIC_PROFILE: '1',
        },
      });
      proc.hyperbolicProfile = { spawnedAt };
      let tail = '';
      proc.stderr.on('data', (chunk) => {
        tail += chunk;
        let end;
        while ((end = tail.indexOf('\n')) >= 0) {
          const line = tail.slice(0, end).trim();
          tail = tail.slice(end + 1);
          if (line === 'POLYTOPE_ENGINE_READY')
            proc.hyperbolicProfile.startupMs = performance.now() - proc.hyperbolicProfile.spawnedAt;
          else if (line.startsWith('POLYTOPE_HYPERBOLIC_PROFILE ')) {
            const profile = JSON.parse(line.slice('POLYTOPE_HYPERBOLIC_PROFILE '.length));
            Object.assign(records.get(profile.id) ?? {}, {
              python: profile,
              processTiming: proc.hyperbolicProfile,
            });
          } else if (line) errors += line + '\n';
        }
      });
      return proc;
    },
  });
  const receive = pool.receive.bind(pool);
  pool.receive = (worker, chunk) => {
    if (worker.proc.hyperbolicProfile.firstRequestId === undefined)
      worker.proc.hyperbolicProfile.firstRequestId = worker.active?.id;
    const record = records.get(worker.active?.id),
      start = performance.now();
    receive(worker, chunk);
    if (record) record.receiveJsonMs = (record.receiveJsonMs || 0) + performance.now() - start;
  };
  const drain = () => {
    while (!closed && queue.length && pool.jobs.size < 3) {
      const task = queue.shift(),
        record = records.get(task.id);
      record.queueMs = performance.now() - record.startedAt;
      pool
        .run(task.request, task.id)
        .then(task.resolve, task.reject)
        .finally(() => {
          record.wallMs = performance.now() - record.startedAt;
          drain();
        });
    }
  };
  return {
    compute(request) {
      const id = request.id ?? 'profile-' + ++next;
      records.set(id, { id, op: request.op, key: key(request), startedAt: performance.now() });
      return new Promise((resolve, reject) => {
        queue.push({ request, id, resolve, reject });
        drain();
      });
    },
    cancel(id) {
      const index = queue.findIndex((task) => task.id === id);
      if (index >= 0) queue.splice(index, 1)[0].reject(Error('Canceled.'));
      else pool.cancel(id);
    },
    get records() {
      return [...records.values()].map(({ processTiming, ...record }) => ({
        ...record,
        coldStart: processTiming?.firstRequestId === record.id,
        startupMs: processTiming?.firstRequestId === record.id ? processTiming.startupMs : 0,
      }));
    },
    get errors() {
      return errors;
    },
    dispose() {
      closed = true;
      for (const task of queue.splice(0)) task.reject(Error('Closed.'));
      pool.dispose();
    },
  };
}
