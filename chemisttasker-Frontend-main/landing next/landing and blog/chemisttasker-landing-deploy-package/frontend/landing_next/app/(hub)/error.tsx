'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="container hub-empty" role="alert"><h1>This story couldn’t be loaded.</h1><p>The publishing service may be temporarily unavailable. Please try again.</p><button className="button primary" onClick={reset}>Try again</button></div>;
}
