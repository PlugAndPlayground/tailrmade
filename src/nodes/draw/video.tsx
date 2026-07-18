import React, { useCallback, useEffect, useRef, useState } from 'react';
import debounce from 'lodash/debounce';
import { TRgba } from '../../utils/color';
import { Box, Button, ButtonGroup, Grid, ThemeProvider, Typography, } from '@mui/material';
import CircularProgress, {
  CircularProgressProps, } from '@mui/material/CircularProgress';
import { ErrorBoundary } from 'react-error-boundary';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import PPStorage from '../../PPStorage';
import ErrorFallback from '../../components/ErrorFallback';
import PPGraph from '../../classes/GraphClass';
import PPSocket from '../../classes/SocketClass';
import HybridNode2, {
  HybridWidgetContentProps, } from '../../classes/HybridNode2';
import { FileType } from '../datatypes/fileType';
import { TriggerType } from '../datatypes/triggerType';
import { ImageType } from '../datatypes/imageType';
import { ArrayType } from '../datatypes/arrayType';
import { JSONType } from '../datatypes/jsonType';
import { BooleanType } from '../datatypes/booleanType';
import { NumberType } from '../datatypes/numberType';
import { EnumStructure, EnumType } from '../datatypes/enumType';
import { TNodeSource } from '../../utils/interfaces';
import { getCanvasWidgetPointerEvents } from '../../utils/nodeInteractivity';
import {
  DEFAULT_IMAGE,
  LOADING_STATE,
  NODE_TYPE_COLOR,
  SIMPLE_SIZE_OPTIONS,
  SOCKET_TYPE,
  TRIGGER_TYPE_OPTIONS,
  UNSET_VALUE,
  customTheme,
} from '../../utils/constants';
import { VISIBILITY_ACTION } from '../../utils/constants_shared';
import { getFileNameFromLocalResourceId } from '../../utils/utils';

export const inputResourceIdSocketName = 'Local resource ID';
const getFrameSocketName = 'Get current frame';
const getFramesSocketName = 'Get frames';
const toggleSecondsPercentSocketName = 'Seconds/Percent';
const frameArraySocketName = 'Frame array';
const playSocketName = 'Play/Pause';
const loopSocketName = 'Loop';
const speedSocketName = 'Speed';
const muteSocketName = 'Mute';
const volumeSocketName = 'Volume';
const posTimeSocketName = 'Position (s)';
const posPercSocketName = 'Position (%)';
const outputDetailsSocketName = 'Details';
const outputSocketName = 'Frame';
const outputArraySocketName = 'FrameArray';

const toggleOptions: EnumStructure = ['Percentage', 'Seconds'].map((val) => {
  return { text: val, value: val };
});

const captureSizeSocketName = 'Capture Size';

export class Video extends HybridNode2 {
  eventTarget: EventTarget;

  public getName(): string {
    return 'Video player';
  }

  public getDescription(): string {
    return 'Play a video or grab a frame. The video is stored locally.';
  }

  public getTags(): string[] {
    return ['Media'].concat(super.getTags());
  }

  public hasExample(): boolean {
    return true;
  }

  getShowLabels(): boolean {
    return false;
  }

