/**
 * Dashboard layout migration utilities
 * Handles migrations between different versions of the dashboard layout format
 */

export const CURRENT_LAYOUT_VERSION = 2;

/**
 * Helper function to convert mode to dimension value
 * Used for migrating from widthMode/heightMode to width/height
 */
export const convertModeToDimension = (
  mode: string,
  currentValue: string,
): string => {
  switch (mode) {
    case 'hug':
      return 'auto';
    case 'fill':
      return '100%';
    default:
      return currentValue;
  }
};

/**
 * Migrates legacy widget properties from old format to new format.
 * Only handles widthMode/heightMode to width/height conversion.
 *
 * @param serializedLayout The serialized layout object to migrate
 * @returns Object with migrated layout and whether migration was applied
 */
export function migrateLegacyWidgetProps(serializedLayout: any): {
  layout: any;
  migrated: boolean;
} {
  // Deep clone to avoid mutating the original
  const migratedLayout = structuredClone(serializedLayout);

  // Track if any migrations were applied
  let migrationApplied = false;

  // Iterate through all nodes in the layout
  Object.keys(migratedLayout).forEach((nodeId) => {
    const node = migratedLayout[nodeId];

    // Get props (support both old flat structure and new nested structure)
    const props = node.props || node.data?.props;

    if (props) {
      // Migrate widthMode to width
      if (props.widthMode !== undefined) {
        migrationApplied = true;
        props.width = convertModeToDimension(props.widthMode, props.width);
        delete props.widthMode;
      }

      // Migrate heightMode to height
      if (props.heightMode !== undefined) {
        migrationApplied = true;
        props.height = convertModeToDimension(props.heightMode, props.height);
        delete props.heightMode;
      }
    }
  });

  if (migrationApplied) {
    console.log(
      'Dashboard layout migrated: widthMode/heightMode → width/height',
    );
  }

  return { layout: migratedLayout, migrated: migrationApplied };
}
