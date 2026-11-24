import {
  PNP_TIMEOUT,
  doWithTestController,
  openNewGraph,
  shouldWithTestController,
} from '../helpers';

// A ~10 MB random Llama with a chat template: enough to run the whole path on
// the CPU (wasm) in headless Chrome. Its text is gibberish by design.
const TINY_MODEL = 'hf-internal-testing/tiny-random-LlamaForCausalLM';
const DOWNLOAD_TIMEOUT = Math.max(PNP_TIMEOUT, 180000);

const setModelInputs = (testController, id: string, device: string) => {
  testController.setNodeInputValue(id, 'Model', TINY_MODEL);
  testController.setNodeInputValue(id, 'Dtype', 'fp32');
  testController.setNodeInputValue(id, 'Device', device);
};

describe('Transformers.js nodes', () => {
  beforeEach(() => {
    // Everything the nodes run is bundled or served by Tailrmade itself.
    // (The app itself loads Tailwind from jsDelivr; that is not checked here.)
    for (const path of ['onnxruntime-web', '@huggingface']) {
      cy.intercept(`https://cdn.jsdelivr.net/npm/${path}*/**`, {
        forceNetworkError: true,
      }).as('cdn');
    }
    openNewGraph();
  });

  afterEach(() => {
    cy.get('@cdn.all').should('have.length', 0);
  });

  it('checks WebGPU in the worker without downloading anything', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('TransformersModel', 'TJREAL');
      testController.setNodeInputValue('TJREAL', 'Device', 'webgpu');
      testController.setNodeInputValue(
        'TJREAL',
        'Model',
        'onnx-community/this-model-does-not-exist-ONNX',
      );
      await (testController.getNodeByID('TJREAL') as any).loadModel();
      const webgpu = testController.getNodeOutputValue('TJREAL', 'WebGPU');
      expect(webgpu).to.have.keys(['available', 'adapter', 'reason']);
      expect(webgpu.available ? webgpu.adapter : webgpu.reason).to.not.eq('');
      // Either way it fails: no adapter, or no such model.
      const status = testController.getNodeOutputValue('TJREAL', 'Status');
      expect(status.phase).to.eq('error');
      expect(status.downloadBytes).to.eq(0);
    });
  });

  it('reports missing WebGPU instead of falling back when WebGPU is chosen', () => {
    doWithTestController(async (testController) => {
      await testController.simulateMissingWebGPU('no adapter in this test');
      await testController.addNode('TransformersModel', 'TJGPU');
      setModelInputs(testController, 'TJGPU', 'webgpu');
      await (testController.getNodeByID('TJGPU') as any).loadModel();
    });
    doWithTestController((testController) => {
      const webgpu = testController.getNodeOutputValue('TJGPU', 'WebGPU');
      const status = testController.getNodeOutputValue('TJGPU', 'Status');
      expect(webgpu).to.have.keys(['available', 'adapter', 'reason']);
      expect(webgpu).to.deep.eq({
        available: false,
        adapter: '',
        reason: 'no adapter in this test',
      });
      expect(status.phase).to.eq('error');
      expect(status.error).to.contain('WebGPU is not available');
      expect(status.error).to.contain('no adapter in this test');
      expect(status.downloadBytes).to.eq(0);
      expect(testController.getNodeOutputValue('TJGPU', 'Ready')).to.eq(false);
      expect(testController.getNodeOutputValue('TJGPU', 'Model')).to.eq(null);
    });
  });

  it('loads a model on wasm, reuses its handle and generates in the worker', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('TransformersModel', 'TJM1');
      await testController.addNode('TransformersModel', 'TJM2');
      await testController.addNode('TransformersGenerate', 'TJG');
      setModelInputs(testController, 'TJM1', 'wasm');
      setModelInputs(testController, 'TJM2', 'wasm');
      await testController.connectNodesByID('TJM1', 'TJG', 'Model', 'Model');
      testController.setNodeInputValue('TJG', 'Messages', 'Hello there');
      testController.setNodeInputValue('TJG', 'Options', {
        max_new_tokens: 12,
        do_sample: false,
      });
      const risks = testController.getNodeByID('TJM1').getRisks();
      expect(risks.map((risk) => [risk.kind, risk.target])).to.deep.eq([
        ['model-download', `huggingface.co/${TINY_MODEL}`],
      ]);
    });

    cy.window()
      .its('testController')
      .then({ timeout: DOWNLOAD_TIMEOUT }, async (testController: any) => {
        await testController.getNodeByID('TJM1').loadModel();
      });

    // ONNX Runtime's WASM came from our origin (Transformers.js caches it).
    cy.window().then(async (win) => {
      const cache = await win.caches.open('transformers-cache');
      const urls = (await cache.keys()).map((request) => request.url);
      const wasm = urls.filter((url) => /ort-wasm-simd-threaded/.test(url));
      expect(wasm, urls.join('\n')).to.not.be.empty;
      for (const url of wasm) {
        expect(new URL(url).origin).to.eq(win.location.origin);
      }
    });
    doWithTestController((testController) => {
      const status = testController.getNodeOutputValue('TJM1', 'Status');
      expect(status.phase, status.error).to.eq('ready');
      expect(status.device).to.eq('wasm');
      expect(status.totalBytes).to.be.greaterThan(1000);
      expect(status.storage.mode).to.eq('browser');
      expect(testController.getNodeOutputValue('TJM1', 'Ready')).to.eq(true);
      const handle = testController.getNodeOutputValue('TJM1', 'Model');
      expect(handle).to.include({
        model: TINY_MODEL,
        dtype: 'fp32',
        device: 'wasm',
      });
      // The download size is kept for the review.
      const risk = testController.getNodeByID('TJM1').getRisks()[0];
      expect(risk.target).to.match(/ · \d/);
      // The handle was pushed downstream.
      expect(testController.getNodeInputValue('TJG', 'Model')).to.deep.eq(
        handle,
      );
    });

    // A second node with the same model, dtype and device gets the same
    // handle from the worker without loading again.
    cy.window()
      .its('testController')
      .then({ timeout: DOWNLOAD_TIMEOUT }, async (testController: any) => {
        await testController.getNodeByID('TJM2').loadModel();
        expect(testController.getNodeOutputValue('TJM2', 'Model')).to.deep.eq(
          testController.getNodeOutputValue('TJM1', 'Model'),
        );
        expect(
          testController.getNodeOutputValue('TJM2', 'Status').cached,
        ).to.eq(true);
      });

    // Generate, and press again while busy: the second press is ignored.
    cy.window()
      .its('testController')
      .then({ timeout: DOWNLOAD_TIMEOUT }, async (testController: any) => {
        const node = testController.getNodeByID('TJG');
        const first = node.generateText();
        expect(testController.getNodeOutputValue('TJG', 'Busy')).to.eq(true);
        await node.generateText();
        expect(testController.getNodeOutputValue('TJG', 'Status').phase).to.eq(
          'ignored',
        );
        await first;
      });

    shouldWithTestController((testController) => {
      const status = testController.getNodeOutputValue('TJG', 'Status');
      expect(status.phase, status.message).to.eq('done');
      expect(testController.getNodeOutputValue('TJG', 'Busy')).to.eq(false);
      expect(testController.getNodeOutputValue('TJG', 'Text')).to.be.a(
        'string',
      );
      const stats = testController.getNodeOutputValue('TJG', 'Stats');
      expect(stats.tokens).to.be.greaterThan(0);
      expect(stats.tokens).to.be.at.most(12);
      expect(stats.seconds).to.be.greaterThan(0);
      const messages = testController.getNodeOutputValue('TJG', 'Messages');
      expect(messages).to.have.length(2);
      expect(messages[0]).to.deep.eq({ role: 'user', content: 'Hello there' });
      expect(messages[1].role).to.eq('assistant');
      expect(testController.getNodeOutputValue('TJG', 'Tool calls')).to.be.an(
        'array',
      );
    }, DOWNLOAD_TIMEOUT);

    // Delete model frees the browser storage it used.
    cy.window()
      .its('testController')
      .then({ timeout: DOWNLOAD_TIMEOUT }, async (testController: any) => {
        await testController.getNodeByID('TJM1').deleteStoredModel();
        const status = testController.getNodeOutputValue('TJM1', 'Status');
        expect(status.phase, status.error).to.eq('idle');
        expect(status.message).to.match(/^Deleted \d+ model files/);
        expect(testController.getNodeOutputValue('TJM1', 'Ready')).to.eq(false);
      });
  });

  it('falls back on auto, and from Companion folder to the browser', () => {
    doWithTestController(async (testController) => {
      await testController.simulateMissingWebGPU('no adapter in this test');
      await testController.addNode('TransformersModel', 'TJC');
      setModelInputs(testController, 'TJC', 'auto');
      testController.setNodeInputValue('TJC', 'Storage', 'Companion folder');
      const kinds = testController
        .getNodeByID('TJC')
        .getRisks()
        .map((risk) => risk.kind);
      expect(kinds).to.deep.eq(['model-download', 'companion']);
    });
    cy.intercept('GET', 'http://localhost:6655/models', {
      forceNetworkError: true,
    });
    cy.window()
      .its('testController')
      .then({ timeout: DOWNLOAD_TIMEOUT }, async (testController: any) => {
        await testController.getNodeByID('TJC').loadModel();
        const status = testController.getNodeOutputValue('TJC', 'Status');
        expect(status.phase, status.error).to.eq('ready');
        expect(status.storage.mode).to.eq('browser');
        expect(status.message).to.contain('instead of the Companion folder');
        // auto says it fell back to the CPU.
        expect(status.device).to.eq('wasm');
        expect(status.message).to.contain(
          'WebGPU is not available: no adapter in this test',
        );
        await testController.getNodeByID('TJC').deleteStoredModel();
      });
  });

  it('waits for the model when Load and Generate are pressed together', () => {
    doWithTestController(async (testController) => {
      await testController.addNode('TransformersModel', 'TJL');
      await testController.addNode('TransformersGenerate', 'TJLG');
      setModelInputs(testController, 'TJL', 'wasm');
      await testController.connectNodesByID('TJL', 'TJLG', 'Model', 'Model');
      testController.setNodeInputValue('TJLG', 'Options', {
        max_new_tokens: 4,
      });
    });
    cy.window()
      .its('testController')
      .then({ timeout: DOWNLOAD_TIMEOUT }, async (testController: any) => {
        // Generate first: it must start the load itself, not fail.
        await Promise.all([
          testController.getNodeByID('TJLG').generateText(),
          testController.getNodeByID('TJL').loadModel(),
        ]);
        const status = testController.getNodeOutputValue('TJLG', 'Status');
        expect(status.phase, status.message).to.eq('done');
        expect(testController.getNodeOutputValue('TJL', 'Ready')).to.eq(true);
        await testController.getNodeByID('TJL').deleteStoredModel();
      });
  });
});
