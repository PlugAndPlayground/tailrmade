import React, { useEffect, useState, useRef } from 'react';
import Spinner from '../components/Spinner';
import InterfaceController, { ListenEvent } from '../InterfaceController';

interface SpinnerState {
  visible: boolean;
  currentMessage: string;
  isSuccess: boolean;
  isExiting: boolean;
}

const SpinnerContainer: React.FC = () => {
  const [spinnerState, setSpinnerState] = useState<SpinnerState>({
    visible: false,
    currentMessage: '',
    isSuccess: false,
    isExiting: false,
  });

  // Track message stack - messages accumulate here
  const messageStackRef = useRef<string[]>([]);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimeouts = () => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
    if (exitTimeoutRef.current) {
      clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = null;
    }
  };

  const showLatestMessage = () => {
    const latestMessage =
      messageStackRef.current[messageStackRef.current.length - 1];
    if (latestMessage) {
      setSpinnerState({
        visible: true,
        currentMessage: latestMessage,
        isSuccess: false,
        isExiting: false,
      });
    }
  };

  const hideSpinner = () => {
    setSpinnerState((prev) => ({
      ...prev,
      visible: false,
      currentMessage: '',
      isSuccess: false,
      isExiting: false,
    }));
  };

  useEffect(() => {
    InterfaceController.showSpinner = (message: string) => {
      // Add message to stack if not already present
      if (!messageStackRef.current.includes(message)) {
        messageStackRef.current.push(message);
      }

      // Clear any pending timeouts
      clearTimeouts();

      // Show the latest message
      showLatestMessage();
    };

    InterfaceController.hideSpinner = (message?: string) => {
      if (!message) {
        // No specific message provided - clear all messages
        messageStackRef.current = [];
        clearTimeouts();
        hideSpinner();
        return;
      }

      // Remove specific message from stack
      const messageIndex = messageStackRef.current.indexOf(message);
      if (messageIndex === -1) {
        return; // Message not found in stack
      }

      messageStackRef.current.splice(messageIndex, 1);

      // If no messages left, exit spinner
      if (messageStackRef.current.length === 0) {
        clearTimeouts();

        // Show success state first
        setSpinnerState((prev) => ({
          ...prev,
          isSuccess: true,
          isExiting: false,
        }));

        // Start exit sequence after success display
        successTimeoutRef.current = setTimeout(
          () => {
            setSpinnerState((prev) => ({
              ...prev,
              isExiting: true,
            }));

            // Complete exit after animation
            exitTimeoutRef.current = setTimeout(() => {
              hideSpinner();
            }, 300); // Match CSS transition duration
          },
          InterfaceController.toastEverything ? 5000 : 700,
        ); // Show success for 700ms
      } else {
        // Show the latest remaining message
        showLatestMessage();
      }
    };

    // Cleanup on unmount
    return () => {
      clearTimeouts();
      messageStackRef.current = [];
    };
  }, []);

  return (
    <Spinner
      visible={spinnerState.visible}
      message={spinnerState.currentMessage}
      isSuccess={spinnerState.isSuccess}
      isExiting={spinnerState.isExiting}
    />
  );
};

export default SpinnerContainer;
