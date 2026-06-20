/// <reference types="@sveltejs/kit" />

declare namespace App {
	interface Locals {
		safeGetSession: () => Promise<{
			session: null;
			user: null;
		}>;
	}
	interface PageData {
		session: null;
		user: null;
	}
}
