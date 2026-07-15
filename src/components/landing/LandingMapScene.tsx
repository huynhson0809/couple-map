interface LandingMapSceneProps {
  label: string;
}

export function LandingMapScene({ label }: LandingMapSceneProps) {
  return (
    <div className="lp-map-canvas is-ready" role="img" aria-label={label}>
      <img
        src="/landing/da-nang-journey-map.jpg"
        alt=""
        loading="eager"
        decoding="async"
        fetchPriority="high"
      />
    </div>
  );
}
