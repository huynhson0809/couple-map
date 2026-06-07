// Supabase Edge Function: secure-signup
// Prevents duplicate signups without revealing whether an email exists.
// Deploy: supabase functions deploy secure-signup --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TERMS_VERSION = "2026-06-07";
const PRIVACY_VERSION = "2026-06-07";
const CONSENT_SOURCE_SIGNUP = "signup";

type SignupConsent = {
  terms_version?: string;
  privacy_version?: string;
  source?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidSignupConsent(consent: SignupConsent | null | undefined) {
  if (!consent) return false;
  if (consent.terms_version !== TERMS_VERSION) return false;
  if (consent.privacy_version !== PRIVACY_VERSION) return false;
  if (consent.source !== CONSENT_SOURCE_SIGNUP) return false;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password, display_name, redirect_to, consent } =
      await req.json();

    if (!email || !password) {
      return jsonResponse({ error: "Email and password are required" }, 400);
    }

    if (password.length < 6) {
      return jsonResponse(
        { error: "Password must be at least 6 characters" },
        400,
      );
    }

    if (!isValidSignupConsent(consent)) {
      return jsonResponse({ error: "Missing required consent" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check if a confirmed user with this email already exists
    // Uses service_role RPC (not exposed to anon/authenticated)
    const { data: emailExists } = await supabaseAdmin.rpc(
      "check_email_exists_internal",
      { email_input: email.toLowerCase() },
    );

    if (emailExists) {
      // Email already confirmed - return success silently (prevents enumeration)
      return jsonResponse({ success: true });
    }

    // Use anon client for signUp/resend - this triggers Supabase's email sending
    // redirect_to is validated by Supabase against configured Redirect URLs in Dashboard
    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false } },
    );

    // signUp handles both new users and resending for unconfirmed users
    const { error } = await supabaseAnon.auth.signUp({
      email,
      password,
      options: {
        // Supabase persists options.data into auth.users.raw_user_meta_data.
        data: {
          display_name: display_name || undefined,
          consent: {
            terms_version: TERMS_VERSION,
            privacy_version: PRIVACY_VERSION,
            source: CONSENT_SOURCE_SIGNUP,
          },
        },
        emailRedirectTo: redirect_to || undefined,
      },
    });

    // If signUp doesn't resend (user exists but unconfirmed), explicitly resend
    if (!error) {
      // Check if this was a no-op (existing unconfirmed user)
      // Supabase returns fake user with empty identities in this case
    }
    if (error && error.message?.includes("already registered")) {
      // User exists but unconfirmed - resend confirmation
      await supabaseAnon.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: redirect_to || undefined },
      });
    } else if (error) {
      console.error("Signup error:", error.message);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("Unexpected error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
