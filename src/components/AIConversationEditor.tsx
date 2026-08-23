import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AddAPhotoOutlined as AddCaptureIcon,
  UploadFileOutlined as UploadIcon,
  Cancel as CancelIcon,
  CheckCircle as CheckCircleIcon,
  Close as CloseIcon,
  ContentCopy as ContentCopyIcon,
  ErrorOutlineOutlined as ErrorOutlineIcon,
  Lock as LockIcon,
  ManageSearch as ManageSearchIcon,
  PlayArrow as SendIcon,
  SmartToy as AssistantIcon,
  Terminal as TerminalIcon,
} from '@mui/icons-material';
import {
  AIBackend,
  AIConversationMessage,
  AIConversationSender,
} from '../services/AIBackend';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { BackendGateway } from '../services/BackendGateway';
import { CLOUD_MODE, EXECUTION_LOCATION_LOCAL } from '../services/shared-types';
import { useUserPreferences } from './useUserPreferences';
import {
  CAPTURE_SOURCES,
  CaptureSource,
  capture,
} from '../services/CaptureService';

const panelBorder = '1px solid rgba(255,255,255,0.16)';
const panelSurface = 'rgba(255,255,255,0.08)';
const panelSurfaceStrong = 'rgba(255,255,255,0.13)';
const secondaryText = 'rgba(255,255,255,0.72)';

interface CodePart {
  type: 'code';
  language: string;
  content: string;
}

interface TextPart {
  type: 'text';
  content: string;
}

interface ActionPart {
  type: 'action';
  status: 'success' | 'error' | 'checking' | 'limit';
  label: string;
  detail?: string;
  toolName?: string;
}

type ContentPart = CodePart | TextPart | ActionPart;

const toolActionRegex =
  /\*(?:Using\s+([A-Za-z0-9_.:-]+)\.\.\.|Used\s+([A-Za-z0-9_.:-]+)\.|([A-Za-z0-9_.:-]+)\s+failed:\s+([\s\S]*?)|Checking graph warnings and errors before finishing\.\.\.|Completed\s+(\d+)\s+MCP tool call\(s\)\.)\*|Stopped after reaching the MCP turn limit \((\d+)\) for this request\./g;

const pushTextPart = (parts: ContentPart[], content: string) => {
  const normalized = content.replace(/\n{3,}/g, '\n\n');
  if (normalized.trim()) {
    parts.push({
      type: 'text',
      content: normalized,
    });
  }
};

const parseActionPart = (match: RegExpExecArray): ActionPart | undefined => {
  if (match[1]) {
    return undefined;
  }

  if (match[2]) {
    return {
      type: 'action',
      status: 'success',
      label: match[2],
      toolName: match[2],
    };
  }

  if (match[3]) {
    return {
      type: 'action',
      status: 'error',
      label: 'Action failed',
      toolName: match[3],
      detail: match[4]?.trim(),
    };
  }

  if (match[5]) {
    return undefined;
  }

  if (match[6]) {
    return {
      type: 'action',
      status: 'limit',
      label: 'Stopped at turn limit',
      detail: `${match[6]} turns`,
    };
  }

  return {
    type: 'action',
    status: 'checking',
    label: 'Checking warnings and errors',
  };
};

const splitActionsFromText = (content: string): ContentPart[] => {
  const parts: ContentPart[] = [];
  let lastIndex = 0;
  let match;

  toolActionRegex.lastIndex = 0;
  while ((match = toolActionRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      pushTextPart(parts, content.slice(lastIndex, match.index));
    }

    const actionPart = parseActionPart(match);
    if (actionPart) {
      parts.push(actionPart);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    pushTextPart(parts, content.slice(lastIndex));
  }

  return parts;
};

const detectAndFormatCode = (content: string): ContentPart[] => {
  const codeBlockRegex = /```(\w+)?[ \t]*\r?\n([\s\S]*?)```/g;
  const parts: ContentPart[] = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        ...splitActionsFromText(content.slice(lastIndex, match.index)),
      );
    }

    parts.push({
      type: 'code',
      language: match[1] || 'text',
      content: match[2].trim(),
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    const unclosedMatch = remaining.match(/```(\w+)?[ \t]*\r?\n([\s\S]*)/);
    if (unclosedMatch) {
      const unclosedIndex = remaining.indexOf('```');
      if (unclosedIndex > 0) {
        parts.push(...splitActionsFromText(remaining.slice(0, unclosedIndex)));
      }
      parts.push({
        type: 'code',
        language: unclosedMatch[1] || 'text',
        content: unclosedMatch[2].trim(),
      });
    } else {
      parts.push(...splitActionsFromText(remaining));
    }
  }

  return parts;
};

