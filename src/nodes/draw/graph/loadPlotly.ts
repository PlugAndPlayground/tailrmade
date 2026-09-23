export async function loadPlotly() {
  const module = await import(
    /* webpackChunkName: "plotly" */ 'plotly.js-dist'
  );
  return module.default ?? module;
}
