import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { passthrough } from "./input";
import { requestPasswordRecovery, resetPassword } from "./password-recovery-actions";
import { getPasswordRecovery, getRecoveryClient } from "./password-recovery-context";

function privateResponse() {
  setResponseHeader("Cache-Control", "no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
}

export const getRecoveryAvailabilityFn = createServerFn({ method: "GET" }).handler(async () => {
  privateResponse();
  return { enabled: getPasswordRecovery().enabled };
});

export const requestPasswordRecoveryFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    privateResponse();
    return requestPasswordRecovery(getPasswordRecovery(), data, getRecoveryClient());
  });

export const resetPasswordFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    privateResponse();
    return resetPassword(getPasswordRecovery(), data, getRecoveryClient());
  });