const CodeBlock = ({ content, language, onCopy }) => (
  <Box
    sx={{
      border: '1px solid rgba(255,255,255,0.12)',
      bgcolor: '#15181f',
      overflow: 'hidden',
      mt: 0.75,
    }}
  >
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1,
        py: 0.5,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <TerminalIcon sx={{ fontSize: 15, color: '#8ea3c8' }} />
        <Typography
          variant="caption"
          sx={{ color: '#a7b7d6', fontFamily: 'Roboto Mono, monospace' }}
        >
          {language}
        </Typography>
      </Box>
      <Tooltip title="Copy code">
        <IconButton
          aria-label="Copy code"
          onClick={onCopy}
          sx={{ color: '#a7b7d6' }}
        >
          <ContentCopyIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Box>
    <Typography
      component="pre"
      sx={{
        m: 0,
        p: 1.25,
        overflow: 'auto',
        color: '#e6edf8',
        fontFamily: 'Roboto Mono, Consolas, monospace',
        fontSize: '0.78rem',
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {content}
    </Typography>
  </Box>
);

const actionStatusStyle: Record<ActionPart['status'], { color: string }> = {
  success: { color: '#91e0ae' },
  error: { color: '#ffb0a6' },
  checking: { color: '#e1c77b' },
  limit: { color: '#ffcf8a' },
};

const ActionEvent = ({ part }: { part: ActionPart }) => {
  const style = actionStatusStyle[part.status];
  const icon =
    part.status === 'error' || part.status === 'limit' ? (
      <ErrorOutlineIcon sx={{ fontSize: 16, color: style.color }} />
    ) : part.status === 'checking' ? (
      <ManageSearchIcon sx={{ fontSize: 16, color: style.color }} />
    ) : (
      <CheckCircleIcon sx={{ fontSize: 16, color: style.color }} />
    );

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0.75,
        px: 1,
        py: 0.65,
        bgcolor: 'rgba(0,0,0,0.18)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderLeft: `2px solid ${style.color}`,
      }}
    >
      <Box sx={{ mt: 0.2, width: 16, display: 'grid', placeItems: 'center' }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            color: style.color,
            fontWeight: 700,
            lineHeight: 1.25,
            display: 'block',
          }}
        >
          {part.toolName || part.label}
        </Typography>
        {part.detail && (
          <Typography
            variant="caption"
            sx={{
              mt: 0.2,
              color: secondaryText,
              lineHeight: 1.35,
              wordBreak: 'break-word',
              display: 'block',
            }}
          >
            {part.detail}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

const formatTokenCount = (tokens: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(tokens);

const getTokenUsageTooltip = (message: AIConversationMessage): string => {
  const usage = message.tokenUsage;
  if (!usage) {
    return '';
  }

  const details = [
    `Input: ${formatTokenCount(usage.inputTokens)}`,
    `Output: ${formatTokenCount(usage.outputTokens)}`,
  ];
  if (usage.cacheCreationInputTokens) {
    details.push(
      `Cache write: ${formatTokenCount(usage.cacheCreationInputTokens)}`,
    );
  }
  if (usage.cacheReadInputTokens) {
    details.push(`Cache read: ${formatTokenCount(usage.cacheReadInputTokens)}`);
  }

  return details.join(' | ');
};

const MessageBubble = ({
  message,
  isStreaming,
  onCopy,
}: {
  message: AIConversationMessage;
  isStreaming: boolean;
  onCopy: (text: string) => void;
}) => {
  const isUser = message.sender === AIConversationSender.USER;
  const parts = detectAndFormatCode(message.content);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: isUser ? '1fr auto' : 'auto 1fr',
        gap: 1,
        alignItems: 'start',
      }}
    >
      {!isUser && (
        <Box
          sx={{
            width: 30,
            height: 30,
            display: 'grid',
            placeItems: 'center',
            bgcolor: panelSurfaceStrong,
            color: '#fff',
            border: panelBorder,
          }}
        >
          <AssistantIcon sx={{ fontSize: 18 }} />
        </Box>
      )}

      <Box
        sx={{
          justifySelf: isUser ? 'end' : 'start',
          maxWidth: '92%',
          minWidth: 0,
          bgcolor: isUser ? 'rgba(255,255,255,0.18)' : panelSurface,
          color: '#fff',
          border: panelBorder,
          px: 1.25,
          py: 1,
          boxShadow: 'none',
        }}
      >
        {message.content ? (
          <Stack spacing={0.5}>
            {parts.map((part, index) =>
              part.type === 'code' ? (
                <CodeBlock
                  key={index}
                  content={part.content}
                  language={part.language}
                  onCopy={() => onCopy(part.content)}
                />
              ) : part.type === 'action' ? (
                <ActionEvent key={index} part={part} />
              ) : (
                <Typography
                  key={index}
                  sx={{
                    whiteSpace: 'pre-wrap',
                    fontSize: '0.86rem',
                    lineHeight: 1.5,
                    wordBreak: 'break-word',
                  }}
                >
                  {part.content}
                  {isStreaming && index === parts.length - 1 ? '|' : ''}
                </Typography>
              ),
            )}
          </Stack>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={15} />
          </Box>
        )}
        <Box
          sx={{
            mt: 0.75,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            opacity: 0.7,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography variant="caption">
              {message.date.toLocaleTimeString()}
            </Typography>
            {!isUser && message.tokenUsage && (
              <Tooltip title={getTokenUsageTooltip(message)}>
                <Typography
                  variant="caption"
                  sx={{
                    color: secondaryText,
                    fontFamily: 'Roboto Mono, Consolas, monospace',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatTokenCount(message.tokenUsage.totalTokens)} tokens
                </Typography>
              </Tooltip>
            )}
          </Box>
          {!isUser && message.content && (
            <Tooltip title="Copy response">
              <IconButton
                aria-label="Copy response"
                onClick={() => onCopy(message.content)}
                sx={{ color: 'inherit', p: 0.25 }}
              >
                <ContentCopyIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
    </Box>
  );
};

const AIConversationEditor = ({
  conversationID,
  editable = true,
  selectedModel,
  performActions,
}: {
  conversationID: string;
  editable?: boolean;
  selectedModel: string;
  performActions: boolean;
}) => {
  const [messages, setMessages] = useState(
    AIBackend.getInstance().getConversation(conversationID),
  );
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [preferences] = useUserPreferences();
  const aiLocation = CLOUD_MODE
    ? preferences.aiLocation
    : EXECUTION_LOCATION_LOCAL;
  const [enableUI, setEnableUI] = useState(
    aiLocation === EXECUTION_LOCATION_LOCAL ||
      (CLOUD_MODE && BackendGateway.getInstance().getIsLoggedIn()),
  );
  const [isLoading, setIsLoading] = useState(false);
  // images the agent gets to look at, attached to the next message
  const [attachments, setAttachments] = useState<
    { label: string; dataURL: string }[]
  >([]);
  const [captureMenuAnchor, setCaptureMenuAnchor] =
    useState<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aiLocation === EXECUTION_LOCATION_LOCAL) {
      setEnableUI(true);
      return;
    }
    setEnableUI(CLOUD_MODE && BackendGateway.getInstance().getIsLoggedIn());
  }, [aiLocation]);

  useEffect(() => {
    if (!CLOUD_MODE) {
      return;
    }
    const id = InterfaceController.addListener(
      ListenEvent.UserHasProAccessChanged,
      (enabled) =>
        setEnableUI(aiLocation === EXECUTION_LOCATION_LOCAL || enabled),
    );
    return () => {
      InterfaceController.removeListener(id);
    };
  }, [aiLocation]);

  useEffect(() => {
    setMessages(AIBackend.getInstance().getConversation(conversationID));
    setIsLoading(false);
  }, [conversationID]);

  useEffect(() => {
    const id = InterfaceController.addListener(
      ListenEvent.newAIMessageArrived,
      () => {
        setMessages([
          ...AIBackend.getInstance().getConversation(conversationID),
        ]);
      },
    );
    return () => {
      InterfaceController.removeListener(id);
    };
  }, [conversationID]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  // the same CaptureService the Screenshot node uses. Runs from the click, so
  // the Screen source has the user gesture its permission prompt needs.
  const handleCapture = async (source: CaptureSource) => {
    setCaptureMenuAnchor(null);
    try {
      const result = await capture(source);
      setAttachments((current) => [
        ...current,
        { label: source, dataURL: result.dataURL },
      ]);
    } catch (error) {
      InterfaceController.showSnackBar(
        `${source} capture failed. ${(error as Error).message}`,
        { variant: 'error' },
      );
    }
  };

  const attachImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () =>
      setAttachments((current) => [
        ...current,
        {
          label: file.name || 'Pasted image',
          dataURL: reader.result as string,
        },
      ]);
    reader.onerror = () =>
      InterfaceController.showSnackBar(
        `Could not read ${file.name || 'the pasted image'}.`,
        { variant: 'error' },
      );
    reader.readAsDataURL(file);
  };

  // an image on the clipboard arrives as a file item, so pasting one anywhere
  // in the composer attaches it instead of dropping it on the floor
  const handlePaste = (clipboard: DataTransfer | null) => {
    Array.from(clipboard?.items ?? [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .forEach((item) => {
        const file = item.getAsFile();
        if (file) {
          attachImageFile(file);
        }
      });
  };

  const handleUpload = (files: FileList | null) => {
    Array.from(files ?? [])
      .filter((file) => file.type.startsWith('image/'))
      .forEach(attachImageFile);
  };

  const handleSubmit = async () => {
    if (isLoading || !inputValue.trim()) return;

    const prompt = inputValue.trim();
    const images = attachments.map((attachment) => attachment.dataURL);
    setInputValue('');
    setAttachments([]);
    setIsLoading(true);

    try {
      await AIBackend.getInstance().sendMessageClaude(
        conversationID,
        prompt,
        selectedModel,
        {
          performActions,
        },
        true,
        16384,
        images.length > 0 ? images : undefined,
      );
    } catch (error) {
      console.error('Failed to send message: ', error);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Failed to copy text: ', error);
    }
  };

  const handleCancel = () => {
    AIBackend.getInstance().cancelCurrentRequest(conversationID);
    setIsLoading(false);
  };

  const disabled = !enableUI || !editable;

  return (
    <Box
      sx={{
        minHeight: 0,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        color: '#fff',
        opacity: enableUI ? 1 : 0.55,
      }}
    >
      {!enableUI && (
        <Alert severity="info" sx={{ m: 1.25 }}>
          AI features require being signed in.
        </Alert>
      )}

      <Box
        ref={scrollerRef}
        sx={{
          minHeight: 0,
          flex: 1,
          overflow: 'auto',
          px: 1.5,
          py: 1.25,
          userSelect: 'text',
        }}
      >
        {messages.length === 0 ? (
          <Box
            sx={{
              mt: 2,
              p: 1.5,
              bgcolor: panelSurface,
              border: panelBorder,
            }}
          >
            <Typography variant="subtitle2">Ready for the next move</Typography>
            <Typography
              variant="body2"
              sx={{ mt: 0.5, color: secondaryText, lineHeight: 1.45 }}
            >
              Ask for a change, a diagnosis, or a graph-building step. Responses
              update here as the helper works.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1.25}>
            {messages.map((message, index) => (
              <MessageBubble
                key={index}
                message={message}
                isStreaming={isLoading && index === messages.length - 1}
                onCopy={copyToClipboard}
              />
            ))}
          </Stack>
        )}
      </Box>

      <Box
        sx={{
          p: 1.25,
          bgcolor: panelSurface,
          borderTop: panelBorder,
        }}
      >
        <Box
          data-cy="AI Composer"
          onPaste={(event) => handlePaste(event.clipboardData)}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
            p: 1,
            borderRadius: 1.5,
            bgcolor: panelSurface,
            border: '1px solid rgba(255,255,255,0.22)',
            '&:hover': { borderColor: 'rgba(255,255,255,0.38)' },
            '&:focus-within': { borderColor: 'rgba(255,255,255,0.6)' },
          }}
        >
          <TextField
            data-cy="AI Message Text Field"
            fullWidth
            multiline
            minRows={2}
            maxRows={8}
            variant="standard"
            inputRef={inputRef}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !disabled) {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="Tell the agent what to do next..."
            disabled={disabled || isLoading}
            slotProps={{
              input: { disableUnderline: true },
              htmlInput: {
                style: { fontFamily: 'Roboto Mono, monospace', fontSize: 14 },
              },
            }}
            sx={{
              '& .MuiInputBase-root': { color: '#fff', p: 0 },
              '& .MuiInputBase-input::placeholder': {
                color: 'rgba(255,255,255,0.74)',
                opacity: 1,
              },
            }}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            data-cy="AI Capture Upload Input"
            style={{ display: 'none' }}
            onChange={(event) => {
              handleUpload(event.target.files);
              // let the same file be picked again later
              event.target.value = '';
            }}
          />

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              minWidth: 0,
            }}
          >
            <Tooltip title="Show the agent a capture or an image">
              <span>
                <IconButton
                  data-cy="AI Message Attach Capture"
                  size="small"
                  onClick={(event) => setCaptureMenuAnchor(event.currentTarget)}
                  disabled={disabled || isLoading}
                  sx={{
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.42)',
                    borderRadius: 1,
                    '&.Mui-disabled': {
                      color: 'rgba(255,255,255,0.3)',
                      borderColor: 'rgba(255,255,255,0.2)',
                    },
                  }}
                >
                  <AddCaptureIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>

            <Stack
              direction="row"
              spacing={0.75}
              sx={{
                flex: 1,
                minWidth: 0,
                overflowX: 'auto',
                overflowY: 'hidden',
                py: attachments.length > 0 ? 0.25 : 0,
              }}
            >
              {attachments.map((attachment, index) => (
                <Tooltip
                  key={`${attachment.label}-${index}`}
                  title={attachment.label}
                >
                  <Box
                    sx={{
                      position: 'relative',
                      flexShrink: 0,
                      width: 40,
                      height: 30,
                      border: panelBorder,
                      borderRadius: 1,
                      overflow: 'hidden',
                      bgcolor: panelSurfaceStrong,
                    }}
                  >
                    <Box
                      component="img"
                      src={attachment.dataURL}
                      alt={attachment.label}
                      sx={{
                        display: 'block',
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                    <IconButton
                      size="small"
                      aria-label={`Remove ${attachment.label}`}
                      onClick={() =>
                        setAttachments((current) =>
                          current.filter((_, position) => position !== index),
                        )
                      }
                      sx={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        p: 0,
                        width: 16,
                        height: 16,
                        color: '#fff',
                        bgcolor: 'rgba(0,0,0,0.6)',
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.85)' },
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 12 }} />
                    </IconButton>
                  </Box>
                </Tooltip>
              ))}
            </Stack>

            {isLoading ? (
              <Tooltip title="Stop stream">
                <IconButton
                  data-cy="AI Message Stop"
                  size="small"
                  color="error"
                  onClick={handleCancel}
                  sx={{
                    border: '1px solid rgba(255,255,255,0.42)',
                    borderRadius: 1,
                  }}
                >
                  <CancelIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip title="Send">
                <span>
                  <IconButton
                    data-cy="AI Message Submit"
                    size="small"
                    onClick={handleSubmit}
                    disabled={disabled || !inputValue.trim()}
                    sx={{
                      borderRadius: 1,
                      color: '#12336f',
                      bgcolor: '#fff',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.86)' },
                      '&.Mui-disabled': {
                        color: 'rgba(18,51,111,0.4)',
                        bgcolor: 'rgba(255,255,255,0.3)',
                      },
                    }}
                  >
                    <SendIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Box>
        </Box>
        <Menu
          anchorEl={captureMenuAnchor}
          open={captureMenuAnchor !== null}
          onClose={() => setCaptureMenuAnchor(null)}
        >
          {CAPTURE_SOURCES.filter((source) => source !== 'ReactUI').map(
            (source) => (
              <MenuItem
                key={source}
                data-cy={`AI Capture ${source}`}
                onClick={() => void handleCapture(source)}
              >
                {source}
              </MenuItem>
            ),
          )}
          <MenuItem
            data-cy="AI Capture Upload"
            onClick={() => {
              setCaptureMenuAnchor(null);
              fileInputRef.current?.click();
            }}
          >
            <UploadIcon sx={{ fontSize: 18, mr: 1 }} />
            Upload image...
          </MenuItem>
          <Typography
            variant="caption"
            data-cy="AI Capture Paste Hint"
            sx={{
              display: 'block',
              px: 2,
              py: 0.5,
              color: secondaryText,
              pointerEvents: 'none',
            }}
          >
            ...or paste an image into the chat
          </Typography>
        </Menu>
        {!editable && (
          <Box
            sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            <LockIcon sx={{ fontSize: 15, color: secondaryText }} />
            <Typography variant="caption" sx={{ color: secondaryText }}>
              This conversation is locked.
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default AIConversationEditor;
