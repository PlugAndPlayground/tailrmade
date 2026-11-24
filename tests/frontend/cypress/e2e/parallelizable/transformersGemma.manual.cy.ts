import { doWithTestController, openNewGraph } from '../helpers';

// Manual: downloads Gemma 4 E2B q4f16 (about 3.1 GB) and needs a real GPU.
// Runs only when an output file is given, so it never starts in CI:
//   CYPRESS_transformersManualOut=/tmp/gemma.json yarn cypress run --headed \
//     --browser chrome --config-file tests/frontend/cypress/cypress.config.ts \
//     --spec tests/frontend/cypress/e2e/parallelizable/transformersGemma.manual.cy.ts
// The first test downloads; the second starts a fresh worker and loads from
// the cache, which is the speed to compare (Kitchen Jamie measured 22.2 tokens/s
// on an Apple Silicon Mac).
const OUT = Cypress.expose('transformersManualOut') as string | undefined;
const LONG = 45 * 60 * 1000;
// CYPRESS_transformersManualDevice=wasm runs the same flow on the CPU.
const DEVICE =
  (Cypress.expose('transformersManualDevice') as string) || 'webgpu';
// CYPRESS_transformersManualModel swaps the model, e.g. a smaller one.
const MODEL =
  (Cypress.expose('transformersManualModel') as string) ||
  'onnx-community/gemma-4-E2B-it-ONNX';

const recipeSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    servings: { type: 'integer', minimum: 1, maximum: 12 },
    ingredients: {
      type: 'array',
      minItems: 3,
      items: {
        type: 'object',
        properties: {
          amount: { type: 'number' },
          unit: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['amount', 'unit', 'name'],
        additionalProperties: false,
      },
    },
    steps: { type: 'array', minItems: 2, items: { type: 'string' } },
  },
  required: ['title', 'servings', 'ingredients', 'steps'],
  additionalProperties: false,
};

const kitchenTools = [
  {
    type: 'function',
    function: {
      name: 'adjust_servings',
      description:
        'Change the displayed recipe to a new total serving count. Call this whenever the user asks to scale the recipe.',
      parameters: {
        type: 'object',
        properties: { servings: { type: 'integer', minimum: 1, maximum: 12 } },
        required: ['servings'],
      },
    },
  },
];

const results: Record<string, unknown> = {};

const loadGemma = () => {
  doWithTestController(async (tc) => {
    await tc.addNode('TransformersModel', 'GM');
    await tc.addNode('TransformersGenerate', 'GG');
    tc.setNodeInputValue('GM', 'Device', DEVICE);
    tc.setNodeInputValue('GM', 'Model', MODEL);
    await tc.connectNodesByID('GM', 'GG', 'Model', 'Model');
  });
  return cy
    .window()
    .its('testController')
    .then({ timeout: LONG }, async (tc: any) => {
      const started = performance.now();
      await tc.getNodeByID('GM').loadModel();
      const status = tc.getNodeOutputValue('GM', 'Status');
      expect(status.phase, status.error).to.eq('ready');
      return { status, seconds: (performance.now() - started) / 1000 };
    });
};

const generateRecipe = (label: string) =>
  cy
    .window()
    .its('testController')
    .then({ timeout: LONG }, async (tc: any) => {
      tc.setNodeInputValue('GG', 'Messages', [
        {
          role: 'system',
          content: 'You write short, practical recipes as JSON.',
        },
        { role: 'user', content: 'A quick tomato pasta for two.' },
      ]);
      tc.setNodeInputValue('GG', 'Response format', recipeSchema);
      tc.setNodeInputValue('GG', 'Options', {
        max_new_tokens: 1256,
        do_sample: false,
      });
      // Watch Text stream while the page stays responsive.
      let updates = 0;
      let last = '';
      const timer = setInterval(() => {
        const text = tc.getNodeOutputValue('GG', 'Text');
        if (text !== last) updates++;
        last = text;
      }, 50);
      await tc.getNodeByID('GG').generateText();
      clearInterval(timer);
      const status = tc.getNodeOutputValue('GG', 'Status');
      expect(status.phase, status.message).to.eq('done');
      const text = tc.getNodeOutputValue('GG', 'Text');
      const recipe = JSON.parse(text);
      expect(recipe.ingredients.length).to.be.at.least(3);
      results[label] = {
        stats: tc.getNodeOutputValue('GG', 'Stats'),
        streamedUpdates: updates,
        title: recipe.title,
      };
    });

(OUT ? describe : describe.skip)('Gemma 4 E2B on WebGPU (manual)', () => {
  it('downloads, reports size first, and writes a schema-valid recipe', () => {
    openNewGraph();
    loadGemma().then((load: any) => {
      results.model = MODEL;
      results.firstLoad = {
        seconds: load.seconds,
        totalBytes: load.status.totalBytes,
        device: load.status.device,
        storage: load.status.storage,
      };
    });
    generateRecipe('firstRun');
  });

  it('loads from the cache in a fresh worker and generates at full speed', () => {
    openNewGraph();
    loadGemma().then((load: any) => {
      expect(load.status.cached).to.eq(true);
      results.cachedLoad = { seconds: load.seconds };
    });
    generateRecipe('cachedRun');
    // Tool calling with Gemma's native format.
    cy.window()
      .its('testController')
      .then({ timeout: LONG }, async (tc: any) => {
        tc.setNodeInputValue('GG', 'Response format', {});
        tc.setNodeInputValue('GG', 'Tools', kitchenTools);
        tc.setNodeInputValue('GG', 'Options', {
          max_new_tokens: 128,
          do_sample: false,
        });
        tc.setNodeInputValue('GG', 'Messages', [
          {
            role: 'system',
            content:
              'You control a recipe app. When a tool applies, call it instead of answering in text.',
          },
          { role: 'user', content: 'Make it for 4 people please.' },
        ]);
        await tc.getNodeByID('GG').generateText();
        results.toolCall = {
          calls: tc.getNodeOutputValue('GG', 'Tool calls'),
          text: tc.getNodeOutputValue('GG', 'Text'),
          lastMessage: tc.getNodeOutputValue('GG', 'Messages').at(-1),
        };
      });
    // Written before asserting, so a failed run still leaves its numbers.
    cy.then(() => cy.writeFile(OUT!, results));
    cy.then(() => {
      const calls = (results.toolCall as any).calls;
      expect(calls).to.have.length(1);
      expect(calls[0]).to.include({ name: 'adjust_servings' });
      expect(calls[0].arguments).to.deep.eq({ servings: 4 });
    });
  });
});
