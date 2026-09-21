import { createStore } from '../components/createStore';

// Session-only: a graph file cannot grant itself execution permission.
export const appExecutionAllowed = createStore(true);
