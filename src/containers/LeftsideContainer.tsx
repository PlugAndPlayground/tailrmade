import React, {
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  IconButton,
  InputAdornment,
  List,
  Stack,
  Switch,
  TextField,
  ThemeProvider,
  Tooltip,
  Typography,
} from '@mui/material';
import { ArrowDownward, ArrowUpward, Clear, Search } from '@mui/icons-material';
import PPStorage from '../PPStorage';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { IGraphSearch } from '../utils/interfaces';
import { customTheme, LeftDrawerView } from '../utils/constants';
import {
  PlaygroundFolder,
  IPlaygroundLocationData,
} from '../components/PlaygroundFolder';
import { CLOUD_MODE, GraphSortMode } from '../services/shared-types';
import { useUserPreferences } from '../components/useUserPreferences';
import { BackendGateway } from '../services/BackendGateway';

const AIConversationBrowser = React.lazy(
  () => import('../components/AIConversationBrowser'),
);

const ActionTimeline = React.lazy(() => import('../components/ActionTimeline'));

const PanelLoading = () => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
    }}
  >
    <CircularProgress />
  </Box>
);

export const EXAMPLE_APPS_LABEL = 'Example apps';

export interface IPlaygroundFolderData {
  id: string;
  label: string;
  locations: IPlaygroundLocationData[];
}

function mapCloudGraphsToSearchItems(cloudGraph: any): IGraphSearch {
  return {
    id: cloudGraph.location + '/' + cloudGraph.objectId,
    location: cloudGraph.location,
    owner: cloudGraph.owner,
    name: cloudGraph.objectId,
    isRemote: true,
    date: cloudGraph.updatedAt ? new Date(cloudGraph.updatedAt) : new Date(),
    access: cloudGraph.access,
  };
}

function graphSortFunction(
  a: IGraphSearch,
  b: IGraphSearch,
  sortPreference: GraphSortMode,
  sortDirection: boolean = true,
) {
  const autoSaveDebuff =
    (b.name.endsWith('Autosave') ? 100000000000000 : 0) -
    (a.name.endsWith('Autosave') ? 100000000000000 : 0);
  let sortScore;
  if (sortPreference === 'date') {
    sortScore = b.date.getTime() - a.date.getTime();
  } else {
    sortScore = a.name.localeCompare(b.name);
  }
  if (!sortDirection) {
    sortScore = -sortScore;
  }
  return sortScore - autoSaveDebuff;
}

function isAutosaveGraph(graphName: string) {
  return /-\s*Autosave$/i.test(graphName);
}

function groupGraphsByLocation(
  graphs: IGraphSearch[],
  sortPreference: GraphSortMode,
  sortDirection: boolean,
): IPlaygroundLocationData[] {
  const grouped: { [key: string]: IGraphSearch[] } = {};
  graphs.forEach((graph) => {
    const locationKey = graph.location;
    if (!grouped[locationKey]) {
      grouped[locationKey] = [];
    }
    grouped[locationKey].push(graph);
  });
  return Object.entries(grouped).map(([locationName, graphItems]) => ({
    locationName,
    graphs: graphItems.sort((a, b) =>
      graphSortFunction(a, b, sortPreference, sortDirection),
    ),
  }));
}

