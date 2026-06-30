import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { handleActivateCodeRequest } from "../_shared/activation-code.ts";

serve((req: Request) => handleActivateCodeRequest(req, "activate-code"));
