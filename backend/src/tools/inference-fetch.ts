/** Real Inference transport: Cloud Run identity in production, loopback locally. */
export function createInferenceFetch(inferenceUrl: string): typeof fetch {
	const service = new URL(inferenceUrl);
	const cloud = Boolean(process.env.K_SERVICE);
	if (
		service.username ||
		service.password ||
		service.search ||
		service.hash ||
		service.pathname !== "/" ||
		(cloud
			? service.protocol !== "https:"
			: service.protocol !== "http:" ||
				!["localhost", "127.0.0.1", "[::1]"].includes(service.hostname))
	) {
		throw new Error(
			"INFERENCE_URL must be a service origin: HTTPS on Cloud Run, loopback HTTP locally.",
		);
	}
	return async (input, init) => {
		const target = new URL(
			input instanceof Request ? input.url : input.toString(),
		);
		if (target.origin !== service.origin)
			throw new Error("Unexpected Inference origin");
		const headers = new Headers(init?.headers);
		if (cloud) {
			const metadata = new URL(
				"http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity",
			);
			metadata.searchParams.set("audience", service.origin);
			const response = await fetch(metadata, {
				headers: { "Metadata-Flavor": "Google" },
				signal: init?.signal,
			});
			if (!response.ok) {
				await response.body?.cancel();
				throw new Error("Could not obtain Inference identity token");
			}
			headers.set("Authorization", `Bearer ${(await response.text()).trim()}`);
		}
		return fetch(input, { ...init, headers, redirect: "error" });
	};
}
