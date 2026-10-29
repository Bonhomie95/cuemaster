import { Platform } from "react-native";
import type { Purchase } from "expo-iap";
import { api, type Player } from "./api";

/**
 * Real-money purchases, through Apple's and Google's own billing.
 *
 * The device never decides what a purchase is worth. It asks the store to charge, hands the
 * store's proof (the StoreKit 2 JWS, or the Play purchase token) to `POST /store/claim`, and
 * finishes the transaction only once the server has credited it or reports it already had.
 * Any other outcome leaves the transaction open, so the store keeps it and `restorePending`
 * claims it on the next launch: a crash between paying and crediting cannot lose a purchase.
 *
 * Web loads nothing native; every call reports the store unavailable.
 */
export type StoreProduct = {
  id: string;
  kind: "rubies" | "coins" | "bundle" | "pass" | "piggy";
  label: string;
  /** `piggy`: pays whatever the piggy bank holds when the purchase is credited. */
  grants: { coins?: number; rubies?: number; passSeason?: true; piggy?: true };
  bonus?: string;
  oneTime?: boolean;
  /** Display fallback only: the player pays `price`, the store's localized price. */
  usd: number;
  /** One-time offers and the pass: already bought (this season, for the pass). */
  owned?: boolean;
  available?: boolean;
  season?: { id: number; startsAt: string; endsAt: string };
  /** The store's localized price; missing when the store does not list the product. */
  price?: string;
};
export type BuyResult = {
  status: "credited" | "cancelled" | "pending" | "failed";
  player?: Player;
  message?: string;
};
/** The piggy bank: what it holds, its cap, the least it can be broken at, and what a match adds. */
export type Piggy = {
  coins: number;
  cap: number;
  minimum: number;
  won: number;
  lost: number;
};
type StoreInfo = {
  platforms: { ios: boolean; android: boolean };
  products: StoreProduct[];
  accountToken: string;
  piggy: Piggy;
};

const os =
  Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : null;
type Iap = typeof import("expo-iap");
let connection: Promise<Iap> | undefined;
/** The store, connected once per launch; null on web or when it cannot connect. */
async function connect(): Promise<Iap | null> {
  if (!os) return null;
  connection ??= import("expo-iap").then(async (iap) => {
    if (!(await iap.initConnection()))
      throw Error("The store did not connect.");
    return iap;
  });
  try {
    return await connection;
  } catch {
    connection = undefined;
    return null;
  }
}

/** The server's catalogue, with the store's own prices where it lists them. */
export async function loadStore(): Promise<{
  available: boolean;
  products: StoreProduct[];
  piggy: Piggy;
}> {
  const info = await api<StoreInfo>("/store");
  const iap = os && info.platforms[os] ? await connect() : null;
  if (!iap)
    return { available: false, products: info.products, piggy: info.piggy };
  const listed = await iap
    .fetchProducts({ skus: info.products.map((p) => p.id), type: "in-app" })
    .catch(() => null);
  const prices = new Map((listed || []).map((p) => [p.id, p.displayPrice]));
  return {
    available: true,
    products: info.products.map((p) => ({ ...p, price: prices.get(p.id) })),
    piggy: info.piggy,
  };
}

/** Claim one store transaction and close it once the server has it. */
async function settle(iap: Iap, purchase: Purchase): Promise<BuyResult> {
  // A pending payment (Ask to Buy, cash at a shop) is never claimed or closed; it is
  // delivered again once the store confirms it.
  if (purchase.purchaseState === "pending")
    return {
      status: "pending",
      message:
        "Your purchase is waiting for approval. It will be added once the store confirms it.",
    };
  try {
    const claimed = await api<{ credited: boolean; player: Player }>(
      "/store/claim",
      "POST",
      {
        platform: os,
        productId: purchase.productId,
        transaction: purchase.purchaseToken,
      },
    );
    // Credited now, or by an earlier claim whose answer was lost: either way it is in the
    // account, so the store may forget it. A failed finish is redelivered and settled again.
    await iap
      .finishTransaction({ purchase, isConsumable: true })
      .catch(() => {});
    return { status: "credited", player: claimed.player };
  } catch (e) {
    return {
      status: "failed",
      message: `${(e as Error).message} The store has kept your purchase, and it is tried again next time CueMaster starts.`,
    };
  }
}

/** Buy one product. Resolves when the purchase is credited, cancelled, pending or failed. */
export async function buy(productId: string): Promise<BuyResult> {
  const iap = await connect();
  if (!iap)
    return {
      status: "failed",
      message: "Purchases are not available on this device.",
    };
  const info = await api<StoreInfo>("/store");
  const product = info.products.find((p) => p.id === productId);
  if (!info.platforms[os!] || !product)
    return { status: "failed", message: "Purchases are not available yet." };
  if (product.available === false)
    return { status: "failed", message: "You already have this." };
  // Anything left open by a crash or a lost connection goes first. On Android an unconsumed
  // purchase would also block buying the same product again.
  await restorePending();
  const outcome = await new Promise<{ purchase?: Purchase; error?: unknown }>(
    (resolve) => {
      let finished = false;
      let listeners: { remove: () => void }[] = [];
      const done = (result: { purchase?: Purchase; error?: unknown }) => {
        if (finished) return;
        finished = true;
        listeners.forEach((l) => l.remove());
        resolve(result);
      };
      listeners = [
        iap.purchaseUpdatedListener((purchase) => {
          if (purchase.productId === productId) done({ purchase });
          // A delivery for something else (an approval arriving now) is settled quietly.
          else void settle(iap, purchase);
        }),
        iap.purchaseErrorListener((error) => {
          if (!error.productId || error.productId === productId)
            done({ error });
        }),
      ];
      iap
        .fetchProducts({ skus: [productId], type: "in-app" })
        .then(() =>
          iap.requestPurchase({
            request: {
              apple: {
                sku: productId,
                appAccountToken: info.accountToken,
                andDangerouslyFinishTransactionAutomatically: false,
              },
              google: {
                skus: [productId],
                obfuscatedAccountId: info.accountToken,
              },
            },
            type: "in-app",
          }),
        )
        .catch((error) => done({ error }));
    },
  );
  if (outcome.purchase) return settle(iap, outcome.purchase);
  const code = (outcome.error as { code?: string } | undefined)?.code;
  if (iap.isUserCancelledError(outcome.error)) return { status: "cancelled" };
  if (code === iap.ErrorCode.DeferredPayment || code === iap.ErrorCode.Pending)
    return {
      status: "pending",
      message:
        "Your purchase is waiting for approval. It will be added once the store confirms it.",
    };
  return {
    status: "failed",
    message: iap.getUserFriendlyErrorMessage(outcome.error as any),
  };
}

/**
 * Claim and close every transaction the store still holds open: one paid for but never
 * credited because the app closed, crashed or lost its connection first. Call at app start once
 * the session is restored. Returns the updated player if anything was credited.
 */
export async function restorePending(): Promise<Player | undefined> {
  const iap = await connect();
  if (!iap) return;
  let open: Purchase[] = [];
  try {
    // iOS lists unfinished transactions; Play lists unconsumed purchases, and every product
    // here is consumable.
    open =
      os === "ios"
        ? await iap.getPendingTransactionsIOS()
        : await iap.getAvailablePurchases();
  } catch {
    return;
  }
  let player: Player | undefined;
  for (const purchase of open)
    player = (await settle(iap, purchase)).player || player;
  return player;
}
