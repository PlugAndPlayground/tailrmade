import React from 'react';
import { Button } from '@mui/material';

/**
 * Primary button styled for tailrmade docs
 */
export const PrimaryButton = ({
  children,
  href,
  onClick,
  fullWidth,
  size = 'large',
  ...props
}) => {
  const buttonProps = {
    variant: 'contained' as const,
    size: size as 'small' | 'medium' | 'large',
    ...(onClick && { onClick }),
    ...(href &&
      !href.startsWith('http') && {
        onClick: (e) => {
          e.stopPropagation();
          window.location.href = href;
        },
      }),
    ...(href &&
      href.startsWith('http') && {
        onClick: (e) => {
          e.stopPropagation();
          window.open(href, '_blank');
        },
      }),
    sx: {
      ...(fullWidth && { width: '100%' }),
      ...(props.sx || {}),
      flex: props.sx?.flex || 1,
      backgroundColor: '#c44a6d',
      color: '#ffffff',
      fontWeight: 500,
      textTransform: 'none',
      borderRadius: '4px',
      height: size === 'large' ? '48px' : '36px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      '&:hover': {
        backgroundColor: '#a33d5b',
      },
      '& p': {
        margin: 0,
      },
    },
    ...props,
  };

  return <Button {...buttonProps}>{children}</Button>;
};

/**
 * Secondary (outlined) button styled for tailrmade docs
 */
export const SecondaryButton = ({
  children,
  href,
  onClick,
  fullWidth,
  size = 'large',
  ...props
}) => {
  const buttonProps = {
    variant: 'outlined' as const,
    size: size as 'small' | 'medium' | 'large',
    ...(onClick && { onClick }),
    ...(href &&
      !href.startsWith('http') && {
        onClick: (e) => {
          e.stopPropagation();
          window.location.href = href;
        },
      }),
    ...(href &&
      href.startsWith('http') && {
        onClick: (e) => {
          e.stopPropagation();
          window.open(href, '_blank');
        },
      }),
    sx: {
      ...(fullWidth && { width: '100%' }),
      ...(props.sx || {}),
      flex: props.sx?.flex || 1,
      borderColor: '#c44a6d',
      color: '#c44a6d',
      fontWeight: 500,
      textTransform: 'none',
      borderRadius: '4px',
      height: size === 'large' ? '48px' : '36px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      '&:hover': {
        borderColor: '#a33d5b',
        backgroundColor: 'rgba(196, 74, 109, 0.04)',
      },
      '& p': {
        margin: 0,
      },
    },
    ...props,
  };

  return <Button {...buttonProps}>{children}</Button>;
};
