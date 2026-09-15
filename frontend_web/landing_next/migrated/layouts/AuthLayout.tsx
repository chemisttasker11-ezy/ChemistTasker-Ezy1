import type { ReactNode } from 'react';
import { Container, Paper, Typography } from '@mui/material';
export default function AuthLayout({ children, title, maxWidth = 'sm', noCard = false, showTitle = true }: {children: ReactNode; title: string; maxWidth?: 'xs'|'sm'|'md'|'lg'|'xl'|false; noCard?: boolean; showTitle?: boolean}) {
 return <Container maxWidth={maxWidth} sx={{ py: {xs:3,md:5} }}>
 {showTitle && <Typography variant="h4" component="h2" sx={{mb:3,textAlign:'center'}}>{title}</Typography>}
 {noCard ? children : <Paper variant="outlined" sx={{p:{xs:3,md:5},borderRadius:5}}>{children}</Paper>}
 </Container>;
}