import handler from "@tanstack/react-start/server-entry";
import { drainEmailOutbox } from "#/server/email-context";

/** A fila também progride sem tráfego HTTP; o dispatcher não envia quando disabled. */
export default {
  fetch(request) {
    return handler.fetch(request);
  },
  async scheduled() {
    await drainEmailOutbox();
  },
} satisfies ExportedHandler<Env>;
