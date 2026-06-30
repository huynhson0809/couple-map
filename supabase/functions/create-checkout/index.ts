// Compatibility wrapper for older clients.
// New clients should call activate-code for promo/manual grants and
// create-polar-checkout for Polar purchases.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleActivateCodeRequest } from "../_shared/activation-code.ts";

serve((req: Request) =>
  handleActivateCodeRequest(req, "create-checkout compatibility")
);
