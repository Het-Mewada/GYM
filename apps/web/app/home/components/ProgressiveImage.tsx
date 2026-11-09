'use client';

import React, { useState, useEffect, useRef } from 'react';
import { HOME_ASSETS } from '../assets';

interface ProgressiveImageProps {
  assetId: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  sizes?: string;
  altOverride?: string;
}

export function ProgressiveImage({
  assetId,
  className = '',
  imgClassName = '',
  priority = false,
  sizes = '(min-width: 2560px) 3840px, (min-width: 1920px) 2560px, (min-width: 1280px) 1920px, 100vw',
  altOverride,
}: ProgressiveImageProps) {
  const asset = HOME_ASSETS[assetId];
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete) {
      setIsLoaded(true);
    }
  }, []);

  if (!asset) {
    return (
      <div className={`bg-neutral-900 border border-white/5 flex items-center justify-center text-xs text-neutral-500 ${className}`}>
        [Asset {assetId} missing]
      </div>
    );
  }

  const alt = altOverride || asset.alt;

  return (
    <div className={`relative overflow-hidden bg-[#111114] ${className}`}>
      {/* Fallback placeholder only until full-res is loaded */}
      {!isLoaded && asset.blurDataURL && (
        <div
          className="absolute inset-0 w-full h-full scale-105"
          style={{
            backgroundImage: `url(${asset.blurDataURL})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(10px)'
          }}
        />
      )}

      <picture>
        <source
          type="image/webp"
          srcSet={asset.srcsetWebp}
          sizes={sizes}
        />
        <img
          ref={imgRef}
          src={asset.srcJpg || asset.src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          onLoad={() => setIsLoaded(true)}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-90'
          } ${imgClassName}`}
        />
      </picture>
    </div>
  );
}
