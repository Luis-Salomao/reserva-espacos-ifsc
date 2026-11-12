import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { finish } from "./finish.ts";
import { passthrough } from "./input.ts";
import {
  acceptRequestAction,
  declineRequestAction,
  markNoticesReadAction,
  myNoticesAction,
  requestRoomAction,
  withdrawRequestAction,
} from "./notification-actions.ts";
import { getNoticeDeps } from "./notification-deps.ts";

export const myNoticesFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => finish(await myNoticesAction(getNoticeDeps(), getRequest(), data)));

export const markNoticesReadFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await markNoticesReadAction(getNoticeDeps(), getRequest(), data)),
  );

export const requestRoomFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await requestRoomAction(getNoticeDeps(), getRequest(), data)),
  );

export const acceptRequestFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await acceptRequestAction(getNoticeDeps(), getRequest(), data)),
  );

export const declineRequestFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await declineRequestAction(getNoticeDeps(), getRequest(), data)),
  );

export const withdrawRequestFn = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) =>
    finish(await withdrawRequestAction(getNoticeDeps(), getRequest(), data)),
  );