async function loadAllGraphs(
  setGraphs: React.Dispatch<React.SetStateAction<IPlaygroundFolderData[]>>,
  sortMode: GraphSortMode,
  sortDirection: boolean = true,
): Promise<void> {
  const localGraphs = await PPStorage.getInstance().getLocalGraphsList();
  setGraphs([
    {
      id: 'local',
      label: 'Local apps',
      locations: groupGraphsByLocation(localGraphs, sortMode, sortDirection),
    },
  ]);
  if (!CLOUD_MODE) {
    return;
  }
  const cloudGraphsMetadata = BackendGateway.getInstance().getGraphsMetadata();
  const [exampleGraphsData] = await Promise.all([
    BackendGateway.getInstance().getExampleGraphs(),
  ]);

  const allFolders: IPlaygroundFolderData[] = [];

  const cloudGraphItems: IGraphSearch[] = cloudGraphsMetadata.objects.map(
    mapCloudGraphsToSearchItems,
  );
  const cloudGraphDates = new Set(cloudGraphItems.map((g) => g.date.getTime()));

  if (cloudGraphItems.length > 0) {
    allFolders.push({
      id: 'cloud',
      label: 'Cloud apps',
      locations: groupGraphsByLocation(
        cloudGraphItems,
        sortMode,
        sortDirection,
      ),
    });
  }

  const filteredLocalGraphs = localGraphs.filter(
    (graph) => !graph.date || !cloudGraphDates.has(graph.date.getTime()),
  );
  if (filteredLocalGraphs.length > 0) {
    allFolders.push({
      id: 'local',
      label: 'Local apps',
      locations: groupGraphsByLocation(
        filteredLocalGraphs,
        sortMode,
        sortDirection,
      ),
    });
  }

  const exampleGraphItems: IGraphSearch[] = exampleGraphsData.map(
    mapCloudGraphsToSearchItems,
  );
  if (exampleGraphItems.length > 0) {
    allFolders.push({
      id: 'examples',
      label: EXAMPLE_APPS_LABEL,
      locations: groupGraphsByLocation(
        exampleGraphItems,
        sortMode,
        sortDirection,
      ),
    });
  }
  setGraphs(allFolders);
}

export const LeftsideContainer = (props: { activeView: LeftDrawerView }) => {
  return (
    <ThemeProvider theme={customTheme}>
      <Stack
        id="inspector-container-left"
        spacing={1}
        sx={{
          fontFamily: "'Roboto', 'Helvetica', 'Arial', 'sans-serif'",
          height: '100dvh',
          padding: 0,
          paddingLeft: '44px',
          pt: '48px',
        }}
      >
        {props.activeView === LeftDrawerView.GRAPHS && <GraphsContent />}
        {props.activeView === LeftDrawerView.AI && (
          <Suspense>
            <AIConversationBrowser />
          </Suspense>
        )}
        {props.activeView === LeftDrawerView.ACTIONS && (
          <Suspense fallback={<PanelLoading />}>
            <ActionTimeline />
          </Suspense>
        )}
      </Stack>
    </ThemeProvider>
  );
};

