/**
 * TimelinePage — Guitar Hero-style 3D timeline flying through concert history.
 */

import { useRef, useState, useMemo, useCallback, Suspense } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars, Html } from "@react-three/drei";
import * as THREE from "three";
import { api, type ConcertListItem } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getHeadliner(c: ConcertListItem): string {
  const top = c.artists.filter((a) => a.role === "headliner" || a.role === "co_headliner");
  if (top.length > 0) return top.map((a) => a.name).join(" & ");
  return c.headlinerHint ?? c.artists[0]?.name ?? c.eventSeries?.name ?? "Unknown";
}

// Guitar Hero style lane colors
const LANE_COLORS = ["#22c55e", "#ef4444", "#eab308", "#3b82f6", "#f97316"];
const LANE_COUNT = 5;
const LANE_WIDTH = 1.8;
const TRACK_WIDTH = LANE_COUNT * LANE_WIDTH;

const STATUS_COLORS: Record<string, string> = {
  attended: "#22c55e",
  attending: "#eab308",
  interested: "#3b82f6",
  missed: "#ef4444",
  cancelled: "#6b7280",
  dismissed: "#6b7280",
};

// ─────────────────────────────────────────────────────────────────────────────
// 3D Components
// ─────────────────────────────────────────────────────────────────────────────

interface NoteProps {
  concert: ConcertListItem;
  position: [number, number, number];
  lane: number;
  index: number;
  cameraZ: number;
  totalLength: number;
  onHover: (concert: ConcertListItem | null) => void;
  onSelect: (concert: ConcertListItem) => void;
  isSelected: boolean;
}

