import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { createStubChatModelAdapter } from "./lib/chat/stub-chat-model-adapter";
import { createFakeAsyncStorage } from "./lib/thread-list/fake-async-storage";
import { createBrowserThreadListAdapter } from "./lib/thread-list/local-storage-thread-list-adapter";

const renderApp = () => {
	const storage = createFakeAsyncStorage();
	return render(
		<App
			chatModelAdapter={createStubChatModelAdapter()}
			threadListAdapter={createBrowserThreadListAdapter(storage)}
		/>,
	);
};

const sendMessage = async (text: string) => {
	const composer = await screen.findByPlaceholderText(
		"Type a phrase and I'll sniff out the pun...",
	);
	fireEvent.change(composer, { target: { value: text } });
	fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });
};

describe("App", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it("renders the greeting state with a prominent composer, and a header with just logo + name", async () => {
		renderApp();

		expect(await screen.findByText("Got a pun for me?")).toBeInTheDocument();
		expect(
			screen.getByPlaceholderText(
				"Type a phrase and I'll sniff out the pun...",
			),
		).toBeInTheDocument();

		const header = screen.getByTestId("app-header");
		expect(within(header).getByText("Pun Agent")).toBeInTheDocument();
		// Only the sidebar trigger — no extra toolbar buttons.
		expect(within(header).getAllByRole("button")).toHaveLength(1);
	});

	it("transitions off the greeting state and streams the Phase 1 text reply", async () => {
		renderApp();
		await screen.findByText("Got a pun for me?");

		await sendMessage("hello there");

		expect(await screen.findByText("hello there")).toBeInTheDocument();
		expect(screen.queryByText("Got a pun for me?")).not.toBeInTheDocument();

		expect(
			await screen.findByText(/stubbed backend/i, {}, { timeout: 3000 }),
		).toBeInTheDocument();
	});

	it("shows a loading indicator while the stub streams, and clears it once done", async () => {
		renderApp();
		await screen.findByText("Got a pun for me?");

		await sendMessage("hello there");

		expect(
			await screen.findByRole("button", { name: "Stop generating" }),
		).toBeInTheDocument();

		await screen.findByText(/stubbed backend/i, {}, { timeout: 3000 });
		expect(
			await screen.findByRole("button", { name: "Send message" }),
		).toBeInTheDocument();
	});

	describe("analyze_pun tool calls", () => {
		const findCard = (verdict: string | RegExp) =>
			screen.findByRole("button", { name: verdict }, { timeout: 3000 });

		it("renders the call as a collapsed card, between the reply's text parts", async () => {
			renderApp();
			await screen.findByText("Got a pun for me?");

			await sendMessage("got a good pun for me?");

			const preamble = await screen.findByText(/let me take a look/i);
			const card = await findCard("Pun (homographic), Pun probability 94%");
			const followUp = await screen.findByText(
				/found one/i,
				{},
				{ timeout: 3000 },
			);
			expect(preamble.compareDocumentPosition(card)).toBe(
				Node.DOCUMENT_POSITION_FOLLOWING,
			);
			expect(card.compareDocumentPosition(followUp)).toBe(
				Node.DOCUMENT_POSITION_FOLLOWING,
			);
			// Collapsed: the explanation and the raw response wait for a click.
			expect(card).toHaveAttribute("aria-expanded", "false");
			expect(screen.queryByText(/"sense_source": "wordnet"/)).toBeNull();
		});

		it("shows the explanation and Inference's raw response once opened", async () => {
			renderApp();
			await screen.findByText("Got a pun for me?");
			await sendMessage("got a good pun for me?");

			fireEvent.click(await findCard("Pun (homographic), Pun probability 94%"));

			expect(
				await screen.findByText(/its slang sense \(money\)/, { selector: "p" }),
			).toBeInTheDocument();
			// Check the block's text: once highlighted, the JSON is split across
			// token spans (lazy-shiki-highlighter.test.tsx checks the colors).
			const response = await screen.findByText("Inference response");
			expect(response.parentElement).toHaveTextContent(
				'"sense_source": "wordnet"',
			);
		});

		it("says Gemini supplied the senses for an llm_fallback result", async () => {
			renderApp();
			await screen.findByText("Got a pun for me?");

			await sendMessage("show me the fallback");

			expect(
				await findCard(
					"Pun (homophonic), Pun probability 81%, Senses supplied by Gemini, at lower confidence",
				),
			).toBeInTheDocument();
		});

		it("says Inference couldn't analyze an undetermined result, with no confidence", async () => {
			renderApp();
			await screen.findByText("Got a pun for me?");

			await sendMessage("an undetermined one");

			// The exact name rules out a confidence alongside it.
			expect(
				await findCard("Inference couldn't analyze this"),
			).toBeInTheDocument();
		});

		it("stays running while the call is slow, and shows it cancelled when the user stops", async () => {
			renderApp();
			await screen.findByText("Got a pun for me?");
			await sendMessage("a slow pun");

			await findCard("Checking for a pun…");
			fireEvent.click(screen.getByRole("button", { name: "Stop generating" }));

			expect(await findCard("Pun check cancelled")).toBeInTheDocument();
		});

		it("shows the call couldn't finish when the reply fails before its result, keeping the error box", async () => {
			renderApp();
			await screen.findByText("Got a pun for me?");

			await sendMessage("make the pun fail");

			expect(await findCard("Pun check couldn't finish")).toBeInTheDocument();
			expect(await screen.findByText(/simulated failure/i)).toBeInTheDocument();
		});
	});

	it("renders an error state for a failed run", async () => {
		renderApp();
		await screen.findByText("Got a pun for me?");

		await sendMessage("please error out");

		expect(
			await screen.findByText(/simulated failure/i, {}, { timeout: 3000 }),
		).toBeInTheDocument();
	});

	it("only adds a thread to the sidebar once the first message is sent", async () => {
		renderApp();
		await screen.findByText("Got a pun for me?");

		expect(
			document.querySelectorAll('[data-slot="aui_thread-list-item"]'),
		).toHaveLength(0);

		await sendMessage("hello there");
		await screen.findByText(/stubbed backend/i, {}, { timeout: 3000 });

		const sidebarThreads = document.querySelectorAll(
			'[data-slot="aui_thread-list-item"]',
		);
		expect(sidebarThreads).toHaveLength(1);
	});

	it("never auto-resumes a prior thread on a fresh load", async () => {
		const storage = createFakeAsyncStorage();
		const priorThreads = createBrowserThreadListAdapter(storage);
		await priorThreads.initialize("prior-thread");
		await priorThreads.rename("prior-thread", "Yesterday's pun talk");

		render(
			<App
				chatModelAdapter={createStubChatModelAdapter()}
				threadListAdapter={createBrowserThreadListAdapter(storage)}
			/>,
		);

		// The prior thread is listed...
		expect(await screen.findByText("Yesterday's pun talk")).toBeInTheDocument();
		// ...but the active view is still a fresh, empty thread.
		expect(screen.getByText("Got a pun for me?")).toBeInTheDocument();
	});
});
