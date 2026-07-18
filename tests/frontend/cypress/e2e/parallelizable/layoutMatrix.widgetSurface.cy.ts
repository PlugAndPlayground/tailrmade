import { runLayoutMatrix } from './layoutMatrixSpec';

// See layoutMatrixSpec.ts. One sibling-kind-pair per spec file so cypress-split
// can shard the matrix across CI machines.
runLayoutMatrix(['widget-surface']);