const GraphsContent = () => {
  const [graphFolders, setGraphFolders] = useState<IPlaygroundFolderData[]>([]);
  const [preferences, savePreferences] = useUserPreferences();
  const {
    saveInCloud,
    graphSortMode,
    graphSortDirection: sortDirection,
  } = preferences;
  const [searchText, setSearchText] = useState('');
  const [showAutosaves, setShowAutosaves] = useState(false);
  const deferredSearchText = useDeferredValue(searchText);

  useEffect(() => {
    void loadAllGraphs(setGraphFolders, graphSortMode, sortDirection);
    const listenID = InterfaceController.addListeners(
      [ListenEvent.GraphListUpdated, ListenEvent.GraphChanged],
      () => {
        void loadAllGraphs(setGraphFolders, graphSortMode, sortDirection);
      },
    );

    return () => {
      InterfaceController.removeListener(listenID);
    };
  }, [graphSortMode, sortDirection, saveInCloud]);

  const handleToggleChangeCloudSave = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    savePreferences({
      saveInCloud: event.target.checked,
    });
  };

  const handleSetSorting = (nextSortMode: GraphSortMode) => {
    savePreferences({
      graphSortMode: nextSortMode,
    });
    void loadAllGraphs(setGraphFolders, nextSortMode, sortDirection);
  };

  const handleToggleSortInversion = () => {
    savePreferences({
      graphSortDirection: !sortDirection,
    });
    void loadAllGraphs(setGraphFolders, graphSortMode, !sortDirection);
  };

  const filteredGraphFolders = useMemo(() => {
    const normalizedQuery = deferredSearchText.trim().toLowerCase();

    return graphFolders
      .map((folder) => {
        const folderMatches = folder.label
          .toLowerCase()
          .includes(normalizedQuery);
        const locations = folder.locations
          .map((location) => {
            const locationMatches = location.locationName
              .toLowerCase()
              .includes(normalizedQuery);
            const graphs = location.graphs.filter((graph) => {
              if (!showAutosaves && isAutosaveGraph(graph.name)) {
                return false;
              }

              if (!normalizedQuery || folderMatches || locationMatches) {
                return true;
              }

              return [graph.name, graph.location, graph.owner]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(normalizedQuery);
            });

            return {
              ...location,
              graphs,
            };
          })
          .filter((location) => location.graphs.length > 0);

        return {
          ...folder,
          locations,
        };
      })
      .filter((folder) => folder.locations.length > 0);
  }, [deferredSearchText, graphFolders, showAutosaves]);

  return (
    <>
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          px: 2,
          pt: 1,
        }}
      >
        <Stack spacing={1.25}>
          {CLOUD_MODE && BackendGateway.getInstance().getIsLoggedIn() && (
            <FormControlLabel
              data-cy="cloud-storage-toggle"
              control={
                <Checkbox
                  size="small"
                  checked={saveInCloud}
                  onChange={handleToggleChangeCloudSave}
                  sx={{ p: 0.4, mr: 0.35 }}
                />
              }
              label="Also save apps in cloud"
              sx={{
                m: 0,
                minHeight: 24,
                '& .MuiFormControlLabel-label': {
                  fontSize: '0.83rem',
                  lineHeight: 1.1,
                },
              }}
            />
          )}

          <TextField
            hiddenLabel
            placeholder="Search apps or folders"
            value={searchText}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setSearchText(event.target.value)
            }
            variant="filled"
            fullWidth
            slotProps={{
              input: {
                disableUnderline: true,
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: searchText ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setSearchText('')}
                      aria-label="Clear graph search"
                    >
                      <Clear fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              },
            }}
            sx={{
              borderRadius: 3,
              overflow: 'hidden',
              bgcolor: 'rgba(255,255,255,0.06)',
              '& .MuiFilledInput-root': {
                bgcolor: 'transparent',
              },
              '& input': {
                py: 1.2,
              },
            }}
          />

          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1.25,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <ButtonGroup
                size="small"
                variant="outlined"
                sx={{
                  '& .MuiButton-root': {
                    minWidth: 58,
                    lineHeight: 1,
                    px: 1.25,
                    py: 0.75,
                  },
                  '& .MuiButton-contained': {
                    boxShadow: 'none',
                  },
                }}
              >
                <Button
                  variant={graphSortMode === 'date' ? 'contained' : 'outlined'}
                  onClick={() => handleSetSorting('date')}
                >
                  Date
                </Button>
                <Button
                  variant={graphSortMode === 'name' ? 'contained' : 'outlined'}
                  onClick={() => handleSetSorting('name')}
                >
                  Name
                </Button>
              </ButtonGroup>
              <Tooltip
                title={
                  sortDirection
                    ? 'newest → oldest | A → Z'
                    : 'oldest → newest | Z → A'
                }
              >
                <IconButton
                  size="small"
                  onClick={handleToggleSortInversion}
                  sx={{
                    color: sortDirection ? 'primary.main' : 'text.secondary',
                    // border: '1px solid rgba(255,255,255,0.1)',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                    },
                  }}
                >
                  {sortDirection ? <ArrowDownward /> : <ArrowUpward />}
                </IconButton>
              </Tooltip>
            </Box>

            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={showAutosaves}
                  onChange={() => setShowAutosaves((current) => !current)}
                />
              }
              label="Show autosaves"
              labelPlacement="start"
              sx={{
                m: 0,
                gap: 0.5,
                ml: 'auto',
                '& .MuiFormControlLabel-label': {
                  fontSize: '0.78rem',
                  color: 'text.secondary',
                },
              }}
            />
          </Box>
        </Stack>
      </Box>
      <List
        id="graphs-list"
        sx={{
          width: '100%',
          px: 1.25,
          py: 1.25,
          pt: 0,
          bgcolor: 'background.default',
          position: 'relative',
          overflow: 'auto',
          maxHeight: 'calc(100dvh - 176px)',
          paddingLeft: '8px !important',
        }}
      >
        {filteredGraphFolders.length > 0 ? (
          filteredGraphFolders.map((folder) => (
            <PlaygroundFolder
              key={folder.id}
              label={folder.label}
              locations={folder.locations}
            />
          ))
        ) : (
          <Box
            sx={{
              mx: 1,
              mt: 1,
              p: 2.5,
              bgcolor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Typography variant="subtitle1">No apps match this view</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Adjust the search text or show autosaves to widen the result.
            </Typography>
          </Box>
        )}
      </List>
    </>
  );
};
