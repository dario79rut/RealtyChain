import React from 'react';
import { mediaUrl } from '../../utils/api';

export function PropertyThumb({
  title,
  imageUrl,
  className = 'h-14 w-20',
}: {
  title: string;
  imageUrl?: string | null;
  className?: string;
}) {
  const src = mediaUrl(imageUrl);
  if (!src) {
    return (
      <span className={`inline-flex items-center justify-center rounded-lg bg-void-700 text-[10px] uppercase tracking-wide text-cream-400 ${className}`}>
        No photo
      </span>
    );
  }
  return <img src={src} alt="" title={title} className={`rounded-lg object-cover shrink-0 bg-void-700 ${className}`} />;
}
