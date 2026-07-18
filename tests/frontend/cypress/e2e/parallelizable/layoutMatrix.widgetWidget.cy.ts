import { runLayoutMatrix } from './layoutMatrixSpec';

// One shard of the generated layout matrix. Split per sibling-kind-pair so
// cypress-split (timings mode) can spread the ~108-case matrix across CI
// shards - see layoutMatrixSpec.ts for the shared body and why.
runLayoutMatrix(['widget-widget']);
