import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  Link,
  Paper,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';
import PPGraph from '../classes/GraphClass';
import PPStorage, { autoSaveSuffix } from '../PPStorage';
import { AccessType, IGraphSearch } from '../utils/interfaces';
import LockIcon from '@mui/icons-material/Lock';
import PublicIcon from '@mui/icons-material/Public';
import BusinessIcon from '@mui/icons-material/Business';
import InterfaceController from '../InterfaceController';

interface DeleteConfirmationDialogProps {
  graphToBeModified: IGraphSearch;
}

const dialogStyles = {
  '& .MuiDialog-paper': {
    bgcolor: 'background.default',
  },
} as const;

export const DeleteConfirmationDialog = React.memo(
  ({ graphToBeModified }: DeleteConfirmationDialogProps) => {
    const handleClose = () => {
      InterfaceController.setShowGraphDelete(false);
    };

    const handleDelete = useCallback(async () => {
      InterfaceController.setShowGraphDelete(false);
      const storage = PPStorage.getInstance();
      const currentGraphID = PPGraph.currentGraph.id;

      await storage.deleteGraph(graphToBeModified);

      // also remove any potential autosaves
      const potentialAutoSave = structuredClone(graphToBeModified);
      potentialAutoSave.name = graphToBeModified.name + autoSaveSuffix;
      await storage.deleteGraph(potentialAutoSave);

      if (graphToBeModified.id === currentGraphID) {
        void storage.loadLatestGraphFromDB();
      }
    }, [graphToBeModified]);

    return (
      <Dialog
        open={true}
        onClose={handleClose}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
        fullWidth
        maxWidth="sm"
        data-cy="deleteDialog"
        sx={dialogStyles}
      >
        <DialogTitle id="alert-dialog-title">Delete app?</DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Are you sure you want to delete
            <br />
            <b>{graphToBeModified.name}</b>?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} autoFocus color="secondary">
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            data-cy="deleteDialogDeleteButton"
            color="secondary"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.graphToBeModified.id === nextProps.graphToBeModified.id &&
      prevProps.graphToBeModified.name === nextProps.graphToBeModified.name &&
      prevProps.graphToBeModified.location ===
        nextProps.graphToBeModified.location
    );
  },
);

DeleteConfirmationDialog.displayName = 'DeleteConfirmationDialog';

export const EditDialog = (props) => {
  const [name, setName] = useState<string>(props.graphName);
  const [accessLevel, setAccessLevel] = useState<AccessType>(props.graphAccess);
  const [location, setLocation] = useState<string>(props.graphLocation);
  const showOrganizationOption = false; // Placeholder for organization option

  useEffect(() => {
    setAccessLevel(props.graphAccess);
    setLocation(props.graphLocation);
    setName(props.graphName);
  }, [props.name, props.graphAccess, props.graphLocation]);

  const handleAccessChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setAccessLevel(event.target.value as AccessType);
  };

  const handleLocationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLocation(event.target.value);
  };

  const submitEditDialog = (): void => {
    InterfaceController.setShowGraphEdit(false);
    void PPStorage.getInstance().updateGraph(name, accessLevel, location);
  };

  return (
    <Dialog
      open={true}
      onClose={() => InterfaceController.setShowGraphEdit(false)}
      fullWidth
      disableRestoreFocus
      maxWidth="sm"
      data-cy="editDialog"
      sx={{
        '& .MuiDialog-paper': {
          bgcolor: 'background.default',
        },
      }}
    >
      <DialogTitle>Edit app details</DialogTitle>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitEditDialog();
        }}
      >
        <DialogContent>
          <TextField
            id="app-name-input"
            autoFocus
            margin="dense"
            label="Name of app"
            fullWidth
            variant="standard"
            defaultValue={`${name}`}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              setName(event.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitEditDialog();
              }
            }}
          />
          <TextField
            id="app-location-input"
            margin="dense"
            label="Location"
            fullWidth
            variant="standard"
            value={location}
            onChange={handleLocationChange}
            placeholder={props.graphLocation}
            sx={{ mt: 2 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitEditDialog();
              }
            }}
          />

          <FormControl sx={{ mt: 3 }}>
            <FormLabel id="access-level-group-label">Access Level</FormLabel>
            <RadioGroup
              aria-labelledby="access-level-group-label"
              name="access-level-group"
              value={accessLevel}
              onChange={handleAccessChange}
            >
              <FormControlLabel
                value="private"
                control={<Radio />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <LockIcon fontSize="small" sx={{ mr: 1 }} />
                    <Typography>Private (only you)</Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="public"
                control={<Radio />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <PublicIcon fontSize="small" sx={{ mr: 1 }} />
                    <Typography>Public (anyone can view)</Typography>
                  </Box>
                }
              />
              {showOrganizationOption && (
                <FormControlLabel
                  value="organization"
                  control={<Radio />}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <BusinessIcon fontSize="small" sx={{ mr: 1 }} />
                      <Typography>
                        Organization (only your organization)
                      </Typography>
                    </Box>
                  }
                />
              )}
            </RadioGroup>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => InterfaceController.setShowGraphEdit(false)}
            color="secondary"
          >
            Cancel
          </Button>
          <Button
            data-cy="editDialogSaveButton"
            onClick={() => {
              submitEditDialog();
            }}
            color="secondary"
          >
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
