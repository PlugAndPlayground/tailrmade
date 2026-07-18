import { doWithTestController, openNewGraph } from '../helpers';

// One-off probe (not a regression test): walks every registered node via
// describe_node and dumps a flat socket inventory to JSON, as raw material for
// deciding which sockets are self-explanatory. Output path is passed via
// CYPRESS_inventoryOut; run with a generous CYPRESS_pnpTimeout.
describe('socket inventory probe', () => {
  beforeEach(() => {
    openNewGraph();
  });

  it('dumps every node + socket to JSON', () => {
    const outPath =
      Cypress.env('inventoryOut') || 'cypress/_socket-inventory.json';

    doWithTestController(async (tc) => {
      const keys = tc.getAllDefinedNodeTypes();
      const rows: Array<Record<string, unknown>> = [];
      const errors: Array<{ node_key: string; error: string }> = [];

      for (const key of keys) {
        const res = await tc.callAITool('describe_node', { node_type: key });
        if (res.is_error) {
          errors.push({ node_key: key, error: res.content });
          continue;
        }
        const d = JSON.parse(res.content) as {
          type: string;
          name: string;
          description: string;
          ai_docs: string;
          sockets: Array<{
            name: string;
            socket_type: string;
            data_type: string;
            visible: boolean;
            default_data: unknown;
          }>;
        };
        for (const s of d.sockets) {
          // default_data is part of what describe_node shows the model and is
          // often the real disambiguator; keep a compact preview of it.
          let defaultPreview = '';
          try {
            defaultPreview = JSON.stringify(s.default_data);
          } catch {
            defaultPreview = String(s.default_data);
          }
          if (defaultPreview && defaultPreview.length > 120) {
            defaultPreview = defaultPreview.slice(0, 120) + '…';
          }
          rows.push({
            node_key: d.type,
            node_name: d.name,
            node_description: d.description,
            node_has_ai_docs: Boolean(d.ai_docs && d.ai_docs.length > 0),
            socket_name: s.name,
            direction: s.socket_type,
            data_type: s.data_type,
            visible: s.visible,
            default_preview: defaultPreview,
          });
        }
      }

      const summary = {
        node_types: keys.length,
        described_ok: keys.length - errors.length,
        describe_errors: errors.length,
        socket_rows: rows.length,
      };
      cy.writeFile(outPath, JSON.stringify({ summary, errors, rows }, null, 2));
      // surface the headline numbers in the run log too
      cy.log(JSON.stringify(summary));
    });
  });
});
