import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { parse } from 'yaml';
const compose = parse(await readFile('compose.production.yaml', 'utf8'));
assert.equal(Object.keys(compose.services).length, 7);
assert.equal(compose.networks.backend.internal, true);
for (const [name, service] of Object.entries(compose.services)) {
  assert(name.startsWith('marketpilot-'));
  if (!service.profiles?.includes('migrate')) assert(service.healthcheck?.test?.length);
  assert(service.mem_limit);
  if (
    name.includes('postgres') ||
    name.includes('redis') ||
    name.includes('api') ||
    name.includes('worker')
  )
    assert(!service.ports);
}
const files = (await readdir('workflows')).filter((name) => name.endsWith('.json'));
assert.equal(files.length, 11);
for (const file of files) {
  const text = await readFile(`workflows/${file}`, 'utf8');
  const workflow = JSON.parse(text);
  assert.equal(workflow.active, false);
  assert(!text.includes('$vars.'));
  assert(!text.includes('Bearer '));
  assert.equal(
    JSON.stringify(JSON.parse(await readFile(`apps/web/public/workflows/${file}`, 'utf8'))),
    JSON.stringify(workflow),
  );
  const names = new Set(workflow.nodes.map((n) => n.name));
  assert.equal(names.size, workflow.nodes.length);
  for (const [source, outputs] of Object.entries(workflow.connections)) {
    assert(names.has(source));
    for (const targets of outputs.main)
      for (const target of targets) assert(names.has(target.node));
  }
  for (const node of workflow.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest')) {
    assert.equal(node.parameters.genericAuthType, 'httpHeaderAuth');
    assert.equal(node.retryOnFail, true);
    if (node.onError === 'continueErrorOutput')
      assert(workflow.connections[node.name]?.main[1]?.length);
    assert(
      !node.credentials,
      'Select protected credentials after import; do not export identifiers.',
    );
  }
}
console.log(
  'Six runtime services, one explicit migration service and eleven workflow exports validated structurally. Runtime Docker/n8n validation still requires the services.',
);
