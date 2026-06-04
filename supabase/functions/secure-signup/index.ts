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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password, display_name, redirect_to } = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email and password are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        data: { display_name: display_name || undefined },
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

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
