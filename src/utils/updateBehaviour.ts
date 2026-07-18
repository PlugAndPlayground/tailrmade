import type { IUpdateBehaviour } from '../classes/UpdateBehaviourClass';

type UpdateBehaviourWithLoad = {
  updateBehaviour: Pick<IUpdateBehaviour, 'load'>;
};

export function getLoadSeedNodes<T extends UpdateBehaviourWithLoad>(
  nodes: T[],
): T[] {
  return nodes.filter((node) => node.updateBehaviour.load);
}

export function shouldExecuteOnInitialNodeAdd(options: {
  isSerialized: boolean;
  isNewConnected: boolean;
  load: boolean;
  graphConfiguredAndReady: boolean;
}): boolean {
  return (
    !options.isSerialized &&
    !options.isNewConnected &&
    options.load &&
    options.graphConfiguredAndReady
  );
}
