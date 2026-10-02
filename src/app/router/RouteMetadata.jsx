import React from 'react';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { getRouteMetadata, PUBLIC_ORIGIN } from './metadataPolicy';
export default function RouteMetadata() {
  const { pathname } = useLocation();
  const meta = getRouteMetadata(pathname);
  return <Helmet><title>{meta.title}</title><meta name="description" content={meta.description} /><meta name="robots" content={meta.robots} /><link rel="canonical" href={meta.canonical} />
    <meta property="og:title" content={meta.title} /><meta property="og:description" content={meta.description} /><meta property="og:url" content={meta.canonical} /><meta property="og:image" content={`${PUBLIC_ORIGIN}/og-image.png`} />
    <meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content={meta.title} /><meta name="twitter:description" content={meta.description} /><meta name="twitter:image" content={`${PUBLIC_ORIGIN}/og-image.png`} />
  </Helmet>;
}
