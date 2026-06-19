const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

export interface TimelineCirclePinInput {
  id: string
}

export interface TimelineCircleLayoutOptions {
  centerX?: number
  centerY?: number
  radiusStep?: number
  maxNodeSize?: number
  minNodeSize?: number
  sizeFalloff?: number
  angleJitter?: number
  radiusJitter?: number
}

export interface TimelineCircleNode {
  id: string
  index: number
  newest: boolean
  x: number
  y: number
  radius: number
  angle: number
  size: number
  zIndex: number
}

export interface TimelineCircleBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  height: number
}

interface ResolvedTimelineCircleLayoutOptions {
  centerX: number
  centerY: number
  radiusStep: number
  maxNodeSize: number
  minNodeSize: number
  sizeFalloff: number
  angleJitter: number
  radiusJitter: number
}

const DEFAULT_OPTIONS: ResolvedTimelineCircleLayoutOptions = {
  centerX: 0,
  centerY: 0,
  radiusStep: 42,
  maxNodeSize: 78,
  minNodeSize: 34,
  sizeFalloff: 0.82,
  angleJitter: 0.16,
  radiusJitter: 7,
}

export function buildTimelineCircleLayout(
  pins: TimelineCirclePinInput[],
  options: TimelineCircleLayoutOptions = {},
): TimelineCircleNode[] {
  const resolvedOptions = resolveOptions(options)

  return pins.map((pin, index) => {
    const jitter = seededUnitPair(pin.id)
    const angle =
      index === 0
        ? 0
        : index * GOLDEN_ANGLE + (jitter.angle - 0.5) * resolvedOptions.angleJitter
    const radius =
      index === 0
        ? 0
        : Math.sqrt(index) * resolvedOptions.radiusStep +
          (jitter.radius - 0.5) * resolvedOptions.radiusJitter
    const size = nodeSize(index, resolvedOptions)

    return {
      id: pin.id,
      index,
      newest: index === 0,
      x: roundLayoutValue(resolvedOptions.centerX + Math.cos(angle) * radius),
      y: roundLayoutValue(resolvedOptions.centerY + Math.sin(angle) * radius),
      radius: roundLayoutValue(radius),
      angle: roundLayoutValue(angle),
      size,
      zIndex: 10000 - index,
    }
  })
}

export function getTimelineCircleBounds(nodes: TimelineCircleNode[]): TimelineCircleBounds {
  if (nodes.length === 0) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      width: 0,
      height: 0,
    }
  }

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const node of nodes) {
    const halfSize = node.size / 2
    minX = Math.min(minX, node.x - halfSize)
    maxX = Math.max(maxX, node.x + halfSize)
    minY = Math.min(minY, node.y - halfSize)
    maxY = Math.max(maxY, node.y + halfSize)
  }

  const roundedMinX = roundLayoutValue(minX)
  const roundedMaxX = roundLayoutValue(maxX)
  const roundedMinY = roundLayoutValue(minY)
  const roundedMaxY = roundLayoutValue(maxY)

  return {
    minX: roundedMinX,
    maxX: roundedMaxX,
    minY: roundedMinY,
    maxY: roundedMaxY,
    width: roundedMaxX - roundedMinX,
    height: roundedMaxY - roundedMinY,
  }
}

function resolveOptions(
  options: TimelineCircleLayoutOptions,
): ResolvedTimelineCircleLayoutOptions {
  const maxNodeSize = positiveFiniteNumber(
    options.maxNodeSize,
    DEFAULT_OPTIONS.maxNodeSize,
  )
  const minNodeSize = Math.min(
    positiveFiniteNumber(options.minNodeSize, DEFAULT_OPTIONS.minNodeSize),
    maxNodeSize,
  )

  return {
    centerX: finiteNumber(options.centerX, DEFAULT_OPTIONS.centerX),
    centerY: finiteNumber(options.centerY, DEFAULT_OPTIONS.centerY),
    radiusStep: positiveFiniteNumber(options.radiusStep, DEFAULT_OPTIONS.radiusStep),
    maxNodeSize,
    minNodeSize,
    sizeFalloff: unitIntervalExclusiveZero(
      options.sizeFalloff,
      DEFAULT_OPTIONS.sizeFalloff,
    ),
    angleJitter: nonNegativeFiniteNumber(
      options.angleJitter,
      DEFAULT_OPTIONS.angleJitter,
    ),
    radiusJitter: nonNegativeFiniteNumber(
      options.radiusJitter,
      DEFAULT_OPTIONS.radiusJitter,
    ),
  }
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function finiteNumber(value: number | undefined, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback
}

function positiveFiniteNumber(value: number | undefined, fallback: number): number {
  return isFiniteNumber(value) && value > 0 ? value : fallback
}

function nonNegativeFiniteNumber(value: number | undefined, fallback: number): number {
  return isFiniteNumber(value) && value >= 0 ? value : fallback
}

function unitIntervalExclusiveZero(value: number | undefined, fallback: number): number {
  if (!isFiniteNumber(value)) return fallback
  if (value <= 0) return fallback
  return Math.min(value, 1)
}

function nodeSize(
  index: number,
  options: ResolvedTimelineCircleLayoutOptions,
): number {
  const size = options.maxNodeSize * Math.pow(options.sizeFalloff, Math.sqrt(index))
  return roundLayoutValue(Math.max(options.minNodeSize, size))
}

function seededUnitPair(id: string): { angle: number; radius: number } {
  const first = hashString(`${id}:angle`)
  const second = hashString(`${id}:radius`)

  return {
    angle: first / 0x100000000,
    radius: second / 0x100000000,
  }
}

function hashString(value: string): number {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function roundLayoutValue(value: number): number {
  return Math.round(value * 1000) / 1000
}
