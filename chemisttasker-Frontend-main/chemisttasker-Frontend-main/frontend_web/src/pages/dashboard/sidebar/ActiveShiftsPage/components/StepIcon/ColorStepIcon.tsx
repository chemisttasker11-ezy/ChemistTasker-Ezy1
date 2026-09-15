import React from 'react';
import { styled } from '@mui/material/styles';

const ColorStepIconRoot = styled('div')<{ ownerState: { completed?: boolean; active?: boolean } }>(
    ({ theme, ownerState }) => ({
        backgroundColor: '#E5E7EB',
        zIndex: 1,
        color: '#6B7280',
        width: 50,
        height: 50,
        display: 'flex',
        borderRadius: '50%',
        justifyContent: 'center',
        alignItems: 'center',
        transition: 'all 0.3s ease-in-out',
        ...(ownerState.active && {
            backgroundColor: theme.palette.primary.main,
            color: '#fff',
            boxShadow: '0 6px 15px 0 rgba(109, 40, 217, 0.4)',
        }),
        ...(ownerState.completed && {
            backgroundColor: theme.palette.primary.dark,
            color: '#fff',
        }),
    })
);

export function ColorStepIcon(props: { active?: boolean; completed?: boolean; icon: React.ElementType }) {
    const { icon: Icon } = props;
    return (
        <ColorStepIconRoot ownerState={props}>
            <Icon sx={{ fontSize: 24 }} />
        </ColorStepIconRoot>
    );
}
