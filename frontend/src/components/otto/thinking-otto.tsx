import { OttoSprite } from "@/components/otto/otto-sprite";
import { useRotatingPhrase } from "@/hooks/use-rotating-phrase";

/** What Otto mutters while a reply is pending. Add a phrase on its own line. */
export const OTTO_THINKING_PHRASES = [
	"pun-ishing...",
	"bibbidi-bobbidi-booping...",
	"42...",
	"turning water into tokens...",
	"optimizing the paperclip factory...",
	"phoning home...",
	"rick-rolling...",
	"otter-thinking it...",
	"cracking the shell...",
	"sniffing out the pun...",
	"floating on it...",
	"double-checking the double meaning...",
] as const;

export const PHRASE_ROTATION_MS = 2000;

/**
 * Otto thinking, shown in place of assistant-ui's "indicator" part until the
 * first token streams in. Only the stable "Otto is thinking" label is in the
 * status live region; the sprite and rotating phrase sit beside it, hidden
 * from assistive tech, so a phrase change never re-triggers an announcement.
 */
export function ThinkingOtto() {
	const phrase = useRotatingPhrase(OTTO_THINKING_PHRASES, PHRASE_ROTATION_MS);

	return (
		<div
			data-slot="aui_assistant-message-indicator"
			className="text-muted-foreground flex items-center gap-1.5 py-1"
		>
			<OttoSprite />
			<span aria-hidden="true" className="text-sm">
				{phrase}
			</span>
			<span role="status" className="sr-only">
				Otto is thinking
			</span>
		</div>
	);
}