function Note({ concert, position, lane, index, cameraZ, totalLength, onHover, onSelect, isSelected }: NoteProps) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const status = concert.attendance?.status ?? "attended";
  const color = STATUS_COLORS[status] ?? LANE_COLORS[lane % LANE_COUNT]!;

  // Wrap position for infinite loop
  let z = position[2];
  const relativeZ = z - cameraZ;

  // Wrap around for infinite scrolling
  if (relativeZ < -10) {
    z += totalLength;
  } else if (relativeZ > totalLength - 10) {
    z -= totalLength;
  }

  const distanceFromCamera = z - cameraZ;
  const isVisible = distanceFromCamera > -5 && distanceFromCamera < 60;
  const opacity = Math.min(1, Math.max(0.3, 1 - distanceFromCamera / 80));

  useFrame((state) => {
    if (glowRef.current) {
      // Pulsing glow effect
      const pulse = Math.sin(state.clock.elapsedTime * 3 + index) * 0.3 + 1;
      glowRef.current.scale.setScalar(hovered || isSelected ? 1.5 : pulse);
    }
  });

  if (!isVisible) return null;

  return (
    <group ref={groupRef} position={[position[0], position[1], z]}>
      {/* Outer glow ring */}
      <mesh ref={glowRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.5, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={(hovered || isSelected ? 0.9 : 0.5) * opacity}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Main note - Guitar Hero style gem */}
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHover(concert);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          onHover(null);
          document.body.style.cursor = "auto";
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(concert);
        }}
      >
        <cylinderGeometry args={[0.3, 0.35, 0.15, 32]} />
        <meshPhongMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered || isSelected ? 0.8 : 0.4}
          transparent
          opacity={opacity}
          shininess={150}
        />
      </mesh>

      {/* Center highlight */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
        <circleGeometry args={[0.15, 32]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.6 * opacity}
        />
      </mesh>

      {/* HTML label */}
      {distanceFromCamera < 15 && distanceFromCamera > -2 && (
        <Html position={[0, -1.5, 0]} center style={{ pointerEvents: "none" }}>
          <div
            className="whitespace-nowrap text-center"
            style={{ opacity: Math.min(1, (15 - distanceFromCamera) / 8) }}
          >
            <div
              className="font-display text-sm uppercase tracking-wide drop-shadow-lg"
              style={{ color, textShadow: `0 0 10px ${color}` }}
            >
              {getHeadliner(concert)}
            </div>
            <div className="font-mono text-text-muted text-[10px] mt-1.5 drop-shadow">
              {fmtShortDate(concert.date)}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

function Track({ cameraZ }: { cameraZ: number }) {
  const trackLength = 100;

  return (
    <group position={[0, -0.5, cameraZ + trackLength / 2]}>
      {/* Main track surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TRACK_WIDTH, trackLength]} />
        <meshBasicMaterial color="#0a0a0a" transparent opacity={0.8} />
      </mesh>

      {/* Lane dividers */}
      {Array.from({ length: LANE_COUNT + 1 }).map((_, i) => {
        const x = (i - LANE_COUNT / 2) * LANE_WIDTH;
        return (
          <mesh key={i} position={[x, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.05, trackLength]} />
            <meshBasicMaterial
              color={i === 0 || i === LANE_COUNT ? "#A8FF3E" : "#333333"}
              transparent
              opacity={i === 0 || i === LANE_COUNT ? 0.8 : 0.5}
            />
          </mesh>
        );
      })}

      {/* Lane glow lines */}
      {Array.from({ length: LANE_COUNT }).map((_, i) => {
        const x = (i - (LANE_COUNT - 1) / 2) * LANE_WIDTH;
        return (
          <mesh key={`glow-${i}`} position={[x, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.02, trackLength]} />
            <meshBasicMaterial color={LANE_COLORS[i]} transparent opacity={0.3} />
          </mesh>
        );
      })}

      {/* Beat markers every few units */}
      {Array.from({ length: 25 }).map((_, i) => {
        const z = i * 4 - trackLength / 2;
        const isMajor = i % 4 === 0;
        return (
          <mesh key={`beat-${i}`} position={[0, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[TRACK_WIDTH, isMajor ? 0.08 : 0.03]} />
            <meshBasicMaterial color="#A8FF3E" transparent opacity={isMajor ? 0.4 : 0.15} />
          </mesh>
        );
      })}

      {/* Strikeline at bottom */}
      <mesh position={[0, 0.05, -trackLength / 2 + 5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TRACK_WIDTH + 1, 0.3]} />
        <meshBasicMaterial color="#A8FF3E" transparent opacity={0.8} />
      </mesh>

      {/* Lane buttons at strikeline */}
      {Array.from({ length: LANE_COUNT }).map((_, i) => {
        const x = (i - (LANE_COUNT - 1) / 2) * LANE_WIDTH;
        return (
          <mesh key={`btn-${i}`} position={[x, 0.1, -trackLength / 2 + 5]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.4, 0.45, 0.1, 32]} />
            <meshBasicMaterial color={LANE_COLORS[i]} transparent opacity={0.6} />
          </mesh>
        );
      })}
    </group>
  );
}

function MonthMarker({ year, month, position, cameraZ, totalLength }: {
  year: number;
  month: number;
  position: [number, number, number];
  cameraZ: number;
  totalLength: number;
}) {
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Wrap position for infinite loop
  let z = position[2];
  const relativeZ = z - cameraZ;
  if (relativeZ < -10) z += totalLength;
  else if (relativeZ > totalLength - 10) z -= totalLength;

  const distanceFromCamera = z - cameraZ;
  if (distanceFromCamera < -5 || distanceFromCamera > 60) return null;

  const opacity = Math.min(1, Math.max(0.2, 1 - distanceFromCamera / 50));
  const isJanuary = month === 0;

  return (
    <group position={[0, -0.48, z]}>
      {/* Month line across track */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TRACK_WIDTH + 2, isJanuary ? 0.15 : 0.05]} />
        <meshBasicMaterial color={isJanuary ? "#A8FF3E" : "#444444"} transparent opacity={opacity * (isJanuary ? 0.9 : 0.4)} />
      </mesh>

      {/* Label on the side */}
      <Html position={[-TRACK_WIDTH / 2 - 1.5, 0.5, 0]} style={{ pointerEvents: "none" }}>
        <div style={{ opacity }} className="whitespace-nowrap">
          {isJanuary ? (
            <span className="font-display text-accent-lime text-2xl tracking-widest" style={{ textShadow: "0 0 20px #A8FF3E" }}>
              {year}
            </span>
          ) : (
            <span className="font-mono text-text-muted/50 text-sm">{MONTH_NAMES[month]}</span>
          )}
        </div>
      </Html>
    </group>
  );
}

function CameraController({ targetZ }: { targetZ: number }) {
  const { camera } = useThree();

  useFrame(() => {
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.1);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 6, 0.05);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, 0.05);
    camera.lookAt(0, -1, camera.position.z + 25);
  });

  return null;
}

interface TimelineSceneProps {
  concerts: ConcertListItem[];
  cameraZ: number;
  onHover: (concert: ConcertListItem | null) => void;
  onSelect: (concert: ConcertListItem) => void;
  selectedConcert: ConcertListItem | null;
  onTotalLengthChange: (length: number) => void;
}