  getPreferredInputSocketName(): string {
    return inputResourceIdSocketName;
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.OUTPUT);
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.IN,
        inputResourceIdSocketName,
        new FileType([
          '3gp',
          'avi',
          'flv',
          'mov',
          'mkv',
          'm4v',
          'mp4',
          'ogg',
          'qt',
          'swf',
          'webm',
          'wmv',
        ]),
        '',
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        playSocketName,
        new BooleanType(),
        true,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        loopSocketName,
        new BooleanType(),
        true,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        speedSocketName,
        new NumberType(false, 0, 10),
        1.0,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        muteSocketName,
        new BooleanType(),
        true,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        volumeSocketName,
        new NumberType(false, 0, 1),
        1.0,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        posTimeSocketName,
        new NumberType(),
        undefined,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        posPercSocketName,
        new NumberType(false, 0, 100),
        undefined,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        captureSizeSocketName,
        new EnumType(SIMPLE_SIZE_OPTIONS, undefined, true),
        SIMPLE_SIZE_OPTIONS[1].text,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        getFrameSocketName,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'getCurrentFrame'),
        0,
        true,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        toggleSecondsPercentSocketName,
        new EnumType(toggleOptions, undefined, true),
        toggleOptions[0].text,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        frameArraySocketName,
        new ArrayType(),
        [0, 0.25, 0.5, 1],
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        getFramesSocketName,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'getFrameArray'),
        0,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.OUT,
        outputSocketName,
        new ImageType(),
        DEFAULT_IMAGE,
      ),
      new PPSocket(
        SOCKET_TYPE.OUT,
        outputArraySocketName,
        new ArrayType(),
        [],
        false,
      ),
      new PPSocket(SOCKET_TYPE.OUT, outputDetailsSocketName, new JSONType()),
    ];
  }

  public getMinNodeHeight(): number {
    return 30;
  }

  public getDefaultNodeWidth(): number {
    return 400;
  }

  public getDefaultNodeHeight(): number {
    return 200;
  }

  public onNodeAdded = async (source: TNodeSource): Promise<void> => {
    this.eventTarget = new EventTarget();
    await super.onNodeAdded(source);
  };

  async onRemoved(): Promise<void> {
    await super.onRemoved();
  }

  updateAndExecute = (localResourceId: string): void => {
    this.setInputData(inputResourceIdSocketName, localResourceId);
    this.executeOptimizedChain().catch((error) => {
      console.error(error);
    });
  };

  loadResource = async (resourceId) => {
    return PPStorage.getInstance().loadResource(resourceId);
  };

  getFrameArray = async () => {
    this.eventTarget.dispatchEvent(new Event('getFrameArray'));
  };

  getCurrentFrame = async () => {
    this.eventTarget.dispatchEvent(new Event('getCurrentFrame'));
  };

  // small presentational component
  public getWidgetContent(
    props: HybridWidgetContentProps<Video>,
  ): React.ReactElement {
    return <VideoComponent node={this} {...props} />;
  }
}

