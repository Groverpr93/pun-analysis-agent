import type {
	ChatModelAdapter,
	ChatModelRunOptions,
	ThreadMessage,
} from "@assistant-ui/react";
import {
	type ChatFixture,
	llmFallbackFixture,
	notAPunFixture,
	phase1TextFixture,
	phase2ToolCallFixture,
	undeterminedFixture,
} from "./fixtures";
import { getMessageText } from "./message-text";

const STEP_DELAY_MS = 15;
/** How long the "slow" scenario's tool call runs: long enough to press stop. */
export const SLOW_TOOL_CALL_MS = 30_000;

/**
 * What the stub replays, picked by the first trigger phrase the last user
 * message contains as whole words (case-insensitively, so "spun" isn't
 * "pun"), so every state the UI renders is reachable by hand. Order
 * matters: "not a pun" must win over "pun".
 */
type StubScenario = {
	trigger: string;
	fixture: ChatFixture;
	/** Waits SLOW_TOOL_CALL_MS before this step instead of STEP_DELAY_MS. */
	slowStep?: number;
	/** Stops after this many steps, then fails the run. */
	failAfterSteps?: number;
};

const SCENARIOS: readonly StubScenario[] = [
	{ trigger: "error", fixture: [], failAfterSteps: 0 },
	// The call starts, then the reply fails before its result arrives.
	{ trigger: "fail", fixture: phase2ToolCallFixture, failAfterSteps: 2 },
	{ trigger: "slow", fixture: phase2ToolCallFixture, slowStep: 2 },
	{ trigger: "fallback", fixture: llmFallbackFixture },
	{ trigger: "undetermined", fixture: undeterminedFixture },
	{ trigger: "not a pun", fixture: notAPunFixture },
	{ trigger: "pun", fixture: phase2ToolCallFixture },
];

const DEFAULT_SCENARIO: StubScenario = {
	trigger: "",
	fixture: phase1TextFixture,
};

const lastUserText = (messages: readonly ThreadMessage[]): string => {
	const lastUser = messages.findLast((m) => m.role === "user");
	return lastUser ? getMessageText(lastUser) : "";
};

const delay = (ms: number, abortSignal: AbortSignal): Promise<void> =>
	new Promise((resolve, reject) => {
		if (abortSignal.aborted) {
			reject(abortSignal.reason);
			return;
		}
		const timer = setTimeout(resolve, ms);
		abortSignal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(abortSignal.reason);
			},
			{ once: true },
		);
	});

/**
 * Implements the same `run()` interface as the real (Genkit-backed)
 * ChatModelAdapter, replaying canned fixtures instead of calling
 * `/api/chat`. Picks a scenario from the last user message's text (see
 * SCENARIOS), so both the Phase 1 (text-only) and Phase 2 (text + tool-call)
 * shapes, and each way a tool call can end, are reachable through the real
 * UI; anything without a trigger gets the plain-text fixture.
 */
export const createStubChatModelAdapter = (): ChatModelAdapter => ({
	async *run({ messages, abortSignal }: ChatModelRunOptions) {
		const text = lastUserText(messages).toLowerCase();
		const scenario =
			SCENARIOS.find(({ trigger }) =>
				new RegExp(`\\b${trigger}\\b`).test(text),
			) ?? DEFAULT_SCENARIO;
		const { fixture, slowStep, failAfterSteps } = scenario;

		for (const [step, content] of fixture.slice(0, failAfterSteps).entries()) {
			await delay(
				step === slowStep ? SLOW_TOOL_CALL_MS : STEP_DELAY_MS,
				abortSignal,
			);
			yield { content };
		}

		if (failAfterSteps !== undefined) {
			await delay(STEP_DELAY_MS, abortSignal);
			throw new Error(
				`Stub adapter: simulated failure (message contained '${scenario.trigger}').`,
			);
		}
	},
});