function TimelineScene({ concerts, cameraZ, onHover, onSelect, selectedConcert, onTotalLengthChange }: TimelineSceneProps) {
  const { positions, monthMarkers, totalLength } = useMemo(() => {
    const pos: Array<{ concert: ConcertListItem; position: [number, number, number]; lane: number }> = [];
    const months: Array<{ year: number; month: number; position: [number, number, number] }> = [];

    if (concerts.length === 0) return { positions: pos, monthMarkers: months, totalLength: 100 };

    // Sort newest first
    const sorted = [...concerts].sort((a, b) => b.date.localeCompare(a.date));

    const newestDate = new Date(sorted[0]!.date);
    const oldestDate = new Date(sorted[sorted.length - 1]!.date);

    const totalMonths = (newestDate.getFullYear() - oldestDate.getFullYear()) * 12 +
      (newestDate.getMonth() - oldestDate.getMonth()) + 1;

    const monthSpacing = 5;
    const length = Math.max(totalMonths * monthSpacing, 50);

    // Create month markers
    let currentDate = new Date(newestDate.getFullYear(), newestDate.getMonth(), 1);
    const endDate = new Date(oldestDate.getFullYear(), oldestDate.getMonth(), 1);

    while (currentDate >= endDate) {
      const monthsFromNewest = (newestDate.getFullYear() - currentDate.getFullYear()) * 12 +
        (newestDate.getMonth() - currentDate.getMonth());
      const z = monthsFromNewest * monthSpacing;

      months.push({
        year: currentDate.getFullYear(),
        month: currentDate.getMonth(),
        position: [0, 0, z],
      });

      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    }

    // Position concerts on lanes
    sorted.forEach((concert, i) => {
      const concertDate = new Date(concert.date);
      const monthsFromNewest = (newestDate.getFullYear() - concertDate.getFullYear()) * 12 +
        (newestDate.getMonth() - concertDate.getMonth());
      const dayOffset = (concertDate.getDate() - 1) / 30 * monthSpacing;
      const z = monthsFromNewest * monthSpacing + dayOffset;

      // Assign to lane based on index, cycling through lanes
      const lane = i % LANE_COUNT;
      const x = (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH;

      pos.push({ concert, position: [x, 0, z], lane });
    });

    return { positions: pos, monthMarkers: months, totalLength: length };
  }, [concerts]);

  useMemo(() => {
    onTotalLengthChange(totalLength);
  }, [totalLength, onTotalLengthChange]);

  return (
    <>
      {/* Dark ambient with colored accents */}
      <ambientLight intensity={0.2} />
      <pointLight position={[0, 10, cameraZ + 15]} intensity={1.5} color="#ffffff" />
      <pointLight position={[-8, 5, cameraZ + 20]} intensity={0.8} color="#22c55e" />
      <pointLight position={[8, 5, cameraZ + 20]} intensity={0.8} color="#ef4444" />
      <spotLight position={[0, 15, cameraZ]} angle={0.5} intensity={2} color="#A8FF3E" />

      {/* Stars background */}
      <Stars radius={400} depth={300} count={10000} factor={4} saturation={0.2} fade speed={0.3} />

      {/* Guitar Hero track */}
      <Track cameraZ={cameraZ} />

      {/* Month markers */}
      {monthMarkers.map(({ year, month, position }) => (
        <MonthMarker
          key={`${year}-${month}`}
          year={year}
          month={month}
          position={position}
          cameraZ={cameraZ}
          totalLength={totalLength}
        />
      ))}

      {/* Concert notes */}
      {positions.map(({ concert, position, lane }, i) => (
        <Note
          key={concert.id}
          concert={concert}
          position={position}
          lane={lane}
          index={i}
          cameraZ={cameraZ}
          totalLength={totalLength}
          onHover={onHover}
          onSelect={onSelect}
          isSelected={selectedConcert?.id === concert.id}
        />
      ))}

      <CameraController targetZ={cameraZ} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function TimelinePage() {
  const [cameraZ, setCameraZ] = useState(-5);
  const [totalLength, setTotalLength] = useState(100);
  const [hoveredConcert, setHoveredConcert] = useState<ConcertListItem | null>(null);
  const [selectedConcert, setSelectedConcert] = useState<ConcertListItem | null>(null);

  const concertsQuery = useQuery({
    queryKey: ["concerts", "timeline"],
    queryFn: () => api.listConcerts({ limit: 1000, sort: "date_asc" }),
    staleTime: 60_000,
  });

  const concerts = concertsQuery.data?.concerts ?? [];

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY * 0.25;
    // Infinite loop - wrap around
    setCameraZ((z) => {
      let newZ = z + delta;
      if (newZ > totalLength) newZ -= totalLength;
      if (newZ < -5) newZ += totalLength;
      return newZ;
    });
  };

  const handleTotalLengthChange = useCallback((length: number) => {
    setTotalLength(length);
  }, []);

  if (concertsQuery.isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <p className="text-text-subtle font-mono text-sm animate-pulse">Loading timeline…</p>
      </div>
    );
  }

  if (concertsQuery.isError) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <p className="text-accent-pink font-mono text-sm">Failed to load concerts</p>
      </div>
    );
  }

  if (concerts.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <p className="text-text-muted font-mono text-sm">No shows yet</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black" onWheel={handleWheel}>
      <Canvas camera={{ position: [0, 6, -5], fov: 75 }}>
        <Suspense fallback={null}>
          <TimelineScene
            concerts={concerts}
            cameraZ={cameraZ}
            onHover={setHoveredConcert}
            onSelect={setSelectedConcert}
            selectedConcert={selectedConcert}
            onTotalLengthChange={handleTotalLengthChange}
          />
        </Suspense>
      </Canvas>

      {/* Title */}
      <div className="absolute top-6 left-6">
        <h1 className="font-display uppercase text-2xl" style={{ color: "#A8FF3E", textShadow: "0 0 20px #A8FF3E" }}>
          Timeline
        </h1>
        <p className="font-mono text-xs text-text-muted mt-1">
          {concerts.length} shows · scroll to shred
        </p>
      </div>

      {/* Back button */}
      <Link
        to="/shows"
        className="absolute top-6 right-6 font-mono text-sm text-text-muted hover:text-accent-lime transition-colors"
      >
        ← back
      </Link>

      {/* Hovered concert tooltip */}
      {hoveredConcert && !selectedConcert && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-black/90 backdrop-blur-sm border border-accent-lime/50 rounded-lg p-4 shadow-xl pointer-events-none">
          <div className="font-display uppercase text-lg text-accent-lime text-center" style={{ textShadow: "0 0 10px #A8FF3E" }}>
            {getHeadliner(hoveredConcert)}
          </div>
          <div className="text-sm font-mono text-text-muted mt-1 text-center">
            {fmtShortDate(hoveredConcert.date)}
          </div>
          {hoveredConcert.venue && (
            <div className="text-sm text-text-subtle mt-1 text-center">{hoveredConcert.venue.name}</div>
          )}
        </div>
      )}

      {/* Selected concert panel */}
      {selectedConcert && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-black/95 backdrop-blur-sm border border-accent-lime rounded-lg p-5 shadow-xl max-w-md w-full mx-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="font-display uppercase text-xl text-accent-lime" style={{ textShadow: "0 0 15px #A8FF3E" }}>
                {getHeadliner(selectedConcert)}
              </div>
              <div className="text-sm font-mono text-accent-lime/80 mt-1">
                {fmtShortDate(selectedConcert.date)}
              </div>
              {selectedConcert.venue && (
                <div className="text-sm text-text-muted mt-1">
                  {selectedConcert.venue.name}
                  {selectedConcert.venue.city && ` · ${selectedConcert.venue.city}`}
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedConcert(null)}
              className="text-text-subtle hover:text-accent-lime transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6l-12 12" />
              </svg>
            </button>
          </div>
          <Link
            to={`/shows/${selectedConcert.id}`}
            className="mt-4 block text-center font-mono px-4 py-3 rounded bg-accent-lime text-black font-bold hover:opacity-90 transition-opacity"
            style={{ boxShadow: "0 0 20px #A8FF3E" }}
          >
            View show →
          </Link>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-6 left-6 flex gap-4 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
          <span className="text-text-subtle">Attended</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#eab308", boxShadow: "0 0 8px #eab308" }} />
          <span className="text-text-subtle">Attending</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#3b82f6", boxShadow: "0 0 8px #3b82f6" }} />
          <span className="text-text-subtle">Interested</span>
        </div>
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-6 right-6 text-text-subtle/50 text-xs font-mono">
        ∞ infinite scroll
      </div>
    </div>
  );
}
