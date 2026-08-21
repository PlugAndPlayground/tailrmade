import React from 'react';
import { Button, Stack, styled } from '@mui/material';
import { BlueskyIcon, DiscordIcon, GithubIcon } from '../utils/icons';
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
        // these buttons are transparent, so the icon colour has to follow
        // whatever the rail is sitting on - see Rail's iconColor
        '--svg-fill-color':
          props.iconColor ?? TRgba.fromString(props.randomMainColor).hex(),
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
        title="Open Tailrmade on GitHub"
        data-cy="open-social-github"
        onClick={() =>
          window.open(
            'https://github.com/PlugAndPlayground/tailrmade',
            '_blank',
          )
        }
        sx={{ background: 'transparent', borderRadius: '24px' }}
      >
        <GithubIcon />
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
