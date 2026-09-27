import {
	AssistantRuntimeProvider,
	type ChatModelAdapter,
	type RemoteThreadListAdapter,
	useLocalRuntime,
	useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import { AppHeader } from "@/components/app-header";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { ThreadListSidebar } from "@/components/assistant-ui/elements/threadlist-sidebar.aui";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getChatModelAdapter } from "@/lib/chat/get-chat-model-adapter";
import { createBrowserThreadListAdapter } from "@/lib/thread-list/local-storage-thread-list-adapter";

const defaultChatModelAdapter = getChatModelAdapter();
const defaultThreadListAdapter = createBrowserThreadListAdapter();

export type AppProps = {
	/** Overridable for tests; defaults to the build's real ChatModelAdapter (stub or live). */
	chatModelAdapter?: ChatModelAdapter;
	/** Overridable for tests; defaults to the real localStorage-backed adapter. */
	threadListAdapter?: RemoteThreadListAdapter;
};

function App({
	chatModelAdapter = defaultChatModelAdapter,
	threadListAdapter = defaultThreadListAdapter,
}: AppProps) {
	// No `threadId`/`initialThreadId` passed: every load starts on a fresh,
	// uncontrolled thread. Prior threads stay reachable from the sidebar but
	// are never auto-resumed.
	const runtime = useRemoteThreadListRuntime({
		adapter: threadListAdapter,
		// biome-ignore lint/correctness/useHookAtTopLevel: `runtimeHook` is assistant-ui's documented seam — useRemoteThreadListRuntime invokes it as a hook internally, at a stable position, once per mounted thread.
		runtimeHook: () => useLocalRuntime(chatModelAdapter),
	});

	return (
		<AssistantRuntimeProvider runtime={runtime}>
			<TooltipProvider>
				{/*
				 * The thread must be height-bounded: assistant-ui sizes the last
				 * turn's scroll reserve from the viewport's height, so a viewport
				 * that grows with its content feeds that reserve back into itself
				 * without limit (TASK-33). `h-dvh` sizes the shell to the screen, and
				 * the `flex-1` wrapper hands Thread the space left under the header —
				 * the layout of assistant-ui's own template. `overflow-hidden` is
				 * load-bearing: like `min-h-0`, it lets this flex child shrink below
				 * its content height instead of growing with the messages.
				 */}
				<SidebarProvider className="h-dvh">
					<ThreadListSidebar />
					<SidebarInset>
						<AppHeader />
						<div className="flex-1 overflow-hidden">
							<Thread />
						</div>
					</SidebarInset>
				</SidebarProvider>
			</TooltipProvider>
		</AssistantRuntimeProvider>
	);
}

export default App;
