import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Fixed sprite palette, taken from the favicon and og-image mascot. Each key
 * is the character that paints that colour in the pixel grids below.
 */
const OTTO_PALETTE = {
	o: "#3b2718", // outline (dark brown, so it still reads on the dark theme)
	k: "#1a1815", // glasses, nose, smile, eyes
	d: "#8a6a3d", // inner ears, whisker dots, paw pads
	f: "#c99a5b", // fur
	c: "#ecdcb8", // muzzle
	w: "#ffffff", // lens glare
	l: "#cfd8dc", // lens
	h: "#26221e", // hoodie
	H: "#3a342d", // hoodie collar and sleeve cuff
	y: "#d4af5a", // gold drawstrings
} as const;

type PixelColor = keyof typeof OTTO_PALETTE;

/**
 * Otto's head and hoodie, one string per pixel row, one character per pixel
 * ("." is transparent). "e" marks the eyes: the base layer paints them as
 * lens, and they're drawn again on their own layer so they can blink.
 */
const HEAD = [
	"......oooooooo......",
	"....ooffffffffoo....",
	"..oooffffffffffooo..",
	".oddoffffffffffoddo.",
	".odkkkkkkffkkkkkkdo.",
	".ofkwlllkkkkwlllkfo.",
	"offkleelkffkleelkffo",
	"offkleelkffkleelkffo",
	"offkkkkkkcckkkkkkffo",
	"offccccckkkkcccccffo",
	"offcdcccckkccccdcffo",
	"ofcdcckcccccckcdccfo",
	"ofccccckkkkkkcccccfo",
	".ofccccccccccccccfo.",
	"..ooffccccccccffoo..",
	"....oooooooooooo....",
	"..ooHHHHHHHHHHHHoo..",
	".ohhhhhhyhhyhhhhhho.",
	"ohhhhhhhyhhyhhhhhhho",
	"ohhhhhhhhhhhhhhhhhho",
] as const;

/**
 * His arm, bent up from the lower right so the paw rests under his chin.
 * It stays put; only FINGERS move, which is what makes it read as a chin
 * scratch rather than a fist pump.
 */
const ARM = [
	...Array<string>(14).fill("...................."),
	"...........offffo...",
	"...........offffo...",
	"............oHHHHo..",
	"............ohhhho..",
	".............ohhhho.",
	"..............ohhhho",
] as const;

/** The fingertips against his chin, on their own layer so they can rub. */
const FINGERS = [
	...Array<string>(12).fill("...................."),
	"............oooo....",
	"...........odfdfo...",
] as const;

/** Thought bubbles rising up and to the right of his head, smallest first. */
const THOUGHT_DOTS = ["M20 5h1v1h-1z", "M22 2h2v2h-2z", "M25 0h3v3h-3z"];

// One sprite pixel = one viewBox unit. The extra row at the bottom leaves room
// for the 1px idle bob; the extra columns on the right hold the thought dots.
const VIEW_WIDTH = 28;
const VIEW_HEIGHT = 21;
// Keep this an integer: fractional scales smear pixels across screen pixels.
const PIXEL_SCALE = 2;

const GRID_WIDTH = 20;

const square = (x: number, y: number) => `M${x} ${y}h1v1h-1z`;

const isPixelColor = (pixel: string): pixel is PixelColor =>
	Object.hasOwn(OTTO_PALETTE, pixel);

/**
 * Merges every pixel of one colour into a single path, so the sprite is about
 * a dozen DOM nodes instead of one <rect> per pixel. Runs once at import and
 * throws on a ragged row or a character missing from OTTO_PALETTE, so a typo
 * in a grid fails the tests instead of rendering a hole.
 */
function toColorLayers(rows: readonly string[]): [PixelColor, string][] {
	const pathsByColor = new Map<PixelColor, string>();
	rows.forEach((row, y) => {
		if (row.length !== GRID_WIDTH) {
			throw new Error(
				`Otto sprite row ${y} is ${row.length} pixels wide, expected ${GRID_WIDTH}.`,
			);
		}
		[...row].forEach((pixel, x) => {
			if (pixel === ".") return;
			if (!isPixelColor(pixel)) {
				throw new Error(
					`Otto sprite pixel "${pixel}" at (${x}, ${y}) isn't in OTTO_PALETTE.`,
				);
			}
			pathsByColor.set(pixel, (pathsByColor.get(pixel) ?? "") + square(x, y));
		});
	});
	return [...pathsByColor];
}

/** Traces just the pixels marked `char` as one path. */
const tracePixels = (rows: readonly string[], char: string) =>
	rows
		.flatMap((row, y) =>
			[...row].map((pixel, x) => (pixel === char ? square(x, y) : "")),
		)
		.join("");

const HEAD_PATHS = toColorLayers(HEAD.map((row) => row.replaceAll("e", "l")));
const EYES_PATH = tracePixels(HEAD, "e");
const ARM_PATHS = toColorLayers(ARM);
const FINGERS_PATHS = toColorLayers(FINGERS);

/**
 * Otto thinking, as a pixel-art game sprite: he bobs, blinks, scratches his
 * chin, and thought bubbles pop in above him. Every animation uses steps()
 * timing (see index.css) so it cuts between frames instead of tweening, and
 * under prefers-reduced-motion he holds still in the paw-on-chin pose.
 * Decorative: callers provide the accessible status text.
 */
export function OttoSprite({
	className,
	...props
}: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
			width={VIEW_WIDTH * PIXEL_SCALE}
			height={VIEW_HEIGHT * PIXEL_SCALE}
			shapeRendering="crispEdges"
			aria-hidden="true"
			className={cn("shrink-0", className)}
			{...props}
		>
			<g className="animate-otto-bob motion-reduce:animate-none">
				{HEAD_PATHS.map(([color, d]) => (
					<path key={color} fill={OTTO_PALETTE[color]} d={d} />
				))}
				<path
					className="animate-otto-blink motion-reduce:animate-none"
					fill={OTTO_PALETTE.k}
					d={EYES_PATH}
				/>
				{ARM_PATHS.map(([color, d]) => (
					<path key={color} fill={OTTO_PALETTE[color]} d={d} />
				))}
				<g className="animate-otto-scratch motion-reduce:animate-none">
					{FINGERS_PATHS.map(([color, d]) => (
						<path key={color} fill={OTTO_PALETTE[color]} d={d} />
					))}
				</g>
			</g>
			<g fill="currentColor">
				{THOUGHT_DOTS.map((d, i) => (
					<path
						key={d}
						d={d}
						className="animate-otto-thought motion-reduce:animate-none"
						style={{ animationDelay: `${i * 300}ms` }}
					/>
				))}
			</g>
		</svg>
	);
}
