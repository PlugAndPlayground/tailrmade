import React from 'react';
import { Button, Stack, styled } from '@mui/material';
import { BlueskyIcon, DiscordIcon, RedditIcon } from '../utils/icons';
import { TRgba } from '../utils/color';

export const StyledSocialButton = styled(Button, {
  shouldForwardProp: (prop) => prop !== 'isSelected',
})<any>(({ theme, isSelected }) => ({
  minWidth: 0,
  padding: theme.spacing(0.5),
  backgroundColor: theme.palette.common.white,
  borderRadius: theme.shape.borderRadius,
  '&:hover': {
    backgroundColor: theme.palette.grey[100],
  },
  width: 28,
  height: 28,
}));

const SocialIcons = (props) => {
  return (
    <Stack
      spacing={0.5}
      alignItems="left"
      sx={{
        display: 'flex',
        gap: 0.5,
        '--svg-fill-color': TRgba.fromString(props.randomMainColor).hex(),
      }}
    >
      <StyledSocialButton
        title="Open discord"
        data-cy="open-social-discord"
        onClick={() => window.open('https://discord.gg/JWMsz8vrx4', '_blank')}
        sx={{ background: 'transparent', borderRadius: '24px' }}
      >
        <DiscordIcon />
      </StyledSocialButton>
      <StyledSocialButton
        title="Open reddit"
        data-cy="open-social-redit"
        onClick={() =>
          window.open('https://www.reddit.com/r/tailrmade', '_blank')
        }
        sx={{ background: 'transparent', borderRadius: '24px' }}
      >
        <RedditIcon />
      </StyledSocialButton>
      <StyledSocialButton
        title="Open bluesky"
        data-cy="open-social-bluesky"
        onClick={() =>
          window.open('https://bsky.app/profile/tailrmade.app', '_blank')
        }
        sx={{ background: 'transparent', borderRadius: '24px' }}
      >
        <BlueskyIcon />
      </StyledSocialButton>
    </Stack>
  );
};

export default SocialIcons;
