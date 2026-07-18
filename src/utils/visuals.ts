import { GlowFilter, ShockwaveFilter } from 'pixi-filters';
import * as PIXI from 'pixi.js';

// ReactUI connections are drawn fainter so they don't visually dominate the
// canvas now that UI surfaces live alongside regular nodes
export const REACT_UI_CONNECTION_ALPHA = 0.1;

export async function drawExecutionFilter(
  filter: GlowFilter,
  container: PIXI.Container,
) {
  const BEGIN_STRENGTH = 3;

  const start = Date.now();
  let last = BEGIN_STRENGTH;
  filter.outerStrength = BEGIN_STRENGTH;
  filter.innerStrength = BEGIN_STRENGTH / 2;

  container.filters = [filter];
  //const existingFilters = container.filters;
  // this complex logic here might have caused odd visual artifacts with disappearing nodes TODO investigate
  //let prevFilters = [];
  //if (Array.isArray(existingFilters)) {
  //  prevFilters = existingFilters;
  //  if (!prevFilters.find((existingFilter) => filter === existingFilter)) {
  //   container.filters = existingFilters.concat([filter]);
  //  }
  //} else {
  //  container.filters = [filter];
  // }
  for (let i = 0; i < 30; i++) {
    const curr = Date.now() - start;

    await new Promise((r) => setTimeout(r, 33));
    if (last < filter.outerStrength || container.destroyed) {
      // someone else started doin this or I got destroyed
      break;
    } else if (curr > 1000) {
      // times up
      if (!container.destroyed) {
        container.filters = [];
        // this complex logic here might have caused odd visual artifacts with disappearing nodes TODO investigate
        //if (!prevFilters.length) {
        //  container.filters = [];
        //} else {
        // lot of filter innit
        //  container.filters = container.filters.filter(
        //    (filt) => filt !== filter,
        //  );
        // }
      }
      break;
    }
    const nextStrength = (1 - curr / 1000) * BEGIN_STRENGTH;
    filter.outerStrength = nextStrength;
    filter.innerStrength = nextStrength / 2;
    last = nextStrength;
  }
}

export async function drawShockwaveFilter(
  container: PIXI.Container,
  point: PIXI.Point,
) {
  const filter = new ShockwaveFilter({
    center: point,
    wavelength: 15,
    speed: 0.1,
  });
  filter.resolution = 2;
  container.filters = [filter];
  const start = Date.now();
  for (let i = 0; i < 100; i++) {
    const curr = Date.now() - start;

    filter.time = curr;
    await new Promise((r) => setTimeout(r, 16));
  }
  container.filters = [];
}
