'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="ct-card ct-invite"><h1>The community is temporarily unavailable.</h1><p>Please try again in a moment.</p><button onClick={reset}>Try again</button></main>;}
