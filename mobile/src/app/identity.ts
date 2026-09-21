import { Platform } from "react-native";
import { api, ProviderConfig } from "./api";
export async function signInProvider(
  provider: "google" | "apple",
  config: ProviderConfig,
) {
  if (!config[provider])
    throw new Error(
      `${provider === "google" ? "Google" : "Apple"} sign-in is awaiting provider setup. Guest play is available now.`,
    );
  if (provider === "google") {
    const { GoogleSignin, isSuccessResponse } =
      await import("@react-native-google-signin/google-signin");
    GoogleSignin.configure({
      webClientId: config.googleWebClientId,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      offlineAccess: false,
    });
    if (Platform.OS === "android") await GoogleSignin.hasPlayServices();
    const result = await GoogleSignin.signIn();
    if (!isSuccessResponse(result)) throw new Error("Sign-in cancelled.");
    if (!result.data.idToken)
      throw new Error("Google did not return an identity token.");
    return api("/auth/provider", "POST", {
      provider,
      idToken: result.data.idToken,
      adultConfirmed: true,
    });
  }
  if (Platform.OS !== "ios")
    throw new Error("Sign in with Apple is available in the iPhone app.");
  const Apple = await import("expo-apple-authentication");
  if (!(await Apple.isAvailableAsync()))
    throw new Error("Apple sign-in is unavailable on this device.");
  const { nonce } = await api("/auth/challenge", "POST");
  const result = await Apple.signInAsync({
    requestedScopes: [
      Apple.AppleAuthenticationScope.FULL_NAME,
      Apple.AppleAuthenticationScope.EMAIL,
    ],
    nonce,
  });
  if (!result.identityToken)
    throw new Error("Apple did not return an identity token.");
  return api("/auth/provider", "POST", {
    provider,
    idToken: result.identityToken,
    authorizationCode: result.authorizationCode,
    nonce,
    adultConfirmed: true,
  });
}
