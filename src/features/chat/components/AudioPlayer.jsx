import React, { useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';

const safeDuration = value => Number.isFinite(value) && value > 0 ? value : 0;
const formatTime = value => {
  const seconds = Math.floor(Math.max(0, Number.isFinite(value) ? value : 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

// Remount state with the resource: signed URL refreshes must not retain stale
// duration, playback or error state. No media contents enter telemetry.
export default function AudioPlayer({ src }) {
  return <AudioControls key={src} src={src} />;
}

function AudioControls({ src }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState(false);
  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    setError(false);
    if (!audio.paused) { audio.pause(); return; }
    try { await audio.play(); }
    catch { setIsPlaying(false); setError(true); }
  };
  const updateDuration = () => setDuration(safeDuration(audioRef.current.duration));
  const seek = event => {
    if (!duration) return;
    const next = Number(event.target.value);
    if (!Number.isFinite(next)) return;
    const bounded = Math.min(duration, Math.max(0, next));
    audioRef.current.currentTime = bounded;
    setCurrentTime(bounded);
  };
  return (
    <div className="w-64 max-w-full min-w-0 text-foreground bg-background rounded-lg p-1">
      <audio ref={audioRef} src={src} preload="metadata"
        onLoadedMetadata={updateDuration} onDurationChange={updateDuration}
        onTimeUpdate={() => setCurrentTime(Math.max(0, audioRef.current.currentTime || 0))}
        onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)}
        onError={() => { setIsPlaying(false); setError(true); }} />
      <div className="flex items-center gap-2 min-w-0">
        <Button type="button" size="icon" variant="ghost" className="rounded-full h-11 w-11 shrink-0"
          disabled={!src} aria-label={isPlaying ? 'Pausar áudio' : 'Reproduzir áudio'} onClick={togglePlay}>
          {isPlaying ? <Pause aria-hidden="true" className="w-4 h-4" /> : <Play aria-hidden="true" className="w-4 h-4" />}
        </Button>
        <input type="range" aria-label="Posição do áudio" min="0" max={duration || 1} step="any"
          value={Math.min(currentTime, duration)} disabled={!duration} onChange={seek}
          aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
          className="min-w-0 w-full h-11 accent-primary cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
      </div>
      <p className="text-xs text-right px-2 tabular-nums" aria-hidden="true">{formatTime(currentTime)} / {formatTime(duration)}</p>
      {error && <p role="alert" className="text-sm px-2">Não foi possível reproduzir o áudio. Tente novamente.</p>}
    </div>
  );
}
