// Delivered by Originkit · stack: vite · styling: tailwind
// Set these props to match the Originkit preview:
//   overrides={{}}
//   __curationVersion={1}
import { useEffect, useRef } from "react"
// ─── Vector utils (exact port of module i/73384) ─────────────────────────────
type Vec = { x: number; y: number }
const vec = (x: number, y: number): Vec => ({ x, y })
const vecAdd = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
const vecSub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
const vecMult = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s })
const vecLerp = (a: Vec, b: Vec, t: number): Vec => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
})
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, mn: number, mx: number) =>
    Math.max(mn, Math.min(mx, v))
const map = (v: number, a: number, b: number, c: number, d: number) =>
    ((v - a) / (b - a)) * (d - c) + c

// Parse a CSS color (rgb/rgba/hex) to {r,g,b} for building the vignette gradient.
function toRGB(str: string): { r: number; g: number; b: number } {
    if (str) {
        const m = str.match(/rgba?\(([^)]+)\)/)
        if (m) {
            const p = m[1].split(",").map((s) => parseFloat(s))
            return { r: p[0] || 0, g: p[1] || 0, b: p[2] || 0 }
        }
        const hex = str.replace("#", "")
        if (hex.length >= 6)
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16),
            }
        if (hex.length === 3)
            return {
                r: parseInt(hex[0] + hex[0], 16),
                g: parseInt(hex[1] + hex[1], 16),
                b: parseInt(hex[2] + hex[2], 16),
            }
    }
    return { r: 10, g: 10, b: 10 }
}

// ─── useCanvasAnimation (exact port of module l/63014) ────────────────────────
interface CanvasState {
    width: number
    height: number
    dpr: number
    isVisible: boolean
    isPageVisible: boolean
    animationId: number
}

function useCanvasAnimation({
    deferStart = false,
    onSetup,
    onDraw,
}: {
    deferStart?: boolean
    onSetup?: (ctx: CanvasRenderingContext2D, state: CanvasState) => void
    onDraw: (ctx: CanvasRenderingContext2D, state: CanvasState) => void
}) {
    const containerRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const stateRef = useRef<CanvasState>({
        width: 0,
        height: 0,
        dpr: 1,
        isVisible: true,
        isPageVisible: true,
        animationId: 0,
    })

    // Store callbacks in refs so they never cause re-setup
    const onDrawRef = useRef(onDraw)
    onDrawRef.current = onDraw
    const onSetupRef = useRef(onSetup)
    onSetupRef.current = onSetup

    useEffect(() => {
        const container = containerRef.current
        const canvas = canvasRef.current
        if (!container || !canvas) return

        const ctx = canvas.getContext("2d", { alpha: false })
        if (!ctx) return

        const st = stateRef.current

        const setup = () => {
            const dpr = window.devicePixelRatio || 1
            const rect = container.getBoundingClientRect()
            st.width = rect.width
            st.height = rect.height
            st.dpr = dpr
            canvas.width = rect.width * dpr
            canvas.height = rect.height * dpr
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }

        const loop = () => {
            onDrawRef.current(ctx, st)
            st.animationId = requestAnimationFrame(loop)
        }

        const start = () => {
            if (!st.animationId && st.isVisible && st.isPageVisible) {
                st.animationId = requestAnimationFrame(loop)
            }
        }

        const stop = () => {
            if (st.animationId) {
                cancelAnimationFrame(st.animationId)
                st.animationId = 0
            }
        }

        setup()
        onSetupRef.current?.(ctx, st)

        // deferStart: don't begin rAF until first mousemove (exact source behaviour)
        if (!deferStart) start()

        let debTimer: ReturnType<typeof setTimeout>
        const onResize = () => {
            clearTimeout(debTimer)
            debTimer = setTimeout(() => {
                stop()
                setup()
                start()
            }, 100)
        }

        const onPageVis = () => {
            st.isPageVisible = document.visibilityState === "visible"
            st.isPageVisible ? start() : stop()
        }

        const io = new IntersectionObserver(
            (entries) => {
                st.isVisible = entries[0]?.isIntersecting ?? true
                st.isVisible && st.isPageVisible ? start() : stop()
            },
            { threshold: 0 }
        )

        io.observe(container)
        window.addEventListener("resize", onResize, { passive: true })
        document.addEventListener("visibilitychange", onPageVis)

        // Expose start so the mousemove handler can trigger first draw
        ;(canvas as any).__canvasStart = start

        return () => {
            stop()
            clearTimeout(debTimer)
            io.disconnect()
            window.removeEventListener("resize", onResize)
            document.removeEventListener("visibilitychange", onPageVis)
        }
    }, [deferStart])

    return { containerRef, canvasRef, stateRef }
}

