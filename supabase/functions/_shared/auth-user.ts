import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type AuthContext = {
  token: string;
  user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
};

export async function requireAuthUser(req: Request): Promise<AuthContext> {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("missing_auth_header");
  }

  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error("auth_failed");
  }

  return {
    token,
    user: {
      id: user.id,
      email: user.email ?? undefined,
      user_metadata: user.user_metadata ?? undefined,
    },
  };
}

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
