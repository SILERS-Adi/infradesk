import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Download, FileText, Image } from 'lucide-react';

interface Props {
  urls: string; // comma-separated
}

function getFilename(url: string) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/');
    return decodeURIComponent(parts[parts.length - 1]) || 'Załącznik';
  } catch {
    return url.split('/').pop() || 'Załącznik';
  }
}

function isImageUrl(url: string) {
  return /\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?|#|$)/i.test(url);
}

function isPdfUrl(url: string) {
  return /\.pdf(\?|#|$)/i.test(url);
}

interface AttachItem {
  url: string;
  name: string;
  isImg: boolean; // determined at render time via onError
}

export function AttachmentGallery({ urls }: Props) {
  const items: AttachItem[] = urls
    .split(',')
    .map(u => u.trim())
    .filter(Boolean)
    .map(url => ({ url, name: getFilename(url), isImg: true }));

  const [imgFailed, setImgFailed] = useState<Record<number, boolean>>({});
  const [lightbox, setLightbox] = useState<number | null>(null);

  const imgItems = items.filter((_, i) => !imgFailed[i]);
  const imgIndexes = items.reduce<number[]>((acc, _, i) => {
    if (!imgFailed[i]) acc.push(i);
    return acc;
  }, []);

  const lightboxPos = lightbox !== null ? imgIndexes.indexOf(lightbox) : -1;
  const canPrev = lightboxPos > 0;
  const canNext = lightboxPos < imgIndexes.length - 1;

  const goPrev = useCallback(() => {
    if (canPrev) setLightbox(imgIndexes[lightboxPos - 1]);
  }, [canPrev, imgIndexes, lightboxPos]);

  const goNext = useCallback(() => {
    if (canNext) setLightbox(imgIndexes[lightboxPos + 1]);
  }, [canNext, imgIndexes, lightboxPos]);

  useEffect(() => {
    if (lightbox === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox, goPrev, goNext]);

  if (items.length === 0) return null;

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-3">
        {items.map((item, i) => {
          const failed = imgFailed[i];

          if (failed || isPdfUrl(item.url)) {
            // File card
            return (
              <a
                key={i}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors text-sm text-gray-700 max-w-xs"
              >
                {isPdfUrl(item.url) ? (
                  <FileText className="h-4 w-4 text-red-400 flex-shrink-0" />
                ) : (
                  <Download className="h-4 w-4 text-gray-400 flex-shrink-0" />
                )}
                <span className="truncate">{item.name}</span>
              </a>
            );
          }

          // Try as image
          return (
            <button
              key={i}
              type="button"
              onClick={() => setLightbox(i)}
              className="relative group rounded-xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <img
                src={item.url}
                alt={item.name}
                className="h-28 w-auto object-cover cursor-zoom-in"
                onError={() => setImgFailed(prev => ({ ...prev, [i]: true }))}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                <Image className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          {/* Close */}
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Prev */}
          {canPrev && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              className="absolute left-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* Image */}
          <img
            src={items[lightbox].url}
            alt={items[lightbox].name}
            className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next */}
          {canNext && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goNext(); }}
              className="absolute right-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {/* Counter + name */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
            {items[lightbox].name} {imgIndexes.length > 1 && `(${lightboxPos + 1} / ${imgIndexes.length})`}
          </div>

          {/* Download */}
          <a
            href={items[lightbox].url}
            download
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 right-16 text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
          >
            <Download className="h-5 w-5" />
          </a>
        </div>
      )}
    </>
  );
}