// ─── Component (exact port of module 40237) ──────────────────────────────────

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 600
 * @framerIntrinsicHeight 600
 * @framerDisableUnlink
 */
export default function InteractiveLines(props: any) {
    const {
        style,
        backgroundColor = "rgb(10, 10, 10)",
        lineColor = "rgba(255, 255, 255, 1)",
        lineWidth = 1,
        minLines = 2,
        maxLines = 45,
        fade = false,
        fadeIntensity = 15,
        deferStart = false,
    } = props
    // Exact source: mouse state object created once, stored in ref
    const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 })
    // Exact source: cfg state created once, stored in ref
    const cfgRef = useRef({ linesNum: 40, bias: 0.5 })

    const { containerRef, canvasRef, stateRef } = useCanvasAnimation({
        deferStart, // default false: draw immediately + render on touch devices (which never fire mousemove)

        onSetup: (e, t) => {
            // Exact source lines 1285-1288
            mouseRef.current.targetX = t.width / 2
            mouseRef.current.targetY = t.height / 2
            mouseRef.current.x = t.width / 2
            mouseRef.current.y = t.height / 2
        },

        onDraw: (e, t) => {
            // Exact source lines 1292-1367 - zero changes
            let { width: r, height: n } = t
            let a = mouseRef.current
            let o = cfgRef.current

            // Smooth mouse follow (default source speeds)
            a.x = a.x + (a.targetX - a.x) * 0.05
            a.y = a.y + (a.targetY - a.y) * 0.1

            // clearCanvas equivalent
            e.fillStyle = backgroundColor
            e.fillRect(0, 0, r, n)

            e.save()
            e.translate(r / 2, n / 2)

            let s = r < 500 // isMobile
            let u = s ? 0.8 * n : 0 // yOffset
            let d = s ? 1.5 : 0.7 // curvePow

            // Three off-screen anchors
            let c = vec(r, -(1.1 * n) + u) // top-right
            let f = vec(0, 2 * n) // bottom-center
            let g = vec(-r, -n + u) // top-left

            // Line count - driven by mouse Y within the Min/Max range.
            let lo = Math.min(minLines, maxLines)
            let hi = Math.max(minLines, maxLines)
            let h = clamp(map(a.y, 0, n, lo, hi), lo, hi)
            o.linesNum = lerp(o.linesNum, h, 0.1)

            // Bias - driven by mouse X
            let b = clamp(map(a.x, 0, r, 0.6, 0.4), 0.4, 0.6)
            o.bias = lerp(o.bias, b, 0.05)

            e.strokeStyle = lineColor
            e.lineWidth = lineWidth

            // Draw each line - exact source loop
            for (let t = 0; t < o.linesNum; t++) {
                let r = t / (o.linesNum - 1)

                // endPt: quadratic distribution from f toward g
                let lineEnd = vec(
                    lerp(f.x, g.x, 1 - r * r),
                    lerp(f.y, g.y, 1 - r * r)
                )

                // l = midpoint of c and lineEnd
                let l = vecAdd(vecMult(c, 0.5), vecMult(lineEnd, 0.5))

                // displacement target = midpoint of f and l
                let dispTarget = vecMult(vecAdd(f, l), 0.5)

                // Exact source IIFE - drawCurvedLine(e, c, lineEnd, dispTarget, bias, curvePow)
                ;(function (e, t, r, n, l, a) {
                    let o = vecLerp(t, r, 0.5) // midpoint of start→end
                    let s = vecSub(n, o) // displacement vector

                    e.beginPath()
                    for (let n = 0; n <= 50; n++) {
                        let o = n / 50
                        let u = vecLerp(t, r, o)
                        // Beta distribution displacement
                        let d =
                            2 *
                            Math.pow(o, a * (1 - l) * 2) *
                            Math.pow(1 - o, a * l * 2)
                        let cv = vecAdd(u, vecMult(s, d))
                        n === 0 ? e.moveTo(cv.x, cv.y) : e.lineTo(cv.x, cv.y)
                    }
                    e.stroke()
                })(e, c, lineEnd, dispTarget, o.bias, d)
            }

            e.restore()

            // Fade - a light corner fade toward the background color. Intensity
            // sets how far in it reaches AND how strong it gets. At 1 it's a
            // subtle touch on the corners; it never goes fully opaque (stays
            // light). The radial gradient makes the corners fade first.
            if (fade) {
                const bg = toRGB(backgroundColor)
                const rgba = (alpha: number) =>
                    `rgba(${bg.r}, ${bg.g}, ${bg.b}, ${alpha})`
                // reach: 1 → subtle edge; 50 → well toward the center.
                const inner = clamp(
                    map(fadeIntensity, 1, 50, 0.82, 0.25),
                    0.25,
                    0.82
                )
                // darkness: 1 → light; 50 → moderate (never full black).
                const maxA = clamp(
                    map(fadeIntensity, 1, 50, 0.35, 0.9),
                    0.35,
                    0.9
                )
                e.save()
                let y = r / 2
                let v = n / 2
                let x = Math.max(r, n) / 2
                e.translate(y, v)
                e.scale(r / (2 * x), n / (2 * x))
                let _ = e.createRadialGradient(0, 0, 0, 0, 0, x)
                // Eased, multi-stop falloff so the fade ramps in gently.
                _.addColorStop(0, rgba(0))
                _.addColorStop(inner, rgba(0))
                _.addColorStop(lerp(inner, 1, 0.5), rgba(maxA * 0.3))
                _.addColorStop(lerp(inner, 1, 0.8), rgba(maxA * 0.7))
                _.addColorStop(1, rgba(maxA))
                e.fillStyle = _
                e.fillRect(-x, -x, 2 * x, 2 * x)
                e.restore()
            }
        },
    })

    // Exact source: mousemove + scroll handlers (lines 1373-1401)
    useEffect(() => {
        let e = containerRef.current
        if (!e) return

        let t = e.getBoundingClientRect()

        // Mouse handler - updates targetX/Y, also starts rAF on first move
        let started = false
        let r = (ev: MouseEvent) => {
            if (!stateRef.current.isVisible) return
            mouseRef.current.targetX = ev.clientX - t.left
            mouseRef.current.targetY = ev.clientY - t.top
            // deferStart: kick off animation on first mousemove
            if (!started) {
                started = true
                ;(canvasRef.current as any)?.__canvasStart?.()
            }
        }

        // Scroll handler - refreshes bounding rect
        let n = 0
        let i = () => {
            n ||
                (n = requestAnimationFrame(() => {
                    t = e!.getBoundingClientRect()
                    n = 0
                }))
        }

        document.addEventListener("mousemove", r, { passive: true })
        window.addEventListener("scroll", i, { passive: true })

        return () => {
            document.removeEventListener("mousemove", r)
            window.removeEventListener("scroll", i)
            n && cancelAnimationFrame(n)
        }
    }, [containerRef, stateRef, canvasRef])

    // Exact source JSX: div.absolute.inset-0 > canvas.size-full
    return (
        <div
            ref={containerRef}
            style={{
                ...style,
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
            }}
        >
            <canvas
                ref={canvasRef}
                style={{ width: "100%", height: "100%", display: "block" }}
            />
        </div>
    )
}

InteractiveLines.displayName = "Interactive Lines"