const VideoComponent: React.FC<{
  node: Video;
  disabled?: boolean;
}> = ({ node, disabled, ...props }) => {
  const resizeObserver = useRef<ResizeObserver | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [localResourceId, setLocalResourceId] = useState(
    props[inputResourceIdSocketName],
  );
  const [videoSrc, setVideoSrc] = useState<string | undefined>(undefined);
  const [contentHeight, setContentHeight] = useState(0);
  const [loadingState, setLoadingState] = useState(LOADING_STATE.ISLOADING);

  useEffect(() => {
    const eventTarget = node.eventTarget;
    eventTarget.addEventListener('getFrameArray', captureMultipleFrames);
    eventTarget.addEventListener('getCurrentFrame', captureCurrentFrame);

    return () => {
      eventTarget.removeEventListener('getFrameArray', captureMultipleFrames);
      eventTarget.removeEventListener('getCurrentFrame', captureCurrentFrame);
    };
  }, [
    props[toggleSecondsPercentSocketName],
    props[frameArraySocketName],
    props[captureSizeSocketName],
  ]);

  const setupVideoEventListeners = () => {
    if (videoRef.current) {
      videoRef.current.addEventListener('error', handleVideoError);
      videoRef.current.addEventListener(
        'loadedmetadata',
        handleVideoMetadataLoaded,
      );
    }
  };

  const setupResizeObserver = () => {
    resizeObserver.current = new ResizeObserver(handleResize);
    // observe this instance's own <video> via ref, not a global id lookup -
    // the same node's content renders more than once at a time (canvas
    // preview + surface-embedded widget both use id={node.id}), so
    // document.getElementById(node.id) is ambiguous between the two
    if (videoRef.current) resizeObserver.current.observe(videoRef.current);
  };

  const cleanupEventListeners = () => {
    // Clean up ResizeObserver
    if (videoRef.current && resizeObserver.current)
      resizeObserver.current.unobserve(videoRef.current);

    // Clean up video event listeners
    if (videoRef.current) {
      videoRef.current.removeEventListener('error', handleVideoError);
      videoRef.current.removeEventListener(
        'loadedmetadata',
        handleVideoMetadataLoaded,
      );
    }
  };

  const handleVideoError = () => {
    console.error(`Error loading video`);
    setLoadingState(LOADING_STATE.FAILED);
    setVideoSrc(undefined);
  };

  const handleVideoMetadataLoaded = useCallback(() => {
    const video = videoRef.current;
    const captureSize = getCaptureSize(props[captureSizeSocketName]);
    if (video && localResourceId) {
      const details = {
        name: getFileNameFromLocalResourceId(localResourceId),
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        captureWidth: video.videoWidth * captureSize,
        captureHeight: video.videoHeight * captureSize,
        duration: video.duration,
      };
      node.setOutputData(outputDetailsSocketName, details);
      void node.executeChildren();
    }
  }, [localResourceId]);

  useEffect(() => {
    setupVideoEventListeners();
    setupResizeObserver();

    return cleanupEventListeners;
  }, [handleVideoMetadataLoaded]);

  const handleResize = (entries: ResizeObserverEntry[]) => {
    for (const entry of entries) {
      setContentHeight(entry.borderBoxSize[0].blockSize);
    }
  };

  const getCaptureSize = (captureSizeName: string) =>
    SIMPLE_SIZE_OPTIONS.find((option) => option.text === captureSizeName).value;

  const getCanvasAndContext = (
    scaleFactor: number,
  ): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth * scaleFactor;
    canvas.height = videoRef.current.videoHeight * scaleFactor;
    const context = canvas.getContext('2d');
    return [canvas, context];
  };

  const captureFrame = (scaleFactor: number) => {
    const [canvas, context] = getCanvasAndContext(scaleFactor);
    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL();
  };

  const executeChildrenDebounce = debounce(
    () => {
      void node.executeChildren();
    },
    1000,
    {
      maxWait: 1000,
    },
  );

  const captureCurrentFrame = () => {
    const captureSize = getCaptureSize(props[captureSizeSocketName]);
    node.setOutputData(outputSocketName, captureFrame(captureSize));
    executeChildrenDebounce();
  };

  const captureMultipleFrames = useCallback(async () => {
    const captureSize = getCaptureSize(props[captureSizeSocketName]);
    const duration = videoRef.current.duration;
    const arrayToCapture = props[frameArraySocketName];
    const timeArray =
      props[toggleSecondsPercentSocketName] === toggleOptions[1].text
        ? arrayToCapture
        : arrayToCapture.map((frame) => frame * duration);
    const totalFrames = arrayToCapture.length;

    const imageArray: string[] = Array(totalFrames);
    node.setOutputData(outputArraySocketName, imageArray);

    await processFramesBatch(timeArray, captureSize, imageArray);

    // Set the output data after processing
    node.setOutputData(outputArraySocketName, imageArray);
    executeChildrenDebounce();
  }, [
    props[toggleSecondsPercentSocketName],
    props[frameArraySocketName],
    props[captureSizeSocketName],
  ]);

  const processFramesBatch = async (
    timeArray: number[],
    captureSize: number,
    imageArray: string[],
  ) => {
    for (let i = 0; i < timeArray.length; i += 1) {
      videoRef.current.currentTime = timeArray[i];
      await new Promise<void>((resolve) => {
        const seekedHandler = () => {
          resolve();
          videoRef.current.removeEventListener('seeked', seekedHandler);
        };
        videoRef.current.addEventListener('seeked', seekedHandler);
      });

      // Capture the frame
      const [canvas, context] = getCanvasAndContext(captureSize);
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const base64ImageData = canvas.toDataURL();
      // Store the image data in the appropriate index
      imageArray[i] = base64ImageData; // Use i + index to map correctly
    }
  };

  useEffect(() => {
    if (!node.destroyed) {
      node.resizeAndDraw(node.nodeWidth, contentHeight);
    }
  }, [contentHeight]);

  useEffect(() => {
    void loadVideo(props[inputResourceIdSocketName]);
  }, [props[inputResourceIdSocketName]]);

  const loadVideo = async (resourceId: string) => {
    setLocalResourceId(resourceId);
    if (resourceId) {
      setLoadingState(LOADING_STATE.ISLOADING);
      try {
        const blob = await node.loadResource(resourceId);
        if (blob) {
          setVideoSrc(URL.createObjectURL(blob));
          setLoadingState(LOADING_STATE.LOADED);
        } else {
          listenForResourceUpdate(resourceId);
        }
      } catch (e) {
        console.error(e);
        setLoadingState(LOADING_STATE.FAILED);
      }
    }
  };

  const listenForResourceUpdate = (resourceId: string) => {
    const listenID = InterfaceController.addListener(
      ListenEvent.ResourceUpdated,
      async (data: any) => {
        if (data.id === resourceId) {
          try {
            const blob = await node.loadResource(resourceId);
            setVideoSrc(URL.createObjectURL(blob));
            setLoadingState(LOADING_STATE.LOADED);
          } catch (e) {
            console.error(e);
            setLoadingState(LOADING_STATE.FAILED);
          } finally {
            InterfaceController.removeListener(listenID);
          }
        }
      },
    );
  };

  useEffect(() => {
    if (videoRef.current && videoSrc) {
      if (props[playSocketName]) {
        void videoRef.current.play();
      } else {
        void videoRef.current.pause();
      }
    }
  }, [props[playSocketName]]);

  useEffect(() => {
    videoRef.current && (videoRef.current.loop = props[loopSocketName]);
  }, [props[loopSocketName]]);

  useEffect(() => {
    videoRef.current &&
      (videoRef.current.playbackRate = props[speedSocketName]);
  }, [props[speedSocketName]]);

  useEffect(() => {
    videoRef.current && (videoRef.current.muted = props[muteSocketName]);
  }, [props[muteSocketName]]);

  useEffect(() => {
    videoRef.current && (videoRef.current.volume = props[volumeSocketName]);
  }, [props[volumeSocketName]]);

  useEffect(() => {
    videoRef.current &&
      (videoRef.current.currentTime = props[posTimeSocketName]);
  }, [props[posTimeSocketName]]);

  useEffect(() => {
    if (videoRef.current?.duration) {
      videoRef.current.currentTime =
        (props[posPercSocketName] / 100) * videoRef.current.duration;
    }
  }, [props[posPercSocketName]]);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <ThemeProvider theme={customTheme}>
        <Box
          sx={{
            bgcolor: 'background.default',
          }}
        >
          <video
            autoPlay={videoSrc ? props[playSocketName] : false}
            id={node.id}
            ref={videoRef}
            style={{
              width: '100%',
              visibility: videoSrc ? UNSET_VALUE : 'hidden',
              pointerEvents: getCanvasWidgetPointerEvents({
                ...props,
                disabled,
                node,
              }),
            }}
            src={videoSrc}
            controls={!disabled}
          />
          <VideoOverlay
            loadingState={loadingState}
            localResourceId={localResourceId}
          />
        </Box>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

const VideoOverlay: React.FC<{
  loadingState: string;
  localResourceId: string;
}> = ({ loadingState, localResourceId }) => (
  <Grid
    container
    alignItems="center"
    justifyContent="center"
    direction="column"
    sx={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '100%',
      pointerEvents: 'none',
      rowGap: '8px',
    }}
  >
    {localResourceId && loadingState === LOADING_STATE.ISLOADING && (
      <CircularProgressWithLabel variant="indeterminate" />
    )}
    {loadingState === LOADING_STATE.FAILED && (
      <Box>Unfortunately this video codec is not supported</Box>
    )}
  </Grid>
);

function CircularProgressWithLabel(
  props: CircularProgressProps & { variant: string; value?: number },
) {
  return (
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <CircularProgress variant={props.variant} {...props} />
      {props.value && (
        <Box
          sx={{
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            position: 'absolute',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography
            variant="caption"
            component="div"
            color="text.secondary"
          >{`${Math.round(props.value)}%`}</Typography>
        </Box>
      )}
    </Box>
  );
}
