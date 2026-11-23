/// <reference types="@sveltejs/kit" />
/// <reference types="vite-plugin-pwa/svelte" />
/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-pwa/client" />

interface Window {
	/** Set by inline app.html recovery before modules load. */
	__ALPHA_RECOVERING?: boolean;
}

declare module 'virtual:pwa-info' {
	export const pwaInfo: {
		webManifest?: { linkTag?: string; href?: string };
	} | undefined;
}

declare module 'virtual:pwa-register' {
	export type RegisterSWOptions = {
		immediate?: boolean;
		onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
		onRegisterError?: (error: unknown) => void;
	};
	export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}
