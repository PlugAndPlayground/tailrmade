import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import ErrorFallback from './ErrorFallback';
import PPNode from '../classes/NodeClass';

interface HybridNodeErrorBoundaryProps {
  children: React.ReactNode;
  node: PPNode;
}

/**
 * Reusable error boundary wrapper for hybrid nodes (widgets, canvas nodes, etc).
 * Catches errors in React rendering and provides recovery options.
 * Shows inline error UI that doesn't cover the entire app.
 */
export const HybridNodeErrorBoundary: React.FC<
  HybridNodeErrorBoundaryProps
> = ({ children, node }) => {
  return (
    <ErrorBoundary
      FallbackComponent={(errorProps) => (
        <ErrorFallback {...errorProps} inline={true} />
      )}
      onReset={() => {
        // Re-execute the node when user clicks "Try again"
        node.executeOptimizedChain().catch(console.error);
      }}
      onError={(error, info) => {
        console.error(
          `Error in dashboard widget for node ${node.getName()} (${node.id}):`,
          error,
          info,
        );
      }}
    >
      {children}
    </ErrorBoundary>
  );
};
