import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { UserRole, UserPermissions } from "./types";

export { hasPermission, hasPermissionByRole } from "./permissions";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "ownez-dev-secret"
);
const COOKIE_NAME = "ownez-session";

export interface SessionPayload {
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
  permissions?: UserPermissions;
}

export async function createSession(user: SessionPayload): Promise<string> {
  const token = await new SignJWT({
    userId: user.userId,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    permissions: user.permissions ?? {},
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });

  return token;
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      fullName: payload.fullName as string,
      role: payload.role as UserRole,
      permissions: (payload.permissions as UserPermissions | undefined) ?? {},
    };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
