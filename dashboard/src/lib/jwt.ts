export interface UserSessionPayload {
  username: string;
  role: "SUPER_ADMIN" | "APP_USER" | "READ_ONLY";
  db: string;
  allowedDbs: string[];
  isSuperAdmin: boolean;
  exp?: number;
}

const getSecretKey = async () => {
  const secret =
    process.env.DASHBOARD_JWT_SECRET ||
    process.env.MONGO_ROOT_PASSWORD ||
    "c54236c530bc4f9b686cc17c4534e5db72a18da1cee851a5";
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret) as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
};

function base64UrlEncode(data: Uint8Array): string {
  let base64 = btoa(String.fromCharCode(...Array.from(data)));
  return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function signSessionToken(payload: Omit<UserSessionPayload, "exp">): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours
  const fullPayload: UserSessionPayload = { ...payload, exp };

  const encoder = new TextEncoder();
  const encodedHeader = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)));

  const key = await getSecretKey();
  const signatureInput = encoder.encode(`${encodedHeader}.${encodedPayload}`);
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    signatureInput as unknown as BufferSource
  );
  const encodedSignature = base64UrlEncode(new Uint8Array(signatureBuffer));

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

export async function verifySessionToken(token: string): Promise<UserSessionPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const key = await getSecretKey();
    const encoder = new TextEncoder();

    const signatureInput = encoder.encode(`${encodedHeader}.${encodedPayload}`);
    const signature = base64UrlDecode(encodedSignature);

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature as unknown as BufferSource,
      signatureInput as unknown as BufferSource
    );
    if (!isValid) return null;

    const payloadJson = new TextDecoder().decode(base64UrlDecode(encodedPayload));
    const payload: UserSessionPayload = JSON.parse(payloadJson);

    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
