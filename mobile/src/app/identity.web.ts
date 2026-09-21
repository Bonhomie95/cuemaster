import { api, ProviderConfig } from "./api";
// Web is a development preview. Native builds use the provider SDKs.
export async function signInProvider(
  provider: "google" | "apple",
  config: ProviderConfig,
) {
  if (!config[provider])
    throw new Error(
      `${provider === "google" ? "Google" : "Apple"} sign-in is awaiting provider setup. Guest play is available now.`,
    );
  if (provider === "apple")
    throw new Error("Sign in with Apple is available in the iPhone app.");
  if (!(window as any).google) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Google sign-in could not load."));
      document.head.appendChild(script);
    });
  }
  const idToken = await new Promise<string>((resolve, reject) => {
    const g = (window as any).google.accounts.id;
    const timer = setTimeout(
      () => reject(new Error("Sign-in did not complete. Please try again.")),
      60000,
    );
    g.initialize({
      client_id: config.googleWebClientId,
      callback: (r: any) => {
        clearTimeout(timer);
        resolve(r.credential);
      },
      cancel_on_tap_outside: true,
    });
    g.prompt();
  });
  return api("/auth/provider", "POST", {
    provider,
    idToken,
    adultConfirmed: true,
  });
}
